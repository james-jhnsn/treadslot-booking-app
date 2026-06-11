import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface CreateBookingInput {
  slotId: string
  startsAt: string
  serviceName: string
}

interface CreateBookingResult {
  bookingId: string
  confirmationMessage: string | null
}

export function useCreateBooking() {
  const queryClient = useQueryClient()

  return useMutation<CreateBookingResult, Error, CreateBookingInput>({
    mutationFn: async ({ slotId, startsAt, serviceName }) => {
      // Get the current user. getUser() re-validates the JWT against Supabase
      // Auth so the user_id we pass is always the authenticated caller's.
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) throw new Error('Not authenticated')

      // Step 1: Insert the booking.
      // The partial unique index (slot_id WHERE status = 'booked') prevents
      // double-booking atomically at the database level. If two requests race,
      // one will succeed and the other receives Postgres error code 23505.
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({ slot_id: slotId, user_id: user.id })
        .select('id')
        .single()

      if (bookingError) {
        if (bookingError.code === '23505') {
          throw new Error('SLOT_TAKEN')
        }
        throw bookingError
      }

      // Step 2: Request a Claude-generated confirmation message via the
      // Netlify Function. The booking is already committed — a Claude failure
      // is non-fatal and the user still has their booking.
      let confirmationMessage: string | null = null
      try {
        const res = await fetch('/.netlify/functions/confirm-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startsAt, serviceName }),
        })
        if (res.ok) {
          const json = (await res.json()) as { message?: string }
          confirmationMessage = json.message ?? null
        }
      } catch {
        // Network error or function failure — log and continue
        console.warn('confirm-booking function unavailable; skipping AI message')
      }

      return { bookingId: booking.id, confirmationMessage }
    },

    onSuccess: () => {
      // Invalidate both caches so the UI reflects the newly booked slot.
      void queryClient.invalidateQueries({ queryKey: ['available-slots'] })
      void queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
    },
  })
}
