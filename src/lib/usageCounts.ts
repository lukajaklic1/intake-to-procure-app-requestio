// Builds an id -> reference-count map from a list of rows holding a foreign
// key column, so a table can proactively disable "delete" for any row that's
// still referenced elsewhere, instead of only finding out after a click.
export function countByKey(rows: Record<string, unknown>[] | null | undefined, key: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows ?? []) {
    const id = r[key] as string | null
    if (!id) continue
    m.set(id, (m.get(id) ?? 0) + 1)
  }
  return m
}

export function mergeUsage(...maps: Map<string, number>[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of maps) for (const [k, v] of m) out.set(k, (out.get(k) ?? 0) + v)
  return out
}
