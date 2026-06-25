import { db } from './config'
import { ref, set, get, update, push, onValue, off, serverTimestamp } from 'firebase/database'

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

// allNames: array of 4 names; creatorIdx: which index belongs to the creator
export async function createRoom(code, settings, allNames, creatorIdx = 0) {
  const players = {}
  allNames.forEach((name, i) => {
    players[`p${i + 1}`] = { name, isCreator: i === creatorIdx, claimed: i === creatorIdx }
  })
  await set(ref(db, `rooms/${code}`), {
    settings, players, hands: {}, currentHand: 0, status: 'waiting',
    createdAt: serverTimestamp(),
  })
}

// Claim an unclaimed slot when joining
export async function claimSlot(code, slot) {
  await update(ref(db, `rooms/${code}/players/${slot}`), { claimed: true })
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
