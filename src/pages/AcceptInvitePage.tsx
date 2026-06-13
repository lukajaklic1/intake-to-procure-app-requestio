import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import AppLogo from '../components/ui/AppLogo'

export default function AcceptInvitePage() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const { t, lang, setLang } = useLanguage()
  const a = t.acceptInvite
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError(lang === 'sl' ? 'Geslo mora imeti vsaj 8 znakov' : 'Password must be at least 8 characters'); return }
    if (password !== confirm) { setError(a.passwordMismatch); return }
    setError(''); setSubmitting(true)

    const { error: pwErr } = await supabase.auth.updateUser({ password })
    if (pwErr) { setError(pwErr.message); setSubmitting(false); return }

    const { error: rpcErr } = await (supabase as any).rpc('accept_invitation')
    if (rpcErr) { setError(rpcErr.message); setSubmitting(false); return }

    navigate('/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <AppLogo size="lg" showName={false} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {!session ? (
            <div className="text-center">
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-3">{a.invalidLink}</p>
              <button onClick={() => navigate('/login')} className="mt-4 text-sm text-blue-600 hover:underline font-medium">
                {t.auth.signIn}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-blue-100 p-2 rounded-lg"><UserPlus className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">{a.title}</h1>
                  <p className="text-sm text-gray-500">{a.subtitle}</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">{a.password}</label>
                  <input type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={a.passwordHint} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">{a.confirmPassword}</label>
                  <input type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••" />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

                <button type="submit" disabled={submitting}
                  className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-1">
                  {submitting ? a.joining : a.join}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="flex justify-end mt-4 px-1">
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
