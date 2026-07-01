import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
const effectiveSupabaseUrl = supabaseUrl || 'https://example.supabase.co'
const effectiveSupabaseAnonKey = supabaseAnonKey || 'missing-supabase-anon-key'

export const supabase = createClient(
  effectiveSupabaseUrl,
  effectiveSupabaseAnonKey
)

// Server-side admin client (bypasses RLS). Only use in server routes.
export const supabaseAdmin = typeof window === 'undefined' && isSupabaseConfigured && supabaseServiceRoleKey
  ? createClient(
      effectiveSupabaseUrl,
      supabaseServiceRoleKey,
      { auth: { persistSession: false } }
    )
  : null;
