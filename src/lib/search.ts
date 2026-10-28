/** Lower-case and drop diacritics, so "kovac" finds "Kovač". */
export const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Table search: every word typed must appear somewhere in the row's fields, in any order.
 *  "matej roz" finds "Matej Rozman"; "matej " (trailing space) behaves like "matej". */
export function matchesSearch(query: string, fields: (string | null | undefined)[]) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fold(fields.filter(Boolean).join(' '))
  return words.every(w => haystack.includes(w))
}
