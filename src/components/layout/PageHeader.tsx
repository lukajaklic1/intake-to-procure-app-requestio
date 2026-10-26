import { useLocation } from 'react-router-dom'
import { PanelLeftOpen } from 'lucide-react'
import { useLanguage } from '../../hooks/useLanguage'
import { findNavItem } from './navConfig'

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

  return (
    <header className="hidden lg:flex h-14 shrink-0 items-center gap-2 px-6 border-b border-line bg-page">
      {sidebarCollapsed && (
        <button onClick={onShowSidebar} title={t.nav.showSidebar} className="p-1.5 -ml-2 mr-1 text-icon hover:text-ink hover:bg-hover rounded-lg transition-colors">
          <PanelLeftOpen className="block w-4 h-4" strokeWidth={1.75} />
        </button>
      )}
      {Icon && <Icon className="block w-4 h-4 shrink-0 text-icon" strokeWidth={1.75} />}
      {item && <span className="text-[15px] leading-none font-medium text-ink">{t.nav[item.key]}</span>}
    </header>
  )
}
