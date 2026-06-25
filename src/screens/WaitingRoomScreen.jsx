import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DndContext, closestCenter,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRoom } from '../hooks/useRoom'
import { startGame, cancelRoom, leaveRoom, updatePlayerOrder } from '../firebase/roomService'
import ConfirmModal from '../components/ConfirmModal'
import LanguageToggle from '../components/LanguageToggle'

const SLOT_KEYS = ['p1', 'p2', 'p3', 'p4']
const TEAM_A = '#7C3AED'
const TEAM_B = '#0D9488'

function teamColor(pos) { return (pos === 0 || pos === 2) ? TEAM_A : TEAM_B }
function teamBg(pos) { return (pos === 0 || pos === 2) ? 'rgba(124,58,237,0.12)' : 'rgba(13,148,136,0.12)' }

function SortablePlayerCard({ slot, idx, player, claimed, canDrag, isCouples, allFourJoined, t }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot,
    disabled: !canDrag,
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        zIndex: isDragging ? 99 : 'auto',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 14px',
        background: 'var(--surface-light)',
        borderRadius: 12,
        border: `1.5px solid ${claimed ? 'rgba(37,99,235,0.2)' : 'var(--border)'}`,
        userSelect: 'none', WebkitUserSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      {/* Position number */}
      <span style={{
        width: 20, textAlign: 'center', flexShrink: 0,
        fontSize: 13, fontWeight: 800, lineHeight: 1,
        color: isCouples && allFourJoined ? teamColor(idx) : 'var(--text-secondary)',
        fontFamily: 'Outfit, sans-serif',
      }}>
        {idx + 1}
      </span>

      {/* Drag handle — listeners spread here only, so touch scrolls rest of card normally */}
      {canDrag && (
        <span
          {...listeners}
          style={{
            flexShrink: 0, fontSize: 20, lineHeight: 1,
            color: 'var(--text-secondary)', opacity: 0.5,
            cursor: isDragging ? 'grabbing' : 'grab',
            paddingRight: 2, touchAction: 'none',
          }}
        >
          ≡
        </span>
      )}

      {/* Name + status (no avatar circle) */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontWeight: claimed ? 600 : 400, fontSize: 15,
          fontFamily: 'Outfit, sans-serif',
          color: claimed ? 'var(--text-primary)' : 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3,
        }}>
          {claimed ? player?.name : t('player_waiting')}
        </p>
        {claimed && (
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1 }}>
            {t('player_joined')}{player?.isCreator ? ' · Host' : ''}
          </p>
        )}
      </div>

      {/* Team badge */}
      {isCouples && allFourJoined && (
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: teamColor(idx), background: teamBg(idx),
          padding: '3px 8px', borderRadius: 6,
          fontFamily: 'Outfit, sans-serif', flexShrink: 0,
        }}>
          {(idx === 0 || idx === 2) ? t('team_a') : t('team_b')}
        </span>
      )}
    </div>
  )
}

export default function WaitingRoomScreen() {
  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const mySlot = sessionStorage.getItem('joker_slot') || ''
  const isSpectator = mySlot === 'spectator'

  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [localOrder, setLocalOrder] = useState(SLOT_KEYS)
  const [dragging, setDragging] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  useEffect(() => {
    if (room?.status === 'playing') navigate(`/room/${code}/game`)
  }, [room?.status, code, navigate])

  // Sync display order from Firebase (skip during active drag to avoid jitter)
  useEffect(() => {
    if (dragging) return
    const order = room?.displayOrder
    if (Array.isArray(order) && order.length === 4) setLocalOrder(order)
  }, [JSON.stringify(room?.displayOrder), dragging]) // eslint-disable-line

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

  const handleDragEnd = ({ active, over }) => {
    setDragging(false)
    if (!over || active.id === over.id) return
    const oldIdx = localOrder.indexOf(active.id)
    const newIdx = localOrder.indexOf(over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const newOrder = arrayMove(localOrder, oldIdx, newIdx)
    setLocalOrder(newOrder)
    updatePlayerOrder(code, newOrder).catch(console.error)
  }

  const doStart = async () => {
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

  return (
    <div style={{ minHeight: '100vh', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <button onClick={() => setShowLeaveModal(true)} style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 15, padding: 0, fontFamily: 'Outfit, sans-serif' }}>
          ← {t('back')}
        </button>
        <LanguageToggle />
      </div>

      {/* Room code */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{t('room_code')}</p>
        <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 56, letterSpacing: '14px', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>
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
            <span key={label} style={{ background: 'var(--surface-light)', borderRadius: 'var(--radius-badge)', padding: '4px 10px', fontSize: 12, color: 'var(--text-secondary)', border: '1px solid var(--border)', fontFamily: 'Outfit, sans-serif' }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Drag hint — visible to host once all 4 have joined (both modes) */}
      {canDrag && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 10, lineHeight: 1.5, padding: '0 8px' }}>
          {t('drag_order_hint')}
        </p>
      )}

      {/* Player list with sortable drag */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 20, border: '1px solid var(--border)' }}>
        <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          {t('waiting_players')} ({claimedCount}/4)
        </p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => setDragging(true)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragging(false)}
        >
          <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {localOrder.map((pk, i) => (
                <SortablePlayerCard
                  key={pk}
                  slot={pk}
                  idx={i}
                  player={players[pk]}
                  claimed={players[pk]?.claimed === true}
                  canDrag={canDrag}
                  isCouples={isCouples}
                  allFourJoined={allFourJoined}
                  t={t}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Couples team pairing — live as host reorders */}
      {isCouples && allFourJoined && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { color: TEAM_A, label: t('team_a'), a: localOrder[0], b: localOrder[2] },
            { color: TEAM_B, label: t('team_b'), a: localOrder[1], b: localOrder[3] },
          ].map(({ color, label, a, b }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                <strong style={{ color }}>{label}:</strong>{' '}
                {players[a]?.name || '?'} & {players[b]?.name || '?'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Start button / waiting */}
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
            style={{ width: '100%', height: 54, background: 'var(--blue)', color: '#fff', borderRadius: 'var(--radius-btn)', fontSize: 17, fontFamily: 'Outfit, sans-serif', fontWeight: 700, opacity: canStart ? 1 : 0.4, cursor: canStart ? 'pointer' : 'not-allowed' }}
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
