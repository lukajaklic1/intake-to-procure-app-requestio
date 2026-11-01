import { createContext, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'

export interface HeaderCount { label?: string; value: number }
/** A figure shown at the right end of the top bar, e.g. "Value of the stock: 312 €". */
export interface HeaderInfo { label: string; value: string }
export interface HeaderTab { id: string; label: string; count?: number; active: boolean; icon?: React.ElementType }

interface Ctx {
  counts: HeaderCount[]; setCounts: (c: HeaderCount[]) => void
  tabs: HeaderTab[]; setTabs: (t: HeaderTab[]) => void
  info: HeaderInfo[]; setInfo: (i: HeaderInfo[]) => void
  selectRef: MutableRefObject<((id: string) => void) | null>
}
const HeaderCountsContext = createContext<Ctx>({ counts: [], setCounts: () => {}, tabs: [], setTabs: () => {}, info: [], setInfo: () => {}, selectRef: { current: null } })

export function HeaderCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<HeaderCount[]>([])
  const [tabs, setTabs] = useState<HeaderTab[]>([])
  const [info, setInfo] = useState<HeaderInfo[]>([])
  const selectRef = useRef<((id: string) => void) | null>(null)
  return <HeaderCountsContext.Provider value={{ counts, setCounts, tabs, setTabs, info, setInfo, selectRef }}>{children}</HeaderCountsContext.Provider>
}

export function useHeaderInfoValue() { return useContext(HeaderCountsContext).info }

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

/** A page puts figures into the right end of the top bar. */
export function useHeaderInfo(info: HeaderInfo[]) {
  const { setInfo } = useContext(HeaderCountsContext)
  const key = JSON.stringify(info)
  useEffect(() => {
    setInfo(JSON.parse(key))
    return () => setInfo([])
  }, [key, setInfo])
}
