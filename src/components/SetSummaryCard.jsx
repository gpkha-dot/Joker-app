import { useTranslation } from 'react-i18next'

export default function SetSummaryCard({ bonus, playerNames, onClose, isCouples }) {
  const { t } = useTranslation()
  const { perfect, bonuses, penalties, setIndex, setTotals } = bonus

  const teamATotal = setTotals ? setTotals[0] + setTotals[2] : null
  const teamBTotal = setTotals ? setTotals[1] + setTotals[3] : null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '16px 24px',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-card)',
        padding: 24, maxWidth: 400, width: '100%',
        border: '1px solid var(--border)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 20, marginBottom: 4, color: 'var(--blue)' }}>
          {t('set_summary_title', { n: setIndex + 1 })}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
          {t('perfect_round')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {playerNames.map((name, i) => {
            const hasPerfect = perfect.includes(i)
            const bonus_ = bonuses[i]
            const penalty = penalties[i]
            const setTotal = setTotals?.[i]

            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', background: 'var(--surface-light)',
                borderRadius: 10,
                border: `1px solid ${hasPerfect ? 'var(--blue)' : penalty > 0 ? 'var(--orange)' : 'var(--border)'}`,
              }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 15 }}>{name}</p>
                  {hasPerfect && (
                    <p style={{ fontSize: 12, color: 'var(--blue)', marginTop: 2 }}>{t('bonus_doubled')}</p>
                  )}
                  {penalty > 0 && !hasPerfect && (
                    <p style={{ fontSize: 12, color: 'var(--orange)', marginTop: 2 }}>{t('penalty_lost')}</p>
                  )}
                  {setTotal != null && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {t('set_score')}: <strong style={{ color: 'var(--text-primary)' }}>{(setTotal / 100).toFixed(1)}</strong>
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {bonus_ > 0 && (
                    <p style={{ color: 'var(--blue)', fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                      +{(bonus_ / 100).toFixed(1)}
                    </p>
                  )}
                  {penalty > 0 && (
                    <p style={{ color: 'var(--orange)', fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                      −{(penalty / 100).toFixed(1)}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {isCouples && teamATotal != null && teamBTotal != null && (
          <div style={{ marginBottom: 20 }}>
            <p style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.6px', color: 'var(--text-secondary)', marginBottom: 10,
            }}>
              {t('team_total')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { label: t('team_a'), value: teamATotal, color: '#7C3AED', bg: 'rgba(124,58,237,0.1)' },
                { label: t('team_b'), value: teamBTotal, color: '#0D9488', bg: 'rgba(13,148,136,0.1)' },
              ].map(team => (
                <div key={team.label} style={{
                  flex: 1, padding: '12px 14px', borderRadius: 10,
                  background: team.bg, border: `1px solid ${team.color}40`,
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: team.color, marginBottom: 4 }}>{team.label}</p>
                  <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 22, color: team.color, fontVariantNumeric: 'tabular-nums' }}>
                    {(team.value / 100).toFixed(1)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

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
