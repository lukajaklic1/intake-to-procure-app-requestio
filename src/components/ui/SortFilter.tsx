import FilterSelect from './FilterSelect'
import { useLanguage } from '../../hooks/useLanguage'
import type { SortDef } from '../../lib/sort'

/** "Razvrsti: …" chip for the toolbar above a table. The first definition is the default order. */
export default function SortFilter<T>({ defs, value, onChange }: { defs: SortDef<T>[]; value: string; onChange: (value: string) => void }) {
  const { t } = useLanguage()
  return (
    <FilterSelect label={t.filters.labels.sort} value={value} defaultValue={defs[0].value} onChange={e => onChange(e.target.value)}>
      {defs.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
    </FilterSelect>
  )
}
