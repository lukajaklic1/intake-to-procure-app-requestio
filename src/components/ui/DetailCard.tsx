import type { ReactNode } from 'react'

/** A titled box of a detail page. */
export function Card({ title, children, className = '', action, tall }: { title: string; children: ReactNode; className?: string; action?: ReactNode; tall?: boolean }) {
  return (
    <section className={`bg-white rounded-lg border border-field ${className}`}>
      <div className={`px-5 py-3 border-b border-field flex items-center justify-between gap-3 ${tall ? 'min-h-[60px]' : 'min-h-[49px]'}`}>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Small grey label above a value. */
export function Field({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] font-medium text-ink2 mb-1">{label}</p>
      <div className="text-sm text-ink">{children || '-'}</div>
    </div>
  )
}
