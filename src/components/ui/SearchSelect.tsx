import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLanguage } from '../../hooks/useLanguage'

interface SearchSelectProps {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  /** Shown first (before the full list) while nothing is typed. */
  popular?: string[]
  placeholder?: string
}

/** Input with a searchable dropdown. The value is the chosen option's text. */
export default function SearchSelect({ id, label, value, onChange, options, popular = [], placeholder }: SearchSelectProps) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  // Keep a stored value that isn't in the list (e.g. typed in another language) selectable.
  const all = useMemo(() => (value && !options.includes(value) ? [value, ...options] : options), [options, value])
  // Match the beginning of the name (so "SL" finds Slovenija, not Islandija); ignore case and diacritics.
  const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = fold(query.trim())
  const filtered = q ? all.filter(o => fold(o).startsWith(q)) : all
  const rest = q ? filtered : filtered.filter(o => !popular.includes(o))
  const shown = q ? filtered : [...popular, ...rest]

  function pick(v: string) { onChange(v); setOpen(false); setQuery('') }

  return (
    <div className="flex flex-col gap-1 relative">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input id={id} value={open ? query : value} placeholder={placeholder ?? t.common.select}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (shown[0]) pick(shown[0]) }
            if (e.key === 'Escape') setOpen(false)
          }}
          autoComplete="off"
          className="w-full rounded-lg border border-field px-3 py-2 pr-8 hover:border-field-hover text-sm text-ink placeholder:text-placeholder focus:outline-none focus:ring-2 focus:ring-accent bg-white" />
        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        {open && (
          <div className="absolute z-30 left-0 mt-1 w-full bg-white border border-field rounded-lg shadow-lg overflow-y-auto max-h-56">
            {shown.length > 0 ? shown.map((o, i) => (
              <div key={o + i}>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-hover ${o === value ? 'font-medium text-ink' : 'text-ink'}`}>{o}</button>
                {!q && popular.length > 0 && i === popular.length - 1 && <div className="border-t border-line" />}
              </div>
            )) : (
              <p className="px-3 py-2 text-sm text-gray-400">{t.common.empty.noResults.title}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
