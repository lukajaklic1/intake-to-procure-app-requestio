import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'
import { format } from 'date-fns'

Font.register({
  family: 'Roboto',
  fonts: [
    { src: '/fonts/Roboto-Regular.ttf', fontWeight: 'normal' },
    { src: '/fonts/Roboto-Bold.ttf', fontWeight: 'bold' },
  ]
})

const PDF_LABELS = {
  en: {
    title: 'Purchase Order',
    orderDate: 'Order date',
    desiredDelivery: 'Desired delivery date',
    vat: 'VAT',
    supplier: 'SUPPLIER',
    deliveryAddress: 'DELIVERY ADDRESS',
    pos: 'Pos',
    code: 'Code',
    desc: 'Description',
    qty: 'Qty',
    unit: 'Unit',
    unitPrice: 'Price/unit',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    totalExVat: 'Total excl. VAT',
    note: 'NOTE',
    bank: 'Bank',
    pageOf: (p: number, n: number) => `Page ${p} of ${n}`,
    paymentTerms: 'Payment terms',
    incoterm: 'Incoterm',
    quoteRef: 'Supplier quote no.',
  },
  sl: {
    title: 'Nabavno naročilo',
    orderDate: 'Datum naročila',
    desiredDelivery: 'Željeni rok dobave',
    vat: 'DDV',
    supplier: 'DOBAVITELJ',
    deliveryAddress: 'NASLOV ZA DOBAVO',
    pos: 'Poz',
    code: 'Šifra',
    desc: 'Opis',
    qty: 'Kol.',
    unit: 'EM',
    unitPrice: 'Cena/EM',
    amount: 'Znesek',
    subtotal: 'Vmesni znesek',
    discount: 'Popust',
    totalExVat: 'Skupaj brez DDV',
    note: 'OPOMBA',
    bank: 'Banka',
    pageOf: (p: number, n: number) => `Stran ${p} od ${n}`,
    paymentTerms: 'Plačilni pogoji',
    incoterm: 'Pariteta',
    quoteRef: 'Št. ponudbe dobavitelja',
  },
} as const

export interface PODocData {
  po_number: string
  status: string
  created_at: string
  expected_delivery_date: string | null
  payment_terms: string
  incoterm: string | null
  supplier_quote_ref: string | null
  notes: string | null
  discount_amount: number
  total_amount: number
  currency: string
  company: {
    name: string
    address_street: string | null; address_city: string | null
    address_postal_code: string | null; address_country: string | null
    email: string | null; phone: string | null; tax_id: string | null
    bank_name: string | null; bank_iban: string | null
  }
  supplier: {
    name: string; vat_number: string | null; contact_name: string | null
    email: string | null; phone: string | null
    address_street: string | null; address_city: string | null
    address_postal_code: string | null; address_country: string | null
  }
  location: {
    name: string; address_street: string | null; address_city: string | null
    address_postal_code: string | null; address_country: string | null
  }
  category: { name: string }
  department: { name: string } | null
  lines: {
    position: number; item_number?: string | null; name: string; long_description: string | null
    quantity: number; unit: string; unit_price: number; line_total: number
  }[]
}

const BLUE = '#2563eb'
const DARK = '#111827'
const MID = '#374151'
const MUTED = '#6b7280'
const BORDER = '#d1d5db'
const LIGHT = '#f9fafb'
const BLUE_LIGHT = '#eff6ff'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Roboto', fontSize: 9, color: DARK,
    paddingTop: 36, paddingBottom: 54, paddingHorizontal: 40,
  },

  // ── 1. Top row: logo + title block ──────────────────────────────────────────
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 24,
    borderBottomWidth: 2, borderBottomColor: BLUE, borderBottomStyle: 'solid',
    paddingBottom: 16,
  },
  logoText: { fontSize: 15, fontFamily: 'Roboto', color: DARK },
  titleBlock: { alignItems: 'flex-end' },
  titleText: { fontSize: 26, fontFamily: 'Roboto', color: DARK, marginBottom: 4 },
  poNumber: { fontSize: 13, fontFamily: 'Roboto', color: BLUE, marginBottom: 8 },
  datesRow: { flexDirection: 'row', gap: 24 },
  dateBlock: { alignItems: 'flex-end' },
  dateLabel: { fontSize: 7, color: MUTED, marginBottom: 1 },
  dateValue: { fontSize: 9, fontFamily: 'Roboto', color: DARK },

  // ── 2. Our company ───────────────────────────────────────────────────────────
  companyBox: {
    backgroundColor: LIGHT,
    borderWidth: 1, borderColor: BORDER, borderStyle: 'solid',
    borderRadius: 4, padding: 10, marginBottom: 12,
  },
  companyName: { fontSize: 10, fontFamily: 'Roboto', color: DARK, marginBottom: 3 },
  companyLine: { fontSize: 8, color: MID, lineHeight: 1.5 },

  // ── 3. Supplier + Delivery ───────────────────────────────────────────────────
  addressRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  addressBox: {
    flex: 1, padding: 10,
    borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', borderRadius: 4,
  },
  boxLabel: {
    fontSize: 7, fontFamily: 'Roboto', color: BLUE,
    marginBottom: 6, textTransform: 'uppercase',
  },
  addressName: { fontSize: 9, fontFamily: 'Roboto', color: DARK, marginBottom: 2 },
  addressLine: { fontSize: 8, color: MID, lineHeight: 1.5 },

  // ── 4. Terms row ─────────────────────────────────────────────────────────────
  termsRow: {
    flexDirection: 'row', gap: 0, marginBottom: 16,
    borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', borderRadius: 4,
    overflow: 'hidden',
  },
  termCell: {
    flex: 1, padding: 9,
    borderRightWidth: 1, borderRightColor: BORDER, borderRightStyle: 'solid',
  },
  termCellLast: { flex: 1, padding: 9 },
  termLabel: { fontSize: 7, color: MUTED, marginBottom: 2 },
  termValue: { fontSize: 9, fontFamily: 'Roboto', color: DARK },

  // ── 5. Line items ────────────────────────────────────────────────────────────
  tableHead: {
    flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 4,
    backgroundColor: DARK,
  },
  tableHeadText: { fontSize: 8, fontFamily: 'Roboto', color: 'white' },
  tableRow: {
    flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid',
  },
  tableRowAlt: { backgroundColor: LIGHT },
  tableFoot: {
    flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 4,
    backgroundColor: BLUE_LIGHT,
    borderTopWidth: 2, borderTopColor: DARK, borderTopStyle: 'solid',
  },

  colPos:   { width: 26 },
  colDesc:  { flex: 1 },
  colQty:   { width: 40, textAlign: 'right' },
  colUnit:  { width: 34, textAlign: 'center' },
  colPrice: { width: 64, textAlign: 'right' },
  colTotal: { width: 70, textAlign: 'right' },

  lineItemName: { fontSize: 9, fontFamily: 'Roboto', color: DARK },
  lineItemDesc: { fontSize: 7.5, color: BLUE, marginTop: 2, lineHeight: 1.4 },
  lineVal: { fontSize: 9, color: MID },

  totalLabel: { flex: 1, textAlign: 'right', paddingRight: 8, fontSize: 9, fontFamily: 'Roboto', color: DARK },
  totalCurrency: { width: 30, textAlign: 'right', fontSize: 9, fontFamily: 'Roboto', color: MUTED },
  totalValue: { width: 70, textAlign: 'right', fontSize: 11, fontFamily: 'Roboto', color: DARK },

  // ── Notes ────────────────────────────────────────────────────────────────────
  notesSection: { marginTop: 14 },
  notesLabel: { fontSize: 7, fontFamily: 'Roboto', color: MUTED, marginBottom: 3 },
  notesText: { fontSize: 8.5, color: DARK, lineHeight: 1.6 },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute', bottom: 18, left: 40, right: 40,
    borderTopWidth: 1, borderTopColor: BORDER, borderTopStyle: 'solid',
    paddingTop: 7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  footerText: { fontSize: 7, color: MUTED, lineHeight: 1.5 },
  footerBold: { fontSize: 7, fontFamily: 'Roboto', color: MID },
  footerPage: { fontSize: 7.5, color: MUTED },
})

function fmtDate(d: string | null) {
  if (!d) return '—'
  try { return format(new Date(d), 'dd.MM.yyyy') } catch { return d }
}

function fmtNum(n: number) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function addrLines(obj: {
  address_street?: string | null; address_city?: string | null
  address_postal_code?: string | null; address_country?: string | null
}): string[] {
  return [
    obj.address_street,
    [obj.address_postal_code, obj.address_city].filter(Boolean).join(' '),
    obj.address_country,
  ].filter((l): l is string => !!l)
}

export default function PODocument({ data, lang = 'sl' }: { data: PODocData; lang?: 'en' | 'sl' }) {
  const { company, supplier, location, lines } = data
  const L = PDF_LABELS[lang]

  // Terms — only show fields that have values
  const termFields = [
    { label: L.paymentTerms, value: data.payment_terms },
    ...(data.incoterm ? [{ label: L.incoterm, value: data.incoterm }] : []),
    ...(data.supplier_quote_ref ? [{ label: L.quoteRef, value: data.supplier_quote_ref }] : []),
  ]

  return (
    <Document title={`${data.po_number} — ${supplier.name}`}>
      <Page size="A4" style={s.page}>

        {/* ── 1. Top: logo + title ── */}
        <View style={s.topRow}>
          <View />
          <View style={s.titleBlock}>
            <Text style={s.titleText}>{L.title}</Text>
            <Text style={s.poNumber}>{data.po_number}</Text>
            <View style={s.datesRow}>
              <View style={s.dateBlock}>
                <Text style={s.dateLabel}>{L.orderDate}</Text>
                <Text style={s.dateValue}>{fmtDate(data.created_at)}</Text>
              </View>
              <View style={s.dateBlock}>
                <Text style={s.dateLabel}>{L.desiredDelivery}</Text>
                <Text style={s.dateValue}>{fmtDate(data.expected_delivery_date)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 2. Our company ── */}
        <View style={s.companyBox}>
          <Text style={s.companyName}>{company.name}</Text>
          {company.tax_id ? <Text style={s.companyLine}>{L.vat}: {company.tax_id}</Text> : null}
          {addrLines(company).map((l, i) => <Text key={i} style={s.companyLine}>{l}</Text>)}
          {company.email ? <Text style={s.companyLine}>{company.email}</Text> : null}
          {company.phone ? <Text style={s.companyLine}>{company.phone}</Text> : null}
        </View>

        {/* ── 3. Supplier + Delivery ── */}
        <View style={s.addressRow}>
          <View style={s.addressBox}>
            <Text style={s.boxLabel}>{L.supplier}</Text>
            <Text style={s.addressName}>{supplier.name}</Text>
            {supplier.vat_number ? <Text style={s.addressLine}>{L.vat}: {supplier.vat_number}</Text> : null}
            {supplier.contact_name ? <Text style={s.addressLine}>{supplier.contact_name}</Text> : null}
            {supplier.email ? <Text style={s.addressLine}>{supplier.email}</Text> : null}
            {supplier.phone ? <Text style={s.addressLine}>{supplier.phone}</Text> : null}
            {addrLines(supplier).map((l, i) => <Text key={i} style={s.addressLine}>{l}</Text>)}
          </View>
          <View style={s.addressBox}>
            <Text style={s.boxLabel}>{L.deliveryAddress}</Text>
            <Text style={s.addressName}>{location.name}</Text>
            {addrLines(location).map((l, i) => <Text key={i} style={s.addressLine}>{l}</Text>)}
          </View>
        </View>

        {/* ── 4. Payment terms / Incoterm / Quote ref ── */}
        {termFields.length > 0 && (
          <View style={s.termsRow}>
            {termFields.map((f, i) => (
              <View key={i} style={i < termFields.length - 1 ? s.termCell : s.termCellLast}>
                <Text style={s.termLabel}>{f.label}</Text>
                <Text style={s.termValue}>{f.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── 5. Line items ── */}
        <View style={s.tableHead}>
          <Text style={[s.tableHeadText, s.colPos]}>{L.pos}</Text>
          <Text style={[s.tableHeadText, {width:52}]}>{L.code}</Text>
          <Text style={[s.tableHeadText, s.colDesc]}>{L.desc}</Text>
          <Text style={[s.tableHeadText, s.colQty]}>{L.qty}</Text>
          <Text style={[s.tableHeadText, s.colUnit]}>{L.unit}</Text>
          <Text style={[s.tableHeadText, s.colPrice]}>{L.unitPrice}</Text>
          <Text style={[s.tableHeadText, s.colTotal]}>{L.amount}</Text>
        </View>

        {lines.map((line, i) => (
          <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
            <Text style={[s.colPos, s.lineVal, { fontFamily: 'Roboto' }]}>{line.position}</Text>
            <View style={s.colDesc}>
              <Text style={s.lineItemName}>{line.name}</Text>
              {line.long_description ? <Text style={s.lineItemDesc}>{line.long_description}</Text> : null}
            </View>
            <Text style={[s.colQty, s.lineVal]}>{line.quantity}</Text>
            <Text style={[s.colUnit, s.lineVal]}>{line.unit}</Text>
            <Text style={[s.colPrice, s.lineVal]}>{fmtNum(line.unit_price)}</Text>
            <Text style={[s.colTotal, { fontSize: 9, fontFamily: 'Roboto', color: DARK }]}>
              {fmtNum(line.line_total)}
            </Text>
          </View>
        ))}

        {/* Vmesni znesek (samo ce je popust) */}
        {Number(data.discount_amount ?? 0) > 0 && (
          <View style={{ flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid' }}>
            <Text style={{ ...s.totalLabel, fontFamily: 'Roboto', color: MUTED, fontSize: 8 }}>{L.subtotal}</Text>
            <Text style={{ width: 30, textAlign: 'right', fontSize: 8, color: MUTED }}>{data.currency}</Text>
            <Text style={{ width: 70, textAlign: 'right', fontSize: 9, color: MID }}>{fmtNum(Number(data.total_amount) + Number(data.discount_amount ?? 0))}</Text>
          </View>
        )}
        {/* Popust */}
        {Number(data.discount_amount ?? 0) > 0 && (
          <View style={{ flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid' }}>
            <Text style={{ ...s.totalLabel, fontFamily: 'Roboto', color: MUTED, fontSize: 8 }}>{L.discount}</Text>
            <Text style={{ width: 30, textAlign: 'right', fontSize: 8, color: MUTED }}>{data.currency}</Text>
            <Text style={{ width: 70, textAlign: 'right', fontSize: 9, color: MID, fontFamily: 'Roboto' }}>- {fmtNum(Number(data.discount_amount ?? 0))}</Text>
          </View>
        )}
        {/* Skupaj */}
        <View style={s.tableFoot}>
          <Text style={s.totalLabel}>{L.totalExVat}</Text>
          <Text style={s.totalCurrency}>{data.currency}</Text>
          <Text style={s.totalValue}>{fmtNum(data.total_amount)}</Text>
        </View>

        {/* ── Notes ── */}
        {data.notes ? (
          <View style={s.notesSection}>
            <Text style={s.notesLabel}>{L.note}</Text>
            <Text style={s.notesText}>{data.notes}</Text>
          </View>
        ) : null}


        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <View>
            <Text style={s.footerBold}>{company.name}</Text>
            {addrLines(company).length > 0
              ? <Text style={s.footerText}>{addrLines(company).join(', ')}</Text>
              : null}
            {(company.bank_name || company.bank_iban) ? (
              <Text style={s.footerText}>
                {company.bank_name ? `${L.bank}: ${company.bank_name}` : ''}
                {company.bank_name && company.bank_iban ? '   ' : ''}
                {company.bank_iban ? `IBAN: ${company.bank_iban}` : ''}
              </Text>
            ) : null}
          </View>
          <Text
            style={s.footerPage}
            render={({ pageNumber, totalPages }) => L.pageOf(pageNumber, totalPages)}
            fixed
          />
        </View>

      </Page>
    </Document>
  )
}
