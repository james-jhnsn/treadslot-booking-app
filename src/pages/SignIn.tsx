import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

type Mode = 'sign-in' | 'sign-up'

export function SignIn() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'sign-in') {
        await signIn(email, password)
        navigate('/slots', { replace: true })
      } else {
        await signUp(email, password)
        // Supabase may require email confirmation depending on project settings.
        // If email confirmation is disabled (recommended for this demo),
        // the user is signed in immediately and we redirect.
        // If it is enabled, we show a success message instead.
        setSignUpSuccess(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (signUpSuccess) {
    return (
      <div className="page" style={{ maxWidth: 400 }}>
        <div className="success-box" style={{ marginTop: 80 }}>
          <h2>Check your email</h2>
          <p style={{ marginTop: 8, fontSize: '0.9rem' }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account, then sign in.
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => { setMode('sign-in'); setSignUpSuccess(false) }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 400 }}>
      <div style={{ marginTop: 64 }}>
        <h1>TreadSlot</h1>
        <p style={{ color: 'var(--color-muted)', marginBottom: 32 }}>
          Mobile Tire Service — Book your installation slot
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="stack">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              required
              minLength={6}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? mode === 'sign-in' ? 'Signing in…' : 'Creating account…'
              : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: '0.875rem', color: 'var(--color-muted)' }}>
          {mode === 'sign-in' ? (
            <>
              No account?{' '}
              <button
                type="button"
                style={{ background: 'none', color: 'var(--color-primary)', fontWeight: 600, padding: 0, fontSize: 'inherit' }}
                onClick={() => { setMode('sign-up'); setError(null) }}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                style={{ background: 'none', color: 'var(--color-primary)', fontWeight: 600, padding: 0, fontSize: 'inherit' }}
                onClick={() => { setMode('sign-in'); setError(null) }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
