import { useState, useRef, useEffect } from 'react'
import Spinner from './Spinner'

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6',
  '#ec4899', '#6b7280', '#0ea5e9', '#a16207',
]

interface Props {
  onConfirm: (name: string, color: string) => Promise<void>
  onClose: () => void
  isPending: boolean
}

export default function NewCategoryModal({ onConfirm, onClose, isPending }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[5])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    try {
      await onConfirm(name.trim(), color)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'No se pudo crear la categoría')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Nueva categoría</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label text-xs">Nombre</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Mascotas, Educación..."
              className="input"
              required
            />
          </div>
          <div>
            <label className="label text-xs">Color</label>
            <div className="grid grid-cols-6 gap-2 mt-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-9 h-9 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-offset-2 ring-gray-900 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isPending}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5"
            >
              {isPending ? <Spinner size="sm" /> : 'Crear y aplicar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
