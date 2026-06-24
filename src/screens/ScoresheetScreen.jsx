import { useState, useEffect, useCallback, useRef } from 'react'
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

export default function ScoresheetScreen() {
  const { code } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const room = useRoom(code)
  const isLandscape = useOrientation()
  const mySlot = sessionStorage.getItem('joker_slot')

  const [activeCell, setActiveCell] = useState(null) // { hand, type: 'bid'|'result', player }
  const [inputVal, setInputVal] = useState('')
  const [forbiddenWarn, setForbiddenWarn] = useState(false)
  const [setBonus, setSetBonus] = useState(null) // show set summary overlay
  const [lastCompletedSet, setLastCompletedSet] = useState(-1)

  const mobile = isMobile()
  const showRotate = mobile && !isLandscape

  if (!room) {
    return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}><p style={{color:'var(--text-secondary)'}}>…</p></div>
  }

  const { settings, hands = {}, players = {} } = room
  const { gameMode, playerMode, histType, histValue, inputMode } = settings
  const handSeq = buildHandSequence(gameMode)
  const totalHands = handSeq.length
  const setBounds = getSetBoundaries(gameMode)
  const playerKeys = ['p1','p2','p3','p4']
  const playerNames = playerKeys.map(k => players[k]?.name || k)
  const isCouples = playerMode === 'couples'
  const isCreator = mySlot === 'p1'
  const canEdit = inputMode === 'single' ? isCreator : true

  // Compute running totals
  const totals = playerKeys.map(() => 0)
  const setTotals = Array.from({ length: 4 }, () => playerKeys.map(() => 0))
  const handPoints = Array.from({ length: totalHands }, (_, hi) => {
    const h = hands[hi] || {}
    return playerKeys.map((pk, pi) => {
      const bid = h?.bids?.[pk]
      const result = h?.results?.[pk]
      if (bid == null || result == null) return null
      return calcPoints(bid, result, handSeq[hi], histType, histValue)
    })
  })

  // Running totals per hand
  const runningTotals = Array.from({ length: totalHands }, (_, hi) => {
    const row = handPoints[hi]
    return playerKeys.map((_, pi) => {
      let sum = 0
      for (let j = 0; j <= hi; j++) {
        if (handPoints[j][pi] != null) sum += handPoints[j][pi]
      }
      return sum
    })
  })

  // Check for set completion and bonus
  useEffect(() => {
    if (!room) return
    setBounds.forEach((b, si) => {
      if (si <= lastCompletedSet) return
      const complete = Array.from({ length: b.end - b.start + 1 }, (_, i) => {
        const hi = b.start + i
        const h = hands[hi] || {}
        return playerKeys.every(pk => h?.bids?.[pk] != null && h?.results?.[pk] != null)
      }).every(Boolean)
      if (complete) {
        const handsInSet = Array.from({ length: b.end - b.start + 1 }, (_, i) => hands[b.start + i] || {})
        const bonus = calcSetBonus(handsInSet, 4, playerMode)
        if (bonus) {
          setSetBonus({ ...bonus, setIndex: si })
          setLastCompletedSet(si)
        } else {
          setLastCompletedSet(si)
        }
        // Check if game over
        if (si === setBounds.length - 1) {
          setTimeout(() => {
            updateRoomStatus(code, 'finished')
            navigate(`/room/${code}/results`)
          }, 1500)
        }
      }
    })
  }, [hands])

  const handleCellTap = (handIndex, type, playerIndex) => {
    if (!canEdit) return
    const pk = playerKeys[playerIndex]
    if (inputMode === 'each' && pk !== mySlot) return
    setActiveCell({ hand: handIndex, type, player: playerIndex })
    const h = hands[handIndex] || {}
    const existing = type === 'bid' ? h?.bids?.[pk] : h?.results?.[pk]
    setInputVal(existing != null ? String(existing) : '')
    setForbiddenWarn(false)
  }

  const handleKey = useCallback((k) => {
    if (!activeCell) return
    if (k === '←') {
      setInputVal(v => v.slice(0, -1))
      setForbiddenWarn(false)
      return
    }
    if (k === '✓') {
      confirmCell()
      return
    }
    const next = inputVal + k
    const num = parseInt(next)
    const maxVal = activeCell.type === 'bid' ? handSeq[activeCell.hand] : handSeq[activeCell.hand]
    if (!isNaN(num) && num <= maxVal) {
      setInputVal(next)
      // Check forbidden bid in real-time
      if (activeCell.type === 'bid') {
        const h = hands[activeCell.hand] || {}
        const bids = playerKeys.map((pk, i) => i === activeCell.player ? num : (h?.bids?.[pk] ?? null))
        const isLast = bids.filter(b => b == null).length === 0
        if (isLast) setForbiddenWarn(isForbiddenBid(bids, activeCell.player, handSeq[activeCell.hand]))
        else setForbiddenWarn(false)
      }
    }
  }, [activeCell, inputVal, hands, handSeq])

  const confirmCell = useCallback(async () => {
    if (!activeCell) return
    const num = parseInt(inputVal)
    if (isNaN(num)) { setActiveCell(null); setInputVal(''); return }
    const { hand: hi, type, player: pi } = activeCell
    const pk = playerKeys[pi]
    const h = hands[hi] || {}

    if (type === 'bid') {
      const bids = playerKeys.map((k, i) => i === pi ? num : (h?.bids?.[k] ?? null))
      const isLast = bids.filter(b => b == null).length === 0
      if (isLast && isForbiddenBid(bids, pi, handSeq[hi])) {
        setForbiddenWarn(true)
        return
      }
      await updateHand(code, hi, { [`bids/${pk}`]: num })
    } else {
      const pts = calcPoints(h?.bids?.[pk] ?? 0, num, handSeq[hi], histType, histValue)
      await updateHand(code, hi, { [`results/${pk}`]: num, [`points/${pk}`]: pts })
    }

    // Auto-advance
    advanceCell(hi, type, pi)
    setInputVal('')
    setForbiddenWarn(false)
  }, [activeCell, inputVal, hands, handSeq, code])

  const advanceCell = (hi, type, pi) => {
    if (type === 'bid') {
      // Move to next player's bid, or wrap to result of p0
      const nextBidPlayer = (pi + 1) % 4
      const h = hands[hi] || {}
      // Find next player without bid
      for (let i = 1; i <= 4; i++) {
        const next = (pi + i) % 4
        if (h?.bids?.[playerKeys[next]] == null) {
          setActiveCell({ hand: hi, type: 'bid', player: next })
          return
        }
      }
      // All bids done → move to results
      setActiveCell({ hand: hi, type: 'result', player: 0 })
    } else {
      const nextPi = pi + 1
      if (nextPi < 4) {
        setActiveCell({ hand: hi, type: 'result', player: nextPi })
      } else {
        // Move to next hand bids
        const nextHi = hi + 1
        if (nextHi < totalHands) {
          setActiveCell({ hand: nextHi, type: 'bid', player: 0 })
          updateCurrentHand(code, nextHi)
        } else {
          setActiveCell(null)
        }
      }
    }
  }

  const cellStyle = (hi, type, pi) => {
    const pk = playerKeys[pi]
    const h = hands[hi] || {}
    const bid = h?.bids?.[pk]
    const result = h?.results?.[pk]
    const pts = h?.points?.[pk]
    const isActive = activeCell?.hand === hi && activeCell?.type === type && activeCell?.player === pi
    const exact = type === 'result' && bid != null && result != null && isExactBid(bid, result)
    const hist = type === 'result' && bid != null && result != null && isHistPenalty(bid, result)

    return {
      border: isActive ? '2px solid var(--blue)' : '1px solid var(--border)',
      background: isActive ? 'rgba(37,99,235,0.15)' : 'transparent',
      color: exact ? 'var(--blue)' : hist ? 'var(--orange)' : 'var(--text-primary)',
      boxShadow: isActive ? '0 0 0 2px rgba(37,99,235,0.3)' : 'none',
      transition: 'all var(--transition)',
      cursor: canEdit ? 'pointer' : 'default',
      padding: '0 4px',
      textAlign: 'center',
      fontSize: 14,
      fontVariantNumeric: 'tabular-nums',
      height: 36,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }
  }

  const colW = isCouples ? '13%' : '13%'

  const grandTotals = playerKeys.map((_, pi) => {
    let sum = 0
    for (let hi = 0; hi < totalHands; hi++) {
      if (handPoints[hi][pi] != null) sum += handPoints[hi][pi]
    }
    return sum
  })

  const renderTable = () => (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 32 }} />
          <col style={{ width: 32 }} />
          {playerKeys.map((_, i) => (
            <col key={i} style={{ width: `calc((100% - 64px) / ${isCouples ? 2 : 4})` }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ background: 'var(--surface)' }}>
            <th style={{ padding: '8px 4px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>#</th>
            <th style={{ padding: '8px 4px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>♠</th>
            {isCouples ? (
              <>
                <th colSpan={2} style={{ padding: '8px 4px', fontSize: 12, color: 'var(--blue)', fontWeight: 700, borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                  {t('team_a')}: {playerNames[0]} & {playerNames[2]}
                </th>
                <th colSpan={2} style={{ padding: '8px 4px', fontSize: 12, color: 'var(--orange)', fontWeight: 700, borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                  {t('team_b')}: {playerNames[1]} & {playerNames[3]}
                </th>
              </>
            ) : playerKeys.map((_, i) => (
              <th key={i} style={{
                padding: '8px 4px', fontSize: 12, fontWeight: 700,
                borderBottom: '1px solid var(--border)', textAlign: 'center',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
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
            const h = hands[hi] || {}

            return (
              <>
                {isSetStart && (
                  <tr key={`set-divider-${hi}`}>
                    <td colSpan={2 + 4} style={{
                      padding: '4px 8px', fontSize: 11, color: 'var(--text-secondary)',
                      borderTop: '2px solid var(--blue)', borderBottom: '1px solid var(--border)',
                      background: 'var(--surface)', fontWeight: 600,
                      fontFamily: 'Outfit, sans-serif',
                    }}>
                      {t('set')} {setIdx + 1}
                    </td>
                  </tr>
                )}
                <tr key={hi} style={{ background: isEven ? 'var(--surface)' : 'var(--surface-light)' }}>
                  <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', padding: '0 4px', height: 36, fontVariantNumeric: 'tabular-nums' }}>
                    {hi + 1}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', height: 36, fontVariantNumeric: 'tabular-nums' }}>
                    {cards}
                  </td>
                  {playerKeys.map((pk, pi) => {
                    const bid = h?.bids?.[pk]
                    const result = h?.results?.[pk]
                    const pts = h?.points?.[pk]
                    const exact = bid != null && result != null && isExactBid(bid, result)
                    const hist = bid != null && result != null && isHistPenalty(bid, result)
                    return (
                      <td key={pk} style={{ borderLeft: '1px solid var(--border)', padding: 2 }}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <div onClick={() => handleCellTap(hi, 'bid', pi)} style={cellStyle(hi, 'bid', pi)}>
                            {bid != null ? bid : activeCell?.hand === hi && activeCell?.type === 'bid' && activeCell?.player === pi ? inputVal || '·' : ''}
                          </div>
                          <div onClick={() => bid != null && handleCellTap(hi, 'result', pi)} style={{
                            ...cellStyle(hi, 'result', pi),
                            color: exact ? 'var(--blue)' : hist ? 'var(--orange)' : pts != null ? (pts >= 0 ? 'var(--text-primary)' : 'var(--orange)') : 'var(--text-secondary)',
                            cursor: bid != null && canEdit ? 'pointer' : 'default',
                            flex: 1,
                          }}>
                            {activeCell?.hand === hi && activeCell?.type === 'result' && activeCell?.player === pi
                              ? (inputVal || '·')
                              : pts != null ? pts : result != null ? result : ''}
                          </div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
                {/* Set total row */}
                {setBounds[setIdx]?.end === hi && (() => {
                  const setTotal = playerKeys.map((_, pi) => {
                    let s = 0
                    for (let j = setBounds[setIdx].start; j <= hi; j++) {
                      if (handPoints[j][pi] != null) s += handPoints[j][pi]
                    }
                    return s
                  })
                  return (
                    <tr key={`set-total-${setIdx}`} style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                      <td colSpan={2} style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                        Σ {setIdx + 1}
                      </td>
                      {playerKeys.map((_, pi) => (
                        <td key={pi} style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--blue)', borderLeft: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
                          {(setTotal[pi] / 100).toFixed(1)}
                        </td>
                      ))}
                    </tr>
                  )
                })()}
              </>
            )
          })}
          {/* Grand total */}
          <tr style={{ background: 'var(--surface)', borderTop: '2px solid var(--border)', position: 'sticky', bottom: 0 }}>
            <td colSpan={2} style={{ padding: '8px', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
              {t('total')}
            </td>
            {grandTotals.map((t_, pi) => (
              <td key={pi} style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', borderLeft: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
                {(t_ / 100).toFixed(1)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )

  if (showRotate) return <RotatePrompt />

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Scoresheet */}
      <div style={{ flex: mobile ? '0 0 75%' : 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
        {renderTable()}
      </div>

      {/* Custom keyboard — mobile only */}
      {mobile && (
        <div style={{ flex: '0 0 25%', borderLeft: '1px solid var(--border)' }}>
          <CustomKeyboard
            onKey={handleKey}
            value={inputVal}
            maxVal={activeCell ? handSeq[activeCell.hand] : undefined}
          />
        </div>
      )}

      {/* Desktop input area */}
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
          <button onClick={confirmCell} style={{
            background: 'var(--blue)', color: '#fff', borderRadius: 'var(--radius-btn)',
            height: 40, padding: '0 20px', fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 700,
          }}>
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
