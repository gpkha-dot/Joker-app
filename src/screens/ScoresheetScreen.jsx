import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRoom } from '../hooks/useRoom'
import { useOrientation } from '../hooks/useOrientation'
import { updateHand, updateCurrentHand, updateRoomStatus } from '../firebase/roomService'
import {
  buildHandSequence, getSetBoundaries, getSetForHand,
  calcPoints, isHistPenalty, isForbiddenBid, calcSetBonus,
} from '../utils/scoring'
import RotatePrompt from '../components/RotatePrompt'
import CustomKeyboard from '../components/CustomKeyboard'
import SetSummaryCard from '../components/SetSummaryCard'
import ConfirmModal from '../components/ConfirmModal'

const PLAYER_KEYS = ['p1', 'p2', 'p3', 'p4']
const isMobileWidth = () => window.innerWidth <= 1024
const ROW_H = 52
// Team identity colors — distinct from score colors (blue=good, orange=bad)
const TEAM_A = '#7C3AED'   // purple — players 1 & 3
const TEAM_B = '#0D9488'   // teal   — players 2 & 4

export default function ScoresheetScreen() {
  // ── Hooks (ALL before any conditional return) ──────────────────────
  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const isLandscape = useOrientation()
  const mySlot = sessionStorage.getItem('joker_slot') || 'p1'
  const hiddenInputRef = useRef(null)

  const [activeCell, setActiveCell] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [forbiddenWarn, setForbiddenWarn] = useState(false)
  const [autoFillErr, setAutoFillErr] = useState(null)   // null | hand-index
  const [exceedsErr, setExceedsErr] = useState(null)     // null | hand-index
  const [setBonus, setSetBonus] = useState(null)
  const [lastCompletedSet, setLastCompletedSet] = useState(-1)
  const [showLeaveModal, setShowLeaveModal] = useState(false)

  const settings = room?.settings ?? {}
  const hands = room?.hands ?? {}
  const players = room?.players ?? {}
  const gameMode = settings.gameMode ?? 'classic'
  const playerMode = settings.playerMode ?? 'individual'
  const histType = settings.histType ?? 'custom'
  const histValue = settings.histValue ?? 200
  const histValueShort = settings.histValueShort ?? 200   // mix mode: short hands (1-8 cards)
  const histValueLong = settings.histValueLong ?? 500     // mix mode: long hands (9 cards)
  const inputMode = settings.inputMode ?? 'single'
  const handSeq = useMemo(() => buildHandSequence(gameMode), [gameMode])
  const setBounds = useMemo(() => getSetBoundaries(gameMode), [gameMode])
  const playerNames = PLAYER_KEYS.map(k => players[k]?.name || k)
  const isCouples = playerMode === 'couples'
  const isCreator = mySlot === 'p1'
  const canEdit = inputMode === 'single' ? isCreator : true
  const mobile = isMobileWidth()
  const showRotate = mobile && !isLandscape

  // Resolve effective hist type+value for a hand with `cards` cards in play.
  // 'mix' uses different amounts for short (1-8) vs long (9) hands.
  const resolveHist = (cards) => histType === 'mix'
    ? { ht: 'custom', hv: cards <= 8 ? histValueShort : histValueLong }
    : { ht: histType, hv: histValue }

  // Points per cell — null until BOTH bid AND result exist
  const handPoints = useMemo(() =>
    handSeq.map((cards, hi) => {
      const h = hands[hi] ?? {}
      const { ht, hv } = histType === 'mix'
        ? { ht: 'custom', hv: cards <= 8 ? histValueShort : histValueLong }
        : { ht: histType, hv: histValue }
      return PLAYER_KEYS.map(pk => {
        const bid = h?.bids?.[pk]
        const result = h?.results?.[pk]
        if (bid == null || result == null) return null
        return calcPoints(bid, result, cards, ht, hv)
      })
    }),
    [hands, handSeq, histType, histValue, histValueShort, histValueLong]
  )

  // Premium/penalty adjustments per completed set
  const setBonusData = useMemo(() =>
    setBounds.map(b => {
      const handsInSet = Array.from({ length: b.end - b.start + 1 }, (_, i) => hands[b.start + i] ?? {})
      const complete = handsInSet.every(h => PLAYER_KEYS.every(pk => h?.bids?.[pk] != null && h?.results?.[pk] != null))
      if (!complete) return null
      return calcSetBonus(handsInSet, 4, playerMode)
    }),
    [hands, setBounds, playerMode]
  )

  // Running totals — raw hand points plus Premium bonus/penalty adjustments
  const grandTotals = useMemo(() =>
    PLAYER_KEYS.map((_, pi) => {
      const raw = handPoints.reduce((s, row) => s + (row[pi] ?? 0), 0)
      const adj = setBonusData.reduce((s, bd) => bd ? s + (bd.bonuses[pi] ?? 0) - (bd.penalties[pi] ?? 0) : s, 0)
      return raw + adj
    }),
    [handPoints, setBonusData]
  )

  // Focus hidden input on desktop whenever active cell changes
  useEffect(() => {
    if (!mobile && activeCell) hiddenInputRef.current?.focus()
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
    const cards = handSeq[hi]

    if (type === 'bid') {
      const allBids = PLAYER_KEYS.map((k, i) => i === pi ? num : (h?.bids?.[k] ?? null))
      // All 4 bids filled and total equals cards — forbidden by the rules
      if (allBids.every(b => b != null) && isForbiddenBid(allBids, pi, cards)) {
        setForbiddenWarn(true)
        return   // block save; player must change their bid
      }
      await updateHand(code, hi, { [`bids/${pk}`]: num })
    } else {
      // Reject if adding this result would push the hand total above cards in play
      const existingSum = PLAYER_KEYS.reduce((s, k, i) => i !== pi ? s + (h?.results?.[k] ?? 0) : s, 0)
      if (existingSum + num > cards) {
        setExceedsErr(hi)
        return
      }
      const { ht, hv } = resolveHist(cards)
      const bid = h?.bids?.[pk] ?? 0
      const pts = calcPoints(bid, num, cards, ht, hv)
      await updateHand(code, hi, { [`results/${pk}`]: num, [`points/${pk}`]: pts })

      // Auto-fill the 4th player's result once 3 are entered
      // resultsNow reflects state AFTER saving this result (Firebase hasn't updated yet)
      const resultsNow = PLAYER_KEYS.map((k, i) => i === pi ? num : (h?.results?.[k] ?? null))
      const filledCnt = resultsNow.filter(r => r != null).length
      if (filledCnt === 3) {
        const missingPk = PLAYER_KEYS.find((_, i) => resultsNow[i] == null)
        const sum3 = resultsNow.reduce((s, r) => s + (r ?? 0), 0)
        const autoVal = cards - sum3
        if (autoVal >= 0 && autoVal <= cards) {
          const autoBid = h?.bids?.[missingPk] ?? 0
          const autoPts = calcPoints(autoBid, autoVal, cards, ht, hv)
          await updateHand(code, hi, {
            [`results/${missingPk}`]: autoVal,
            [`points/${missingPk}`]: autoPts,
            [`autoResult/${missingPk}`]: true,
          })
          // 4th result auto-filled — jump straight to next hand
          setInputVal('')
          setForbiddenWarn(false)
          setExceedsErr(null)
          const nextHi = hi + 1
          if (nextHi < handSeq.length) {
            setActiveCell({ hand: nextHi, type: 'bid', player: 0 })
            await updateCurrentHand(code, nextHi)
          } else {
            setActiveCell(null)
          }
          return
        } else {
          // Would be negative — data entry error; show inline message
          setAutoFillErr(hi)
        }
      }
    }

    advanceCell(hi, type, pi)
    setInputVal('')
    setForbiddenWarn(false)
    setExceedsErr(null)
  }, [activeCell, inputVal, hands, handSeq, histType, histValue, histValueShort, histValueLong, code, advanceCell])

  // Single-digit entry — always replaces (max cards = 9 so one digit is always enough)
  const appendDigit = useCallback((digit) => {
    if (!activeCell) return
    setAutoFillErr(null)
    setExceedsErr(null)
    const maxAllowed = handSeq[activeCell.hand]
    const n = parseInt(digit)
    if (isNaN(n) || n > maxAllowed) return
    setInputVal(digit)
    if (activeCell.type === 'bid') {
      const h = hands[activeCell.hand] ?? {}
      const allBids = PLAYER_KEYS.map((pk, i) => i === activeCell.player ? n : (h?.bids?.[pk] ?? null))
      setForbiddenWarn(allBids.every(b => b != null) && isForbiddenBid(allBids, activeCell.player, maxAllowed))
    } else {
      setForbiddenWarn(false)
    }
  }, [activeCell, handSeq, hands])

  const handleHiddenKeyDown = useCallback((e) => {
    if (!activeCell) return
    if (e.key >= '0' && e.key <= '9') { e.preventDefault(); appendDigit(e.key); return }
    if (e.key === 'Backspace') {
      e.preventDefault()
      setInputVal(v => v.slice(0, -1))
      setForbiddenWarn(false)
      setExceedsErr(null)
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); confirmCell(); return }
    if (e.key === 'Escape') {
      e.preventDefault()
      setActiveCell(null); setInputVal(''); setForbiddenWarn(false); setAutoFillErr(null); setExceedsErr(null)
    }
  }, [activeCell, appendDigit, confirmCell])

  const handleKey = useCallback((k) => {
    if (!activeCell) return
    if (k === '←') { setInputVal(v => v.slice(0, -1)); setForbiddenWarn(false); setExceedsErr(null); return }
    if (k === '✓') { confirmCell(); return }
    appendDigit(k)
  }, [activeCell, appendDigit, confirmCell])

  const handleCellTap = useCallback((hi, type, pi) => {
    if (!canEdit) return
    if (inputMode === 'each' && PLAYER_KEYS[pi] !== mySlot) return
    const pk = PLAYER_KEYS[pi]
    const h = hands[hi] ?? {}
    if (type === 'result' && h?.bids?.[pk] == null) return
    const existing = type === 'bid' ? h?.bids?.[pk] : h?.results?.[pk]
    setActiveCell({ hand: hi, type, player: pi })
    setInputVal(existing != null ? String(existing) : '')
    setForbiddenWarn(false)
    setAutoFillErr(null)
    setExceedsErr(null)
    if (!mobile) hiddenInputRef.current?.focus()
  }, [canEdit, inputMode, mySlot, hands, mobile])

  // ── Conditional returns (AFTER all hooks) ──────────────────────────
  if (!room) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-secondary)' }}>…</p>
      </div>
    )
  }
  if (showRotate) return <RotatePrompt />

  // ── Visual helpers ─────────────────────────────────────────────────

  // Blue = exact bid (bid === result > 0) OR pass success (bid=0, result=0)
  // Orange = wrong bid, hist penalty, pass-but-won-tricks
  const isBlueResult = (bid, result) => {
    if (bid == null || result == null) return false
    if (bid === 0) return result === 0
    return bid === result
  }
  const ptColor = (bid, result, pts) => {
    if (pts == null) return 'var(--text-secondary)'
    if (pts < 0) return 'var(--orange)'
    if (!isBlueResult(bid, result)) return 'var(--orange)'
    return 'var(--blue)'
  }

  // Column header background — only in header, never bleeds into score rows
  const colHeaderBg = (pi) => {
    if (!isCouples) return 'transparent'
    return (pi === 0 || pi === 2) ? 'rgba(124,58,237,0.08)' : 'rgba(13,148,136,0.08)'
  }
  // Avatar circle color
  const avatarColor = (pi) => {
    if (!isCouples) return 'var(--surface-light)'
    return (pi === 0 || pi === 2) ? TEAM_A : TEAM_B
  }

  // ── Table ──────────────────────────────────────────────────────────
  const NUM_COLS = 5   // Cards | P1 | P2 | P3 | P4

  const renderTable = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: mobile ? 32 : 42 }} />
        {PLAYER_KEYS.map((_, i) => <col key={i} />)}
      </colgroup>

      <thead>
        <tr style={{ background: 'var(--surface)' }}>
          <th style={TH}>🃏</th>
          {PLAYER_KEYS.map((pk, pi) => {
            const name = playerNames[pi]
            return (
              <th key={pk} style={{ ...TH, background: colHeaderBg(pi), padding: '14px 6px 10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: mobile ? 26 : 32, height: mobile ? 26 : 32, borderRadius: '50%',
                    background: avatarColor(pi),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: mobile ? 10 : 13, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>
                    {(name[0] || '?').toUpperCase()}
                  </div>
                  <span style={{
                    fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: mobile ? 10 : 13,
                    color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', maxWidth: '100%', display: 'block',
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
          const b = setBounds[setIdx]
          const isSetStart = b?.start === hi
          const isSetEnd = b?.end === hi
          const bonusData = setBonusData[setIdx]
          const handIdxInSet = hi - (b?.start ?? 0)
          const isEven = hi % 2 === 0
          const h = hands[hi] ?? {}
          const isBidRowActive = activeCell?.hand === hi && activeCell?.type === 'bid'
          const isResRowActive = activeCell?.hand === hi && activeCell?.type === 'result'

          return (
            <Fragment key={hi}>
              {isSetStart && (
                <tr style={{ background: 'var(--surface-deep)' }}>
                  <td colSpan={NUM_COLS} style={{
                    padding: '5px 12px', fontSize: 11, fontWeight: 700,
                    color: 'var(--blue)', letterSpacing: '1.2px', textTransform: 'uppercase',
                    fontFamily: 'Outfit, sans-serif',
                    borderTop: hi > 0 ? '2px solid var(--blue)' : 'none',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {t('set')} {setIdx + 1}
                  </td>
                </tr>
              )}

              <tr
                style={{ background: isEven ? 'var(--surface)' : 'var(--surface-alt)' }}
                onMouseEnter={e => { if (!mobile) e.currentTarget.style.background = '#333352' }}
                onMouseLeave={e => { if (!mobile) e.currentTarget.style.background = isEven ? 'var(--surface)' : 'var(--surface-alt)' }}
              >
                <td style={CARDS_CELL}>{cards}</td>

                {PLAYER_KEYS.map((pk, pi) => {
                  const bid = h?.bids?.[pk]
                  const result = h?.results?.[pk]
                  const pts = handPoints[hi]?.[pi]
                  const isAutoFilled = h?.autoResult?.[pk] === true
                  const isBidActive = isBidRowActive && activeCell?.player === pi
                  const isResActive = isResRowActive && activeCell?.player === pi
                  const bidForbidden = isBidActive && forbiddenWarn

                  const bidDisplay = isBidActive
                    ? (inputVal !== '' ? inputVal : (bid != null ? (bid === 0 ? '-' : String(bid)) : '·'))
                    : (bid != null ? (bid === 0 ? '-' : String(bid)) : '')

                  const ptsDisplay = isResActive
                    ? (inputVal !== '' ? inputVal : (pts != null ? String(pts) : '·'))
                    : (pts != null ? String(pts) : '')

                  const cellMark = !isResActive && pts != null && bonusData ? (
                    bonusData.perfect.includes(pi) && bonusData.highestHandIdxs?.[pi] === handIdxInSet ? 'bonus' :
                    !bonusData.perfect.includes(pi) && bonusData.penalties[pi] > 0 && bonusData.highestHandIdxs?.[pi] === handIdxInSet ? 'penalty' :
                    null
                  ) : null

                  return (
                    <td key={pk} style={{ borderLeft: '1px solid var(--border)', padding: 0 }}>
                      <div style={{ display: 'flex', height: ROW_H, alignItems: 'stretch' }}>

                        {/* Bid sub-cell — orange border when bid would be forbidden */}
                        <div
                          onClick={() => handleCellTap(hi, 'bid', pi)}
                          style={{
                            width: mobile ? 28 : 40, flexShrink: 0,
                            borderRight: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: mobile ? 11 : 13,
                            color: isBidActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                            cursor: canEdit ? 'pointer' : 'default',
                            background: isBidActive
                              ? (bidForbidden ? 'rgba(212,80,10,0.13)' : 'rgba(37,99,235,0.13)')
                              : 'transparent',
                            boxShadow: isBidActive
                              ? (bidForbidden ? 'inset 0 0 0 2px var(--orange)' : 'inset 0 0 0 2px var(--blue)')
                              : 'none',
                            transition: 'background var(--transition), box-shadow var(--transition)',
                            fontVariantNumeric: 'tabular-nums',
                            fontFamily: 'Inter, sans-serif',
                            userSelect: 'none', WebkitUserSelect: 'none',
                          }}
                        >
                          {bidDisplay}
                        </div>

                        {/* Points sub-cell — italic + muted when auto-filled; x2/strikethrough for Premium */}
                        <div
                          onClick={() => handleCellTap(hi, 'result', pi)}
                          style={{
                            flex: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: mobile ? 12 : 14,
                            fontWeight: pts != null || isResActive ? 600 : 400,
                            fontStyle: isAutoFilled && !isResActive ? 'italic' : 'normal',
                            opacity: cellMark === 'penalty' ? 0.55 : (isAutoFilled && !isResActive ? 0.6 : 1),
                            color: isResActive ? 'var(--text-primary)' : (cellMark === 'penalty' ? 'var(--text-secondary)' : ptColor(bid, result, pts)),
                            textDecoration: cellMark === 'penalty' ? 'line-through' : 'none',
                            cursor: bid != null && canEdit ? 'pointer' : 'default',
                            background: isResActive ? 'rgba(37,99,235,0.13)' : 'transparent',
                            boxShadow: isResActive ? 'inset 0 0 0 2px var(--blue)' : 'none',
                            transition: 'background var(--transition), box-shadow var(--transition)',
                            fontVariantNumeric: 'tabular-nums',
                            fontFamily: 'Inter, sans-serif',
                            userSelect: 'none', WebkitUserSelect: 'none',
                          }}
                        >
                          {cellMark === 'bonus' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <span>{ptsDisplay}</span>
                              <span style={{
                                fontSize: 8, fontWeight: 800, color: '#10b981',
                                background: 'rgba(16,185,129,0.18)', borderRadius: 3,
                                padding: '1px 3px', lineHeight: 1.2,
                              }}>×2</span>
                            </div>
                          ) : ptsDisplay}
                        </div>
                      </div>
                    </td>
                  )
                })}
              </tr>

              {/* Forbidden bid error — shown inline below the hand row */}
              {forbiddenWarn && isBidRowActive && (
                <tr style={{ background: 'rgba(212,80,10,0.06)' }}>
                  <td colSpan={NUM_COLS} style={{
                    padding: '5px 14px', fontSize: 12, color: 'var(--orange)',
                    fontFamily: 'Inter, sans-serif', borderBottom: '1px solid rgba(212,80,10,0.18)',
                  }}>
                    ⚠ Cannot bid {inputVal} — total bids cannot equal {cards} (cards in play)
                  </td>
                </tr>
              )}

              {/* Exceeds-cards error — new result would push the hand total above cards in play */}
              {exceedsErr === hi && (
                <tr style={{ background: 'rgba(212,80,10,0.06)' }}>
                  <td colSpan={NUM_COLS} style={{
                    padding: '5px 14px', fontSize: 12, color: 'var(--orange)',
                    fontFamily: 'Inter, sans-serif', borderBottom: '1px solid rgba(212,80,10,0.18)',
                  }}>
                    ⚠ Total tricks cannot exceed {cards} for this hand
                  </td>
                </tr>
              )}

              {/* Auto-fill error — shown when computed 4th result would be negative */}
              {autoFillErr === hi && (
                <tr style={{ background: 'rgba(212,80,10,0.06)' }}>
                  <td colSpan={NUM_COLS} style={{
                    padding: '5px 14px', fontSize: 12, color: 'var(--orange)',
                    fontFamily: 'Inter, sans-serif', borderBottom: '1px solid rgba(212,80,10,0.18)',
                  }}>
                    ⚠ Results don't add up — please check previous entries
                  </td>
                </tr>
              )}

              {/* Set total row — T1/T2/T3/T4 (points ÷ 100, Premium adjustments applied) */}
              {isSetEnd && (() => {
                const setTotals = PLAYER_KEYS.map((_, pi) => {
                  const raw = handPoints.slice(b.start, b.end + 1).reduce((s, row) => s + (row[pi] ?? 0), 0)
                  const bonus = bonusData?.bonuses?.[pi] ?? 0
                  const penalty = bonusData?.penalties?.[pi] ?? 0
                  return raw + bonus - penalty
                })
                return (
                  <tr style={{ background: 'var(--surface-total)', borderTop: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border-strong)' }}>
                    <td style={{
                      padding: '8px 10px', fontSize: 11, fontWeight: 700,
                      color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                      T{setIdx + 1}
                    </td>
                    {PLAYER_KEYS.map((_, pi) => (
                      <td key={pi} style={{
                        textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                        fontSize: 14, color: 'var(--blue)', borderLeft: '1px solid var(--border)',
                        fontVariantNumeric: 'tabular-nums',
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

        {/* Grand total — sticky footer, always shows running sum */}
        <tr style={{
          background: '#1a1a2e', borderTop: '2px solid var(--border-strong)',
          position: 'sticky', bottom: 0, zIndex: 1,
        }}>
          <td style={{
            padding: '12px 10px', fontSize: 12, fontWeight: 700,
            color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif',
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            T
          </td>
          {grandTotals.map((tot, pi) => (
            <td key={pi} style={{
              textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              fontSize: 16, color: 'var(--text-primary)',
              borderLeft: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums',
            }}>
              {(tot / 100).toFixed(1)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )

  // ── Shared UI pieces ───────────────────────────────────────────────
  const topBar = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: mobile ? '8px 12px' : '10px 24px',
      background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0,
    }}>
      <button
        onClick={() => setShowLeaveModal(true)}
        style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 18, padding: '4px 6px', lineHeight: 1 }}
      >
        ←
      </button>
      <span style={{
        fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14,
        color: 'var(--blue)', letterSpacing: '3px', fontVariantNumeric: 'tabular-nums',
      }}>
        {code}
      </span>
      <span style={{
        background: 'rgba(37,99,235,0.15)', color: 'var(--blue)', borderRadius: 6,
        padding: '2px 8px', fontSize: 11, fontFamily: 'Outfit, sans-serif',
        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        {gameMode === 'classic' ? t('mode_classic') : t('mode_9cards')}
      </span>
    </div>
  )

  // Hidden input — sole keyboard capture point, never visible
  const hiddenInput = (
    <input
      ref={hiddenInputRef}
      type="text"
      inputMode={mobile ? 'none' : 'text'}
      autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
      onKeyDown={handleHiddenKeyDown}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: 1, height: 1, opacity: 0,
        border: 'none', padding: 0, margin: 0, outline: 'none',
        pointerEvents: 'none', fontSize: 16,
      }}
      aria-hidden="true"
      tabIndex={-1}
    />
  )

  const leaveModal = showLeaveModal && (
    <ConfirmModal
      title={t('leave_game_title')}
      message={t('leave_game_message')}
      confirmLabel={t('leave_game_btn')}
      destructive
      onConfirm={() => navigate('/')}
      onCancel={() => setShowLeaveModal(false)}
    />
  )

  // ── Layouts ────────────────────────────────────────────────────────

  if (mobile) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        {hiddenInput}
        {topBar}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: '0 0 75%', overflowY: 'auto', overflowX: 'hidden' }}>
            {renderTable()}
          </div>
          <div style={{ flex: '0 0 25%', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <CustomKeyboard onKey={handleKey} value={inputVal} maxVal={activeCell ? handSeq[activeCell.hand] : undefined} />
          </div>
        </div>
        {setBonus && <SetSummaryCard bonus={setBonus} playerNames={playerNames} onClose={() => setSetBonus(null)} />}
        {leaveModal}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {hiddenInput}
      <div style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        {topBar}
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px 80px' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {renderTable()}
        </div>
      </div>
      {setBonus && <SetSummaryCard bonus={setBonus} playerNames={playerNames} onClose={() => setSetBonus(null)} />}
      {leaveModal}
    </div>
  )
}

const TH = {
  padding: '8px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
  borderBottom: '2px solid var(--border-strong)',
  fontFamily: 'Outfit, sans-serif', letterSpacing: '0.3px',
}
const CARDS_CELL = {
  textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)',
  height: ROW_H, fontVariantNumeric: 'tabular-nums',
  padding: '0 4px', fontFamily: 'Inter, sans-serif',
  borderLeft: '1px solid var(--border)',
}
