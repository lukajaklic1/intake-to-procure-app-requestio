import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import PersonCell from '../components/ui/PersonCell'
import { Card, Field } from '../components/ui/DetailCard'
import ProjectBudgetStatus from '../components/budget/ProjectBudgetStatus'
import ProjectModal from '../components/projects/ProjectModal'
import { INVOICE_BADGE, statusLabel, type InvoiceStatus } from '../lib/invoices'
import type { Project } from '../types/database'

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : '')

interface ReqRow { id: string; request_number: string; title: string | null; total_estimate: number | null; status: string }
interface PoRow { id: string; po_number: string; total_amount: number | null; status: string; suppliers: { name: string } | null }
interface InvRow { id: string; kind: string; supplier_invoice_number: string; total_amount: number; status: InvoiceStatus; suppliers: { name: string } | null }

/** One project: its budget, who leads it, and every request, order and invoice that is booked to it. */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { company, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.projects
  const canManage = isAdmin || hasPerm('budgets', 'create')
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR' }).format(n)

  const [project, setProject] = useState<Project | null>(null)
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [requests, setRequests] = useState<ReqRow[]>([])
  const [orders, setOrders] = useState<PoRow[]>([])
  const [invoices, setInvoices] = useState<InvRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  async function load() {
    if (!company || !id) return
    const [pr, us, rq, po] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', company.id).order('first_name'),
      supabase.from('requests').select('id, request_number, title, total_estimate, status').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('purchase_orders').select('id, po_number, total_amount, status, suppliers(name)').eq('project_id', id).order('created_at', { ascending: false }),
    ])
    if (!pr.data) { toast.error(t.common.notFound); navigate('/projects'); return }
    setProject(pr.data as Project)
    setMembers((us.data ?? []).map(x => ({ id: x.id, name: `${x.first_name} ${x.last_name}` })))
    setRequests((rq.data as ReqRow[]) ?? [])
    const pos = (po.data as unknown as PoRow[]) ?? []
    setOrders(pos)
    // invoices booked to the project directly, and those of its orders
    const select = 'id, kind, supplier_invoice_number, total_amount, status, suppliers(name)'
    const [direct, viaOrders] = await Promise.all([
      supabase.from('invoices').select(select).eq('project_id', id),
      pos.length ? supabase.from('invoices').select(select).in('po_id', pos.map(p => p.id)) : Promise.resolve({ data: [] }),
    ])
    const map = new Map<string, InvRow>()
    for (const r of [...(direct.data ?? []), ...(viaOrders.data ?? [])] as unknown as InvRow[]) map.set(r.id, r)
    setInvoices([...map.values()])
    setLoading(false)
  }
  useEffect(() => { if (company) load() }, [company, id])

  if (loading || !project) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
  const manager = members.find(m => m.id === project.manager_id)?.name

  const List = ({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) => (
    <Card title={title}>
      {empty ? <p className="p-5 text-sm text-ink2">{s.noDocuments}</p> : <ul className="divide-y divide-field">{children}</ul>}
    </Card>
  )
  const Row = ({ to, main, sub, amount, badge }: { to: string; main: string; sub?: string | null; amount: string; badge?: React.ReactNode }) => (
    <li>
      <Link to={to} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface transition-colors">
        <span className="min-w-0"><span className="font-medium text-ink">{main}</span>{sub && <span className="text-ink2 ml-2 truncate">{sub}</span>}</span>
        <span className="inline-flex items-center gap-2.5 shrink-0"><span className="text-ink tabular-nums">{amount}</span>{badge}</span>
      </Link>
    </li>
  )

  return (
    <div className="p-4 lg:p-6">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate('/projects')} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/projects" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium truncate">{project.name}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-ink tracking-tight">{project.name}</h1>
            <span className={`badge ${project.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{project.status === 'active' ? t.common.active : t.common.inactive}</span>
          </div>
          <p className="mt-2 text-sm text-ink2">{[project.project_code, manager, project.start_date || project.end_date ? `${fmtDate(project.start_date) || '…'} – ${fmtDate(project.end_date) || '…'}` : ''].filter(Boolean).join(' · ')}</p>
        </div>
        {canManage && <Button variant="secondary" onClick={() => setEditing(true)} className="gap-2"><Pencil className="w-4 h-4" />{t.common.editEntity}</Button>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 flex flex-col gap-4">
          <List title={s.requestsCard} empty={requests.length === 0}>
            {requests.map(r => <Row key={r.id} to={`/requests/${r.id}`} main={r.request_number} sub={r.title} amount={money(Number(r.total_estimate ?? 0))} />)}
          </List>
          <List title={s.ordersCard} empty={orders.length === 0}>
            {orders.map(o => <Row key={o.id} to={`/purchase-orders/${o.id}`} main={o.po_number} sub={o.suppliers?.name} amount={money(Number(o.total_amount ?? 0))} />)}
          </List>
          <List title={s.invoicesCard} empty={invoices.length === 0}>
            {invoices.map(i => (
              <Row key={i.id} to={`/invoices/${i.id}`} main={i.supplier_invoice_number} sub={i.suppliers?.name} amount={money(Number(i.total_amount))}
                badge={<span className={`badge ${INVOICE_BADGE[i.status]}`}>{statusLabel(t.invoices.st, t.invoices.stSettled, i)}</span>} />
            ))}
          </List>
        </div>

        <div className="flex flex-col gap-4 order-first xl:order-none">
          <Card title={s.budgetOfProject}>
            <div className="p-5"><ProjectBudgetStatus projectId={project.id} /></div>
          </Card>
          <Card title={s.details}>
            <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
              <div className="col-span-2"><Field label={s.manager}>{manager ? <PersonCell name={manager} /> : null}</Field></div>
              <Field label={s.startDate}>{fmtDate(project.start_date)}</Field>
              <Field label={s.endDate}>{fmtDate(project.end_date)}</Field>
              <Field label={s.code}>{project.project_code}</Field>
              {project.description && <div className="col-span-2"><Field label={s.description}><span className="whitespace-pre-wrap">{project.description}</span></Field></div>}
            </div>
          </Card>
        </div>
      </div>

      <ProjectModal open={editing} onClose={() => setEditing(false)} project={project} members={members} onSaved={load} onDeleted={() => navigate('/projects')} />
    </div>
  )
}
