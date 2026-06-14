import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList,
} from 'recharts'
import { FileText, TrendingUp, Clock, BarChart2, X, CheckCircle2, Circle, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { format, subMonths, startOfMonth } from 'date-fns'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Filters {
  dateRange: '1m' | '3m' | '6m' | '1y' | 'all'
  supplierId: string
  categoryId: string
  projectId: string
  departmentId: string
}

const DEFAULT_FILTERS: Filters = {
  dateRange: '1y', supplierId: '', categoryId: '', projectId: '', departmentId: '',
}




// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

// Short format for chart axes — no € symbol (axis has no room)
function fmtShort(n: number) {
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(2).replace('.', ',').replace(/,?0+$/, '')
    return `${v}M`
  }
  if (n >= 1_000) {
    const v = (n / 1_000).toFixed(2).replace('.', ',').replace(/,?0+$/, '')
    return `${v}k`
  }
  return String(Math.round(n))
}

// Short format WITH € — for bar/pie labels
function fmtLabel(n: number) {
  return fmtShort(n) + ' €'
}

// Truncate long axis labels
function truncate(s: string, max = 18) {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function getDateFrom(range: string): string | null {
  if (range === 'all') return null
  const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12
  return startOfMonth(subMonths(new Date(), months - 1)).toISOString()
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`p-2 rounded-lg ${color}`}><Icon className="w-4 h-4" /></div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function EmptyChart({ height = 180, label = 'No data for selected period' }: { height?: number; label?: string }) {
  return (
    <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>
      {label}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label, currency }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="text-gray-500 mb-1">{label}</p>}
      <p className="font-semibold text-gray-900">{fmt(payload[0].value, currency)}</p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { company, profile } = useCompany()
  const { t } = useLanguage()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Reference data for dropdowns
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])

  // Chart data
  const [spendByMonth, setSpendByMonth] = useState<{ month: string; amount: number }[]>([])
  const [spendBySupplier, setSpendBySupplier] = useState<{ name: string; amount: number }[]>([])
  const [spendByCategory, setSpendByCategory] = useState<{ name: string; value: number }[]>([])
  const [spendByProject, setSpendByProject] = useState<{ name: string; amount: number }[]>([])
  const [spendByDepartment, setSpendByDepartment] = useState<{ name: string; amount: number }[]>([])
  const [spendByMaterial, setSpendByMaterial] = useState<{ name: string; amount: number }[]>([])
  const [recentPos, setRecentPos] = useState<any[]>([])

  // Stats
  const [stats, setStats] = useState({ total: 0, poCount: 0, openPos: 0, avgPo: 0 })

  // Checklist
  const [checklist, setChecklist] = useState({ companyInfo: false, supplier: false, category: false, project: false, location: false, department: false, teamMember: false, firstRequest: false, firstPo: false })
  const [checklistLoaded, setChecklistLoaded] = useState(false)

  const currency = company?.currency ?? 'EUR'

  useEffect(() => {
    if (!company) return
    loadRefs()
    loadChecklist()
  }, [company])

  useEffect(() => {
    if (!company) return
    loadCharts()
  }, [company, filters])

  async function loadRefs() {
    const cid = company!.id
    const [s, c, p, d] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('categories').select('id, name').eq('company_id', cid).order('name'),
      supabase.from('projects').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('departments').select('id, name').eq('company_id', cid).order('name'),
    ])
    setSuppliers(s.data ?? [])
    setCategories(c.data ?? [])
    setProjects(p.data ?? [])
    setDepartments(d.data ?? [])
  }

  async function loadChecklist() {
    const cid = company!.id
    const comp = company!
    const [{ count: sc }, { count: cc }, { count: projc }, { count: locc }, { count: deptc }, { count: poc }, { count: uc }, { count: invc }, { count: reqc }] = await Promise.all([
      supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('categories').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('projects').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('locations').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('departments').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('user_invitations').select('*', { count: 'exact', head: true }).eq('company_id', cid).eq('status', 'pending'),
      supabase.from('requests').select('*', { count: 'exact', head: true }).eq('company_id', cid),
    ])
    setChecklist({
      companyInfo: !!(comp.address_street && comp.tax_id),
      supplier: (sc ?? 0) > 0,
      category: (cc ?? 0) > 0,
      project: (projc ?? 0) > 0,
      location: (locc ?? 0) > 0,
      department: (deptc ?? 0) > 0,
      teamMember: (uc ?? 0) > 1 || (invc ?? 0) > 0,
      firstRequest: (reqc ?? 0) > 0,
      firstPo: (poc ?? 0) > 0,
    })
    setChecklistLoaded(true)
  }

  async function loadCharts() {
    if (!company) return
    const dateFrom = getDateFrom(filters.dateRange)
    const numMonths = filters.dateRange === '1m' ? 1 : filters.dateRange === '3m' ? 3 : filters.dateRange === '6m' ? 6 : 12

    const { data, error } = await supabase.rpc('get_dashboard_stats', {
      p_company_id:    company.id,
      p_date_from:     dateFrom ?? undefined,
      p_supplier_id:   filters.supplierId   || undefined,
      p_category_id:   filters.categoryId   || undefined,
      p_project_id:    filters.projectId    || undefined,
      p_department_id: filters.departmentId || undefined,
      p_months:        numMonths,
    })

    if (error) { console.error('Dashboard RPC error', error); return }
    const d = data as any

    // Summary
    const summary = d.summary ?? {}
    setStats({
      total:   summary.total_spend ?? 0,
      poCount: summary.po_count    ?? 0,
      openPos: d.open_pos          ?? 0,
      avgPo:   summary.avg_po      ?? 0,
    })

    // Spend by month — convert 'YYYY-MM' to display label
    const monthRows: { month: string; amount: number }[] = (d.spend_by_month ?? []).map((r: any) => ({
      month:  format(new Date(r.month + '-01'), 'MMM yy'),
      amount: r.amount,
    }))
    setSpendByMonth(monthRows)

    // Spend by supplier — null name fallback
    setSpendBySupplier((d.spend_by_supplier ?? []).map((r: any) => ({
      name:   r.name ?? t.dashboard.unknown,
      amount: r.amount,
    })))

    // Spend by category
    setSpendByCategory((d.spend_by_category ?? []).map((r: any) => ({
      name:  r.name ?? t.dashboard.noCategory,
      value: r.value,
    })))

    // Spend by project
    setSpendByProject((d.spend_by_project ?? []).map((r: any) => ({
      name:   r.name ?? t.dashboard.noProject,
      amount: r.amount,
    })))

    // Spend by department
    setSpendByDepartment((d.spend_by_department ?? []).map((r: any) => ({
      name:   r.name ?? t.dashboard.noDepartment,
      amount: r.amount,
    })))

    // Spend by material
    setSpendByMaterial((d.spend_by_material ?? []).map((r: any) => ({
      name:   r.name,
      amount: r.amount,
    })))

    // Recent POs — reshape to match existing render expectations
    setRecentPos((d.recent_pos ?? []).map((r: any) => ({
      id:           r.id,
      po_number:    r.po_number,
      status:       r.status,
      total_amount: r.total_amount,
      created_at:   r.created_at,
      suppliers:    r.supplier_name ? { name: r.supplier_name } : null,
      projects:     r.project_name  ? { name: r.project_name  } : null,
    })))
  }

  function setFilter(key: keyof Filters, value: string) {
    setFilters(f => ({ ...f, [key]: value }))
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
  }

  const hasActiveFilters = filters.supplierId || filters.categoryId || filters.projectId || filters.departmentId || filters.dateRange !== '1y'

  const checklistItems = [
    { done: true,                    label: t.checklist.companyCreated,                  to: null },
    { done: checklist.companyInfo,   label: t.checklist.addAddress,        to: '/settings' },
    { done: checklist.supplier,      label: t.checklist.createSupplier,       to: '/suppliers' },
    { done: checklist.category,      label: t.checklist.createCategory,                to: '/categories' },
    { done: checklist.project,       label: t.checklist.createProject,                 to: '/projects' },
    { done: checklist.location,      label: t.checklist.createLocation,       to: '/locations' },
    { done: checklist.department,    label: t.checklist.createDepartment,              to: '/departments' },
    { done: checklist.teamMember,    label: t.checklist.inviteTeam,                    to: '/users' },
    { done: checklist.firstRequest,  label: t.checklist.createFirstRequest,            to: '/requests' },
    { done: checklist.firstPo,       label: t.checklist.createFirstPO, to: '/purchase-orders' },
  ]
  const doneCount = checklistItems.filter(i => i.done).length
  const allDone = doneCount === checklistItems.length

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">
          {t.dashboard.welcomeBack}{profile ? `, ${profile.first_name}` : ''}
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">{t.dashboard.spendAnalytics} {company?.name}</p>
      </div>

      {/* Setup banner — only show after checklist is loaded to avoid flash */}
      {checklistLoaded && !allDone && !bannerDismissed && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 mb-5 relative">
          <button onClick={() => setBannerDismissed(true)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">🚀 {t.dashboard.completeSetup}</span>
            <span className="text-xs text-gray-400 font-mono">{doneCount} / {checklistItems.length} {t.dashboard.done}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(doneCount / checklistItems.length) * 100}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            {checklistItems.map(item => (
              <div key={item.label} className="flex items-center gap-2">
                {item.done ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <Circle className="w-4 h-4 text-gray-300 shrink-0" />}
                {item.to && !item.done
                  ? <Link to={item.to} className="text-sm text-blue-600 hover:underline flex items-center gap-1">{item.label} <ChevronRight className="w-3 h-3" /></Link>
                  : <span className={`text-sm ${item.done ? 'text-gray-400 line-through' : 'text-gray-600'}`}>{item.label}</span>
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">

          <select value={filters.dateRange} onChange={e => setFilter('dateRange', e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
            <option value="1m">{t.filters.lastMonth}</option>
            <option value="3m">{t.filters.last3Months}</option>
            <option value="6m">{t.filters.last6Months}</option>
            <option value="1y">{t.filters.last12Months}</option>
            <option value="all">{t.filters.allTime}</option>
          </select>

          <select value={filters.supplierId} onChange={e => setFilter('supplierId', e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
            <option value="">{t.filters.allSuppliers}</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <select value={filters.categoryId} onChange={e => setFilter('categoryId', e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
            <option value="">{t.filters.allCategories}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select value={filters.projectId} onChange={e => setFilter('projectId', e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
            <option value="">{t.filters.allProjects}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select value={filters.departmentId} onChange={e => setFilter('departmentId', e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
            <option value="">{t.filters.allDepartments}</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium ml-auto">
              <X className="w-3.5 h-3.5" />Odstrani filtre
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-5">
        <StatCard icon={TrendingUp} label={t.dashboard.totalSpend} value={fmt(stats.total, currency)} color="bg-blue-50 text-blue-600" />
        <StatCard icon={FileText} label={t.dashboard.poCount} value={String(stats.poCount)} color="bg-amber-50 text-amber-600" />
        <StatCard icon={Clock} label={t.dashboard.openPos} value={String(stats.openPos)} color="bg-purple-50 text-purple-600" />
        <StatCard icon={BarChart2} label={t.dashboard.avgPoValue} value={fmt(stats.avgPo, currency)} color="bg-green-50 text-green-600" />
      </div>

      {/* Spend over time — full width */}
      <div className="mb-4">
        <ChartCard title={t.dashboard.spendOverTime}>
          {spendByMonth.some(m => m.amount > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={spendByMonth} barSize={28} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 13, fill: '#374151' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 13, fill: '#374151' }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="amount" position="top" style={{ fontSize: 13, fill: '#374151', fontWeight: 600 }} formatter={(v: any) => v > 0 ? fmtLabel(v) : ''} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart height={220} label={t.common.noData} />}
        </ChartCard>
      </div>

      {/* Row 2: Category + Supplier */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title={t.dashboard.spendByCategory}>
          {spendByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, spendByCategory.length * 32)}>
              <BarChart data={spendByCategory.map(d => ({ ...d, amount: d.value }))} layout="vertical" barSize={16} margin={{ right: 60 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} width={210} tickFormatter={(s) => truncate(s, 35)} />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                <Bar dataKey="amount" fill="#0891b2" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="amount" position="right" style={{ fontSize: 13, fill: '#374151', fontWeight: 600 }} formatter={(v: any) => fmtLabel(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart height={220} label={t.common.noData} />}
        </ChartCard>

        <ChartCard title={t.dashboard.spendBySupplier}>
          {spendBySupplier.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, spendBySupplier.length * 32)}>
              <BarChart data={spendBySupplier} layout="vertical" barSize={16} margin={{ right: 60 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} width={210} tickFormatter={(s) => truncate(s, 35)} />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                <Bar dataKey="amount" fill="#2563eb" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="amount" position="right" style={{ fontSize: 13, fill: '#374151', fontWeight: 600 }} formatter={(v: any) => fmtLabel(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart height={220} label={t.common.noData} />}
        </ChartCard>
      </div>

      {/* Row 3: Project + Department */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title={t.dashboard.spendByProject}>
          {spendByProject.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, spendByProject.length * 32)}>
              <BarChart data={spendByProject} layout="vertical" barSize={16} margin={{ right: 60 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} width={210} tickFormatter={(s) => truncate(s, 35)} />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                <Bar dataKey="amount" fill="#7c3aed" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="amount" position="right" style={{ fontSize: 13, fill: '#374151', fontWeight: 600 }} formatter={(v: any) => fmtLabel(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart height={220} label={t.common.noData} />}
        </ChartCard>

        <ChartCard title={t.dashboard.spendByDepartment}>
          {spendByDepartment.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, spendByDepartment.length * 32)}>
              <BarChart data={spendByDepartment} layout="vertical" barSize={16} margin={{ right: 60 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} width={210} tickFormatter={(s) => truncate(s, 35)} />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                <Bar dataKey="amount" fill="#0891b2" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="amount" position="right" style={{ fontSize: 13, fill: '#374151', fontWeight: 600 }} formatter={(v: any) => fmtLabel(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart height={220} label={t.common.noData} />}
        </ChartCard>
      </div>

      {/* Row 4: Material chart + Recent POs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t.dashboard.spendByMaterial}>
          {spendByMaterial.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(260, spendByMaterial.length * 30)}>
              <BarChart data={spendByMaterial} layout="vertical" barSize={16} margin={{ right: 70 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} width={210} tickFormatter={(s) => truncate(s, 35)} />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                <Bar dataKey="amount" fill="#059669" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="amount" position="right" style={{ fontSize: 13, fill: '#374151', fontWeight: 600 }} formatter={(v: any) => fmtLabel(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart height={260} label={t.common.noData} />}
        </ChartCard>

        {/* Recent POs */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">{t.dashboard.recentPOs}</h2>
            <Link to="/purchase-orders" className="text-xs text-blue-600 hover:underline">{t.common.viewAll}</Link>
          </div>
          {recentPos.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">{t.po.poNumber}</th>
                  <th className="text-left pb-2 font-medium">{t.po.supplier}</th>
                  <th className="text-right pb-2 font-medium">{t.po.total}</th>
                  <th className="text-right pb-2 font-medium">{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {recentPos.map((po: any) => (
                  <tr key={po.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-2">
                      <Link to={`/purchase-orders/${po.id}`} className="font-mono text-xs font-semibold text-blue-600 hover:underline">
                        {po.po_number}
                      </Link>
                      <p className="text-xs text-gray-400">{format(new Date(po.created_at), 'dd.MM.yyyy')}</p>
                    </td>
                    <td className="py-2 text-xs text-gray-700 max-w-[100px] truncate">{(po.suppliers as any)?.name ?? '—'}</td>
                    <td className="py-2 text-right text-xs font-medium text-gray-800">{fmt(po.total_amount ?? 0, currency)}</td>
                    <td className="py-2 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        po.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                        po.status === 'issued' ? 'bg-amber-100 text-amber-700' :
                        po.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                        po.status === 'closed' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-600'
                      }`}>{t.status[po.status as keyof typeof t.status] ?? po.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <FileText className="w-8 h-8 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">{t.dashboard.noRecentPOs}</p>
              <Link to="/purchase-orders/new" className="mt-3 text-sm text-blue-600 hover:underline font-medium">{t.dashboard.createFirstPO}</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
