const TONES = ['avatar-yellow', 'avatar-orange', 'avatar-purple', 'avatar-pink', 'avatar-blue', 'avatar-cyan']

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')

/** The colour class of a person's circle: derived from the name, so the same name looks the same everywhere. */
export const avatarTone = (name: string) => TONES[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % TONES.length]

/** Table cell for a person: coloured initials circle (same colour for the same name) followed by the name. */
export default function PersonCell({ name }: { name: string | null | undefined }) {
  if (!name?.trim() || name === '—') return <span className="text-ink2">—</span>
  const tone = avatarTone(name)
  return (
    <span className="inline-flex items-center gap-2 text-ink2">
      <span className={`badge ${tone} !p-0 !rounded-full w-[22px] h-[22px] justify-center !text-[9px] !font-semibold !leading-none shrink-0`}>{initials(name)}</span>
      {name}
    </span>
  )
}
