// ISO 3166-1 alpha-2 region codes; names are produced by the browser in the
// requested language, so no translation table has to be maintained.
const CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT
MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG
UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(/\s+/)

// Neighbouring / most common countries are offered first when nothing is typed.
const POPULAR = ['SI', 'HR', 'AT', 'IT', 'HU', 'DE']

export interface CountryList { popular: string[]; all: string[] }

export function countryList(lang: string): CountryList {
  const locale = lang === 'sl' ? 'sl' : 'en'
  const names = new Intl.DisplayNames([locale], { type: 'region' })
  const nameOf = (code: string) => names.of(code) ?? code
  const all = CODES.map(nameOf).sort((a, b) => a.localeCompare(b, locale))
  return { popular: POPULAR.map(nameOf), all }
}

const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
let index: Map<string, string> | null = null

/** Country name, code or any language's spelling -> ISO code. Built once. */
function codeIndex() {
  if (index) return index
  index = new Map()
  for (const locale of ['en', 'sl']) {
    const names = new Intl.DisplayNames([locale], { type: 'region' })
    for (const code of CODES) { const n = names.of(code); if (n) index.set(fold(n), code) }
  }
  for (const code of CODES) index.set(code.toLowerCase(), code)
  return index
}

/** A stored country (saved in whichever language was active at the time) shown in `lang`.
 *  Unknown free text is returned unchanged. */
export function localizeCountry(value: string | null | undefined, lang: string): string {
  if (!value) return ''
  const code = codeIndex().get(fold(value))
  if (!code) return value
  return new Intl.DisplayNames([lang === 'sl' ? 'sl' : 'en'], { type: 'region' }).of(code) ?? value
}
