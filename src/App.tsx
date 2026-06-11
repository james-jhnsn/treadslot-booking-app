import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { NavBar } from './components/NavBar'
import { SignIn } from './pages/SignIn'
import { SlotsPage } from './pages/SlotsPage'
import { MyBookingsPage } from './pages/MyBookingsPage'

// One QueryClient for the lifetime of the app.
// Default staleTime of 0 means data is always considered stale after mount,
// which keeps the slot list fresh without manual polling.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <NavBar />
          <Routes>
            <Route path="/sign-in" element={<SignIn />} />
            <Route
              path="/slots"
              element={
                <ProtectedRoute>
                  <SlotsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-bookings"
              element={
                <ProtectedRoute>
                  <MyBookingsPage />
                </ProtectedRoute>
              }
            />
            {/* Default redirect: signed-in users go to /slots */}
            <Route path="*" element={<Navigate to="/slots" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
