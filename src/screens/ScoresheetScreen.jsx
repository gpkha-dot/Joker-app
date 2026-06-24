import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRoom } from '../hooks/useRoom'
import { useOrientation } from '../hooks/useOrientation'
import { updateHand, updateCurrentHand, updateRoomStatus } from '../firebase/roomService'
import {
  buildHandSequence, getSetBoundaries, getSetForHand,
  calcPoints, isExactBid, isHistPenalty, isForbiddenBid, calcSetBonus,
} from '../utils/scoring'
import RotatePrompt from '../components/RotatePrompt'
import CustomKeyboard from '../components/CustomKeyboard'
import SetSummaryCard from '../components/SetSummaryCard'
import ConfirmModal from '../components/ConfirmModal'

const PLAYER_KEYS = ['p1', 'p2', 'p3', 'p4']
const isMobileWidth = () => window.innerWidth <= 1024

export default function ScoresheetScreen() {
  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const isLandscape = useOrientation()
  const mySlot = sessionStorage.getItem('joker_slot') || 'p1'
  const activeCellInputRef = useRef(null)

  const [activeCell, setActiveCell] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [forbiddenWarn, setForbiddenWarn] = useState(false)
  const [setBonus, setSetBonus] = useState(null)
  const [lastCompletedSet, setLastCompletedSet] = useState(-1)
  const [showLeaveModal, setShowLeaveModal] = useState(false)

  // Safe derived values — always computed, even when room is null
  const settings = room?.settings ?? {}
  const hands = room?.hands ?? {}
  const players = room?.players ?? {}
  const gameMode = settings.gameMode ?? 'classic'
  const playerMode = settings.playerMode ?? 'individual'
  const histType = settings.histType ?? 'custom'
  const histValue = settings.histValue ?? 500
  const inputMode = settings.inputMode ?? 'single'
  const handSeq = useMemo(() => buildHandSequence(gameMode), [gameMode])
  const setBounds = useMemo(() => getSetBoundaries(gameMode), [gameMode])
  const playerNames = PLAYER_KEYS.map(k => players[k]?.name || k)
  const isCouples = playerMode === 'couples'
  const isCreator = mySlot === 'p1'
  const canEdit = inputMode === 'single' ? isCreator : true
  const mobile = isMobileWidth()
  const showRotate = mobile && !isLandscape

  const handPoints = useMemo(() =>
    handSeq.map((cards, hi) => {
      const h = hands[hi] ?? {}
      return PLAYER_KEYS.map(pk => {
        const bid = h?.bids?.[pk]
        const result = h?.results?.[pk]
        if (bid == null || result == null) return null
        return calcPoints(bid, result, cards, histType, histValue)
      })
    }),
    [hands, handSeq, histType, histValue]
  )

  const grandTotals = useMemo(() =>
    PLAYER_KEYS.map((_, pi) => handPoints.reduce((s, row) => s + (row[pi] ?? 0), 0)),
    [handPoints]
  )

  // Auto-focus input on desktop when active cell changes
  useEffect(() => {
    if (!mobile && activeCell && activeCellInputRef.current) {
      activeCellInputRef.current.focus()
      activeCellInputRef.current.select()
    }
  }, [activeCell, mobile])

  // Set completion detection
  useEffect(() => {
    if (!room) return
    setBounds.forEach((b, si) => {
      if (si <= lastCompletedSet) return
      const allDone = Array.from({ length: b.end - b.start + 1 }, (_, i) => {
        const h = hands[b.start + i] ?? {}
        return PLAYER_KEYS.every(pk => h?.bids?.[pk] != null && h?.results?.[pk] != null)
      }).every(Boolean)
      if (!allDone) return
      setLastCompletedSet(si)
      const handsInSet = Array.from({ length: b.end - b.start + 1 }, (_, i) => hands[b.start + i] ?? {})
      const bonus = calcSetBonus(handsInSet, 4, playerMode)
      if (bonus) setSetBonus({ ...bonus, setIndex: si })
      if (si === setBounds.length - 1) {
        setTimeout(async () => {
          await updateRoomStatus(code, 'finished')
          navigate(`/room/${code}/results`)
        }, 2000)
      }
    })
  }, [hands]) // eslint-disable-line react-hooks/exhaustive-deps

  const advanceCell = useCallback((hi, type, pi) => {
    if (type === 'bid') {
      const h = hands[hi] ?? {}
      for (let i = 1; i <= 4; i++) {
        const next = (pi + i) % 4
        if (h?.bids?.[PLAYER_KEYS[next]] == null) {
          setActiveCell({ hand: hi, type: 'bid', player: next })
          return
        }
      }
      setActiveCell({ hand: hi, type: 'result', player: 0 })
    } else {
      if (pi + 1 < 4) {
        setActiveCell({ hand: hi, type: 'result', player: pi + 1 })
      } else {
        const nextHi = hi + 1
        if (nextHi < handSeq.length) {
          setActiveCell({ hand: nextHi, type: 'bid', player: 0 })
          updateCurrentHand(code, nextHi)
        } else {
          setActiveCell(null)
        }
      }
    }
  }, [hands, handSeq, code])

  const confirmCell = useCallback(async () => {
    if (!activeCell || inputVal === '') return
    const num = parseInt(inputVal)
    if (isNaN(num)) { setActiveCell(null); setInputVal(''); return }
    const { hand: hi, type, player: pi } = activeCell
    const pk = PLAYER_KEYS[pi]
    const h = hands[hi] ?? {}
    if (type === 'bid') {
      const bids = PLAYER_KEYS.map((k, i) => i === pi ? num : (h?.bids?.[k] ?? null))
      if (bids.every(b => b != null) && isForbiddenBid(bids, pi, handSeq[hi])) {
        setForbiddenWarn(true)
        return
      }
      await updateHand(code, hi, { [`bids/${pk}`]: num })
    } else {
      const bid = h?.bids?.[pk] ?? 0
      const pts = calcPoints(bid, num, handSeq[hi], histType, histValue)
      await updateHand(code, hi, { [`results/${pk}`]: num, [`points/${pk}`]: pts })
    }
    advanceCell(hi, type, pi)
    setInputVal('')
    setForbiddenWarn(false)
  }, [activeCell, inputVal, hands, handSeq, histType, histValue, code, advanceCell])

  const handleKey = useCallback((k) => {
    if (!activeCell) return
    if (k === '←') { setInputVal(v => v.slice(0, -1)); setForbiddenWarn(false); return }
    if (k === '✓') { confirmCell(); return }
    const next = inputVal + k
    const num = parseInt(next)
    if (!isNaN(num) && num <= handSeq[activeCell.hand]) {
      setInputVal(next)
      if (activeCell.type === 'bid') {
        const h = hands[activeCell.hand] ?? {}
        const bids = PLAYER_KEYS.map((pk, i) => i === activeCell.player ? num : (h?.bids?.[pk] ?? null))
        setForbiddenWarn(bids.every(b => b != null) && isForbiddenBid(bids, activeCell.player, handSeq[activeCell.hand]))
      }
    }
  }, [activeCell, inputVal, confirmCell, hands, handSeq])

  const handleCellTap = useCallback((hi, type, pi) => {
    if (!canEdit) return
    if (inputMode === 'each' && PLAYER_KEYS[pi] !== mySlot) return
    const pk = PLAYER_KEYS[pi]
    const h = hands[hi] ?? {}
    // Can only enter result after bid is entered
    if (type === 'result' && h?.bids?.[pk] == null) return
    const existing = type === 'bid' ? h?.bids?.[pk] : h?.results?.[pk]
    setActiveCell({ hand: hi, type, player: pi })
    setInputVal(existing != null ? String(existing) : '')
    setForbiddenWarn(false)
  }, [canEdit, inputMode, mySlot, hands])

  const handleDesktopChange = useCallback((val) => {
    if (!activeCell) return
    const cleaned = val.replace(/\D/g, '').slice(0, 2)
    const n = parseInt(cleaned)
    const maxV = handSeq[activeCell.hand]
    if (cleaned === '' || (!isNaN(n) && n <= maxV)) {
      setInputVal(cleaned)
      if (activeCell.type === 'bid' && cleaned !== '') {
        const h = hands[activeCell.hand] ?? {}
        const bids = PLAYER_KEYS.map((pk, i) => i === activeCell.player ? n : (h?.bids?.[pk] ?? null))
        setForbiddenWarn(bids.every(b => b != null) && isForbiddenBid(bids, activeCell.player, maxV))
      } else {
        setForbiddenWarn(false)
      }
    }
  }, [activeCell, handSeq, hands])

  const handleDesktopKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmCell() }
    if (e.key === 'Escape') { setActiveCell(null); setInputVal(''); setForbiddenWarn(false) }
  }, [confirmCell])

  // ── Conditional returns AFTER all hooks ──
  if (!room) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-secondary)' }}>…</p>
      </div>
    )
  }

  if (showRotate) return <RotatePrompt />

  // ── Helpers ──
  const getPointColor = (bid, result, pts) => {
    if (pts == null) return 'var(--text-secondary)'
    if (bid != null && result != null && isExactBid(bid, result)) return 'var(--blue)'
    if (bid != null && result != null && isHistPenalty(bid, result)) return 'var(--orange)'
    if (pts < 0) return 'var(--orange)'
    return 'var(--text-primary)'
  }

  // Column header tint for couples mode
  const colHeaderBg = (pi) => {
    if (!isCouples) return 'transparent'
    return (pi === 0 || pi === 2) ? 'rgba(37,99,235,0.07)' : 'rgba(212,80,10,0.07)'
  }
  const avatarBg = (pi) => {
    if (!isCouples) return 'var(--surface-light)'
    return (pi === 0 || pi === 2) ? 'var(--blue)' : 'var(--orange)'
  }

  const renderTable = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: 36 }} />
        <col style={{ width: 36 }} />
        {PLAYER_KEYS.map((_, i) => <col key={i} />)}
      </colgroup>
      <thead>
        <tr style={{ background: 'var(--surface)' }}>
          <th style={TH}>#</th>
          <th style={TH}>🃏</th>
          {PLAYER_KEYS.map((pk, pi) => {
            const name = playerNames[pi]
            return (
              <th key={pk} style={{ ...TH, background: colHeaderBg(pi), padding: '14px 6px 10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: mobile ? 28 : 34, height: mobile ? 28 : 34,
                    borderRadius: '50%', background: avatarBg(pi),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: mobile ? 11 : 13, fontWeight: 700, color: '#fff',
                    flexShrink: 0,
                  }}>
                    {(name[0] || '?').toUpperCase()}
                  </div>
                  <span style={{
                    fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                    fontSize: mobile ? 11 : 13, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: '100%', display: 'block',
                  }}>
                    {name}
                  </span>
                </div>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {handSeq.map((cards, hi) => {
          const setIdx = getSetForHand(hi, gameMode)
          const isSetStart = setBounds[setIdx]?.start === hi
          const isSetEnd = setBounds[setIdx]?.end === hi
          const isEven = hi % 2 === 0
          const h = hands[hi] ?? {}

          return (
            <Fragment key={hi}>
              {/* Set divider */}
              {isSetStart && (
                <tr style={{ background: 'var(--surface-deep)' }}>
                  <td colSpan={6} style={{
                    padding: '6px 12px',
                    fontSize: 11, fontWeight: 700,
                    color: 'var(--blue)',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    fontFamily: 'Outfit, sans-serif',
                    borderTop: hi > 0 ? '2px solid var(--blue)' : 'none',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {t('set')} {setIdx + 1}
                  </td>
                </tr>
              )}

              {/* Data row */}
              <tr
                style={{ background: isEven ? 'var(--surface)' : 'var(--surface-alt)' }}
                onMouseEnter={e => !mobile && (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => !mobile && (e.currentTarget.style.background = isEven ? 'var(--surface)' : 'var(--surface-alt)')}
              >
                <td style={NUM_CELL}>{hi + 1}</td>
                <td style={NUM_CELL}>{cards}</td>
                {PLAYER_KEYS.map((pk, pi) => {
                  const bid = h?.bids?.[pk]
                  const result = h?.results?.[pk]
                  const pts = handPoints[hi]?.[pi]
                  const isBidActive = activeCell?.hand === hi && activeCell?.type === 'bid' && activeCell?.player === pi
                  const isResActive = activeCell?.hand === hi && activeCell?.type === 'result' && activeCell?.player === pi

                  return (
                    <td key={pk} style={{ borderLeft: '1px solid var(--border)', padding: 0, height: ROW_H }}>
                      <div style={{ display: 'flex', height: '100%' }}>
                        {/* Bid sub-cell */}
                        <div
                          onClick={() => handleCellTap(hi, 'bid', pi)}
                          style={{
                            width: mobile ? 32 : 44,
                            borderRight: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: mobile ? 12 : 13,
                            color: isBidActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                            cursor: canEdit ? 'pointer' : 'default',
                            background: isBidActive ? 'rgba(37,99,235,0.12)' : 'transparent',
                            boxShadow: isBidActive ? 'inset 0 0 0 2px var(--blue)' : 'none',
                            transition: 'all var(--transition)',
                            fontVariantNumeric: 'tabular-nums',
                            fontFamily: 'Inter, sans-serif',
                            flexShrink: 0,
                            userSelect: 'none',
                          }}
                        >
                          {isBidActive && !mobile ? (
                            <input
                              ref={activeCellInputRef}
                              key={`bid-${hi}-${pi}`}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={inputVal}
                              onChange={e => handleDesktopChange(e.target.value)}
                              onKeyDown={handleDesktopKeyDown}
                              style={{
                                width: '100%', height: '100%', background: 'none', border: 'none',
                                color: 'var(--text-primary)', fontSize: 13, textAlign: 'center',
                                fontFamily: 'Inter, sans-serif', fontVariantNumeric: 'tabular-nums',
                                outline: 'none', padding: 0,
                              }}
                            />
                          ) : (
                            isBidActive ? (inputVal !== '' ? inputVal : (bid != null ? bid : '·'))
                                        : (bid != null ? bid : '')
                          )}
                        </div>

                        {/* Points sub-cell */}
                        <div
                          onClick={() => handleCellTap(hi, 'result', pi)}
                          style={{
                            flex: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: mobile ? 12 : 14,
                            fontWeight: pts != null ? 600 : 400,
                            color: isResActive ? 'var(--text-primary)' : getPointColor(bid, result, pts),
                            cursor: bid != null && canEdit ? 'pointer' : 'default',
                            background: isResActive ? 'rgba(37,99,235,0.12)' : 'transparent',
                            boxShadow: isResActive ? 'inset 0 0 0 2px var(--blue)' : 'none',
                            transition: 'all var(--transition)',
                            fontVariantNumeric: 'tabular-nums',
                            fontFamily: 'Inter, sans-serif',
                            userSelect: 'none',
                          }}
                        >
                          {isResActive && !mobile ? (
                            <input
                              ref={activeCellInputRef}
                              key={`res-${hi}-${pi}`}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={inputVal}
                              onChange={e => handleDesktopChange(e.target.value)}
                              onKeyDown={handleDesktopKeyDown}
                              style={{
                                width: '100%', height: '100%', background: 'none', border: 'none',
                                color: 'var(--text-primary)', fontSize: 14, textAlign: 'center',
                                fontFamily: 'Inter, sans-serif', fontVariantNumeric: 'tabular-nums',
                                outline: 'none', padding: 0, fontWeight: 600,
                              }}
                            />
                          ) : (
                            isResActive ? (inputVal !== '' ? inputVal : (pts != null ? pts : '·'))
                                        : (pts != null ? pts : '')
                          )}
                        </div>
                      </div>
                    </td>
                  )
                })}
              </tr>

              {/* Set total row */}
              {isSetEnd && (() => {
                const b = setBounds[setIdx]
                const setTotals = PLAYER_KEYS.map((_, pi) =>
                  handPoints.slice(b.start, b.end + 1).reduce((s, row) => s + (row[pi] ?? 0), 0)
                )
                return (
                  <tr style={{ background: 'var(--surface-total)', borderTop: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border-strong)' }}>
                    <td colSpan={2} style={{
                      padding: '8px 10px', fontSize: 11, fontWeight: 700,
                      color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                      Σ {setIdx + 1}
                    </td>
                    {PLAYER_KEYS.map((_, pi) => (
                      <td key={pi} style={{
                        textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                        fontSize: 14, color: 'var(--blue)',
                        borderLeft: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums',
                      }}>
                        {(setTotals[pi] / 100).toFixed(1)}
                      </td>
                    ))}
                  </tr>
                )
              })()}
            </Fragment>
          )
        })}

        {/* Grand total */}
        <tr style={{ background: 'var(--surface-deep)', borderTop: '2px solid var(--border-strong)', position: 'sticky', bottom: 0, zIndex: 1 }}>
          <td colSpan={2} style={{
            padding: '12px 10px', fontSize: 12, fontWeight: 700,
            color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif',
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            {t('total')}
          </td>
          {grandTotals.map((tot, pi) => (
            <td key={pi} style={{
              textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              fontSize: mobile ? 15 : 18, color: 'var(--text-primary)',
              borderLeft: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums',
            }}>
              {(tot / 100).toFixed(1)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )

  // ── Layout ──

  // Top bar (shared between mobile and desktop)
  const topBar = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: mobile ? '8px 12px' : '10px 24px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <button
        onClick={() => setShowLeaveModal(true)}
        style={{
          background: 'none', color: 'var(--text-secondary)', fontSize: 14,
          fontFamily: 'Outfit, sans-serif', padding: '6px 0',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        ←
      </button>
      <span style={{
        fontFamily: 'Outfit, sans-serif', fontWeight: 700,
        fontSize: 14, color: 'var(--blue)', letterSpacing: '3px',
        fontVariantNumeric: 'tabular-nums', marginRight: 4,
      }}>
        {code}
      </span>
      <span style={{
        background: 'rgba(37,99,235,0.15)', color: 'var(--blue)',
        borderRadius: 6, padding: '2px 8px', fontSize: 11,
        fontFamily: 'Outfit, sans-serif', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        {gameMode === 'classic' ? t('mode_classic') : t('mode_9cards')}
      </span>
      {forbiddenWarn && (
        <span style={{
          marginLeft: 'auto', fontSize: 12, color: 'var(--orange)',
          fontWeight: 600, background: 'rgba(212,80,10,0.12)',
          padding: '3px 10px', borderRadius: 6,
        }}>
          ⚠ {t('forbidden_bid')}
        </span>
      )}
    </div>
  )

  if (mobile) {
    // Mobile landscape: fixed height, table 75% + keyboard 25%
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        {topBar}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: '0 0 75%', overflowY: 'auto', overflowX: 'hidden' }}>
            {renderTable()}
          </div>
          <div style={{ flex: '0 0 25%', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <CustomKeyboard
              onKey={handleKey}
              value={inputVal}
              maxVal={activeCell ? handSeq[activeCell.hand] : undefined}
            />
          </div>
        </div>
        {setBonus && <SetSummaryCard bonus={setBonus} playerNames={playerNames} onClose={() => setSetBonus(null)} />}
        {showLeaveModal && (
          <ConfirmModal
            title={t('leave_game_title')}
            message={t('leave_game_message')}
            confirmLabel={t('leave_game_btn')}
            destructive
            onConfirm={() => navigate('/')}
            onCancel={() => setShowLeaveModal(false)}
          />
        )}
      </div>
    )
  }

  // Desktop: scrollable page, centered card max-width 900px
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Sticky top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, maxWidth: '100%' }}>
        {topBar}
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px 80px' }}>
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-card)',
          padding: 0,
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          {renderTable()}
        </div>
      </div>

      {setBonus && <SetSummaryCard bonus={setBonus} playerNames={playerNames} onClose={() => setSetBonus(null)} />}
      {showLeaveModal && (
        <ConfirmModal
          title={t('leave_game_title')}
          message={t('leave_game_message')}
          confirmLabel={t('leave_game_btn')}
          destructive
          onConfirm={() => navigate('/')}
          onCancel={() => setShowLeaveModal(false)}
        />
      )}
    </div>
  )
}

// Shared table styles
const ROW_H = 52
const TH = {
  padding: '8px 4px',
  fontSize: 11,
  color: 'var(--text-secondary)',
  fontWeight: 600,
  borderBottom: '2px solid var(--border-strong)',
  fontFamily: 'Outfit, sans-serif',
  letterSpacing: '0.3px',
}
const NUM_CELL = {
  textAlign: 'center',
  fontSize: 12,
  color: 'var(--text-secondary)',
  height: ROW_H,
  fontVariantNumeric: 'tabular-nums',
  padding: '0 2px',
  fontFamily: 'Inter, sans-serif',
  borderLeft: '1px solid var(--border)',
}
