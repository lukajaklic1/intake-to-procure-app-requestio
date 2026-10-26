import { useMemo } from 'react'
import SearchSelect from './SearchSelect'
import { countryList } from '../../lib/countries'
import { useLanguage } from '../../hooks/useLanguage'

interface CountrySelectProps {
  id?: string
  label: string
  required?: boolean
  value: string
  onChange: (value: string) => void
}

/** Searchable country dropdown; names follow the app language. */
export default function CountrySelect({ id, label, required, value, onChange }: CountrySelectProps) {
  const { lang } = useLanguage()
  const list = useMemo(() => countryList(lang), [lang])
  return <SearchSelect id={id} label={label} required={required} value={value} onChange={onChange} options={list.all} popular={list.popular} />
}
