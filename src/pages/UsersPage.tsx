import { useEffect, useState } from 'react'
import { Plus, Pencil, Users, Mail, X, User, Briefcase, Shield, CircleDot, UserPlus } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import FilterSelect from '../components/ui/FilterSelect'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { useRequired } from '../lib/useRequired'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import Input from '../components/ui/Input'
import Pagination from '../components/ui/Pagination'
import TableEmptyState from '../components/ui/TableEmptyState'
import type { User as AppUser, UserPermission, UserInvitation } from '../types/database'
import PersonCell from '../components/ui/PersonCell'
import GridHead from '../components/ui/GridHead'
import RowMenu from '../components/ui/RowMenu'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import ModalActions from '../components/ui/ModalActions'
import Select from '../components/ui/Select'
import SortFilter from '../components/ui/SortFilter'
import { applySort, text, date, rev, type SortDef } from '../lib/sort'
import ExportButton from '../components/ui/ExportButton'
import type { ExportColumn } from '../lib/exportExcel'

const MODULES: UserPermission['module'][] = ['requests', 'purchase_orders', 'receipts', 'invoices', 'budgets', 'reports']
const ACTIONS: ('view' | 'create' | 'approve' | 'pay')[] = ['view', 'create', 'approve', 'pay']

type PermMap = Record<string, { can_view: boolean; can_create: boolean; can_approve: boolean; can_pay: boolean }>

function emptyPerms(): PermMap {
  const m: PermMap = {}
  for (const mod of MODULES) m[mod] = { can_view: false, can_create: false, can_approve: false, can_pay: false }
  return m
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-accent' : 'bg-gray-300'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  )
}

function PermMatrix({ perms, onToggle, labels }: { perms: PermMap; onToggle: (m: string, a: typeof ACTIONS[number]) => void; labels: Record<string, string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[460px]">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left font-medium text-gray-400 uppercase tracking-wide text-xs py-2"></th>
            {ACTIONS.map(a => (
              <th key={a} className="text-center font-medium text-gray-400 uppercase tracking-wide text-xs py-2 px-2">{labels[`action_${a}`]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES.map(m => (
            <tr key={m} className="border-t border-gray-50">
              <td className="py-2.5 text-gray-700 font-medium">{labels[`module_${m}`]}</td>
              {ACTIONS.map(a => (
                <td key={a} className="text-center py-2.5 px-2">
                  <Toggle checked={!!perms[m]?.[`can_${a}` as keyof PermMap[string]]} onChange={() => onToggle(m, a)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function UsersPage() {
  const { company, isAdmin, loading } = useCompany()
  const { t } = useLanguage()
  const s = t.settings
  const [users, setUsers] = useState<AppUser[]>([])
  const [sort, setSort] = useState('nameAsc')
  const [searchParams] = useSearchParams()
  const [deptFilter, setDeptFilter] = useState(searchParams.get('department') ?? 'all')
  const [permsByUser, setPermsByUser] = useState<Record<string, PermMap>>({})
  const [invites, setInvites] = useState<UserInvitation[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Permission-matrix labels (built once from translations)
  const permLabels: Record<string, string> = {}
  for (const a of ACTIONS) permLabels[`action_${a}`] = s[`action${a.charAt(0).toUpperCase() + a.slice(1)}` as keyof typeof s] as string
  for (const m of MODULES) permLabels[`module_${m}`] = s[`module${m.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}` as keyof typeof s] as string

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inv, setInv] = useState({ first_name: '', last_name: '', email: '', department_id: '', job_title: '' })
  const invReq = useRequired(t.common.fieldRequired)
  const editReq = useRequired(t.common.fieldRequired)
  const [inviteAsAdmin, setInviteAsAdmin] = useState(false)
  const [invitePerms, setInvitePerms] = useState<PermMap>(emptyPerms())
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)

  // Edit user modal
  const [editUser, setEditUser] = useState<AppUser | null>(null)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', department_id: '', job_title: '', is_admin: false })
  const [editPerms, setEditPerms] = useState<PermMap>(emptyPerms())
  const [savingPerms, setSavingPerms] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState<UserInvitation | null>(null)

  useEffect(() => { if (company && isAdmin) load() }, [company, isAdmin])

  async function load() {
    if (!company) return
    // spinner only on the first load: later reloads refresh the data in place
    const [{ data: usersData }, { data: permsData }, { data: invitesData }, { data: depsData }] = await Promise.all([
      supabase.from('users').select('*').eq('company_id', company.id).order('first_name'),
      supabase.from('user_permissions').select('*'),
      supabase.from('user_invitations').select('*').eq('company_id', company.id).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('departments').select('id, name').eq('company_id', company.id).eq('status', 'active').order('name'),
    ])
    setUsers((usersData as AppUser[]) ?? [])
    const map: Record<string, PermMap> = {}
    for (const p of (permsData as UserPermission[]) ?? []) {
      map[p.user_id] = { ...(map[p.user_id] ?? {}), [p.module]: { can_view: p.can_view, can_create: p.can_create, can_approve: p.can_approve, can_pay: p.can_pay } } as PermMap
    }
    setPermsByUser(map)
    setInvites((invitesData as UserInvitation[]) ?? [])
    setDepartments(depsData ?? [])
    setDataLoading(false)
  }

  const deptName = (id: string | null) => departments.find(d => d.id === id)?.name ?? '—'

  // Primary admin = company founder (oldest admin) — never editable
  const primaryAdminId = users
    .filter(u => u.is_admin)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.id

  // ── Invite ──
  function openInvite() {
    invReq.reset()
    setInv({ first_name: '', last_name: '', email: '', department_id: '', job_title: '' })
    setInviteAsAdmin(false); setInvitePerms(emptyPerms()); setSentTo(null); setInviteOpen(true)
  }

  function toggleInvitePerm(module: string, action: typeof ACTIONS[number]) {
    setInvitePerms(prev => ({ ...prev, [module]: { ...prev[module], [`can_${action}`]: !prev[module][`can_${action}` as keyof PermMap[string]] } }))
  }

  async function sendInvite() {
    if (!company) return
    if (!invReq.check(inv, ['first_name', 'last_name', 'email'], { first_name: 'inv-first', last_name: 'inv-last', email: 'inv-email' })) return
    if (!/^\S+@\S+\.\S+$/.test(inv.email.trim())) { invReq.setError('email', t.common.import.invalidEmail, 'inv-email'); return }
    setInviting(true)
    const email = inv.email.trim()
    const permissions = MODULES.map(module => ({ module, ...invitePerms[module] }))
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: {
        email,
        first_name: inv.first_name.trim(),
        last_name: inv.last_name.trim(),
        department_id: inv.department_id || null,
        job_title: inv.job_title.trim() || null,
        is_admin: inviteAsAdmin,
        permissions,
        redirect_to: `${window.location.origin}/accept-invite`,
      },
    })
    setInviting(false)
    if (error || (data as { error?: string })?.error) {
      toast.error(error?.message ?? (data as { error?: string }).error ?? 'Error')
      return
    }
    setSentTo(email)
    toast.success(t.common.saved)
    load()
  }

  async function revokeInvite(invite: UserInvitation) {
    const { error } = await supabase.from('user_invitations').update({ status: 'revoked' }).eq('id', invite.id)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); load()
  }

  // ── Edit user ──
  function openEdit(u: AppUser) {
    editReq.reset()
    const base = emptyPerms()
    for (const m of MODULES) {
      const p = permsByUser[u.id]?.[m]
      if (p) base[m] = { can_view: p.can_view, can_create: p.can_create, can_approve: p.can_approve, can_pay: p.can_pay }
    }
    setEditPerms(base)
    setEditForm({
      first_name: u.first_name ?? '', last_name: u.last_name ?? '',
      department_id: u.department_id ?? '', job_title: u.job_title ?? '', is_admin: u.is_admin,
    })
    setEditUser(u)
  }

  function toggleEditPerm(module: string, action: typeof ACTIONS[number]) {
    setEditPerms(prev => ({ ...prev, [module]: { ...prev[module], [`can_${action}`]: !prev[module][`can_${action}` as keyof PermMap[string]] } }))
  }

  async function saveUser() {
    if (!editUser) return
    if (!editReq.check(editForm, ['first_name', 'last_name'], { first_name: 'edit-first', last_name: 'edit-last' })) return
    setSavingPerms(true)
    const { error: uErr } = await supabase.from('users').update({
      first_name: editForm.first_name.trim(),
      last_name: editForm.last_name.trim(),
      department_id: editForm.department_id || null,
      job_title: editForm.job_title.trim() || null,
      is_admin: editForm.is_admin,
      updated_at: new Date().toISOString(),
    }).eq('id', editUser.id)
    if (uErr) { setSavingPerms(false); toast.error(uErr.message); return }

    if (!editForm.is_admin) {
      const rows = MODULES.map(module => ({ user_id: editUser.id, module, ...editPerms[module] }))
      const { error: pErr } = await supabase.from('user_permissions').upsert(rows, { onConflict: 'user_id,module' })
      if (pErr) { setSavingPerms(false); toast.error(pErr.message); return }
    }
    setSavingPerms(false)
    toast.success(t.common.saved)
    setEditUser(null)
    load()
  }

  const shownUsers = users.filter(u => deptFilter === 'all' || u.department_id === deptFilter)
  const shownInvites = invites.filter(i => deptFilter === 'all' || i.department_id === deptFilter)
  useHeaderCounts(dataLoading ? [] : [{ value: shownUsers.length + shownInvites.length }])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
  if (!isAdmin) return <Navigate to="/dashboard" replace />

  const totalRows = shownUsers.length + shownInvites.length
  const startIdx = (page - 1) * pageSize
  const endIdx = startIdx + pageSize
  const sortDefs: SortDef<(typeof users)[number]>[] = [
    { value: 'nameAsc', label: t.sort.nameAsc, cmp: text(u => `${u.first_name} ${u.last_name}`) },
    { value: 'nameDesc', label: t.sort.nameDesc, cmp: rev(text(u => `${u.first_name} ${u.last_name}`)) },
    { value: 'newest', label: t.sort.newest, cmp: rev(date(u => u.created_at)) },
    { value: 'oldest', label: t.sort.oldest, cmp: date(u => u.created_at) },
  ]
  const sortedUsers = applySort(shownUsers, sortDefs, sort)
  const exportCols: ExportColumn<AppUser>[] = [
    { header: t.common.name, get: u => `${u.first_name} ${u.last_name}`, kind: 'text', width: 28 },
    { header: t.common.email, get: u => u.email, kind: 'text', width: 34 },
    { header: s.department, get: u => deptName(u.department_id), kind: 'text', width: 22 },
    { header: s.jobTitle, get: u => u.job_title, kind: 'text', width: 22 },
    { header: s.role, get: u => (u.is_admin ? s.admin : s.member), kind: 'text', width: 14 },
    { header: t.common.status, get: () => t.common.active, kind: 'text', width: 12 },
  ]
  const visibleUsers = sortedUsers.slice(Math.max(0, startIdx), Math.max(0, Math.min(shownUsers.length, endIdx)))
  const visibleInvites = shownInvites.slice(Math.max(0, startIdx - shownUsers.length), Math.max(0, endIdx - shownUsers.length))
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<><ExportButton fileName="uporabniki" columns={exportCols} rows={sortedUsers} /><Button onClick={openInvite} className="gap-2"><Plus className="w-4 h-4" />{s.addUser}</Button></>}>
        <SortFilter defs={sortDefs} value={sort} onChange={v => { setSort(v); setPage(1) }} />
        <FilterSelect label={t.filters.labels.department} value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1) }}>
          <option value="all">{t.common.allM}</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {dataLoading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[700px]">
            <GridHead cols={[[t.common.name, User], [t.common.email, Mail], [s.department, Users], [s.jobTitle, Briefcase], [s.role, Shield], [t.common.status, CircleDot], ['']]} />
            <tbody className="divide-y divide-field">
              {totalRows === 0 ? (
                <TableEmptyState icon={Users} colSpan={7} title={t.common.empty.users.title} subtitle={t.common.empty.users.text} />
              ) : <>
              {visibleUsers.map(u => (
                <tr key={u.id} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-3 font-medium text-ink"><PersonCell name={`${u.first_name} ${u.last_name}`} /></td>
                  <td className="px-4 py-3 text-ink2">{u.email}</td>
                  <td className="px-4 py-3 text-ink2">{deptName(u.department_id)}</td>
                  <td className="px-4 py-3 text-ink2">{u.job_title ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.is_admin ? 'badge-info' : 'badge-neutral'}`}>
                      {u.is_admin ? s.admin : s.member}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge badge-success">{t.common.active}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end"><RowMenu items={[{ label: s.editPermissions, icon: Pencil, onClick: () => openEdit(u) }]} /></div>
                  </td>
                </tr>
              ))}
              {visibleInvites.map(invite => (
                <tr key={invite.id} className="hover:bg-surface transition-colors bg-amber-50/30">
                  <td className="px-4 py-3 text-gray-500 flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{invite.first_name} {invite.last_name}</td>
                  <td className="px-4 py-3 text-ink2">{invite.email}</td>
                  <td className="px-4 py-3 text-ink2">{deptName(invite.department_id)}</td>
                  <td className="px-4 py-3 text-ink2">{invite.job_title ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${invite.is_admin ? 'badge-info' : 'badge-neutral'}`}>
                      {invite.is_admin ? s.admin : s.member}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge badge-warn">{s.invited}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end"><RowMenu items={[{ label: s.revoke, icon: X, onClick: () => setConfirmRevoke(invite) }]} /></div>
                  </td>
                </tr>
              ))}
              </>}
            </tbody>
          </table></div>
        )}
        <Pagination total={totalRows} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={handlePageSizeChange} />
      </div>

      {/* Invite modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={s.addUser} size="lg" icon={UserPlus}>
        {sentTo ? (
          <div>
            <p className="text-sm text-gray-600">{s.inviteSent} <span className="font-medium text-gray-900">{sentTo}</span>.</p>
            <ModalActions className="justify-end">
              <Button onClick={() => setInviteOpen(false)}>{t.common.cancel}</Button>
            </ModalActions>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input id="inv-first" placeholder={t.common.ph.firstName} label={s.firstName + ' *'} value={inv.first_name} error={invReq.errors.first_name} onChange={e => { invReq.clear('first_name'); setInv(v => ({ ...v, first_name: e.target.value })) }} />
              <Input id="inv-last" placeholder={t.common.ph.lastName} label={s.lastName + ' *'} value={inv.last_name} error={invReq.errors.last_name} onChange={e => { invReq.clear('last_name'); setInv(v => ({ ...v, last_name: e.target.value })) }} />
              <div className="col-span-1 sm:col-span-2">
                <Input id="inv-email" placeholder={t.common.ph.email} label={s.inviteEmail + ' *'} type="email" value={inv.email} error={invReq.errors.email} onChange={e => { invReq.clear('email'); setInv(v => ({ ...v, email: e.target.value })) }} />
              </div>
              <Select label={s.department} value={inv.department_id} onChange={v => setInv(x => ({ ...x, department_id: v }))}
                options={[{ value: '', label: s.noDepartment }, ...departments.map(d => ({ value: d.id, label: d.name }))]} />
              <Input id="inv-job" placeholder={t.common.ph.jobTitle} label={s.jobTitle} value={inv.job_title} onChange={e => setInv(v => ({ ...v, job_title: e.target.value }))} />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={inviteAsAdmin} onChange={e => setInviteAsAdmin(e.target.checked)}
                className="rounded border-field text-accent focus:ring-accent" />
              {s.inviteAsAdmin}
            </label>

            {inviteAsAdmin ? (
              <p className="text-xs text-gray-400">{s.adminAllAccess}</p>
            ) : (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-sm font-medium text-gray-700 mb-2">{s.usersAndPermissions}</p>
                <PermMatrix perms={invitePerms} onToggle={toggleInvitePerm} labels={permLabels} />
              </div>
            )}

            <ModalActions className="justify-end">
              <Button variant="secondary" onClick={() => setInviteOpen(false)}>{t.common.cancel}</Button>
              <Button loading={inviting} onClick={sendInvite}
                disabled={!inv.email.trim() || !inv.first_name.trim() || !inv.last_name.trim()}>{s.sendInvite}</Button>
            </ModalActions>
          </div>
        )}
      </Modal>

      {/* Edit user modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`${s.permissionsFor} ${editUser?.first_name ?? ''} ${editUser?.last_name ?? ''}`} size="lg" icon={User}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input id="edit-first" placeholder={t.common.ph.firstName} label={s.firstName + ' *'} value={editForm.first_name} error={editReq.errors.first_name} onChange={e => { editReq.clear('first_name'); setEditForm(v => ({ ...v, first_name: e.target.value })) }} />
            <Input id="edit-last" placeholder={t.common.ph.lastName} label={s.lastName + ' *'} value={editForm.last_name} error={editReq.errors.last_name} onChange={e => { editReq.clear('last_name'); setEditForm(v => ({ ...v, last_name: e.target.value })) }} />
            <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t.common.email}</label>
              <input value={editUser?.email ?? ''} disabled
                className="rounded-lg border border-field bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed" />
            </div>
            <Select label={s.department} value={editForm.department_id} onChange={v => setEditForm(x => ({ ...x, department_id: v }))}
              options={[{ value: '', label: s.noDepartment }, ...departments.map(d => ({ value: d.id, label: d.name }))]} />
            <Input id="edit-job" placeholder={t.common.ph.jobTitle} label={s.jobTitle} value={editForm.job_title} onChange={e => setEditForm(v => ({ ...v, job_title: e.target.value }))} />
          </div>

          {editUser?.id !== primaryAdminId && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={editForm.is_admin} onChange={e => setEditForm(v => ({ ...v, is_admin: e.target.checked }))}
                className="rounded border-field text-accent focus:ring-accent" />
              {s.admin}
            </label>
          )}

          {editForm.is_admin ? (
            <p className="text-xs text-gray-400">{s.adminAllAccess}</p>
          ) : (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">{s.usersAndPermissions}</p>
              <PermMatrix perms={editPerms} onToggle={toggleEditPerm} labels={permLabels} />
            </div>
          )}

          <ModalActions className="justify-end">
            <Button variant="secondary" onClick={() => setEditUser(null)}>{t.common.cancel}</Button>
            <Button loading={savingPerms} onClick={saveUser}
              disabled={!editForm.first_name.trim() || !editForm.last_name.trim()}>{t.common.saveChanges}</Button>
          </ModalActions>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmRevoke} onClose={() => setConfirmRevoke(null)}
        onConfirm={async () => { if (confirmRevoke) await revokeInvite(confirmRevoke); setConfirmRevoke(null) }}
        title={s.revokeTitle} message={s.revokeQuestion} name={confirmRevoke?.email ?? ''} danger confirmLabel={s.revoke} />
    </div>
  )
}
