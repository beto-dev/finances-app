import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCategories } from '../charges/useCharges'
import client from '../../shared/api/client'
import Toast from '../../shared/components/Toast'
import Spinner from '../../shared/components/Spinner'

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

export default function QuickExpensePage() {
  const today = new Date().toISOString().split('T')[0]

  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(today)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const { data: categories = [] } = useCategories()
  const queryClient = useQueryClient()
  const mutation = useCreateManualCharge()

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const numAmount = parseFloat(amount)
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
          queryClient.invalidateQueries({ queryKey: ['charges'] })
          setAmount('')
          setDescription('')
          setCategoryId('')
          setDate(today)
          setToast({ message: 'Gasto registrado correctamente', type: 'success' })
        },
        onError: () => {
          setToast({ message: 'Error al registrar el gasto', type: 'error' })
        },
      }
    )
  }

  const canSubmit = parseFloat(amount) > 0 && description.trim().length > 0

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nuevo Gasto</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Amount — large display */}
        <div className="card p-6 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-medium mb-4">Monto (CLP)</p>
          <div className="flex items-center justify-center gap-1">
            <span className={`text-4xl font-light transition-colors ${amount ? 'text-gray-400' : 'text-gray-200'}`}>$</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-5xl font-bold text-gray-900 bg-transparent border-none outline-none w-full text-center focus:ring-0 placeholder-gray-300"
              min="1"
              step="1"
              autoFocus
            />
          </div>
          <div className="mt-4 h-px bg-gray-200" />
        </div>

        <div className="card p-4 space-y-4">
          <div>
            <label className="label">Descripción</label>
            <input
              type="text"
              placeholder="¿En qué gastaste?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label className="label">Categoría</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input"
            >
              <option value="">Sin categoría</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary w-full py-4 text-lg"
          disabled={!canSubmit || mutation.isPending}
        >
          {mutation.isPending ? <Spinner size="sm" /> : 'Registrar Gasto'}
        </button>
      </form>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
