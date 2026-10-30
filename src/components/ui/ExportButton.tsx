import { Download } from 'lucide-react'
import Button from './Button'
import { toast } from './Toast'
import { useLanguage } from '../../hooks/useLanguage'
import { exportToExcel, type ExportColumn } from '../../lib/exportExcel'

/** "Izvozi" button of a list: downloads what the table currently shows (filters and sort applied, all pages) as .xlsx. */
export default function ExportButton<T>({ fileName, columns, rows }: { fileName: string; columns: ExportColumn<T>[]; rows: T[] }) {
  const { t } = useLanguage()
  async function run() {
    try { await exportToExcel(fileName, columns, rows) }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <Button variant="secondary" onClick={run} disabled={rows.length === 0} title={rows.length === 0 ? undefined : `${rows.length}`} className="gap-2">
      <Download className="w-4 h-4" />{t.common.export}
    </Button>
  )
}
