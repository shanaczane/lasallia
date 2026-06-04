export default function Home() {
  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: 'var(--color-paper)' }}>

      {/* Color test */}
      <div className="flex gap-3 mb-8 flex-wrap">
        <div className="w-16 h-16 rounded-lg" style={{ backgroundColor: 'var(--color-green-700)' }} title="green-700" />
        <div className="w-16 h-16 rounded-lg" style={{ backgroundColor: 'var(--color-green-600)' }} title="green-600" />
        <div className="w-16 h-16 rounded-lg" style={{ backgroundColor: 'var(--color-gold-500)' }} title="gold-500" />
        <div className="w-16 h-16 rounded-lg" style={{ backgroundColor: 'var(--color-gold-600)' }} title="gold-600" />
        <div className="w-16 h-16 rounded-lg" style={{ backgroundColor: 'var(--color-ink-900)' }} title="ink-900" />
        <div className="w-16 h-16 rounded-lg border" style={{ backgroundColor: 'var(--color-ink-50)' }} title="ink-50" />
      </div>

      {/* Font test */}
      <div className="space-y-4">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-7xl)', color: 'var(--color-green-800)' }}>
          Lasallia
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', color: 'var(--color-ink-700)' }}>
          AI-Powered Smart Library System — Manrope body font
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-ink-500)' }}>
          call_number: CS.001.2024 — JetBrains Mono
        </p>
      </div>

      {/* Availability pills test */}
      <div className="flex gap-3 mt-8 flex-wrap">
        {[
          { label: 'Available', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
          { label: 'Borrowed', color: 'var(--color-borrowed)', bg: 'var(--color-borrowed-bg)' },
          { label: 'Reserved', color: 'var(--color-warn)', bg: 'var(--color-warn-bg)' },
          { label: 'Missing', color: 'var(--color-missing)', bg: 'var(--color-missing-bg)' },
        ].map(({ label, color, bg }) => (
          <span key={label} style={{
            backgroundColor: bg,
            color,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            letterSpacing: 'var(--tracking-micro)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
          }}>
            {label}
          </span>
        ))}
      </div>

    </main>
  )
}