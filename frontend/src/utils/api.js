// API utility — all backend calls go through here

const BASE = import.meta.env.VITE_API_URL || ''

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('chat_token')
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.detail || err.error || 'Request failed')
  }
  return res.json()
}

// ── Auth ──────────────────────────────────────────
export const register = (username, fingerprint) =>
  apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, fingerprint }) })

export const login = (username, fingerprint) =>
  apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, fingerprint }) })

export const logout = () =>
  apiFetch('/api/auth/logout', { method: 'POST' })

// ── Rooms ─────────────────────────────────────────
export const getRooms = () => apiFetch('/api/rooms')
export const getMessages = (roomId) => apiFetch(`/api/rooms/${roomId}/messages`)
export const getUsers = () => apiFetch('/api/users')

// ── QR ────────────────────────────────────────────
export const generateQR = (roomId) =>
  apiFetch(`/api/qr/generate/${roomId}`, { method: 'POST' })

export const joinViaQR = (token, fingerprint) =>
  apiFetch('/api/qr/join', { method: 'POST', body: JSON.stringify({ token, fingerprint }) })

// ── Admin ─────────────────────────────────────────
export const getAdminStats = () => apiFetch('/api/admin/stats')
export const getAlerts     = () => apiFetch('/api/admin/alerts')
export const getRequests   = () => apiFetch('/api/admin/requests')
export const getThreatScores = () => apiFetch('/api/admin/threat-scores')
export const exportLogs    = () => apiFetch('/api/admin/export')

// ── Attack Sim ────────────────────────────────────
export const simulateAttack = (type) =>
  apiFetch(`/api/simulate/${type}`, { method: 'POST' })

// ── Helpers ───────────────────────────────────────
export function getFingerprint() {
  return {
    userAgent:  navigator.userAgent,
    screen:     `${screen.width}x${screen.height}`,
    timezone:   Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform:   navigator.platform,
    language:   navigator.language,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
  }
}

export function getWsUrl(token) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const host  = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/^https?/, proto)
    : `${proto}://${location.host}`
  return `${host}/ws/${token}`
}
