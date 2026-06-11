import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Copy .env.example to .env.local and fill in your project values.',
  )
}

// Singleton Supabase client using the anon key.
// Access is restricted entirely by Row Level Security — the anon key alone
// grants no privilege beyond what RLS permits.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
