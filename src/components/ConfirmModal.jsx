import { useTranslation } from 'react-i18next'

export default function ConfirmModal({ title, message, confirmLabel, destructive = false, onConfirm, onCancel }) {
  const { t } = useTranslation()
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#2A2A3E',
          borderRadius: 16,
          padding: 28,
          maxWidth: 360,
          width: '100%',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <h2 style={{
          fontFamily: 'Outfit, sans-serif', fontWeight: 700,
          fontSize: 20, color: 'var(--text-primary)', marginBottom: 10,
        }}>
          {title}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.5, marginBottom: 28 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, height: 48,
              background: 'transparent',
              border: '2px solid var(--border)',
              borderRadius: 12,
              color: 'var(--text-primary)',
              fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 600,
            }}
          >
            {t('cancel_btn')}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, height: 48,
              background: destructive ? 'var(--orange)' : 'var(--blue)',
              borderRadius: 12,
              color: '#fff',
              fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              border: 'none',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
