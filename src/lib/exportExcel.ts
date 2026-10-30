import writeExcelFile from 'write-excel-file/browser'

export type ExportKind = 'text' | 'number' | 'money' | 'date'
export interface ExportColumn<T> {
  header: string
  /** The cell value for a row. Dates may be "yyyy-mm-dd" or a full timestamp. */
  get: (row: T) => string | number | null | undefined
  kind?: ExportKind
  width?: number
}

/** A date (or timestamp) as the calendar day it falls on, so Excel shows the same day in every time zone. */
function toExcelDate(v: string): Date | null {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v)
  return Number.isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/** Writes the given rows (already filtered and sorted) to an .xlsx file, one column per ExportColumn. */
export async function exportToExcel<T>(fileName: string, columns: ExportColumn<T>[], rows: T[]) {
  const header = columns.map(c => ({ value: c.header, fontWeight: 'bold' as const }))
  const body = rows.map(row => columns.map(c => {
    const v = c.get(row)
    if (v == null || v === '') return { value: '' }
    if (c.kind === 'date') { const d = toExcelDate(String(v)); return d ? { value: d, format: 'dd.mm.yyyy' } : { value: String(v) } }
    if (c.kind === 'money' || c.kind === 'number') {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isNaN(n) ? { value: String(v) } : { value: n, format: c.kind === 'money' ? '#,##0.00' : '0' }
    }
    return { value: String(v) }
  }))
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  await writeExcelFile([header, ...body], { columns: columns.map(c => ({ width: c.width ?? 18 })) }).toFile(`${fileName}-${stamp}.xlsx`)
}
