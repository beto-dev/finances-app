import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { Category } from '../../shared/types'
import Toast from '../../shared/components/Toast'
import Spinner from '../../shared/components/Spinner'

function useCategories() {
  return useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => (await client.get('/api/charges/categories')).data,
  })
}

function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; color: string }) => client.post('/api/charges/categories', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color: string }) =>
      client.patch(`/api/charges/categories/${id}`, { name, color }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.delete(`/api/charges/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

interface FormState { name: string; color: string }

function validate(form: FormState, categories: Category[], excludeId?: string): string | null {
  const name = form.name.trim().toLowerCase()
  const color = form.color.toLowerCase()
  if (!name) return 'El nombre es obligatorio'
  const others = categories.filter((c) => c.id !== excludeId)
  if (others.some((c) => c.name.toLowerCase() === name))
    return 'Ya existe una categoría con ese nombre'
  if (others.some((c) => (c.color ?? '').toLowerCase() === color))
    return 'Ya existe una categoría con ese color'
  return null
}

export default function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategories()
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const del = useDeleteCategory()
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ name: '', color: '#3b82f6' })
  const [showNew, setShowNew] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ message, type })

  const handleCreate = async () => {
    const err = validate(form, categories)
    if (err) { setFormError(err); return }
    setFormError(null)
    try {
      await create.mutateAsync({ name: form.name.trim(), color: form.color })
      setForm({ name: '', color: '#3b82f6' })
      setShowNew(false)
      showToast('Categoría creada')
    } catch {
      showToast('Error al crear categoría', 'error')
    }
  }

  const handleUpdate = async (id: string) => {
    const err = validate(form, categories, id)
    if (err) { setFormError(err); return }
    setFormError(null)
    try {
      await update.mutateAsync({ id, name: form.name.trim(), color: form.color })
      setEditId(null)
      showToast('Categoría actualizada')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Error al actualizar'
      showToast(msg, 'error')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la categoría "${name}"? Los gastos asociados quedarán sin categoría.`)) return
    try {
      await del.mutateAsync(id)
      showToast('Categoría eliminada')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Error al eliminar'
      showToast(msg, 'error')
    }
  }

  const startEdit = (cat: Category) => {
    setEditId(cat.id)
    setForm({ name: cat.name, color: cat.color ?? '#6b7280' })
    setFormError(null)
    setShowNew(false)
  }

  const cancelForm = () => {
    setShowNew(false)
    setEditId(null)
    setFormError(null)
  }

  const system = categories.filter((c) => c.is_system)
  const custom = categories.filter((c) => !c.is_system)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categorías</h1>
        {!showNew && !editId && (
          <button
            onClick={() => { setShowNew(true); setForm({ name: '', color: '#3b82f6' }); setFormError(null) }}
            className="btn-primary text-sm"
          >
            + Nueva categoría
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="space-y-6">
          {/* New category form */}
          {showNew && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Nueva categoría</h2>
              <CategoryForm form={form} onChange={(f) => { setForm(f); setFormError(null) }} error={formError} />
              <div className="flex gap-2 mt-4">
                <button onClick={handleCreate} disabled={create.isPending} className="btn-primary text-sm">
                  {create.isPending ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={cancelForm} className="btn-secondary text-sm">Cancelar</button>
              </div>
            </div>
          )}

          {/* Custom categories */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Categorías personalizadas</h2>
            {custom.length === 0 && !showNew ? (
              <p className="text-sm text-gray-400 py-2">Sin categorías personalizadas aún.</p>
            ) : (
              <ul className="space-y-2">
                {custom.map((cat) => (
                  <li key={cat.id}>
                    {editId === cat.id ? (
                      <div className="space-y-3 py-1">
                        <CategoryForm form={form} onChange={(f) => { setForm(f); setFormError(null) }} error={formError} />
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdate(cat.id)} disabled={update.isPending} className="btn-primary text-sm">
                            {update.isPending ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button onClick={cancelForm} className="btn-secondary text-sm">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#6b7280' }} />
                          <span className="text-sm text-gray-800">{cat.name}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(cat)} className="text-xs text-gray-400 hover:text-gray-600">Editar</button>
                          <button onClick={() => handleDelete(cat.id, cat.name)} disabled={del.isPending} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* System categories (read-only) */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Categorías del sistema</h2>
            <ul className="space-y-2">
              {system.map((cat) => (
                <li key={cat.id} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#6b7280' }} />
                  <span className="text-sm text-gray-600">{cat.name}</span>
                  <span className="text-xs text-gray-300 ml-auto">Sistema</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

function CategoryForm({
  form,
  onChange,
  error,
}: {
  form: FormState
  onChange: (f: FormState) => void
  error: string | null
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Nombre</label>
        <input
          type="text"
          className={`input ${error?.includes('nombre') ? 'border-red-400' : ''}`}
          placeholder="ej. Mascotas, Gimnasio..."
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Color</label>
        <div className="flex items-center gap-3 mt-1">
          <input
            type="color"
            value={form.color}
            onChange={(e) => onChange({ ...form, color: e.target.value })}
            className={`w-10 h-10 rounded-lg cursor-pointer border-2 p-0.5 ${error?.includes('color') ? 'border-red-400' : 'border-gray-200'}`}
          />
          <span className="text-sm text-gray-500 font-mono">{form.color}</span>
          <span className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: form.color }} />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
