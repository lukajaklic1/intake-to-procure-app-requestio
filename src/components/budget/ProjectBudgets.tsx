import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Tag, User, CalendarClock, Wallet, Gauge } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { toast } from '../ui/Toast'
import Button from '../ui/Button'
import GridHead from '../ui/GridHead'
import PersonCell from '../ui/PersonCell'
import TableEmptyState from '../ui/TableEmptyState'
import PageToolbar from '../layout/PageToolbar'
import AmountInput from './AmountInput'
import { SpentBar } from '../../pages/BudgetsPage'
import { loadProjectUsage, projectUsageOf, type ProjectUsageRow } from '../../lib/budget'
import type { Project } from '../../types/database'

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : '')

/** The budgets of the projects: one amount per project for its whole life, typed straight into the cell. General operations are budgeted by department. */
export default function ProjectBudgets() {
  const { company, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.projects
  const navigate = useNavigate()
  const canEdit = isAdmin || hasPerm('budgets', 'create')
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR', maximumFractionDigits: 0 }).format(n)
  const [projects, setProjects] = useState<Project[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [usage, setUsage] = useState<ProjectUsageRow[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!company) return
    const [{ data: ps }, { data: us }, u] = await Promise.all([
      supabase.from('projects').select('*').eq('company_id', company.id).eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', company.id),
      loadProjectUsage(),
    ])
    setProjects((ps as Project[]) ?? [])
    setMembers((us ?? []).map(x => ({ id: x.id, name: `${x.first_name} ${x.last_name}` })))
    setUsage(u); setLoading(false)
  }
  useEffect(() => { if (company) load() }, [company])

  async function save(p: Project, amount: number) {
    setProjects(list => list.map(x => (x.id === p.id ? { ...x, budget_amount: amount || null } : x)))
    const { error } = await supabase.from('projects').update({ budget_amount: amount || null, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (error) { toast.error(error.message); load() }
  }

  return (
    <>
      <PageToolbar attached actions={<Button variant="secondary" onClick={() => navigate('/projects')} className="gap-2"><Briefcase className="w-4 h-4" />{s.title}</Button>} />
      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1000px]">
            <GridHead cols={[[s.code, Tag], [s.nameCol, Briefcase], [s.manager, User], [s.period, CalendarClock], [s.budget, Wallet, 'right'], [s.used, Gauge]]} />
            <tbody className="divide-y divide-field">
              {projects.length === 0 ? (
                <TableEmptyState icon={Briefcase} colSpan={6} title={t.common.empty.projects.title} subtitle={t.common.empty.projects.text} />
              ) : projects.map(p => {
                const budget = Number(p.budget_amount ?? 0)
                return (
                  <tr key={p.id} className="hover:bg-surface transition-colors">
                    <td className="px-4 py-2.5 text-ink2 whitespace-nowrap">{p.project_code || '-'}</td>
                    <td className="px-4 py-2.5 font-medium text-ink"><button type="button" onClick={() => navigate(`/projects/${p.id}`)} className="hover:underline text-left">{p.name}</button></td>
                    <td className="px-4 py-2.5"><PersonCell name={members.find(m => m.id === p.manager_id)?.name} /></td>
                    <td className="px-4 py-2.5 text-ink2 whitespace-nowrap">{p.start_date || p.end_date ? `${fmtDate(p.start_date) || '…'} – ${fmtDate(p.end_date) || '…'}` : '-'}</td>
                    <td className="px-2 py-1.5 w-[170px]"><AmountInput value={budget} format={money} disabled={!canEdit} placeholder={s.noBudgetSet} onSave={n => save(p, n)} /></td>
                    <td className="px-3 py-1">
                      <SpentBar ordered={projectUsageOf(usage, p.id, 'ordered')} requested={projectUsageOf(usage, p.id, 'requested')} paid={projectUsageOf(usage, p.id, 'paid')}
                        invoiced={projectUsageOf(usage, p.id, 'invoiced')} budget={budget} fmt={money} s={t.budgets} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  )
}
