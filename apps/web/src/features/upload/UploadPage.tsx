import { useState, DragEvent, ChangeEvent, useRef, useEffect } from 'react'
import { useStatements, useUploadStatement, useDeleteAllStatements, useUpdateStatement, useStatementsSummary } from './useUpload'
import Spinner from '../../shared/components/Spinner'
import Toast from '../../shared/components/Toast'
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
          className="input pr-8"
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

type FileStatus = 'waiting' | 'uploading' | 'done' | 'duplicate' | 'error'

interface FileItem {
  file: File
  status: FileStatus
  error?: string
  statementId?: string
}

type DisplayStatus = 'waiting' | 'uploading' | 'processing' | 'done' | 'upload-error' | 'parse-error' | 'duplicate'

const DISPLAY_CONFIG: Record<DisplayStatus, { label: string; color: string; spinner?: boolean }> = {
  waiting:        { label: 'En cola',          color: 'bg-gray-100 text-gray-500' },
  uploading:      { label: 'Subiendo...',       color: 'bg-blue-100 text-blue-700', spinner: true },
  processing:     { label: 'Procesando...',     color: 'bg-indigo-100 text-indigo-700', spinner: true },
  done:           { label: 'Listo',             color: 'bg-green-100 text-green-700' },
  'upload-error': { label: 'Error al subir',    color: 'bg-red-100 text-red-700' },
  'parse-error':  { label: 'Error al procesar', color: 'bg-red-100 text-red-700' },
  duplicate:      { label: 'Duplicada',         color: 'bg-yellow-100 text-yellow-700' },
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

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (!statementType) {
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
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Subir Cartola</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Options + Drop zone */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Opciones</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Tipo de cuenta <span className="text-red-500">*</span></label>
                <select
                  className={`input ${!statementType ? 'border-red-300 text-gray-400' : ''}`}
                  value={statementType}
                  onChange={(e) => setStatementType(e.target.value)}
                  disabled={isUploading}
                  required
                >
                  <option value="" disabled>Selecciona un tipo...</option>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Banco (opcional)</label>
                <BankCombobox value={bankHint} onChange={setBankHint} disabled={isUploading} />
              </div>
            </div>
          </div>

          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !isUploading && statementType && fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
              isUploading || !statementType
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
                : isDragging
                ? 'border-brand-500 bg-brand-50 cursor-pointer'
                : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50 cursor-pointer'
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
            <div className="text-4xl mb-3">📁</div>
            {isUploading ? (
              <div className="flex items-center justify-center gap-2">
                <Spinner size="sm" />
                <span className="text-sm text-gray-600">Subiendo archivos...</span>
              </div>
            ) : !statementType ? (
              <p className="text-sm text-gray-400">Selecciona primero el tipo de cuenta</p>
            ) : (
              <>
                <p className="text-base font-medium text-gray-700">
                  Arrastra uno o más archivos aquí, o haz clic para seleccionar
                </p>
                <p className="text-sm text-gray-400 mt-1">PDF, CSV, Excel (.xlsx, .xls) · Múltiples archivos permitidos</p>
              </>
            )}
          </div>
        </div>

        {/* Right: Unified cartolas panel */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Cartolas</h2>
            {statements && statements.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('¿Borrar todas las cartolas y sus gastos?')) {
                    deleteAll.mutate(statements.map((s) => s.id))
                    setQueue([])
                  }
                }}
                disabled={deleteAll.isPending}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
              >
                {deleteAll.isPending ? 'Borrando...' : 'Borrar todo'}
              </button>
            )}
          </div>

          {isLoading && queue.length === 0 ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : !hasAnyItems ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin archivos subidos</p>
          ) : (
            <ul className="space-y-2">
              {/* Current session items */}
              {queue.map((item, i) => {
                const stmt = item.statementId ? statements?.find(s => s.id === item.statementId) : undefined
                const ds = itemDisplayStatus(item, stmt)
                const cfg = DISPLAY_CONFIG[ds]
                const canRemove = item.status === 'duplicate' || item.status === 'error'
                return (
                  <li key={`q-${i}`} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-800 truncate min-w-0">{item.file.name}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                          {cfg.spinner && <Spinner size="sm" />}
                          {cfg.label}
                        </span>
                        {canRemove && (
                          <button
                            onClick={() => setQueue((prev) => prev.filter((_, idx) => idx !== i))}
                            className="text-gray-300 hover:text-red-400 transition-colors p-0.5"
                            title="Quitar de la lista"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                    {item.status === 'error' && item.error && (
                      <p className="text-xs text-red-500 mt-0.5 truncate">{item.error}</p>
                    )}
                    {ds === 'parse-error' && stmt && (
                      <p className="text-xs text-red-500 mt-0.5">Error al procesar</p>
                    )}
                  </li>
                )
              })}

              {/* Separator between current session and past */}
              {queue.length > 0 && pastStatements.length > 0 && (
                <li><hr className="border-gray-100 my-1" /></li>
              )}

              {/* Past statements */}
              {pastStatements.map((s) => {
                const ds = stmtDisplayStatus(s)
                const cfg = DISPLAY_CONFIG[ds]
                const summary = summaries?.find(sm => sm.id === s.id)
                return (
                  <li key={s.id} className="text-sm">
                    {editingId === s.id ? (
                      <div className="bg-gray-50 rounded-lg p-2 space-y-2">
                        <p className="text-xs font-medium text-gray-600 truncate">{s.filename}</p>
                        <select
                          className="input text-xs py-1"
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
                            className="btn-primary text-xs py-1 px-3 flex items-center gap-1"
                          >
                            {updateStatement.isPending ? <Spinner size="sm" /> : 'Guardar'}
                          </button>
                          <button onClick={cancelEdit} className="btn-secondary text-xs py-1 px-3">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">{s.filename}</p>
                          <p className="text-gray-400 text-xs">
                            {TYPE_LABELS[s.type]}{s.bank_hint ? ` · ${s.bank_hint}` : ''}
                            {summary && ds === 'done' && (
                              <span className={summary.total_charges === 0 ? 'text-red-400 font-medium' : 'text-gray-400'}>
                                {' · '}{summary.total_charges} gastos
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                            {cfg.spinner && <Spinner size="sm" />}
                            {cfg.label}
                          </span>
                          <button
                            onClick={() => startEdit(s.id, s.type, s.bank_hint ?? '')}
                            className="text-gray-300 hover:text-blue-400 transition-colors p-0.5 text-base"
                            title="Editar tipo de cuenta"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => {
                              const ids = statements!.filter((o) => o.filename === s.filename).map((o) => o.id)
                              deleteAll.mutate(ids)
                            }}
                            disabled={deleteAll.isPending}
                            className="text-gray-300 hover:text-red-400 transition-colors p-0.5"
                            title="Eliminar cartola"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
