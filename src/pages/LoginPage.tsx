import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../hooks/useLanguage'
import AppLogo from '../components/ui/AppLogo'

export default function LoginPage() {
  const navigate = useNavigate()
  const { t, lang, setLang } = useLanguage()
  const a = t.auth
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <AppLogo size="lg" showName={false} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">{a.welcomeBack}</h1>
            <p className="text-sm text-gray-500">{a.signInTo}</p>
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
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">{a.password}</label>
                <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">{a.forgotPassword}</Link>
              </div>
              <input type="password" required autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••" />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-1">
              {loading ? a.signingIn : a.signIn}
            </button>
          </form>
        </div>

        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-sm text-gray-500">
            {a.noAccount}{' '}
            <Link to="/register" className="text-blue-600 hover:underline font-medium">{a.createOne}</Link>
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
