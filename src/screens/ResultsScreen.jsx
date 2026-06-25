import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import confetti from 'canvas-confetti'
import { useRoom } from '../hooks/useRoom'
import { buildHandSequence, calcPoints } from '../utils/scoring'

export default function ResultsScreen() {
  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const fired = useRef(false)

  useEffect(() => {
    if (!fired.current) {
      fired.current = true
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#2563EB','#D4500A','#fff','#F0F0F5'] })
    }
  }, [])

  if (!room) return null

  const { settings, hands = {}, players = {} } = room
  const { gameMode, playerMode, histType, histValue } = settings
  const handSeq = buildHandSequence(gameMode)

  // Use display order set by host in waiting room (respects drag reorder)
  const rawOrder = Array.isArray(room.displayOrder) ? room.displayOrder : ['p1','p2','p3','p4']
  const activeKeys = rawOrder.filter(k => players[k]?.claimed === true)
  const playerNames = activeKeys.map(k => players[k]?.name || k)

  const totals = activeKeys.map((pk, pi) => {
    let sum = 0
    for (let hi = 0; hi < handSeq.length; hi++) {
      const h = hands[hi] || {}
      const bid = h?.bids?.[pk]
      const result = h?.results?.[pk]
      if (bid != null && result != null) sum += calcPoints(bid, result, handSeq[hi], histType, histValue)
    }
    return { name: playerNames[pi], total: sum, player: pi }
  })

  let standings = []
  if (playerMode === 'couples' && activeKeys.length >= 4) {
    // display positions 0&2 = Team A, 1&3 = Team B (mirrors waiting room ordering)
    const teamA = totals[0].total + totals[2].total
    const teamB = totals[1].total + totals[3].total
    standings = [
      { label: `${t('team_a')}: ${playerNames[0]} & ${playerNames[2]}`, total: teamA, isTeam: true },
      { label: `${t('team_b')}: ${playerNames[1]} & ${playerNames[3]}`, total: teamB, isTeam: true },
    ].sort((a, b) => b.total - a.total)
  } else {
    standings = [...totals].sort((a, b) => b.total - a.total)
  }

  return (
    <div style={{ minHeight: '100vh', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 32, color: 'var(--blue)', marginBottom: 8 }}>
          {t('results_title')}
        </h1>
      </div>

      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-card)',
        padding: '24px', textAlign: 'center', marginBottom: 24,
        border: '2px solid var(--blue)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
        <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--blue)' }}>
          {standings[0]?.label || standings[0]?.name}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('winner')}</p>
        <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 36, marginTop: 12, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {(standings[0]?.total / 100).toFixed(1)}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
        {standings.slice(1).map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', background: 'var(--surface)',
            borderRadius: 'var(--radius-card)', border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{
                width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--text-secondary)',
              }}>
                {i + 2}
              </span>
              <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 16 }}>
                {s.label || s.name}
              </span>
            </div>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
              {(s.total / 100).toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          onClick={() => navigate(`/room/${code}/game`)}
          style={{
            height: 52, background: 'var(--surface-light)', color: 'var(--text-primary)',
            borderRadius: 'var(--radius-btn)', fontSize: 16,
            fontFamily: 'Outfit, sans-serif', fontWeight: 700,
            border: '2px solid var(--border)',
          }}
        >
          {t('view_scoresheet')}
        </button>
        <button
          onClick={() => navigate('/')}
          style={{
            height: 52, background: 'var(--blue)', color: '#fff',
            borderRadius: 'var(--radius-btn)', fontSize: 17,
            fontFamily: 'Outfit, sans-serif', fontWeight: 700,
          }}
        >
          {t('new_game')}
        </button>
      </div>
    </div>
  )
}
