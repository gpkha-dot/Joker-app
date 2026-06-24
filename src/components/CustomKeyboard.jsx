const KEYS = ['7','8','9','4','5','6','1','2','3','←','0','✓']

export default function CustomKeyboard({ onKey, value, maxVal }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 6,
      padding: 8,
      background: 'var(--surface)',
      height: '100%',
    }}>
      {KEYS.map(k => {
        const isConfirm = k === '✓'
        const isBack = k === '←'
        const disabled = !isBack && !isConfirm && maxVal != null && parseInt(k) > maxVal
        return (
          <button
            key={k}
            onClick={() => !disabled && onKey(k)}
            disabled={disabled}
            style={{
              background: isConfirm ? 'var(--blue)' : isBack ? 'var(--surface-light)' : 'var(--surface-light)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-badge)',
              fontSize: isConfirm ? 20 : 22,
              fontFamily: isConfirm ? 'inherit' : 'Inter, sans-serif',
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
              border: '1px solid var(--border)',
              padding: 0,
              aspectRatio: 'auto',
            }}
          >
            {k}
          </button>
        )
      })}
    </div>
  )
}
