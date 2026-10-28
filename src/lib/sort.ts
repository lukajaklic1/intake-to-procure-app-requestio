/** One way to order a list: shown in the "Razvrsti" filter and applied with applySort. */
export interface SortDef<T> { value: string; label: string; cmp: (a: T, b: T) => number }

type Get<T, V> = (x: T) => V | null | undefined

/** Text, in Slovenian alphabetical order (č, š, ž in the right place), ignoring case. */
export const text = <T,>(get: Get<T, string>) => (a: T, b: T) => (get(a) ?? '').localeCompare(get(b) ?? '', 'sl', { sensitivity: 'base' })
export const num = <T,>(get: Get<T, number | string>) => (a: T, b: T) => Number(get(a) ?? 0) - Number(get(b) ?? 0)
/** ISO dates / timestamps; an empty date sorts first. */
export const date = <T,>(get: Get<T, string>) => (a: T, b: T) => (get(a) ?? '').localeCompare(get(b) ?? '')
/** Like `date`, but an empty date goes to the end (e.g. "needed by" earliest first). */
export const dateLast = <T,>(get: Get<T, string>) => (a: T, b: T) => (get(a) ?? '9999').localeCompare(get(b) ?? '9999')
export const rev = <T,>(cmp: (a: T, b: T) => number) => (a: T, b: T) => cmp(b, a)

/** A sorted copy of the list; an unknown value falls back to the first definition. */
export function applySort<T>(list: T[], defs: SortDef<T>[], value: string): T[] {
  const def = defs.find(d => d.value === value) ?? defs[0]
  return [...list].sort(def.cmp)
}
