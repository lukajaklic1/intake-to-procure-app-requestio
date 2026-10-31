import { useState } from 'react'

export const parseAmount = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'))
const toText = (n: number | null | undefined) => (n ? String(n).replace('.', ',') : '')

/** A money cell you type into like in a spreadsheet: shown formatted ("12.000 €") and as a plain number while you edit; saved when you leave it. */
export default function AmountInput({ value, format, disabled, placeholder, onSave }: {
  value: number | null; format: (n: number) => string; disabled?: boolean; placeholder?: string; onSave: (n: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      value={draft ?? (value ? format(value) : '')}
      placeholder={placeholder}
      disabled={disabled}
      inputMode="decimal"
      onFocus={e => { setDraft(toText(value)); e.target.select() }}
      onChange={e => { if (/^[0-9\s]*[,.]?[0-9]*$/.test(e.target.value)) setDraft(e.target.value) }}
      onBlur={() => {
        if (draft != null) { const n = draft.trim() === '' ? 0 : parseAmount(draft); if (!Number.isNaN(n) && n >= 0 && n !== (value ?? 0)) onSave(n) }
        setDraft(null)
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="w-full text-right tabular-nums rounded-lg border border-transparent hover:border-field focus:border-field-focus px-2 py-1.5 placeholder:text-placeholder focus:outline-none disabled:bg-transparent"
    />
  )
}
