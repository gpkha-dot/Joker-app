import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRoom } from '../hooks/useRoom'
import { startGame, cancelRoom, leaveRoom } from '../firebase/roomService'
import ConfirmModal from '../components/ConfirmModal'
import LanguageToggle from '../components/LanguageToggle'

const SLOT_KEYS = ['p1', 'p2', 'p3', 'p4']

export default function WaitingRoomScreen() {
  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const mySlot = sessionStorage.getItem('joker_slot')
  const isSpectator = mySlot === 'spectator'
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showStartModal, setShowStartModal] = useState(false)

  useEffect(() => {
    if (room?.status === 'playing') navigate(`/room/${code}/game`)
  }, [room?.status, code, navigate])

  if (!room) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>…</p>
      </div>
    )
  }

  const players = room.players || {}
  const isCreator = !isSpectator && players[mySlot]?.isCreator === true
  const isCouples = room.settings?.playerMode === 'couples'
  const s = room.settings || {}

  // Count only claimed (joined) slots
  const claimedSlots = SLOT_KEYS.filter(k => players[k]?.claimed === true)
  const claimedCount = claimedSlots.length
  const canStart = claimedCount >= 2
  const needsConfirmation = claimedCount < 4

  const handleStartClick = () => {
    if (needsConfirmation) { setShowStartModal(true); return }
    doStart()
  }

  const doStart = async () => {
    await startGame(code, claimedCount)
  }

  const handleLeaveConfirm = async () => {
    if (isSpectator) {
      sessionStorage.removeItem('joker_room')
      sessionStorage.removeItem('joker_slot')
      navigate('/')
      return
    }
    if (isCreator) {
      await cancelRoom(code)
    } else {
      await leaveRoom(code, mySlot)
    }
    sessionStorage.removeItem('joker_room')
    sessionStorage.removeItem('joker_slot')
    navigate('/')
  }

  const teamColor = (i) => (i === 0 || i === 2) ? '#7C3AED' : '#0D9488'
  const teamLabel = (i) => (i === 0 || i === 2) ? t('team_a') : t('team_b')

  return (
    <div style={{ minHeight: '100vh', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <button
          onClick={() => setShowLeaveModal(true)}
          style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 15, padding: 0, fontFamily: 'Outfit, sans-serif' }}
        >
          ← {t('back')}
        </button>
        <LanguageToggle />
      </div>

      {/* Room code display */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{t('room_code')}</p>
        <p style={{
          fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 56,
          letterSpacing: '14px', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums',
        }}>
          {code}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>{t('share_code')}</p>
      </div>

      {/* Settings chips */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: '14px 16px', marginBottom: 20, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            s.gameMode === 'classic' ? t('mode_classic') : t('mode_9cards'),
            s.playerMode === 'individual' ? t('mode_individual') : t('mode_couples'),
            s.histType === 'special' ? t('hist_special')
              : s.histType === 'mix' ? `${t('hist_mix')} ${s.histValueShort ?? 200}/${s.histValueLong ?? 500}`
              : `${t('hist_custom')} ${s.histValue ?? 200}`,
            s.inputMode === 'each' ? t('input_each') : t('input_single'),
          ].map(label => (
            <span key={label} style={{
              background: 'var(--surface-light)', borderRadius: 'var(--radius-badge)',
              padding: '4px 10px', fontSize: 12, color: 'var(--text-secondary)',
              border: '1px solid var(--border)', fontFamily: 'Outfit, sans-serif',
            }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Player slots — always show all 4 */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 32, border: '1px solid var(--border)' }}>
        <p style={{
          fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13,
          marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px',
        }}>
          {t('waiting_players')} ({claimedCount}/4)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SLOT_KEYS.map((pk, i) => {
            const p = players[pk]
            const claimed = p?.claimed === true
            return (
              <div key={pk} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', background: 'var(--surface-light)',
                borderRadius: 12,
                border: `1px solid ${claimed ? 'rgba(37,99,235,0.2)' : 'var(--border)'}`,
              }}>
                {/* Avatar circle */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: claimed
                    ? (isCouples ? teamColor(i) : 'var(--blue)')
                    : 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16,
                  color: claimed ? '#fff' : 'var(--border)',
                  border: claimed ? 'none' : '2px dashed var(--border)',
                }}>
                  {claimed ? (p.name?.[0] || '?').toUpperCase() : <span style={{ fontSize: 14 }}>—</span>}
                </div>

                {/* Name + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontWeight: claimed ? 600 : 400, fontSize: 15,
                    fontFamily: 'Outfit, sans-serif',
                    color: claimed ? 'var(--text-primary)' : 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {claimed ? p.name : t('player_waiting')}
                  </p>
                  {claimed && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                      {t('player_joined')}{p.isCreator ? ' · Host' : ''}
                    </p>
                  )}
                </div>

                {/* Team badge (couples mode) */}
                {isCouples && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: teamColor(i),
                    background: (i === 0 || i === 2) ? 'rgba(124,58,237,0.15)' : 'rgba(13,148,136,0.15)',
                    padding: '3px 10px', borderRadius: 6, fontFamily: 'Outfit, sans-serif', flexShrink: 0,
                  }}>
                    {teamLabel(i)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Start / waiting message */}
      {isCreator ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {claimedCount < 2 && (
            <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
              {t('min_players_error')}
            </p>
          )}
          <button
            onClick={handleStartClick}
            disabled={!canStart}
            style={{
              width: '100%', height: 54, background: 'var(--blue)', color: '#fff',
              borderRadius: 'var(--radius-btn)', fontSize: 17,
              fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              opacity: canStart ? 1 : 0.4,
            }}
          >
            {t('waiting_start')}
          </button>
        </div>
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 15 }}>
          {isSpectator ? `👁 ${t('spectator_desc')}` : t('waiting_for_host')}
        </p>
      )}

      {/* Start with fewer than 4 players confirmation */}
      {showStartModal && (
        <ConfirmModal
          title={t('start_with_few_title', { n: claimedCount })}
          message={t('start_with_few_msg', { n: claimedCount })}
          confirmLabel={t('start_anyway')}
          onConfirm={() => { setShowStartModal(false); doStart() }}
          onCancel={() => setShowStartModal(false)}
        />
      )}

      {/* Leave / cancel room confirmation */}
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
