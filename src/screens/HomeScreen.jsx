import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageToggle from '../components/LanguageToggle'

export default function HomeScreen() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      position: 'relative',
      background: 'var(--bg)',
    }}>
      <div style={{ position: 'absolute', top: 24, right: 24 }}>
        <LanguageToggle />
      </div>

      <div style={{ textAlign: 'center', marginBottom: 72 }}>
        <h1 style={{
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 700,
          fontSize: 'clamp(64px, 14vw, 108px)',
          color: 'var(--blue)',
          lineHeight: 1,
          letterSpacing: '-3px',
        }}>
          Joker
        </h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 340 }}>
        <button
          onClick={() => navigate('/create')}
          style={{
            background: 'var(--blue)',
            color: '#fff',
            borderRadius: 'var(--radius-btn)',
            height: 58,
            fontSize: 18,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 700,
            letterSpacing: '0.3px',
          }}
        >
          {t('create_room')}
        </button>

        <button
          onClick={() => navigate('/join')}
          style={{
            background: 'transparent',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-btn)',
            height: 58,
            fontSize: 18,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 700,
            border: '2px solid var(--surface-light)',
          }}
        >
          {t('join_room')}
        </button>
      </div>
    </div>
  )
}
