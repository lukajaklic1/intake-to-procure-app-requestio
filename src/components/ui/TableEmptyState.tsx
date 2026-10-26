import { useLanguage } from '../../hooks/useLanguage'

interface TableEmptyStateProps {
  icon: React.ElementType
  colSpan: number
  subtitle: string
  action?: React.ReactNode
}

export default function TableEmptyState({ icon: Icon, colSpan, subtitle, action }: TableEmptyStateProps) {
  const { t } = useLanguage()
  return (
    <tr>
      <td colSpan={colSpan} className="py-16">
        <div className="flex flex-col items-center justify-center text-center gap-3">
          <div className="w-9 h-9 rounded-lg border border-field flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{t.common.noDataFound}</p>
            <p className="text-sm text-ink2 mt-1.5">{subtitle}</p>
          </div>
          {action}
        </div>
      </td>
    </tr>
  )
}
