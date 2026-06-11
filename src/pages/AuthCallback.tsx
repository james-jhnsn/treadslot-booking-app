import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Supabase returns errors as hash fragments (e.g. otp_expired)
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const hashError = hashParams.get('error_description') ?? hashParams.get('error')
    if (hashError) {
      setError(decodeURIComponent(hashError.replace(/\+/g, ' ')))
      return
    }

    // PKCE flow: exchange the auth code in the query string for a session
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setError(error.message)
        } else {
          navigate('/slots', { replace: true })
        }
      })
      return
    }

    // No code and no error — shouldn't normally reach here, send to sign-in
    navigate('/sign-in', { replace: true })
  }, [navigate])

  if (error) {
    return (
      <div className="page" style={{ maxWidth: 400 }}>
        <div className="error-msg" style={{ marginTop: 80 }}>
          <h2 style={{ marginBottom: 8 }}>Confirmation failed</h2>
          <p>{error}</p>
          <button
            className="btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => navigate('/sign-in')}
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <p className="loading-text" style={{ marginTop: 80 }}>Confirming your account…</p>
    </div>
  )
}
