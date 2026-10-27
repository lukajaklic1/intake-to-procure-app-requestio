import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

interface FilterSelectProps {
  label: string
  value: string
  onChange: (e: { target: { value: string } }) => void
  children: ReactNode   // <option> elements, exactly as for a native <select>
}

const textOf = (node: ReactNode): string =>
  Children.toArray(node).map(c => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : '')).join('')

/** Filter chip: grey filter name, black chosen value ("Supplier: All").
 *  Opens a small menu (with a search box for long lists); the highlighted row gets a grey
 *  background instead of an outline, like Attio. */
export default function FilterSelect({ label, value, onChange, children }: FilterSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const options = (Children.toArray(children).filter(isValidElement) as ReactElement<{ value?: string; children?: ReactNode }>[])
    .map(o => ({ value: String(o.props.value ?? ''), text: textOf(o.props.children) }))
  const selected = options.find(o => o.value === String(value)) ?? options[0]
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
    if (open) (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
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
        className={`inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-lg border bg-white text-sm outline-none transition-colors ${open ? 'border-field-hover bg-hover' : 'border-field hover:border-field-hover'}`}>
        <span className="text-filter-label whitespace-nowrap">{label}:</span>
        <span className="text-ink whitespace-nowrap max-w-[160px] truncate">{selected?.text}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 min-w-[200px] w-max max-w-[320px] bg-white border border-line rounded-lg shadow-lg p-1">
          {searchable && (
            <div className="relative mb-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-filter-label" />
              <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setActive(0) }}
                className="w-full h-8 pl-8 pr-2 text-sm bg-transparent text-ink outline-none border-b border-line" />
            </div>
          )}
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto">
            {shown.length === 0 && <p className="px-2.5 py-1.5 text-sm text-gray-400">—</p>}
            {shown.map((o, i) => (
              <button key={o.value + i} type="button" role="option" aria-selected={o.value === selected?.value}
                onMouseEnter={() => setActive(i)} onClick={() => pick(o.value)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left text-ink outline-none ${i === active ? 'bg-selected' : ''}`}>
                <span className="flex-1 truncate">{o.text}</span>
                {o.value === selected?.value && <Check className="w-3.5 h-3.5 text-ink shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
