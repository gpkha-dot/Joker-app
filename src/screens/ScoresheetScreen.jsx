import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
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

const isMobile = () => window.innerWidth <= 1024
const PLAYER_KEYS = ['p1', 'p2', 'p3', 'p4']

export default function ScoresheetScreen() {
  // ── ALL hooks must be at the top, before any conditional returns ──

  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const isLandscape = useOrientation()
  const mySlot = sessionStorage.getItem('joker_slot')

  const [activeCell, setActiveCell] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [forbiddenWarn, setForbiddenWarn] = useState(false)
  const [setBonus, setSetBonus] = useState(null)
  const [lastCompletedSet, setLastCompletedSet] = useState(-1)

  // Derive settings with safe defaults so computations below always work
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
  const mobile = isMobile()
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
        }, 1500)
      }
    })
  }, [hands]) // eslint-disable-line react-hooks/exhaustive-deps

  const advanceCell = useCallback((hi, type, pi) => {
    if (type === 'bid') {
      // Find next player without a bid in this hand
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
    if (!activeCell) return
    const num = parseInt(inputVal)
    if (isNaN(num)) { setActiveCell(null); setInputVal(''); return }
    const { hand: hi, type, player: pi } = activeCell
    const pk = PLAYER_KEYS[pi]
    const h = hands[hi] ?? {}

    if (type === 'bid') {
      const bids = PLAYER_KEYS.map((k, i) => i === pi ? num : (h?.bids?.[k] ?? null))
      const allFilled = bids.every(b => b != null)
      if (allFilled && isForbiddenBid(bids, pi, handSeq[hi])) {
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
        const allFilled = bids.every(b => b != null)
        setForbiddenWarn(allFilled && isForbiddenBid(bids, activeCell.player, handSeq[activeCell.hand]))
      }
    }
  }, [activeCell, inputVal, confirmCell, hands, handSeq])

  const handleCellTap = useCallback((handIndex, type, playerIndex) => {
    if (!canEdit) return
    if (inputMode === 'each' && PLAYER_KEYS[playerIndex] !== mySlot) return
    const pk = PLAYER_KEYS[playerIndex]
    const h = hands[handIndex] ?? {}
    const existing = type === 'bid' ? h?.bids?.[pk] : h?.results?.[pk]
    setActiveCell({ hand: handIndex, type, player: playerIndex })
    setInputVal(existing != null ? String(existing) : '')
    setForbiddenWarn(false)
  }, [canEdit, inputMode, mySlot, hands])

  // ── Conditional returns AFTER all hooks ──
  if (!room) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>…</p>
      </div>
    )
  }

  if (showRotate) return <RotatePrompt />

  // ── Render ──
  const renderTable = () => (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 28 }} />
          <col style={{ width: 28 }} />
          {PLAYER_KEYS.map((_, i) => <col key={i} />)}
        </colgroup>
        <thead>
          <tr style={{ background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 2 }}>
            <th style={thStyle}>#</th>
            <th style={thStyle}>♠</th>
            {isCouples ? (
              <>
                <th colSpan={2} style={{ ...thStyle, color: 'var(--blue)', textAlign: 'center' }}>
                  {t('team_a')}: {playerNames[0]}&{playerNames[2]}
                </th>
                <th colSpan={2} style={{ ...thStyle, color: 'var(--orange)', textAlign: 'center' }}>
                  {t('team_b')}: {playerNames[1]}&{playerNames[3]}
                </th>
              </>
            ) : PLAYER_KEYS.map((_, i) => (
              <th key={i} style={{ ...thStyle, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {playerNames[i]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {handSeq.map((cards, hi) => {
            const setIdx = getSetForHand(hi, gameMode)
            const isSetStart = setBounds[setIdx]?.start === hi && hi > 0
            const isEven = hi % 2 === 0
            const h = hands[hi] ?? {}
            const isSetEnd = setBounds[setIdx]?.end === hi

            return (
              <Fragment key={hi}>
                {isSetStart && (
                  <tr style={{ background: 'var(--surface)', borderTop: '2px solid var(--blue)' }}>
                    <td colSpan={6} style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                      {t('set')} {setIdx + 1}
                    </td>
                  </tr>
                )}
                <tr style={{ background: isEven ? 'var(--surface)' : 'var(--surface-light)' }}>
                  <td style={numCell}>{hi + 1}</td>
                  <td style={numCell}>{cards}</td>
                  {PLAYER_KEYS.map((pk, pi) => {
                    const bid = h?.bids?.[pk]
                    const result = h?.results?.[pk]
                    const pts = handPoints[hi]?.[pi]
                    const exact = bid != null && result != null && isExactBid(bid, result)
                    const hist = bid != null && result != null && isHistPenalty(bid, result)
                    const bidActive = activeCell?.hand === hi && activeCell?.type === 'bid' && activeCell?.player === pi
                    const resActive = activeCell?.hand === hi && activeCell?.type === 'result' && activeCell?.player === pi

                    return (
                      <td key={pk} style={{ borderLeft: '1px solid var(--border)', padding: 2 }}>
                        <div style={{ display: 'flex', gap: 2, height: 34 }}>
                          {/* Bid cell */}
                          <div
                            onClick={() => handleCellTap(hi, 'bid', pi)}
                            style={{
                              ...dataCell,
                              border: bidActive ? '2px solid var(--blue)' : '1px solid transparent',
                              background: bidActive ? 'rgba(37,99,235,0.15)' : 'transparent',
                              color: 'var(--text-secondary)',
                              boxShadow: bidActive ? '0 0 0 2px rgba(37,99,235,0.25)' : 'none',
                              cursor: canEdit ? 'pointer' : 'default',
                            }}
                          >
                            {bidActive ? (inputVal || '·') : bid != null ? bid : ''}
                          </div>
                          {/* Result/points cell */}
                          <div
                            onClick={() => bid != null && handleCellTap(hi, 'result', pi)}
                            style={{
                              ...dataCell,
                              flex: 1,
                              border: resActive ? '2px solid var(--blue)' : '1px solid transparent',
                              background: resActive ? 'rgba(37,99,235,0.15)' : 'transparent',
                              color: exact ? 'var(--blue)' : hist || (pts != null && pts < 0) ? 'var(--orange)' : 'var(--text-primary)',
                              boxShadow: resActive ? '0 0 0 2px rgba(37,99,235,0.25)' : 'none',
                              cursor: bid != null && canEdit ? 'pointer' : 'default',
                            }}
                          >
                            {resActive ? (inputVal || '·') : pts != null ? pts : ''}
                          </div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
                {isSetEnd && (() => {
                  const b = setBounds[setIdx]
                  const setTotals = PLAYER_KEYS.map((_, pi) => {
                    let s = 0
                    for (let j = b.start; j <= b.end; j++) s += handPoints[j]?.[pi] ?? 0
                    return s
                  })
                  return (
                    <tr style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                      <td colSpan={2} style={{ padding: '5px 8px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
                        Σ{setIdx + 1}
                      </td>
                      {PLAYER_KEYS.map((_, pi) => (
                        <td key={pi} style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--blue)', borderLeft: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
                          {(setTotals[pi] / 100).toFixed(1)}
                        </td>
                      ))}
                    </tr>
                  )
                })()}
              </Fragment>
            )
          })}
          {/* Grand total — sticky bottom */}
          <tr style={{ background: 'var(--surface)', borderTop: '2px solid var(--border)', position: 'sticky', bottom: 0, zIndex: 1 }}>
            <td colSpan={2} style={{ padding: '8px', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
              {t('total')}
            </td>
            {grandTotals.map((tot, pi) => (
              <td key={pi} style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', borderLeft: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
                {(tot / 100).toFixed(1)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--blue)' }}>
          Joker — {code}
        </span>
        {forbiddenWarn && (
          <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 600 }}>
            ⚠ {t('forbidden_bid')}
          </span>
        )}
      </div>

      {/* Main area: table + keyboard side-by-side on mobile */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Scoresheet */}
        <div style={{ flex: mobile ? '0 0 75%' : 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {renderTable()}
        </div>

        {/* Custom keyboard — mobile only */}
        {mobile && (
          <div style={{ flex: '0 0 25%', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <CustomKeyboard
              onKey={handleKey}
              value={inputVal}
              maxVal={activeCell ? handSeq[activeCell.hand] : undefined}
            />
          </div>
        )}
      </div>

      {/* Desktop floating input */}
      {!mobile && activeCell && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', borderRadius: 'var(--radius-card)',
          padding: '16px 24px', display: 'flex', gap: 12, alignItems: 'center',
          border: '1px solid var(--border)', zIndex: 10,
        }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {playerNames[activeCell.player]} — {activeCell.type === 'bid' ? t('bid') : t('result')}
          </span>
          <input
            autoFocus
            value={inputVal}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '')
              const n = parseInt(v)
              if (v === '' || (!isNaN(n) && n <= handSeq[activeCell.hand])) setInputVal(v)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmCell()
              if (e.key === 'Escape') { setActiveCell(null); setInputVal('') }
            }}
            style={{ width: 80, textAlign: 'center', fontSize: 22, fontWeight: 700 }}
          />
          <button
            onClick={confirmCell}
            style={{
              background: 'var(--blue)', color: '#fff', borderRadius: 'var(--radius-btn)',
              height: 40, padding: '0 20px', fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 700,
            }}
          >
            ✓
          </button>
          {forbiddenWarn && <span style={{ fontSize: 12, color: 'var(--orange)' }}>⚠ {t('forbidden_bid')}</span>}
        </div>
      )}

      {/* Set summary overlay */}
      {setBonus && (
        <SetSummaryCard
          bonus={setBonus}
          playerNames={playerNames}
          onClose={() => setSetBonus(null)}
        />
      )}
    </div>
  )
}

// Shared cell styles
const thStyle = {
  padding: '8px 4px', fontSize: 11, color: 'var(--text-secondary)',
  fontWeight: 600, borderBottom: '1px solid var(--border)',
  fontFamily: 'Outfit, sans-serif',
}
const numCell = {
  textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)',
  height: 36, fontVariantNumeric: 'tabular-nums', padding: '0 2px',
}
const dataCell = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, fontVariantNumeric: 'tabular-nums',
  borderRadius: 4, height: '100%', minWidth: 24,
  transition: 'all 150ms ease',
}
