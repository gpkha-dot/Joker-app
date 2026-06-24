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
      padding: 24,
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 24, right: 24 }}>
        <LanguageToggle />
      </div>

      <div style={{ textAlign: 'center', marginBottom: 64 }}>
        <h1 style={{
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 700,
          fontSize: 'clamp(56px, 12vw, 96px)',
          color: 'var(--blue)',
          lineHeight: 1,
          letterSpacing: '-2px',
        }}>
          Joker
        </h1>
        <p style={{
          fontFamily: 'BPG Nino Mtavruli, sans-serif',
          fontSize: 'clamp(28px, 6vw, 48px)',
          color: 'var(--blue)',
          marginTop: 8,
          opacity: 0.85,
        }}>
          ჯოკერი
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 320 }}>
        <button
          onClick={() => navigate('/create')}
          style={{
            background: 'var(--blue)',
            color: '#fff',
            borderRadius: 'var(--radius-btn)',
            height: 56,
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
            height: 56,
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
