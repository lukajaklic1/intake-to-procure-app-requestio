import { Link } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'
import AppLogo from '../components/ui/AppLogo'

export default function PrivacyPage() {
  const { lang, setLang } = useLanguage()
  const isSl = lang === 'sl'

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/"><AppLogo size="sm" /></Link>
          <div className="flex gap-1">
            {(['en', 'sl'] as const).map(lng => (
              <button key={lng} onClick={() => setLang(lng)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${lang === lng ? 'bg-accent text-white' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          {isSl ? 'Politika zasebnosti' : 'Privacy Policy'}
        </h1>
        <p className="text-gray-400 text-sm mb-10">{isSl ? 'Zadnja posodobitev: junij 2026' : 'Last updated: June 2026'}</p>

        <div className="space-y-8 text-gray-600 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '1. Upravljavec podatkov' : '1. Data Controller'}</h2>
            <p>{isSl
              ? 'Upravljavec osebnih podatkov je TCE, d.o.o. Za vsa vprašanja v zvezi z zasebnostjo nas kontaktirajte na info@tce.si.'
              : 'The data controller is TCE, d.o.o. For all privacy-related questions, contact us at info@tce.si.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '2. Katere podatke zbiramo' : '2. What Data We Collect'}</h2>
            <p className="mb-3">{isSl
              ? 'Zbiramo naslednje podatke, ki jih sami vnesete v aplikacijo:'
              : 'We collect the following data that you enter into the application:'}</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>{isSl ? 'Ime, priimek in e-poštni naslov ob registraciji' : 'First name, last name and email address upon registration'}</li>
              <li>{isSl ? 'Podatki o podjetju (naziv, naslov, davčna številka, bančni podatki)' : 'Company information (name, address, tax number, bank details)'}</li>
              <li>{isSl ? 'Podatki o dobaviteljih, naročilnicah, artiklih, projektih in kategorijah' : 'Supplier, purchase order, item, project and category data'}</li>
              <li>{isSl ? 'Priložene datoteke (ponudbe, PDF dokumenti)' : 'Attached files (quotations, PDF documents)'}</li>
              <li>{isSl ? 'Tehnični podatki (čas prijave, IP naslov za varnostne namene)' : 'Technical data (login time, IP address for security purposes)'}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '3. Namen in pravna podlaga obdelave' : '3. Purpose and Legal Basis'}</h2>
            <p className="mb-3">{isSl
              ? 'Vaše podatke obdelujemo izključno za naslednje namene:'
              : 'We process your data exclusively for the following purposes:'}</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>{isSl ? 'Zagotavljanje storitve Requestio (upravljanje nabavnih naročil, analitika, dobavitelji)' : 'Providing the Requestio service (purchase order management, analytics, suppliers)'}</li>
              <li>{isSl ? 'Upravljanje vašega računa in avtentikacija' : 'Account management and authentication'}</li>
              <li>{isSl ? 'Varnost aplikacije in preprečevanje zlorab' : 'Application security and abuse prevention'}</li>
              <li>{isSl ? 'Izpolnjevanje zakonskih obveznosti' : 'Compliance with legal obligations'}</li>
            </ul>
            <p className="mt-3">{isSl
              ? 'Pravna podlaga za obdelavo je pogodba (člen 6(1)(b) GDPR) — obdelava je potrebna za izvajanje storitve, ki ste jo naročili.'
              : 'The legal basis for processing is contract (Article 6(1)(b) GDPR) — processing is necessary to perform the service you have subscribed to.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '4. Hramba podatkov' : '4. Data Retention'}</h2>
            <p className="mb-3">{isSl
              ? 'Vaše podatke hranimo po naslednjih pravilih:'
              : 'We retain your data according to the following rules:'}</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>{isSl ? 'Podatki računa in podjetja: dokler je račun aktiven' : 'Account and company data: for as long as the account is active'}</li>
              <li>{isSl ? 'Naročilnice in poslovni dokumenti: 1 leto po zaprtju računa (zakonska obveznost hranjenja poslovnih listin)' : 'Purchase orders and business documents: 1 year after account closure (legal obligation to retain business records)'}</li>
              <li>{isSl ? 'Priložene datoteke: izbrisane takoj ob zaprtju računa' : 'Attached files: deleted immediately upon account closure'}</li>
              <li>{isSl ? 'Varnostni logi: 90 dni' : 'Security logs: 90 days'}</li>
            </ul>
            <p className="mt-3">{isSl
              ? 'Po poteku roka hrambe se podatki samodejno izbrišejo.'
              : 'After the retention period expires, data is automatically deleted.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '5. Shranjevanje in varnost podatkov' : '5. Data Storage and Security'}</h2>
            <p className="mb-3">{isSl
              ? 'Vsi podatki so shranjeni na strežnikih Supabase v Evropski uniji (Frankfurt, Nemčija). Supabase je certificiran ponudnik po standardu SOC 2 Type II.'
              : 'All data is stored on Supabase servers in the European Union (Frankfurt, Germany). Supabase is a SOC 2 Type II certified provider.'}</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>{isSl ? 'Šifriranje med prenosom: TLS 1.2+' : 'Encryption in transit: TLS 1.2+'}</li>
              <li>{isSl ? 'Šifriranje v mirovanju: AES-256' : 'Encryption at rest: AES-256'}</li>
              <li>{isSl ? 'Dostop do podatkov: samo pooblaščeni zaposleni' : 'Data access: authorized personnel only'}</li>
              <li>{isSl ? 'Varnostne kopije: dnevno' : 'Backups: daily'}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '6. Posredovanje podatkov tretjim osebam' : '6. Third-Party Data Sharing'}</h2>
            <p className="mb-3">{isSl
              ? 'Vaših podatkov ne prodajamo in ne posredujemo tretjim osebam v komercialne namene. Podatke delimo samo z naslednjimi obdelovalci, ki so nujni za delovanje storitve:'
              : 'We do not sell or share your data with third parties for commercial purposes. We share data only with the following processors necessary for the service:'}</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Supabase Inc.</strong> — {isSl ? 'hramba podatkov in avtentikacija (EU strežniki)' : 'data storage and authentication (EU servers)'}</li>
              <li><strong>Vercel Inc.</strong> — {isSl ? 'gostovanje aplikacije (Edge Network)' : 'application hosting (Edge Network)'}</li>
            </ul>
            <p className="mt-3">{isSl
              ? 'Z vsemi obdelovalci imamo sklenjene pogodbe o obdelavi podatkov (DPA) v skladu z GDPR.'
              : 'We have data processing agreements (DPA) in place with all processors in accordance with GDPR.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '7. Vaše pravice' : '7. Your Rights'}</h2>
            <p className="mb-3">{isSl
              ? 'V skladu z GDPR imate naslednje pravice:'
              : 'Under GDPR, you have the following rights:'}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>{isSl ? 'Pravica do dostopa' : 'Right of access'}</strong> — {isSl ? 'zahtevate lahko kopijo vseh osebnih podatkov, ki jih hranimo o vas' : 'you can request a copy of all personal data we hold about you'}</li>
              <li><strong>{isSl ? 'Pravica do popravka' : 'Right to rectification'}</strong> — {isSl ? 'podatke lahko kadarkoli popravite v nastavitvah aplikacije' : 'you can correct your data at any time in the application settings'}</li>
              <li><strong>{isSl ? 'Pravica do izbrisa' : 'Right to erasure'}</strong> — {isSl ? 'zahtevate lahko izbris vaših osebnih podatkov' : 'you can request deletion of your personal data'}</li>
              <li><strong>{isSl ? 'Pravica do prenosljivosti' : 'Right to portability'}</strong> — {isSl ? 'zahtevate lahko izvoz vaših podatkov v strojno berljivi obliki' : 'you can request an export of your data in a machine-readable format'}</li>
              <li><strong>{isSl ? 'Pravica do ugovora' : 'Right to object'}</strong> — {isSl ? 'ugovarjate lahko obdelavi vaših podatkov' : 'you can object to the processing of your data'}</li>
              <li><strong>{isSl ? 'Pravica do omejitve obdelave' : 'Right to restriction'}</strong> — {isSl ? 'zahtevate lahko omejitev obdelave vaših podatkov' : 'you can request restriction of processing of your data'}</li>
            </ul>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-field">
              <p className="font-medium text-gray-800 mb-1">{isSl ? 'Kako uveljaviti pravice' : 'How to exercise your rights'}</p>
              <p>{isSl
                ? 'Za uveljavljanje katerekoli od zgornjih pravic nam pišite na '
                : 'To exercise any of the above rights, write to us at '}
                <a href="mailto:info@tce.si" className="text-accent hover:underline font-medium">info@tce.si</a>.
                {isSl
                  ? ' Vašo zahtevo bomo obravnavali v 30 dneh od prejema.'
                  : ' We will handle your request within 30 days of receipt.'}
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '8. Piškotki' : '8. Cookies'}</h2>
            <p>{isSl
              ? 'Aplikacija uporablja samo tehnično nujne piškotke za avtentikacijo in vzdrževanje seje. Ne uporabljamo analitičnih piškotkov, piškotkov za sledenje ali oglaševalskih piškotkov. Ker ne uporabljamo neobveznih piškotkov, soglasje za piškotke ni potrebno.'
              : 'The application uses only technically necessary cookies for authentication and session management. We do not use analytics, tracking or advertising cookies. Since we do not use optional cookies, cookie consent is not required.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '9. Pritožbe' : '9. Complaints'}</h2>
            <p>{isSl
              ? 'Če menite, da obdelujemo vaše podatke v nasprotju z GDPR, imate pravico vložiti pritožbo pri Informacijskemu pooblaščencu Republike Slovenije (ip-rs.si) ali pri nadzornem organu v državi vašega stalnega prebivališča.'
              : 'If you believe we are processing your data in violation of GDPR, you have the right to lodge a complaint with the Information Commissioner of the Republic of Slovenia (ip-rs.si) or with the supervisory authority in your country of residence.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '10. Spremembe politike zasebnosti' : '10. Changes to This Policy'}</h2>
            <p>{isSl
              ? 'Pridržujemo si pravico do spremembe te politike zasebnosti. O pomembnih spremembah vas bomo obvestili po e-pošti vsaj 14 dni vnaprej. Datum zadnje posodobitve je naveden na vrhu te strani.'
              : 'We reserve the right to change this privacy policy. We will notify you of significant changes by email at least 14 days in advance. The date of the last update is shown at the top of this page.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '11. Kontakt' : '11. Contact'}</h2>
            <p>{isSl
              ? 'Za vsa vprašanja v zvezi z zasebnostjo nas kontaktirajte na '
              : 'For all privacy-related questions, contact us at '}
              <a href="mailto:info@tce.si" className="text-accent hover:underline">info@tce.si</a>.
            </p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link to="/" className="text-sm text-accent hover:underline">{isSl ? '← Nazaj na domačo stran' : '← Back to home'}</Link>
        </div>
      </div>
    </div>
  )
}
