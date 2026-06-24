import { useTranslation } from 'react-i18next'

export default function RotatePrompt() {
  const { t } = useTranslation()
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 24, zIndex: 9999, padding: 32,
    }}>
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="12" y="8" width="28" height="48" rx="4" stroke="#2563EB" strokeWidth="3"/>
        <path d="M48 24 L56 32 L48 40" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 32 Q8 40 16 40" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" fill="none"/>
      </svg>
      <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--text-primary)', textAlign: 'center' }}>
        {t('rotate_prompt')}
      </p>
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
        {t('rotate_hint')}
      </p>
    </div>
  )
}
