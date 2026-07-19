import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, PencilLine, CalendarDays, Wallet } from 'lucide-react'
import { useCategories } from '../charges/useCharges'
import client from '../../shared/api/client'
import Toast from '../../shared/components/Toast'
import Spinner from '../../shared/components/Spinner'
import CategorySheet from '../../shared/components/CategorySheet'

function useCreateManualCharge() {
  return useMutation({
    mutationFn: (data: {
      amount: number
      description: string
      category_id: string | null
      date: string
      currency: string
    }) => client.post('/api/charges/manual', data).then((r) => r.data),
  })
}

// ── Success overlay ───────────────────────────────────────────────────────────
function SuccessOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-5">
        <div className={`w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center transition-all duration-500 ease-out ${
          visible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
        }`}>
          <Check className="w-12 h-12 text-white" strokeWidth={2.5} />
        </div>
        <p className={`text-xl font-bold text-[#18181B] transition-all duration-300 delay-200 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}>
          ¡Gasto registrado!
        </p>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function QuickExpensePage() {
  const today = new Date().toISOString().split('T')[0]

  const [rawAmount, setRawAmount] = useState('')   // digits only: "1500000"
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [catSheetOpen, setCatSheetOpen] = useState(false)
  const [date, setDate] = useState(today)
  const [showSuccess, setShowSuccess] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const { data: categories = [] } = useCategories()
  const queryClient = useQueryClient()
  const mutation = useCreateManualCharge()

  // Live formatting: "1500000" → "1.500.000"
  const displayAmount = rawAmount
    ? new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Number(rawAmount))
    : ''

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '')
    setRawAmount(digits)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const numAmount = Number(rawAmount)
    if (!numAmount || numAmount <= 0 || !description.trim()) return

    mutation.mutate(
      {
        amount: numAmount,
        description: description.trim(),
        category_id: categoryId || null,
        date,
        currency: 'CLP',
      },
      {
        onSuccess: () => {
          setShowSuccess(true)
          setTimeout(() => {
            setShowSuccess(false)
            queryClient.invalidateQueries({ queryKey: ['charges'] })
            setRawAmount('')
            setDescription('')
            setCategoryId('')
            setDate(today)
          }, 1400)
        },
        onError: () => {
          setToast({ message: 'Error al registrar el gasto', type: 'error' })
        },
      }
    )
  }

  const canSubmit = Number(rawAmount) > 0 && description.trim().length > 0
  const currentCat = categories.find((c) => c.id === categoryId)

  return (
    <div className="max-w-md mx-auto">
      {showSuccess && <SuccessOverlay />}

      <div className="flex items-center gap-2.5 mb-5">
        <span className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
          <Wallet className="w-[18px] h-[18px] text-orange-500" />
        </span>
        <h1 className="text-2xl font-bold text-[#18181B]">Nuevo Gasto</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Amount — live formatted display */}
        <div className="card p-6 text-center">
          <p className="text-[10.5px] font-bold text-[#A1A1AA] uppercase tracking-widest mb-4">Monto (CLP)</p>
          <div className="flex items-center justify-center gap-1">
            <span className={`text-4xl font-light transition-colors ${rawAmount ? 'text-[#A1A1AA]' : 'text-[#D4D4D8]'}`}>$</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={displayAmount}
              onChange={handleAmountChange}
              className="text-5xl font-bold text-[#18181B] bg-transparent border-none outline-none w-full text-center focus:ring-0 placeholder-[#D4D4D8]"
              autoFocus
            />
          </div>
          <div className="mt-4 h-px bg-[#E4E4E7]" />
        </div>

        <div className="card p-4 space-y-4">
          <div>
            <label className="label">Descripción</label>
            <div className="relative">
              <PencilLine className="w-4 h-4 text-[#A1A1AA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="¿En qué gastaste?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input pl-10"
                required
              />
            </div>
          </div>

          <div>
            <label className="label">Categoría</label>
            <button
              type="button"
              onClick={() => setCatSheetOpen(true)}
              className="input flex items-center gap-2.5 text-left"
            >
              {currentCat ? (
                <>
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ backgroundColor: currentCat.color ?? '#9ca3af' }}
                  >
                    {currentCat.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 text-[#18181B] truncate">{currentCat.name}</span>
                </>
              ) : (
                <>
                  <span className="w-6 h-6 rounded-full bg-[#F4F4F5] shrink-0" />
                  <span className="flex-1 text-[#A1A1AA]">Sin categoría</span>
                </>
              )}
              <ChevronDown className="w-4 h-4 shrink-0 text-[#A1A1AA]" />
            </button>
          </div>

          <div>
            <label className="label">Fecha</label>
            <div className="relative">
              <CalendarDays className="w-4 h-4 text-[#A1A1AA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary w-full py-4 text-base gap-2"
          disabled={!canSubmit || mutation.isPending}
        >
          {mutation.isPending ? <Spinner size="sm" /> : (
            <>
              <Check className="w-5 h-5" />
              Registrar Gasto
            </>
          )}
        </button>
      </form>

      {catSheetOpen && (
        <CategorySheet
          categories={categories}
          value={categoryId || null}
          onChange={(id) => setCategoryId(id)}
          onClose={() => setCatSheetOpen(false)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
