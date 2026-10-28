import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { readSheet } from 'read-excel-file/browser'
import writeExcelFile from 'write-excel-file/browser'
import Modal from './Modal'
import Button from './Button'
import { toast } from './Toast'
import { useLanguage } from '../../hooks/useLanguage'
import { dbError } from '../../lib/dbError'
import ModalActions from './ModalActions'

export type ImportRow = Record<string, string>

export interface ImportColumn {
  key: string
  label: string
  required?: boolean
  example?: string
}

interface ImportModalProps {
  open: boolean
  onClose: () => void
  title: string
  columns: ImportColumn[]
  templateName: string
  /** Lower-cased duplicate keys that already exist in the database. */
  existing: Set<string>
  /** Duplicate key(s) of a row (lower-cased), e.g. its name. A row counts as a duplicate when ANY of its keys already exists. */
  keyOf: (row: ImportRow) => string | string[]
  /** Wording of the rule in the intro text: by name only (default) or by name or VAT number. */
  duplicateRule?: 'name' | 'nameVat' | 'nameCode'
  /** Names the field behind a key prefix ("v:" -> "VAT number"), so a skipped row can say why. */
  keyLabels?: Record<string, string>
  /** Extra per-row check; return an error message or null. */
  validate?: (row: ImportRow) => string | null
  onImport: (rows: ImportRow[]) => Promise<void>
}

interface PreviewRow { line: number; data: ImportRow; status: 'new' | 'exists' | 'error'; message?: string }

interface Parsed {
  valid: ImportRow[]
  duplicates: number
  errors: { line: number; message: string }[]
  preview: PreviewRow[]   // every data row of the file, with what will happen to it
}

const EMPTY: Parsed = { valid: [], duplicates: 0, errors: [], preview: [] }

const cell = (v: unknown) => (v == null ? '' : String(v).trim())

/** Excel (.xlsx) import: download a template, upload a filled one, review, import. */
export default function ImportModal({ open, onClose, title, columns, templateName, existing, keyOf, duplicateRule = 'name', keyLabels, validate, onImport }: ImportModalProps) {
  const { t } = useLanguage()
  const s = t.common.import
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() { setFileName(''); setParsed(null); if (fileRef.current) fileRef.current.value = '' }
  function close() { reset(); onClose() }

  async function downloadTemplate() {
    const header = columns.map(c => ({ value: c.label + (c.required ? ' *' : ''), fontWeight: 'bold' as const }))
    const example = columns.map(c => ({ value: c.example ?? '' }))
    await writeExcelFile([header, example]).toFile(templateName + '.xlsx')
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    try {
      const rows = await readSheet(file)
      if (rows.length < 2) { setParsed({ ...EMPTY, errors: [{ line: 0, message: s.noRows }] }); return }
      const norm = (v: unknown) => cell(v).replace(/\*/g, '').trim().toLowerCase()
      const headers = rows[0].map(norm)
      const idx = columns.map(c => headers.findIndex(h => h === c.label.toLowerCase() || h === c.key.toLowerCase()))
      const missing = columns.filter((c, i) => c.required && idx[i] < 0)
      if (missing.length) { setParsed({ ...EMPTY, errors: [{ line: 1, message: `${s.missingColumn}: ${missing.map(c => c.label).join(', ')}` }] }); return }

      const seen = new Set(existing)
      const out: Parsed = { valid: [], duplicates: 0, errors: [], preview: [] }
      rows.slice(1).forEach((r, i) => {
        const line = i + 2
        if (r.every(v => cell(v) === '')) return
        const row: ImportRow = {}
        columns.forEach((c, ci) => { row[c.key] = idx[ci] >= 0 ? cell(r[idx[ci]]) : '' })
        const empty = columns.find(c => c.required && !row[c.key])
        if (empty) { const message = `${s.missingValue}: ${empty.label}`; out.errors.push({ line, message }); out.preview.push({ line, data: row, status: 'error', message }); return }
        const err = validate?.(row)
        if (err) { out.errors.push({ line, message: err }); out.preview.push({ line, data: row, status: 'error', message: err }); return }
        const keys = [keyOf(row)].flat()
        const hit = keys.find(k => seen.has(k))
        if (hit) {
          const field = keyLabels?.[hit.split(':')[0]]
          const message = existing.has(hit) ? (field ? `${s.statusExists}: ${field}` : s.statusExists) : (field ? `${s.statusDupFile}: ${field}` : s.statusDupFile)
          out.duplicates++; out.preview.push({ line, data: row, status: 'exists', message }); return
        }
        keys.forEach(k => seen.add(k))
        out.valid.push(row)
        out.preview.push({ line, data: row, status: 'new' })
      })
      setParsed(out)
    } catch {
      setParsed({ ...EMPTY, errors: [{ line: 0, message: s.badFile }] })
    }
  }

  async function run() {
    if (!parsed || parsed.valid.length === 0) return
    setBusy(true)
    try {
      await onImport(parsed.valid)
      toast.success(`${s.imported}: ${parsed.valid.length}`)
      close()
    } catch (e) {
      toast.error(dbError(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title={title} size="lg" icon={Upload}>
      <p className="text-sm text-ink2 mb-4">{duplicateRule === 'nameVat' ? s.introNameVat : duplicateRule === 'nameCode' ? s.introNameCode : s.intro}</p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button variant="secondary" onClick={downloadTemplate} className="gap-2"><Download className="w-4 h-4" />{s.downloadTemplate}</Button>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        <Button onClick={() => fileRef.current?.click()} className="gap-2"><FileSpreadsheet className="w-4 h-4" />{s.chooseFile}</Button>
        {fileName && <span className="text-sm text-ink2 truncate max-w-[220px]">{fileName}</span>}
      </div>

      {parsed && (
        <div className="rounded-xl border border-line p-4 mb-4 text-sm flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <span className="badge badge-success">{s.toImport}: {parsed.valid.length}</span>
            {parsed.duplicates > 0 && <span className="badge badge-neutral">{s.skipped}: {parsed.duplicates}</span>}
            {parsed.errors.length > 0 && <span className="badge badge-danger">{s.errors}: {parsed.errors.length}</span>}
          </div>
          {parsed.preview.length === 0 && parsed.errors.map((e, i) => (
            <p key={i} className="text-xs text-danger">{e.line > 0 ? `${s.row} ${e.line}: ` : ''}{e.message}</p>
          ))}
        </div>
      )}

      {parsed && parsed.preview.length > 0 && (
        <div className="rounded-xl border border-line mb-4 overflow-auto max-h-72">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-field sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-ink2 w-10">#</th>
                {columns.map(c => <th key={c.key} className="text-left px-3 py-2 text-xs font-medium text-ink2 whitespace-nowrap">{c.label}</th>)}
                <th className="text-left px-3 py-2 text-xs font-medium text-ink2 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-field">
              {parsed.preview.map((p, n) => (
                <tr key={p.line} className={p.status === 'new' ? '' : 'bg-surface'}>
                  <td className="px-3 py-2 text-xs text-gray-400">{n + 1}</td>
                  {columns.map(c => <td key={c.key} className={`px-3 py-2 max-w-[180px] truncate ${p.status === 'new' ? 'text-ink' : 'text-muted'}`} title={p.data[c.key]}>{p.data[c.key] || '—'}</td>)}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {p.status === 'new' && <span className="badge badge-success">{s.statusNew}</span>}
                    {p.status === 'exists' && <span className="badge badge-neutral">{p.message ?? s.statusExists}</span>}
                    {p.status === 'error' && <span className="badge badge-danger" title={p.message}>{p.message ?? s.statusError}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={close}>{t.common.cancel}</Button>
        <Button loading={busy} disabled={!parsed || parsed.valid.length === 0} onClick={run}>
          {s.importBtn}{parsed && parsed.valid.length > 0 ? ` (${parsed.valid.length})` : ''}
        </Button>
      </ModalActions>
    </Modal>
  )
}
