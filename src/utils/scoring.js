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

// Set bonus: find players with all exact bids in set
export function calcSetBonus(handsInSet, playerCount, playerMode) {
  const perfect = []
  for (let p = 0; p < playerCount; p++) {
    const allExact = handsInSet.every(h => {
      const bid = h?.bids?.[`p${p + 1}`]
      const result = h?.results?.[`p${p + 1}`]
      return bid != null && result != null && bid > 0 && bid === result
    })
    if (allExact) perfect.push(p)
  }
  if (perfect.length === 0) return null

  // Find highest score per player in set (excluding last hand)
  const handsExcludingLast = handsInSet.slice(0, -1)
  const highestScores = Array.from({ length: playerCount }, (_, p) => {
    const scores = handsExcludingLast.map(h => h?.points?.[`p${p + 1}`] ?? 0)
    return Math.max(...scores, 0)
  })

  const bonuses = Array(playerCount).fill(0)
  const penalties = Array(playerCount).fill(0)

  perfect.forEach(p => {
    bonuses[p] += highestScores[p] // doubled = original added again
  })

  // Determine who loses highest score
  if (playerMode === 'individual') {
    perfect.forEach(() => {
      for (let p = 0; p < playerCount; p++) {
        if (!perfect.includes(p)) penalties[p] += highestScores[p]
      }
    })
  } else {
    // Couples: p0&p2 = teamA, p1&p3 = teamB
    const teamA = [0, 2], teamB = [1, 3]
    const perfectTeamA = perfect.filter(p => teamA.includes(p))
    const perfectTeamB = perfect.filter(p => teamB.includes(p))
    const allPerfectSameTeam =
      (perfectTeamA.length === perfect.length) ||
      (perfectTeamB.length === perfect.length)

    if (allPerfectSameTeam) {
      const losers = perfectTeamA.length === perfect.length ? teamB : teamA
      losers.forEach(p => { penalties[p] += highestScores[p] })
    }
  }

  return { perfect, bonuses, penalties, highestScores }
}
