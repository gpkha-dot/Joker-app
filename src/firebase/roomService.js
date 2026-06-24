import { db } from './config'
import { ref, set, get, update, onValue, off, serverTimestamp } from 'firebase/database'

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

export async function createRoom(code, settings, creatorName) {
  const roomRef = ref(db, `rooms/${code}`)
  await set(roomRef, {
    settings,
    players: {
      p1: { name: creatorName, isCreator: true },
      p2: null,
      p3: null,
      p4: null,
    },
    hands: {},
    currentHand: 0,
    currentSet: 0,
    status: 'waiting',
    createdAt: serverTimestamp(),
  })
}

export async function joinRoom(code, playerName) {
  const playersRef = ref(db, `rooms/${code}/players`)
  const snap = await get(playersRef)
  if (!snap.exists()) throw new Error('Room not found')
  const players = snap.val()
  const slot = ['p2', 'p3', 'p4'].find(k => !players[k])
  if (!slot) throw new Error('Room is full')
  await update(ref(db, `rooms/${code}/players/${slot}`), { name: playerName, isCreator: false })
  return slot
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

export async function updateRoomStatus(code, status) {
  await update(ref(db, `rooms/${code}`), { status })
}

export async function updateHand(code, handIndex, data) {
  await update(ref(db, `rooms/${code}/hands/${handIndex}`), data)
}

export async function updateCurrentHand(code, handIndex) {
  await update(ref(db, `rooms/${code}`), { currentHand: handIndex })
}

export async function updatePlayerNames(code, names) {
  const updates = {}
  names.forEach((name, i) => { updates[`players/p${i + 1}/name`] = name })
  await update(ref(db, `rooms/${code}`), updates)
}
