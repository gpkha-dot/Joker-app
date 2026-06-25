// Hand sequence builders
export function buildHandSequence(gameMode) {
  if (gameMode === 'classic') {
    const seq = []
    for (let i = 1; i <= 8; i++) seq.push(i)       // 1→8
    for (let i = 0; i < 4; i++) seq.push(9)         // 9×4
    for (let i = 8; i >= 1; i--) seq.push(i)        // 8→1
    for (let i = 0; i < 4; i++) seq.push(9)         // 9×4
    return seq // 24 hands
  }
  // 9cards: 16 hands, always 9
  return Array(16).fill(9)
}

export function getSetBoundaries(gameMode) {
  if (gameMode === 'classic') {
    // Set 1: hands 0-7  (cards 1-8, 8 hands)
    // Set 2: hands 8-11 (cards 9×4, 4 hands)
    // Set 3: hands 12-19 (cards 8-1, 8 hands)
    // Set 4: hands 20-23 (cards 9×4, 4 hands)
    return [
      { start: 0, end: 7 },
      { start: 8, end: 11 },
      { start: 12, end: 19 },
      { start: 20, end: 23 },
    ]
  }
  // 9cards: 4 sets of 4
  return [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
    { start: 8, end: 11 },
    { start: 12, end: 15 },
  ]
}

export function getSetForHand(handIndex, gameMode) {
  const bounds = getSetBoundaries(gameMode)
  return bounds.findIndex(b => handIndex >= b.start && handIndex <= b.end)
}

export function calcHistPenalty(histType, histValue, cards) {
  if (histType === 'special') return cards * 25
  return histValue
}

export function calcPoints(bid, result, cards, histType, histValue) {
  if (bid === 0) {
    if (result === 0) return 50
    return result * 10
  }
  if (result === 0) {
    return -calcHistPenalty(histType, histValue, cards)
  }
  if (bid === result) {
    if (bid === cards) return cards * 100
    return result * 50 + 50
  }
  return result * 10
}

export function isExactBid(bid, result) {
  return bid > 0 && bid === result
}

export function isHistPenalty(bid, result) {
  return bid > 0 && result === 0
}

export function isForbiddenBid(bids, playerIndex, cards) {
  // Last bidder: sum of all other bids + this bid cannot equal cards
  const othersSum = bids.reduce((s, b, i) => i !== playerIndex && b != null ? s + b : s, 0)
  return (othersSum + bids[playerIndex]) === cards
}

// Set bonus: find players with all exact bids in set.
// activeKeys: ordered array of slot keys (e.g. ['p3','p1','p4','p2']) matching display order.
// Indices in returned arrays correspond to positions in activeKeys.
export function calcSetBonus(handsInSet, activeKeys, playerMode) {
  const n = activeKeys.length
  const perfect = []
  for (let pi = 0; pi < n; pi++) {
    const pk = activeKeys[pi]
    const allExact = handsInSet.every(h => {
      const bid = h?.bids?.[pk]
      const result = h?.results?.[pk]
      return bid != null && result != null && (
        (bid > 0 && bid === result) ||
        (bid === 0 && result === 0)
      )
    })
    if (allExact) perfect.push(pi)
  }
  if (perfect.length === 0) return null

  // Find highest score AND its hand index per player (excluding last hand)
  const handsExcludingLast = handsInSet.slice(0, -1)
  const highestScores = []
  const highestHandIdxs = []
  for (let pi = 0; pi < n; pi++) {
    const pk = activeKeys[pi]
    const scores = handsExcludingLast.map(h => h?.points?.[pk] ?? 0)
    const maxVal = scores.length > 0 ? Math.max(...scores, 0) : 0
    highestScores.push(maxVal)
    highestHandIdxs.push(maxVal > 0 ? scores.indexOf(maxVal) : -1)
  }

  const bonuses = Array(n).fill(0)
  const penalties = Array(n).fill(0)

  perfect.forEach(pi => { bonuses[pi] += highestScores[pi] })

  if (playerMode === 'individual') {
    if (perfect.length > 0) {
      for (let pi = 0; pi < n; pi++) {
        if (!perfect.includes(pi)) penalties[pi] = highestScores[pi]
      }
    }
  } else {
    // Couples: display positions 0&2 = Team A, 1&3 = Team B
    const teamA = [0, 2].filter(i => i < n)
    const teamB = [1, 3].filter(i => i < n)
    const perfectTeamA = perfect.filter(pi => teamA.includes(pi))
    const perfectTeamB = perfect.filter(pi => teamB.includes(pi))
    const allPerfectSameTeam =
      (perfectTeamA.length === perfect.length) ||
      (perfectTeamB.length === perfect.length)

    if (allPerfectSameTeam) {
      const losers = perfectTeamA.length === perfect.length ? teamB : teamA
      losers.forEach(pi => { penalties[pi] = highestScores[pi] })
    }
  }

  return { perfect, bonuses, penalties, highestScores, highestHandIdxs }
}
