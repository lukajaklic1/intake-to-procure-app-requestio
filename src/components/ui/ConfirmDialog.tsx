import { TriangleAlert, CircleHelp } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import { useLanguage } from '../../hooks/useLanguage'
import ModalActions from './ModalActions'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  /** May contain {name}, which is replaced by `name` (same text colour as the rest). */
  message: string
  name?: string
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
}

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message, name,
  confirmLabel = 'Confirm', danger = false, loading = false,
}: ConfirmDialogProps) {
  const { t } = useLanguage()
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" icon={danger ? TriangleAlert : CircleHelp} iconTone={danger ? 'danger' : 'primary'}>
      <p className="text-sm leading-6 text-ink2">
        {name !== undefined ? message.replaceAll('{name}', name) : message}
      </p>
      <ModalActions className="justify-end mt-6">
        <Button variant="secondary" onClick={onClose} disabled={loading}>{t.common.cancel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </ModalActions>
    </Modal>
  )
}
