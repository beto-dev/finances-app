import { useState } from 'react'
import { Landmark, CreditCard, Pencil, Trash2, Plus, Check, X } from 'lucide-react'
import { useCharges, useUpdateCuotaNumero } from '../charges/useCharges'
import { useCredits, useCreateCredit, useUpdateCredit, useDeleteCredit } from './useCredits'
import Spinner from '../../shared/components/Spinner'
import type { Credit } from '../../shared/types'
import { groupCuotas } from '../../shared/utils/cuotas'

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = Math.min(100, Math.round((value / total) * 100))
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-[#A1A1AA] shrink-0 w-9 text-right">{pct}%</span>
    </div>
  )
}

const EMPTY_FORM = { description: '', bank: '', cuota_monto: '', cuota_numero: '1', cuota_total: '' }

function CreditFormRow({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: typeof EMPTY_FORM
  onSave: (v: typeof EMPTY_FORM) => void
  onCancel: () => void
  saving: boolean
}) {
  const [v, setV] = useState(initial)
  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }))
  const valid = v.description.trim() && Number(v.cuota_monto) > 0 && Number(v.cuota_total) >= Number(v.cuota_numero) && Number(v.cuota_numero) >= 1
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Descripción</label>
        <input className="input" placeholder="ej: Crédito de consumo BCI" value={v.description} onChange={set('description')} />
      </div>
      <div>
        <label className="label">Banco <span className="text-[#D4D4D8] font-medium">(opcional)</span></label>
        <input className="input" placeholder="ej: Banco de Chile" value={v.bank} onChange={set('bank')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Dividendo mensual $</label>
          <input className="input" placeholder="$" type="number" min="1" value={v.cuota_monto} onChange={set('cuota_monto')} />
        </div>
        <div>
          <label className="label">Cuota actual</label>
          <input className="input" placeholder="ej: 3" type="number" min="1" value={v.cuota_numero} onChange={set('cuota_numero')} />
        </div>
        <div>
          <label className="label">Total cuotas</label>
          <input className="input" placeholder="ej: 48" type="number" min="1" value={v.cuota_total} onChange={set('cuota_total')} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button className="btn-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="btn-primary" onClick={() => onSave(v)} disabled={!valid || saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl px-[18px] pt-3.5 pb-6 shadow-2xl animate-slide-up max-h-[85%] overflow-y-auto">
        <div className="w-9 h-1 rounded-full bg-[#E4E4E7] mx-auto mb-3.5 shrink-0" />
        <div className="flex items-center justify-between mb-3.5">
          <p className="text-[15px] font-extrabold text-[#18181B]">{title}</p>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#52525B] transition-colors shrink-0" title="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function CuotasPage() {
  const { data: charges, isLoading: chargesLoading } = useCharges()
  const { data: credits = [], isLoading: creditsLoading } = useCredits()
  const createCredit = useCreateCredit()
  const updateCredit = useUpdateCredit()
  const deleteCredit = useDeleteCredit()

  const updateCuotaNumero = useUpdateCuotaNumero()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [correctingId, setCorrectingId] = useState<string | null>(null)
  const [correctingValue, setCorrectingValue] = useState('')

  const groups = groupCuotas(charges)
  const active = groups.filter((g) => g.cuota_numero < g.cuota_total)
  const finished = groups.filter((g) => g.cuota_numero >= g.cuota_total)

  const activeCredits = credits.filter((c) => c.cuota_numero < c.cuota_total)
  const finishedCredits = credits.filter((c) => c.cuota_numero >= c.cuota_total)

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

  const handleCreate = (v: typeof EMPTY_FORM) => {
    createCredit.mutate(
      { description: v.description.trim(), bank: v.bank.trim() || null, cuota_monto: Number(v.cuota_monto), cuota_numero: Number(v.cuota_numero), cuota_total: Number(v.cuota_total) },
      { onSuccess: () => setShowForm(false) },
    )
  }

  const handleUpdate = (credit: Credit, v: typeof EMPTY_FORM) => {
    updateCredit.mutate(
      { id: credit.id, description: v.description.trim(), bank: v.bank.trim() || null, cuota_monto: Number(v.cuota_monto), cuota_numero: Number(v.cuota_numero), cuota_total: Number(v.cuota_total) },
      { onSuccess: () => setEditingId(null) },
    )
  }

  const isLoading = chargesLoading || creditsLoading

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>

  const editingCredit = editingId ? (activeCredits.find((c) => c.id === editingId) ?? null) : null
  const closeSheet = () => { setShowForm(false); setEditingId(null) }

  // Combined summary across active bank credits + active card cuotas (same data rendered below)
  const totalActiveCount = activeCredits.length + active.length
  const totalMonthly = activeCredits.reduce((s, c) => s + c.cuota_monto, 0) + active.reduce((s, g) => s + g.cuota_monto, 0)
  const totalRemaining =
    activeCredits.reduce((s, c) => s + (c.cuota_total - c.cuota_numero) * c.cuota_monto, 0) +
    active.reduce((s, g) => s + (g.cuota_total - g.cuota_numero) * g.cuota_monto, 0)
  const totalOriginal =
    activeCredits.reduce((s, c) => s + c.cuota_total * c.cuota_monto, 0) +
    active.reduce((s, g) => s + g.cuota_total * g.cuota_monto, 0)
  const totalPaidPct = totalOriginal > 0 ? Math.round(((totalOriginal - totalRemaining) / totalOriginal) * 100) : 0

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-[#18181B] mb-5">Cuotas y Créditos</h1>

      {/* ── Combined summary ── */}
      {totalActiveCount > 0 && (
        <div className="rounded-2xl border border-orange-100 bg-orange-50 shadow-sm p-4 mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-sm font-bold text-orange-900">Deuda Total</h2>
              <p className="text-xs text-orange-400 mt-0.5">
                {fmt(totalMonthly)}/mes · {totalActiveCount} {totalActiveCount === 1 ? 'compromiso activo' : 'compromisos activos'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-bold text-orange-600">{fmt(totalRemaining)}</p>
              <p className="text-xs text-orange-400">{totalPaidPct}% pagado</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-white/70 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${totalPaidPct}%` }} />
            </div>
            <span className="text-xs text-orange-400 shrink-0 w-9 text-right">{totalPaidPct}%</span>
          </div>
        </div>
      )}

      {/* ── Créditos bancarios ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#71717A] uppercase tracking-wide flex items-center gap-2">
            Créditos bancarios
            {activeCredits.length > 0 && (
              <span className="text-xs font-semibold text-[#71717A] bg-[#F4F4F5] rounded-full px-2 py-0.5">{activeCredits.length}</span>
            )}
          </h2>
          <button
            className="flex items-center gap-1 text-sm text-brand-600 font-semibold hover:text-brand-700 min-h-[44px] px-1"
            onClick={() => setShowForm(true)}
          >
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>

        {activeCredits.length === 0 ? (
          <div className="card text-center py-8 text-[#A1A1AA]">
            <p className="text-sm">No hay créditos activos.</p>
            <p className="text-xs mt-1">Agrega uno manualmente.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {activeCredits.map((c) => (
              <div key={c.id} className="bg-white border border-[#ECECEF] rounded-2xl p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="w-[38px] h-[38px] rounded-[11px] bg-orange-50 flex items-center justify-center shrink-0">
                    <Landmark className="w-[18px] h-[18px] text-orange-500" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-bold text-[#18181B] truncate uppercase">{c.description}</p>
                    {c.bank && <p className="text-[11.5px] text-[#A1A1AA] truncate">{c.bank}</p>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      className="w-9 h-9 flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-brand-600 transition-colors"
                      onClick={() => setEditingId(c.id)}
                      title="Editar crédito"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      className="w-9 h-9 flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-red-50 hover:text-red-500 transition-colors"
                      onClick={() => deleteCredit.mutate(c.id)}
                      title="Eliminar crédito"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5 mt-2.5 flex-wrap">
                  <span className="text-base font-bold text-orange-600">{fmt((c.cuota_total - c.cuota_numero) * c.cuota_monto)}</span>
                  <span className="text-xs text-[#71717A]">restantes</span>
                  <span className="text-[#E4E4E7] mx-0.5">·</span>
                  <span className="text-xs text-[#71717A]">{c.cuota_total - c.cuota_numero} cuotas</span>
                  <span className="text-[#E4E4E7] mx-0.5">·</span>
                  <span className="text-xs text-[#71717A]">{fmt(c.cuota_monto)}/mes</span>
                </div>
                <ProgressBar value={c.cuota_numero} total={c.cuota_total} />
              </div>
            ))}
          </div>
        )}

        {finishedCredits.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {finishedCredits.map((c) => (
              <div key={c.id} className="bg-white border border-[#ECECEF] rounded-2xl px-3.5 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#71717A] truncate">{c.description}{c.bank && ` · ${c.bank}`}</p>
                  <p className="text-xs text-[#A1A1AA] mt-0.5">{c.cuota_total} cuotas · {fmt(c.cuota_monto)}/mes</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> Pagado
                  </span>
                  <button
                    className="w-9 h-9 flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-red-50 hover:text-red-500 transition-colors"
                    onClick={() => deleteCredit.mutate(c.id)}
                    title="Eliminar crédito"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cuotas de tarjeta ── */}
      {groups.length === 0 ? (
        <div className="card text-center py-8 text-[#A1A1AA]">
          <p className="text-sm">No hay compras en cuotas registradas.</p>
          <p className="text-xs mt-1">Sube una cartola de tarjeta de crédito para verlas aquí.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-[#71717A] uppercase tracking-wide mb-3 flex items-center gap-2">
                Cuotas tarjeta activas
                <span className="text-xs font-semibold text-[#71717A] bg-[#F4F4F5] rounded-full px-2 py-0.5">{active.length}</span>
              </h2>
              <div className="flex flex-col gap-2.5">
                {active.map((g, i) => (
                  <div key={i} className="bg-white border border-[#ECECEF] rounded-2xl p-3.5">
                    <div className="flex items-start gap-2.5">
                      <span className="w-[38px] h-[38px] rounded-[11px] bg-orange-50 flex items-center justify-center shrink-0">
                        <CreditCard className="w-[18px] h-[18px] text-orange-500" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-bold text-[#18181B] truncate uppercase">{g.description}</p>
                      </div>
                      {correctingId !== g.charge_id && (
                        <button
                          className="w-9 h-9 flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-brand-600 transition-colors shrink-0"
                          onClick={() => { setCorrectingId(g.charge_id); setCorrectingValue(String(g.cuota_numero)) }}
                          title="Corregir cuota actual"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {correctingId === g.charge_id ? (
                      <div className="mt-2.5 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#71717A] shrink-0">Cuota actual:</span>
                          <input
                            type="number"
                            min={1}
                            max={g.cuota_total}
                            value={correctingValue}
                            onChange={(e) => setCorrectingValue(e.target.value)}
                            className="input py-1.5 px-2 text-sm w-16 min-h-0"
                            autoFocus
                          />
                          <span className="text-xs text-[#A1A1AA] shrink-0">/ {g.cuota_total}</span>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          <button className="btn-secondary text-xs py-1.5 px-3 min-h-0" onClick={() => setCorrectingId(null)}>
                            Cancelar
                          </button>
                          <button
                            className="btn-primary text-xs py-1.5 px-3 min-h-0"
                            disabled={updateCuotaNumero.isPending || !correctingValue || Number(correctingValue) < 1 || Number(correctingValue) > g.cuota_total}
                            onClick={() => {
                              updateCuotaNumero.mutate(
                                { chargeId: g.charge_id, cuotaNumero: Number(correctingValue) },
                                { onSuccess: () => setCorrectingId(null) },
                              )
                            }}
                          >
                            {updateCuotaNumero.isPending ? '…' : 'Guardar'}
                          </button>
                        </div>
                        {updateCuotaNumero.isError && (
                          <span className="text-xs text-red-500 text-right">Error al guardar. Intenta de nuevo.</span>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1.5 mt-2.5 flex-wrap">
                          <span className="text-base font-bold text-orange-600">{fmt((g.cuota_total - g.cuota_numero) * g.cuota_monto)}</span>
                          <span className="text-xs text-[#71717A]">restantes</span>
                          <span className="text-[#E4E4E7] mx-0.5">·</span>
                          <span className="text-xs text-[#71717A]">{g.cuota_total - g.cuota_numero} cuotas</span>
                          <span className="text-[#E4E4E7] mx-0.5">·</span>
                          <span className="text-xs text-[#71717A]">{fmt(g.cuota_monto)}/mes</span>
                        </div>
                        <ProgressBar value={g.cuota_numero} total={g.cuota_total} />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {finished.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-[#71717A] uppercase tracking-wide mb-3 flex items-center gap-2">
                Cuotas tarjeta pagadas
                <span className="text-xs font-semibold text-[#71717A] bg-[#F4F4F5] rounded-full px-2 py-0.5">{finished.length}</span>
              </h2>
              <div className="flex flex-col gap-2">
                {finished.map((g, i) => (
                  <div key={i} className="bg-white border border-[#ECECEF] rounded-2xl px-3.5 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#71717A] truncate">{g.description}</p>
                      <p className="text-xs text-[#A1A1AA] mt-0.5">{g.cuota_total} cuotas · {fmt(g.cuota_monto)}/mes</p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0">
                      <Check className="w-3 h-3" /> Pagado
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Add / edit credit bottom sheet ── */}
      {(showForm || editingCredit) && (
        <BottomSheet title={editingCredit ? 'Editar crédito' : 'Nuevo crédito'} onClose={closeSheet}>
          <CreditFormRow
            initial={
              editingCredit
                ? {
                    description: editingCredit.description,
                    bank: editingCredit.bank ?? '',
                    cuota_monto: String(editingCredit.cuota_monto),
                    cuota_numero: String(editingCredit.cuota_numero),
                    cuota_total: String(editingCredit.cuota_total),
                  }
                : EMPTY_FORM
            }
            onSave={(v) => (editingCredit ? handleUpdate(editingCredit, v) : handleCreate(v))}
            onCancel={closeSheet}
            saving={editingCredit ? updateCredit.isPending : createCredit.isPending}
          />
        </BottomSheet>
      )}
    </div>
  )
}
