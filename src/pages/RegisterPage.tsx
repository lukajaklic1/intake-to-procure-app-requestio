import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../hooks/useLanguage'
import AppLogo from '../components/ui/AppLogo'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { t, lang, setLang } = useLanguage()
  const a = t.auth
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError(lang === 'sl' ? 'Gesli se ne ujemata' : 'Passwords do not match'); return }
    if (password.length < 8) { setError(lang === 'sl' ? 'Geslo mora imeti vsaj 8 znakov' : 'Password must be at least 8 characters'); return }
    if (!agreedToTerms) { setError(lang === 'sl' ? 'Strinjati se morate s pogoji uporabe' : 'You must agree to the terms of service'); return }
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    navigate('/onboarding')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <AppLogo size="lg" showName={false} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">{a.createAccount}</h1>
            <p className="text-sm text-gray-500">{a.getStarted}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{a.email}</label>
              <input type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@company.com" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{a.password}</label>
              <input type="password" required autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={lang === 'sl' ? 'Vsaj 8 znakov' : 'Min. 8 characters'} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{a.confirmPassword}</label>
              <input type="password" required autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••" />
            </div>

            {/* Terms agreement */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0" />
              <span className="text-sm text-gray-600">
                {lang === 'sl' ? 'Strinjam se s ' : 'I agree to the '}
                <Link to="/terms" target="_blank" className="text-blue-600 hover:underline font-medium">
                  {lang === 'sl' ? 'pogoji uporabe' : 'terms of service'}
                </Link>
                {lang === 'sl' ? ' in ' : ' and '}
                <Link to="/privacy" target="_blank" className="text-blue-600 hover:underline font-medium">
                  {lang === 'sl' ? 'politiko zasebnosti' : 'privacy policy'}
                </Link>
              </span>
            </label>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <button type="submit" disabled={loading || !agreedToTerms}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-1">
              {loading ? a.creatingAccount : a.createAccount}
            </button>
          </form>
        </div>

        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-sm text-gray-500">
            {a.alreadyHaveAccount}{' '}
            <Link to="/login" className="text-blue-600 hover:underline font-medium">{a.signIn}</Link>
          </p>
          <div className="flex gap-1">
            {(['en', 'sl'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${lang === l ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
