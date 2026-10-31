import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { matchesSearch } from '../../lib/search'
import { useLanguage } from '../../hooks/useLanguage'
import type { Item } from '../../types/database'

interface Props {
  /** Items of the category chosen on the line (or all of them when none is chosen). */
  items: Item[]
  /** The whole catalog: offered through "Show all items" so a chosen category never locks the search. */
  allItems?: Item[]
  onSelect: (item: Item) => void
  placeholder: string
}

/** Search box of a document line that picks an item from the catalog. The list is portalled and positioned
 *  against the window, so a table's overflow can't clip it; it flips upwards near the bottom of the screen. */
export default function CatalogPicker({ items, allItems, onSelect, placeholder }: Props) {
  const { t } = useLanguage()
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const narrowed = !!allItems && items.length < allItems.length
  const pool = showAll && allItems ? allItems : items
  const filtered = query ? pool.filter(i => matchesSearch(query, [i.item_number, i.name, i.long_description])) : pool

  function show() {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = below < 220 && above > below
    setPos({
      left: Math.min(r.left, window.innerWidth - 336), width: Math.max(r.width, 320),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      maxH: Math.max(140, Math.min(288, up ? above : below)),
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onScroll = (e: Event) => { if (!(e.target as Element | null)?.closest?.('[data-picker-list]')) close() }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', onScroll, true) }
  }, [open])

  return (
    <>
      <div ref={boxRef} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-icon pointer-events-none" strokeWidth={1.75} />
        <input value={query} onChange={e => { setQuery(e.target.value); show() }} onFocus={show} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full h-9 pl-9 pr-8 text-sm rounded-lg border border-field hover:border-field-hover bg-white text-ink placeholder:text-placeholder focus:outline-none focus:border-field-focus" />
        {query && <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-icon hover:text-ink"><X className="w-3.5 h-3.5" /></button>}
      </div>
      {open && pos && createPortal(
        <div data-picker-list style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          className="z-50 bg-white border border-line rounded-xl shadow-[0_8px_30px_rgba(16,17,18,0.12)] overflow-y-auto p-1.5">
          {filtered.length > 0 ? filtered.map(item => (
            <button key={item.id} type="button" onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(item); setQuery(''); setOpen(false) }}
              className="w-full flex items-baseline gap-2 text-left px-3 py-2 rounded-lg hover:bg-selected transition-colors">
              <span className="text-xs text-ink2 tabular-nums shrink-0">{item.item_number}</span>
              <span className="text-sm font-medium text-ink truncate">{item.name}</span>
            </button>
          )) : <p className="px-3 py-2 text-sm text-ink2">-</p>}
          {narrowed && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowAll(v => !v)}
              className="sticky bottom-0 w-full mt-1 text-left px-3 py-2 rounded-lg border-t border-line bg-white text-[13px] font-medium text-primary hover:bg-selected transition-colors">
              {showAll ? t.common.onlyThisCategory : `${t.common.showAllItems} (${allItems!.length})`}
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
