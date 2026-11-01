import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { localizeCountry } from '../lib/countries'

Font.register({
  family: 'Roboto',
  fonts: [
    { src: '/fonts/Roboto-Regular.ttf', fontWeight: 'normal' },
    { src: '/fonts/Roboto-Bold.ttf', fontWeight: 'bold' },
  ],
})

const LABELS = {
  en: {
    types: { rfq: 'Request for quotation', rfp: 'Request for proposal', rfi: 'Request for information' },
    issued: 'Date', deadline: 'Offer deadline', to: 'TO', delivery: 'DELIVERY', contact: 'CONTACT PERSON',
    description: 'DESCRIPTION AND REQUIREMENTS', pos: 'Pos', itemDesc: 'Description', qty: 'Qty', unit: 'Unit',
    how: 'HOW TO RESPOND',
    howText: (deadline: string) => `Please send your offer by ${deadline}. State the price per unit excluding VAT for every item, the delivery time, the payment terms and how long the offer is valid. Offers received after the deadline may not be considered.`,
    howTextNoDeadline: 'Please send your offer as soon as possible. State the price per unit excluding VAT for every item, the delivery time, the payment terms and how long the offer is valid.',
    vat: 'VAT', reg: 'Reg. no.', page: (p: number, n: number) => `Page ${p} of ${n}`,
  },
  sl: {
    types: { rfq: 'Povpraševanje po ceni', rfp: 'Poziv k oddaji ponudb', rfi: 'Zahteva za informacije' },
    issued: 'Datum', deadline: 'Rok za oddajo ponudbe', to: 'PREJEMNIK', delivery: 'DOBAVA', contact: 'KONTAKTNA OSEBA',
    description: 'OPIS IN ZAHTEVE', pos: 'Poz', itemDesc: 'Opis', qty: 'Kol.', unit: 'Enota',
    how: 'NAČIN ODGOVORA',
    howText: (deadline: string) => `Prosimo, da ponudbo pošljete do ${deadline}. Za vsako postavko navedite ceno na enoto brez DDV, dobavni rok, plačilne pogoje in veljavnost ponudbe. Ponudb, prejetih po roku, ne moremo upoštevati.`,
    howTextNoDeadline: 'Prosimo, da ponudbo pošljete čim prej. Za vsako postavko navedite ceno na enoto brez DDV, dobavni rok, plačilne pogoje in veljavnost ponudbe.',
    vat: 'DDV', reg: 'Matična št.', page: (p: number, n: number) => `Stran ${p} od ${n}`,
  },
}

export interface RFQDocData {
  number: string
  type: 'rfq' | 'rfp' | 'rfi'
  title: string
  description: string | null
  deadline: string | null
  issuedAt: string
  company: { name: string; address_street: string | null; address_city: string | null; address_postal_code: string | null; address_country: string | null; email: string | null; phone: string | null; tax_id: string | null; registration_number?: string | null; website?: string | null }
  supplier: { name: string; contact_name: string | null; email: string | null; address_street: string | null; address_city: string | null; address_postal_code: string | null; address_country: string | null } | null
  location: { name: string; address_street: string | null; address_city: string | null; address_postal_code: string | null; address_country: string | null } | null
  contactPerson: { name: string; email: string | null; phone: string | null } | null
  items: { position: number; name: string; description: string | null; quantity: number; unit: string }[]
}

const BLUE = '#2563eb', DARK = '#111827', MID = '#374151', MUTED = '#6b7280', BORDER = '#d1d5db', LIGHT = '#f9fafb'
const s = StyleSheet.create({
  page: { fontFamily: 'Roboto', fontSize: 9, color: DARK, paddingTop: 36, paddingBottom: 70, paddingHorizontal: 40 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: BLUE, borderBottomStyle: 'solid', paddingBottom: 14, marginBottom: 18 },
  company: { fontSize: 13, color: DARK },
  title: { fontSize: 20, color: DARK, textAlign: 'right' },
  number: { fontSize: 12, color: BLUE, textAlign: 'right', marginTop: 3 },
  dates: { flexDirection: 'row', justifyContent: 'flex-end', gap: 22, marginTop: 8 },
  dateLabel: { fontSize: 7, color: MUTED, textAlign: 'right' },
  dateValue: { fontSize: 9, color: DARK, textAlign: 'right' },
  subject: { fontSize: 13, color: DARK, marginBottom: 14 },
  boxes: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  box: { flex: 1, padding: 10, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', borderRadius: 4 },
  boxLabel: { fontSize: 7, color: BLUE, marginBottom: 5 },
  boxName: { fontSize: 9, color: DARK, marginBottom: 2 },
  boxLine: { fontSize: 8, color: MID, lineHeight: 1.5 },
  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 7, color: MUTED, marginBottom: 4 },
  text: { fontSize: 8.5, color: DARK, lineHeight: 1.6 },
  head: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 4, backgroundColor: DARK },
  headText: { fontSize: 8, color: 'white' },
  row: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid' },
  alt: { backgroundColor: LIGHT },
  cPos: { width: 28 },
  cDesc: { flex: 1 },
  cQty: { width: 54, textAlign: 'right' },
  cUnit: { width: 48, textAlign: 'center' },
  itemName: { fontSize: 9, color: DARK },
  itemDesc: { fontSize: 7.5, color: MUTED, marginTop: 2, lineHeight: 1.4 },
  footer: { position: 'absolute', bottom: 18, left: 40, right: 40, borderTopWidth: 1, borderTopColor: BORDER, borderTopStyle: 'solid', paddingTop: 7, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: MUTED, lineHeight: 1.5 },
})

const fmtDate = (d: string | null) => { if (!d) return '-'; try { return format(new Date(d), 'dd.MM.yyyy') } catch { return d } }
const fmtQty = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n)
const addr = (lang: string, o: { address_street?: string | null; address_city?: string | null; address_postal_code?: string | null; address_country?: string | null }) =>
  [o.address_street, [o.address_postal_code, o.address_city].filter(Boolean).join(' '), localizeCountry(o.address_country, lang)].filter((l): l is string => !!l)

/** The request that goes to a supplier: what is asked for, until when, where to deliver and how to answer. No target prices. */
export default function RFQDocument({ data, lang = 'sl' }: { data: RFQDocData; lang?: 'en' | 'sl' }) {
  const L = LABELS[lang]
  const { company, supplier, location, contactPerson } = data
  const footerLine = [company.registration_number ? `${L.reg}: ${company.registration_number}` : '', company.tax_id ? `${L.vat}: ${company.tax_id}` : '', company.website ?? ''].filter(Boolean).join('  ·  ')

  return (
    <Document title={`${data.number} - ${data.title}`}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <Text style={s.company}>{company.name}</Text>
          <View>
            <Text style={s.title}>{L.types[data.type]}</Text>
            <Text style={s.number}>{data.number}</Text>
            <View style={s.dates}>
              <View><Text style={s.dateLabel}>{L.issued}</Text><Text style={s.dateValue}>{fmtDate(data.issuedAt)}</Text></View>
              <View><Text style={s.dateLabel}>{L.deadline}</Text><Text style={s.dateValue}>{fmtDate(data.deadline)}</Text></View>
            </View>
          </View>
        </View>

        <Text style={s.subject}>{data.title}</Text>

        <View style={s.boxes}>
          {supplier && (
            <View style={s.box}>
              <Text style={s.boxLabel}>{L.to}</Text>
              <Text style={s.boxName}>{supplier.name}</Text>
              {supplier.contact_name ? <Text style={s.boxLine}>{supplier.contact_name}</Text> : null}
              {supplier.email ? <Text style={s.boxLine}>{supplier.email}</Text> : null}
              {addr(lang, supplier).map((l, i) => <Text key={i} style={s.boxLine}>{l}</Text>)}
            </View>
          )}
          {location && (
            <View style={s.box}>
              <Text style={s.boxLabel}>{L.delivery}</Text>
              <Text style={s.boxName}>{location.name}</Text>
              {addr(lang, location).map((l, i) => <Text key={i} style={s.boxLine}>{l}</Text>)}
            </View>
          )}
          {contactPerson && (
            <View style={s.box}>
              <Text style={s.boxLabel}>{L.contact}</Text>
              <Text style={s.boxName}>{contactPerson.name}</Text>
              {contactPerson.email ? <Text style={s.boxLine}>{contactPerson.email}</Text> : null}
              {contactPerson.phone ? <Text style={s.boxLine}>{contactPerson.phone}</Text> : null}
            </View>
          )}
        </View>

        {data.description ? (
          <View style={s.section}>
            <Text style={s.sectionLabel}>{L.description}</Text>
            <Text style={s.text}>{data.description}</Text>
          </View>
        ) : null}

        <View style={s.head}>
          <Text style={[s.headText, s.cPos]}>{L.pos}</Text>
          <Text style={[s.headText, s.cDesc]}>{L.itemDesc}</Text>
          <Text style={[s.headText, s.cQty]}>{L.qty}</Text>
          <Text style={[s.headText, s.cUnit]}>{L.unit}</Text>
        </View>
        {data.items.map((it, i) => (
          <View key={i} style={[s.row, i % 2 === 1 ? s.alt : {}]} wrap={false}>
            <Text style={[s.cPos, { fontSize: 9, color: MID }]}>{it.position / 10}</Text>
            <View style={s.cDesc}>
              <Text style={s.itemName}>{it.name}</Text>
              {it.description ? <Text style={s.itemDesc}>{it.description}</Text> : null}
            </View>
            <Text style={[s.cQty, { fontSize: 9, color: MID }]}>{fmtQty(it.quantity)}</Text>
            <Text style={[s.cUnit, { fontSize: 9, color: MID }]}>{it.unit}</Text>
          </View>
        ))}

        <View style={[s.section, { marginTop: 16 }]}>
          <Text style={s.sectionLabel}>{L.how}</Text>
          <Text style={s.text}>{data.deadline ? L.howText(fmtDate(data.deadline)) : L.howTextNoDeadline}</Text>
        </View>

        <View style={s.footer} fixed>
          <View>
            <Text style={[s.footerText, { color: MID }]}>{company.name}</Text>
            {addr(lang, company).length ? <Text style={s.footerText}>{addr(lang, company).join(', ')}</Text> : null}
            {footerLine ? <Text style={s.footerText}>{footerLine}</Text> : null}
          </View>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => L.page(pageNumber, totalPages)} fixed />
        </View>
      </Page>
    </Document>
  )
}
