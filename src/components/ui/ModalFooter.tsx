import { Trash2 } from 'lucide-react'
import Button from './Button'
import ModalActions from './ModalActions'
import { useLanguage } from '../../hooks/useLanguage'

interface ModalFooterProps {
  onCancel: () => void
  onSave: () => void
  saveLabel: string
  saving?: boolean
  /** Destructive action, only offered when editing an existing record. */
  onDelete?: () => void
  /** Reason the record can't be deleted (in use elsewhere). Disables the button and is shown above the footer. */
  deleteBlocked?: string | null
}

/** Cancel / Save for an edit popup, with the red Delete button bottom left when editing. */
export default function ModalFooter({ onCancel, onSave, saveLabel, saving, onDelete, deleteBlocked }: ModalFooterProps) {
  const { t } = useLanguage()
  return (
    <>
      {/* a tooltip needs hover, which touch screens don't have: show the reason as text there */}
      {onDelete && deleteBlocked && <p className="sm:hidden mt-6 text-[13px] leading-5 text-ink2">{deleteBlocked}</p>}
      <ModalActions className="flex-col-reverse items-stretch sm:flex-row sm:items-center">
        {onDelete && (
          <span className="group relative flex w-full sm:w-auto sm:inline-flex">
            <button type="button" disabled={!!deleteBlocked} onClick={onDelete}
              className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line bg-white text-sm font-medium text-destructive hover:bg-surface transition-colors disabled:opacity-40 disabled:pointer-events-none">
              <Trash2 className="w-4 h-4" />{t.common.deleteEntity}
            </button>
            {deleteBlocked && (
              <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 mb-2 w-72 rounded-xl bg-ink px-3.5 py-2.5 text-[13px] leading-5 font-normal text-white shadow-[0_8px_30px_rgba(16,17,18,0.25)] opacity-0 translate-y-1 transition group-hover:opacity-100 group-hover:translate-y-0">
                {deleteBlocked}
              </span>
            )}
          </span>
        )}
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="secondary" onClick={onCancel} className="flex-1 sm:flex-none">{t.common.cancel}</Button>
          <Button loading={saving} onClick={onSave} className="flex-1 sm:flex-none">{saveLabel}</Button>
        </div>
      </ModalActions>
    </>
  )
}
