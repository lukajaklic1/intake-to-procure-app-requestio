// Lightweight signal so the sidebar's nav badge counters (pending approvals,
// approved-without-PO) refetch immediately after an action changes them,
// instead of waiting for the next route change.
const EVENT = 'sidebar-counts-refresh'

export function refreshCounts() {
  window.dispatchEvent(new Event(EVENT))
}

export function onRefreshCounts(handler: () => void) {
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
