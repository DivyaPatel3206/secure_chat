import { useEffect, useRef, useCallback } from 'react'
import { getWsUrl } from '../utils/api'

/**
 * useWebSocket — maintains a persistent WebSocket connection.
 * Re-connects automatically on unexpected close.
 */
export default function useWebSocket({ token, onMessage, enabled = true }) {
  const wsRef      = useRef(null)
  const retryRef   = useRef(null)
  const retryCount = useRef(0)

  const connect = useCallback(() => {
    if (!token || !enabled) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(getWsUrl(token))
    wsRef.current = ws

    ws.onopen = () => {
      retryCount.current = 0
      onMessage?.({ type: 'connected' })
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        onMessage?.(data)
      } catch { /* ignore */ }
    }

    ws.onerror = () => { ws.close() }

    ws.onclose = (e) => {
      onMessage?.({ type: 'disconnected' })
      if (e.code !== 1000 && retryCount.current < 10 && enabled) {
        const delay = Math.min(1000 * 2 ** retryCount.current, 30000)
        retryCount.current++
        retryRef.current = setTimeout(connect, delay)
      }
    }
  }, [token, enabled, onMessage])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(retryRef.current)
      wsRef.current?.close(1000)
    }
  }, [connect])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send, ws: wsRef }
}
