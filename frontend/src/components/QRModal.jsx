import React, { useState, useEffect } from 'react'
import { generateQR } from '../utils/api'

export default function QRModal({ roomId, roomName, onClose }) {
  const [qrData, setQrData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [countdown, setCountdown] = useState(120)

  useEffect(() => {
    generateQR(roomId)
      .then(d => { setQrData(d); setCountdown(d.expires_in || 120) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [roomId])

  useEffect(() => {
    if (!qrData) return
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(id); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [qrData])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-discord-sidebar border border-discord-border rounded-2xl p-6 max-w-sm w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-bold font-display">Join via QR</h2>
            <p className="text-discord-muted text-sm">{roomName}</p>
          </div>
          <button onClick={onClose} className="text-discord-muted hover:text-white transition-colors text-xl">✕</button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-discord-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
        )}

        {qrData && !error && (
          <>
            <div className="bg-white rounded-xl p-3 mb-4 flex items-center justify-center">
              <img src={qrData.qr_image} alt="QR Code" className="w-48 h-48" />
            </div>

            <div className="space-y-3">
              {/* Countdown */}
              <div className="flex items-center gap-3">
                <div className={`text-sm font-mono flex-1 ${countdown < 30 ? 'text-red-400' : 'text-discord-green'}`}>
                  {countdown > 0 ? `⏱ Expires in ${countdown}s` : '⚠️ Expired — regenerate'}
                </div>
                {countdown > 0 && (
                  <div className="flex-1 bg-discord-border rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${countdown < 30 ? 'bg-red-400' : 'bg-discord-green'}`}
                      style={{ width: `${(countdown / 120) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Security features */}
              <div className="bg-discord-bg rounded-xl p-3 space-y-1.5 text-xs text-discord-muted font-mono">
                <div className="flex items-center gap-2"><span className="text-discord-green">✓</span> Single-use token</div>
                <div className="flex items-center gap-2"><span className="text-discord-green">✓</span> 2-minute expiry</div>
                <div className="flex items-center gap-2"><span className="text-discord-green">✓</span> Device fingerprint bound</div>
              </div>

              <button
                onClick={onClose}
                className="w-full bg-discord-accent hover:bg-discord-accent-h text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
