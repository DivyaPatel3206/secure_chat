import React, { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts'
import { getAdminStats, getAlerts, getThreatScores, simulateAttack, exportLogs } from '../utils/api'

function ThreatBadge({ label }) {
  const cls = {
    Normal:     'threat-normal',
    Suspicious: 'threat-suspicious',
    Attack:     'threat-attack',
  }[label] || 'threat-normal'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${cls}`}>{label}</span>
}

function SeverityIcon({ severity }) {
  const icons = {
    critical: { color: 'text-red-400',    icon: '🔴' },
    high:     { color: 'text-orange-400', icon: '🟠' },
    medium:   { color: 'text-yellow-400', icon: '🟡' },
    low:      { color: 'text-blue-400',   icon: '🔵' },
  }
  const { icon } = icons[severity] || icons.low
  return <span className="text-sm">{icon}</span>
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-discord-channel rounded-xl p-4 border border-discord-border">
      <div className="text-discord-muted text-xs font-mono uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold font-display ${accent || 'text-white'}`}>{value}</div>
      {sub && <div className="text-discord-muted text-xs mt-1">{sub}</div>}
    </div>
  )
}

export default function AdminDashboard() {
  const [stats,    setStats]    = useState(null)
  const [alerts,   setAlerts]   = useState([])
  const [threats,  setThreats]  = useState([])
  const [rpsData,  setRpsData]  = useState([])
  const [simResult, setSimResult] = useState('')
  const [tab,      setTab]      = useState('overview')
  const [loading,  setLoading]  = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [s, a, t] = await Promise.all([getAdminStats(), getAlerts(), getThreatScores()])
      setStats(s)
      setAlerts(a)
      setThreats(t)
      if (s.rps) {
        setRpsData(prev => {
          const total = s.rps.reduce((acc, r) => acc + r.count, 0)
          const newPt = { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), rps: total }
          const next  = [...prev, newPt].slice(-30)
          return next
        })
      }
    } catch (e) {
      console.error('Admin fetch error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  async function runSim(type) {
    try {
      const res = await simulateAttack(type)
      setSimResult(`✓ ${res.simulated} simulated — alert triggered!`)
      setTimeout(() => setSimResult(''), 4000)
      refresh()
    } catch (e) {
      setSimResult('Simulation failed: ' + e.message)
    }
  }

  async function handleExport() {
    const data = await exportLogs()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `securechat-logs-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const TABS = ['overview', 'alerts', 'threats', 'simulate', 'sessions']

  return (
    <div className="h-full flex flex-col bg-discord-bg text-discord-text overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-discord-border flex-shrink-0 bg-discord-sidebar">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
            <span className="text-red-400 text-sm">🛡</span>
          </div>
          <div>
            <h1 className="text-white font-bold font-display">Security Dashboard</h1>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-discord-green rounded-full animate-pulse" />
              <span className="text-discord-green text-xs font-mono">IDS ACTIVE</span>
            </div>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="text-xs bg-discord-border hover:bg-discord-input text-discord-text px-3 py-2 rounded-lg transition-colors font-mono"
        >
          ↓ Export JSON
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-discord-border flex-shrink-0 bg-discord-channel overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono capitalize transition-all whitespace-nowrap ${
              tab === t
                ? 'bg-discord-accent text-white'
                : 'text-discord-muted hover:text-discord-text hover:bg-discord-border'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="text-center py-20 text-discord-muted">Loading dashboard…</div>
        )}

        {/* OVERVIEW */}
        {tab === 'overview' && stats && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Online Users"    value={stats.online_count}    accent="text-discord-green" />
              <StatCard label="Total Sessions"  value={stats.total_sessions}  />
              <StatCard label="Alerts"          value={stats.alert_count}     accent={stats.alert_count > 0 ? 'text-red-400' : 'text-white'} />
              <StatCard label="Blocked IPs"     value={stats.blocked_ips?.length || 0} accent="text-yellow-400" />
            </div>

            {/* RPS Chart */}
            <div className="bg-discord-channel rounded-xl p-4 border border-discord-border">
              <div className="text-discord-muted text-xs font-mono uppercase tracking-wider mb-3">Requests / sec (live)</div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={rpsData}>
                  <defs>
                    <linearGradient id="rpsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#5865f2" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#5865f2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
                  <XAxis dataKey="time" stroke="#5c6080" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#5c6080" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#161927', border: '1px solid #2a2d3e', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#b0b5c8' }}
                  />
                  <Area type="monotone" dataKey="rps" stroke="#5865f2" fill="url(#rpsGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Recent alerts */}
            <div className="bg-discord-channel rounded-xl border border-discord-border overflow-hidden">
              <div className="px-4 py-3 border-b border-discord-border flex items-center justify-between">
                <span className="text-white font-semibold text-sm">Recent Alerts</span>
                <span className="text-discord-muted text-xs font-mono">{alerts.length} total</span>
              </div>
              <div className="divide-y divide-discord-border max-h-64 overflow-y-auto">
                {alerts.slice(0, 10).map(a => (
                  <div key={a.id} className={`px-4 py-3 alert-${a.severity}`}>
                    <div className="flex items-start gap-2">
                      <SeverityIcon severity={a.severity} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-xs font-mono font-semibold">{a.type}</span>
                          <span className="text-discord-muted text-xs">
                            {new Date(a.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-discord-text text-xs mt-0.5 truncate">{a.detail}</p>
                        {a.ip && <span className="text-discord-muted text-xs font-mono">{a.ip}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {alerts.length === 0 && (
                  <div className="px-4 py-6 text-center text-discord-muted text-sm">No alerts yet</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ALERTS */}
        {tab === 'alerts' && (
          <div className="bg-discord-channel rounded-xl border border-discord-border overflow-hidden">
            <div className="px-4 py-3 border-b border-discord-border">
              <span className="text-white font-semibold text-sm">All Alerts ({alerts.length})</span>
            </div>
            <div className="divide-y divide-discord-border">
              {alerts.map(a => (
                <div key={a.id} className={`px-4 py-3 alert-${a.severity}`}>
                  <div className="flex items-start gap-3">
                    <SeverityIcon severity={a.severity} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-xs font-mono font-bold">{a.type}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                          a.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                          a.severity === 'high'     ? 'bg-orange-500/20 text-orange-400' :
                          a.severity === 'medium'   ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>{a.severity}</span>
                        <span className="text-discord-muted text-xs ml-auto">{new Date(a.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-discord-text text-xs mt-1">{a.detail}</p>
                      <div className="flex gap-4 mt-1">
                        {a.ip      && <span className="text-discord-muted text-xs font-mono">IP: {a.ip}</span>}
                        {a.session && <span className="text-discord-muted text-xs font-mono">Session: {a.session}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {alerts.length === 0 && (
                <div className="px-4 py-12 text-center text-discord-muted">
                  <div className="text-4xl mb-3">✅</div>
                  <div>No alerts detected</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* THREATS */}
        {tab === 'threats' && (
          <div className="bg-discord-channel rounded-xl border border-discord-border overflow-hidden">
            <div className="px-4 py-3 border-b border-discord-border">
              <span className="text-white font-semibold text-sm">Threat Scores</span>
            </div>
            <div className="divide-y divide-discord-border">
              {threats.map((t, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-semibold">{t.username}</span>
                      <ThreatBadge label={t.label} />
                    </div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-discord-muted text-xs font-mono">{t.token}</span>
                      {t.ip && <span className="text-discord-muted text-xs font-mono">{t.ip}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold font-mono ${
                      t.score >= 100 ? 'text-red-400' :
                      t.score >= 50  ? 'text-yellow-400' :
                      'text-discord-green'
                    }`}>{t.score}</div>
                    <div className="text-discord-muted text-xs">pts</div>
                  </div>
                  {/* Score bar */}
                  <div className="w-24 bg-discord-border rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        t.score >= 100 ? 'bg-red-400' :
                        t.score >= 50  ? 'bg-yellow-400' :
                        'bg-discord-green'
                      }`}
                      style={{ width: `${Math.min(100, t.score)}%` }}
                    />
                  </div>
                </div>
              ))}
              {threats.length === 0 && (
                <div className="px-4 py-12 text-center text-discord-muted">No active threats</div>
              )}
            </div>
          </div>
        )}

        {/* SIMULATE */}
        {tab === 'simulate' && (
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 text-yellow-400 text-sm">
              ⚠️ Attack Simulation Panel — These buttons trigger IDS alerts for demonstration
            </div>

            {simResult && (
              <div className="bg-discord-green/10 border border-discord-green/30 rounded-xl px-4 py-3 text-discord-green text-sm animate-fade-in">
                {simResult}
              </div>
            )}

            <div className="grid gap-4">
              {[
                {
                  type:   'mitm',
                  label:  'MITM Attack',
                  icon:   '🕵️',
                  desc:   'Simulates a Man-in-the-Middle attack where a session token is reused with a different device fingerprint, triggering fingerprint mismatch and session hijack alerts.',
                  score:  '+50 pts',
                  color:  'border-orange-500/30 hover:border-orange-500/60',
                  btn:    'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400',
                },
                {
                  type:   'hijack',
                  label:  'Session Hijack',
                  icon:   '🔓',
                  desc:   'Simulates session token theft — the token is used from an unauthorized IP, triggering high-severity session hijack detection.',
                  score:  '+90 pts',
                  color:  'border-red-500/30 hover:border-red-500/60',
                  btn:    'bg-red-500/20 hover:bg-red-500/30 text-red-400',
                },
                {
                  type:   'ddos',
                  label:  'DDoS Flood',
                  icon:   '💣',
                  desc:   'Simulates a distributed denial-of-service attack with a burst of 150 requests, triggering rate limit and burst detection alerts.',
                  score:  'Critical',
                  color:  'border-purple-500/30 hover:border-purple-500/60',
                  btn:    'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400',
                },
              ].map(sim => (
                <div key={sim.type} className={`bg-discord-channel rounded-xl border p-5 transition-colors ${sim.color}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-2xl">{sim.icon}</span>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-white font-semibold">{sim.label}</h3>
                          <span className="text-xs font-mono text-discord-muted bg-discord-border px-2 py-0.5 rounded">{sim.score}</span>
                        </div>
                        <p className="text-discord-muted text-sm leading-relaxed">{sim.desc}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => runSim(sim.type)}
                      className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all border border-current ${sim.btn}`}
                    >
                      Simulate
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-discord-channel rounded-xl border border-discord-border p-4">
              <h3 className="text-white font-semibold mb-3 text-sm">Threat Score Reference</h3>
              <div className="space-y-2 text-sm font-mono">
                {[
                  ['Session Mismatch',  '+50', 'orange'],
                  ['Fingerprint Change','+40', 'yellow'],
                  ['Geo Anomaly',       '+30', 'blue'],
                  ['Probe/Canary Reuse','+60', 'red'],
                  ['High Request Rate', '+25', 'purple'],
                  ['WS Flood',          '+15', 'pink'],
                  ['Bot Behavior',      '+10', 'gray'],
                ].map(([label, pts, color]) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-discord-muted w-48">{label}</span>
                    <span className={`text-${color}-400 font-bold`}>{pts}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-discord-border space-y-1">
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-discord-green" /><span className="text-discord-green">Normal: 0–49</span></div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-400" /><span className="text-yellow-400">Suspicious: 50–99</span></div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-400" /><span className="text-red-400">Attack: 100+</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SESSIONS */}
        {tab === 'sessions' && stats && (
          <div className="bg-discord-channel rounded-xl border border-discord-border overflow-hidden">
            <div className="px-4 py-3 border-b border-discord-border">
              <span className="text-white font-semibold text-sm">Active Sessions ({stats.sessions?.length || 0})</span>
            </div>
            <div className="divide-y divide-discord-border">
              {(stats.sessions || []).map((s, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold">{s.username}</span>
                        <ThreatBadge label={s.label} />
                        <span className="text-discord-muted text-xs font-mono ml-auto">{s.token}</span>
                      </div>
                      <div className="flex gap-4 mt-1 flex-wrap">
                        <span className="text-discord-muted text-xs font-mono">IP: {s.ip}</span>
                        {s.geo?.country && (
                          <span className="text-discord-muted text-xs">📍 {s.geo.city}, {s.geo.country}</span>
                        )}
                        <span className="text-discord-muted text-xs">Score: <strong className={s.score >= 100 ? 'text-red-400' : s.score >= 50 ? 'text-yellow-400' : 'text-discord-green'}>{s.score}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {(!stats.sessions || stats.sessions.length === 0) && (
                <div className="px-4 py-12 text-center text-discord-muted">No active sessions</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
