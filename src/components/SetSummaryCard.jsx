import { useTranslation } from 'react-i18next'

export default function SetSummaryCard({ bonus, playerNames, onClose }) {
  const { t } = useTranslation()
  const { perfect, bonuses, penalties, highestScores, setIndex } = bonus

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 24,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-card)',
        padding: 28, maxWidth: 400, width: '100%',
        border: '1px solid var(--border)',
      }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 20, marginBottom: 6, color: 'var(--blue)' }}>
          {t('set_summary_title', { n: setIndex + 1 })}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
          {t('perfect_round')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {playerNames.map((name, i) => {
            const hasPerfect = perfect.includes(i)
            const bonus_ = bonuses[i]
            const penalty = penalties[i]
            if (!hasPerfect && bonus_ === 0 && penalty === 0) return null
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', background: 'var(--surface-light)',
                borderRadius: 12, border: `1px solid ${hasPerfect ? 'var(--blue)' : penalty > 0 ? 'var(--orange)' : 'var(--border)'}`,
              }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 15 }}>{name}</p>
                  <p style={{ fontSize: 12, color: hasPerfect ? 'var(--blue)' : 'var(--orange)', marginTop: 2 }}>
                    {hasPerfect && t('bonus_doubled')}
                    {penalty > 0 && t('penalty_lost')}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {bonus_ > 0 && <p style={{ color: 'var(--blue)', fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>+{bonus_}</p>}
                  {penalty > 0 && <p style={{ color: 'var(--orange)', fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>−{penalty}</p>}
                </div>
              </div>
            )
          })}
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%', height: 48, background: 'var(--blue)', color: '#fff',
            borderRadius: 'var(--radius-btn)', fontSize: 16,
            fontFamily: 'Outfit, sans-serif', fontWeight: 700,
          }}
        >
          {t('next')}
        </button>
      </div>
    </div>
  )
}
