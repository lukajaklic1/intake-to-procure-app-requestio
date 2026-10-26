import { useLanguage } from '../../hooks/useLanguage'

interface EmptyStateProps {
  icon: React.ElementType
  title?: string
  subtitle: string
  action?: React.ReactNode
}

/** Minimal empty state: icon, title, one line of text. Used on its own and
 *  (inside a <td>) by TableEmptyState so both look identical. */
export default function EmptyState({ icon: Icon, title, subtitle, action }: EmptyStateProps) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3">
      <div className="w-9 h-9 rounded-lg border border-field flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title ?? t.common.noDataFound}</p>
        <p className="text-sm text-ink2 mt-1.5">{subtitle}</p>
      </div>
      {action}
    </div>
  )
}
