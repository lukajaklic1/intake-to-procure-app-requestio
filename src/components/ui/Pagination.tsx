import { useRef } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { useLanguage } from '../../hooks/useLanguage'

interface PaginationProps {
  total: number
  page: number
  pageSize: number
  onChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
}

/** Table footer. Only shown once there is more than one page of rows. */
export default function Pagination({ total, page, pageSize, onChange, onPageSizeChange, pageSizeOptions = [10, 20, 50, 100] }: PaginationProps) {
  const { t } = useLanguage()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const rootRef = useRef<HTMLDivElement>(null)

  if (total <= pageSize) return null

  function goTo(p: number) {
    onChange(p)
    rootRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const from = (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, total)
  const navBtn = 'w-7 h-7 flex items-center justify-center rounded-md border border-field text-ink2 hover:bg-hover hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors'

  return (
    <div ref={rootRef} data-pagination className="flex items-center justify-between gap-4 px-4 py-2.5 border-t border-field bg-surface">
      <span className="text-sm text-ink2 tabular-nums">{from}–{to} {t.common.of} {total}</span>

      <div className="flex items-center gap-4">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-sm text-ink2">
            <span className="hidden sm:inline">{t.common.show}</span>
            <span className="relative">
              <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
                className="appearance-none h-7 rounded-md border border-field bg-white pl-2.5 pr-7 text-sm text-ink hover:border-field-hover focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer">
                {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </span>
          </label>
        )}

        <div className="flex items-center gap-1.5">
          <button onClick={() => goTo(safePage - 1)} disabled={safePage <= 1} className={navBtn} aria-label="Previous page">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-ink2 tabular-nums px-1.5 min-w-[3.5rem] text-center">{safePage} {t.common.of} {totalPages}</span>
          <button onClick={() => goTo(safePage + 1)} disabled={safePage >= totalPages} className={navBtn} aria-label="Next page">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
