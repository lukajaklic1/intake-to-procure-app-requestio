import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import CountrySelect from '../components/ui/CountrySelect'
import type { Company } from '../types/database'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HRK']

/** One group of settings: a card with the title and explanation on top, the fields below and its own Save button at the bottom. */
function Section({ title, description, footer, saving, onSave, children }: {
  title: string
  description?: string
  footer?: React.ReactNode
  saving: boolean
  onSave: () => void
  children: React.ReactNode
}) {
  const { t } = useLanguage()
  return (
    <section className="bg-white rounded-lg border border-field form-skin">
      <div className="px-6 pt-5 pb-6">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="text-sm text-ink2 mt-1">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-field">
        <p className="text-[13px] text-ink2">{footer}</p>
        <Button loading={saving} onClick={onSave}>{t.common.save}</Button>
      </div>
    </section>
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

  if (loading && !company) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const memberOptions = [{ value: '', label: '-' }, ...members.map(m => ({ value: m.id, label: `${m.first_name} ${m.last_name}` }))]

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink tracking-tight">{s.title}</h1>
        <p className="text-sm text-ink2 mt-1">{s.subtitle}</p>
      </div>

      <div className="flex flex-col gap-5">
        {/* Personal profile */}
        <Section title={s.personalProfile} description={s.personalProfileHint} saving={saving === 'personal'} onSave={saveProfile}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input id="first_name" label={s.firstName}
              value={profile.first_name}
              onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))} />
            <Input id="last_name" label={s.lastName}
              value={profile.last_name}
              onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))} />
          </div>
        </Section>

        <Section title={s.companyProfile} description={s.companyProfileHint} saving={saving === 'profile'}
          onSave={() => save('profile', ['name', 'email', 'phone', 'tax_id', 'address_street', 'address_city', 'address_postal_code', 'address_country'])}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input id="name" label={s.companyName} {...field('name')} />
            </div>
            <Input id="email" label={t.common.email} type="email" {...field('email')} />
            <Input id="phone" label={t.common.phone} {...field('phone')} />
            <div className="sm:col-span-2">
              <Input id="tax_id" label={s.vatTaxId} {...field('tax_id')} />
            </div>
            <div className="sm:col-span-2">
              <Input id="address_street" label={t.common.streetAddress} {...field('address_street')} />
            </div>
            <Input id="address_postal_code" label={t.common.postalCode} {...field('address_postal_code')} />
            <Input id="address_city" label={t.common.city} {...field('address_city')} />
            <div className="sm:col-span-2">
              <CountrySelect id="address_country" label={t.common.country} value={(form.address_country as string) ?? ''} onChange={v => setForm(f => ({ ...f, address_country: v }))} />
            </div>
          </div>
        </Section>

        <Section title={s.poSettings} description={s.poSettingsHint} saving={saving === 'po'}
          onSave={() => save('po', ['currency', 'po_prefix', 'po_next_number'])}
          footer={<>{s.nextPoWillBe}: <span className="text-ink font-medium">{form.po_prefix ?? 'PO'}-{String(form.po_next_number ?? 1).padStart(4, '0')}</span></>}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select id="currency" label={s.currency} value={form.currency ?? 'EUR'}
              options={CURRENCIES.map(c => ({ value: c, label: c }))}
              onChange={v => setForm(f => ({ ...f, currency: v }))} />
            <Input id="po_prefix" label={s.poPrefix} {...field('po_prefix')} />
            <Input id="po_next_number" label={s.nextPoNumber} type="number"
              value={form.po_next_number?.toString() ?? '1'}
              onChange={e => setForm(f => ({ ...f, po_next_number: parseInt(e.target.value) || 1 }))}
            />
          </div>
        </Section>

        <Section title={s.bankDetails} description={s.bankHint} saving={saving === 'bank'}
          onSave={() => save('bank', ['bank_name', 'bank_iban'])}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input id="bank_name" label={s.bankName} {...field('bank_name')} />
            <Input id="bank_iban" label={s.iban} {...field('bank_iban')} />
          </div>
        </Section>

        {isAdmin && (
          <Section title={s.approvalsSettings} description={s.approvalsSettingsHint} saving={saving === 'approvals'}
            onSave={() => save('approvals', ['approver_id', 'approval_second_over', 'second_approver_id', 'team_edit_requests'])}>
            <div className="flex flex-col gap-4">
              <div className="sm:max-w-[calc(50%-0.5rem)]">
                <Select id="approver" label={s.approver} value={form.approver_id ?? ''} options={memberOptions} placeholder={s.selectApprover}
                  onChange={v => setForm(f => ({ ...f, approver_id: v || null }))} />
                <p className="text-xs text-ink2 mt-1.5 leading-4">{s.approverHint}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input id="approval_second_over" label={s.secondApprovalOver} type="number"
                  value={form.approval_second_over?.toString() ?? ''}
                  onChange={e => setForm(f => ({ ...f, approval_second_over: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                <Select id="second_approver" label={s.secondApprover} value={form.second_approver_id ?? ''} options={memberOptions} placeholder={s.selectApprover}
                  onChange={v => setForm(f => ({ ...f, second_approver_id: v || null }))} />
              </div>
              <label className="flex items-center gap-2.5 text-sm text-ink">
                <input type="checkbox" checked={form.team_edit_requests ?? false}
                  onChange={e => setForm(f => ({ ...f, team_edit_requests: e.target.checked }))}
                  className="rounded border-field text-accent focus:ring-accent" />
                {s.teamEditRequests}
              </label>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}
