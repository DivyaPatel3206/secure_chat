"""
Secure Real-Time Chat System - Main Application
FastAPI backend with WebSocket support, IDS, and threat analysis
"""

import asyncio
import hashlib
import json
import logging
import os
import secrets
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set

import httpx
import qrcode
import io
import base64
from fastapi import (
    Cookie, Depends, FastAPI, HTTPException, Request, Response, WebSocket,
    WebSocketDisconnect, status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Secure Chat IDS", version="1.0.0")

# ─────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# IN-MEMORY STORES (production: use Redis + PostgreSQL)
# ─────────────────────────────────────────────

# sessions[token] = {user_id, username, fingerprint_hash, created_at, ip, room_id}
sessions: Dict[str, dict] = {}

# users[user_id] = {username, room_id, online, last_seen}
users: Dict[str, dict] = {}

# rooms[room_id] = {name, members: set}
rooms: Dict[str, dict] = {
    "general":       {"name": "#general",       "members": set(), "description": "General chat"},
    "announcements": {"name": "#announcements", "members": set(), "description": "Announcements"},
    "dev-log":       {"name": "#dev-log",       "members": set(), "description": "Dev logs"},
}

# messages[room_id] = list of message dicts
messages: Dict[str, List[dict]] = defaultdict(list)

# qr_tokens[token] = {room_id, expires_at, used, fingerprint}
qr_tokens: Dict[str, dict] = {}

# canary_tokens[token] = {session_token, created_at, ip}
canary_tokens: Dict[str, dict] = {}

# ip_requests[ip] = deque of timestamps
ip_requests: Dict[str, deque] = defaultdict(lambda: deque(maxlen=1000))

# ip_block[ip] = unblock_time
ip_block: Dict[str, float] = {}

# ip_geo[ip] = geo dict
ip_geo: Dict[str, dict] = {}

# threat_scores[session_token] = score
threat_scores: Dict[str, int] = defaultdict(int)

# alert_log = list of alert dicts
alert_log: List[dict] = []

# request_log = list of request dicts
request_log: List[dict] = deque(maxlen=500)

# login_attempts[ip] = {count, last_attempt}
login_attempts: Dict[str, dict] = defaultdict(lambda: {"count": 0, "last": 0})

# typing indicators {room_id: {user_id: timestamp}}
typing_indicators: Dict[str, Dict[str, float]] = defaultdict(dict)

# WebSocket connections {user_id: WebSocket}
active_connections: Dict[str, WebSocket] = {}

# Behavioral tracking {user_id: {msg_times: deque}}
behavior: Dict[str, dict] = defaultdict(lambda: {"msg_times": deque(maxlen=50), "bot_score": 0})

# ─────────────────────────────────────────────
# RATE LIMITER
# ─────────────────────────────────────────────
RATE_LIMIT_WINDOW = 60   # seconds
RATE_LIMIT_MAX    = 100  # requests per window
WS_MSG_LIMIT      = 10   # msgs/sec per websocket
BRUTE_FORCE_MAX   = 5
BRUTE_FORCE_COOLDOWN = 300  # 5 minutes


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def is_ip_blocked(ip: str) -> bool:
    if ip in ip_block:
        if time.time() < ip_block[ip]:
            return True
        else:
            del ip_block[ip]
    return False


def check_rate_limit(ip: str) -> bool:
    """Returns True if request is allowed."""
    now = time.time()
    dq = ip_requests[ip]
    dq.append(now)
    window_start = now - RATE_LIMIT_WINDOW
    recent = sum(1 for t in dq if t > window_start)
    if recent > RATE_LIMIT_MAX:
        add_threat_score_ip(ip, 25, "HIGH_REQUEST_RATE")
        return False
    return True


def add_threat_score_ip(ip: str, score: int, reason: str):
    """Add threat score to all sessions from this IP."""
    for tok, sess in sessions.items():
        if sess.get("ip") == ip:
            threat_scores[tok] += score
            check_threat_level(tok, reason)


def hash_fingerprint(fp: dict) -> str:
    s = json.dumps(fp, sort_keys=True)
    return hashlib.sha256(s.encode()).hexdigest()


def get_threat_label(score: int) -> str:
    if score < 50:
        return "Normal"
    if score < 100:
        return "Suspicious"
    return "Attack"


def add_alert(alert_type: str, detail: str, severity: str = "medium", ip: str = "", session: str = ""):
    alert = {
        "id": str(uuid.uuid4()),
        "type": alert_type,
        "detail": detail,
        "severity": severity,
        "ip": ip,
        "session": session[:8] + "..." if len(session) > 8 else session,
        "timestamp": datetime.utcnow().isoformat(),
    }
    alert_log.insert(0, alert)
    if len(alert_log) > 200:
        alert_log.pop()
    logger.warning(f"ALERT [{severity.upper()}] {alert_type}: {detail}")


def check_threat_level(token: str, reason: str):
    score = threat_scores[token]
    sess = sessions.get(token, {})
    if score >= 100:
        add_alert("ATTACK_DETECTED", f"Token {token[:8]}... score={score} reason={reason}",
                  "high", sess.get("ip", ""), token)
    elif score >= 50:
        add_alert("SUSPICIOUS_ACTIVITY", f"Token {token[:8]}... score={score} reason={reason}",
                  "medium", sess.get("ip", ""), token)


# ─────────────────────────────────────────────
# GEOLOCATION
# ─────────────────────────────────────────────
async def fetch_geo(ip: str) -> dict:
    if ip in ip_geo:
        return ip_geo[ip]
    if ip in ("127.0.0.1", "localhost", "unknown", "testclient"):
        geo = {"country": "Local", "city": "Localhost", "isp": "N/A", "lat": 0, "lon": 0}
        ip_geo[ip] = geo
        return geo
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"http://ip-api.com/json/{ip}?fields=country,city,isp,lat,lon,status")
            data = r.json()
            if data.get("status") == "success":
                geo = {
                    "country": data.get("country", "Unknown"),
                    "city":    data.get("city", "Unknown"),
                    "isp":     data.get("isp", "Unknown"),
                    "lat":     data.get("lat", 0),
                    "lon":     data.get("lon", 0),
                }
                ip_geo[ip] = geo
                return geo
    except Exception:
        pass
    geo = {"country": "Unknown", "city": "Unknown", "isp": "Unknown", "lat": 0, "lon": 0}
    ip_geo[ip] = geo
    return geo


def detect_impossible_travel(user_id: str, new_geo: dict):
    """Detect if user is connecting from a new country rapidly."""
    u = users.get(user_id, {})
    prev_country = u.get("last_country")
    if prev_country and prev_country != new_geo["country"] and new_geo["country"] not in ("Local", "Unknown"):
        token = u.get("session_token", "")
        threat_scores[token] += 30
        add_alert("GEO_ANOMALY",
                  f"User {u.get('username','?')} jumped from {prev_country} to {new_geo['country']}",
                  "high", u.get("ip", ""), token)
    if user_id in users:
        users[user_id]["last_country"] = new_geo.get("country", "Unknown")


# ─────────────────────────────────────────────
# MIDDLEWARE: Request logging & rate limiting
# ─────────────────────────────────────────────
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    ip = get_client_ip(request)
    path = request.url.path

    # Skip static assets
    if path.startswith("/assets") or path == "/favicon.ico":
        return await call_next(request)

    # Check block
    if is_ip_blocked(ip):
        add_alert("BLOCKED_IP_REQUEST", f"Blocked IP {ip} tried to access {path}", "high", ip)
        return JSONResponse({"error": "IP temporarily blocked"}, status_code=429)

    # Rate limit
    if not check_rate_limit(ip):
        ip_block[ip] = time.time() + 60  # block for 1 min
        add_alert("RATE_LIMIT_EXCEEDED", f"IP {ip} exceeded rate limit, blocked 60s", "high", ip)
        return JSONResponse({"error": "Rate limit exceeded"}, status_code=429)

    # Log request
    body_size = int(request.headers.get("content-length", 0))
    log_entry = {
        "ts": datetime.utcnow().isoformat(),
        "ip": ip,
        "method": request.method,
        "path": path,
        "user_agent": request.headers.get("user-agent", ""),
        "size": body_size,
    }
    request_log.appendleft(log_entry)

    # Detect scripted traffic
    ua = request.headers.get("user-agent", "")
    suspicious_agents = ["python-requests", "curl", "wget", "bot", "spider", "scraper"]
    if any(s in ua.lower() for s in suspicious_agents) and path.startswith("/api"):
        add_alert("SCRIPTED_TRAFFIC", f"Suspicious UA from {ip}: {ua[:80]}", "medium", ip)

    response = await call_next(request)

    # Inject canary token in header (passive sniffing detection)
    canary = secrets.token_hex(16)
    canary_tokens[canary] = {"ip": ip, "path": path, "ts": time.time()}
    response.headers["X-Request-ID"] = canary

    return response


# ─────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str
    fingerprint: dict

class LoginRequest(BaseModel):
    username: str
    fingerprint: dict

class MessageRequest(BaseModel):
    content: str
    room_id: str

class SimulateAttackRequest(BaseModel):
    attack_type: str  # mitm | hijack | ddos


# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────
@app.post("/api/auth/register")
async def register(req: RegisterRequest, request: Request):
    ip = get_client_ip(request)

    # Brute force check
    attempt = login_attempts[ip]
    if attempt["count"] >= BRUTE_FORCE_MAX:
        if time.time() - attempt["last"] < BRUTE_FORCE_COOLDOWN:
            remaining = int(BRUTE_FORCE_COOLDOWN - (time.time() - attempt["last"]))
            raise HTTPException(429, f"Too many attempts. Wait {remaining}s.")
        else:
            login_attempts[ip] = {"count": 0, "last": 0}

    username = req.username.strip()
    if not username or len(username) < 2 or len(username) > 24:
        raise HTTPException(400, "Username must be 2-24 characters")

    # Check duplicate
    for u in users.values():
        if u["username"].lower() == username.lower():
            login_attempts[ip]["count"] += 1
            login_attempts[ip]["last"] = time.time()
            raise HTTPException(409, "Username taken")

    user_id = str(uuid.uuid4())
    fp_hash = hash_fingerprint(req.fingerprint)
    token = secrets.token_hex(32)

    geo = await fetch_geo(ip)

    sessions[token] = {
        "user_id":    user_id,
        "username":   username,
        "fp_hash":    fp_hash,
        "created_at": time.time(),
        "ip":         ip,
        "room_id":    "general",
        "geo":        geo,
    }

    users[user_id] = {
        "username":      username,
        "room_id":       "general",
        "online":        True,
        "last_seen":     time.time(),
        "session_token": token,
        "ip":            ip,
        "last_country":  geo.get("country", "Unknown"),
    }

    rooms["general"]["members"].add(user_id)
    login_attempts[ip] = {"count": 0, "last": 0}

    return {"token": token, "user_id": user_id, "username": username, "geo": geo}


@app.post("/api/auth/login")
async def login(req: LoginRequest, request: Request):
    ip = get_client_ip(request)
    fp_hash = hash_fingerprint(req.fingerprint)

    # Find session for username
    for tok, sess in list(sessions.items()):
        if sess["username"].lower() == req.username.lower():
            # Fingerprint mismatch → threat
            if sess["fp_hash"] != fp_hash:
                threat_scores[tok] += 40
                add_alert("FINGERPRINT_CHANGE",
                          f"User {req.username} login with different fingerprint",
                          "high", ip, tok)
                check_threat_level(tok, "FINGERPRINT_CHANGE")

            # Rotate token
            new_token = secrets.token_hex(32)
            sessions[new_token] = {**sess, "ip": ip, "fp_hash": fp_hash, "created_at": time.time()}
            del sessions[tok]

            uid = sess["user_id"]
            users[uid]["online"]        = True
            users[uid]["session_token"] = new_token
            users[uid]["ip"]            = ip

            geo = await fetch_geo(ip)
            sessions[new_token]["geo"] = geo
            detect_impossible_travel(uid, geo)

            return {"token": new_token, "user_id": uid, "username": req.username, "geo": geo}

    raise HTTPException(404, "User not found. Please register.")


@app.post("/api/auth/logout")
async def logout(request: Request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    sess = sessions.pop(token, None)
    if sess:
        uid = sess["user_id"]
        if uid in users:
            users[uid]["online"] = False
            users[uid]["last_seen"] = time.time()
        if uid in active_connections:
            try:
                await active_connections[uid].close()
            except Exception:
                pass
            del active_connections[uid]
    return {"ok": True}


def get_session(request: Request) -> dict:
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    sess = sessions.get(token)
    if not sess:
        raise HTTPException(401, "Invalid or expired session")
    return {**sess, "token": token}


# ─────────────────────────────────────────────
# QR CODE ROUTES
# ─────────────────────────────────────────────
@app.post("/api/qr/generate/{room_id}")
async def generate_qr(room_id: str, request: Request):
    if room_id not in rooms:
        raise HTTPException(404, "Room not found")

    sess = get_session(request)
    qr_token = secrets.token_hex(16)
    qr_tokens[qr_token] = {
        "room_id":    room_id,
        "expires_at": time.time() + 120,  # 2 minutes
        "used":       False,
        "fp_hash":    sess["fp_hash"],
        "creator_ip": sess["ip"],
    }

    # Build QR payload
    base_url = os.getenv("APP_URL", "http://localhost:8000")
    join_url = f"{base_url}/join?token={qr_token}&room={room_id}"

    img = qrcode.make(join_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()

    return {"qr_image": f"data:image/png;base64,{b64}", "token": qr_token, "expires_in": 120}


@app.post("/api/qr/join")
async def join_via_qr(request: Request):
    body = await request.json()
    qr_token = body.get("token")
    fp = body.get("fingerprint", {})

    entry = qr_tokens.get(qr_token)
    if not entry:
        raise HTTPException(400, "Invalid QR token")
    if entry["used"]:
        raise HTTPException(400, "QR token already used")
    if time.time() > entry["expires_at"]:
        raise HTTPException(400, "QR token expired")

    fp_hash = hash_fingerprint(fp)

    # Mark used
    qr_tokens[qr_token]["used"] = True

    room_id = entry["room_id"]
    return {"room_id": room_id, "room_name": rooms[room_id]["name"], "granted": True}


# ─────────────────────────────────────────────
# ROOMS & MESSAGES
# ─────────────────────────────────────────────
@app.get("/api/rooms")
async def list_rooms(request: Request):
    get_session(request)
    result = []
    for rid, r in rooms.items():
        result.append({
            "id":          rid,
            "name":        r["name"],
            "description": r.get("description", ""),
            "member_count": len(r["members"]),
        })
    return result


@app.get("/api/rooms/{room_id}/messages")
async def get_messages(room_id: str, request: Request):
    get_session(request)
    if room_id not in rooms:
        raise HTTPException(404, "Room not found")
    return messages[room_id][-100:]  # last 100


@app.get("/api/users")
async def list_users(request: Request):
    get_session(request)
    return [
        {
            "user_id":   uid,
            "username":  u["username"],
            "online":    u["online"],
            "room_id":   u["room_id"],
            "last_seen": u["last_seen"],
        }
        for uid, u in users.items()
    ]


# ─────────────────────────────────────────────
# CANARY / PASSIVE DETECTION
# ─────────────────────────────────────────────
@app.get("/api/probe/{token}")
async def probe_access(token: str, request: Request):
    """Detect if a canary token is reused from different IP."""
    ip = get_client_ip(request)
    entry = canary_tokens.get(token)
    if not entry:
        return {"ok": True}

    if entry["ip"] != ip:
        add_alert("CANARY_REUSE",
                  f"Canary token reused from {ip} (original: {entry['ip']})",
                  "high", ip)
        # Boost threat scores
        for tok, sess in sessions.items():
            if sess.get("ip") == entry["ip"] or sess.get("ip") == ip:
                threat_scores[tok] += 60
                check_threat_level(tok, "PROBE_MISUSE")

    return {"ok": True}


# ─────────────────────────────────────────────
# ADMIN DASHBOARD
# ─────────────────────────────────────────────
@app.get("/api/admin/stats")
async def admin_stats(request: Request):
    now = time.time()
    online_users = [u for u in users.values() if u["online"]]

    # Requests per second (last 10 seconds)
    recent_reqs = []
    for i in range(10):
        window_start = now - (i + 1)
        window_end   = now - i
        count = sum(
            1 for dq in ip_requests.values()
            for t in dq if window_start < t <= window_end
        )
        recent_reqs.append({"t": -i, "count": count})

    session_list = []
    for tok, sess in sessions.items():
        score = threat_scores.get(tok, 0)
        session_list.append({
            "token":     tok[:8] + "...",
            "username":  sess["username"],
            "ip":        sess["ip"],
            "geo":       sess.get("geo", {}),
            "score":     score,
            "label":     get_threat_label(score),
            "created":   sess["created_at"],
        })

    return {
        "online_count":   len(online_users),
        "total_users":    len(users),
        "total_sessions": len(sessions),
        "blocked_ips":    list(ip_block.keys()),
        "alert_count":    len(alert_log),
        "sessions":       session_list,
        "rps":            list(reversed(recent_reqs)),
    }


@app.get("/api/admin/alerts")
async def get_alerts():
    return alert_log[:50]


@app.get("/api/admin/requests")
async def get_requests():
    return list(request_log)[:100]


@app.get("/api/admin/threat-scores")
async def get_threat_scores():
    result = []
    for tok, score in threat_scores.items():
        sess = sessions.get(tok, {})
        result.append({
            "token":    tok[:8] + "...",
            "username": sess.get("username", "unknown"),
            "score":    score,
            "label":    get_threat_label(score),
            "ip":       sess.get("ip", ""),
        })
    return sorted(result, key=lambda x: x["score"], reverse=True)


@app.get("/api/admin/export")
async def export_logs():
    return {
        "exported_at": datetime.utcnow().isoformat(),
        "alerts":      alert_log,
        "sessions":    [
            {**v, "token": k[:8] + "..."}
            for k, v in sessions.items()
        ],
        "blocked_ips": list(ip_block.keys()),
        "threat_scores": {
            k[:8]: v for k, v in threat_scores.items()
        },
    }


# ─────────────────────────────────────────────
# ATTACK SIMULATION
# ─────────────────────────────────────────────
@app.post("/api/simulate/{attack_type}")
async def simulate_attack(attack_type: str, request: Request):
    ip = get_client_ip(request)

    if attack_type == "mitm":
        # Simulate session token reuse with different fingerprint
        fake_token = "simulated_mitm_" + secrets.token_hex(8)
        threat_scores[fake_token] += 50
        add_alert("SIMULATED_MITM",
                  f"[SIM] MITM attack: session token reused with different fingerprint from {ip}",
                  "high", ip, fake_token)
        return {"simulated": "MITM", "alert_triggered": True}

    elif attack_type == "hijack":
        # Session hijack simulation
        fake_token = "simulated_hijack_" + secrets.token_hex(8)
        threat_scores[fake_token] += 90
        add_alert("SIMULATED_SESSION_HIJACK",
                  f"[SIM] Session hijack: token used from unknown IP {ip}",
                  "high", ip, fake_token)
        return {"simulated": "SESSION_HIJACK", "alert_triggered": True}

    elif attack_type == "ddos":
        # DDoS simulation - spike fake request count
        for _ in range(150):
            ip_requests[f"ddos-sim-{ip}"].append(time.time())
        add_alert("SIMULATED_DDOS",
                  f"[SIM] DDoS flood detected from {ip}: 150 requests in burst",
                  "critical", ip)
        return {"simulated": "DDOS", "alert_triggered": True}

    raise HTTPException(400, "Unknown attack type")


# ─────────────────────────────────────────────
# WEBSOCKET
# ─────────────────────────────────────────────
async def broadcast_to_room(room_id: str, message: dict, exclude_uid: str = None):
    dead = []
    for uid in rooms.get(room_id, {}).get("members", set()):
        if uid == exclude_uid:
            continue
        ws = active_connections.get(uid)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(uid)
    for uid in dead:
        active_connections.pop(uid, None)


async def broadcast_all(message: dict):
    dead = []
    for uid, ws in active_connections.items():
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(uid)
    for uid in dead:
        active_connections.pop(uid, None)


@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    sess = sessions.get(token)
    if not sess:
        await websocket.close(code=4001)
        return

    user_id  = sess["user_id"]
    username = sess["username"]
    room_id  = sess.get("room_id", "general")

    await websocket.accept()
    active_connections[user_id] = websocket

    # Add to room
    rooms[room_id]["members"].add(user_id)
    if user_id in users:
        users[user_id]["online"] = True

    # Announce join
    await broadcast_to_room(room_id, {
        "type":      "user_joined",
        "user_id":   user_id,
        "username":  username,
        "room_id":   room_id,
        "timestamp": datetime.utcnow().isoformat(),
    })

    # Send room history
    await websocket.send_json({
        "type":     "room_history",
        "messages": messages[room_id][-50:],
        "room_id":  room_id,
    })

    # Send user list
    online = [
        {"user_id": uid, "username": u["username"], "online": u["online"]}
        for uid, u in users.items()
    ]
    await websocket.send_json({"type": "user_list", "users": online})

    # Rate limiting
    msg_timestamps: deque = deque(maxlen=20)

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")

            # WebSocket rate limit
            now = time.time()
            msg_timestamps.append(now)
            recent = sum(1 for t in msg_timestamps if t > now - 1)
            if recent > WS_MSG_LIMIT:
                threat_scores[token] += 15
                check_threat_level(token, "WS_FLOOD")
                await websocket.send_json({"type": "error", "message": "Slow down!"})
                continue

            if msg_type == "message":
                content = data.get("content", "").strip()
                if not content or len(content) > 2000:
                    continue

                target_room = data.get("room_id", room_id)
                if target_room not in rooms:
                    continue

                # Behavioral analysis
                b = behavior[user_id]
                b["msg_times"].append(now)
                if len(b["msg_times"]) >= 5:
                    intervals = [
                        b["msg_times"][i] - b["msg_times"][i - 1]
                        for i in range(1, min(5, len(b["msg_times"])))
                    ]
                    avg = sum(intervals) / len(intervals)
                    variance = sum((x - avg) ** 2 for x in intervals) / len(intervals)
                    if avg < 0.5 and variance < 0.01:
                        threat_scores[token] += 10
                        b["bot_score"] += 1
                        if b["bot_score"] >= 3:
                            add_alert("BOT_BEHAVIOR",
                                      f"User {username} shows bot-like message patterns",
                                      "medium", sess.get("ip", ""), token)

                msg = {
                    "id":        str(uuid.uuid4()),
                    "type":      "message",
                    "user_id":   user_id,
                    "username":  username,
                    "content":   content,
                    "room_id":   target_room,
                    "timestamp": datetime.utcnow().isoformat(),
                }
                messages[target_room].append(msg)
                if len(messages[target_room]) > 500:
                    messages[target_room] = messages[target_room][-500:]

                await broadcast_to_room(target_room, msg)

                # Update session room
                sessions[token]["room_id"] = target_room
                users[user_id]["room_id"]  = target_room
                rooms[target_room]["members"].add(user_id)

            elif msg_type == "typing":
                target_room = data.get("room_id", room_id)
                await broadcast_to_room(target_room, {
                    "type":      "typing",
                    "user_id":   user_id,
                    "username":  username,
                    "room_id":   target_room,
                    "timestamp": now,
                }, exclude_uid=user_id)

            elif msg_type == "switch_room":
                new_room = data.get("room_id")
                if new_room in rooms:
                    # Leave old room
                    rooms[room_id]["members"].discard(user_id)
                    await broadcast_to_room(room_id, {
                        "type": "user_left", "user_id": user_id, "username": username, "room_id": room_id,
                    })
                    room_id = new_room
                    sessions[token]["room_id"] = room_id
                    users[user_id]["room_id"]  = room_id
                    rooms[room_id]["members"].add(user_id)

                    await websocket.send_json({
                        "type":     "room_history",
                        "messages": messages[room_id][-50:],
                        "room_id":  room_id,
                    })
                    await broadcast_to_room(room_id, {
                        "type": "user_joined", "user_id": user_id, "username": username, "room_id": room_id,
                        "timestamp": datetime.utcnow().isoformat(),
                    })

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WS error for {username}: {e}")
    finally:
        active_connections.pop(user_id, None)
        rooms[room_id]["members"].discard(user_id)
        if user_id in users:
            users[user_id]["online"] = False
            users[user_id]["last_seen"] = time.time()
        await broadcast_to_room(room_id, {
            "type": "user_left", "user_id": user_id, "username": username, "room_id": room_id,
        })


# ─────────────────────────────────────────────
# SERVE REACT FRONTEND
# ─────────────────────────────────────────────
@app.get("/join")
async def join_page():
    return HTMLResponse("<script>window.location.href='/'</script>")


# Serve static files if built
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        index = os.path.join(frontend_dist, "index.html")
        with open(index) as f:
            return HTMLResponse(f.read())
