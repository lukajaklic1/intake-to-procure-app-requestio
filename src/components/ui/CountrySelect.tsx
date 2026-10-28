import { useMemo } from 'react'
import SearchSelect from './SearchSelect'
import { countryList, localizeCountry } from '../../lib/countries'
import { useLanguage } from '../../hooks/useLanguage'

interface CountrySelectProps {
  id?: string
  label: string
  required?: boolean
  error?: string
  value: string
  onChange: (value: string) => void
}

/** Searchable country dropdown; names follow the app language. */
export default function CountrySelect({ id, label, required, error, value, onChange }: CountrySelectProps) {
  const { lang } = useLanguage()
  const list = useMemo(() => countryList(lang), [lang])
  return <SearchSelect id={id} label={label} required={required} error={error} value={localizeCountry(value, lang)} onChange={onChange} options={list.all} popular={list.popular} />
}
