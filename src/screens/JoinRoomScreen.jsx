import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getRoomOnce, joinRoom, joinAsSpectator } from '../firebase/roomService'
import LanguageToggle from '../components/LanguageToggle'

function countClaimed(players) {
  if (!players) return 0
  return ['p1', 'p2', 'p3', 'p4'].filter(k => players[k]?.claimed).length
}

export default function JoinRoomScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // step 0: enter code
  // step 1a: room has space → enter name
  // step 1b: room is full → spectator option
  const [step, setStep] = useState(0)
  const [codeInput, setCodeInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [fetchedRoom, setFetchedRoom] = useState(null)
  const [isFull, setIsFull] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCodeSubmit = async () => {
    const code = codeInput.trim()
    if (code.length !== 4 || isNaN(Number(code))) {
      setError(t('error_invalid_code'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const room = await getRoomOnce(code)
      const claimed = countClaimed(room.players)
      setFetchedRoom({ ...room, _code: code })
      setIsFull(claimed >= 4)
      setStep(1)
    } catch {
      setError(t('error_room_not_found'))
    }
    setLoading(false)
  }

  const handleJoin = async () => {
    if (!nameInput.trim()) { setError(t('error_name_required')); return }
    setLoading(true)
    setError('')
    try {
      const code = fetchedRoom._code
      const slot = await joinRoom(code, nameInput.trim())
      sessionStorage.setItem('joker_room', code)
      sessionStorage.setItem('joker_slot', slot)
      if (fetchedRoom.status === 'playing') {
        navigate(`/room/${code}/game`)
      } else {
        navigate(`/room/${code}/waiting`)
      }
    } catch (e) {
      if (e.message === 'Room is full') {
        // Someone grabbed the last slot between check and join — offer spectator
        setIsFull(true)
        setError('')
      } else {
        setError(t('error_room_not_found'))
      }
    }
    setLoading(false)
  }

  const handleJoinSpectator = async () => {
    setLoading(true)
    setError('')
    try {
      const code = fetchedRoom._code
      await joinAsSpectator(code)
      sessionStorage.setItem('joker_room', code)
      sessionStorage.setItem('joker_slot', 'spectator')
      navigate(`/room/${code}/game`)
    } catch {
      setError('Could not join as spectator. Try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <button
          onClick={() => step > 0 ? setStep(0) : navigate('/')}
          style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 15, padding: 0, fontFamily: 'Outfit, sans-serif' }}
        >
          ← {t('back')}
        </button>
        <LanguageToggle />
      </div>

      {/* Step 0: Enter room code */}
      {step === 0 && (
        <>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 28, marginBottom: 32 }}>
            {t('join_room')}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                {t('enter_code')}
              </label>
              <input
                type="text" inputMode="numeric" maxLength={4}
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.replace(/\D/g, '')); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleCodeSubmit()}
                placeholder="1234"
                autoComplete="off"
                autoFocus
                style={{
                  width: '100%', textAlign: 'center', letterSpacing: '8px',
                  fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
            {error && <p style={{ fontSize: 14, color: 'var(--orange)', textAlign: 'center' }}>{error}</p>}
            <button
              onClick={handleCodeSubmit}
              disabled={loading || codeInput.length !== 4}
              style={{
                height: 52, background: 'var(--blue)', color: '#fff',
                borderRadius: 'var(--radius-btn)', fontSize: 17,
                fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              }}
            >
              {loading ? t('fetching_room') : t('next')}
            </button>
          </div>
        </>
      )}

      {/* Step 1a: Room has space — enter your name */}
      {step === 1 && !isFull && (
        <>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>
              {t('join_room')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('room_code')}: <strong style={{ color: 'var(--blue)', letterSpacing: '3px' }}>{fetchedRoom?._code}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                {t('enter_name')}
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={e => { setNameInput(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder={t('enter_name')}
                autoComplete="off"
                autoFocus
                style={{ width: '100%', fontSize: 18 }}
              />
            </div>
            {error && <p style={{ fontSize: 14, color: 'var(--orange)' }}>{error}</p>}
            <button
              onClick={handleJoin}
              disabled={loading || !nameInput.trim()}
              style={{
                height: 52, background: 'var(--blue)', color: '#fff',
                borderRadius: 'var(--radius-btn)', fontSize: 17,
                fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              }}
            >
              {loading ? '…' : t('join')}
            </button>

            {/* Spectator always available */}
            <button
              onClick={handleJoinSpectator}
              disabled={loading}
              style={{
                height: 44, background: 'transparent', color: 'var(--text-secondary)',
                borderRadius: 'var(--radius-btn)', fontSize: 15,
                fontFamily: 'Outfit, sans-serif', fontWeight: 600,
                border: '1px solid var(--border)',
              }}
            >
              {t('join_as_spectator')}
            </button>
          </div>
        </>
      )}

      {/* Step 1b: Room is full — spectator only */}
      {step === 1 && isFull && (
        <>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 12 }}>
              {t('join_room')}
            </h1>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)', padding: '20px 20px',
            }}>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{t('room_full_msg')}</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('spectator_desc')}</p>
            </div>
          </div>

          {error && <p style={{ fontSize: 14, color: 'var(--orange)', marginBottom: 12 }}>{error}</p>}

          <button
            onClick={handleJoinSpectator}
            disabled={loading}
            style={{
              width: '100%', height: 52, background: 'var(--blue)', color: '#fff',
              borderRadius: 'var(--radius-btn)', fontSize: 17,
              fontFamily: 'Outfit, sans-serif', fontWeight: 700,
            }}
          >
            {loading ? '…' : t('join_as_spectator')}
          </button>
        </>
      )}
    </div>
  )
}
