import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Download, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../hooks/useLanguage'

/** A document of an invoice: either a file just chosen (not uploaded yet) or one in storage. */
export interface PreviewDoc { key: string; name: string; file?: File; path?: string }

const BUCKET = 'quotations'
const ext = (name: string) => (name.split('.').pop() ?? '').toLowerCase()
const kindOf = (name: string): 'pdf' | 'image' | 'other' => {
  const e = ext(name)
  return e === 'pdf' ? 'pdf' : ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(e) ? 'image' : 'other'
}
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

/** Shows the supplier's invoice next to the data: PDF and images inline, other files as a download. Switch between the files when there are several. */
export default function DocumentPreview({ docs, height = 560, empty, onRemove }: { docs: PreviewDoc[]; height?: number | string; empty?: React.ReactNode; onRemove?: (key: string) => void }) {
  const { t } = useLanguage()
  const s = t.invoices
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const doc = docs.find(d => d.key === activeKey) ?? docs[0]
  // a new file that is added becomes the one that is shown
  const lastKey = docs.length ? docs[docs.length - 1].key : null
  useEffect(() => { if (lastKey) setActiveKey(lastKey) }, [lastKey])

  useEffect(() => {
    if (!doc) { setUrl(null); return }
    let revoke: string | null = null
    let cancelled = false
    setLoading(true); setFailed(false); setUrl(null)
    ;(async () => {
      let blob: Blob | null = null
      if (doc.file) blob = doc.file
      else if (doc.path) {
        const { data, error } = await supabase.storage.from(BUCKET).download(doc.path)
        if (error || !data) { if (!cancelled) { setFailed(true); setLoading(false) } return }
        blob = data
      }
      if (cancelled || !blob) return
      // the type from the name, because storage does not always send one the viewer accepts
      const typed = new Blob([blob], { type: MIME[ext(doc.name)] ?? blob.type })
      revoke = URL.createObjectURL(typed)
      setUrl(revoke); setLoading(false)
    })()
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke) }
  }, [doc?.key, doc?.path, doc?.file])

  if (!doc) return <div className="rounded-lg border border-dashed border-field bg-surface flex items-center justify-center text-sm text-ink2 text-center px-6" style={{ height }}>{empty ?? s.noDocuments}</div>

  const kind = kindOf(doc.name)
  return (
    <div className="flex flex-col gap-2">
      {(docs.length > 1 || onRemove) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {docs.map(d => (
            <div key={d.key} className={`inline-flex items-center h-7 max-w-[260px] rounded-lg border text-[13px] font-medium transition-colors ${d.key === doc.key ? 'border-field bg-surface text-ink' : 'border-transparent text-ink2 hover:bg-hover'}`}>
              <button type="button" onClick={() => setActiveKey(d.key)} title={d.name} className="inline-flex items-center gap-1.5 h-full min-w-0 pl-2.5 pr-1.5">
                <FileText className="w-3.5 h-3.5 shrink-0 text-icon" strokeWidth={1.75} /><span className="truncate">{d.name}</span>
              </button>
              {onRemove && (
                <button type="button" onClick={() => onRemove(d.key)} aria-label={s.removeFile} title={s.removeFile}
                  className="w-5 h-5 mr-1 shrink-0 rounded inline-flex items-center justify-center text-icon hover:text-danger hover:bg-hover transition-colors">
                  <X className="w-3 h-3" strokeWidth={2} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-field bg-surface overflow-hidden relative" style={{ height }}>
        {loading && <div className="absolute inset-0 flex items-center justify-center"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-accent" /></div>}
        {failed && <p className="absolute inset-0 flex items-center justify-center text-sm text-ink2 px-6 text-center">{s.previewFailed}</p>}
        {url && kind === 'pdf' && <iframe src={`${url}#view=FitH`} title={doc.name} className="w-full h-full bg-white" />}
        {url && kind === 'image' && <div className="w-full h-full overflow-auto bg-white"><img src={url} alt={doc.name} className="max-w-full mx-auto" /></div>}
        {url && kind === 'other' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <FileText className="w-8 h-8 text-icon" strokeWidth={1.5} />
            <p className="text-sm text-ink2">{s.noPreviewType}</p>
            <a href={url} download={doc.name} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:underline"><Download className="w-4 h-4" />{doc.name}</a>
          </div>
        )}
      </div>
      {url && kind !== 'other' && (
        <a href={url} target="_blank" rel="noreferrer" className="self-start inline-flex items-center gap-1.5 text-[13px] font-medium text-ink2 hover:text-ink transition-colors"><ExternalLink className="w-3.5 h-3.5" />{s.openInTab}</a>
      )}
    </div>
  )
}
