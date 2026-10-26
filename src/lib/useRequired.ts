import { useState } from 'react'

/** Inline "required field" validation: mark the empty fields, focus the first one,
 *  clear a field's error as soon as the user edits it. */
export function useRequired(message: string) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  /** @param ids map of field key -> DOM id, used to focus the first invalid field */
  function check(values: Record<string, unknown>, required: string[], ids: Record<string, string> = {}): boolean {
    const next: Record<string, string> = {}
    for (const key of required) {
      const v = values[key]
      if (v == null || String(v).trim() === '') next[key] = message
    }
    setErrors(next)
    const first = required.find(k => next[k])
    if (first) setTimeout(() => document.getElementById(ids[first] ?? first)?.focus(), 0)
    return !first
  }

  function clear(key: string) {
    setErrors(e => {
      if (!e[key]) return e
      const rest = { ...e }
      delete rest[key]
      return rest
    })
  }

  function reset() { setErrors({}) }

  return { errors, check, clear, reset }
}
