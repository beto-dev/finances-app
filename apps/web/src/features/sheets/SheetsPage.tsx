import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import client from '../../shared/api/client'
import { GoogleAuthStatus } from '../../shared/types'
import Spinner from '../../shared/components/Spinner'
import Toast from '../../shared/components/Toast'

function useGoogleStatus() {
  return useQuery<GoogleAuthStatus>({
    queryKey: ['google-status'],
    queryFn: async () => {
      const res = await client.get('/api/google/status')
      return res.data
    },
  })
}

function useGoogleConnect() {
  return useMutation({
    mutationFn: async () => {
      const res = await client.get('/api/google/auth')
      return res.data as { auth_url: string }
    },
    onSuccess: (data) => {
      window.location.href = data.auth_url
    },
  })
}

function useSyncSheets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await client.post('/api/google/sync')
      return res.data as { synced: number; months: string[] }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-status'] })
    },
  })
}

export default function SheetsPage() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const { data: status, isLoading } = useGoogleStatus()
  const connect = useGoogleConnect()
  const sync = useSyncSheets()

  const handleConnect = () => {
    connect.mutate()
  }

  const handleSync = async () => {
    try {
      const result = await sync.mutateAsync()
      setToast({
        message: `${result.synced} movimientos sincronizados en ${result.months.length} mes(es)`,
        type: 'success',
      })
    } catch {
      setToast({ message: 'Error al sincronizar con Google Sheets', type: 'error' })
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Google Sheets</h1>

      <div className="max-w-lg space-y-6">
        {/* Connection status */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">Estado de conexión</h2>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                status?.connected
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {status?.connected ? 'Conectado' : 'No conectado'}
            </span>
          </div>

          {status?.connected ? (
            <div className="space-y-3">
              {status.spreadsheet_url && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Hoja de cálculo</p>
                  <a
                    href={status.spreadsheet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-600 hover:underline break-all"
                  >
                    {status.spreadsheet_url}
                  </a>
                </div>
              )}
              {status.last_sync_at && (
                <p className="text-xs text-gray-400">
                  Última sincronización:{' '}
                  {new Date(status.last_sync_at).toLocaleString('es-ES')}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Conecta tu cuenta de Google para sincronizar tus movimientos confirmados automáticamente
              a una hoja de cálculo compartida.
            </p>
          )}
        </div>

        {/* Actions */}
        {status?.connected ? (
          <div className="card space-y-4">
            <h2 className="text-base font-semibold text-gray-800">Sincronizar</h2>
            <p className="text-sm text-gray-500">
              Sincroniza todos los movimientos confirmados a tu hoja de cálculo de Google. Los datos
              se organizan por mes en pestañas separadas. Esta operación es idempotente —
              no se duplican registros.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSync}
                className="btn-primary"
                disabled={sync.isPending}
              >
                {sync.isPending ? (
                  <span className="flex items-center gap-2">
                    <Spinner size="sm" /> Sincronizando...
                  </span>
                ) : (
                  'Sincronizar ahora'
                )}
              </button>
              <button
                onClick={handleConnect}
                className="btn-secondary"
                disabled={connect.isPending}
              >
                Reconectar Google
              </button>
            </div>
          </div>
        ) : (
          <div className="card">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Conectar Google</h2>
            <p className="text-sm text-gray-500 mb-4">
              Se te pedirá autorización para crear y editar hojas de cálculo en tu Google Drive.
            </p>
            <button
              onClick={handleConnect}
              className="btn-primary"
              disabled={connect.isPending}
            >
              {connect.isPending ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" /> Redirigiendo...
                </span>
              ) : (
                'Conectar con Google'
              )}
            </button>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
