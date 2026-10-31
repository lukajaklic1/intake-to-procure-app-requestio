import Select from './Select'
import { buildCategoryTree, mainCategoryId, type CatLike } from '../../lib/categories'
import { useLanguage } from '../../hooks/useLanguage'

interface Props {
  categories: CatLike[]
  /** Main category chosen on the line (it can be set before a subcategory is). */
  mainId?: string
  /** The line's category: a subcategory, or a main category that has none. */
  categoryId: string
  onChange: (patch: { main_id: string; category_id: string }) => void
  disabled?: boolean
}

/** The two table cells of a document line that choose its category: a main category and, depending on it, a subcategory.
 *  Items live in subcategories, so the line's category_id is the subcategory (or the main category when it has no subcategories). */
export default function LineCategoryCells({ categories, mainId, categoryId, onChange, disabled }: Props) {
  const { t } = useLanguage()
  const tree = buildCategoryTree(categories)
  const main = mainId ?? mainCategoryId(categoryId, categories)
  const node = tree.find(n => n.category.id === main)
  const subs = (node?.children ?? []).filter(c => c.status !== 'inactive' || c.id === categoryId)
  const mains = tree.filter(n => n.category.status !== 'inactive' || n.category.id === main)

  return (
    <>
      <td className="px-3 py-2.5 min-w-[170px]">
        <Select value={main} disabled={disabled} placeholder={t.common.select} options={mains.map(n => ({ value: n.category.id, label: n.category.name }))}
          onChange={m => {
            const n = tree.find(x => x.category.id === m)
            // a main category without subcategories is the line's category itself
            onChange({ main_id: m, category_id: n && n.children.length === 0 ? m : '' })
          }} />
      </td>
      <td className="px-3 py-2.5 min-w-[190px]">
        <Select value={node && categoryId !== node.category.id ? categoryId : ''} disabled={disabled || !main || subs.length === 0}
          placeholder={main && subs.length === 0 ? '-' : t.common.select}
          options={subs.map(c => ({ value: c.id, label: c.name }))}
          onChange={v => onChange({ main_id: main, category_id: v })} />
      </td>
    </>
  )
}
