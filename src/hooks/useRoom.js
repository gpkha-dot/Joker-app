import { useState, useEffect, useRef } from 'react'
import { subscribeRoom } from '../firebase/roomService'

export function useRoom(code) {
  const [room, setRoom] = useState(null)
  const unsubRef = useRef(null)

  useEffect(() => {
    if (!code) return
    unsubRef.current = subscribeRoom(code, data => setRoom(data))
    return () => unsubRef.current?.()
  }, [code])

  return room
}
