import { Component, Show, createSignal } from 'solid-js'

const KEY = 'charluv:age-confirmed'

/**
 * 18+ confirmation gate shown once before entering. Persisted in localStorage.
 * Warm-dusk styling with the Charluv green, matching Discover.
 */
const AgeGate: Component = () => {
  const stored = () => {
    try {
      return localStorage.getItem(KEY) === 'yes'
    } catch {
      return false
    }
  }
  const [ok, setOk] = createSignal(stored())

  const confirm = () => {
    try {
      localStorage.setItem(KEY, 'yes')
    } catch {}
    setOk(true)
  }
  const leave = () => {
    window.location.href = 'https://www.google.com'
  }

  return (
    <Show when={!ok()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Age verification"
        style={{
          position: 'fixed',
          inset: '0',
          'z-index': '9999',
          display: 'grid',
          'place-items': 'center',
          padding: '1.5rem',
          'font-family': "'Lato', system-ui, sans-serif",
          color: 'oklch(0.94 0.02 75)',
          background:
            'radial-gradient(120% 90% at 80% -10%, oklch(0.3 0.08 350 / 0.7), transparent 60%), oklch(0.15 0.03 350)',
        }}
      >
        <div style={{ 'max-width': '32rem', 'text-align': 'center' }}>
          <div
            style={{
              'font-family': "'Fraunces', Georgia, serif",
              'font-size': 'clamp(2rem, 6vw, 3.25rem)',
              'line-height': '1',
              'letter-spacing': '-0.02em',
              'margin-bottom': '1rem',
            }}
          >
            Welcome to <span style={{ color: 'oklch(0.74 0.11 165)' }}>Charluv</span>
          </div>
          <p
            style={{ color: 'oklch(0.72 0.03 350)', 'line-height': '1.6', 'margin-bottom': '2rem' }}
          >
            Charluv is an adult AI companion platform that may contain mature, NSFW content. You
            must be 18 or older to enter. By continuing you confirm you are at least 18 and consent
            to viewing adult content.
          </p>
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              'justify-content': 'center',
              'flex-wrap': 'wrap',
            }}
          >
            <button
              onClick={confirm}
              style={{
                border: 'none',
                cursor: 'pointer',
                'font-weight': '700',
                padding: '0.8rem 1.8rem',
                'border-radius': '999px',
                background: 'oklch(0.74 0.11 165)',
                color: 'oklch(0.2 0.03 350)',
                'font-size': '1rem',
              }}
            >
              I'm 18 or older — Enter
            </button>
            <button
              onClick={leave}
              style={{
                cursor: 'pointer',
                padding: '0.8rem 1.8rem',
                'border-radius': '999px',
                background: 'transparent',
                border: '1px solid oklch(0.4 0.05 345 / 0.6)',
                color: 'oklch(0.72 0.03 350)',
                'font-size': '1rem',
              }}
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}

export default AgeGate
