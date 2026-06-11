import type { BookingWithDetails } from '../types/database'

interface Props {
  booking: BookingWithDetails
  onCancel: (bookingId: string) => void
  isCancelling: boolean
}

function formatSlotTime(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoString))
}

export function BookingCard({ booking, onCancel, isCancelling }: Props) {
  const slot = booking.slots
  const service = slot?.services

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <p className="card-title">
            {slot ? formatSlotTime(slot.starts_at) : 'Unknown slot'}
          </p>
          <p className="card-sub">
            {service ? `${service.name} · ${service.duration_min} min` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span className={`badge badge-${booking.status}`}>
            {booking.status === 'booked' ? 'Booked' : 'Cancelled'}
          </span>
          {booking.status === 'booked' && (
            <button
              className="btn-danger"
              onClick={() => onCancel(booking.id)}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
