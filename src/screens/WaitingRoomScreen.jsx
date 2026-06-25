import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRoom } from '../hooks/useRoom'
import { startGame, cancelRoom, leaveRoom, updatePlayerOrder } from '../firebase/roomService'
import ConfirmModal from '../components/ConfirmModal'
import LanguageToggle from '../components/LanguageToggle'

const SLOT_KEYS = ['p1', 'p2', 'p3', 'p4']
const TEAM_A = '#7C3AED'
const TEAM_B = '#0D9488'

export default function WaitingRoomScreen() {
  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const mySlot = sessionStorage.getItem('joker_slot') || ''
  const isSpectator = mySlot === 'spectator'

  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [localOrder, setLocalOrder] = useState(SLOT_KEYS)
  const [dragFromIdx, setDragFromIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  // Refs used inside native event listeners to avoid stale closures
  const listRef = useRef(null)
  const touchDrag = useRef(null)    // { fromIdx, toIdx } — active touch drag state
  const localOrderRef = useRef(SLOT_KEYS)
  const canDragRef = useRef(false)

  useEffect(() => {
    if (room?.status === 'playing') navigate(`/room/${code}/game`)
  }, [room?.status, code, navigate])

  // Sync display order from Firebase (skip while host is actively dragging)
  useEffect(() => {
    if (dragFromIdx !== null) return
    const order = room?.displayOrder
    if (Array.isArray(order) && order.length === 4) {
      setLocalOrder(order)
      localOrderRef.current = order
    }
  }, [JSON.stringify(room?.displayOrder)]) // eslint-disable-line

  // Keep localOrderRef in sync with state (for use inside touch handlers)
  useEffect(() => { localOrderRef.current = localOrder }, [localOrder])

  // Register touch drag listeners with passive:false so we can preventDefault on the handle
  useEffect(() => {
    const el = listRef.current
    if (!el) return

    const onTouchStart = (e) => {
      if (!canDragRef.current) return
      const handle = e.target.closest('[data-drag-handle]')
      if (!handle) return
      const card = handle.closest('[data-slot-idx]')
      const idx = parseInt(card?.getAttribute('data-slot-idx') ?? '-1')
      if (idx < 0) return
      e.preventDefault() // stop page scroll for this gesture
      touchDrag.current = { fromIdx: idx, toIdx: idx }
      setDragFromIdx(idx)
      setDragOverIdx(idx)
    }

    const onTouchMove = (e) => {
      if (!touchDrag.current) return
      e.preventDefault()
      const touch = e.touches[0]
      const items = el.querySelectorAll('[data-slot-idx]')
      items.forEach(item => {
        const rect = item.getBoundingClientRect()
        const idx = parseInt(item.getAttribute('data-slot-idx'))
        if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          touchDrag.current.toIdx = idx
          setDragOverIdx(idx)
        }
      })
    }

    const onTouchEnd = () => {
      if (touchDrag.current) {
        const { fromIdx, toIdx } = touchDrag.current
        if (fromIdx !== toIdx) {
          const newOrder = [...localOrderRef.current]
          const [item] = newOrder.splice(fromIdx, 1)
          newOrder.splice(toIdx, 0, item)
          setLocalOrder(newOrder)
          localOrderRef.current = newOrder
          updatePlayerOrder(code, newOrder).catch(console.error)
        }
      }
      touchDrag.current = null
      setDragFromIdx(null)
      setDragOverIdx(null)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [code]) // code is stable; all mutable values accessed via refs

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

  const claimedCount = SLOT_KEYS.filter(k => players[k]?.claimed === true).length
  const allFourJoined = claimedCount >= 4
  const canStart = allFourJoined
  const needMore = 4 - claimedCount
  const canDrag = isCreator && allFourJoined

  // Update ref so touch handlers pick up the latest value without re-registration
  canDragRef.current = canDrag

  // HTML5 DnD handlers (desktop)
  const handleDragStart = (e, idx) => {
    if (!canDrag) { e.preventDefault(); return }
    setDragFromIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, idx) => {
    if (!canDrag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }
  const handleDrop = (e, idx) => {
    e.preventDefault()
    if (dragFromIdx !== null && dragFromIdx !== idx) {
      const newOrder = [...localOrder]
      const [item] = newOrder.splice(dragFromIdx, 1)
      newOrder.splice(idx, 0, item)
      setLocalOrder(newOrder)
      localOrderRef.current = newOrder
      updatePlayerOrder(code, newOrder).catch(console.error)
    }
    setDragFromIdx(null)
    setDragOverIdx(null)
  }
  const handleDragEnd = () => {
    setDragFromIdx(null)
    setDragOverIdx(null)
  }

  const doStart = async () => {
    // Always write current order to Firebase before start so scoresheet uses it
    await updatePlayerOrder(code, localOrder)
    await startGame(code, claimedCount)
  }

  const handleLeaveConfirm = async () => {
    if (isSpectator) {
      sessionStorage.removeItem('joker_room')
      sessionStorage.removeItem('joker_slot')
      navigate('/')
      return
    }
    if (isCreator) await cancelRoom(code)
    else await leaveRoom(code, mySlot)
    sessionStorage.removeItem('joker_room')
    sessionStorage.removeItem('joker_slot')
    navigate('/')
  }

  const teamColor = (pos) => (pos === 0 || pos === 2) ? TEAM_A : TEAM_B
  const teamBg = (pos) => (pos === 0 || pos === 2) ? 'rgba(124,58,237,0.12)' : 'rgba(13,148,136,0.12)'

  return (
    <div style={{ minHeight: '100vh', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <button
          onClick={() => setShowLeaveModal(true)}
          style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 15, padding: 0, fontFamily: 'Outfit, sans-serif' }}
        >
          ← {t('back')}
        </button>
        <LanguageToggle />
      </div>

      {/* Room code */}
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

      {/* Drag hint — only shown to host when all 4 have joined */}
      {canDrag && (
        <p style={{
          fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center',
          marginBottom: 10, lineHeight: 1.5, padding: '0 8px',
        }}>
          {t('drag_order_hint')}
        </p>
      )}

      {/* Player slot list */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 20, border: '1px solid var(--border)' }}>
        <p style={{
          fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13,
          marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px',
        }}>
          {t('waiting_players')} ({claimedCount}/4)
        </p>

        <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {localOrder.map((pk, i) => {
            const p = players[pk]
            const claimed = p?.claimed === true
            const isDragging = dragFromIdx === i
            const isOver = dragOverIdx === i && dragFromIdx !== null && dragFromIdx !== i

            return (
              <div
                key={pk}
                data-slot-idx={i}
                draggable={canDrag}
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px',
                  background: 'var(--surface-light)',
                  borderRadius: 12,
                  border: `1.5px solid ${isOver ? 'var(--blue)' : claimed ? 'rgba(37,99,235,0.2)' : 'var(--border)'}`,
                  opacity: isDragging ? 0.35 : 1,
                  boxShadow: isOver ? '0 0 0 3px rgba(37,99,235,0.2)' : 'none',
                  transition: isDragging ? 'none' : 'border-color 120ms, box-shadow 120ms, opacity 80ms',
                  cursor: canDrag ? 'grab' : 'default',
                  userSelect: 'none', WebkitUserSelect: 'none',
                }}
              >
                {/* Position number */}
                <span style={{
                  width: 20, textAlign: 'center', flexShrink: 0,
                  fontSize: 13, fontWeight: 800, lineHeight: 1,
                  color: isCouples && allFourJoined ? teamColor(i) : 'var(--text-secondary)',
                  fontFamily: 'Outfit, sans-serif',
                }}>
                  {i + 1}
                </span>

                {/* Drag handle — visible only to host when ready */}
                {canDrag && (
                  <span
                    data-drag-handle
                    style={{
                      flexShrink: 0, fontSize: 20, lineHeight: 1,
                      color: 'var(--text-secondary)', opacity: 0.45,
                      cursor: 'grab', paddingRight: 2,
                    }}
                  >
                    ≡
                  </span>
                )}

                {/* Avatar circle */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: claimed
                    ? (isCouples && allFourJoined ? teamColor(i) : 'var(--blue)')
                    : 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15,
                  color: claimed ? '#fff' : 'var(--border)',
                  border: claimed ? 'none' : '2px dashed var(--border)',
                }}>
                  {claimed ? (p.name?.[0] || '?').toUpperCase() : '—'}
                </div>

                {/* Name + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontWeight: claimed ? 600 : 400, fontSize: 15,
                    fontFamily: 'Outfit, sans-serif',
                    color: claimed ? 'var(--text-primary)' : 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3,
                  }}>
                    {claimed ? p.name : t('player_waiting')}
                  </p>
                  {claimed && (
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1 }}>
                      {t('player_joined')}{p.isCreator ? ' · Host' : ''}
                    </p>
                  )}
                </div>

                {/* Team badge — couples mode + all joined */}
                {isCouples && allFourJoined && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: teamColor(i),
                    background: teamBg(i),
                    padding: '3px 8px', borderRadius: 6,
                    fontFamily: 'Outfit, sans-serif', flexShrink: 0,
                  }}>
                    {(i === 0 || i === 2) ? t('team_a') : t('team_b')}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Couples team pairing summary — updates live as host reorders */}
      {isCouples && allFourJoined && (
        <div style={{
          background: 'var(--surface)', borderRadius: 12,
          padding: '14px 18px', marginBottom: 20, border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {[
            { color: TEAM_A, label: t('team_a'), a: localOrder[0], b: localOrder[2] },
            { color: TEAM_B, label: t('team_b'), a: localOrder[1], b: localOrder[3] },
          ].map(({ color, label, a, b }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                <strong style={{ color }}>{label}:</strong>
                {' '}{players[a]?.name || '?'} & {players[b]?.name || '?'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Start button / waiting message */}
      {isCreator ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!canStart && (
            <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
              {t('waiting_need_players', { n: needMore })}
            </p>
          )}
          <button
            onClick={doStart}
            disabled={!canStart}
            style={{
              width: '100%', height: 54, background: 'var(--blue)', color: '#fff',
              borderRadius: 'var(--radius-btn)', fontSize: 17,
              fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              opacity: canStart ? 1 : 0.4,
              cursor: canStart ? 'pointer' : 'not-allowed',
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
