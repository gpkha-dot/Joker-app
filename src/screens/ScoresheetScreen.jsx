import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRoom } from '../hooks/useRoom'
import { useOrientation } from '../hooks/useOrientation'
import { updateHand, updateCurrentHand, updateRoomStatus } from '../firebase/roomService'
import {
  buildHandSequence, getSetBoundaries, getSetForHand,
  calcPoints, isForbiddenBid, calcSetBonus,
} from '../utils/scoring'
import RotatePrompt from '../components/RotatePrompt'
import CustomKeyboard from '../components/CustomKeyboard'
import SetSummaryCard from '../components/SetSummaryCard'
import ConfirmModal from '../components/ConfirmModal'

const PLAYER_KEYS = ['p1', 'p2', 'p3', 'p4']
const isMobileWidth = () => window.innerWidth <= 1024
const ROW_H = 52
const TEAM_A = '#7C3AED'
const TEAM_B = '#0D9488'

// Next unfilled cell in sequential game order (dealer rotation for bids, L→R for results)
function getNextEmptyCell(handsData, handSeq) {
  for (let hi = 0; hi < handSeq.length; hi++) {
    const h = handsData[hi] ?? {}
    const firstBidder = hi % 4
    for (let i = 0; i < 4; i++) {
      const pi = (firstBidder + i) % 4
      if (h?.bids?.[PLAYER_KEYS[pi]] == null) return { hand: hi, type: 'bid', player: pi }
    }
    for (let pi = 0; pi < 4; pi++) {
      if (h?.results?.[PLAYER_KEYS[pi]] == null) return { hand: hi, type: 'result', player: pi }
    }
  }
  return null
}

// Monotonically increasing index for sequential game order
function getCellSeqIdx(hi, type, pi) {
  if (type === 'bid') {
    const firstBidder = hi % 4
    const order = [0, 1, 2, 3].map(i => (firstBidder + i) % 4)
    return hi * 8 + order.indexOf(pi)
  }
  return hi * 8 + 4 + pi
}

export default function ScoresheetScreen() {
  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const isLandscape = useOrientation()
  const mySlot = sessionStorage.getItem('joker_slot') || 'p1'
  const hiddenInputRef = useRef(null)
  const initialized = useRef(false)

  const [activeCell, setActiveCell] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [forbiddenWarn, setForbiddenWarn] = useState(false)
  const [autoFillErr, setAutoFillErr] = useState(null)
  const [exceedsErr, setExceedsErr] = useState(null)
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
  const histValueShort = settings.histValueShort ?? 200
  const histValueLong = settings.histValueLong ?? 500
  const inputMode = settings.inputMode ?? 'single'
  const handSeq = useMemo(() => buildHandSequence(gameMode), [gameMode])
  const setBounds = useMemo(() => getSetBoundaries(gameMode), [gameMode])
  const playerNames = PLAYER_KEYS.map(k => players[k]?.name || k)
  const isCouples = playerMode === 'couples'
  const isSpectator = mySlot === 'spectator'
  const isReadOnly = room?.status === 'finished'
  const isCreator = !isSpectator && (players[mySlot]?.isCreator === true)
  const canEdit = !isReadOnly && !isSpectator && (inputMode === 'single' ? isCreator : true)
  const mobile = isMobileWidth()
  const showRotate = mobile && !isLandscape
  const currentHand = room?.currentHand ?? 0
  const dealerForCurrentHand = (3 + currentHand) % 4

  const resolveHist = useCallback((cards) =>
    histType === 'mix'
      ? { ht: 'custom', hv: cards <= 8 ? histValueShort : histValueLong }
      : { ht: histType, hv: histValue },
    [histType, histValue, histValueShort, histValueLong]
  )

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

  const setBonusData = useMemo(() =>
    setBounds.map(b => {
      const handsInSet = Array.from({ length: b.end - b.start + 1 }, (_, i) => hands[b.start + i] ?? {})
      const complete = handsInSet.every(h => PLAYER_KEYS.every(pk => h?.bids?.[pk] != null && h?.results?.[pk] != null))
      if (!complete) return null
      return calcSetBonus(handsInSet, 4, playerMode)
    }),
    [hands, setBounds, playerMode]
  )

  const grandTotals = useMemo(() =>
    PLAYER_KEYS.map((_, pi) => {
      const raw = handPoints.reduce((s, row) => s + (row[pi] ?? 0), 0)
      const adj = setBonusData.reduce((s, bd) => bd ? s + (bd.bonuses[pi] ?? 0) - (bd.penalties[pi] ?? 0) : s, 0)
      return raw + adj
    }),
    [handPoints, setBonusData]
  )

  // Initialize active cell to next empty on first room load
  useEffect(() => {
    if (!room || initialized.current || isReadOnly || isSpectator) return
    initialized.current = true
    const next = getNextEmptyCell(hands, handSeq)
    if (next) setActiveCell(next)
  }, [room]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus hidden input on desktop when active cell changes
  useEffect(() => {
    if (!mobile && activeCell && canEdit) hiddenInputRef.current?.focus()
  }, [activeCell, mobile, canEdit])

  // Set completion detection — guards against readonly to avoid re-navigating to results
  useEffect(() => {
    if (!room || isReadOnly) return
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
      if (bonus) {
        const setTotals = PLAYER_KEYS.map((_, pi) => {
          const raw = handPoints.slice(b.start, b.end + 1).reduce((s, row) => s + (row[pi] ?? 0), 0)
          return raw + (bonus.bonuses[pi] ?? 0) - (bonus.penalties[pi] ?? 0)
        })
        setSetBonus({ ...bonus, setIndex: si, setTotals })
      }
      if (si === setBounds.length - 1) {
        setTimeout(async () => {
          await updateRoomStatus(code, 'finished')
          navigate(`/room/${code}/results`)
        }, 2000)
      }
    })
  }, [hands]) // eslint-disable-line react-hooks/exhaustive-deps

  // Central save function — handles bid + result, advances activeCell, handles auto-fill
  const doSaveCell = useCallback(async (hi, type, pi, num) => {
    const pk = PLAYER_KEYS[pi]
    const h = hands[hi] ?? {}
    const cards = handSeq[hi]

    if (type === 'bid') {
      await updateHand(code, hi, { [`bids/${pk}`]: num })
      // If result already exists (editing past bid), recalculate points
      const existingResult = h?.results?.[pk]
      if (existingResult != null) {
        const { ht, hv } = resolveHist(cards)
        const pts = calcPoints(num, existingResult, cards, ht, hv)
        await updateHand(code, hi, { [`points/${pk}`]: pts })
      }
    } else {
      const existingSum = PLAYER_KEYS.reduce((s, k, i) => i !== pi ? s + (h?.results?.[k] ?? 0) : s, 0)
      if (existingSum + num > cards) { setExceedsErr(hi); return }
      const { ht, hv } = resolveHist(cards)
      const bid = h?.bids?.[pk] ?? 0
      const pts = calcPoints(bid, num, cards, ht, hv)
      await updateHand(code, hi, {
        [`results/${pk}`]: num,
        [`points/${pk}`]: pts,
        [`autoResult/${pk}`]: null,
      })

      // Auto-fill 4th result
      const resultsNow = PLAYER_KEYS.map((k, i) => i === pi ? num : (h?.results?.[k] ?? null))
      const filledCnt = resultsNow.filter(r => r != null).length
      if (filledCnt === 3) {
        const missingIdx = resultsNow.findIndex(r => r == null)
        const missingPk = PLAYER_KEYS[missingIdx]
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
          setInputVal('')
          setForbiddenWarn(false)
          setExceedsErr(null)
          setAutoFillErr(null)
          const nextHi = hi + 1
          if (nextHi < handSeq.length) {
            const firstBidder = nextHi % 4
            setActiveCell({ hand: nextHi, type: 'bid', player: firstBidder })
            await updateCurrentHand(code, nextHi)
          } else {
            setActiveCell(null)
          }
          return
        } else {
          setAutoFillErr(hi)
          return
        }
      }
    }

    // Compute next empty cell locally (optimistic — Firebase hasn't updated yet)
    const updatedH = type === 'bid'
      ? { ...h, bids: { ...(h?.bids ?? {}), [pk]: num } }
      : { ...h, results: { ...(h?.results ?? {}), [pk]: num } }
    const localHands = { ...hands, [hi]: updatedH }
    const nextCell = getNextEmptyCell(localHands, handSeq)

    setInputVal('')
    setForbiddenWarn(false)
    setExceedsErr(null)
    setAutoFillErr(null)

    if (nextCell) {
      setActiveCell(nextCell)
      if (nextCell.hand !== hi) await updateCurrentHand(code, nextCell.hand)
    } else {
      setActiveCell(null)
    }
  }, [hands, handSeq, code, resolveHist])

  // Single-digit entry — bids auto-confirm on digit; results wait for explicit confirm
  const appendDigit = useCallback((digit) => {
    if (!activeCell || !canEdit) return
    setAutoFillErr(null)
    setExceedsErr(null)
    const maxAllowed = handSeq[activeCell.hand]
    const n = parseInt(digit)
    if (isNaN(n) || n > maxAllowed) return
    setInputVal(digit)

    if (activeCell.type === 'bid') {
      const h = hands[activeCell.hand] ?? {}
      const allBids = PLAYER_KEYS.map((pk, i) => i === activeCell.player ? n : (h?.bids?.[pk] ?? null))
      const forbidden = allBids.every(b => b != null) && isForbiddenBid(allBids, activeCell.player, maxAllowed)
      setForbiddenWarn(forbidden)
      if (!forbidden) {
        doSaveCell(activeCell.hand, activeCell.type, activeCell.player, n)
      }
    } else {
      setForbiddenWarn(false)
    }
  }, [activeCell, canEdit, handSeq, hands, doSaveCell])

  const confirmCell = useCallback(async (explicitVal) => {
    if (!activeCell || !canEdit) return
    const valueStr = explicitVal !== undefined ? String(explicitVal) : inputVal
    if (valueStr === '') return
    const num = parseInt(valueStr)
    if (isNaN(num)) { setActiveCell(null); setInputVal(''); return }

    if (activeCell.type === 'bid') {
      const h = hands[activeCell.hand] ?? {}
      const cards = handSeq[activeCell.hand]
      const allBids = PLAYER_KEYS.map((pk, i) => i === activeCell.player ? num : (h?.bids?.[pk] ?? null))
      if (allBids.every(b => b != null) && isForbiddenBid(allBids, activeCell.player, cards)) {
        setForbiddenWarn(true)
        return
      }
    }
    await doSaveCell(activeCell.hand, activeCell.type, activeCell.player, num)
  }, [activeCell, canEdit, inputVal, hands, handSeq, doSaveCell])

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
      setActiveCell(null); setInputVal(''); setForbiddenWarn(false)
      setAutoFillErr(null); setExceedsErr(null)
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
    const pk = PLAYER_KEYS[pi]
    const h = hands[hi] ?? {}
    if (type === 'result' && h?.bids?.[pk] == null) return

    // Block future empty cells — enforce sequential filling
    const nextEmpty = getNextEmptyCell(hands, handSeq)
    if (nextEmpty) {
      const nextIdx = getCellSeqIdx(nextEmpty.hand, nextEmpty.type, nextEmpty.player)
      const thisIdx = getCellSeqIdx(hi, type, pi)
      if (thisIdx > nextIdx) return
    }

    const existing = type === 'bid' ? h?.bids?.[pk] : h?.results?.[pk]
    setActiveCell({ hand: hi, type, player: pi })
    setInputVal(existing != null ? String(existing) : '')
    setForbiddenWarn(false)
    setAutoFillErr(null)
    setExceedsErr(null)
    if (!mobile) hiddenInputRef.current?.focus()
  }, [canEdit, hands, handSeq, mobile])

  // ── Conditional returns (after all hooks) ──────────────────────────
  if (!room) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>…</p>
      </div>
    )
  }
  if (showRotate) return <RotatePrompt />

  // ── Visual helpers ─────────────────────────────────────────────────
  const isBlueResult = (bid, result) => {
    if (bid == null || result == null) return false
    return bid === 0 ? result === 0 : bid === result
  }
  const ptColor = (bid, result, pts) => {
    if (pts == null) return 'var(--text-secondary)'
    if (pts < 0) return 'var(--orange)'
    if (!isBlueResult(bid, result)) return 'var(--orange)'
    return 'var(--blue)'
  }
  const colHeaderBg = (pi) => {
    if (!isCouples) return 'transparent'
    return (pi === 0 || pi === 2) ? 'rgba(124,58,237,0.08)' : 'rgba(13,148,136,0.08)'
  }
  const avatarColor = (pi) => {
    if (!isCouples) return 'var(--blue)'
    return (pi === 0 || pi === 2) ? TEAM_A : TEAM_B
  }

  const NUM_COLS = 5
  const nextEmpty = getNextEmptyCell(hands, handSeq)
  const nextEmptyIdx = nextEmpty ? getCellSeqIdx(nextEmpty.hand, nextEmpty.type, nextEmpty.player) : -1

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
            const isDealer = !isReadOnly && pi === dealerForCurrentHand
            return (
              <th key={pk} style={{ ...TH, background: colHeaderBg(pi), padding: '10px 6px 8px', position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      width: mobile ? 26 : 30, height: mobile ? 26 : 30, borderRadius: '50%',
                      background: avatarColor(pi),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: mobile ? 10 : 12, fontWeight: 700, color: '#fff', flexShrink: 0,
                    }}>
                      {(name[0] || '?').toUpperCase()}
                    </div>
                    {isDealer && (
                      <span style={{
                        position: 'absolute', top: -4, right: -8,
                        fontSize: 9, fontWeight: 800, color: '#f59e0b',
                        background: 'rgba(245,158,11,0.18)', borderRadius: 4,
                        padding: '1px 3px', lineHeight: 1.2,
                      }}>
                        ▶
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                    fontSize: mobile ? 9 : 12, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis',
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
                    padding: '4px 10px', fontSize: 10, fontWeight: 700,
                    color: 'var(--blue)', letterSpacing: '1.2px', textTransform: 'uppercase',
                    fontFamily: 'Outfit, sans-serif',
                    borderTop: hi > 0 ? '2px solid var(--blue)' : 'none',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {t('set')} {setIdx + 1}
                  </td>
                </tr>
              )}

              <tr style={{ background: isEven ? 'var(--surface)' : 'var(--surface-alt)' }}>
                <td style={CARDS_CELL}>{cards}</td>

                {PLAYER_KEYS.map((pk, pi) => {
                  const bid = h?.bids?.[pk]
                  const result = h?.results?.[pk]
                  const pts = handPoints[hi]?.[pi]
                  const isAutoFilled = h?.autoResult?.[pk] === true
                  const isBidActive = isBidRowActive && activeCell?.player === pi
                  const isResActive = isResRowActive && activeCell?.player === pi
                  const bidForbidden = isBidActive && forbiddenWarn

                  const bidSeqIdx = getCellSeqIdx(hi, 'bid', pi)
                  const resSeqIdx = getCellSeqIdx(hi, 'result', pi)
                  const isFutureBid = bid == null && canEdit && nextEmptyIdx >= 0 && bidSeqIdx > nextEmptyIdx
                  const isFutureRes = result == null && canEdit && nextEmptyIdx >= 0 && resSeqIdx > nextEmptyIdx

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

                        {/* Bid sub-cell */}
                        <div
                          onClick={() => handleCellTap(hi, 'bid', pi)}
                          style={{
                            width: mobile ? 26 : 38, flexShrink: 0,
                            borderRight: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: mobile ? 11 : 13,
                            color: isBidActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                            cursor: isFutureBid ? 'not-allowed' : (canEdit ? 'pointer' : 'default'),
                            opacity: isFutureBid ? 0.28 : 1,
                            background: isBidActive
                              ? (bidForbidden ? 'rgba(212,80,10,0.13)' : 'rgba(37,99,235,0.13)')
                              : 'transparent',
                            boxShadow: isBidActive
                              ? (bidForbidden ? 'inset 0 0 0 2px var(--orange)' : 'inset 0 0 0 2px var(--blue)')
                              : 'none',
                            transition: 'all 120ms ease',
                            fontVariantNumeric: 'tabular-nums',
                            fontFamily: 'Inter, sans-serif',
                            userSelect: 'none', WebkitUserSelect: 'none',
                          }}
                        >
                          {bidDisplay}
                        </div>

                        {/* Points sub-cell */}
                        <div
                          onClick={() => handleCellTap(hi, 'result', pi)}
                          style={{
                            flex: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: mobile ? 12 : 14,
                            fontWeight: pts != null || isResActive ? 600 : 400,
                            fontStyle: isAutoFilled && !isResActive ? 'italic' : 'normal',
                            opacity: isFutureRes ? 0.28 : (cellMark === 'penalty' ? 0.55 : (isAutoFilled && !isResActive ? 0.6 : 1)),
                            color: isResActive ? 'var(--text-primary)'
                              : (cellMark === 'penalty' ? 'var(--text-secondary)' : ptColor(bid, result, pts)),
                            textDecoration: cellMark === 'penalty' ? 'line-through' : 'none',
                            cursor: isFutureRes ? 'not-allowed' : (bid != null && canEdit ? 'pointer' : 'default'),
                            background: isResActive ? 'rgba(37,99,235,0.13)' : 'transparent',
                            boxShadow: isResActive ? 'inset 0 0 0 2px var(--blue)' : 'none',
                            transition: 'all 120ms ease',
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

              {forbiddenWarn && isBidRowActive && (
                <tr style={{ background: 'rgba(212,80,10,0.06)' }}>
                  <td colSpan={NUM_COLS} style={{
                    padding: '4px 10px', fontSize: 11, color: 'var(--orange)',
                    fontFamily: 'Inter, sans-serif', borderBottom: '1px solid rgba(212,80,10,0.18)',
                  }}>
                    ⚠ {t('forbidden_bid')} — {inputVal !== '' ? `bid ${inputVal}` : ''} would make total equal {cards}
                  </td>
                </tr>
              )}

              {exceedsErr === hi && (
                <tr style={{ background: 'rgba(212,80,10,0.06)' }}>
                  <td colSpan={NUM_COLS} style={{
                    padding: '4px 10px', fontSize: 11, color: 'var(--orange)',
                    fontFamily: 'Inter, sans-serif', borderBottom: '1px solid rgba(212,80,10,0.18)',
                  }}>
                    ⚠ Total tricks cannot exceed {cards}
                  </td>
                </tr>
              )}

              {autoFillErr === hi && (
                <tr style={{ background: 'rgba(212,80,10,0.06)' }}>
                  <td colSpan={NUM_COLS} style={{
                    padding: '4px 10px', fontSize: 11, color: 'var(--orange)',
                    fontFamily: 'Inter, sans-serif', borderBottom: '1px solid rgba(212,80,10,0.18)',
                  }}>
                    ⚠ Results don't add up — check previous entries
                  </td>
                </tr>
              )}

              {/* Set total row + optional team total row */}
              {isSetEnd && (() => {
                const setTotals = PLAYER_KEYS.map((_, pi) => {
                  const raw = handPoints.slice(b.start, b.end + 1).reduce((s, row) => s + (row[pi] ?? 0), 0)
                  const bonus = bonusData?.bonuses?.[pi] ?? 0
                  const penalty = bonusData?.penalties?.[pi] ?? 0
                  return raw + bonus - penalty
                })
                const teamA = setTotals[0] + setTotals[2]
                const teamB = setTotals[1] + setTotals[3]
                return (
                  <>
                    <tr style={{ background: 'var(--surface-total)', borderTop: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border-strong)' }}>
                      <td style={{
                        padding: '7px 8px', fontSize: 10, fontWeight: 700,
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
                    {isCouples && (
                      <tr style={{ background: '#16162a', borderBottom: '2px solid var(--blue)' }}>
                        <td style={{ padding: '5px 6px', fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>
                          ▶
                        </td>
                        <td colSpan={2} style={{
                          textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                          fontSize: 13, color: TEAM_A, borderLeft: '1px solid var(--border)',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {(teamA / 100).toFixed(1)}
                        </td>
                        <td colSpan={2} style={{
                          textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                          fontSize: 13, color: TEAM_B, borderLeft: '1px solid var(--border)',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {(teamB / 100).toFixed(1)}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })()}
            </Fragment>
          )
        })}

        {/* Grand total row */}
        <tr style={{ background: '#1a1a2e', borderTop: '2px solid var(--border-strong)', position: 'sticky', bottom: 0, zIndex: 1 }}>
          <td style={{
            padding: '10px 8px', fontSize: 11, fontWeight: 700,
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

        {/* Grand team total row (couples only) */}
        {isCouples && (
          <tr style={{ background: '#121222', borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: '7px 6px', fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>
              ▶▶
            </td>
            <td colSpan={2} style={{
              textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              fontSize: 15, color: TEAM_A, borderLeft: '1px solid var(--border)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {((grandTotals[0] + grandTotals[2]) / 100).toFixed(1)}
            </td>
            <td colSpan={2} style={{
              textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              fontSize: 15, color: TEAM_B, borderLeft: '1px solid var(--border)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {((grandTotals[1] + grandTotals[3]) / 100).toFixed(1)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )

  const topBar = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: mobile ? '8px 10px' : '10px 24px',
      background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0,
    }}>
      <button
        onClick={() => isReadOnly ? navigate(`/room/${code}/results`) : setShowLeaveModal(true)}
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
        padding: '2px 8px', fontSize: 10, fontFamily: 'Outfit, sans-serif',
        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        {gameMode === 'classic' ? t('mode_classic') : t('mode_9cards')}
      </span>
      {isReadOnly && (
        <span style={{
          marginLeft: 'auto',
          background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 6,
          padding: '2px 8px', fontSize: 10, fontFamily: 'Outfit, sans-serif',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          {t('view_only')}
        </span>
      )}
    </div>
  )

  const hiddenInput = (
    <input
      ref={hiddenInputRef}
      type="text"
      inputMode={mobile ? 'none' : 'text'}
      autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
      onKeyDown={handleHiddenKeyDown}
      style={{
        position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0,
        border: 'none', padding: 0, margin: 0, outline: 'none',
        pointerEvents: 'none', fontSize: 16,
      }}
      aria-hidden="true" tabIndex={-1}
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

  if (mobile) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {hiddenInput}
        {topBar}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: '0 0 76%', overflowY: 'auto', overflowX: 'hidden' }}>
            {renderTable()}
          </div>
          {!isReadOnly && !isSpectator && (
            <div style={{ flex: '0 0 24%', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
              <CustomKeyboard
                onKey={handleKey}
                value={inputVal}
                maxVal={activeCell ? handSeq[activeCell.hand] : undefined}
              />
            </div>
          )}
        </div>
        {setBonus && (
          <SetSummaryCard
            bonus={setBonus} playerNames={playerNames}
            isCouples={isCouples} onClose={() => setSetBonus(null)}
          />
        )}
        {leaveModal}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {hiddenInput}
      <div style={{ position: 'sticky', top: 0, zIndex: 20 }}>{topBar}</div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px 80px' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {renderTable()}
        </div>
      </div>
      {setBonus && (
        <SetSummaryCard
          bonus={setBonus} playerNames={playerNames}
          isCouples={isCouples} onClose={() => setSetBonus(null)}
        />
      )}
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
