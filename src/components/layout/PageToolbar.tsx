import type { ReactNode } from 'react'

interface PageToolbarProps {
  children?: ReactNode   // filters, left side
  actions?: ReactNode    // buttons, right side
}

/** Attio-style row under the page header: filters on the left, actions on the
 *  right, with a bottom line. Pulls itself out to the edges of the page's
 *  `p-4 lg:p-6` wrapper so the line spans the full width. */
export default function PageToolbar({ children, actions }: PageToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap px-4 lg:px-6 py-2.5 border-b border-line bg-page -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 mb-4 lg:mb-6">
      {children}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  )
}
