import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'
import { cn } from '../../lib/cn'

export type ToastType = 'success' | 'error'

export interface ToastMessage {
  id: number
  type: ToastType
  message: string
}

let listeners: ((t: ToastMessage) => void)[] = []
let counter = 0

export function toast(message: string, type: ToastType = 'success') {
  const t = { id: ++counter, type, message }
  listeners.forEach(l => l(t))
}
toast.success = (message: string) => toast(message, 'success')
toast.error = (message: string) => toast(message, 'error')

export function Toaster() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const handler = (t: ToastMessage) => {
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500)
    }
    listeners.push(handler)
    return () => { listeners = listeners.filter(l => l !== handler) }
  }, [])

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-in slide-in-from-bottom-2',
            t.type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white',
          )}
        >
          {t.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            : <XCircle className="w-4 h-4 text-red-200 shrink-0" />
          }
          {t.message}
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="ml-2 opacity-60 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
