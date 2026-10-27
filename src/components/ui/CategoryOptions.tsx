import { buildCategoryTree, type CatLike } from '../../lib/categories'

/** <option>/<optgroup> list for a native <select>: a category without subcategories is an
 *  option, one with subcategories becomes a group of its subcategories. */
export default function CategoryOptions({ categories, selectedId }: { categories: CatLike[]; selectedId?: string }) {
  return (
    <>
      {buildCategoryTree(categories).map(({ category, children }) => {
        const subs = children.filter(c => c.status !== 'inactive' || c.id === selectedId)
        if (children.length === 0) return category.status !== 'inactive' || category.id === selectedId ? <option key={category.id} value={category.id}>{category.name}</option> : null
        return (
          <optgroup key={category.id} label={category.name}>
            {category.id === selectedId && <option value={category.id}>{category.name}</option>}
            {subs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        )
      })}
    </>
  )
}
