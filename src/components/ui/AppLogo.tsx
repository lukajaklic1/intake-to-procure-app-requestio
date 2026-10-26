interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
  dark?: boolean
}

export default function AppLogo({ size = 'md', showName = true, dark = false }: AppLogoProps) {
  const dim = size === 'sm' ? 30 : size === 'md' ? 38 : 52
  const fontSize = size === 'sm' ? 'text-base' : size === 'md' ? 'text-xl' : 'text-2xl'
  const textColor = dark ? 'text-white' : 'text-ink'

  return (
    <div className="flex items-center gap-2.5">
      <svg width={dim} height={dim} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="9" fill="var(--color-primary)" />

        {/*
          Abstract "forward" double-chevron mark — flat, geometric,
          thick rounded strokes (Plane/Pivot-style monochrome icon).
        */}
        <path d="M14 11 L23 20 L14 29" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 11 L29 20 L20 29" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      </svg>

      {showName && (
        <span className={`font-semibold tracking-tight ${fontSize} ${textColor}`}>
          Requestio
        </span>
      )}
    </div>
  )
}
