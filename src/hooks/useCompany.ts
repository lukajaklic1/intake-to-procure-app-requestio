import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Company, User as AppUser, UserPermission } from '../types/database'
import { useAuth } from './useAuth'

type PermAction = 'view' | 'create' | 'approve' | 'pay'
type PermColumn = `can_${PermAction}`

interface CompanyState {
  company: Company | null
  profile: AppUser | null
  loading: boolean
  isAdmin: boolean
  hasPerm: (module: UserPermission['module'], action: PermAction) => boolean
  refetch: () => void
}

export function useCompany(): CompanyState {
  const { session } = useAuth()
  const [company, setCompany] = useState<Company | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [permissions, setPermissions] = useState<UserPermission[]>([])
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
          const [{ data: compData }, { data: permData }] = await Promise.all([
            supabase.from('companies').select('*').eq('id', prof.company_id).single(),
            supabase.from('user_permissions').select('*').eq('user_id', prof.id),
          ])
          setCompany(compData as Company | null)
          setPermissions((permData as UserPermission[]) ?? [])
        }
        setLoading(false)
      })
  }, [session, tick])

  const isAdmin = !!profile?.is_admin

  function hasPerm(module: UserPermission['module'], action: PermAction): boolean {
    if (isAdmin) return true
    const perm = permissions.find(p => p.module === module)
    if (!perm) return false
    return !!perm[`can_${action}` as PermColumn]
  }

  return { company, profile, loading, isAdmin, hasPerm, refetch: () => setTick(t => t + 1) }
}
