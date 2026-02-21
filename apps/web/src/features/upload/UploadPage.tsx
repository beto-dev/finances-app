import { useState, DragEvent, ChangeEvent, useRef } from 'react'
import { useStatements, useUploadStatement } from './useUpload'
import Spinner from '../../shared/components/Spinner'
import Toast from '../../shared/components/Toast'
import ConfirmDialog from '../../shared/components/ConfirmDialog'

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

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [statementType, setStatementType] = useState('checking')
  const [bankHint, setBankHint] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingUpload, setPendingUpload] = useState<{ formData: FormData; filename: string } | null>(null)

  const { data: statements, isLoading } = useStatements()
  const upload = useUploadStatement()

  const doUpload = async (formData: FormData, filename: string) => {
    try {
      await upload.mutateAsync(formData)
      setToast({ message: `Archivo "${filename}" subido. Procesando en segundo plano...`, type: 'success' })
    } catch {
      setToast({ message: 'Error al subir el archivo', type: 'error' })
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    const allowed = ['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
    if (!allowed.some((t) => file.type.startsWith(t.split('/')[0])) && !['pdf', 'csv', 'xlsx', 'xls'].some((e) => file.name.endsWith(e))) {
      setToast({ message: 'Formato no soportado. Usa PDF, CSV o Excel.', type: 'error' })
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('statement_type', statementType)
    if (bankHint) formData.append('bank_hint', bankHint)

    const isDuplicate = statements?.some((s) => s.filename === file.name)
    if (isDuplicate) {
      setPendingUpload({ formData, filename: file.name })
      return
    }

    await doUpload(formData, file.name)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const onDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

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
                  placeholder="ej. BBVA, Santander"
                  value={bankHint}
                  onChange={(e) => setBankHint(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,.xlsx,.xls"
              className="hidden"
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)}
            />
            <div className="text-4xl mb-3">📁</div>
            {upload.isPending ? (
              <div className="flex items-center justify-center gap-2">
                <Spinner size="sm" />
                <span className="text-sm text-gray-600">Subiendo...</span>
              </div>
            ) : (
              <>
                <p className="text-base font-medium text-gray-700">
                  Arrastra tu archivo aquí o haz clic para seleccionar
                </p>
                <p className="text-sm text-gray-400 mt-1">PDF, CSV, Excel (.xlsx, .xls)</p>
              </>
            )}
          </div>
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

      {pendingUpload && (
        <ConfirmDialog
          title="Archivo ya cargado"
          message={`"${pendingUpload.filename}" ya fue subido antes. ¿Quieres subirla de nuevo y duplicar los movimientos?`}
          confirmLabel="Subir de todas formas"
          onConfirm={async () => {
            const { formData, filename } = pendingUpload
            setPendingUpload(null)
            await doUpload(formData, filename)
          }}
          onCancel={() => setPendingUpload(null)}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
