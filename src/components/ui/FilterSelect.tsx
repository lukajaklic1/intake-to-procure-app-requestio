import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

interface FilterSelectProps {
  label: string
  value: string
  /** Value that means "no filter" (defaults to the first option). A different value marks the chip as active. */
  defaultValue?: string
  onChange: (e: { target: { value: string } }) => void
  children: ReactNode   // <option> elements, exactly as for a native <select>
}

const textOf = (node: ReactNode): string =>
  Children.toArray(node).map(c => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : '')).join('')

/** Filter chip: grey filter name, black chosen value ("Supplier: All").
 *  Opens a small menu (with a search box for long lists); the highlighted row gets a grey
 *  background instead of an outline, like Attio. */
export default function FilterSelect({ label, value, defaultValue, onChange, children }: FilterSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const options = (Children.toArray(children).filter(isValidElement) as ReactElement<{ value?: string; children?: ReactNode }>[])
    .map(o => ({ value: String(o.props.value ?? ''), text: textOf(o.props.children) }))
  const selected = options.find(o => o.value === String(value)) ?? options[0]
  const isActive = !!selected && selected.value !== (defaultValue ?? options[0]?.value)
  const q = query.trim().toLowerCase()
  const shown = q ? options.filter(o => o.text.toLowerCase().includes(q)) : options
  const searchable = options.length > 8

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // keep the highlighted row in view while moving with the keyboard
  useEffect(() => {
    if (open) (listRef.current?.querySelectorAll('[role="option"]')[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function close() { setOpen(false); setQuery('') }
  function openMenu() {
    setActive(Math.max(0, options.findIndex(o => o.value === String(value))))
    setOpen(true)
  }
  function pick(v: string) { onChange({ target: { value: v } }); close() }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(shown.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active].value) }
  }

  return (
    <div ref={rootRef} className="relative inline-block" onKeyDown={onKeyDown}>
      <button type="button" onClick={() => (open ? close() : openMenu())} aria-haspopup="listbox" aria-expanded={open}
        className={`inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-lg border text-sm outline-none transition-colors ${isActive ? 'border-primary bg-accent-light hover:brightness-95' : open ? 'border-field-hover bg-hover' : 'border-field bg-white hover:border-field-hover hover:bg-hover'}`}>
        <span className="text-filter-label whitespace-nowrap">{label}:</span>
        <span className="text-ink whitespace-nowrap max-w-[160px] truncate">{selected?.text}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-40 min-w-[220px] w-max max-w-[340px] bg-white border border-line rounded-xl shadow-[0_8px_30px_rgba(16,17,18,0.12)] p-1.5">
          {searchable && (
            <div className="relative mb-1.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-filter-label" />
              <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setActive(0) }}
                className="w-full h-9 pl-9 pr-3 text-sm bg-surface rounded-lg text-ink outline-none placeholder:text-filter-label" />
            </div>
          )}
          <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto flex flex-col gap-0.5">
            {shown.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">—</p>}
            {shown.map((o, i) => (
              <Fragment key={o.value + i}>
                <button type="button" role="option" aria-selected={o.value === selected?.value}
                  onMouseEnter={() => setActive(i)} onClick={() => pick(o.value)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] text-left text-ink outline-none transition-colors ${i === active ? 'bg-selected' : ''}`}>
                  <span className="flex-1 truncate">{o.text}</span>
                  {o.value === selected?.value && (
                    <span className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0"><Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} /></span>
                  )}
                </button>
                {/* The first option ("All") is set apart from the rest by a thin line */}
                {!q && i === 0 && shown.length > 1 && <div className="h-px bg-line mx-1 my-0.5" />}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
