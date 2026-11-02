import { CircleAlert, CircleCheck, TriangleAlert, Package, Hash, Coins, Minus } from 'lucide-react'
import { useLanguage } from '../../hooks/useLanguage'
import { Card } from '../ui/DetailCard'
import GridHead from '../ui/GridHead'
import { compareWithOrder, type InvLine, type MatchInput, type MatchResult } from '../../lib/invoiceMatching'
import { MATCH_BADGE } from '../../lib/invoices'

const fmtQty = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n)

interface Props {
  result: MatchResult
  hasPo: boolean
  input: Pick<MatchInput, 'lines' | 'poLines' | 'received' | 'invoicedElsewhere'>
  money: (n: number) => string
  orderTotal?: number | null       // the order without VAT
  invoiceSubtotal: number          // this invoice without VAT
  tall?: boolean
}

/** The invoice against the purchase order and the receipts: the verdict, the order lines with what is ordered, received and already invoiced,
 *  and everything that does not fit. */
export default function MatchPanel({ result, hasPo, input, money, orderTotal, invoiceSubtotal, tall }: Props) {
  const { t } = useLanguage()
  const s = t.invoices
  const { rows, offOrder } = hasPo ? compareWithOrder(input) : { rows: [], offOrder: [] as InvLine[] }
  const general = result.issues.filter(i => i.lineIndex == null)

  return (
    <Card tall={tall} title={s.matching} className="overflow-hidden"
      action={<span className="inline-flex items-center gap-3"><span className="text-[13px] text-ink2 hidden sm:inline">{s.basis[result.basis]}</span><span className={`badge ${MATCH_BADGE[result.status]}`}>{s.matchSt[result.status]}</span></span>}>
      {hasPo && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-grid w-full text-sm min-w-[720px] [&_thead]:border-b [&_thead]:border-line">
            <GridHead cols={[[s.orderLine, Package], [s.ordered, Hash, 'right'], [s.received, Hash, 'right'], [s.invoicedBefore, Hash, 'right'], [s.thisInvoice, Hash, 'right'], [s.remaining, Hash, 'right'], [s.priceCompare, Coins, 'right'], ['']]} />
            <tbody className="divide-y divide-field">
              {rows.map(r => (
                <tr key={r.poLine.id} className={r.state === 'untouched' ? 'text-ink2' : ''}>
                  <td className="px-4 py-3 max-w-[260px] truncate font-medium text-ink" title={r.poLine.name}>{r.poLine.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink2">{fmtQty(r.ordered)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink2">{fmtQty(r.received)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink2">{r.invoicedBefore > 0 ? fmtQty(r.invoicedBefore) : '-'}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.state === 'untouched' ? 'text-ink2' : 'text-ink font-medium'}`}>{r.onThisInvoice > 0 ? fmtQty(r.onThisInvoice) : '-'}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.remaining < -0.0005 ? 'text-danger font-medium' : 'text-ink2'}`}>{fmtQty(r.remaining)}</td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {r.priceOnInvoice == null ? <span className="text-ink2">-</span> : (
                      <span className={r.state === 'price' ? 'text-danger font-medium' : 'text-ink2'}>
                        {money(r.poLine.unit_price)} → {money(r.priceOnInvoice)}
                        {r.priceDiffPct != null && Math.abs(r.priceDiffPct) >= 0.005 && <span className="ml-1.5 text-xs">({r.priceDiffPct > 0 ? '+' : ''}{r.priceDiffPct.toFixed(1).replace('.', ',')} %)</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 w-10">
                    {r.state === 'ok' && <CircleCheck className="w-4 h-4 text-success" strokeWidth={1.75} aria-label={s.stateOk} />}
                    {(r.state === 'over' || r.state === 'price') && <CircleAlert className="w-4 h-4 text-danger" strokeWidth={1.75} aria-label={r.state === 'over' ? s.stateOver : s.statePrice} />}
                    {r.state === 'untouched' && <Minus className="w-4 h-4 text-icon" strokeWidth={1.75} aria-label={s.stateUntouched} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-5 flex flex-col gap-3">
        {offOrder.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
            <span>{s.issue.not_on_po}: {offOrder.map(l => l.name || '-').join(', ')}</span>
          </div>
        )}
        {general.length === 0 && offOrder.length === 0 && result.status !== 'mismatch' ? (
          <p className="inline-flex items-center gap-2 text-sm text-ink"><CircleCheck className="w-4 h-4 text-success" strokeWidth={1.75} />{hasPo ? s.noMatchIssues : s.issue.no_po}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {general.map((i, k) => (
              <li key={k} className={`flex items-start gap-2 ${i.severity === 'error' ? 'text-danger' : 'text-warn'}`}>
                {i.severity === 'error' ? <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} /> : <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />}
                <span>{s.issue[i.code]}{i.code === 'total' ? ` (${money(i.expected ?? 0)} ≠ ${money(i.actual ?? 0)})` : ''}</span>
              </li>
            ))}
            {result.issues.filter(i => i.lineIndex != null).length > 0 && general.length === 0 && offOrder.length === 0 && (
              <li className="flex items-start gap-2 text-danger"><CircleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} /><span>{s.matchSt.mismatch}</span></li>
            )}
          </ul>
        )}
        {hasPo && orderTotal != null && (
          <p className="text-[13px] text-ink2 pt-1 border-t border-field">
            {s.orderTotalExVat}: <span className="text-ink tabular-nums">{money(orderTotal)}</span> · {s.thisInvoiceExVat}: <span className="text-ink tabular-nums">{money(invoiceSubtotal)}</span>
          </p>
        )}
      </div>
    </Card>
  )
}
