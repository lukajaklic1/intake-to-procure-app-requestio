/**
 * Slovensko množinsko sklanjanje
 * 1 → ednina, 2 → dvojina, 3-4 → množina, 5+ → rodilnik množine
 * Posebnost: 11, 12 → vedno rodilnik množine
 */
export function slPlural(n: number, ednina: string, dvojina: string, mnozina: string, rodilnik: string): string {
  // Slovensko sklanjanje: samo točno 1, 2, 3, 4 imajo posebne oblike
  // Vse ostalo (0, 5+, 11, 12, 21, 22, 101...) → rodilnik množine
  if (n === 1) return ednina
  if (n === 2) return dvojina
  if (n === 3 || n === 4) return mnozina
  return rodilnik
}

// Predpripravljene funkcije za vsako entiteto

export function stDobaviteljev(n: number) {
  return `${n} ${slPlural(n, 'aktiven dobavitelj', 'aktivna dobavitelja', 'aktivni dobavitelji', 'aktivnih dobaviteljev')}`
}

export function stArtiklov(n: number) {
  return `${n} ${slPlural(n, 'aktiven artikel', 'aktivna artikla', 'aktivni artikli', 'aktivnih artiklov')}`
}

export function stProjektov(n: number) {
  return `${n} ${slPlural(n, 'aktiven projekt', 'aktivna projekta', 'aktivni projekti', 'aktivnih projektov')}`
}

export function stKategorij(n: number) {
  return `${n} ${slPlural(n, 'kategorija', 'kategoriji', 'kategorije', 'kategorij')}`
}

export function stOddelkov(n: number) {
  return `${n} ${slPlural(n, 'oddelek', 'oddelka', 'oddelki', 'oddelkov')}`
}

export function stLokacij(n: number) {
  return `${n} ${slPlural(n, 'lokacija', 'lokaciji', 'lokacije', 'lokacij')}`
}

export function stNarocil(n: number) {
  return `${n} ${slPlural(n, 'naročilo', 'naročili', 'naročila', 'naročil')}`
}

export function stOdprtihNarocil(n: number) {
  return `${n} ${slPlural(n, 'odprto naročilo', 'odprti naročili', 'odprta naročila', 'odprtih naročil')}`
}
