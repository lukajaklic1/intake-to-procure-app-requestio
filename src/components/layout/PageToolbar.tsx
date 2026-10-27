import type { ReactNode } from 'react'

interface PageToolbarProps {
  attached?: boolean     // true when a full-bleed table follows directly (no gap)
  children?: ReactNode   // filters, left side
  actions?: ReactNode    // buttons, right side
}

/** Attio-style row under the page header: filters on the left, actions on the
 *  right, with a bottom line. Pulls itself out to the edges of the page's
 *  `p-4 lg:p-6` wrapper so the line spans the full width. */
export default function PageToolbar({ children, actions, attached }: PageToolbarProps) {
  return (
    <div className={`flex items-center gap-x-2 gap-y-2.5 flex-wrap px-4 lg:px-6 py-3 border-b border-line bg-page -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 ${attached ? "" : "mb-4 lg:mb-6"}`}>
      {children}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-2.5">{actions}</div>}
    </div>
  )
}
