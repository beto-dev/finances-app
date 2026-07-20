import { useState, DragEvent, ChangeEvent, useRef, useEffect } from 'react'
import { Upload, Pencil, X, Check } from 'lucide-react'
import { useStatements, useUploadStatement, useDeleteAllStatements, useUpdateStatement, useStatementsSummary } from './useUpload'
import Spinner from '../../shared/components/Spinner'
import Toast from '../../shared/components/Toast'
import BankBadge from '../../shared/components/BankBadge'
import { Statement } from '../../shared/types'

const CHILEAN_BANKS = [
  'Banco de Chile',
  'Banco Santander',
  'BancoEstado',
  'Banco BCI',
  'Banco Itaú',
  'Banco Scotiabank Chile',
  'Banco Falabella',
  'Banco Ripley',
  'Banco Security',
  'Banco BICE',
  'Banco Internacional',
  'Banco Consorcio',
  'Banco BTG Pactual Chile',
  'Coopeuch',
  'Caja Los Andes',
  'MACH',
  'Tenpo',
  'Chek',
  'Tapp',
  'Global66',
  'Prepago Los Héroes',
]

const QUICK_BANKS = CHILEAN_BANKS.slice(0, 5)

function BankCombobox({ value, onChange, disabled }: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? CHILEAN_BANKS.filter((b) => b.toLowerCase().includes(query.toLowerCase()))
    : CHILEAN_BANKS

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (bank: string) => {
    setQuery(bank)
    onChange(bank)
    setOpen(false)
  }

  const clear = () => {
    setQuery('')
    onChange('')
    setOpen(false)
  }

  const handleBlur = () => {
    if (!CHILEAN_BANKS.includes(query)) {
      setQuery('')
      onChange('')
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          className="input pr-8 text-xs py-1.5"
          placeholder="Buscar banco..."
          value={query}
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); onChange(''); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
        />
        {query && !disabled && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>
      {open && !disabled && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.map((bank) => (
            <li
              key={bank}
              onMouseDown={() => select(bank)}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${bank === value ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'}`}
            >
              {bank}
            </li>
          ))}
        </ul>
      )}
      {open && !disabled && filtered.length === 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-400">
          Sin resultados
        </div>
      )}
    </div>
  )
}

const TYPE_LABELS: Record<string, string> = {
  checking: 'Cuenta corriente',
  credit_card: 'Tarjeta de crédito',
  credit_line: 'Línea de crédito',
}

const TYPE_LABELS_SHORT: Record<string, string> = {
  checking: 'Cta. corriente',
  credit_card: 'Tarjeta credito',
  credit_line: 'Linea credito',
}

type FileStatus = 'waiting' | 'uploading' | 'done' | 'duplicate' | 'error'

interface FileItem {
  file: File
  status: FileStatus
  error?: string
  statementId?: string
}

type DisplayStatus = 'waiting' | 'uploading' | 'processing' | 'done' | 'upload-error' | 'parse-error' | 'duplicate'

const DISPLAY_CONFIG: Record<DisplayStatus, { label: string; pill: string; spinner?: boolean; barColor?: string }> = {
  waiting:        { label: 'En cola',          pill: 'bg-[#F4F4F5] text-[#71717A]' },
  uploading:      { label: 'Subiendo',         pill: 'bg-blue-50 text-blue-700',   spinner: true, barColor: '#3B82F6' },
  processing:     { label: 'Procesando',       pill: 'bg-brand-50 text-brand-700', spinner: true, barColor: '#8B5CF6' },
  done:           { label: 'Listo',            pill: 'bg-emerald-50 text-emerald-700' },
  'upload-error': { label: 'Error al subir',   pill: 'bg-red-50 text-red-700' },
  'parse-error':  { label: 'Error al procesar', pill: 'bg-red-50 text-red-700' },
  duplicate:      { label: 'Duplicada',        pill: 'bg-amber-50 text-amber-700' },
}

function itemDisplayStatus(item: FileItem, stmt: Statement | undefined): DisplayStatus {
  if (item.status === 'waiting') return 'waiting'
  if (item.status === 'uploading') return 'uploading'
  if (item.status === 'error') return 'upload-error'
  if (item.status === 'duplicate') return 'duplicate'
  if (!stmt || stmt.status === 'pending' || stmt.status === 'parsing') return 'processing'
  if (stmt.status === 'parsed') return 'done'
  return 'parse-error'
}

function stmtDisplayStatus(s: Statement): DisplayStatus {
  if (s.status === 'pending' || s.status === 'parsing') return 'processing'
  if (s.status === 'parsed') return 'done'
  return 'parse-error'
}

const ALLOWED_EXTENSIONS = ['pdf', 'csv', 'xlsx', 'xls']

function isAllowed(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_EXTENSIONS.includes(ext)
}

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [statementType, setStatementType] = useState('')
  const [bankHint, setBankHint] = useState('')
  const [queue, setQueue] = useState<FileItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [bankSheetOpen, setBankSheetOpen] = useState(false)
  const [bankQuery, setBankQuery] = useState('')
  const [shake, setShake] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: statements, isLoading } = useStatements()
  const { data: summaries } = useStatementsSummary()
  const upload = useUploadStatement()
  const deleteAll = useDeleteAllStatements()
  const updateStatement = useUpdateStatement()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editType, setEditType] = useState('')
  const [editBank, setEditBank] = useState('')

  const startEdit = (id: string, type: string, bank: string) => {
    setEditingId(id); setEditType(type); setEditBank(bank)
  }
  const cancelEdit = () => setEditingId(null)
  const saveEdit = async () => {
    if (!editingId || !editType) return
    try {
      await updateStatement.mutateAsync({ id: editingId, statementType: editType, bankHint: editBank })
      setEditingId(null)
      setToast({ message: 'Cartola actualizada', type: 'success' })
    } catch {
      setToast({ message: 'Error al actualizar', type: 'error' })
    }
  }

  const updateFileStatus = (index: number, status: FileStatus, error?: string, statementId?: string) => {
    setQueue((prev) => prev.map((item, i) =>
      i === index ? { ...item, status, error, ...(statementId !== undefined ? { statementId } : {}) } : item
    ))
  }

  const uploadQueue = async (items: FileItem[], startIndex: number) => {
    setIsUploading(true)

    for (let i = startIndex; i < items.length; i++) {
      const item = items[i]
      if (item.status === 'duplicate') continue
      if (!statementType) continue

      updateFileStatus(i, 'uploading')

      const formData = new FormData()
      formData.append('file', item.file)
      formData.append('statement_type', statementType)
      if (bankHint) formData.append('bank_hint', bankHint)

      try {
        const result = await upload.mutateAsync(formData)
        updateFileStatus(i, 'done', undefined, result.id)
      } catch (err: unknown) {
        const e = err as { response?: { status: number; data?: { detail?: string } }; message?: string }
        const msg = e.response?.data?.detail ?? (e.response ? `HTTP ${e.response.status}` : (e.message ?? 'Error'))
        updateFileStatus(i, 'error', msg)
      }
    }

    setIsUploading(false)
  }

  const triggerShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 420)
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (!statementType) {
      triggerShake()
      setToast({ message: 'Selecciona el tipo de cuenta antes de subir', type: 'error' })
      return
    }

    const newItems: FileItem[] = []
    let invalidCount = 0

    for (const file of Array.from(files)) {
      if (!isAllowed(file)) {
        invalidCount++
        continue
      }
      const isDuplicate = statements?.some((s) => s.filename === file.name && s.status !== 'error')
      newItems.push({ file, status: isDuplicate ? 'duplicate' : 'waiting' })
    }

    if (invalidCount > 0) {
      setToast({ message: `${invalidCount} archivo(s) ignorado(s): solo se permiten PDF, CSV o Excel.`, type: 'error' })
    }
    if (newItems.length === 0) return

    const startIndex = queue.length
    const combined = [...queue, ...newItems]
    setQueue(combined)
    uploadQueue(combined, startIndex)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const onDragOver = (e: DragEvent) => { e.preventDefault(); if (statementType) setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  const openPicker = () => {
    if (!statementType) { triggerShake(); return }
    fileInputRef.current?.click()
  }

  const selectQuickBank = (bank: string) => setBankHint((prev) => (prev === bank ? '' : bank))
  const filteredSheetBanks = bankQuery.trim()
    ? CHILEAN_BANKS.filter((b) => b.toLowerCase().includes(bankQuery.toLowerCase()))
    : CHILEAN_BANKS

  // IDs uploaded in the current session (to avoid double-showing in the list)
  const sessionStatementIds = new Set(queue.filter(q => q.statementId).map(q => q.statementId!))

  // Past statements not part of current session
  const pastStatements = (statements ?? [])
    .filter(s => !sessionStatementIds.has(s.id))
    .filter((s, i, arr) => {
      if (s.status !== 'error') return true
      if (arr.some(o => o.filename === s.filename && o.status !== 'error')) return false
      return arr.findIndex(o => o.filename === s.filename && o.status === 'error') === i
    })
    .slice(0, 20)

  const hasAnyItems = queue.length > 0 || pastStatements.length > 0

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-[#18181B] mb-5">Subir Cartola</h1>

      <div
        className={`card mb-5 ${shake ? 'animate-shake' : ''}`}
      >
        <p className="text-sm font-bold text-[#27272A] mb-2.5">1. Tipo de cuenta</p>
        <div className="flex gap-2 mb-5">
          {Object.entries(TYPE_LABELS_SHORT).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={isUploading}
              onClick={() => setStatementType(value)}
              className={`flex-1 rounded-[14px] px-1 py-2.5 text-xs font-bold min-h-[44px] transition-colors ${
                statementType === value
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-[#E4E4E7] text-[#52525B]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="text-sm font-bold text-[#27272A] mb-2.5">
          2. Banco <span className="text-[#D4D4D8] font-medium">(opcional)</span>
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
          {QUICK_BANKS.map((bank) => (
            <button
              key={bank}
              type="button"
              onClick={() => selectQuickBank(bank)}
              className={`shrink-0 flex items-center justify-center rounded-[14px] px-2.5 min-h-[40px] transition-colors ${
                bankHint === bank ? 'bg-brand-50 border border-brand-600' : 'bg-white border border-[#E4E4E7]'
              }`}
            >
              <span className="w-9 h-6 rounded-md overflow-hidden flex items-center justify-center">
                <BankBadge bank={bank} showName={false} />
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setBankSheetOpen(true)}
            className="shrink-0 flex items-center gap-1 rounded-full px-3 min-h-[36px] self-center text-xs font-semibold bg-[#F4F4F5] border border-[#ECECEF] text-[#52525B]"
          >
            Ver todos →
          </button>
        </div>

        <p className="text-sm font-bold text-[#27272A] mb-2.5">3. Sube tu cartola</p>
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={openPicker}
          className={`rounded-2xl border-[1.5px] border-dashed py-7 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
            !statementType
              ? 'border-[#E4E4E7] bg-[#FAFAFA]'
              : isDragging
              ? 'border-brand-600 bg-brand-50'
              : 'border-brand-300 bg-brand-50/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,.xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)}
          />
          {isUploading ? (
            <>
              <Spinner size="sm" />
              <span className="text-xs font-bold text-[#71717A]">Subiendo archivos...</span>
            </>
          ) : (
            <>
              <Upload className={`w-6 h-6 ${statementType ? 'text-brand-600' : 'text-[#D4D4D8]'}`} />
              <span className={`text-xs font-bold text-center px-4 ${statementType ? 'text-brand-800' : 'text-[#D4D4D8]'}`}>
                {statementType ? 'Arrastra o toca para elegir archivo' : 'Selecciona el tipo de cuenta primero'}
              </span>
              <span className="text-[10.5px] text-[#A1A1AA]">PDF, CSV, Excel (.xlsx, .xls)</span>
            </>
          )}
        </div>
        {!statementType && (
          <p className="mt-2 text-[11.5px] text-rose-500 font-semibold text-center">
            Selecciona el tipo de cuenta primero
          </p>
        )}
      </div>

      {/* ── Files feed ── */}
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-sm font-bold text-[#27272A]">Cartolas</p>
        <div className="flex items-center gap-3">
          {statements && statements.length > 0 && (
            <button
              onClick={() => {
                if (confirm('¿Borrar todas las cartolas y sus gastos?')) {
                  deleteAll.mutate(statements.map((s) => s.id))
                  setQueue([])
                }
              }}
              disabled={deleteAll.isPending}
              className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 font-medium"
            >
              {deleteAll.isPending ? 'Borrando...' : 'Borrar todo'}
            </button>
          )}
          <span className="text-xs text-[#A1A1AA] font-semibold">
            {(statements?.length ?? 0)} {(statements?.length ?? 0) === 1 ? 'archivo' : 'archivos'}
          </span>
        </div>
      </div>

      {isLoading && queue.length === 0 ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : !hasAnyItems ? (
        <p className="text-sm text-[#A1A1AA] text-center py-6">Sin archivos subidos</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Current session items */}
          {queue.map((item, i) => {
            const stmt = item.statementId ? statements?.find(s => s.id === item.statementId) : undefined
            const ds = itemDisplayStatus(item, stmt)
            const cfg = DISPLAY_CONFIG[ds]
            const canRemove = item.status === 'duplicate' || item.status === 'error'
            const showProgress = ds === 'uploading' || ds === 'processing'
            return (
              <div key={`q-${i}`} className="bg-white border border-[#ECECEF] rounded-2xl p-3 flex flex-col gap-2 animate-slide-up">
                <div className="flex items-center gap-2.5">
                  <span className={`w-[38px] h-[38px] rounded-[11px] flex items-center justify-center shrink-0 ${
                    ds === 'done' ? 'bg-emerald-50' : 'bg-brand-50'
                  }`}>
                    {ds === 'done'
                      ? <Check className="w-[18px] h-[18px] text-emerald-600" />
                      : <Upload className="w-[18px] h-[18px] text-brand-600" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-bold text-[#18181B] truncate">{item.file.name}</p>
                    <p className="text-[11.5px] text-[#A1A1AA] truncate">
                      {TYPE_LABELS[statementType] ?? ''}{bankHint ? ` · ${bankHint}` : ''}
                    </p>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${cfg.pill}`}>
                    {cfg.spinner && <Spinner size="sm" />}
                    {cfg.label}
                  </span>
                  {canRemove && (
                    <button
                      onClick={() => setQueue((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-[#D4D4D8] hover:text-red-400 transition-colors shrink-0"
                      title="Quitar de la lista"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {showProgress && (
                  <div className="w-full h-[5px] bg-[#F4F4F5] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: ds === 'processing' ? '70%' : '45%', backgroundColor: cfg.barColor }}
                    />
                  </div>
                )}
                {item.status === 'error' && item.error && (
                  <p className="text-xs text-red-500">{item.error}</p>
                )}
                {ds === 'parse-error' && stmt && (
                  <p className="text-xs text-red-500">Error al procesar</p>
                )}
              </div>
            )
          })}

          {/* Past statements */}
          {pastStatements.map((s) => {
            const ds = stmtDisplayStatus(s)
            const cfg = DISPLAY_CONFIG[ds]
            const summary = summaries?.find(sm => sm.id === s.id)
            return (
              <div key={s.id} className="bg-white border border-[#ECECEF] rounded-2xl p-3">
                {editingId === s.id ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-[#52525B] truncate">{s.filename}</p>
                    <select
                      className="input text-xs py-1.5"
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                    >
                      {Object.entries(TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <BankCombobox value={editBank} onChange={setEditBank} />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={updateStatement.isPending}
                        className="btn-primary text-xs py-1.5 px-3 min-h-0 flex items-center gap-1"
                      >
                        {updateStatement.isPending ? <Spinner size="sm" /> : 'Guardar'}
                      </button>
                      <button onClick={cancelEdit} className="btn-secondary text-xs py-1.5 px-3 min-h-0">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <span className={`w-[38px] h-[38px] rounded-[11px] flex items-center justify-center shrink-0 ${
                      ds === 'done' ? 'bg-emerald-50' : ds === 'parse-error' ? 'bg-red-50' : 'bg-brand-50'
                    }`}>
                      {ds === 'done'
                        ? <Check className="w-[18px] h-[18px] text-emerald-600" />
                        : <Upload className="w-[18px] h-[18px] text-brand-600" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-[#18181B] truncate">{s.filename}</p>
                      <p className="text-[11.5px] text-[#A1A1AA] truncate">
                        {TYPE_LABELS[s.type]}{s.bank_hint ? ` · ${s.bank_hint}` : ''}
                        {summary && ds === 'done' && (
                          <span className={summary.total_charges === 0 ? 'text-red-400 font-semibold' : ''}>
                            {' · '}{summary.total_charges} gastos
                          </span>
                        )}
                      </p>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${cfg.pill}`}>
                      {cfg.spinner && <Spinner size="sm" />}
                      {cfg.label}
                    </span>
                    <button
                      onClick={() => startEdit(s.id, s.type, s.bank_hint ?? '')}
                      className="text-[#D4D4D8] hover:text-brand-600 transition-colors shrink-0"
                      title="Editar tipo de cuenta"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const ids = statements!.filter((o) => o.filename === s.filename).map((o) => o.id)
                        deleteAll.mutate(ids)
                      }}
                      disabled={deleteAll.isPending}
                      className="text-[#D4D4D8] hover:text-red-400 transition-colors shrink-0"
                      title="Eliminar cartola"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Bank picker bottom sheet ── */}
      {bankSheetOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/45" onClick={() => setBankSheetOpen(false)} />
          <div className="relative bg-white rounded-t-3xl px-[18px] pt-3.5 pb-6 shadow-2xl animate-slide-up max-h-[70%] flex flex-col">
            <div className="w-9 h-1 rounded-full bg-[#E4E4E7] mx-auto mb-3.5 shrink-0" />
            <p className="text-[15px] font-extrabold text-[#18181B] mb-2.5 shrink-0">Elige tu banco</p>
            <input
              autoFocus
              value={bankQuery}
              onChange={(e) => setBankQuery(e.target.value)}
              placeholder="Buscar banco..."
              className="input mb-2.5 shrink-0"
            />
            <div className="overflow-y-auto flex flex-col gap-0.5">
              {filteredSheetBanks.map((bank) => (
                <button
                  key={bank}
                  onClick={() => { selectQuickBank(bank); setBankSheetOpen(false); setBankQuery('') }}
                  className="flex items-center gap-2.5 bg-transparent border-none px-1.5 py-2.5 rounded-xl text-left hover:bg-[#FAFAFA] transition-colors"
                >
                  <BankBadge bank={bank} showName />
                </button>
              ))}
              {filteredSheetBanks.length === 0 && (
                <p className="text-sm text-[#A1A1AA] text-center py-4">Sin resultados</p>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
