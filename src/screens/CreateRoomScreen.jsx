import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { generateRoomCode, createRoom } from '../firebase/roomService'
import LanguageToggle from '../components/LanguageToggle'

function isValidHist(s) {
  if (s === '' || s == null) return true
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
        type="text" inputMode="numeric" value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder="200" autoComplete="off" style={{ width: '100%' }}
      />
      {error && <p style={{ fontSize: 12, color: 'var(--orange)', marginTop: 5 }}>{t('hist_value_error')}</p>}
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
        borderRadius: 'var(--radius-card)', padding: '16px 20px',
        textAlign: 'left', color: 'var(--text-primary)', width: '100%',
        cursor: 'pointer', transition: 'all var(--transition)',
      }}
    >
      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: selected ? 'rgba(255,255,255,0.75)' : 'var(--text-secondary)' }}>{desc}</div>
    </button>
  )
}

const BASE_STEPS = ['game_mode', 'player_mode', 'hist', 'input_mode']

export default function CreateRoomScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [roomCode, setRoomCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [settings, setSettings] = useState({
    gameMode: 'classic', playerMode: 'individual',
    histType: 'custom', histValue: 200,
    histValueShort: 200, histValueLong: 500,
    inputMode: 'each',
  })
  // Each mode: single creator name
  const [creatorName, setCreatorName] = useState('')
  // Single mode: all 4 names + which is creator
  const [names, setNames] = useState(['', '', '', ''])
  const [creatorIdx, setCreatorIdx] = useState(0)

  const [histValStr, setHistValStr] = useState('200')
  const [histShortStr, setHistShortStr] = useState('200')
  const [histLongStr, setHistLongStr] = useState('500')

  const isSingle = settings.inputMode === 'single'
  const isCouples = settings.playerMode === 'couples'

  // Dynamic steps based on input mode
  const steps = useMemo(() =>
    isSingle
      ? [...BASE_STEPS, 'all_names', 'choose_me']
      : [...BASE_STEPS, 'your_name'],
    [isSingle]
  )

  useEffect(() => {
    generateRoomCode().then(code => { setRoomCode(code); setLoading(false) })
  }, [])

  useEffect(() => {
    if (settings.gameMode !== 'classic' && settings.histType === 'mix') {
      setSetting('histType', 'custom')
    }
  }, [settings.gameMode, settings.histType])

  const setSetting = (key, val) => setSettings(s => ({ ...s, [key]: val }))

  const histValErr = !isValidHist(histValStr) && histValStr !== ''
  const histShortErr = !isValidHist(histShortStr) && histShortStr !== ''
  const histLongErr = !isValidHist(histLongStr) && histLongStr !== ''

  const canNext = () => {
    if (step === 2) {
      if (settings.histType === 'custom') return !histValErr
      if (settings.histType === 'mix') return !histShortErr && !histLongErr
      return true
    }
    const currentStep = steps[step]
    if (currentStep === 'your_name') return creatorName.trim().length > 0
    if (currentStep === 'all_names') return names.every(n => n.trim().length > 0)
    return true
  }

  const handleNext = () => {
    if (step === 2) {
      if (settings.histType === 'custom') setSetting('histValue', parseInt(histValStr) || 200)
      else if (settings.histType === 'mix') {
        setSetting('histValueShort', parseInt(histShortStr) || 200)
        setSetting('histValueLong', parseInt(histLongStr) || 500)
      }
    }
    setStep(s => s + 1)
  }

  const handleConfirm = async () => {
    if (!canNext()) return
    setCreating(true)
    setError('')
    try {
      let creatorSlot
      if (isSingle) {
        await createRoom(roomCode, settings, names, creatorIdx)
        creatorSlot = `p${creatorIdx + 1}`
      } else {
        await createRoom(roomCode, settings, creatorName.trim())
        creatorSlot = 'p1'
      }
      sessionStorage.setItem('joker_room', roomCode)
      sessionStorage.setItem('joker_slot', creatorSlot)
      navigate(`/room/${roomCode}/waiting`)
    } catch (e) {
      setError(e.message)
      setCreating(false)
    }
  }

  const renderStep = () => {
    switch (steps[step]) {
      case 'game_mode':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <OptionCard selected={settings.gameMode === 'classic'} onClick={() => setSetting('gameMode', 'classic')}
              title={t('mode_classic')} desc={t('mode_classic_desc')} />
            <OptionCard selected={settings.gameMode === '9cards'} onClick={() => setSetting('gameMode', '9cards')}
              title={t('mode_9cards')} desc={t('mode_9cards_desc')} />
          </div>
        )

      case 'player_mode':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <OptionCard selected={settings.playerMode === 'individual'} onClick={() => setSetting('playerMode', 'individual')}
              title={t('mode_individual')} desc={t('mode_individual_desc')} />
            <OptionCard selected={settings.playerMode === 'couples'} onClick={() => setSetting('playerMode', 'couples')}
              title={t('mode_couples')} desc={t('mode_couples_desc')} />
          </div>
        )

      case 'hist':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <OptionCard selected={settings.histType === 'custom'} onClick={() => setSetting('histType', 'custom')}
              title={t('hist_custom')} desc={t('hist_custom_desc')} />
            <OptionCard selected={settings.histType === 'special'} onClick={() => setSetting('histType', 'special')}
              title={t('hist_special')} desc={t('hist_special_desc')} />
            {settings.gameMode === 'classic' && (
              <OptionCard selected={settings.histType === 'mix'} onClick={() => setSetting('histType', 'mix')}
                title={t('hist_mix')} desc={t('hist_mix_desc')} />
            )}
            {settings.histType === 'custom' && (
              <div style={{ marginTop: 4 }}>
                <HistInput label={t('hist_value_label')} value={histValStr}
                  onChange={v => { setHistValStr(v); if (isValidHist(v)) setSetting('histValue', parseInt(v) || 200) }}
                  error={histValErr} t={t} />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5 }}>{t('hist_value_hint')}</p>
              </div>
            )}
            {settings.histType === 'mix' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
                <HistInput label={t('hist_short_label')} value={histShortStr}
                  onChange={v => { setHistShortStr(v); if (isValidHist(v)) setSetting('histValueShort', parseInt(v) || 200) }}
                  error={histShortErr} t={t} />
                <HistInput label={t('hist_long_label')} value={histLongStr}
                  onChange={v => { setHistLongStr(v); if (isValidHist(v)) setSetting('histValueLong', parseInt(v) || 500) }}
                  error={histLongErr} t={t} />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('hist_value_hint')}</p>
              </div>
            )}
          </div>
        )

      case 'input_mode':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <OptionCard selected={settings.inputMode === 'each'} onClick={() => setSetting('inputMode', 'each')}
              title={t('input_each')} desc={t('input_each_desc')} />
            <OptionCard selected={settings.inputMode === 'single'} onClick={() => setSetting('inputMode', 'single')}
              title={t('input_single')} desc={t('input_single_desc')} />
          </div>
        )

      case 'your_name':
        return (
          <div>
            <input
              type="text"
              placeholder={t('enter_name')}
              value={creatorName}
              onChange={e => setCreatorName(e.target.value)}
              autoComplete="off"
              autoFocus
              style={{ width: '100%', fontSize: 18 }}
            />
          </div>
        )

      case 'all_names':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {names.map((name, i) => (
              <div key={i}>
                {isCouples && (
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

      case 'choose_me':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {names.map((name, i) => (
              <OptionCard
                key={i}
                selected={creatorIdx === i}
                onClick={() => setCreatorIdx(i)}
                title={name || t('player_name', { n: i + 1 })}
                desc={`Player ${i + 1}${isCouples ? ` · ${(i === 0 || i === 2) ? t('team_a') : t('team_b')}` : ''}`}
              />
            ))}
          </div>
        )

      default:
        return null
    }
  }

  const stepTitles = {
    game_mode: t('step_game_mode'),
    player_mode: t('step_player_mode'),
    hist: t('step_hist'),
    input_mode: t('step_input_mode'),
    your_name: t('step_your_name'),
    all_names: t('step_players'),
    choose_me: t('step_choose_player'),
  }

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
            fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 48,
            letterSpacing: '12px', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums',
          }}>
            {roomCode}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{t('share_code')}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 24 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 24 : 8, height: 8, borderRadius: 4,
            background: i <= step ? 'var(--blue)' : 'var(--surface-light)',
            transition: 'all 200ms ease',
          }} />
        ))}
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: '24px 20px', marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, marginBottom: 20 }}>
          {stepTitles[steps[step]]}
        </h2>
        {renderStep()}
      </div>

      {error && <p style={{ color: 'var(--orange)', fontSize: 14, marginBottom: 12 }}>{error}</p>}

      <button
        onClick={step < steps.length - 1 ? handleNext : handleConfirm}
        disabled={!canNext() || creating || loading}
        style={{
          width: '100%', height: 52, background: 'var(--blue)', color: '#fff',
          borderRadius: 'var(--radius-btn)', fontSize: 17,
          fontFamily: 'Outfit, sans-serif', fontWeight: 700,
        }}
      >
        {step < steps.length - 1 ? t('next') : creating ? '…' : t('confirm')}
      </button>
    </div>
  )
}
