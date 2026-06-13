interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
  dark?: boolean
}

export default function AppLogo({ size = 'md', showName = true, dark = false }: AppLogoProps) {
  const dim = size === 'sm' ? 30 : size === 'md' ? 38 : 52
  const fontSize = size === 'sm' ? 'text-base' : size === 'md' ? 'text-xl' : 'text-2xl'
  const textColor = dark ? 'text-white' : 'text-gray-900'

  return (
    <div className="flex items-center gap-2.5">
      <svg width={dim} height={dim} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="10" fill="#2563eb" />

        {/*
          Abstract isometric box — 3 faces, Airtable style.
          Top face brightest, left darker, right mid.
        */}

        {/* Top face */}
        <path
          d="M 20 7 L 33 14 L 20 21 L 7 14 Z"
          fill="white"
          fillOpacity="1"
        />

        {/* Left face */}
        <path
          d="M 7 14 L 20 21 L 20 33 L 7 26 Z"
          fill="white"
          fillOpacity="0.45"
        />

        {/* Right face */}
        <path
          d="M 20 21 L 33 14 L 33 26 L 20 33 Z"
          fill="white"
          fillOpacity="0.7"
        />
      </svg>

      {showName && (
        <span className={`font-semibold tracking-tight ${fontSize} ${textColor}`}>
          Requestio
        </span>
      )}
    </div>
  )
}
