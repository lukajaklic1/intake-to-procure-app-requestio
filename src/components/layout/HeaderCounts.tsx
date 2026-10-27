import { createContext, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'

export interface HeaderCount { label?: string; value: number }
export interface HeaderTab { id: string; label: string; count?: number; active: boolean; icon?: React.ElementType }

interface Ctx {
  counts: HeaderCount[]; setCounts: (c: HeaderCount[]) => void
  tabs: HeaderTab[]; setTabs: (t: HeaderTab[]) => void
  selectRef: MutableRefObject<((id: string) => void) | null>
}
const HeaderCountsContext = createContext<Ctx>({ counts: [], setCounts: () => {}, tabs: [], setTabs: () => {}, selectRef: { current: null } })

export function HeaderCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<HeaderCount[]>([])
  const [tabs, setTabs] = useState<HeaderTab[]>([])
  const selectRef = useRef<((id: string) => void) | null>(null)
  return <HeaderCountsContext.Provider value={{ counts, setCounts, tabs, setTabs, selectRef }}>{children}</HeaderCountsContext.Provider>
}

export function useHeaderCountsValue() { return useContext(HeaderCountsContext).counts }
export function useHeaderTabsValue() { const { tabs, selectRef } = useContext(HeaderCountsContext); return { tabs, select: (id: string) => selectRef.current?.(id) } }

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

/** A page puts its view switch (tabs with an optional count) into the top header, replacing the title. */
export function useHeaderTabs(tabs: HeaderTab[], onSelect: (id: string) => void) {
  const { setTabs, selectRef } = useContext(HeaderCountsContext)
  selectRef.current = onSelect
  const key = JSON.stringify(tabs.map(({ icon: _icon, ...rest }) => rest))
  useEffect(() => {
    setTabs(tabs)
    return () => setTabs([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setTabs])
}
