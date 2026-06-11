import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { AvailableSlot } from '../types/database'

export function useAvailableSlots() {
  return useQuery<AvailableSlot[]>({
    queryKey: ['available-slots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('available_slots')
        .select('*')

      if (error) throw error
      return data
    },
  })
}
