import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../hooks/useLanguage'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const o = t.onboarding
  const [step, setStep] = useState<'company' | 'profile'>('company')
  const [companyName, setCompanyName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleFinish(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) { setError(t.common.save); return }
    setError('')
    setLoading(true)

    const { error: rpcErr } = await (supabase as any).rpc('handle_onboarding', {
      p_company_name: companyName,
      p_first_name: firstName,
      p_last_name: lastName,
    })

    if (rpcErr) { setError(rpcErr.message); setLoading(false); return }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="flex items-center gap-3 mb-8">
          <div className={`flex items-center gap-2 text-sm font-medium ${step === 'company' ? 'text-accent' : 'text-green-600'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === 'company' ? 'bg-accent text-white' : 'bg-success-light text-success'}`}>
              {step === 'company' ? '1' : '✓'}
            </div>
            Podjetje
          </div>
          <div className="flex-1 h-px bg-gray-200" />
          <div className={`flex items-center gap-2 text-sm font-medium ${step === 'profile' ? 'text-accent' : 'text-gray-400'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === 'profile' ? 'bg-accent text-white' : 'bg-gray-200 text-gray-500'}`}>
              2
            </div>
            {o.yourProfile}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-field p-8">
          <form onSubmit={handleFinish}>
            {step === 'company' && (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-accent-light p-2 rounded-lg"><Building2 className="w-5 h-5 text-accent" /></div>
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">{o.setupCompany}</h1>
                    <p className="text-sm text-gray-500">{o.setupSubtitle}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 mb-6">
                  <label className="text-sm font-medium text-gray-700">{o.companyName}</label>
                  <input type="text" required value={companyName} onChange={e => setCompanyName(e.target.value)}
                    className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="Acme d.o.o." />
                </div>
                <button type="button" disabled={!companyName.trim()} onClick={() => setStep('profile')}
                  className="w-full bg-accent text-white rounded-lg py-2.5 text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {o.continue}
                </button>
              </>
            )}

            {step === 'profile' && (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-accent-light p-2 rounded-lg"><User className="w-5 h-5 text-accent" /></div>
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">{o.yourProfile}</h1>
                    <p className="text-sm text-gray-500">{o.profileSubtitle}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">{o.firstName}</label>
                    <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)}
                      className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Janez" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">{o.lastName}</label>
                    <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)}
                      className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Novak" />
                  </div>
                </div>
                {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 ">{error}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep('company')}
                    className="flex-1 bg-white text-gray-700 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                    {o.back}
                  </button>
                  <button type="submit" disabled={loading}
                    className="flex-1 bg-accent text-white rounded-lg py-2.5 text-sm font-medium hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                    {loading ? o.saving : o.finishSetup}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
