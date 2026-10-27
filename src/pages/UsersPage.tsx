import { useEffect, useState } from 'react'
import { Plus, Pencil, Users, Mail, X } from 'lucide-react'
import { Navigate } from 'react-router-dom'
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

const MODULES: UserPermission['module'][] = ['requests', 'purchase_orders', 'receipts', 'invoices', 'budgets', 'reports']
const ACTIONS: ('view' | 'create' | 'approve' | 'pay')[] = ['view', 'create', 'approve']

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

  useEffect(() => { if (company && isAdmin) load() }, [company, isAdmin])

  async function load() {
    if (!company) return
    setDataLoading(true)
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

  useHeaderCounts(dataLoading ? [] : [{ value: users.length + invites.length }])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
  if (!isAdmin) return <Navigate to="/dashboard" replace />

  const totalRows = users.length + invites.length
  const startIdx = (page - 1) * pageSize
  const endIdx = startIdx + pageSize
  const visibleUsers = users.slice(Math.max(0, startIdx), Math.max(0, Math.min(users.length, endIdx)))
  const visibleInvites = invites.slice(Math.max(0, startIdx - users.length), Math.max(0, endIdx - users.length))
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<Button onClick={openInvite} className="gap-2"><Plus className="w-4 h-4" />{s.addUser}</Button>} />

      <div className="data-card table-bleed bg-white rounded-lg border border-field overflow-hidden">
        {dataLoading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[700px]">
            <thead className="bg-surface border-b border-field">
              <tr>
                {[t.common.name, t.common.email, s.department, s.jobTitle, s.role, t.common.status, ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-sm font-medium text-ink2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-field">
              {totalRows === 0 ? (
                <TableEmptyState icon={Users} colSpan={7} title={t.common.empty.users.title} subtitle={t.common.empty.users.text} />
              ) : <>
              {visibleUsers.map(u => (
                <tr key={u.id} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{u.first_name} {u.last_name}</td>
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
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(u)} title={s.editPermissions}
                        className="p-1.5 text-gray-400 hover:text-accent hover:bg-accent-light rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    </div>
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
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => revokeInvite(invite)} title={s.revoke}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
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
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={s.addUser} size="lg">
        {sentTo ? (
          <div>
            <p className="text-sm text-gray-600">{s.inviteSent} <span className="font-medium text-gray-900">{sentTo}</span>.</p>
            <div className="flex justify-end mt-5">
              <Button onClick={() => setInviteOpen(false)}>{t.common.cancel}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input id="inv-first" label={s.firstName + ' *'} value={inv.first_name} error={invReq.errors.first_name} onChange={e => { invReq.clear('first_name'); setInv(v => ({ ...v, first_name: e.target.value })) }} />
              <Input id="inv-last" label={s.lastName + ' *'} value={inv.last_name} error={invReq.errors.last_name} onChange={e => { invReq.clear('last_name'); setInv(v => ({ ...v, last_name: e.target.value })) }} />
              <div className="col-span-1 sm:col-span-2">
                <Input id="inv-email" label={s.inviteEmail + ' *'} type="email" value={inv.email} error={invReq.errors.email} onChange={e => { invReq.clear('email'); setInv(v => ({ ...v, email: e.target.value })) }} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{s.department}</label>
                <select value={inv.department_id} onChange={e => setInv(v => ({ ...v, department_id: e.target.value }))}
                  className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white">
                  <option value="">{s.noDepartment}</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <Input id="inv-job" label={s.jobTitle} value={inv.job_title} onChange={e => setInv(v => ({ ...v, job_title: e.target.value }))} />
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

            <div className="flex gap-3 justify-end mt-1">
              <Button variant="secondary" onClick={() => setInviteOpen(false)}>{t.common.cancel}</Button>
              <Button loading={inviting} onClick={sendInvite}
                disabled={!inv.email.trim() || !inv.first_name.trim() || !inv.last_name.trim()}>{s.sendInvite}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit user modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`${s.permissionsFor} ${editUser?.first_name ?? ''} ${editUser?.last_name ?? ''}`} size="lg">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input id="edit-first" label={s.firstName + ' *'} value={editForm.first_name} error={editReq.errors.first_name} onChange={e => { editReq.clear('first_name'); setEditForm(v => ({ ...v, first_name: e.target.value })) }} />
            <Input id="edit-last" label={s.lastName + ' *'} value={editForm.last_name} error={editReq.errors.last_name} onChange={e => { editReq.clear('last_name'); setEditForm(v => ({ ...v, last_name: e.target.value })) }} />
            <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t.common.email}</label>
              <input value={editUser?.email ?? ''} disabled
                className="rounded-lg border border-field bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{s.department}</label>
              <select value={editForm.department_id} onChange={e => setEditForm(v => ({ ...v, department_id: e.target.value }))}
                className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white">
                <option value="">{s.noDepartment}</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <Input id="edit-job" label={s.jobTitle} value={editForm.job_title} onChange={e => setEditForm(v => ({ ...v, job_title: e.target.value }))} />
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

          <div className="flex gap-3 justify-end mt-1">
            <Button variant="secondary" onClick={() => setEditUser(null)}>{t.common.cancel}</Button>
            <Button loading={savingPerms} onClick={saveUser}
              disabled={!editForm.first_name.trim() || !editForm.last_name.trim()}>{t.common.saveChanges}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
