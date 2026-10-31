import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LogOut, X, Building2, Settings, PanelLeftClose } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { onRefreshCounts } from '../../lib/refreshCounts'
import { useAuth } from '../../hooks/useAuth'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { cn } from '../../lib/cn'
import AppLogo from '../ui/AppLogo'
import { NAV_GROUPS } from './navConfig'
import { needsAttention } from '../../lib/contracts'

interface SidebarProps {
  onClose?: () => void
  onCollapse?: () => void
}

export default function Sidebar({ onClose, onCollapse }: SidebarProps) {
  const { signOut } = useAuth()
  const { company, profile, isAdmin, hasPerm } = useCompany()
  const { lang, setLang, t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()

  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [readyForPO, setReadyForPO] = useState(0)
  const [openReceipts, setOpenReceipts] = useState(0)
  const [expiringContracts, setExpiringContracts] = useState(0)
  const [invoicesToApprove, setInvoicesToApprove] = useState(0)

  useEffect(() => {
    if (!company || !profile) return
    async function loadCounts() {
      let approvalsQuery = supabase.from('requests').select('*', { count: 'exact', head: true })
        .eq('company_id', company!.id).eq('status', 'pending')
      if (!isAdmin) approvalsQuery = approvalsQuery.eq('approver_id', profile!.id)
      const [{ count: pending }, { count: noPo }, { count: receiptsOpen }, { data: ctr }, { count: invReview }] = await Promise.all([
        approvalsQuery,
        supabase.from('requests').select('*', { count: 'exact', head: true })
          .eq('company_id', company!.id).eq('status', 'approved').is('po_id', null),
        supabase.from('purchase_orders').select('*', { count: 'exact', head: true })
          .eq('company_id', company!.id).eq('status', 'sent').neq('received_status', 'full'),
        supabase.from('contracts').select('status, end_date, notice_days, auto_renew').eq('company_id', company!.id).eq('status', 'active'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('company_id', company!.id).eq('status', 'in_review'),
      ])
      setPendingApprovals(pending ?? 0)
      setReadyForPO(noPo ?? 0)
      setOpenReceipts(receiptsOpen ?? 0)
      setInvoicesToApprove(isAdmin || hasPerm('invoices', 'approve') ? (invReview ?? 0) : 0)
      setExpiringContracts((ctr ?? []).filter(c => needsAttention(c as { status: 'active'; end_date: string | null; notice_days: number | null; auto_renew: boolean }, 60)).length)
    }
    loadCounts()
    return onRefreshCounts(loadCounts)
  }, [company, profile, isAdmin, location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  function handleNavClick() {
    onClose?.()
  }

  const navLinkCls = ({ isActive }: { isActive: boolean }) => cn(
    'group flex items-center gap-2.5 px-2.5 py-[4px] rounded-lg mb-px text-[14px] leading-5 font-medium transition-colors',
    isActive ? 'bg-selected text-ink' : 'text-ink hover:bg-hover',
  )

  return (
    <aside className="w-72 bg-surface border-r border-line flex flex-col h-screen shrink-0">
      {/* Logo row — its bottom line continues across the page header (AppLayout) */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-line shrink-0">
        <AppLogo size="sm" />
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1.5 text-ink2 hover:text-ink hover:bg-hover rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
        {onCollapse && (
          <button onClick={onCollapse} title={t.nav.hideSidebar} className="hidden lg:block p-1.5 text-icon hover:text-ink hover:bg-hover rounded-lg transition-colors">
            <PanelLeftClose className="w-4 h-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Company switcher (→ Settings), styled like Attio's search input */}
      {company && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-white border border-line">
            <Building2 className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
            <span className="flex-1 min-w-0 text-[14px] font-medium text-ink truncate">{company.name}</span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group, gi) => {
          const items = group.items.filter(item => !item.adminOnly || isAdmin)
          if (items.length === 0) return null
          return (
            <div key={gi} className={gi > 0 ? 'mt-3' : undefined}>
              {group.section && (
                <p className="px-2.5 mb-1.5 text-xs font-medium text-muted">
                  {t.nav[group.section]}
                </p>
              )}
              {items.map(({ to, icon: Icon, key }) => {
                const badge = key === 'approvals' ? pendingApprovals : key === 'myRequests' ? readyForPO : key === 'receipts' ? openReceipts : key === 'contracts' ? expiringContracts : key === 'invoices' ? invoicesToApprove : 0
                return (
                  <NavLink key={to} to={to} onClick={handleNavClick} className={navLinkCls}>
                    {() => (
                      <>
                        <Icon className="w-4 h-4 shrink-0 text-icon" strokeWidth={1.75} />
                        <span className="flex-1">{t.nav[key]}</span>
                        {badge > 0 && (
                          <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[11px] font-semibold leading-none flex items-center justify-center shrink-0">
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-line p-2">
        <NavLink to="/settings" onClick={handleNavClick} className={navLinkCls}>
          <Settings className="w-4 h-4 shrink-0 text-icon" strokeWidth={1.75} />
          {t.nav.settings}
        </NavLink>

        {/* Language switcher */}
        <div className="flex items-center gap-2 px-2.5 py-2 mb-1">
          <span className="text-sm font-medium text-ink2 shrink-0">{t.language.label}:</span>
          <div className="flex gap-1">
            {(['en', 'sl'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                  lang === l ? 'bg-primary text-white' : 'text-gray-400 hover:text-ink2 hover:bg-hover',
                )}
              >
                {l === 'en' ? 'EN' : 'SL'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 px-2.5 py-2">
          <div className="w-7 h-7 rounded-full bg-user text-white flex items-center justify-center text-xs font-semibold shrink-0">
            {profile ? `${profile.first_name[0]}${profile.last_name[0]}` : '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-ink truncate">
              {profile ? `${profile.first_name} ${profile.last_name}` : '—'}
            </p>
          </div>
          <button onClick={handleSignOut} className="text-icon hover:text-ink transition-colors" title={t.nav.signOut}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
