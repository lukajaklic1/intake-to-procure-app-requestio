import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface HeaderCount { label?: string; value: number }

interface Ctx { counts: HeaderCount[]; setCounts: (c: HeaderCount[]) => void }
const HeaderCountsContext = createContext<Ctx>({ counts: [], setCounts: () => {} })

export function HeaderCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<HeaderCount[]>([])
  return <HeaderCountsContext.Provider value={{ counts, setCounts }}>{children}</HeaderCountsContext.Provider>
}

export function useHeaderCountsValue() { return useContext(HeaderCountsContext).counts }

/** A page reports how many rows it shows; the top header displays it next to the title
 *  (one unlabeled number, or several labeled ones such as "Categories 22 · Items 221"). */
export function useHeaderCounts(counts: HeaderCount[]) {
  const { setCounts } = useContext(HeaderCountsContext)
  const key = JSON.stringify(counts)
  useEffect(() => {
    setCounts(JSON.parse(key))
    return () => setCounts([])
  }, [key, setCounts])
}
