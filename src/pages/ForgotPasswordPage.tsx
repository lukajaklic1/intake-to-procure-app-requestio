import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../hooks/useLanguage'
import AppLogo from '../components/ui/AppLogo'
import { ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const { t, lang, setLang } = useLanguage()
  const a = t.auth
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <AppLogo size="lg" showName={false} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">{a.resetEmailSent}</h1>
              <p className="text-sm text-gray-500 mb-6">{a.resetEmailSentDesc}</p>
              <Link to="/login" className="text-sm text-blue-600 hover:underline font-medium">
                {a.backToLogin}
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900 mb-1">{a.forgotPassword}</h1>
                <p className="text-sm text-gray-500">{a.forgotPasswordDesc}</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">{a.email}</label>
                  <input type="email" required autoComplete="email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="you@company.com" />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

                <button type="submit" disabled={loading}
                  className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-1">
                  {loading ? a.sendingReset : a.sendResetLink}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 px-1">
          <Link to="/login" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-3.5 h-3.5" />
            {a.backToLogin}
          </Link>
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
