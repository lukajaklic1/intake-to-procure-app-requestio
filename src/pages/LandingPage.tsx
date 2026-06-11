import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import {
  FileText, BarChart2, Building2, Package,
  CheckCircle, ArrowRight, Zap,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import AppLogo from '../components/ui/AppLogo'

// ─── Pricing data ─────────────────────────────────────────────────────────────

// Plans are defined per language inside the component — see getPLans() below

const FEATURE_ICONS = [
  { icon: FileText, color: 'bg-blue-50 text-blue-600', k: 'feature1' },
  { icon: BarChart2, color: 'bg-purple-50 text-purple-600', k: 'feature2' },
  { icon: Building2, color: 'bg-green-50 text-green-600', k: 'feature3' },
  { icon: Package, color: 'bg-amber-50 text-amber-600', k: 'feature4' },
]

const STEP_NUMS = ['01', '02', '03']

// ─── Components ───────────────────────────────────────────────────────────────

function Check({ included, soon, isSl }: { included: boolean; soon?: boolean; isSl?: boolean }) {
  if (!included) return <span className="text-gray-300">—</span>
  return (
    <span className="flex items-center gap-1.5 text-gray-700">
      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
      {soon && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-medium">{isSl ? 'kmalu' : 'soon'}</span>}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { session, loading } = useAuth()
  const { lang, setLang, t } = useLanguage()
  const navigate = useNavigate()
  const l = t.landing
  const isSl = lang === 'sl'

  const PLANS = [
    {
      name: isSl ? 'Brezplačni' : 'Free',
      price: 0,
      yearlyPrice: 0,
      desc: isSl ? 'Za manjša podjetja, ki želijo urediti nabavo brez začetnih stroškov.' : 'Perfect for getting started. No credit card required, no time limit.',
      cta: isSl ? 'Začnite brezplačno' : 'Get started free',
      featured: false,
      features: [
        { text: isSl ? 'Do 15 naročil na mesec' : 'Up to 15 POs per month', included: true },
        { text: isSl ? '1 uporabnik' : '1 user', included: true },
        { text: isSl ? 'PDF naročilnice' : 'PDF purchase orders', included: true },
        { text: isSl ? 'Dobavitelji, katalog, kategorije, projekti' : 'Suppliers, catalog, categories, projects', included: true },
        { text: isSl ? 'Osnovna analitika' : 'Basic spend dashboard', included: true },
        { text: isSl ? 'Prilaganje ponudb naročilnicam' : 'Attach quotations to POs', included: false },
        { text: isSl ? 'Polna analitika' : 'Full analytics', included: false },
      ],
    },
    {
      name: isSl ? 'Začetni' : 'Starter',
      price: 19,
      yearlyPrice: 15,
      desc: isSl ? 'Za podjetja z redno nabavo in večjim številom naročil.' : 'For companies with regular procurement and higher order volumes.',
      cta: isSl ? 'Začnite preizkus' : 'Start free trial',
      featured: false,
      features: [
        { text: isSl ? 'Neomejeno naročil' : 'Unlimited POs', included: true },
        { text: isSl ? '1 uporabnik' : '1 user', included: true },
        { text: isSl ? 'PDF naročilnice' : 'PDF purchase orders', included: true },
        { text: isSl ? 'Dobavitelji, katalog, kategorije, projekti' : 'Suppliers, catalog, categories, projects', included: true },
        { text: isSl ? 'Osnovna analitika' : 'Basic spend dashboard', included: true },
        { text: isSl ? 'Podpora po e-pošti' : 'Email support', included: true },
        { text: isSl ? 'Prilaganje ponudb naročilnicam' : 'Attach quotations to POs', included: false },
        { text: isSl ? 'Polna analitika' : 'Full analytics', included: false },
      ],
    },
    {
      name: isSl ? 'Profesionalni' : 'Professional',
      price: 39,
      yearlyPrice: 29,
      desc: isSl ? 'Za podjetja, ki želijo popoln pregled nad nabavo, stroški in projekti.' : 'For companies that want complete visibility over procurement, spending and projects.',
      cta: isSl ? 'Začnite preizkus' : 'Start free trial',
      featured: true,
      features: [
        { text: isSl ? 'Neomejeno naročil' : 'Unlimited POs', included: true },
        { text: isSl ? '1 uporabnik' : '1 user', included: true },
        { text: isSl ? 'PDF naročilnice' : 'PDF purchase orders', included: true },
        { text: isSl ? 'Prilaganje ponudb naročilnicam' : 'Attach quotations to POs', included: true },
        { text: isSl ? 'Napredna analitika stroškov' : 'Advanced spend analytics', included: true },
        { text: isSl ? 'Vsi moduli referenčnih podatkov' : 'All reference data modules', included: true },
        { text: isSl ? 'Podpora po e-pošti' : 'Email support', included: true },
      ],
    },
    {
      name: isSl ? 'Ekipa' : 'Team',
      price: 69,
      yearlyPrice: 55,
      desc: isSl ? 'Za večje ekipe in podjetja z naprednim nabavnim procesom.' : 'For larger teams and companies with an advanced procurement process.',
      cta: isSl ? 'Začnite preizkus' : 'Start free trial',
      featured: false,
      features: [
        { text: isSl ? 'Neomejeno naročil' : 'Unlimited POs', included: true },
        { text: isSl ? 'Do 5 uporabnikov' : 'Up to 5 users', included: true, soon: true },
        { text: isSl ? 'Vse iz Professional plana' : 'Everything in Professional', included: true },
        { text: isSl ? 'Odobritve naročil' : 'Approval workflows', included: true, soon: true },
        { text: isSl ? 'Proračunske omejitve po projektih' : 'Budget limits per project', included: true, soon: true },
        { text: isSl ? 'Izvoz CSV / Excel' : 'CSV / Excel export', included: true, soon: true },
        { text: isSl ? 'Prednostna podpora' : 'Priority support', included: true },
      ],
    },
  ]

  useEffect(() => {
    if (!loading && session) navigate('/dashboard', { replace: true })
  }, [session, loading])

  if (loading) return null

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><AppLogo size="sm" /></a>
          <div className="flex items-center gap-3 lg:gap-6">
            <a href="#features" className="hidden md:block text-sm text-gray-500 hover:text-gray-900 transition-colors">{l.navFeatures}</a>
            <a href="#how-it-works" className="hidden md:block text-sm text-gray-500 hover:text-gray-900 transition-colors">{l.navHowItWorks}</a>
            <a href="#pricing" className="hidden md:block text-sm text-gray-500 hover:text-gray-900 transition-colors">{l.navPricing}</a>
            <Link to="/login" className="hidden sm:block text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">{l.navSignIn}</Link>
            {/* Language switcher */}
            <div className="flex gap-1">
              {(['en', 'sl'] as const).map(lng => (
                <button key={lng} onClick={() => setLang(lng)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${lang === lng ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>
            <Link to="/register" className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              {l.navCta}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <Zap className="w-3.5 h-3.5" />
          {l.heroBadge}
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 mb-6 leading-tight">
          {l.heroTitle1}<br />
          <span className="text-blue-600">{l.heroTitle2}</span>
        </h1>

        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
          {l.heroSubtitle}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12 lg:mb-16">
          <Link to="/register"
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-blue-700 transition-colors text-base shadow-sm shadow-blue-200">
            {l.heroCtaPrimary} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/login" className="w-full sm:w-auto text-gray-600 font-medium px-7 py-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-base">
            {l.heroCtaSecondary}
          </Link>
        </div>

        {/* App preview card */}
        <div className="relative mx-auto max-w-4xl hidden sm:block">
          <div className="rounded-2xl border border-gray-200 shadow-2xl shadow-gray-200/60 overflow-hidden bg-gray-50">
            {/* Fake browser bar */}
            <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 mx-3 bg-gray-100 rounded-md h-6 flex items-center px-3">
                <span className="text-xs text-gray-400">app.intracely.com/dashboard</span>
              </div>
            </div>
            {/* Mock dashboard */}
            <div className="bg-gray-50 p-6 flex gap-4 min-h-[280px]">
              {/* Sidebar mock */}
              <div className="w-44 bg-white rounded-xl border border-gray-200 p-3 flex flex-col gap-1 shrink-0">
                <div className="flex items-center gap-2 p-2 mb-2">
                  <div className="w-6 h-6 bg-blue-600 rounded-md" />
                  <span className="text-xs font-semibold text-gray-800">Intracely</span>
                </div>
                {[t.nav.dashboard,t.nav.purchaseOrders,t.nav.suppliers,t.nav.items,t.nav.categories,t.nav.projects].map((item, i) => (
                  <div key={item} className={`text-xs px-2 py-1.5 rounded-lg ${i === 0 ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500'}`}>
                    {item}
                  </div>
                ))}
              </div>
              {/* Content mock */}
              <div className="flex-1 flex flex-col gap-3">
                {/* Stats row */}
                <div className="grid grid-cols-4 gap-3">
                  {(isSl ? [['Skupni stroški','124.840 €'],['Odprta naročila','12'],['Dobavitelji','8'],['Povpr. vrednost','2.847 €']] : [['Total spend','€124,840'],['Open POs','12'],['Suppliers','8'],['Avg PO','€2,847']]).map(([label, val]) => (
                    <div key={label} className="bg-white rounded-xl border border-gray-200 p-3">
                      <p className="text-xs text-gray-400 mb-1">{label}</p>
                      <p className="text-base font-bold text-gray-900">{val}</p>
                    </div>
                  ))}
                </div>
                {/* Chart placeholder */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex-1">
                  <p className="text-xs font-semibold text-gray-500 mb-3">{isSl ? 'Stroški skozi čas' : 'Spend over time'}</p>
                  <div className="flex items-end gap-2 h-20">
                    {[40, 65, 45, 80, 55, 90, 70, 95, 60, 85, 75, 100].map((h, i) => (
                      <div key={i} className="flex-1 bg-blue-100 rounded-sm relative overflow-hidden">
                        <div className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-sm" style={{ height: `${h}%` }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar ── */}
      <section className="border-y border-gray-100 py-8 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 flex-wrap">
          {[
            { icon: FileText, text: isSl ? 'Profesionalne PDF naročilnice' : 'Professional PDF purchase orders' },
            { icon: BarChart2, text: isSl ? 'Pregled stroškov po projektih in dobaviteljih' : 'Spend overview by project and supplier' },
            { icon: Zap, text: isSl ? 'Nastavitev v manj kot 2 minutah' : 'Setup in less than 2 minutes' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5 text-sm text-gray-500">
              <Icon className="w-4 h-4 text-blue-500" />
              {text}
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-3">{l.featuresTitle}</p>
          <h2 className="text-4xl font-bold text-gray-900 tracking-tight">{l.featuresHeading}</h2>
          <p className="text-gray-500 mt-4 text-lg max-w-xl mx-auto">{l.featuresSubtitle}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FEATURE_ICONS.map(({ icon: Icon, color, k }) => (
            <div key={k} className="bg-white rounded-2xl border border-gray-200 p-7 hover:shadow-sm transition-shadow">
              <div className={`inline-flex p-3 rounded-xl ${color} mb-4`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{l[`${k}Title` as keyof typeof l] as string}</h3>
              <p className="text-gray-500 leading-relaxed">{l[`${k}Desc` as keyof typeof l] as string}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="bg-gray-50 border-y border-gray-100 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-3">{l.howTitle}</p>
            <h2 className="text-4xl font-bold text-gray-900 tracking-tight">{l.howHeading}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {STEP_NUMS.map((num, i) => (
              <div key={num} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white font-bold text-xl flex items-center justify-center mx-auto mb-5">
                  {num}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{l[`step${i + 1}Title` as keyof typeof l] as string}</h3>
                <p className="text-gray-500 leading-relaxed">{l[`step${i + 1}Desc` as keyof typeof l] as string}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-3">{l.pricingTitle}</p>
          <h2 className="text-4xl font-bold text-gray-900 tracking-tight">{l.pricingHeading}</h2>
          <p className="text-gray-500 mt-4 text-lg">{l.pricingSubtitle}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {PLANS.map(plan => (
            <div key={plan.name} className={`rounded-2xl border p-5 flex flex-col ${plan.featured ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200'}`}>
              {plan.featured && (
                <div className="text-xs font-semibold bg-blue-600 text-white px-3 py-1 rounded-full self-start mb-4">{isSl ? 'Najbolj priljubljen' : 'Most popular'}</div>
              )}
              <p className={`text-sm font-semibold uppercase tracking-widest mb-3 ${plan.featured ? 'text-gray-400' : 'text-gray-400'}`}>{plan.name}</p>
              <div className="flex items-baseline gap-1 mb-1">
                <>
                  <span className="text-sm text-gray-400">€</span>
                  <span className={`text-5xl font-bold ${plan.featured ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                  <span className="text-sm text-gray-400">{isSl ? '/mes' : '/mo'}</span>
                </>
              </div>
              <p className={`text-xs mb-6 ${plan.featured ? 'text-gray-500' : 'text-gray-400'}`}>
                {plan.price === 0
                  ? (isSl ? 'Brez časovne omejitve' : 'No time limit')
                  : (isSl ? `ali €${plan.yearlyPrice}/mes pri letnem plačilu` : `or €${plan.yearlyPrice}/mo billed yearly`)}
              </p>
              <p className={`text-sm mb-6 pb-6 border-b leading-relaxed ${plan.featured ? 'text-gray-400 border-gray-700' : 'text-gray-500 border-gray-100'}`}>
                {plan.desc}
              </p>
              <Link to="/register"
                className={`text-center py-2.5 rounded-xl font-medium text-sm transition-colors mb-6 ${
                  plan.featured
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}>
                {plan.cta}
              </Link>
              <ul className="flex flex-col gap-3">
                {plan.features.map(f => (
                  <li key={f.text} className="flex items-center gap-3 text-sm">
                    <Check included={f.included} soon={(f as any).soon} isSl={isSl} />
                    <span className={f.included ? (plan.featured ? 'text-gray-300' : 'text-gray-700') : 'text-gray-400'}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-gray-400 mt-6">{l.pricingNote}</p>
      </section>

      {/* ── CTA Banner ── */}
      <section className="bg-blue-600 py-20">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 tracking-tight">
            {l.ctaHeading}
          </h2>
          <p className="text-blue-200 text-lg mb-8">
            {l.ctaSubtitle}
          </p>
          <Link to="/register"
            className="inline-flex items-center gap-2 bg-white text-blue-600 font-semibold px-8 py-4 rounded-xl hover:bg-blue-50 transition-colors text-base">
            {l.ctaButton} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-0 justify-between">
          <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><AppLogo size="sm" /></a>
          <p className="text-sm text-gray-400">{l.footerRights}</p>
          <div className="flex gap-6 text-sm text-gray-400 order-first sm:order-last">
            <Link to="/privacy" className="hover:text-gray-700 transition-colors">{l.footerPrivacy}</Link>
            <Link to="/terms" className="hover:text-gray-700 transition-colors">{l.footerTerms}</Link>
            <a href="mailto:info@tce.si" className="hover:text-gray-700 transition-colors">{l.footerContact}</a>
          </div>
        </div>
      </footer>

    </div>
  )
}
