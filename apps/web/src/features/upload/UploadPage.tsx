import { useState, DragEvent, ChangeEvent, useRef } from 'react'
import { useStatements, useUploadStatement } from './useUpload'
import Spinner from '../../shared/components/Spinner'
import Toast from '../../shared/components/Toast'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  parsing: 'Procesando...',
  parsed: 'Procesado',
  error: 'Error',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  parsing: 'bg-blue-100 text-blue-800',
  parsed: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
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
}

const ALLOWED_EXTENSIONS = ['pdf', 'csv', 'xlsx', 'xls']

function isAllowed(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_EXTENSIONS.includes(ext)
}

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [statementType, setStatementType] = useState('checking')
  const [bankHint, setBankHint] = useState('')
  const [queue, setQueue] = useState<FileItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: statements, isLoading } = useStatements()
  const upload = useUploadStatement()

  const updateFileStatus = (index: number, status: FileStatus, error?: string) => {
    setQueue((prev) => prev.map((item, i) => i === index ? { ...item, status, error } : item))
  }

  const uploadQueue = async (items: FileItem[], startIndex: number) => {
    setIsUploading(true)
    for (let i = startIndex; i < items.length; i++) {
      const item = items[i]
      if (item.status === 'duplicate') continue

      updateFileStatus(i, 'uploading')

      const formData = new FormData()
      formData.append('file', item.file)
      formData.append('statement_type', statementType)
      if (bankHint) formData.append('bank_hint', bankHint)

      try {
        await upload.mutateAsync(formData)
        updateFileStatus(i, 'done')
      } catch {
        updateFileStatus(i, 'error', 'Error al subir')
      }
    }
    setIsUploading(false)
    setToast({ message: 'Subida completada. Los archivos se están procesando en segundo plano.', type: 'success' })
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const newItems: FileItem[] = []
    let invalidCount = 0

    for (const file of Array.from(files)) {
      if (!isAllowed(file)) {
        invalidCount++
        continue
      }
      const isDuplicate = statements?.some((s) => s.filename === file.name)
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

  const onDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  const clearQueue = () => setQueue([])

  const duplicates = queue.filter((i) => i.status === 'duplicate')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Subir Cartola</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Options */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Opciones</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Tipo de cuenta</label>
                <select
                  className="input"
                  value={statementType}
                  onChange={(e) => setStatementType(e.target.value)}
                  disabled={isUploading}
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Banco (opcional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ej. BancoEstado, Santander"
                  value={bankHint}
                  onChange={(e) => setBankHint(e.target.value)}
                  disabled={isUploading}
                />
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
              isUploading
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
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
            ) : (
              <>
                <p className="text-base font-medium text-gray-700">
                  Arrastra uno o más archivos aquí, o haz clic para seleccionar
                </p>
                <p className="text-sm text-gray-400 mt-1">PDF, CSV, Excel (.xlsx, .xls) · Múltiples archivos permitidos</p>
              </>
            )}
          </div>

          {/* Upload queue */}
          {queue.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">
                  Cola de subida ({queue.filter((i) => i.status === 'done').length}/{queue.length})
                </h2>
                {!isUploading && (
                  <button onClick={clearQueue} className="text-xs text-gray-400 hover:text-gray-600">
                    Limpiar
                  </button>
                )}
              </div>
              <ul className="space-y-2">
                {queue.map((item, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-gray-700 min-w-0">{item.file.name}</span>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      item.status === 'done' ? 'bg-green-100 text-green-700' :
                      item.status === 'uploading' ? 'bg-blue-100 text-blue-700' :
                      item.status === 'error' ? 'bg-red-100 text-red-700' :
                      item.status === 'duplicate' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {item.status === 'done' ? 'Subido' :
                       item.status === 'uploading' ? 'Subiendo...' :
                       item.status === 'error' ? (item.error ?? 'Error') :
                       item.status === 'duplicate' ? 'Duplicado (omitido)' :
                       'En cola'}
                    </span>
                  </li>
                ))}
              </ul>
              {duplicates.length > 0 && !isUploading && (
                <p className="text-xs text-yellow-600 mt-3">
                  {duplicates.length} archivo(s) omitido(s) por ser duplicados. Elimínalos primero si quieres subirlos de nuevo.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Recent uploads */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Subidas recientes</h2>
          {isLoading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : !statements || statements.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin archivos subidos</p>
          ) : (
            <ul className="space-y-2">
              {statements.slice(0, 10).map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">{s.filename}</p>
                    <p className="text-gray-400 text-xs">{TYPE_LABELS[s.type]}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status]}`}>
                    {STATUS_LABELS[s.status]}
                  </span>
                </li>
              ))}
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
