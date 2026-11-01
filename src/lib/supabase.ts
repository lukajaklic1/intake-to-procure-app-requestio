import { createClient } from '@supabase/supabase-js'
import { refreshCounts } from './refreshCounts'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env.local file.')
}

// Every write to the database (insert, update, delete, function call) may change a counter in the sidebar,
// so the counters are refreshed after each one, no matter which page made it.
let refreshTimer: ReturnType<typeof setTimeout> | undefined
const fetchAndRefresh: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (res.ok && method !== 'GET' && method !== 'HEAD' && url.includes('/rest/v1/')) {
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(refreshCounts, 250)
  }
  return res
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchAndRefresh } })
