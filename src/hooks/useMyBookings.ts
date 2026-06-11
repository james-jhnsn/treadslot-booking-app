import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BookingWithDetails } from '../types/database'

export function useMyBookings() {
  return useQuery<BookingWithDetails[]>({
    queryKey: ['my-bookings'],
    queryFn: async () => {
      // RLS ensures this query returns only the signed-in user's own rows —
      // no explicit user_id filter needed.
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          slot_id,
          status,
          created_at,
          confirmation_message,
          slots (
            starts_at,
            services (
              name,
              duration_min
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as BookingWithDetails[]
    },
  })
}
