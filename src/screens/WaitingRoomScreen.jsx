import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRoom } from '../hooks/useRoom'
import { updateRoomStatus, cancelRoom, leaveRoom } from '../firebase/roomService'
import ConfirmModal from '../components/ConfirmModal'
import LanguageToggle from '../components/LanguageToggle'

export default function WaitingRoomScreen() {
  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const mySlot = sessionStorage.getItem('joker_slot')
  const isCreator = mySlot === 'p1'
  const [showLeaveModal, setShowLeaveModal] = useState(false)

  useEffect(() => {
    if (room?.status === 'playing') {
      navigate(`/room/${code}/game`)
    }
  }, [room?.status, code, navigate])

  const handleStart = async () => {
    await updateRoomStatus(code, 'playing')
  }

  const handleLeaveConfirm = async () => {
    if (isCreator) {
      await cancelRoom(code)
    } else {
      await leaveRoom(code, mySlot)
    }
    sessionStorage.removeItem('joker_room')
    sessionStorage.removeItem('joker_slot')
    navigate('/')
  }

  if (!room) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-secondary)' }}>…</p>
      </div>
    )
  }

  const players = room.players || {}
  const playerList = ['p1', 'p2', 'p3', 'p4'].map(k => players[k])
  const filledCount = playerList.filter(Boolean).length
  const allReady = filledCount === 4
  const s = room.settings || {}

  return (
    <div style={{ minHeight: '100vh', padding: 24, maxWidth: 480, margin: '0 auto', background: 'var(--bg)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <button
          onClick={() => setShowLeaveModal(true)}
          style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 15, padding: '8px 0', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          ← {t('back')}
        </button>
        <LanguageToggle />
      </div>

      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>{t('room_code')}</p>
        <p style={{
          fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 56,
          letterSpacing: '14px', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums',
        }}>
          {code}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>{t('share_code')}</p>
      </div>

      {/* Settings summary */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px', marginBottom: 20, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            s.gameMode === 'classic' ? t('mode_classic') : t('mode_9cards'),
            s.playerMode === 'individual' ? t('mode_individual') : t('mode_couples'),
            s.histType === 'special' ? t('hist_special')
              : s.histType === 'mix' ? `${t('hist_mix')} ${s.histValueShort ?? 200}/${s.histValueLong ?? 500}`
              : `${t('hist_custom')} ${s.histValue ?? 200}`,
          ].map(label => (
            <span key={label} style={{
              background: 'var(--surface-light)', borderRadius: 'var(--radius-badge)',
              padding: '4px 12px', fontSize: 13, color: 'var(--text-secondary)',
              border: '1px solid var(--border)', fontFamily: 'Outfit, sans-serif',
            }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Player slots */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 32, border: '1px solid var(--border)' }}>
        <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          {t('waiting_players')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {playerList.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', background: 'var(--surface-light)',
              borderRadius: 12, border: `1px solid ${p ? 'rgba(37,99,235,0.2)' : 'var(--border)'}`,
              transition: 'border-color var(--transition)',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: p ? 'var(--blue)' : 'var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15,
                color: p ? '#fff' : 'var(--text-secondary)',
                flexShrink: 0, border: `2px solid ${p ? 'transparent' : 'var(--border)'}`,
              }}>
                {p ? (p.name?.[0] || '?').toUpperCase() : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: 15, fontFamily: 'Outfit, sans-serif' }}>
                  {p ? p.name : <span style={{ color: 'var(--text-secondary)' }}>{t('empty_slot')}</span>}
                </p>
                {p && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                    {t('player_joined')}{p.isCreator ? ' · Host' : ''}
                  </p>
                )}
              </div>
              {s.playerMode === 'couples' && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: (i === 0 || i === 2) ? 'var(--blue)' : 'var(--orange)',
                  background: (i === 0 || i === 2) ? 'rgba(37,99,235,0.15)' : 'rgba(212,80,10,0.15)',
                  padding: '3px 10px', borderRadius: 6,
                  fontFamily: 'Outfit, sans-serif',
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
            width: '100%', height: 54, background: 'var(--blue)', color: '#fff',
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

      {showLeaveModal && (
        <ConfirmModal
          title={isCreator ? t('cancel_room_title') : t('leave_waiting_title')}
          message={isCreator ? t('cancel_room_message') : t('leave_waiting_message')}
          confirmLabel={isCreator ? t('cancel_room_btn') : t('leave_room_btn')}
          destructive
          onConfirm={handleLeaveConfirm}
          onCancel={() => setShowLeaveModal(false)}
        />
      )}
    </div>
  )
}
