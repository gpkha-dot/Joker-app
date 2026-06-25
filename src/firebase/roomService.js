import { db } from './config'
import { ref, set, get, update, push, runTransaction, onValue, off, serverTimestamp } from 'firebase/database'

export async function generateRoomCode() {
  let code
  let attempts = 0
  do {
    code = String(Math.floor(1000 + Math.random() * 9000))
    const snap = await get(ref(db, `rooms/${code}/status`))
    if (!snap.exists() || snap.val() === 'finished') return code
    attempts++
  } while (attempts < 20)
  throw new Error('Could not generate unique room code')
}

// Single mode: allNamesOrCreatorName is an array of 4 names + creatorIdx
// Each mode:   allNamesOrCreatorName is a single string (creator's own name), always placed in p1
export async function createRoom(code, settings, allNamesOrCreatorName, creatorIdx = 0) {
  const players = {}
  if (settings.inputMode === 'single') {
    const names = allNamesOrCreatorName
    names.forEach((name, i) => {
      players[`p${i + 1}`] = { name, isCreator: i === creatorIdx, claimed: true }
    })
  } else {
    // Each mode — only creator is pre-filled (always slot p1)
    players['p1'] = { name: allNamesOrCreatorName, isCreator: true, claimed: true }
  }
  await set(ref(db, `rooms/${code}`), {
    settings, players, hands: {}, currentHand: 0, status: 'waiting',
    createdAt: serverTimestamp(),
  })
}

// Atomically claim the next open slot. Throws if room not found.
// Returns the slot key ('p1'–'p4') or throws 'Room is full' if none available.
export async function joinRoom(code, name) {
  const snap = await get(ref(db, `rooms/${code}`))
  if (!snap.exists()) throw new Error('Room not found')

  const playersRef = ref(db, `rooms/${code}/players`)
  let claimedSlot = null

  await runTransaction(playersRef, (current) => {
    if (!current) return current
    const slot = ['p1', 'p2', 'p3', 'p4'].find(k => !current[k])
    if (!slot) return current // full — no write
    claimedSlot = slot
    return { ...current, [slot]: { name, claimed: true } }
  })

  if (!claimedSlot) throw new Error('Room is full')
  return claimedSlot
}

export async function joinAsSpectator(code) {
  const specRef = push(ref(db, `rooms/${code}/spectators`))
  await set(specRef, { joinedAt: serverTimestamp() })
  return specRef.key
}

export async function getRoomOnce(code) {
  const snap = await get(ref(db, `rooms/${code}`))
  if (!snap.exists()) throw new Error('Room not found')
  return snap.val()
}

export function subscribeRoom(code, cb) {
  const roomRef = ref(db, `rooms/${code}`)
  onValue(roomRef, snap => cb(snap.val()))
  return () => off(roomRef)
}

// Called by host to start; stores the active player count for the scoresheet
export async function startGame(code, playerCount) {
  await update(ref(db, `rooms/${code}`), { status: 'playing', playerCount })
}

export async function updateRoomStatus(code, status) {
  await update(ref(db, `rooms/${code}`), { status })
}

export async function updateHand(code, handIndex, data) {
  await update(ref(db, `rooms/${code}/hands/${handIndex}`), data)
}

export async function updateCurrentHand(code, handIndex) {
  await update(ref(db, `rooms/${code}`), { currentHand: handIndex })
}

export async function cancelRoom(code) {
  await set(ref(db, `rooms/${code}`), null)
}

export async function leaveRoom(code, slot) {
  await set(ref(db, `rooms/${code}/players/${slot}`), null)
}

export async function updatePlayerOrder(code, order) {
  await update(ref(db, `rooms/${code}`), { displayOrder: order })
}
