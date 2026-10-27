import { useLocation } from 'react-router-dom'
import { PanelLeftOpen } from 'lucide-react'
import { useLanguage } from '../../hooks/useLanguage'
import { findNavItem } from './navConfig'
import { useHeaderCountsValue, useHeaderTabsValue } from './HeaderCounts'

interface PageHeaderProps {
  sidebarCollapsed: boolean
  onShowSidebar: () => void
}

/** Top bar of the content area. Same height as the sidebar's logo row so the
 *  bottom line runs across both. Shows the current section's icon + name. */
export default function PageHeader({ sidebarCollapsed, onShowSidebar }: PageHeaderProps) {
  const { pathname } = useLocation()
  const { t } = useLanguage()
  const item = findNavItem(pathname)
  const Icon = item?.icon
  const counts = useHeaderCountsValue()
  const labeled = counts.length > 1 || counts.some(c => c.label)
  const { tabs, select } = useHeaderTabsValue()

  return (
    <header className="hidden lg:flex h-14 shrink-0 items-center gap-2 px-6 border-b border-line bg-page">
      {sidebarCollapsed && (
        <button onClick={onShowSidebar} title={t.nav.showSidebar} className="p-1.5 -ml-2 mr-1 text-icon hover:text-ink hover:bg-hover rounded-lg transition-colors">
          <PanelLeftOpen className="block w-4 h-4" strokeWidth={1.75} />
        </button>
      )}
      {Icon && <Icon className="block w-4 h-4 shrink-0 text-icon" strokeWidth={1.75} />}
      {item && <span className="text-[15px] leading-none font-medium text-ink">{t.nav[item.key]}</span>}
      {tabs.length > 0 && (
        <div className="flex items-center gap-1.5 ml-3">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => select(tab.id)}
              className={`inline-flex items-center gap-2 h-8 px-3 rounded-lg border text-sm transition-colors ${tab.active ? 'border-field bg-surface text-ink' : 'border-transparent text-ink2 hover:bg-hover'}`}>
              {tab.icon && <tab.icon className="block w-4 h-4 shrink-0 text-icon" strokeWidth={1.75} />}
              {tab.label}
              {tab.count != null && <CountBadge value={tab.count} />}
            </button>
          ))}
        </div>
      )}
      {tabs.length === 0 && !labeled && counts[0] && <CountBadge value={counts[0].value} />}
      {tabs.length === 0 && labeled && (
        <div className="flex items-center gap-2 ml-3">
          {counts.map(c => (
            <span key={c.label} className="inline-flex items-center gap-2 h-7 pl-2.5 pr-1.5 rounded-lg border border-field bg-white text-sm text-ink">
              {c.label}<CountBadge value={c.value} />
            </span>
          ))}
        </div>
      )}
    </header>
  )
}

function CountBadge({ value }: { value: number }) {
  return <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-md bg-surface border border-field text-[11px] font-normal tabular-nums text-ink2">{value}</span>
}
