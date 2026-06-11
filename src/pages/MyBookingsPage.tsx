import { useState } from 'react'
import { useMyBookings } from '../hooks/useMyBookings'
import { useCancelBooking } from '../hooks/useCancelBooking'
import { BookingCard } from '../components/BookingCard'

export function MyBookingsPage() {
  const { data: bookings, isLoading, error } = useMyBookings()
  const cancelBooking = useCancelBooking()
  const [cancelError, setCancelError] = useState<string | null>(null)

  function handleCancel(bookingId: string) {
    setCancelError(null)
    cancelBooking.mutate(bookingId, {
      onError: (err) => setCancelError(err.message),
    })
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>My Bookings</h1>
        <p>Only your own bookings are shown.</p>
      </div>

      {cancelError && (
        <p className="error-msg" style={{ marginBottom: 16 }}>
          {cancelError}
        </p>
      )}

      {isLoading && <p className="loading-text">Loading your bookings…</p>}

      {error && (
        <p className="error-msg">
          Failed to load bookings: {error.message}
        </p>
      )}

      {!isLoading && !error && bookings?.length === 0 && (
        <div className="empty-state">
          <p>You have no bookings yet.</p>
        </div>
      )}

      {bookings && bookings.length > 0 && (
        <div className="card-list">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onCancel={handleCancel}
              isCancelling={cancelBooking.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}
