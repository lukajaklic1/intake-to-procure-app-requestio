import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../hooks/useLanguage'
import { cn } from '../../lib/cn'
import { loadBudgetUsage, usageOf, usedPercent } from '../../lib/budget'
import { avg, daysBetween, money, periodStart, type AFilters } from '../../lib/analytics'
import { BarFill } from '../../pages/BudgetsPage'
import { Card, Kpi } from './shared'

interface Props { companyId: string; currency: string; filters: AFilters; departments: { id: string; name: string }[] }
interface Stage { key: string; label: string; value: number; count: number; color: string }
interface BudgetRow { id: string; name: string; amount: number; ordered: number; requested: number }

/** From request to payment: how much is at each stage, how fast it moves, and the budget against the actual spend. */
export default function PurchasingTab({ companyId, currency, filters, departments }: Props) {
  const { t } = useLanguage()
  const d = t.dashboard
  const [stages, setStages] = useState<Stage[]>([])
  const [cycle, setCycle] = useState<{ approval: number | null; order: number | null; receipt: number | null }>({ approval: null, order: null, receipt: null })
  const [budget, setBudget] = useState<BudgetRow[]>([])
  const year = new Date().getFullYear()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const from = periodStart(filters.dateRange)?.toISOString() ?? null
      const { supplierId, departmentId } = filters

      let rq = supabase.from('requests').select('id, total_estimate, created_at, decided_at, po_id').eq('company_id', companyId).in('status', ['pending', 'approved', 'completed'])
      let po = supabase.from('purchase_orders').select('id, total_amount, created_at, supplier_id, department_id, request_id').eq('company_id', companyId).in('status', ['issued', 'sent', 'closed'])
      let rc = supabase.from('receipts').select('received_date, po_id, receipt_line_items(quantity_received, po_line_items(unit_price)), purchase_orders(supplier_id, department_id, created_at)').eq('company_id', companyId)
      let iv = supabase.from('invoices').select('subtotal, status, invoice_date, paid_at').eq('company_id', companyId).in('status', ['approved', 'paid'])
      let ap = supabase.from('approvals').select('request_id, created_at')   // no company column: the row security already limits it
      let bud = supabase.from('budgets').select('department_id, amount').eq('company_id', companyId).eq('year', year).is('category_id', null)
      if (from) { rq = rq.gte('created_at', from); po = po.gte('created_at', from); rc = rc.gte('received_date', from.slice(0, 10)); iv = iv.gte('invoice_date', from.slice(0, 10)) }
      if (supplierId) { rq = rq.eq('supplier_id', supplierId); po = po.eq('supplier_id', supplierId); iv = iv.eq('supplier_id', supplierId) }
      if (departmentId) { rq = rq.eq('department_id', departmentId); po = po.eq('department_id', departmentId); bud = bud.eq('department_id', departmentId) }

      const [r, p, c, i, a, b, usage] = await Promise.all([rq, po, rc, iv, ap, bud, loadBudgetUsage(year)])
      if (cancelled) return

      const requests = (r.data ?? []) as { id: string; total_estimate: number; created_at: string; decided_at: string | null; po_id: string | null }[]
      const orders = (p.data ?? []) as { id: string; total_amount: number; created_at: string; request_id: string | null }[]
      type Rcpt = { received_date: string; po_id: string; receipt_line_items: { quantity_received: number; po_line_items: { unit_price: number } | null }[]; purchase_orders: { supplier_id: string | null; department_id: string | null; created_at: string } | null }
      const receipts = ((c.data ?? []) as unknown as Rcpt[]).filter(x => (!supplierId || x.purchase_orders?.supplier_id === supplierId) && (!departmentId || x.purchase_orders?.department_id === departmentId))
      const invoices = (i.data ?? []) as { subtotal: number; status: string; paid_at: string | null }[]

      const receivedValue = receipts.reduce((n, x) => n + x.receipt_line_items.reduce((m, l) => m + Number(l.quantity_received) * Number(l.po_line_items?.unit_price ?? 0), 0), 0)
      const paid = invoices.filter(x => x.status === 'paid')
      setStages([
        { key: 'requested', label: d.fRequested, value: requests.reduce((n, x) => n + Number(x.total_estimate), 0), count: requests.length, color: 'bg-icon' },
        { key: 'ordered', label: d.fOrdered, value: orders.reduce((n, x) => n + Number(x.total_amount), 0), count: orders.length, color: 'bg-primary' },
        { key: 'received', label: d.fReceived, value: receivedValue, count: receipts.length, color: 'bg-primary' },
        { key: 'invoiced', label: d.fInvoiced, value: invoices.reduce((n, x) => n + Number(x.subtotal), 0), count: invoices.length, color: 'bg-primary' },
        { key: 'paid', label: d.fPaid, value: paid.reduce((n, x) => n + Number(x.subtotal), 0), count: paid.length, color: 'bg-success' },
      ])

      // how fast it moves: submitted -> approved, approved -> order, order -> first receipt
      const submitted = new Map<string, string>()
      for (const x of (a.data ?? []) as { request_id: string; created_at: string }[]) { const cur = submitted.get(x.request_id); if (!cur || x.created_at < cur) submitted.set(x.request_id, x.created_at) }
      const poCreated = new Map(orders.map(o => [o.id, o.created_at]))
      const firstReceipt = new Map<string, string>()
      for (const x of receipts) { const cur = firstReceipt.get(x.po_id); if (!cur || x.received_date < cur) firstReceipt.set(x.po_id, x.received_date) }
      setCycle({
        approval: avg(requests.filter(x => x.decided_at && submitted.has(x.id)).map(x => daysBetween(submitted.get(x.id)!, x.decided_at!))),
        order: avg(requests.filter(x => x.decided_at && x.po_id && poCreated.has(x.po_id)).map(x => daysBetween(x.decided_at!, poCreated.get(x.po_id!)!))),
        receipt: avg([...firstReceipt].filter(([id]) => poCreated.has(id)).map(([id, date]) => daysBetween(poCreated.get(id)!, date))),
      })

      setBudget(((b.data ?? []) as { department_id: string; amount: number }[]).filter(x => Number(x.amount) > 0).map(x => ({
        id: x.department_id, name: departments.find(y => y.id === x.department_id)?.name ?? '-', amount: Number(x.amount),
        ordered: usageOf(usage, x.department_id, null, 'ordered'), requested: usageOf(usage, x.department_id, null, 'requested'),
      })).sort((x, y) => usedPercent(y.ordered + y.requested, y.amount) - usedPercent(x.ordered + x.requested, x.amount)))
    })()
    return () => { cancelled = true }
  }, [companyId, filters.dateRange, filters.supplierId, filters.departmentId, departments])

  const top = Math.max(...stages.map(s => s.value), 0)
  const d1 = (n: number | null) => (n == null ? '-' : `${String(n).replace('.', ',')} ${d.daysShort}`)

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Kpi label={d.cycleApproval} value={d1(cycle.approval)} />
        <Kpi label={d.cycleOrder} value={d1(cycle.order)} />
        <Kpi label={d.cycleReceipt} value={d1(cycle.receipt)} />
      </div>

      <div className="mb-4">
        <Card title={d.funnel}>
          {top === 0 ? <p className="text-sm text-ink2">{d.noData}</p> : (
            <div className="flex flex-col gap-4">
              {stages.map((s, i) => (
                <div key={s.key}>
                  <div className="flex justify-between gap-3 text-sm mb-1.5">
                    <span className="text-ink font-medium">{s.label} <span className="text-ink2 font-normal">· {s.count}</span></span>
                    <span className="tabular-nums text-ink">{money(s.value, currency)}{i > 0 && stages[0].value > 0 && <span className="text-ink2 text-xs ml-2">{Math.round((s.value / stages[0].value) * 100)} %</span>}</span>
                  </div>
                  <div className="h-2 rounded-full bg-selected overflow-hidden"><div className={cn('h-full rounded-full', s.color)} style={{ width: `${Math.max(s.value > 0 ? 1.5 : 0, (s.value / top) * 100)}%` }} /></div>
                </div>
              ))}
              <p className="text-xs text-ink2 pt-1">{d.funnelHint}</p>
            </div>
          )}
        </Card>
      </div>

      {budget.length > 0 && (
        <Card title={`${d.budgetVsActual} ${year}`} action={<Link to="/budgets" className="text-sm text-ink2 hover:text-ink">{t.nav.budgets}</Link>}>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-[12.5px] font-medium text-ink2 border-b border-field">
              <th className="py-2 pr-3">{d.department}</th><th className="py-2 px-3 text-right">{t.budgets.budget}</th><th className="py-2 px-3 text-right">{t.budgets.ordered}</th><th className="py-2 px-3 text-right">{t.budgets.requested}</th><th className="py-2 px-3 text-right">{t.budgets.remaining}</th><th className="py-2 pl-3 w-48" />
            </tr></thead>
            <tbody className="divide-y divide-field">
              {budget.map(r => {
                const used = r.ordered + r.requested
                const pct = usedPercent(used, r.amount)
                return (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-3 font-medium text-ink">{r.name}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-ink">{money(r.amount, currency)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-ink2">{money(r.ordered, currency)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-ink2">{money(r.requested, currency)}</td>
                    <td className={cn('py-2.5 px-3 text-right tabular-nums', r.amount - used < 0 ? 'text-danger' : 'text-ink')}>{money(r.amount - used, currency)}</td>
                    <td className="py-2.5 pl-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-1.5 w-28 rounded-full bg-selected overflow-hidden shrink-0"><BarFill orderedPct={(r.ordered / r.amount) * 100} requestedPct={(r.requested / r.amount) * 100} /></div>
                        <span className={cn('text-xs tabular-nums', pct > 100 ? 'text-danger' : 'text-ink2')}>{pct} %</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </Card>
      )}
    </>
  )
}
