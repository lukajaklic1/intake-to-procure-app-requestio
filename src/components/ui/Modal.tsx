import { useEffect, useRef, type ReactNode } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Icon in a small coloured tile in front of the title. */
  icon?: LucideIcon
  iconTone?: 'primary' | 'danger'
}

/** Popup: header with icon tile, title and close button above a hairline, scrolling body, sticky footer.
 *  Below `sm` it is a bottom sheet (full width, rounded top), from `sm` up a centred dialog.
 *  (put <ModalActions> / <ModalFooter> last in the children). Field styling for everything inside
 *  comes from `.modal-body` in index.css. */
export default function Modal({ open, onClose, title, children, size = 'md', icon: Icon, iconTone = 'primary' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Put the cursor in the first field (not on touch screens, where it would pop up the keyboard).
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || window.matchMedia('(pointer: coarse)').matches) return
    const id = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(
        '.modal-body :is(input, select, textarea):not([disabled], [readonly], [type="hidden"], [type="checkbox"], [type="radio"], [type="file"])',
      )?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  // Enter in a single-line field presses the popup's main button (the last one in the footer bar).
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement
    if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing || el.tagName !== 'INPUT') return
    if (['checkbox', 'radio', 'file', 'button'].includes((el as HTMLInputElement).type)) return
    const main = panelRef.current?.querySelector<HTMLButtonElement>('[data-modal-actions] button:last-child')
    if (main && !main.disabled) { e.preventDefault(); main.click() }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade" onClick={onClose} />
      <div ref={panelRef} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label={title} className={cn(
        'relative flex flex-col w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden bg-white rounded-t-2xl sm:rounded-2xl border border-line shadow-[0_24px_64px_rgba(16,17,18,0.18)] animate-modal',
        size === 'sm' && 'max-w-sm',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-2xl',
      )}>
        <div className="flex items-center gap-2.5 px-5 h-14 shrink-0 border-b border-line">
          {Icon && (
            <span className={cn('w-6 h-6 rounded-md text-white flex items-center justify-center shrink-0', iconTone === 'danger' ? 'bg-destructive' : 'bg-primary')}>
              <Icon className="w-3.5 h-3.5" strokeWidth={2} />
            </span>
          )}
          <h2 className="relative top-px flex-1 min-w-0 truncate text-[15px] font-medium text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 -mr-1.5 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-body px-5 pt-5 pb-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
