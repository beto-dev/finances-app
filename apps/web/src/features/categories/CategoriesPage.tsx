import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Sparkles, Pencil, Trash2 } from 'lucide-react'
import client from '../../shared/api/client'
import { Category } from '../../shared/types'
import Toast from '../../shared/components/Toast'
import Spinner from '../../shared/components/Spinner'
import { useBudgets, useBudgetSuggestions, useUpsertBudget, useDeleteBudget } from './useBudgets'
import BudgetSuggestionsModal from './BudgetSuggestionsModal'

function BudgetInput({ categoryId, currentAmount }: { categoryId: string; currentAmount: number | undefined }) {
  const [value, setValue] = useState(currentAmount != null ? String(Math.round(currentAmount)) : '')
  const upsert = useUpsertBudget()
  const del = useDeleteBudget()

  const save = () => {
    const num = Number(value.replace(/\D/g, ''))
    if (!value.trim() || num === 0) {
      if (currentAmount != null) del.mutate(categoryId)
    } else if (num !== currentAmount) {
      upsert.mutate({ categoryId, amount: num })
    }
  }

  return (
    <div className="flex items-center gap-1 bg-[#FAFAFA] border border-[#E4E4E7] rounded-xl px-3 py-2 min-h-[40px] focus-within:ring-2 focus-within:ring-brand-600 focus-within:border-transparent transition-shadow shrink-0">
      <span className="text-xs text-[#A1A1AA] font-semibold">$</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="Sin límite"
        className="w-20 bg-transparent text-sm text-right font-semibold text-[#18181B] placeholder-[#D4D4D8] placeholder:font-normal focus:outline-none"
      />
    </div>
  )
}

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
  const { data: budgets = {} } = useBudgets()
  const { data: budgetSuggestions } = useBudgetSuggestions()
  const [showSuggestions, setShowSuggestions] = useState(false)
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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-[#18181B] mb-5">Categorías</h1>

      {!showNew && !editId && (
        <div className="flex gap-2 mb-5">
          {budgetSuggestions && budgetSuggestions.income_avg > 0 && (
            <button
              onClick={() => setShowSuggestions(true)}
              className="btn-secondary flex-1 text-xs sm:text-sm flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              Sugerir límites
            </button>
          )}
          <button
            onClick={() => { setShowNew(true); setForm({ name: '', color: '#3b82f6' }); setFormError(null) }}
            className="btn-primary flex-1 text-xs sm:text-sm flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4 shrink-0" />
            Nueva categoría
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="space-y-6">
          {/* New category form */}
          {showNew && (
            <div className="card">
              <h2 className="text-sm font-bold text-[#27272A] mb-3">Nueva categoría</h2>
              <CategoryForm form={form} onChange={(f) => { setForm(f); setFormError(null) }} error={formError} />
              <div className="flex gap-2 mt-4">
                <button onClick={handleCreate} disabled={create.isPending} className="btn-primary flex-1 text-sm">
                  {create.isPending ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={cancelForm} className="btn-secondary flex-1 text-sm">Cancelar</button>
              </div>
            </div>
          )}

          {/* Custom categories */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h2 className="text-sm font-bold text-[#27272A]">Categorías personalizadas</h2>
              {custom.length > 0 && <span className="text-xs text-[#A1A1AA] font-semibold">{custom.length}</span>}
            </div>
            {custom.length === 0 && !showNew ? (
              <p className="text-sm text-[#A1A1AA] text-center py-6">Sin categorías personalizadas aún.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {custom.map((cat) => (
                  editId === cat.id ? (
                    <div key={cat.id} className="card md:col-span-2">
                      <CategoryForm form={form} onChange={(f) => { setForm(f); setFormError(null) }} error={formError} />
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => handleUpdate(cat.id)} disabled={update.isPending} className="btn-primary flex-1 text-sm">
                          {update.isPending ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button onClick={cancelForm} className="btn-secondary flex-1 text-sm">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div key={cat.id} className="bg-white border border-[#ECECEF] rounded-2xl p-3.5 flex flex-col gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#6b7280' }} />
                        <span className="text-sm font-semibold text-[#18181B] truncate flex-1">{cat.name}</span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => startEdit(cat)}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-brand-600 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cat.id, cat.name)}
                            disabled={del.isPending}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-red-50 hover:text-red-500 disabled:opacity-50 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 pl-6">
                        <span className="text-xs text-[#A1A1AA] font-medium">Límite mensual</span>
                        <BudgetInput categoryId={cat.id} currentAmount={budgets[cat.id]} />
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>

          {/* System categories (read-only) */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h2 className="text-sm font-bold text-[#27272A]">Categorías del sistema</h2>
              <span className="text-xs text-[#A1A1AA] font-semibold">{system.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {system.map((cat) => (
                <div key={cat.id} className="bg-white border border-[#ECECEF] rounded-2xl p-3.5 flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#6b7280' }} />
                    <span className="text-sm font-semibold text-[#3F3F46] truncate flex-1">{cat.name}</span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#F4F4F5] text-[#A1A1AA] shrink-0">Sistema</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-6">
                    <span className="text-xs text-[#A1A1AA] font-medium">Límite mensual</span>
                    <BudgetInput categoryId={cat.id} currentAmount={budgets[cat.id]} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {showSuggestions && budgetSuggestions && budgetSuggestions.income_avg > 0 && (
        <BudgetSuggestionsModal
          suggestions={budgetSuggestions}
          categories={categories}
          onClose={() => setShowSuggestions(false)}
          onApplied={() => { setShowSuggestions(false); showToast('Límites aplicados') }}
        />
      )}
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
            className={`w-11 h-11 rounded-xl cursor-pointer border-2 p-0.5 shrink-0 ${error?.includes('color') ? 'border-red-400' : 'border-[#E4E4E7]'}`}
          />
          <span className="text-sm text-[#71717A] font-mono">{form.color}</span>
          <span className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: form.color }} />
        </div>
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
    </div>
  )
}
