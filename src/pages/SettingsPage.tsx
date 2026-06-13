import { useEffect, useState } from 'react'
import { Building2, CreditCard, Receipt, User, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import type { Company } from '../types/database'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HRK']

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
        <div className="p-2 bg-blue-50 rounded-lg"><Icon className="w-4 h-4 text-blue-600" /></div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const { company, isAdmin, loading, refetch } = useCompany()
  const { t } = useLanguage()
  const s = t.settings
  const [form, setForm] = useState<Partial<Company>>({})
  const [saving, setSaving] = useState<string | null>(null)

  // Personal profile
  const [profile, setProfile] = useState({ first_name: '', last_name: '', phone: '' })
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [members, setMembers] = useState<{ id: string; first_name: string; last_name: string }[]>([])

  useEffect(() => { if (company) setForm(company) }, [company])

  useEffect(() => {
    if (!company || !isAdmin) return
    supabase.from('users').select('id, first_name, last_name').eq('company_id', company.id).order('first_name')
      .then(({ data }) => setMembers(data ?? []))
  }, [company, isAdmin])

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setProfileUserId(user.id)
      const { data } = await supabase.from('users').select('first_name, last_name, phone').eq('id', user.id).single()
      if (data) setProfile({ first_name: data.first_name ?? '', last_name: data.last_name ?? '', phone: data.phone ?? '' })
    }
    loadProfile()
  }, [])

  async function saveProfile() {
    if (!profileUserId) return
    setSaving('personal')
    const { error } = await supabase.from('users').update({ ...profile, updated_at: new Date().toISOString() }).eq('id', profileUserId)
    setSaving(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.saved)
  }

  function field(key: keyof Company) {
    return {
      value: (form[key] as string) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value })),
    }
  }

  async function save(section: string, fields: (keyof Company)[]) {
    if (!company) return
    setSaving(section)
    const patch = Object.fromEntries(fields.map(k => [k, form[k] ?? null]))
    const { error } = await supabase.from('companies').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', company.id)
    setSaving(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.saved)
    refetch()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>
        <p className="text-gray-500 text-sm mt-1">{s.subtitle}</p>
      </div>

      <div className="flex flex-col gap-5">
        {/* Personal profile */}
        <Section icon={User} title={s.personalProfile}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input id="first_name" label={s.firstName}
              value={profile.first_name}
              onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))} />
            <Input id="last_name" label={s.lastName}
              value={profile.last_name}
              onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))} />
          </div>
          <div className="mt-4 flex justify-end">
            <Button loading={saving === 'personal'} onClick={saveProfile}>{t.common.save}</Button>
          </div>
        </Section>

        <Section icon={Building2} title={s.companyProfile}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input id="name" label={s.companyName} {...field('name')} />
            </div>
            <Input id="email" label={t.common.email} type="email" {...field('email')} />
            <Input id="phone" label={t.common.phone} {...field('phone')} />
            <div className="col-span-2">
              <Input id="tax_id" label={s.vatTaxId} {...field('tax_id')} />
            </div>
            <Input id="address_street" label={t.common.streetAddress} {...field('address_street')} />
            <Input id="address_city" label={t.common.city} {...field('address_city')} />
            <Input id="address_postal_code" label={t.common.postalCode} {...field('address_postal_code')} />
            <Input id="address_country" label={t.common.country} {...field('address_country')} />
          </div>
          <div className="mt-4 flex justify-end">
            <Button loading={saving === 'profile'} onClick={() => save('profile', ['name', 'email', 'phone', 'tax_id', 'address_street', 'address_city', 'address_postal_code', 'address_country'])}>
              {t.common.save}
            </Button>
          </div>
        </Section>

        <Section icon={Receipt} title={s.poSettings}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{s.currency}</label>
              <select value={form.currency ?? 'EUR'} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <Input id="po_prefix" label={s.poPrefix} {...field('po_prefix')} />
            <Input id="po_next_number" label={s.nextPoNumber} type="number"
              value={form.po_next_number?.toString() ?? '1'}
              onChange={e => setForm(f => ({ ...f, po_next_number: parseInt(e.target.value) || 1 }))}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {s.nextPoWillBe}: <span className="font-mono text-gray-600">{form.po_prefix ?? 'PO'}-{String(form.po_next_number ?? 1).padStart(4, '0')}</span>
          </p>
          <div className="mt-4 flex justify-end">
            <Button loading={saving === 'po'} onClick={() => save('po', ['currency', 'po_prefix', 'po_next_number'])}>
              {t.common.save}
            </Button>
          </div>
        </Section>

        <Section icon={CreditCard} title={s.bankDetails}>
          <p className="text-xs text-gray-400 mb-4">{s.bankHint}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input id="bank_name" label={s.bankName} {...field('bank_name')} />
            <Input id="bank_iban" label={s.iban} {...field('bank_iban')} />
          </div>
          <div className="mt-4 flex justify-end">
            <Button loading={saving === 'bank'} onClick={() => save('bank', ['bank_name', 'bank_iban'])}>
              {t.common.save}
            </Button>
          </div>
        </Section>

        {isAdmin && (
          <Section icon={ShieldCheck} title={s.approvalsSettings}>
            <p className="text-xs text-gray-400 mb-4">{s.approvalsSettingsHint}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input id="approval_second_over" label={s.secondApprovalOver} type="number"
                value={form.approval_second_over?.toString() ?? ''}
                onChange={e => setForm(f => ({ ...f, approval_second_over: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{s.secondApprover}</label>
                <select value={form.second_approver_id ?? ''}
                  onChange={e => setForm(f => ({ ...f, second_approver_id: e.target.value || null }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">{s.selectApprover}</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 mt-4 text-sm text-gray-700">
              <input type="checkbox" checked={form.team_edit_requests ?? false}
                onChange={e => setForm(f => ({ ...f, team_edit_requests: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              {s.teamEditRequests}
            </label>
            <div className="mt-4 flex justify-end">
              <Button loading={saving === 'approvals'} onClick={() => save('approvals', ['approval_second_over', 'second_approver_id', 'team_edit_requests'])}>
                {t.common.save}
              </Button>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}
