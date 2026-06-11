import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../hooks/useLanguage'
import AppLogo from '../components/ui/AppLogo'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { t, lang, setLang } = useLanguage()
  const a = t.auth
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Listen specifically for PASSWORD_RECOVERY event
    // This fires when user arrives via the reset email link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // Also check if we already have a recovery session (page reload case)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Safety: if no recovery token after 3s, show error
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready) setError(a.resetLinkInvalid)
    }, 3000)
    return () => clearTimeout(timer)
  }, [ready, a.resetLinkInvalid])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError(a.passwordMismatch); return }
    if (password.length < 8) { setError(a.passwordTooShort); return }
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    // Sign out so user must log in fresh with new password
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <AppLogo size="lg" showName={false} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">{a.setNewPassword}</h1>
            <p className="text-sm text-gray-500">{a.setNewPasswordDesc}</p>
          </div>

          {!ready && error ? (
            <div className="text-center">
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
              <button onClick={() => navigate('/forgot-password')}
                className="text-sm text-blue-600 hover:underline font-medium">
                {a.sendResetLink}
              </button>
            </div>
          ) : !ready ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{a.newPassword}</label>
                <input type="password" required autoComplete="new-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{a.confirmPassword}</label>
                <input type="password" required autoComplete="new-password"
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••" />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-1">
                {loading ? a.savingPassword : a.saveNewPassword}
              </button>
            </form>
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
