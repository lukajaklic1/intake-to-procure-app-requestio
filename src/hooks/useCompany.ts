import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Company, User as AppUser } from '../types/database'
import { useAuth } from './useAuth'

interface CompanyState {
  company: Company | null
  profile: AppUser | null
  loading: boolean
  refetch: () => void
}

export function useCompany(): CompanyState {
  const { session } = useAuth()
  const [company, setCompany] = useState<Company | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!session) { setLoading(false); return }

    setLoading(true)
    supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(async ({ data }) => {
        const prof = data as AppUser | null
        setProfile(prof)
        if (prof) {
          const { data: compData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', prof.company_id)
            .single()
          setCompany(compData as Company | null)
        }
        setLoading(false)
      })
  }, [session, tick])

  return { company, profile, loading, refetch: () => setTick(t => t + 1) }
}
