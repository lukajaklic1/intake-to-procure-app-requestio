import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../hooks/useLanguage'
import { cn } from '../../lib/cn'
import { money, periodStart, type AFilters } from '../../lib/analytics'
import { Card, HBars, Kpi } from './shared'

interface Props { companyId: string; currency: string; filters: AFilters }
interface Saving { month: string; supplier: string; negotiated: number; sourcing: number }
interface Won { id: string; event_number: string; title: string; saving: number }

/** What procurement saved: discounts negotiated on orders and the difference between the baseline and the winning offer of a sourcing event. */
export default function SavingsTab({ companyId, currency, filters }: Props) {
  const { t } = useLanguage()
  const d = t.dashboard
  const [rows, setRows] = useState<Saving[]>([])
  const [won, setWon] = useState<Won[]>([])
  const [spend, setSpend] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const from = periodStart(filters.dateRange)?.toISOString() ?? null
      const { supplierId, departmentId } = filters
      let po = supabase.from('purchase_orders').select('negotiated_discount, total_amount, created_at, suppliers(name)').eq('company_id', companyId).in('status', ['issued', 'sent', 'closed'])
      let ev = supabase.from('sourcing_events').select('id, event_number, title, awarded_total, baseline_total, awarded_at, awarded_invitation_id').eq('company_id', companyId).eq('status', 'awarded')
      if (from) { po = po.gte('created_at', from); ev = ev.gte('awarded_at', from) }
      if (supplierId) po = po.eq('supplier_id', supplierId)
      if (departmentId) { po = po.eq('department_id', departmentId); ev = ev.eq('department_id', departmentId) }
      const [p, e] = await Promise.all([po, ev])
      if (cancelled) return

      const orders = (p.data ?? []) as unknown as { negotiated_discount: number | null; total_amount: number; created_at: string; suppliers: { name: string } | null }[]
      const events = ((e.data ?? []) as { id: string; event_number: string; title: string; awarded_total: number | null; baseline_total: number | null; awarded_at: string; awarded_invitation_id: string | null }[])
        .filter(x => x.awarded_total != null && x.baseline_total != null)
      // the supplier that won each event
      const invIds = events.map(x => x.awarded_invitation_id).filter(Boolean) as string[]
      const { data: inv } = invIds.length ? await supabase.from('sourcing_invitations').select('id, suppliers(name)').in('id', invIds) : { data: [] }
      const winner = new Map(((inv ?? []) as unknown as { id: string; suppliers: { name: string } | null }[]).map(x => [x.id, x.suppliers?.name ?? '-']))

      setSpend(orders.reduce((n, x) => n + Number(x.total_amount), 0))
      setRows([
        ...orders.filter(x => Number(x.negotiated_discount) > 0).map(x => ({ month: x.created_at.slice(0, 7), supplier: x.suppliers?.name ?? '-', negotiated: Number(x.negotiated_discount), sourcing: 0 })),
        ...events.map(x => ({ month: x.awarded_at.slice(0, 7), supplier: winner.get(x.awarded_invitation_id ?? '') ?? '-', negotiated: 0, sourcing: Number(x.baseline_total) - Number(x.awarded_total) })),
      ])
      setWon(events.map(x => ({ id: x.id, event_number: x.event_number, title: x.title, saving: Number(x.baseline_total) - Number(x.awarded_total) })).sort((a, b) => b.saving - a.saving))
    })()
    return () => { cancelled = true }
  }, [companyId, filters.dateRange, filters.supplierId, filters.departmentId])

  const negotiated = rows.reduce((n, r) => n + r.negotiated, 0)
  const sourcing = rows.reduce((n, r) => n + r.sourcing, 0)
  const total = negotiated + sourcing
  // the saving as a share of what the same purchases would have cost without it
  const rate = spend + total > 0 ? Math.round((total / (spend + total)) * 1000) / 10 : null

  const byMonth = Object.entries(rows.reduce<Record<string, { negotiated: number; sourcing: number }>>((acc, r) => {
    const m = (acc[r.month] ??= { negotiated: 0, sourcing: 0 }); m.negotiated += r.negotiated; m.sourcing += r.sourcing; return acc
  }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month: format(new Date(month + '-01'), 'MMM yy'), ...v }))

  const bySupplier = Object.entries(rows.reduce<Record<string, number>>((acc, r) => { acc[r.supplier] = (acc[r.supplier] ?? 0) + r.negotiated + r.sourcing; return acc }, {}))
    .filter(([, v]) => v !== 0).sort(([, a], [, b]) => b - a).slice(0, 10).map(([label, value]) => ({ label, value }))

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Kpi label={d.savingsTotal} value={money(total, currency)} tone={total > 0 ? 'success' : undefined} />
        <Kpi label={d.savingsNegotiated} value={money(negotiated, currency)} />
        <Kpi label={d.savingsSourcing} value={money(sourcing, currency)} tone={sourcing < 0 ? 'danger' : undefined} to="/sourcing" />
        <Kpi label={d.savingsRate} value={rate == null ? '-' : `${String(rate).replace('.', ',')} %`} hint={d.savingsRateHint} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card title={d.savingsByMonth}>
          {byMonth.length === 0 ? <p className="text-sm text-ink2">{d.noData}</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${Math.round(v / 100) / 10}k`} />
                <Tooltip formatter={(v) => money(Number(v), currency)} cursor={{ fill: 'var(--chart-cursor)' }} />
                <Bar dataKey="negotiated" name={d.savingsNegotiated} stackId="s" fill="var(--chart-bar-stroke)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="sourcing" name={d.savingsSourcing} stackId="s" fill="#7dd3a8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title={d.savingsBySupplier}>
          {bySupplier.length === 0 ? <p className="text-sm text-ink2">{d.noData}</p> : <HBars rows={bySupplier} format={n => money(n, currency)} color="bg-success" />}
        </Card>
      </div>

      {won.length > 0 && (
        <Card title={d.topSavings} action={<Link to="/sourcing" className="text-sm text-ink2 hover:text-ink">{t.nav.sourcing}</Link>}>
          <ul className="flex flex-col gap-1.5">
            {won.slice(0, 10).map(r => (
              <li key={r.id}>
                <Link to={`/sourcing/${r.id}`} className="flex items-center justify-between gap-3 text-sm hover:bg-surface rounded px-1 -mx-1 py-1 transition-colors">
                  <span className="truncate"><span className="text-ink2">{r.event_number}</span> <span className="text-ink">{r.title}</span></span>
                  <span className={cn('tabular-nums shrink-0', r.saving > 0 ? 'text-success font-medium' : r.saving < 0 ? 'text-danger' : 'text-ink2')}>{money(r.saving, currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
