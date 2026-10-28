import type { LucideIcon } from 'lucide-react'

/** [label, icon, align]. An empty label gives the narrow actions column. */
export type GridCol = [label: string, icon?: LucideIcon, align?: 'right']

/** Header row of a `table-grid` table: grey bar, small icon before each label. */
export default function GridHead({ cols }: { cols: GridCol[] }) {
  return (
    <thead>
      <tr>
        {cols.map(([label, Icon, align], i) => (
          <th key={i} className={`whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
            <span className="inline-flex items-center gap-2">
              {Icon && <Icon className="w-3.5 h-3.5 text-icon" strokeWidth={1.75} />}{label}
            </span>
          </th>
        ))}
      </tr>
    </thead>
  )
}
