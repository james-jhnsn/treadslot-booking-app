import { useState } from 'react'
import { useAvailableSlots } from '../hooks/useAvailableSlots'
import { useCreateBooking } from '../hooks/useCreateBooking'
import { SlotCard } from '../components/SlotCard'
import type { AvailableSlot } from '../types/database'

interface ConfirmationState {
  slot: AvailableSlot
  message: string | null
}

export function SlotsPage() {
  const { data: slots, isLoading, error, refetch } = useAvailableSlots()
  const createBooking = useCreateBooking()

  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)

  function handleBook(slot: AvailableSlot) {
    setBookingError(null)
    setConfirmation(null)

    createBooking.mutate(
      {
        slotId: slot.id,
        startsAt: slot.starts_at,
        serviceName: slot.service_name,
      },
      {
        onSuccess: ({ confirmationMessage }) => {
          setConfirmation({ slot, message: confirmationMessage })
        },
        onError: (err) => {
          if (err.message === 'SLOT_TAKEN') {
            setBookingError(
              'That slot was just taken by someone else. The list has been refreshed — please choose another.',
            )
            // Cache is already invalidated by the mutation's onSuccess path
            // not running, but we explicitly refetch so the user sees current data.
            void refetch()
          } else {
            setBookingError(err.message)
          }
        },
      },
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Available Slots</h1>
        <p>Mobile Tire Installation · 60 minutes · We come to you</p>
      </div>

      {confirmation && (
        <div className="success-box" style={{ marginBottom: 20 }}>
          <h2>Booking confirmed!</h2>
          {confirmation.message && (
            <p style={{ marginTop: 8, fontSize: '0.9rem' }}>{confirmation.message}</p>
          )}
          <button
            className="btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => setConfirmation(null)}
          >
            Done
          </button>
        </div>
      )}

      {bookingError && (
        <p className="error-msg" style={{ marginBottom: 16 }}>
          {bookingError}
        </p>
      )}

      {isLoading && <p className="loading-text">Loading available slots…</p>}

      {error && (
        <p className="error-msg">
          Failed to load slots: {error.message}
        </p>
      )}

      {!isLoading && !error && slots?.length === 0 && (
        <div className="empty-state">
          <p>No available slots right now.</p>
          <p>Check back soon or contact us to arrange a custom time.</p>
        </div>
      )}

      {slots && slots.length > 0 && (
        <div className="card-list">
          {slots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              onBook={handleBook}
              isBooking={createBooking.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}
