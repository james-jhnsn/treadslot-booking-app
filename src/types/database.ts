// Hand-written types that mirror the Supabase schema.
// In a production project these would be generated via:
//   supabase gen types typescript --project-id <ref> > src/types/supabase.ts

export interface Service {
  id: string
  name: string
  duration_min: number
}

export interface Slot {
  id: string
  service_id: string
  starts_at: string
}

export type BookingStatus = 'booked' | 'cancelled'

export interface Booking {
  id: string
  slot_id: string
  user_id: string
  status: BookingStatus
  created_at: string
}

// Shape returned by the available_slots view (slots joined with services)
export interface AvailableSlot {
  id: string
  starts_at: string
  service_id: string
  service_name: string
  duration_min: number
}

// Shape returned when bookings are queried with joined slot + service data
export interface BookingWithDetails {
  id: string
  slot_id: string
  status: BookingStatus
  created_at: string
  slots: {
    starts_at: string
    services: {
      name: string
      duration_min: number
    }
  } | null
}
