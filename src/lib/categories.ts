/** Two-level category tree helpers (category -> subcategory). Works on any object with these fields. */

export interface CatLike { id: string; name: string; parent_id?: string | null; status?: 'active' | 'inactive' | string }

export interface CategoryNode<T extends CatLike = CatLike> { category: T; children: T[] }

const byName = (a: CatLike, b: CatLike) => a.name.localeCompare(b.name)

export function buildCategoryTree<T extends CatLike>(cats: T[]): CategoryNode<T>[] {
  const children = new Map<string, T[]>()
  for (const c of cats) if (c.parent_id) children.set(c.parent_id, [...(children.get(c.parent_id) ?? []), c])
  return cats
    .filter(c => !c.parent_id)
    .sort(byName)
    .map(category => ({ category, children: (children.get(category.id) ?? []).sort(byName) }))
}

/** "Category › Subcategory", or just the name for a top-level category. */
export function categoryLabel(id: string | null | undefined, cats: CatLike[]): string {
  const c = cats.find(x => x.id === id)
  if (!c) return ''
  const parent = c.parent_id ? cats.find(x => x.id === c.parent_id) : undefined
  return parent ? `${parent.name} › ${c.name}` : c.name
}

/** Flat, ordered list for filter dropdowns: each category followed by its subcategories. */
export function categoryOptions(cats: CatLike[], activeOnly = true): { id: string; label: string; depth: 0 | 1 }[] {
  const out: { id: string; label: string; depth: 0 | 1 }[] = []
  for (const { category, children } of buildCategoryTree(cats)) {
    const subs = activeOnly ? children.filter(c => c.status !== 'inactive') : children
    if (!activeOnly || category.status !== 'inactive') out.push({ id: category.id, label: category.name, depth: 0 })
    for (const s of subs) out.push({ id: s.id, label: `${category.name} › ${s.name}`, depth: 1 })
  }
  return out
}

/** Ids matched by a category filter: the category itself plus its subcategories. */
export function categoryAndChildren(id: string, cats: CatLike[]): Set<string> {
  return new Set([id, ...cats.filter(c => c.parent_id === id).map(c => c.id)])
}
