import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { joinRoom, getRoomOnce } from '../firebase/roomService'
import LanguageToggle from '../components/LanguageToggle'

const PAD = ['1','2','3','4','5','6','7','8','9','←','0','✓']

export default function JoinRoomScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handlePad = k => {
    if (k === '←') { setCode(c => c.slice(0, -1)); return }
    if (k === '✓') { handleJoin(); return }
    if (code.length < 4) setCode(c => c + k)
  }

  const handleJoin = async () => {
    setError('')
    if (code.length !== 4) { setError(t('error_invalid_code')); return }
    if (!name.trim()) { setError(t('error_name_required')); return }
    setLoading(true)
    try {
      await getRoomOnce(code)
      const slot = await joinRoom(code, name.trim())
      sessionStorage.setItem('joker_room', code)
      sessionStorage.setItem('joker_slot', slot)
      navigate(`/room/${code}/waiting`)
    } catch (e) {
      setError(t(e.message === 'Room not found' ? 'error_room_not_found' : 'error_room_full'))
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: 24, maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 15, padding: '8px 0', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          ← {t('back')}
        </button>
        <LanguageToggle />
      </div>

      <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 28, marginBottom: 28, color: 'var(--text-primary)' }}>
        {t('join_room')}
      </h1>

      {/* Name input */}
      <div style={{ marginBottom: 28 }}>
        <input
          placeholder={t('enter_name')}
          value={name}
          onChange={e => setName(e.target.value)}
          autoComplete="off"
          style={{ fontSize: 17 }}
        />
      </div>

      {/* Code display */}
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-card)',
        padding: '24px 20px', marginBottom: 20, textAlign: 'center',
        border: '1px solid var(--border)',
      }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, fontFamily: 'Outfit, sans-serif' }}>{t('enter_code')}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 58, height: 68, background: 'var(--surface-light)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32, fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              color: code[i] ? 'var(--blue)' : 'var(--text-secondary)',
              border: `2px solid ${i === code.length ? 'var(--blue)' : 'var(--border)'}`,
              fontVariantNumeric: 'tabular-nums',
              transition: 'border-color var(--transition)',
            }}>
              {code[i] || ''}
            </div>
          ))}
        </div>
      </div>

      {/* Number pad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
        {PAD.map(k => {
          const isConfirm = k === '✓'
          return (
            <button
              key={k}
              onClick={() => handlePad(k)}
              style={{
                height: 54, background: isConfirm ? 'var(--blue)' : 'var(--surface)',
                color: 'var(--text-primary)', borderRadius: 'var(--radius-btn)',
                fontSize: isConfirm ? 22 : 22, fontFamily: 'Inter, sans-serif',
                fontWeight: 500, border: '1px solid var(--border)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {k}
            </button>
          )
        })}
      </div>

      {error && <p style={{ color: 'var(--orange)', fontSize: 14, textAlign: 'center', marginBottom: 12 }}>{error}</p>}

      <button
        onClick={handleJoin}
        disabled={loading || code.length !== 4 || !name.trim()}
        style={{
          width: '100%', height: 52, background: 'var(--blue)', color: '#fff',
          borderRadius: 'var(--radius-btn)', fontSize: 17,
          fontFamily: 'Outfit, sans-serif', fontWeight: 700,
        }}
      >
        {loading ? '…' : t('join')}
      </button>
    </div>
  )
}
