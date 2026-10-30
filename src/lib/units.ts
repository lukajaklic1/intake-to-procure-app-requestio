import type { SelectOption } from '../components/ui/Select'

/** Units of measure offered for catalog items. */
export const UNITS = ['kos', 'kg', 'g', 'l', 'ml', 'm', 'm²', 'm³', 'pakiranje', 'škatla', 'komplet', 'ura']

/** Dropdown options; a stored value that isn't in the list (typed freely before, or imported) stays selectable. */
export function unitOptions(current?: string | null): SelectOption[] {
  const opts: SelectOption[] = [{ value: '', label: '-' }, ...UNITS.map(u => ({ value: u, label: u }))]
  if (current && !UNITS.includes(current)) opts.push({ value: current, label: current })
  return opts
}
