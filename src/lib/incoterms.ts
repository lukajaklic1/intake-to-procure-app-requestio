import type { SelectOption } from '../components/ui/Select'

/** Incoterms 2020: code and official English name (the dropdown shows just the code; buyers know them). */
export const INCOTERMS: [code: string, name: string][] = [
  ['EXW', 'Ex Works'],
  ['FCA', 'Free Carrier'],
  ['CPT', 'Carriage Paid To'],
  ['CIP', 'Carriage and Insurance Paid To'],
  ['DAP', 'Delivered at Place'],
  ['DPU', 'Delivered at Place Unloaded'],
  ['DDP', 'Delivered Duty Paid'],
  ['FAS', 'Free Alongside Ship'],
  ['FOB', 'Free on Board'],
  ['CFR', 'Cost and Freight'],
  ['CIF', 'Cost, Insurance and Freight'],
]

/** Dropdown options; a stored value that isn't a standard code (typed freely before) stays selectable. */
export function incotermOptions(current?: string | null): SelectOption[] {
  const opts: SelectOption[] = [{ value: '', label: '-' }, ...INCOTERMS.map(([code]) => ({ value: code, label: code }))]
  if (current && !INCOTERMS.some(([code]) => code === current)) opts.push({ value: current, label: current })
  return opts
}
