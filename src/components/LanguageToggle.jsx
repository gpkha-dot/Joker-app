import { useTranslation } from 'react-i18next'

export default function LanguageToggle() {
  const { t, i18n } = useTranslation()
  const toggle = () => {
    const next = i18n.language === 'en' ? 'ka' : 'en'
    i18n.changeLanguage(next)
    localStorage.setItem('joker_lang', next)
  }
  return (
    <button onClick={toggle} style={{
      background: 'var(--surface-light)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-badge)',
      color: 'var(--text-primary)',
      padding: '6px 14px',
      fontSize: '14px',
      fontFamily: 'Outfit, sans-serif',
      fontWeight: 500,
    }}>
      {t('lang_toggle')}
    </button>
  )
}
