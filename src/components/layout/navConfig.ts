import {
  LayoutDashboard, FileText, Building2, Package,
  MapPin, Users, UserCog, Settings,
  ClipboardList, CheckCircle2, PackageCheck,
} from 'lucide-react'

export type NavKey = 'dashboard' | 'myRequests' | 'approvals' | 'purchaseOrders' | 'receipts'
  | 'suppliers' | 'catalog' | 'locations' | 'departments' | 'users' | 'settings'

export type SectionKey = 'sectionWorkflow' | 'sectionCatalog' | 'sectionOrganization' | 'sectionAdmin'

export interface NavItem {
  to: string
  icon: React.ElementType
  key: NavKey
  adminOnly?: boolean
}

export const NAV_GROUPS: { section?: SectionKey; items: NavItem[] }[] = [
  {
    items: [{ to: '/dashboard', icon: LayoutDashboard, key: 'dashboard' }],
  },
  {
    section: 'sectionWorkflow',
    items: [
      { to: '/requests', icon: ClipboardList, key: 'myRequests' },
      { to: '/approvals', icon: CheckCircle2, key: 'approvals' },
      { to: '/purchase-orders', icon: FileText, key: 'purchaseOrders' },
      { to: '/receipts', icon: PackageCheck, key: 'receipts' },
    ],
  },
  {
    section: 'sectionCatalog',
    items: [
      { to: '/suppliers', icon: Building2, key: 'suppliers' },
      { to: '/catalog', icon: Package, key: 'catalog' },
    ],
  },
  {
    section: 'sectionOrganization',
    items: [
      { to: '/locations', icon: MapPin, key: 'locations' },
      { to: '/departments', icon: Users, key: 'departments' },
    ],
  },
  {
    section: 'sectionAdmin',
    items: [{ to: '/users', icon: UserCog, key: 'users', adminOnly: true }],
  },
]

export const SETTINGS_ITEM: NavItem = { to: '/settings', icon: Settings, key: 'settings' }

/** The nav entry a path belongs to (detail pages like /requests/123 match their list page). */
export function findNavItem(pathname: string): NavItem | undefined {
  const all = [...NAV_GROUPS.flatMap(g => g.items), SETTINGS_ITEM]
  return all.find(i => pathname === i.to || pathname.startsWith(i.to + '/'))
}
