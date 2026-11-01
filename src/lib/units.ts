import type { SelectOption } from '../components/ui/Select'

type Lang = 'sl' | 'en'

/** A unit with its name in both languages. `slForms` are the Slovenian forms after a number: 1 paket, 2 paketa, 3 paketi,
 *  5 paketov, and after a decimal number (1,5 paketa). `enForms` are singular and plural. A unit without forms is a symbol (kg, l, m). */
interface Unit { code: string; sl: string; en: string; slForms?: [string, string, string, string, string]; enForms?: [string, string] }

/** Units of measure of catalog items. An item stores the language-neutral `code`; each user sees it in their own language. */
export const UNITS: Unit[] = [
  { code: 'pcs', sl: 'kos', en: 'pcs', slForms: ['kos', 'kosa', 'kosi', 'kosov', 'kosa'] },
  { code: 'kg', sl: 'kg', en: 'kg' },
  { code: 'g', sl: 'g', en: 'g' },
  { code: 'l', sl: 'l', en: 'l' },
  { code: 'ml', sl: 'ml', en: 'ml' },
  { code: 'm', sl: 'm', en: 'm' },
  { code: 'm2', sl: 'm²', en: 'm²' },
  { code: 'm3', sl: 'm³', en: 'm³' },
  { code: 'package', sl: 'paket', en: 'package', slForms: ['paket', 'paketa', 'paketi', 'paketov', 'paketa'], enForms: ['package', 'packages'] },
  { code: 'pack', sl: 'pakiranje', en: 'pack', slForms: ['pakiranje', 'pakiranji', 'pakiranja', 'pakiranj', 'pakiranja'], enForms: ['pack', 'packs'] },
  { code: 'box', sl: 'škatla', en: 'box', slForms: ['škatla', 'škatli', 'škatle', 'škatel', 'škatle'], enForms: ['box', 'boxes'] },
  { code: 'carton', sl: 'karton', en: 'carton', slForms: ['karton', 'kartona', 'kartoni', 'kartonov', 'kartona'], enForms: ['carton', 'cartons'] },
  { code: 'set', sl: 'komplet', en: 'set', slForms: ['komplet', 'kompleta', 'kompleti', 'kompletov', 'kompleta'], enForms: ['set', 'sets'] },
  { code: 'bottle', sl: 'steklenica', en: 'bottle', slForms: ['steklenica', 'steklenici', 'steklenice', 'steklenic', 'steklenice'], enForms: ['bottle', 'bottles'] },
  { code: 'roll', sl: 'rola', en: 'roll', slForms: ['rola', 'roli', 'role', 'rol', 'role'], enForms: ['roll', 'rolls'] },
  { code: 'bag', sl: 'vrečka', en: 'bag', slForms: ['vrečka', 'vrečki', 'vrečke', 'vrečk', 'vrečke'], enForms: ['bag', 'bags'] },
  { code: 'pair', sl: 'par', en: 'pair', slForms: ['par', 'para', 'pari', 'parov', 'para'], enForms: ['pair', 'pairs'] },
  { code: 'hour', sl: 'ura', en: 'hour', slForms: ['ura', 'uri', 'ure', 'ur', 'ure'], enForms: ['hour', 'hours'] },
  { code: 'day', sl: 'dan', en: 'day', slForms: ['dan', 'dneva', 'dnevi', 'dni', 'dneva'], enForms: ['day', 'days'] },
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

/** Which Slovenian form follows a number: 0 = 1, 1 = 2 (dual), 2 = 3 and 4, 3 = 5 and more (also 0), 4 = a decimal number. */
const slovenianForm = (n: number) => {
  if (!Number.isInteger(n)) return 4
  const m = Math.abs(n) % 100
  return m === 1 ? 0 : m === 2 ? 1 : m === 3 || m === 4 ? 2 : 3
}

/** The unit as it is written after a quantity: "1 paket", "2 paketa", "3 paketi", "6 paketov"; "1 box", "2 boxes". Symbols and
 *  units that are not in the list stay as they are. */
export function unitFor(raw: string | null | undefined, lang: Lang, qty: number): string {
  const code = unitCode(raw)
  const u = code ? UNITS.find(x => x.code === code) : undefined
  if (!u) return raw ?? ''
  if (lang === 'sl' && u.slForms) return u.slForms[slovenianForm(qty)]
  if (lang === 'en' && u.enForms) return Math.abs(qty) === 1 ? u.enForms[0] : u.enForms[1]
  return u[lang]
}
