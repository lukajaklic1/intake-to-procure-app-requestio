import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Footer bar of a popup: hairline above, stays visible while the body scrolls. Must be the last child of <Modal>. */
export default function ModalActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-modal-actions className={cn('sticky -bottom-5 z-10 -mx-5 -mb-5 mt-10 px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] bg-white border-t border-line flex items-center gap-3', className)}>
      {children}
    </div>
  )
}
