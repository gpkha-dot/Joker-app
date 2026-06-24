import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { generateRoomCode, createRoom, updatePlayerNames } from '../firebase/roomService'
import LanguageToggle from '../components/LanguageToggle'

const STEPS = ['game_mode', 'player_mode', 'hist', 'input_mode', 'players']

function OptionCard({ selected, onClick, title, desc }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? 'var(--blue-dark, #1D4ED8)' : 'var(--surface-light)',
        border: `2px solid ${selected ? 'var(--blue)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-card)',
        padding: '16px 20px',
        textAlign: 'left',
        color: 'var(--text-primary)',
        width: '100%',
        cursor: 'pointer',
        transition: 'all var(--transition)',
      }}
    >
      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: selected ? 'rgba(255,255,255,0.75)' : 'var(--text-secondary)' }}>
        {desc}
      </div>
    </button>
  )
}

export default function CreateRoomScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [roomCode, setRoomCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [settings, setSettings] = useState({
    gameMode: 'classic',
    playerMode: 'individual',
    histType: 'custom',
    histValue: 500,
    inputMode: 'single',
  })
  const [names, setNames] = useState(['', '', '', ''])
  const [creatorName, setCreatorName] = useState('')

  useEffect(() => {
    generateRoomCode().then(code => {
      setRoomCode(code)
      setLoading(false)
    })
  }, [])

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }))

  const canNext = () => {
    if (step === 4) return names.every(n => n.trim().length > 0)
    return true
  }

  const handleConfirm = async () => {
    if (!canNext()) return
    setCreating(true)
    setError('')
    try {
      await createRoom(roomCode, settings, names[0])
      sessionStorage.setItem('joker_room', roomCode)
      sessionStorage.setItem('joker_slot', 'p1')
      sessionStorage.setItem('joker_names', JSON.stringify(names))
      await updatePlayerNames(roomCode, names)
      navigate(`/room/${roomCode}/waiting`)
    } catch (e) {
      setError(e.message)
      setCreating(false)
    }
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <OptionCard selected={settings.gameMode === 'classic'} onClick={() => set('gameMode', 'classic')}
              title={t('mode_classic')} desc={t('mode_classic_desc')} />
            <OptionCard selected={settings.gameMode === '9cards'} onClick={() => set('gameMode', '9cards')}
              title={t('mode_9cards')} desc={t('mode_9cards_desc')} />
          </div>
        )
      case 1:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <OptionCard selected={settings.playerMode === 'individual'} onClick={() => set('playerMode', 'individual')}
              title={t('mode_individual')} desc={t('mode_individual_desc')} />
            <OptionCard selected={settings.playerMode === 'couples'} onClick={() => set('playerMode', 'couples')}
              title={t('mode_couples')} desc={t('mode_couples_desc')} />
          </div>
        )
      case 2:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <OptionCard selected={settings.histType === 'custom'} onClick={() => set('histType', 'custom')}
              title={t('hist_custom')} desc={t('hist_custom_desc')} />
            <OptionCard selected={settings.histType === 'special'} onClick={() => set('histType', 'special')}
              title={t('hist_special')} desc={t('hist_special_desc')} />
            {settings.histType === 'custom' && (
              <div style={{ marginTop: 4 }}>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                  {t('hist_value_label')}
                </label>
                <input
                  type="number"
                  value={settings.histValue}
                  min={100} max={1500} step={100}
                  onChange={e => {
                    const v = parseInt(e.target.value)
                    if (!isNaN(v) && v >= 100 && v <= 1500 && v % 100 === 0) set('histValue', v)
                  }}
                  style={{ width: '100%' }}
                />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{t('hist_value_hint')}</p>
              </div>
            )}
          </div>
        )
      case 3:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <OptionCard selected={settings.inputMode === 'single'} onClick={() => set('inputMode', 'single')}
              title={t('input_single')} desc={t('input_single_desc')} />
            <OptionCard selected={settings.inputMode === 'each'} onClick={() => set('inputMode', 'each')}
              title={t('input_each')} desc={t('input_each_desc')} />
          </div>
        )
      case 4:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {names.map((name, i) => {
              const isTeamA = settings.playerMode === 'couples' && (i === 0 || i === 2)
              const isTeamB = settings.playerMode === 'couples' && (i === 1 || i === 3)
              return (
                <div key={i}>
                  {settings.playerMode === 'couples' && (
                    <div style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
                      color: isTeamA ? 'var(--blue)' : 'var(--orange)',
                      marginBottom: 4, textTransform: 'uppercase',
                    }}>
                      {isTeamA ? t('team_a') : t('team_b')}
                    </div>
                  )}
                  <input
                    placeholder={t('player_name', { n: i + 1 })}
                    value={name}
                    onChange={e => setNames(ns => ns.map((n, j) => j === i ? e.target.value : n))}
                    autoComplete="off"
                  />
                </div>
              )
            })}
          </div>
        )
      default:
        return null
    }
  }

  const stepTitles = [
    t('step_game_mode'), t('step_player_mode'), t('step_hist'),
    t('step_input_mode'), t('step_players'),
  ]

  return (
    <div style={{ minHeight: '100vh', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <button
          onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/')}
          style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 15, padding: 0, fontFamily: 'Outfit, sans-serif' }}
        >
          ← {t('back')}
        </button>
        <LanguageToggle />
      </div>

      {/* Room code */}
      {!loading && (
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-card)',
          padding: '20px 24px', marginBottom: 32, textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{t('room_code')}</p>
          <p style={{
            fontFamily: 'Outfit, sans-serif', fontWeight: 700,
            fontSize: 48, letterSpacing: '12px', color: 'var(--blue)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {roomCode}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{t('share_code')}</p>
        </div>
      )}

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 24 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 24 : 8, height: 8,
            borderRadius: 4,
            background: i <= step ? 'var(--blue)' : 'var(--surface-light)',
            transition: 'all 200ms ease',
          }} />
        ))}
      </div>

      {/* Step card */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: '24px 20px', marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, marginBottom: 20 }}>
          {stepTitles[step]}
        </h2>
        {renderStep()}
      </div>

      {error && <p style={{ color: 'var(--orange)', fontSize: 14, marginBottom: 12 }}>{error}</p>}

      <button
        onClick={step < STEPS.length - 1 ? () => setStep(s => s + 1) : handleConfirm}
        disabled={!canNext() || creating || loading}
        style={{
          width: '100%', height: 52, background: 'var(--blue)', color: '#fff',
          borderRadius: 'var(--radius-btn)', fontSize: 17,
          fontFamily: 'Outfit, sans-serif', fontWeight: 700,
        }}
      >
        {step < STEPS.length - 1 ? t('next') : creating ? '…' : t('confirm')}
      </button>
    </div>
  )
}
