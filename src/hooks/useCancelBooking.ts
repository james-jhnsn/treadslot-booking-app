import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useCancelBooking() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: async (bookingId) => {
      // The RLS UPDATE policy enforces:
      //   USING:      user_id = auth.uid() AND status = 'booked'
      //   WITH CHECK: user_id = auth.uid() AND status = 'cancelled'
      // A customer cannot cancel someone else's booking, and cannot set
      // any status other than 'cancelled'.
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)

      if (error) throw error
    },

    onSuccess: () => {
      // Refetch both lists so the cancelled slot reappears as available.
      void queryClient.invalidateQueries({ queryKey: ['available-slots'] })
      void queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
    },
  })
}
