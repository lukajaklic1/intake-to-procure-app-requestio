import { Link } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'
import AppLogo from '../components/ui/AppLogo'

export default function TermsPage() {
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
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${lang === lng ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          {isSl ? 'Pogoji uporabe' : 'Terms of Service'}
        </h1>
        <p className="text-gray-400 text-sm mb-10">{isSl ? 'Zadnja posodobitev: junij 2026' : 'Last updated: June 2026'}</p>

        <div className="space-y-8 text-gray-600 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '1. Sprejemanje pogojev' : '1. Acceptance of Terms'}</h2>
            <p>{isSl
              ? 'Z registracijo in uporabo aplikacije Intracely sprejemate te pogoje uporabe v celoti. Če se s katerimkoli določilom ne strinjate, aplikacije ne smete uporabljati.'
              : 'By registering and using the Intracely application, you accept these terms of service in full. If you do not agree with any provision, you must not use the application.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '2. Opis storitve' : '2. Service Description'}</h2>
            <p>{isSl
              ? 'Intracely je spletna aplikacija za upravljanje nabavnih naročil, dobaviteljev in analitike stroškov. Storitev zagotavlja TCE, d.o.o. Storitev se zagotavlja v obliki SaaS (Software as a Service) in je dostopna prek spletnega brskalnika.'
              : 'Intracely is a web application for managing purchase orders, suppliers and spend analytics. The service is provided by TCE, d.o.o. as Software as a Service (SaaS) accessible via a web browser.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '3. Račun in odgovornost uporabnika' : '3. Account and User Responsibility'}</h2>
            <p>{isSl
              ? 'Za varnost svojega računa ste odgovorni vi. Ne smete deliti dostopnih podatkov z nepooblaščenimi osebami. Odgovorni ste za vse dejavnosti, ki se izvajajo pod vašim računom. V primeru nepooblaščenega dostopa nas nemudoma obvestite na info@tce.si.'
              : 'You are responsible for the security of your account. You must not share access credentials with unauthorized persons. You are responsible for all activities carried out under your account. In case of unauthorized access, notify us immediately at info@tce.si.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '4. Plačila in naročnine' : '4. Payments and Subscriptions'}</h2>
            <p>{isSl
              ? 'Brezplačni plan je na voljo brez časovne omejitve do 15 naročil na mesec. Plačljivi plani se zaračunajo mesečno ali letno vnaprej. Naročnino lahko kadarkoli prekličete — dostop ostane aktiven do konca plačanega obdobja. Povračil za že plačana obdobja ne izvajamo.'
              : 'The free plan is available without time limit up to 15 orders per month. Paid plans are billed monthly or annually in advance. You can cancel your subscription at any time — access remains active until the end of the paid period. We do not issue refunds for already paid periods.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '5. Lastninska pravica nad podatki' : '5. Data Ownership'}</h2>
            <p>{isSl
              ? 'Vsi podatki, ki jih vnesete v Intracely (naročilnice, dobavitelji, artikli, priložene datoteke), so vaša izključna last. TCE, d.o.o. nima pravice do uporabe vaših podatkov v komercialne namene. Ob prenehanju uporabe storitve vam omogočimo izvoz podatkov.'
              : 'All data you enter into Intracely (purchase orders, suppliers, items, attached files) is your exclusive property. TCE, d.o.o. has no right to use your data for commercial purposes. Upon termination of service, we will enable you to export your data.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '6. Omejitev odgovornosti' : '6. Limitation of Liability'}</h2>
            <p className="mb-4">{isSl
              ? 'REQUESTIO IN TCE, D.O.O. V NOBENEM PRIMERU NE ODGOVARJATA ZA:'
              : 'REQUESTIO AND TCE, D.O.O. SHALL IN NO CASE BE LIABLE FOR:'}</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>{isSl ? 'Kakršnokoli neposredno, posredno, naključno, posebno ali posledično škodo, ki izhaja iz uporabe ali nezmožnosti uporabe aplikacije' : 'Any direct, indirect, incidental, special or consequential damage arising from the use or inability to use the application'}</li>
              <li>{isSl ? 'Izgubo prihodkov, dobička, poslovnih priložnosti ali podatkov' : 'Loss of revenue, profit, business opportunities or data'}</li>
              <li>{isSl ? 'Napake v naročilnicah, ki so bile ustvarjene s pomočjo aplikacije, in posledice teh napak v poslovnih razmerjih z dobavitelji' : 'Errors in purchase orders created using the application and the consequences of such errors in business relationships with suppliers'}</li>
              <li>{isSl ? 'Škodo nastalo zaradi prekinitev delovanja storitve, tehničnih napak ali izgube dostopa do podatkov' : 'Damage caused by service interruptions, technical errors or loss of access to data'}</li>
              <li>{isSl ? 'Škodo nastalo zaradi nepooblaščenega dostopa do vašega računa' : 'Damage caused by unauthorized access to your account'}</li>
              <li>{isSl ? 'Kakršnekoli poslovne odločitve, ki so bile sprejete na podlagi podatkov ali analitike v aplikaciji' : 'Any business decisions made based on data or analytics in the application'}</li>
            </ul>
            <p className="font-medium text-gray-800">{isSl
              ? 'Skupna odgovornost TCE, d.o.o. v nobenem primeru ne presega zneska, ki ste ga plačali za storitev v zadnjih 3 mesecih pred nastankom škode. Uporabnik aplikacijo uporablja na lastno odgovornost.'
              : 'The total liability of TCE, d.o.o. shall in no case exceed the amount you paid for the service in the 3 months preceding the damage. The user uses the application at their own risk.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '7. Razpoložljivost storitve' : '7. Service Availability'}</h2>
            <p>{isSl
              ? 'Storitev se trudimo zagotavljati neprekinjeno, vendar ne jamčimo za 100% razpoložljivost. Pridržujemo si pravico do začasne prekinitve storitve zaradi vzdrževalnih del, nadgradenj ali tehničnih razlogov. Za morebitne prekinitve ne odgovarjamo finančno.'
              : 'We strive to provide the service continuously, but do not guarantee 100% availability. We reserve the right to temporarily suspend the service for maintenance, upgrades or technical reasons. We are not financially liable for any interruptions.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '8. Prekinitev dostopa' : '8. Termination of Access'}</h2>
            <p>{isSl
              ? 'Pridržujemo si pravico do prekinitve dostopa do storitve v primeru kršitve teh pogojev, neplačila naročnine ali zlorabe storitve. V primeru prekinitve vam omogočimo izvoz podatkov v roku 30 dni.'
              : 'We reserve the right to terminate access to the service in case of violation of these terms, non-payment of subscription or misuse of the service. In case of termination, we will enable you to export your data within 30 days.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '9. Spremembe pogojev' : '9. Changes to Terms'}</h2>
            <p>{isSl
              ? 'Pridržujemo si pravico do spremembe teh pogojev. O pomembnih spremembah vas bomo obvestili po e-pošti vsaj 14 dni vnaprej. Nadaljnja uporaba aplikacije po uveljavitvi sprememb pomeni sprejetje novih pogojev.'
              : 'We reserve the right to change these terms. We will notify you of significant changes by email at least 14 days in advance. Continued use of the application after changes take effect constitutes acceptance of the new terms.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '10. Veljavno pravo' : '10. Governing Law'}</h2>
            <p>{isSl
              ? 'Za te pogoje velja pravo Republike Slovenije. Morebitne spore bomo reševali sporazumno, v primeru neuspeha pa je pristojno sodišče v Ljubljani.'
              : 'These terms are governed by the law of the Republic of Slovenia. Any disputes will be resolved amicably; if unsuccessful, the competent court is in Ljubljana.'}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{isSl ? '11. Kontakt' : '11. Contact'}</h2>
            <p>{isSl ? 'Za vprašanja v zvezi s pogoji nas kontaktirajte na ' : 'For questions regarding these terms, contact us at '}
              <a href="mailto:info@tce.si" className="text-blue-600 hover:underline">info@tce.si</a>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link to="/" className="text-sm text-blue-600 hover:underline">{isSl ? '← Nazaj na domačo stran' : '← Back to home'}</Link>
        </div>
      </div>
    </div>
  )
}
