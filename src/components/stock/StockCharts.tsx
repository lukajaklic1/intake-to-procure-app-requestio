import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { useLanguage } from '../../hooks/useLanguage'

interface Move { movement_type: string; quantity: number; created_at: string }

const WEEKS = 12
const HEIGHT = 230
const M = { left: 38, right: 14, top: 24, bottom: 28 }
const fmt = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(n)

/** Round axis: a clean top value and a few ticks from the bottom to it. */
function niceAxis(hi: number, count = 4) {
  const raw = Math.max(hi, 1e-9) / count
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(v => v >= raw) ?? raw
  const max = Math.max(Math.ceil(hi / step) * step, step)
  const ticks: number[] = []
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return { max, ticks }
}

/** Width of the element, so the text in the chart stays sharp (no stretching). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(e => setW(Math.floor(e[0].contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return { ref, w }
}

/** A bar with a rounded top end and a square foot. */
const barPath = (x: number, y: number, w: number, h: number, r = 4) => {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}

/** Usage per week of the last 12 weeks, the quantity written above every bar. */
export default function StockCharts({ moves, unit }: { moves: Move[]; unit: (n: number) => string }) {
  const { t } = useLanguage()
  const s = t.stock
  const { ref, w } = useWidth()
  const [hover, setHover] = useState<number | null>(null)

  const data = useMemo(() => {
    const first = startOfWeek(addDays(new Date(), -7 * (WEEKS - 1)), { weekStartsOn: 1 })
    return Array.from({ length: WEEKS }, (_, i) => {
      const start = addDays(first, i * 7)
      const used = moves.filter(m => (m.movement_type === 'usage' || m.movement_type === 'waste')
        && new Date(m.created_at) >= start && new Date(m.created_at) < addDays(start, 7)).reduce((n, m) => n - Number(m.quantity), 0)
      return { start, used: Math.max(0, used) }
    })
  }, [moves])

  const max = Math.max(...data.map(d => d.used), 0)
  const axis = niceAxis(max || 1)
  const innerW = w - M.left - M.right
  const innerH = HEIGHT - M.top - M.bottom
  const y = (v: number) => M.top + innerH - (v / axis.max) * innerH
  const band = innerW / WEEKS
  const barW = Math.min(24, band * 0.6)
  const xAt = (i: number) => M.left + band * i + band / 2
  const labelEvery = w < 420 ? 3 : w < 640 ? 2 : 1

  return (
    <div className="p-5">
      <div ref={ref} className="relative w-full" style={{ height: HEIGHT }}>
        {w > 0 && (
          <>
            <svg width={w} height={HEIGHT} className="block overflow-visible">
              {axis.ticks.map(v => (
                <g key={v}>
                  <line x1={M.left} x2={w - M.right} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--color-line)' }} strokeWidth={1} />
                  <text x={M.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} style={{ fill: 'var(--color-ink2)' }}>{fmt(v)}</text>
                </g>
              ))}
              {data.map((d, i) => (
                <g key={i}>
                  {d.used > 0 && (
                    <>
                      <path d={barPath(xAt(i) - barW / 2, y(d.used), barW, y(0) - y(d.used))} style={{ fill: 'var(--color-accent)', opacity: hover == null || hover === i ? 1 : 0.45 }} />
                      <text x={xAt(i)} y={y(d.used) - 6} textAnchor="middle" fontSize={12} fontWeight={500} style={{ fill: 'var(--color-ink)' }}>{fmt(d.used)}</text>
                    </>
                  )}
                  {i % labelEvery === 0 && (
                    <text x={xAt(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={11} style={{ fill: 'var(--color-ink2)' }}>{format(d.start, 'd.M.')}</text>
                  )}
                  <rect x={M.left + band * i} y={M.top} width={band} height={innerH} fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseMove={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                </g>
              ))}
            </svg>
            {max === 0 && <p className="absolute inset-x-0 text-center text-sm text-ink2" style={{ top: M.top + innerH / 2 - 10 }}>{s.noUsageYet}</p>}
            {hover != null && (
              <div role="tooltip" className="pointer-events-none absolute z-10 rounded-lg bg-ink px-3 py-2 text-[13px] leading-5 text-white shadow-[0_8px_30px_rgba(16,17,18,0.25)] whitespace-nowrap"
                style={{ left: xAt(hover), top: Math.max(0, y(data[hover].used) - 10), transform: `translate(${xAt(hover) > w / 2 ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
                <span className="text-white/70">{s.weekFrom.replace('{d}', format(data[hover].start, 'dd.MM.yyyy'))}</span><br />
                {s.usage}: <span className="font-medium">{fmt(data[hover].used)} {unit(data[hover].used)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
