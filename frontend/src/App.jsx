import React, { useState, useEffect, useCallback, useRef } from 'react'
import AuthScreen    from './components/AuthScreen.jsx'
import ChatArea      from './components/ChatArea.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import QRModal       from './components/QRModal.jsx'
import useWebSocket  from './hooks/useWebSocket.js'
import { getRooms, getUsers, logout } from './utils/api.js'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const ROOMS_DEFAULT = [
  { id: 'general',       name: '#general',       description: 'General chat' },
  { id: 'announcements', name: '#announcements', description: 'Announcements' },
  { id: 'dev-log',       name: '#dev-log',       description: 'Dev logs' },
]

const AVATAR_COLORS = [
  '#5865f2','#3ba55c','#faa81a','#ed4245','#9c59b6',
  '#e91e63','#00bcd4','#ff5722','#607d8b','#795548',
]
function avatarColor(s = '') {
  return AVATAR_COLORS[(s.charCodeAt(0) || 0) % AVATAR_COLORS.length]
}

// ─────────────────────────────────────────────
// Small UI pieces
// ─────────────────────────────────────────────
function UserAvatar({ username, size = 36 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 select-none"
      style={{ width: size, height: size, background: avatarColor(username), fontSize: size * 0.38 }}
    >
      {username?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function ServerIcon({ label, active, onClick, alert }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative w-12 h-12 rounded-[28%] flex items-center justify-center text-white font-bold text-sm transition-all duration-200
        ${active
          ? 'bg-discord-accent rounded-[35%] shadow-lg shadow-discord-accent/30'
          : 'bg-discord-channel hover:bg-discord-accent/70 hover:rounded-[35%]'
        }`}
    >
      {label[0]?.toUpperCase()}
      {alert && (
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-discord-sidebar flex items-center justify-center text-white" style={{fontSize:8}}>!</span>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────
// DISCORD MODE
// ─────────────────────────────────────────────
function DiscordLayout({ user, onLogout }) {
  const [rooms, setRooms]               = useState(ROOMS_DEFAULT)
  const [activeRoom, setActiveRoom]     = useState('general')
  const [messages, setMessages]         = useState({})
  const [onlineUsers, setOnlineUsers]   = useState([])
  const [typingUsers, setTypingUsers]   = useState([])
  const [connected, setConnected]       = useState(false)
  const [showAdmin, setShowAdmin]       = useState(false)
  const [showQR, setShowQR]             = useState(false)
  const [alertCount, setAlertCount]     = useState(0)
  const [panel, setPanel]               = useState('chat') // chat | admin
  const typingTimers                    = useRef({})

  const token = localStorage.getItem('chat_token')

  // ── WebSocket handler ──────────────────────
  const handleMessage = useCallback((data) => {
    if (!data?.type) return

    switch (data.type) {
      case 'connected':
        setConnected(true)
        break
      case 'disconnected':
        setConnected(false)
        break

      case 'room_history':
        setMessages(prev => ({ ...prev, [data.room_id]: data.messages || [] }))
        break

      case 'message':
        setMessages(prev => ({
          ...prev,
          [data.room_id]: [...(prev[data.room_id] || []), data],
        }))
        break

      case 'user_list':
        setOnlineUsers(data.users || [])
        break

      case 'user_joined':
      case 'user_left':
        setOnlineUsers(prev => {
          const exists = prev.find(u => u.user_id === data.user_id)
          if (data.type === 'user_left') {
            return prev.map(u => u.user_id === data.user_id ? { ...u, online: false } : u)
          }
          if (exists) return prev.map(u => u.user_id === data.user_id ? { ...u, online: true } : u)
          return [...prev, { user_id: data.user_id, username: data.username, online: true }]
        })
        break

      case 'typing': {
        const uid      = data.user_id
        const username = data.username
        if (uid === user?.user_id) break
        setTypingUsers(prev => [...new Set([...prev, username])])
        clearTimeout(typingTimers.current[uid])
        typingTimers.current[uid] = setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u !== username))
        }, 2000)
        break
      }

      default: break
    }
  }, [user?.user_id])

  const { send } = useWebSocket({ token, onMessage: handleMessage, enabled: !!token })

  // ── Actions ────────────────────────────────
  const sendMessage = useCallback(async (content) => {
    send({ type: 'message', content, room_id: activeRoom })
  }, [send, activeRoom])

  const handleTyping = useCallback((isTyping) => {
    if (isTyping) send({ type: 'typing', room_id: activeRoom })
  }, [send, activeRoom])

  const switchRoom = useCallback((roomId) => {
    setActiveRoom(roomId)
    send({ type: 'switch_room', room_id: roomId })
    setTypingUsers([])
  }, [send])

  async function handleLogout() {
    await logout().catch(() => {})
    localStorage.clear()
    onLogout()
  }

  const currentRoomMsgs = messages[activeRoom] || []
  const currentRoom     = rooms.find(r => r.id === activeRoom) || rooms[0]
  const onlineCount     = onlineUsers.filter(u => u.online).length

  return (
    <div className="flex h-screen w-screen bg-discord-bg overflow-hidden">
      {/* ── Column 1: Server icons ── */}
      <div className="flex flex-col items-center gap-2 py-3 px-2 bg-discord-sidebar w-[72px] flex-shrink-0 border-r border-discord-border">
        {/* Home */}
        <ServerIcon
          label="S"
          active={panel === 'chat'}
          onClick={() => setPanel('chat')}
        />
        <div className="w-8 h-px bg-discord-border my-1" />
        {/* Room servers */}
        {rooms.map(r => (
          <ServerIcon
            key={r.id}
            label={r.name.replace('#','')}
            active={panel === 'chat' && activeRoom === r.id}
            onClick={() => { setPanel('chat'); switchRoom(r.id) }}
          />
        ))}
        <div className="w-8 h-px bg-discord-border my-1" />
        {/* Admin */}
        <ServerIcon
          label="⚙"
          active={panel === 'admin'}
          onClick={() => setPanel('admin')}
          alert={alertCount > 0}
        />

        {/* Spacer + user */}
        <div className="flex-1" />
        <button
          onClick={handleLogout}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors"
          title="Logout"
        >
          <UserAvatar username={user?.username} size={36} />
        </button>
      </div>

      {panel === 'admin' ? (
        <div className="flex-1 overflow-hidden">
          <AdminDashboard />
        </div>
      ) : (
        <>
          {/* ── Column 2: Channel list ── */}
          <div className="w-60 flex-shrink-0 bg-discord-channel flex flex-col border-r border-discord-border">
            {/* Server header */}
            <div className="px-4 py-3 border-b border-discord-border flex items-center justify-between">
              <h2 className="text-white font-bold text-sm">SecureChat IDS</h2>
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-discord-green' : 'bg-discord-red'}`} />
            </div>

            {/* Channels */}
            <div className="flex-1 overflow-y-auto py-2">
              <div className="px-2 mb-1">
                <span className="text-discord-muted text-xs font-mono uppercase tracking-wider px-2">Channels</span>
              </div>
              {rooms.map(r => (
                <button
                  key={r.id}
                  onClick={() => switchRoom(r.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg mx-2 text-left transition-all ${
                    activeRoom === r.id
                      ? 'bg-discord-border text-white'
                      : 'text-discord-muted hover:text-discord-text hover:bg-discord-border/50'
                  }`}
                  style={{ width: 'calc(100% - 16px)' }}
                >
                  <span className="text-lg leading-none">#</span>
                  <span className="text-sm flex-1">{r.name.replace('#','')}</span>
                </button>
              ))}

              {/* QR join button */}
              <div className="px-4 mt-4">
                <button
                  onClick={() => setShowQR(true)}
                  className="w-full flex items-center gap-2 text-discord-muted hover:text-white text-xs py-2 px-2 rounded-lg hover:bg-discord-border/50 transition-colors"
                >
                  <span>⊞</span>
                  <span>Join via QR Code</span>
                </button>
              </div>
            </div>

            {/* User info bar */}
            <div className="border-t border-discord-border p-2 flex items-center gap-2 bg-discord-sidebar">
              <div className="relative">
                <UserAvatar username={user?.username} size={32} />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-discord-green rounded-full border-2 border-discord-sidebar status-online" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-semibold truncate">{user?.username}</div>
                <div className="text-discord-muted text-xs">Online</div>
              </div>
              <button
                onClick={handleLogout}
                className="text-discord-muted hover:text-discord-red transition-colors text-sm px-1.5"
                title="Logout"
              >
                ⏻
              </button>
            </div>
          </div>

          {/* ── Column 3: Chat ── */}
          <div className="flex-1 overflow-hidden bg-discord-bg">
            <ChatArea
              messages={currentRoomMsgs}
              currentUser={user}
              roomName={currentRoom?.name}
              typingUsers={typingUsers}
              onSendMessage={sendMessage}
              onTyping={handleTyping}
            />
          </div>

          {/* ── Column 4: Online users ── */}
          <div className="w-56 flex-shrink-0 bg-discord-channel flex flex-col border-l border-discord-border">
            <div className="px-4 py-3 border-b border-discord-border">
              <span className="text-discord-muted text-xs font-mono uppercase tracking-wider">
                Online — {onlineCount}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto py-2 px-2">
              {onlineUsers.filter(u => u.online).map(u => (
                <div key={u.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-discord-border/50 transition-colors">
                  <div className="relative">
                    <UserAvatar username={u.username} size={30} />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-discord-green rounded-full border-2 border-discord-channel status-online" />
                  </div>
                  <span className={`text-sm truncate ${u.user_id === user?.user_id ? 'text-white font-semibold' : 'text-discord-text'}`}>
                    {u.username}
                    {u.user_id === user?.user_id && <span className="text-discord-muted text-xs ml-1">(you)</span>}
                  </span>
                </div>
              ))}
              {/* Offline users */}
              {onlineUsers.filter(u => !u.online).length > 0 && (
                <>
                  <div className="px-2 py-2 mt-2">
                    <span className="text-discord-muted text-xs font-mono uppercase tracking-wider">
                      Offline — {onlineUsers.filter(u => !u.online).length}
                    </span>
                  </div>
                  {onlineUsers.filter(u => !u.online).map(u => (
                    <div key={u.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg opacity-50">
                      <UserAvatar username={u.username} size={30} />
                      <span className="text-discord-muted text-sm truncate">{u.username}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* IDS Status panel */}
            <div className="border-t border-discord-border p-3 space-y-1">
              <div className="text-discord-muted text-xs font-mono uppercase tracking-wider mb-2">IDS Status</div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-1.5 h-1.5 bg-discord-green rounded-full animate-pulse" />
                <span className="text-discord-green font-mono">Active Sniffing</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-1.5 h-1.5 bg-discord-green rounded-full animate-pulse" />
                <span className="text-discord-green font-mono">Canary Tokens</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-1.5 h-1.5 bg-discord-green rounded-full animate-pulse" />
                <span className="text-discord-green font-mono">Rate Limiting</span>
              </div>
              <button
                onClick={() => setPanel('admin')}
                className="mt-2 w-full text-xs text-discord-accent hover:text-white bg-discord-accent/10 hover:bg-discord-accent/20 py-1.5 rounded-lg transition-colors font-mono"
              >
                → Open Dashboard
              </button>
            </div>
          </div>
        </>
      )}

      {/* QR Modal */}
      {showQR && (
        <QRModal
          roomId={activeRoom}
          roomName={currentRoom?.name}
          onClose={() => setShowQR(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// PRODUCTIVITY MODE
// ─────────────────────────────────────────────
function ProductivityLayout({ user, onLogout }) {
  const [rooms]                       = useState(ROOMS_DEFAULT)
  const [activeRoom, setActiveRoom]   = useState('general')
  const [messages, setMessages]       = useState({})
  const [onlineUsers, setOnlineUsers] = useState([])
  const [typingUsers, setTypingUsers] = useState([])
  const [connected, setConnected]     = useState(false)
  const [panel, setPanel]             = useState('wiki') // wiki | tasks | admin
  const typingTimers                  = useRef({})
  const token                         = localStorage.getItem('chat_token')

  const handleMessage = useCallback((data) => {
    if (!data?.type) return
    switch (data.type) {
      case 'connected':    setConnected(true); break
      case 'disconnected': setConnected(false); break
      case 'room_history':
        setMessages(prev => ({ ...prev, [data.room_id]: data.messages || [] })); break
      case 'message':
        setMessages(prev => ({ ...prev, [data.room_id]: [...(prev[data.room_id] || []), data] })); break
      case 'user_list':    setOnlineUsers(data.users || []); break
      case 'user_joined':
      case 'user_left':
        setOnlineUsers(prev => {
          if (data.type === 'user_left') return prev.map(u => u.user_id === data.user_id ? { ...u, online: false } : u)
          const exists = prev.find(u => u.user_id === data.user_id)
          if (exists) return prev.map(u => u.user_id === data.user_id ? { ...u, online: true } : u)
          return [...prev, { user_id: data.user_id, username: data.username, online: true }]
        }); break
      case 'typing': {
        const { user_id: uid, username } = data
        if (uid === user?.user_id) break
        setTypingUsers(prev => [...new Set([...prev, username])])
        clearTimeout(typingTimers.current[uid])
        typingTimers.current[uid] = setTimeout(() => setTypingUsers(prev => prev.filter(u => u !== username)), 2000)
        break
      }
    }
  }, [user?.user_id])

  const { send } = useWebSocket({ token, onMessage: handleMessage, enabled: !!token })

  const sendMessage  = useCallback((content) => send({ type: 'message', content, room_id: activeRoom }), [send, activeRoom])
  const handleTyping = useCallback((t) => { if (t) send({ type: 'typing', room_id: activeRoom }) }, [send, activeRoom])
  const switchRoom   = useCallback((id) => { setActiveRoom(id); send({ type: 'switch_room', room_id: id }); setTypingUsers([]) }, [send])

  const onlineCount     = onlineUsers.filter(u => u.online).length
  const currentRoom     = rooms.find(r => r.id === activeRoom) || rooms[0]
  const currentRoomMsgs = messages[activeRoom] || []

  const WIKI_CONTENT = `## SecureChat IDS — Project Wiki

### Architecture Overview
The system uses a **Zero Trust** security model with application-layer intrusion detection.

**Backend:** FastAPI + WebSockets  
**Frontend:** React + Tailwind CSS  
**IDS:** Custom Python engine  

### Security Features
- Session token ↔ Device fingerprint binding
- Canary token injection (passive sniffing detection)
- Real-time behavioral analysis
- Geo-anomaly detection (impossible travel)
- Rate limiting with IP blocking
- WebSocket message throttling

### Threat Scoring
| Event | Score |
|-------|-------|
| Session mismatch | +50 |
| Fingerprint change | +40 |
| Geo anomaly | +30 |
| Canary reuse | +60 |
| High request rate | +25 |

### Labels
- **Normal** → 0–49 pts
- **Suspicious** → 50–99 pts  
- **Attack** → 100+ pts`

  const TASKS = [
    { id: 1, done: true,  text: 'Implement WebSocket real-time chat' },
    { id: 2, done: true,  text: 'Build session fingerprint binding' },
    { id: 3, done: true,  text: 'Add canary token injection' },
    { id: 4, done: true,  text: 'Implement threat scoring engine' },
    { id: 5, done: true,  text: 'Add geo-anomaly detection' },
    { id: 6, done: true,  text: 'Build admin security dashboard' },
    { id: 7, done: true,  text: 'Add attack simulation panel' },
    { id: 8, done: true,  text: 'QR code room joining' },
    { id: 9, done: false, text: 'Add Redis for production rate limiting' },
    { id: 10, done: false,text: 'Add PostgreSQL persistence layer' },
  ]

  return (
    <div className="flex flex-col h-screen w-screen bg-prod-bg overflow-hidden font-sans">
      {/* Top nav */}
      <div className="bg-prod-nav border-b border-prod-border flex items-center px-4 h-12 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <div className="w-6 h-6 bg-prod-accent rounded flex items-center justify-center text-white text-xs">S</div>
          SecureChat IDS
        </div>
        <div className="flex-1 flex items-center gap-1">
          {rooms.map(r => (
            <button
              key={r.id}
              onClick={() => switchRoom(r.id)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                activeRoom === r.id
                  ? 'bg-prod-accent text-white'
                  : 'text-prod-silver hover:text-white hover:bg-white/10'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            {connected ? 'Connected' : 'Offline'}
          </div>
          <div className="text-prod-silver text-xs">{user?.username}</div>
          <button onClick={onLogout} className="text-prod-silver hover:text-white text-xs px-2 py-1 rounded border border-prod-border/50 hover:border-prod-silver transition-colors">
            Logout
          </button>
        </div>
      </div>

      {/* Main split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Chat */}
        <div className="flex-1 border-r border-prod-border bg-white overflow-hidden flex flex-col">
          <ChatArea
            messages={currentRoomMsgs}
            currentUser={user}
            roomName={currentRoom?.name}
            typingUsers={typingUsers}
            onSendMessage={sendMessage}
            onTyping={handleTyping}
          />
        </div>

        {/* Right: Panel */}
        <div className="w-96 flex-shrink-0 flex flex-col bg-prod-bg overflow-hidden">
          {/* Panel tabs */}
          <div className="flex border-b border-prod-border bg-prod-panel">
            {[
              { id: 'wiki', label: 'Wiki' },
              { id: 'tasks', label: 'Tasks' },
              { id: 'admin', label: '🛡 IDS' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setPanel(t.id)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  panel === t.id
                    ? 'border-prod-accent text-prod-accent'
                    : 'border-transparent text-prod-muted hover:text-prod-text'
                }`}
              >
                {t.label}
              </button>
            ))}
            <div className="ml-auto flex items-center px-3 gap-2 text-xs text-prod-muted">
              👥 {onlineCount}
            </div>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">
            {panel === 'wiki' && (
              <div className="p-4">
                <div className="prose prose-sm max-w-none">
                  {WIKI_CONTENT.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) return <h2 key={i} className="text-prod-text text-base font-bold mt-4 mb-2">{line.slice(3)}</h2>
                    if (line.startsWith('### ')) return <h3 key={i} className="text-prod-text text-sm font-semibold mt-3 mb-1">{line.slice(4)}</h3>
                    if (line.startsWith('- ')) return <div key={i} className="text-prod-muted text-sm flex gap-2 mb-0.5"><span>•</span><span dangerouslySetInnerHTML={{__html:line.slice(2).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}} /></div>
                    if (line.startsWith('| ') && !line.startsWith('|---')) {
                      const cells = line.split('|').filter(Boolean).map(c => c.trim())
                      return <div key={i} className="flex border-b border-prod-border py-1">{cells.map((c,j) => <div key={j} className="flex-1 text-xs text-prod-text">{c}</div>)}</div>
                    }
                    if (line.trim() === '' || line.startsWith('|---')) return null
                    return <p key={i} className="text-prod-muted text-sm mb-1" dangerouslySetInnerHTML={{__html:line.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}} />
                  })}
                </div>
              </div>
            )}

            {panel === 'tasks' && (
              <div className="p-4 space-y-2">
                <h3 className="text-prod-text font-semibold text-sm mb-3">Project Tasks</h3>
                {TASKS.map(t => (
                  <div key={t.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${t.done ? 'bg-green-50 border-green-200' : 'bg-white border-prod-border'}`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${t.done ? 'bg-green-500 border-green-500' : 'border-prod-border'}`}>
                      {t.done && <svg viewBox="0 0 12 12" className="w-3 h-3 text-white fill-current"><path d="M10 3L5 8 2 5"/></svg>}
                    </div>
                    <span className={`text-sm ${t.done ? 'line-through text-green-600' : 'text-prod-text'}`}>{t.text}</span>
                  </div>
                ))}
                <div className="text-prod-muted text-xs text-right mt-2">
                  {TASKS.filter(t => t.done).length}/{TASKS.length} completed
                </div>
              </div>
            )}

            {panel === 'admin' && (
              <div className="h-full">
                <AdminDashboard />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
export default function App() {
  const [user,    setUser]    = useState(null)
  const [uiMode,  setUiMode]  = useState('discord') // discord | productivity
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token    = localStorage.getItem('chat_token')
    const userId   = localStorage.getItem('chat_user_id')
    const username = localStorage.getItem('chat_username')
    if (token && userId && username) {
      setUser({ token, user_id: userId, username })
    }
    setLoading(false)
  }, [])

  function handleAuth(data) {
    setUser(data)
  }

  function handleLogout() {
    localStorage.clear()
    setUser(null)
  }

  if (loading) {
    return (
      <div className="h-screen w-screen bg-discord-bg flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-discord-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <AuthScreen onAuth={handleAuth} />

  return (
    <div className="relative">
      {/* Mode toggle */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full px-2 py-1.5 border border-white/10">
        <span className="text-white/50 text-xs px-2">UI:</span>
        {[
          { id: 'discord',      label: '🎮 Discord' },
          { id: 'productivity', label: '💼 Productivity' },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setUiMode(m.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              uiMode === m.id
                ? 'bg-discord-accent text-white'
                : 'text-white/60 hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {uiMode === 'discord'
        ? <DiscordLayout      user={user} onLogout={handleLogout} />
        : <ProductivityLayout user={user} onLogout={handleLogout} />
      }
    </div>
  )
}
