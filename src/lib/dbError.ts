/** Turns a database error into a message for the user (duplicates get a plain explanation). */
export function dbError(e: unknown, t: { common: { alreadyExists: string } }): string {
  const msg = e instanceof Error ? e.message : (e as { message?: string } | null)?.message ?? String(e)
  return /duplicate key|unique constraint/i.test(msg) ? t.common.alreadyExists : msg
}
