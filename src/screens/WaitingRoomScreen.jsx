import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRoom } from '../hooks/useRoom'
import { updateRoomStatus } from '../firebase/roomService'

export default function WaitingRoomScreen() {
  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const mySlot = sessionStorage.getItem('joker_slot')
  const isCreator = mySlot === 'p1'

  if (!room) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>…</p>
      </div>
    )
  }

  const players = room.players || {}
  const playerList = ['p1','p2','p3','p4'].map(k => players[k])
  const filledCount = playerList.filter(Boolean).length
  const allReady = filledCount === 4

  const handleStart = async () => {
    await updateRoomStatus(code, 'playing')
    navigate(`/room/${code}/game`)
  }

  // Navigate to game if status changed to playing (for non-creators)
  if (room.status === 'playing') {
    navigate(`/room/${code}/game`)
    return null
  }

  const s = room.settings || {}

  return (
    <div style={{ minHeight: '100vh', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{t('room_code')}</p>
        <p style={{
          fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 56,
          letterSpacing: '14px', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums',
        }}>
          {code}
        </p>
      </div>

      {/* Settings summary */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            s.gameMode === 'classic' ? t('mode_classic') : t('mode_9cards'),
            s.playerMode === 'individual' ? t('mode_individual') : t('mode_couples'),
            s.histType === 'special' ? t('hist_special') : `Hist: ${s.histValue}`,
          ].map(label => (
            <span key={label} style={{
              background: 'var(--surface-light)', borderRadius: 'var(--radius-badge)',
              padding: '4px 12px', fontSize: 13, color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Player slots */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 32 }}>
        <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
          {t('waiting_players')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {playerList.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', background: 'var(--surface-light)',
              borderRadius: 12, border: '1px solid var(--border)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: p ? 'var(--blue)' : 'var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15,
                color: p ? '#fff' : 'var(--text-secondary)',
                flexShrink: 0,
              }}>
                {p ? (p.name?.[0] || '?').toUpperCase() : i + 1}
              </div>
              <div>
                <p style={{ fontWeight: 600, fontSize: 15 }}>
                  {p ? p.name : <span style={{ color: 'var(--text-secondary)' }}>{t('empty_slot')}</span>}
                </p>
                {p && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {t('player_joined')}
                    {p.isCreator && ' · Host'}
                  </p>
                )}
              </div>
              {s.playerMode === 'couples' && (
                <span style={{
                  marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                  color: (i === 0 || i === 2) ? 'var(--blue)' : 'var(--orange)',
                  background: (i === 0 || i === 2) ? 'rgba(37,99,235,0.15)' : 'rgba(212,80,10,0.15)',
                  padding: '2px 8px', borderRadius: 6,
                }}>
                  {(i === 0 || i === 2) ? t('team_a') : t('team_b')}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {isCreator ? (
        <button
          onClick={handleStart}
          disabled={!allReady}
          style={{
            width: '100%', height: 52, background: 'var(--blue)', color: '#fff',
            borderRadius: 'var(--radius-btn)', fontSize: 17,
            fontFamily: 'Outfit, sans-serif', fontWeight: 700,
          }}
        >
          {allReady ? t('waiting_start') : t('waiting_need_players', { n: 4 - filledCount })}
        </button>
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 15 }}>
          {t('waiting_for_host')}
        </p>
      )}
    </div>
  )
}
