import type { SelectOption } from '../components/ui/Select'

type Lang = 'sl' | 'en'

/** Units of measure of catalog items. An item stores the language-neutral `code`; each user sees it in their own language. */
export const UNITS: { code: string; sl: string; en: string }[] = [
  { code: 'pcs', sl: 'kos', en: 'pcs' },
  { code: 'kg', sl: 'kg', en: 'kg' },
  { code: 'g', sl: 'g', en: 'g' },
  { code: 'l', sl: 'l', en: 'l' },
  { code: 'ml', sl: 'ml', en: 'ml' },
  { code: 'm', sl: 'm', en: 'm' },
  { code: 'm2', sl: 'm²', en: 'm²' },
  { code: 'm3', sl: 'm³', en: 'm³' },
  { code: 'pack', sl: 'pakiranje', en: 'pack' },
  { code: 'box', sl: 'škatla', en: 'box' },
  { code: 'set', sl: 'komplet', en: 'set' },
  { code: 'hour', sl: 'ura', en: 'hour' },
]

/** The code of a stored or typed unit: matches a code or the Slovenian / English name (so items saved as plain "kos" still resolve). */
export function unitCode(raw?: string | null): string | null {
  const v = raw?.trim().toLowerCase()
  if (!v) return null
  return UNITS.find(u => u.code === v || u.sl.toLowerCase() === v || u.en.toLowerCase() === v)?.code ?? null
}

/** A unit as shown to the user: translated when it is a known unit, otherwise the text as it was typed. */
export function unitLabel(raw: string | null | undefined, lang: Lang): string {
  const code = unitCode(raw)
  return code ? UNITS.find(u => u.code === code)![lang] : (raw ?? '')
}

/** What gets saved: the code for a known unit, free text for anything else (e.g. from an import). */
export const unitToStore = (raw?: string | null): string | null => unitCode(raw) ?? (raw?.trim() || null)

/** Dropdown options in the user's language; a stored value that isn't a known unit stays selectable. */
export function unitOptions(current: string | null | undefined, lang: Lang): SelectOption[] {
  const opts: SelectOption[] = [{ value: '', label: '-' }, ...UNITS.map(u => ({ value: u.code, label: u[lang] }))]
  if (current && !unitCode(current)) opts.push({ value: current, label: current })
  return opts
}
