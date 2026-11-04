import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Plus, Search, Pencil, Eye, Tag, User, CalendarClock, Wallet, Gauge, CircleDot } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import GridHead from '../components/ui/GridHead'
import RowMenu from '../components/ui/RowMenu'
import PersonCell from '../components/ui/PersonCell'
import SortFilter from '../components/ui/SortFilter'
import ExportButton from '../components/ui/ExportButton'
import ProjectModal from '../components/projects/ProjectModal'
import { UsedBar } from './BudgetsPage'
import { matchesSearch } from '../lib/search'
import { applySort, text, num, date, rev, type SortDef } from '../lib/sort'
import { loadProjectUsage, projectUsageOf, usedPercent, type ProjectUsageRow } from '../lib/budget'
import type { ExportColumn } from '../lib/exportExcel'
import type { Project } from '../types/database'

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : '')

export default function ProjectsPage() {
  const { company, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.projects
  const navigate = useNavigate()
  const canManage = isAdmin || hasPerm('budgets', 'create')
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR', maximumFractionDigits: 0 }).format(n)

  const [projects, setProjects] = useState<Project[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [usage, setUsage] = useState<ProjectUsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [modal, setModal] = useState<{ open: boolean; project: Project | null }>({ open: false, project: null })

  async function load() {
    if (!company) return
    const [{ data: ps }, { data: us }, u] = await Promise.all([
      supabase.from('projects').select('*').eq('company_id', company.id),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', company.id).order('first_name'),
      loadProjectUsage(),
    ])
    setProjects((ps as Project[]) ?? [])
    setMembers((us ?? []).map(x => ({ id: x.id, name: `${x.first_name} ${x.last_name}` })))
    setUsage(u)
    setLoading(false)
  }
  useEffect(() => { if (company) load() }, [company])

  const nameOf = (id: string | null) => members.find(m => m.id === id)?.name
  const usedOf = (p: Project) => projectUsageOf(usage, p.id, 'ordered') + projectUsageOf(usage, p.id, 'requested')
  const sortDefs: SortDef<Project>[] = [
    { value: 'newest', label: t.sort.newest, cmp: rev(date(p => p.created_at)) },
    { value: 'nameAsc', label: t.sort.nameAsc, cmp: text(p => p.name) },
    { value: 'nameDesc', label: t.sort.nameDesc, cmp: rev(text(p => p.name)) },
    { value: 'codeAsc', label: t.sort.codeAsc, cmp: text(p => p.project_code) },
    { value: 'budgetDesc', label: `${s.budget}: ↓`, cmp: rev(num(p => Number(p.budget_amount ?? 0))) },
    { value: 'endAsc', label: `${s.endDate}: ↑`, cmp: date(p => p.end_date) },
  ]
  const filtered = useMemo(() => projects.filter(p => matchesSearch(search, [p.name, p.project_code, nameOf(p.manager_id)]) && (statusFilter === 'all' || p.status === statusFilter)), [projects, search, statusFilter, members])
  useEffect(() => { setPage(1) }, [search, statusFilter, sort])
  const sorted = applySort(filtered, sortDefs, sort)
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)
  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  const exportCols: ExportColumn<Project>[] = [
    { header: s.code, get: p => p.project_code, kind: 'text', width: 12 },
    { header: s.nameCol, get: p => p.name, kind: 'text', width: 32 },
    { header: s.manager, get: p => nameOf(p.manager_id), kind: 'text', width: 24 },
    { header: s.startDate, get: p => p.start_date, kind: 'date', width: 14 },
    { header: s.endDate, get: p => p.end_date, kind: 'date', width: 14 },
    { header: s.budget, get: p => Number(p.budget_amount ?? 0), kind: 'money', width: 14 },
    { header: s.used, get: p => usedOf(p), kind: 'money', width: 14 },
    { header: t.common.status, get: p => (p.status === 'active' ? t.common.active : t.common.inactive), kind: 'text', width: 12 },
  ]

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<><ExportButton fileName="projekti" columns={exportCols} rows={sorted} />{canManage && <Button onClick={() => setModal({ open: true, project: null })} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button>}</>}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
        </div>
        <SortFilter defs={sortDefs} value={sort} onChange={setSort} />
        <FilterSelect label={t.filters.labels.status} value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
          {(['all', 'active', 'inactive'] as const).map(v => <option key={v} value={v}>{v === 'all' ? t.common.allM : v === 'active' ? t.common.activeM : t.common.inactiveM}</option>)}
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1000px]">
            <GridHead cols={[[s.code, Tag], [s.nameCol, Briefcase], [s.manager, User], [s.period, CalendarClock], [s.budget, Wallet, 'right'], [s.used, Gauge], [t.common.status, CircleDot], ['']]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={Briefcase} colSpan={8} title={search ? t.common.empty.noResults.title : t.common.empty.projects.title} subtitle={search ? t.common.empty.noResults.text : t.common.empty.projects.text} />
              ) : paged.map(p => {
                const budget = Number(p.budget_amount ?? 0)
                const paid = projectUsageOf(usage, p.id, 'paid'); const inv = projectUsageOf(usage, p.id, 'invoiced'); const ord = projectUsageOf(usage, p.id, 'ordered'); const rq = projectUsageOf(usage, p.id, 'requested')
                return (
                  <tr key={p.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{p.project_code || '-'}</td>
                    <td className="px-4 py-3 font-medium text-ink max-w-[280px] truncate" title={p.name}>{p.name}</td>
                    <td className="px-4 py-3"><PersonCell name={nameOf(p.manager_id)} /></td>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{p.start_date || p.end_date ? `${fmtDate(p.start_date) || '…'} – ${fmtDate(p.end_date) || '…'}` : '-'}</td>
                    <td className="px-4 py-3 text-right text-ink tabular-nums whitespace-nowrap">{budget > 0 ? money(budget) : '-'}</td>
                    <td className="px-4 py-3">
                      {budget > 0
                        ? <UsedBar pct={usedPercent(ord + rq, budget)} orderedPct={(ord / budget) * 100} paidPct={(paid / budget) * 100} invoicedPct={(inv / budget) * 100} />
                        : <span className="text-ink2 tabular-nums">{ord + rq > 0 ? money(ord + rq) : '-'}</span>}
                    </td>
                    <td className="px-4 py-3"><span className={`badge ${p.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{p.status === 'active' ? t.common.active : t.common.inactive}</span></td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <RowMenu items={[
                          { label: t.common.view, icon: Eye, onClick: () => navigate(`/projects/${p.id}`) },
                          ...(canManage ? [{ label: t.common.editEntity, icon: Pencil, onClick: () => setModal({ open: true, project: p }) }] : []),
                        ]} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={n => { setPageSize(n); setPage(1) }} />
      </div>

      <ProjectModal open={modal.open} onClose={() => setModal({ open: false, project: null })} project={modal.project} members={members} onSaved={load} />
    </div>
  )
}
