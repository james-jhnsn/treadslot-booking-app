import type { AvailableSlot } from '../types/database'

interface Props {
  slot: AvailableSlot
  onBook: (slot: AvailableSlot) => void
  isBooking: boolean
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

export function SlotCard({ slot, onBook, isBooking }: Props) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <p className="card-title">{formatSlotTime(slot.starts_at)}</p>
          <p className="card-sub">
            {slot.service_name} &middot; {slot.duration_min} min
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => onBook(slot)}
          disabled={isBooking}
        >
          {isBooking ? 'Booking…' : 'Book'}
        </button>
      </div>
    </div>
  )
}
