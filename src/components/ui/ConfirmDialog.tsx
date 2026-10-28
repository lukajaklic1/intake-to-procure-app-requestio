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
  /** May contain {name}, which is replaced by `name` in the darker text colour. */
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
        {name !== undefined && message.includes('{name}')
          ? message.split('{name}').flatMap((part, i, all) => (i < all.length - 1 ? [part, <span key={i} className="text-ink">{name}</span>] : [part]))
          : message}
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
