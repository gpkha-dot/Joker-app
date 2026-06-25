import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getRoomOnce, claimSlot, joinAsSpectator } from '../firebase/roomService'
import LanguageToggle from '../components/LanguageToggle'

const PLAYER_KEYS = ['p1', 'p2', 'p3', 'p4']

export default function JoinRoomScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [codeInput, setCodeInput] = useState('')
  const [fetchedRoom, setFetchedRoom] = useState(null)
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
      if (room.status === 'finished') throw new Error('finished')
      setFetchedRoom({ ...room, _code: code })
      setStep(1)
    } catch {
      setError(t('error_room_not_found'))
    }
    setLoading(false)
  }

  const handleClaimSlot = async (slot) => {
    setLoading(true)
    setError('')
    try {
      const code = fetchedRoom._code
      await claimSlot(code, slot)
      sessionStorage.setItem('joker_room', code)
      sessionStorage.setItem('joker_slot', slot)
      if (fetchedRoom.status === 'playing') {
        navigate(`/room/${code}/game`)
      } else {
        navigate(`/room/${code}/waiting`)
      }
    } catch {
      setError('Failed to join. Please try again.')
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
      setError('Failed to join as spectator.')
    }
    setLoading(false)
  }

  const players = fetchedRoom?.players ?? {}
  const isCouples = fetchedRoom?.settings?.playerMode === 'couples'

  return (
    <div style={{ minHeight: '100vh', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <button
          onClick={() => step > 0 ? setStep(0) : navigate('/')}
          style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 15, padding: 0, fontFamily: 'Outfit, sans-serif' }}
        >
          ← {t('back')}
        </button>
        <LanguageToggle />
      </div>

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
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.replace(/\D/g, '')); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleCodeSubmit()}
                placeholder="1234"
                autoComplete="off"
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

      {step === 1 && fetchedRoom && (
        <>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>
              {t('select_your_name')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('room_code')}: <strong style={{ color: 'var(--blue)' }}>{fetchedRoom._code}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {PLAYER_KEYS.map((pk, i) => {
              const player = players[pk]
              if (!player) return null
              const isClaimed = player.claimed === true
              const teamColor = isCouples
                ? ((i === 0 || i === 2) ? '#7C3AED' : '#0D9488')
                : 'var(--text-secondary)'

              return (
                <button
                  key={pk}
                  onClick={() => !isClaimed && handleClaimSlot(pk)}
                  disabled={isClaimed || loading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 18px',
                    background: isClaimed ? 'var(--surface)' : 'var(--surface-light)',
                    border: `2px solid ${isClaimed ? 'var(--border)' : 'var(--blue)'}`,
                    borderRadius: 'var(--radius-card)',
                    color: isClaimed ? 'var(--text-secondary)' : 'var(--text-primary)',
                    cursor: isClaimed ? 'not-allowed' : 'pointer',
                    opacity: isClaimed ? 0.5 : 1,
                    transition: 'all 150ms ease',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16 }}>
                      {player.name}
                    </span>
                    {isCouples && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: teamColor, letterSpacing: '0.6px' }}>
                        {(i === 0 || i === 2) ? t('team_a') : t('team_b')}
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    background: isClaimed ? 'rgba(255,255,255,0.08)' : 'rgba(59,130,246,0.15)',
                    color: isClaimed ? 'var(--text-secondary)' : 'var(--blue)',
                  }}>
                    {isClaimed ? t('slot_taken') : t('slot_available')}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <button
              onClick={handleJoinSpectator}
              disabled={loading}
              style={{
                width: '100%', padding: '14px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                  {t('spectator')}
                </span>
                <span style={{ fontSize: 12 }}>{t('spectator_desc')}</span>
              </div>
              <span style={{ fontSize: 20 }}>👁</span>
            </button>
          </div>

          {error && <p style={{ fontSize: 14, color: 'var(--orange)', marginTop: 16, textAlign: 'center' }}>{error}</p>}
        </>
      )}
    </div>
  )
}
