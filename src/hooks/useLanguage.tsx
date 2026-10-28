import { createContext, useContext, useState, type ReactNode } from 'react'
import { translations, type Language } from '../i18n/translations'

interface LanguageContextType {
  lang: Language
  setLang: (l: Language) => void
  t: typeof translations.en
}

const LanguageContext = createContext<LanguageContextType | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const stored = localStorage.getItem('lang')
    return (stored === 'en' || stored === 'sl') ? stored : 'en'
  })

  function setLang(l: Language) {
    setLangState(l)
    localStorage.setItem('lang', l)
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] as typeof translations.en }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}

// A hot-swapped copy of this module gets its own context object, which no longer matches the
// provider mounted at the root. In dev, reload the page instead of patching it in place.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())
