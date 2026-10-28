import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { matchesSearch } from '../../lib/search'
import { useLanguage } from '../../hooks/useLanguage'

export interface SelectOption { value: string; label: string; badge?: string; disabled?: boolean }

interface SelectProps {
  id?: string
  label?: string
  required?: boolean
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  error?: string
  disabled?: boolean
  className?: string
}

const ROW = 36

/** Form dropdown that replaces the browser's native <select>: same look as the text fields, a rounded menu
 *  with a grey hover row and a check on the chosen one, and a search box for long lists. An option with `badge`
 *  is shown as that badge (used for statuses). The menu is portalled, so popups and cards can't clip it. */
export default function Select({ id, label, required, value, onChange, options, placeholder, error, disabled, className }: SelectProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)
  const searchable = options.length > 8
  const shown = useMemo(() => (query ? options.filter(o => matchesSearch(query, [o.label])) : options), [options, query])

  function close() { setOpen(false); setQuery('') }
  function openMenu() {
    if (disabled) return
    const r = btnRef.current!.getBoundingClientRect()
    const wanted = Math.min(options.length * ROW + 16 + (options.length > 8 ? 52 : 0), 320)
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = below < Math.min(wanted, 200) && above > below
    setPos({
      left: r.left, width: r.width,
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      maxH: Math.max(140, Math.min(wanted, up ? above : below)),
    })
    setActive(Math.max(0, options.findIndex(o => o.value === value)))
    setOpen(true)
  }
  function pick(o: SelectOption) { if (o.disabled) return; onChange(o.value); close(); btnRef.current?.focus() }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element
      if (!el.closest('[data-select-menu]') && !btnRef.current?.contains(el)) close()
    }
    const onScroll = (e: Event) => { if (!(e.target as Element)?.closest?.('[data-select-menu]')) close() }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close) }
  }, [open])

  useEffect(() => {
    if (open) (listRef.current?.querySelectorAll('[role="option"]')[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); openMenu() }
      return
    }
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(shown.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]) }
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)} onKeyDown={onKeyDown}>
      {label && <label htmlFor={id}>{label}{required && ' *'}</label>}
      <button ref={btnRef} id={id} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
        className={cn(
          'select-field w-full h-9 flex items-center gap-2 pl-3 pr-2.5 text-left text-sm rounded-[0.625rem] border bg-white transition-colors',
          error ? 'border-red-400' : 'border-field',
          !disabled && 'hover:bg-surface', disabled && 'bg-surface text-ink2 cursor-not-allowed',
        )}>
        {selected
          ? (selected.badge ? <span className={cn('badge', selected.badge)}>{selected.label}</span> : <span className="truncate text-ink">{selected.label}</span>)
          : <span className="truncate text-placeholder">{placeholder ?? t.common.select}</span>}
        <ChevronDown className="w-4 h-4 text-icon ml-auto shrink-0" />
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {open && pos && createPortal(
        <div data-select-menu style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          className="z-[60] flex flex-col bg-white border border-line rounded-xl shadow-[0_8px_30px_rgba(16,17,18,0.12)] p-1.5">
          {searchable && (
            <div className="relative mb-1.5 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-filter-label" />
              <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setActive(0) }}
                className="select-search w-full h-9 pl-9 pr-3 text-sm bg-surface rounded-lg text-ink outline-none border-0 placeholder:text-filter-label" />
            </div>
          )}
          <div ref={listRef} role="listbox" className="overflow-y-auto flex flex-col gap-0.5">
            {shown.length === 0 && <p className="px-3 py-2 text-sm text-ink2">—</p>}
            {shown.map((o, i) => (
              <button key={o.value + i} type="button" role="option" aria-selected={o.value === value} disabled={o.disabled}
                onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
                className={cn('w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[14px] text-left transition-colors disabled:opacity-40',
                  i === active ? 'bg-selected' : '')}>
                {o.badge ? <span className={cn('badge', o.badge)}>{o.label}</span> : <span className="flex-1 truncate text-ink">{o.label}</span>}
                {o.value === value && <Check className="w-4 h-4 text-ink2 ml-auto shrink-0" />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
