import { Children, isValidElement, type ChangeEvent, type ReactElement, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface FilterSelectProps {
  label: string
  value: string
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void
  children: ReactNode   // <option> elements, exactly as for a native <select>
}

const textOf = (node: ReactNode): string =>
  Children.toArray(node).map(c => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : '')).join('')

/** Filter chip: grey filter name, black chosen value ("Supplier: All").
 *  A transparent native <select> sits on top, so it keeps native behaviour. */
export default function FilterSelect({ label, value, onChange, children }: FilterSelectProps) {
  const options = Children.toArray(children).filter(isValidElement) as ReactElement<{ value?: string; children?: ReactNode }>[]
  const selected = options.find(o => String(o.props.value ?? '') === String(value)) ?? options[0]

  return (
    <div className="relative inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-lg border border-field bg-white text-sm hover:border-field-hover focus-within:ring-2 focus-within:ring-accent transition-colors">
      <span className="text-filter-label whitespace-nowrap">{label}:</span>
      <span className="text-ink whitespace-nowrap max-w-[160px] truncate">{selected ? textOf(selected.props.children) : ''}</span>
      <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <select value={value} onChange={onChange} aria-label={label}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-sm">
        {children}
      </select>
    </div>
  )
}
