import EmptyState from './EmptyState'

interface TableEmptyStateProps {
  icon: React.ElementType
  colSpan: number
  title?: string
  subtitle: string
  action?: React.ReactNode
}

export default function TableEmptyState({ icon, colSpan, title, subtitle, action }: TableEmptyStateProps) {
  return (
    <tr>
      <td colSpan={colSpan} data-empty className="py-16">
        <EmptyState icon={icon} title={title} subtitle={subtitle} action={action} />
      </td>
    </tr>
  )
}
