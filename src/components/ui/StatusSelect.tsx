import Select from './Select'
import { useLanguage } from '../../hooks/useLanguage'

interface StatusSelectProps {
  active: boolean
  onChange: (active: boolean) => void
  /** Wording of the two states for this entity (e.g. "Aktiven" / "Aktivna"); a leading ✓ / ✗ is dropped. */
  activeLabel: string
  inactiveLabel: string
}

const clean = (s: string) => s.replace(/^[✓✗]\s*/, '')

/** Active / inactive field of an edit popup, shown as the same badges the tables use. */
export default function StatusSelect({ active, onChange, activeLabel, inactiveLabel }: StatusSelectProps) {
  const { t } = useLanguage()
  return (
    <Select className="sm:col-span-2" label={t.common.status} value={active ? 'active' : 'inactive'} onChange={v => onChange(v === 'active')}
      options={[
        { value: 'active', label: clean(activeLabel), badge: 'badge-success' },
        { value: 'inactive', label: clean(inactiveLabel), badge: 'badge-neutral' },
      ]} />
  )
}
