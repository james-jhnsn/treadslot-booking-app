import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function NavBar() {
  const { user, signOut } = useAuth()

  async function handleSignOut() {
    try {
      await signOut()
    } catch {
      // If sign-out fails the user is effectively still signed in;
      // there is nothing actionable to show in the nav.
    }
  }

  if (!user) return null

  return (
    <nav className="nav">
      <div className="nav-inner">
        <span className="nav-brand">TreadSlot</span>
        <div className="nav-links">
          <NavLink to="/slots" className="nav-link">
            Available Slots
          </NavLink>
          <NavLink to="/my-bookings" className="nav-link">
            My Bookings
          </NavLink>
          <button className="btn-ghost" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
