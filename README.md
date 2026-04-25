# 🛡 Secure Real-Time Chat System with IDS

A production-ready secure chat application featuring application-layer intrusion detection and behavioral threat analysis, built for computer networks security demonstration.

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (React)                        │
│  Discord Mode ←→ Toggle ←→ Productivity Mode            │
│  WebSocket Connection + API Calls                        │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS / WSS
┌─────────────────────▼───────────────────────────────────┐
│                  FASTAPI BACKEND                         │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Auth &  │  │  WebSocket│  │   QR     │              │
│  │ Sessions │  │  Manager │  │  Handler │              │
│  └────┬─────┘  └────┬─────┘  └──────────┘              │
│       │             │                                    │
│  ┌────▼─────────────▼──────────────────────────┐        │
│  │           SECURITY MIDDLEWARE                │        │
│  │  Rate Limiting │ Request Logging │ Canary    │        │
│  └────────────────────┬────────────────────────┘        │
│                       │                                  │
│  ┌────────────────────▼────────────────────────┐        │
│  │           INTRUSION DETECTION ENGINE         │        │
│  │  Active Sniffing │ Passive (Canary) │ Geo    │        │
│  └────────────────────┬────────────────────────┘        │
│                       │                                  │
│  ┌────────────────────▼────────────────────────┐        │
│  │           THREAT SCORING ENGINE              │        │
│  │  Normal (0-49) │ Suspicious (50-99) │ Attack │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Local Development

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`

---

## 🔐 Security Features

### Authentication & Sessions
- Session token ↔ Device fingerprint binding
- Fingerprint: User-Agent + Screen + Timezone + Platform
- Only hashed fingerprints stored
- Periodic session rotation on login

### Intrusion Detection System

#### Active Sniffing Detection
| Detection | Method | Score |
|-----------|--------|-------|
| Session token with different fingerprint | Fingerprint comparison | +40 |
| Rapid identity changes | Login tracking | +50 |

#### Passive Sniffing (Canary Tokens)
- Every HTTP response includes a unique `X-Request-ID` canary token
- If a canary token is accessed from a different IP → passive sniff detected (+60)

#### HTTP Monitoring
- All requests logged with IP, UA, method, path, size
- Scripted traffic (curl, python-requests) flagged
- High request rate → IP temporarily blocked

### Threat Scoring Engine
| Event | Score |
|-------|-------|
| Session mismatch | +50 |
| Fingerprint change | +40 |
| Geo anomaly (impossible travel) | +30 |
| Canary token reuse | +60 |
| High request rate | +25 |
| WebSocket flood | +15 |
| Bot behavior patterns | +10 |

**Output Labels:**
- 🟢 **Normal** — 0–49 pts
- 🟡 **Suspicious** — 50–99 pts
- 🔴 **Attack** — 100+ pts

### Attack Protection
- **DDoS**: Rate limiting (100 req/min/IP), burst detection, auto-blocking
- **Brute Force**: Max 5 attempts, 5-minute cooldown
- **WebSocket**: 10 msgs/sec limit per connection
- **Behavioral Analysis**: Typing delay variance, message frequency, bot detection

---

## 🎨 UI Modes

### Discord Mode (Dark)
- Charcoal + slate-grey theme
- Left sidebar: circular server icons
- Channel list with #general, #announcements, #dev-log
- Chat with rounded bubbles, avatars
- Right sidebar: online users with green status indicators

### Productivity Mode
- Top horizontal server bar
- Split: Chat (left) + Tasks/Wiki panel (right)
- Navy blue + silver theme
- Admin IDS panel in right tab

---

## 📊 Admin Dashboard

Access via ⚙ icon in sidebar:
- **Overview**: Live stats, RPS graph, recent alerts
- **Alerts**: All IDS alerts with severity
- **Threats**: Per-session threat scores
- **Simulate**: MITM / Session Hijack / DDoS simulation
- **Sessions**: All active sessions with geo + scores
- **Export**: Download JSON report

---

## 🎭 Attack Simulation

Buttons in the Admin → Simulate tab:

| Attack | Description | Alert |
|--------|-------------|-------|
| MITM | Session token reused with different fingerprint | SIMULATED_MITM |
| Session Hijack | Token from unauthorized IP | SIMULATED_SESSION_HIJACK |
| DDoS | 150-request burst flood | SIMULATED_DDOS |

---

## 📦 Deployment on Render

1. Push to GitHub
2. Create a new Render Blueprint
3. Point to `render.yaml`
4. Deploy — zero configuration needed

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI 0.111 + Uvicorn |
| WebSockets | FastAPI WebSocket + native |
| Frontend | React 18 + Tailwind CSS 3 |
| Build | Vite 5 |
| Charts | Recharts |
| QR Codes | qrcode + Pillow |
| Geo | ip-api.com (free) |
| Deployment | Render (Docker + Static) |

---

## 📁 Project Structure

```
secure-chat/
├── backend/
│   ├── main.py           # FastAPI app: auth, WS, IDS, admin
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Root + Discord/Productivity layouts
│   │   ├── components/
│   │   │   ├── AuthScreen.jsx    # Login / Register
│   │   │   ├── ChatArea.jsx      # Messages + input
│   │   │   ├── AdminDashboard.jsx # Security dashboard
│   │   │   └── QRModal.jsx       # QR join modal
│   │   ├── hooks/
│   │   │   └── useWebSocket.js   # WS hook with auto-reconnect
│   │   └── utils/
│   │       └── api.js            # API client
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── render.yaml
└── README.md
```
