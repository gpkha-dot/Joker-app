import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { generateRoomCode, createRoom, updatePlayerNames } from '../firebase/roomService'
import LanguageToggle from '../components/LanguageToggle'

const STEPS = ['game_mode', 'player_mode', 'hist', 'input_mode', 'players']

// Hist values: 100–1500 in steps of 100
function isValidHist(s) {
  if (s === '' || s == null) return true  // empty → will use default
  const n = parseInt(s)
  return !isNaN(n) && n >= 100 && n <= 1500 && n % 100 === 0
}

function HistInput({ label, value, onChange, error, t }) {
  return (
    <div>
      <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder="200"
        autoComplete="off"
        style={{ width: '100%' }}
      />
      {error && (
        <p style={{ fontSize: 12, color: 'var(--orange)', marginTop: 5 }}>
          {t('hist_value_error')}
        </p>
      )}
    </div>
  )
}

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
    histValue: 200,
    histValueShort: 200,
    histValueLong: 500,
    inputMode: 'single',
  })
  const [names, setNames] = useState(['', '', '', ''])

  // Local string states for hist number inputs — lets user type freely,
  // separate from the validated number in settings
  const [histValStr, setHistValStr] = useState('200')
  const [histShortStr, setHistShortStr] = useState('200')
  const [histLongStr, setHistLongStr] = useState('500')

  useEffect(() => {
    generateRoomCode().then(code => { setRoomCode(code); setLoading(false) })
  }, [])

  // If game mode changes to 9cards, 'mix' is not valid — reset to 'custom'
  useEffect(() => {
    if (settings.gameMode !== 'classic' && settings.histType === 'mix') {
      setSettings(s => ({ ...s, histType: 'custom' }))
    }
  }, [settings.gameMode, settings.histType])

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }))

  const histValErr = !isValidHist(histValStr) && histValStr !== ''
  const histShortErr = !isValidHist(histShortStr) && histShortStr !== ''
  const histLongErr = !isValidHist(histLongStr) && histLongStr !== ''

  const canNext = () => {
    if (step === 2) {
      if (settings.histType === 'custom') return !histValErr
      if (settings.histType === 'mix') return !histShortErr && !histLongErr
      return true  // 'special'
    }
    if (step === 4) return names.every(n => n.trim().length > 0)
    return true
  }

  // Commit hist string values to settings before advancing from step 2
  const handleNext = () => {
    if (step === 2) {
      if (settings.histType === 'custom') {
        set('histValue', parseInt(histValStr) || 200)
      } else if (settings.histType === 'mix') {
        set('histValueShort', parseInt(histShortStr) || 200)
        set('histValueLong', parseInt(histLongStr) || 500)
      }
    }
    setStep(s => s + 1)
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
            {/* Mix only available in Classic mode */}
            {settings.gameMode === 'classic' && (
              <OptionCard selected={settings.histType === 'mix'} onClick={() => set('histType', 'mix')}
                title={t('hist_mix')} desc={t('hist_mix_desc')} />
            )}

            {/* Fixed penalty amount input */}
            {settings.histType === 'custom' && (
              <div style={{ marginTop: 4 }}>
                <HistInput
                  label={t('hist_value_label')}
                  value={histValStr}
                  onChange={v => {
                    setHistValStr(v)
                    if (isValidHist(v)) set('histValue', parseInt(v) || 200)
                  }}
                  error={histValErr}
                  t={t}
                />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5 }}>
                  {t('hist_value_hint')}
                </p>
              </div>
            )}

            {/* Mix: two inputs for short and long hands */}
            {settings.histType === 'mix' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
                <HistInput
                  label={t('hist_short_label')}
                  value={histShortStr}
                  onChange={v => {
                    setHistShortStr(v)
                    if (isValidHist(v)) set('histValueShort', parseInt(v) || 200)
                  }}
                  error={histShortErr}
                  t={t}
                />
                <HistInput
                  label={t('hist_long_label')}
                  value={histLongStr}
                  onChange={v => {
                    setHistLongStr(v)
                    if (isValidHist(v)) set('histValueLong', parseInt(v) || 500)
                  }}
                  error={histLongErr}
                  t={t}
                />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {t('hist_value_hint')}
                </p>
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
            {names.map((name, i) => (
              <div key={i}>
                {settings.playerMode === 'couples' && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
                    color: (i === 0 || i === 2) ? '#7C3AED' : '#0D9488',
                    marginBottom: 4, textTransform: 'uppercase',
                  }}>
                    {(i === 0 || i === 2) ? t('team_a') : t('team_b')}
                  </div>
                )}
                <input
                  type="text"
                  placeholder={t('player_name', { n: i + 1 })}
                  value={name}
                  onChange={e => setNames(ns => ns.map((n, j) => j === i ? e.target.value : n))}
                  autoComplete="off"
                />
              </div>
            ))}
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
            width: i === step ? 24 : 8, height: 8, borderRadius: 4,
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
        onClick={step < STEPS.length - 1 ? handleNext : handleConfirm}
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
