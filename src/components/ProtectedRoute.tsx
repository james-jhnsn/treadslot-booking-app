import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

// Renders a full-page loading state while the initial session check is in
// flight, then redirects to /sign-in if there is no authenticated user.
// This prevents a flash of protected content on first load.
export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="page">
        <p className="loading-text">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/sign-in" replace />
  }

  return <>{children}</>
}
