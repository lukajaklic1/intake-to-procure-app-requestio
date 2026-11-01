import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { differenceInCalendarDays, format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../hooks/useLanguage'
import { cn } from '../../lib/cn'
import { money, periodStart, type AFilters } from '../../lib/analytics'
import { Card, HBars, Kpi } from './shared'

interface Props { companyId: string; currency: string; filters: AFilters }
interface Inv { subtotal: number; total_amount: number; status: string; invoice_date: string; due_date: string | null; po_id: string | null; match_status: string; suppliers: { name: string } | null }

/** Invoices: how much was invoiced, with or without an order, how well it matched, and what is still to pay. */
export default function InvoicesTab({ companyId, currency, filters }: Props) {
  const { t } = useLanguage()
  const d = t.dashboard
  const [rows, setRows] = useState<Inv[]>([])
  const [unpaid, setUnpaid] = useState<Inv[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const from = periodStart(filters.dateRange)?.toISOString().slice(0, 10) ?? null
      let q = supabase.from('invoices').select('subtotal, total_amount, status, invoice_date, due_date, po_id, match_status, suppliers(name)').eq('company_id', companyId).in('status', ['in_review', 'approved', 'paid'])
      if (filters.supplierId) q = q.eq('supplier_id', filters.supplierId)
      const { data } = await q
      if (cancelled) return
      const all = (data ?? []) as unknown as Inv[]
      setRows(all.filter(x => !from || x.invoice_date >= from))
      setUnpaid(all.filter(x => x.status !== 'paid'))
    })()
    return () => { cancelled = true }
  }, [companyId, filters.dateRange, filters.supplierId])

  const approved = rows.filter(r => r.status !== 'in_review')
  const invoiced = approved.reduce((n, r) => n + Number(r.subtotal), 0)
  const withPo = approved.filter(r => r.po_id).reduce((n, r) => n + Number(r.subtotal), 0)
  const matched = approved.filter(r => r.po_id && r.match_status === 'matched').length
  const poCount = approved.filter(r => r.po_id).length

  // what is still to pay (approved) by how late or soon it is due, plus what waits for approval
  const today = new Date()
  const aging = { overdue: 0, week: 0, month: 0, later: 0 }
  for (const r of unpaid.filter(x => x.status === 'approved')) {
    const days = r.due_date ? differenceInCalendarDays(new Date(r.due_date + 'T00:00:00'), today) : 999
    const amount = Number(r.subtotal)
    if (days < 0) aging.overdue += amount; else if (days <= 7) aging.week += amount; else if (days <= 30) aging.month += amount; else aging.later += amount
  }
  const toPay = aging.overdue + aging.week + aging.month + aging.later
  const inReview = unpaid.filter(x => x.status === 'in_review').reduce((n, r) => n + Number(r.subtotal), 0)

  const byMonth = Object.entries(approved.reduce<Record<string, number>>((acc, r) => { const m = r.invoice_date.slice(0, 7); acc[m] = (acc[m] ?? 0) + Number(r.subtotal); return acc }, {}))
    .sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month: format(new Date(month + '-01'), 'MMM yy'), amount }))
  const bySupplier = Object.entries(approved.reduce<Record<string, number>>((acc, r) => { const n = r.suppliers?.name ?? '-'; acc[n] = (acc[n] ?? 0) + Number(r.subtotal); return acc }, {}))
    .sort(([, a], [, b]) => b - a).slice(0, 10).map(([label, value]) => ({ label, value }))

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Kpi label={d.invoiced} value={money(invoiced, currency)} hint={`${approved.length} ${d.invoiceCount}`} to="/invoices" />
        <Kpi label={d.poBacked} value={invoiced > 0 ? `${Math.round((withPo / invoiced) * 100)} %` : '-'} hint={d.poBackedHint} />
        <Kpi label={d.matchRate} value={poCount > 0 ? `${Math.round((matched / poCount) * 100)} %` : '-'} hint={d.matchRateHint} tone={poCount > 0 && matched / poCount < 0.8 ? 'danger' : undefined} />
        <Kpi label={d.overdueInvoices} value={money(aging.overdue, currency)} tone={aging.overdue > 0 ? 'danger' : undefined} to="/invoices" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card title={d.invoicedByMonth}>
          {byMonth.length === 0 ? <p className="text-sm text-ink2">{d.noData}</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${Math.round(v / 100) / 10}k`} />
                <Tooltip formatter={(v) => money(Number(v), currency)} cursor={{ fill: 'var(--chart-cursor)' }} />
                <Bar dataKey="amount" name={d.invoiced} fill="var(--chart-bar-fill)" stroke="var(--chart-bar-stroke)" strokeWidth={1.5} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title={d.invoicedBySupplier}>
          {bySupplier.length === 0 ? <p className="text-sm text-ink2">{d.noData}</p> : <HBars rows={bySupplier} format={n => money(n, currency)} />}
        </Card>
      </div>

      <Card title={d.invoicesToPay} action={<Link to="/invoices" className="text-sm text-ink2 hover:text-ink">{t.nav.invoices}</Link>}>
        <div className="flex flex-col gap-3 max-w-xl">
          {([['overdue', d.agingOverdue, aging.overdue, 'bg-danger'], ['week', d.aging7, aging.week, 'bg-warn'], ['month', d.aging30, aging.month, 'bg-primary'], ['later', d.agingLater, aging.later, 'bg-icon']] as const).map(([k, label, amount, color]) => (
            <div key={k}>
              <div className="flex justify-between gap-3 text-sm mb-1"><span className="text-ink2">{label}</span><span className="tabular-nums text-ink">{money(amount, currency)}</span></div>
              <div className="h-1.5 rounded-full bg-selected overflow-hidden"><div className={cn('h-full rounded-full', color)} style={{ width: `${toPay > 0 ? Math.max(amount > 0 ? 3 : 0, (amount / toPay) * 100) : 0}%` }} /></div>
            </div>
          ))}
          <div className="flex justify-between gap-3 pt-3 border-t border-field text-[15px] font-semibold"><span>{d.toPayTotal}</span><span className="tabular-nums">{money(toPay, currency)}</span></div>
          {inReview > 0 && <p className="text-[13px] text-ink2">{d.invoicesInReview}: {money(inReview, currency)}</p>}
        </div>
      </Card>
    </>
  )
}
