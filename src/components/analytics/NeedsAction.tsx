import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { cn } from '../../lib/cn'
import { isLow, type StockRow } from '../../lib/stock'

interface Card { key: string; label: string; count: number; to: string }

/** The things that wait for the signed-in person, each one a click away from the list it is about. */
export default function NeedsAction() {
  const { company, profile, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const d = t.dashboard
  const [cards, setCards] = useState<Card[] | null>(null)

  useEffect(() => {
    if (!company || !profile) return
    let cancelled = false
    ;(async () => {
      const cid = company.id
      const today = new Date().toISOString().slice(0, 10)
      const count = (q: PromiseLike<{ count: number | null }>) => q.then(r => r.count ?? 0)
      const head = { count: 'exact' as const, head: true }
      const canInvoices = isAdmin || hasPerm('invoices', 'approve')
      const canSeeStock = isAdmin || hasPerm('stock', 'view')
      const canSeeOrders = isAdmin || hasPerm('purchase_orders', 'view')

      let pending = supabase.from('requests').select('*', head).eq('company_id', cid).eq('status', 'pending')
      if (!isAdmin) pending = pending.eq('approver_id', profile.id)
      const [approvals, noOrder, toReceive, lateDelivery, review, overdue, stock, sourcing] = await Promise.all([
        count(pending),
        count(supabase.from('requests').select('*', head).eq('company_id', cid).eq('status', 'approved').is('po_id', null)),
        count(supabase.from('purchase_orders').select('*', head).eq('company_id', cid).eq('status', 'sent').neq('received_status', 'full')),
        count(supabase.from('purchase_orders').select('*', head).eq('company_id', cid).eq('status', 'sent').neq('received_status', 'full').lt('expected_delivery_date', today)),
        canInvoices ? count(supabase.from('invoices').select('*', head).eq('company_id', cid).eq('status', 'in_review')) : Promise.resolve(0),
        canInvoices ? count(supabase.from('invoices').select('*', head).eq('company_id', cid).eq('status', 'approved').lt('due_date', today)) : Promise.resolve(0),
        canSeeStock ? supabase.rpc('stock_overview').then(r => ((r.data ?? []) as StockRow[]).filter(isLow).length) : Promise.resolve(0),
        canSeeOrders ? count(supabase.from('sourcing_events').select('*', head).eq('company_id', cid).in('status', ['sent', 'evaluation']).lt('deadline', today)) : Promise.resolve(0),
      ])
      if (cancelled) return
      setCards([
        { key: 'approvals', label: d.naApprovals, count: approvals, to: '/approvals' },
        { key: 'noOrder', label: d.naNoOrder, count: noOrder, to: '/requests' },
        { key: 'toReceive', label: d.naToReceive, count: toReceive, to: '/receipts' },
        { key: 'late', label: d.naLateDelivery, count: lateDelivery, to: '/receipts' },
        { key: 'review', label: d.naInvoiceReview, count: review, to: '/invoices' },
        { key: 'overdue', label: d.naInvoiceOverdue, count: overdue, to: '/invoices' },
        { key: 'stock', label: d.belowMinStock, count: stock, to: '/stock' },
        { key: 'sourcing', label: d.naSourcing, count: sourcing, to: '/sourcing' },
      ])
    })()
    return () => { cancelled = true }
  }, [company, profile, isAdmin])

  if (!cards) return null
  const open = cards.filter(c => c.count > 0)

  return (
    <div className="mb-5">
      <h2 className="text-[15px] font-semibold text-ink mb-3">{d.needsAction}</h2>
      {open.length === 0 ? (
        <p className="text-sm text-ink2">{d.needsNothing}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {open.map(c => (
            <Link key={c.key} to={c.to}
              className={cn('flex items-center gap-3 rounded-lg border px-4 py-3 text-sm bg-white hover:border-field-hover transition-colors', c.key === 'late' || c.key === 'overdue' ? 'border-danger/40' : 'border-line')}>
              <span className={cn('text-lg font-semibold tabular-nums', c.key === 'late' || c.key === 'overdue' ? 'text-danger' : 'text-ink')}>{c.count}</span>
              <span className="text-ink2 max-w-[180px] leading-tight">{c.label}</span>
              <ArrowRight className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
