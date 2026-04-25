import React, { useEffect, useRef, useState, useCallback } from 'react'

const AVATAR_COLORS = [
  '#5865f2','#3ba55c','#faa81a','#ed4245','#9c59b6',
  '#e91e63','#00bcd4','#ff5722','#607d8b','#795548',
]

function getAvatarColor(username = '') {
  const n = username.charCodeAt(0) || 0
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

function Avatar({ username, size = 36 }) {
  const color = getAvatarColor(username)
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center font-bold text-white select-none"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {username?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function Timestamp({ iso }) {
  const d = new Date(iso)
  return (
    <span className="text-discord-muted text-xs ml-2">
      {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}

function Message({ msg, isOwn, prevMsg }) {
  const sameUser = prevMsg?.user_id === msg.user_id
  const timeDiff = sameUser
    ? new Date(msg.timestamp) - new Date(prevMsg.timestamp)
    : Infinity

  // Group messages within 5 minutes from same user
  const grouped = sameUser && timeDiff < 5 * 60 * 1000

  if (msg.type === 'system') {
    return (
      <div className="flex items-center gap-3 px-4 py-1">
        <div className="flex-1 h-px bg-discord-border" />
        <span className="text-discord-muted text-xs">{msg.content}</span>
        <div className="flex-1 h-px bg-discord-border" />
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-3 px-4 hover:bg-white/[0.02] transition-colors rounded-sm msg-enter ${grouped ? 'mt-0.5 pt-0' : 'mt-3 pt-1'}`}>
      {/* Avatar or spacer */}
      <div className="flex-shrink-0 w-10">
        {!grouped
          ? <Avatar username={msg.username} />
          : <span className="text-discord-muted text-xs opacity-0 group-hover:opacity-100 leading-none pt-1 block text-right select-none w-full">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
        }
      </div>

      <div className="flex-1 min-w-0">
        {!grouped && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className={`font-semibold text-sm ${isOwn ? 'text-discord-accent' : 'text-white'}`}>
              {msg.username}
            </span>
            <Timestamp iso={msg.timestamp} />
          </div>
        )}
        <p className="text-discord-text text-sm leading-relaxed break-words whitespace-pre-wrap">
          {msg.content}
        </p>
      </div>
    </div>
  )
}

function TypingIndicator({ typingUsers }) {
  if (!typingUsers.length) return null
  const names = typingUsers.slice(0, 3).join(', ')
  const suffix = typingUsers.length > 3 ? ' and others' : ''
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-discord-muted text-xs">
      <div className="flex gap-1">
        {[0,1,2].map(i => (
          <div key={i} className="w-1.5 h-1.5 bg-discord-muted rounded-full typing-dot" style={{ animationDelay: `${i*0.2}s` }} />
        ))}
      </div>
      <span><strong className="text-discord-text">{names}{suffix}</strong> {typingUsers.length === 1 ? 'is' : 'are'} typing…</span>
    </div>
  )
}

export default function ChatArea({ messages, currentUser, roomName, typingUsers, onSendMessage, onTyping }) {
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const bottomRef                 = useRef(null)
  const typingTimer               = useRef(null)
  const wasTyping                 = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingUsers])

  const handleInput = useCallback((e) => {
    setInput(e.target.value)
    if (!wasTyping.current) {
      wasTyping.current = true
      onTyping?.(true)
    }
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      wasTyping.current = false
      onTyping?.(false)
    }, 1500)
  }, [onTyping])

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setInput('')
    clearTimeout(typingTimer.current)
    wasTyping.current = false
    await onSendMessage(content)
    setSending(false)
  }, [input, sending, onSendMessage])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="flex flex-col h-full">
      {/* Channel header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-discord-border flex-shrink-0 shadow-sm">
        <span className="text-discord-muted font-bold text-lg">#</span>
        <h2 className="text-white font-semibold">{roomName?.replace('#','')}</h2>
        <div className="h-4 w-px bg-discord-border mx-1" />
        <span className="text-discord-muted text-sm">Secure encrypted channel</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-2 h-2 bg-discord-green rounded-full status-online" />
          <span className="text-discord-green text-xs font-mono">LIVE</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 bg-discord-accent/20 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl">#</span>
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Welcome to {roomName}!</h3>
            <p className="text-discord-muted text-sm">This is the beginning of the channel. Messages are monitored by IDS.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <Message
            key={msg.id || i}
            msg={msg}
            isOwn={msg.user_id === currentUser?.user_id}
            prevMsg={messages[i - 1]}
          />
        ))}
        <TypingIndicator typingUsers={typingUsers} />
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="flex items-end gap-2 bg-discord-input rounded-xl border border-discord-border focus-within:border-discord-accent/50 transition-colors p-2">
          <textarea
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${roomName}…`}
            rows={1}
            className="flex-1 bg-transparent text-discord-text placeholder-discord-muted text-sm outline-none resize-none py-1.5 px-2 max-h-40 leading-relaxed"
            style={{ minHeight: 36 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-9 h-9 bg-discord-accent hover:bg-discord-accent-h disabled:opacity-30 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-all"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white fill-current">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        <div className="text-discord-muted text-xs mt-1 px-2">
          Press Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  )
}
