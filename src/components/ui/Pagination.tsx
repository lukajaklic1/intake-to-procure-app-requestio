import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import FilterSelect from './FilterSelect'
import { useLanguage } from '../../hooks/useLanguage'

interface PaginationProps {
  total: number
  page: number
  pageSize: number
  onChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
}

/** Table footer. Hidden while all rows fit the smallest page size, so picking a bigger size never makes the selector disappear. */
export default function Pagination({ total, page, pageSize, onChange, onPageSizeChange, pageSizeOptions = [20, 50, 100] }: PaginationProps) {
  const { t } = useLanguage()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const rootRef = useRef<HTMLDivElement>(null)

  if (total <= (onPageSizeChange ? Math.min(...pageSizeOptions) : pageSize)) return null

  function goTo(p: number) {
    onChange(p)
    rootRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const from = (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, total)
  const navBtn = 'w-7 h-7 flex items-center justify-center rounded-lg border border-field bg-white text-ink2 hover:border-field-hover hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-field disabled:hover:text-ink2 transition-colors'

  return (
    <div ref={rootRef} data-pagination className="flex items-center justify-between gap-4 px-4 py-2.5 border-t border-field bg-surface">
      <span className="text-[13px] font-medium text-ink2">{from}–{to} {t.common.of} {total}</span>

      <div className="flex items-center gap-4">
        {onPageSizeChange && (
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink2">
            <span className="hidden sm:inline">{t.common.show}</span>
            <FilterSelect value={String(pageSize)} defaultValue={String(pageSize)} placement="up" onChange={e => onPageSizeChange(Number(e.target.value))}>
              {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </FilterSelect>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={() => goTo(safePage - 1)} disabled={safePage <= 1} className={navBtn} aria-label="Previous page">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[13px] font-medium text-ink px-1.5 min-w-[3.5rem] text-center whitespace-nowrap">{safePage} {t.common.of} {totalPages}</span>
          <button onClick={() => goTo(safePage + 1)} disabled={safePage >= totalPages} className={navBtn} aria-label="Next page">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
