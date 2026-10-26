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

export default function Pagination({ total, page, pageSize, onChange, onPageSizeChange, pageSizeOptions = [10, 20, 50, 100] }: PaginationProps) {
  const { t } = useLanguage()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const rootRef = useRef<HTMLDivElement>(null)

  function goTo(p: number) {
    onChange(p)
    rootRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, total)

  return (
    <div ref={rootRef} data-pagination className="flex items-center px-4 py-2 border-t border-field bg-surface">
      <div className="flex items-center gap-2 text-sm text-ink2">
        <span>{t.common.show}</span>
        {onPageSizeChange ? (
          <div className="relative">
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              className="appearance-none bg-transparent rounded-lg pl-0 pr-5 py-1 text-sm text-ink2 hover:text-ink focus:outline-none cursor-pointer"
            >
              {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        ) : (
          <span className="text-ink2">{pageSize}</span>
        )}
      </div>

      <span className="ml-4 text-xs text-gray-400 tabular-nums hidden sm:inline">{from}–{to} {t.common.of} {total}</span>

      <div className="flex items-center gap-3 ml-auto">
        <span className="text-sm text-ink2 tabular-nums">{safePage} {t.common.of} {totalPages}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => goTo(safePage - 1)}
            disabled={safePage <= 1}
            className="p-1 rounded-lg border border-field text-gray-400 hover:text-ink hover:border-field-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => goTo(safePage + 1)}
            disabled={safePage >= totalPages}
            className="p-1 rounded-lg border border-field text-gray-400 hover:text-ink hover:border-field-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
