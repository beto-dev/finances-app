import { useEffect } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose: () => void
}

export default function Toast({ message, type = 'info', onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  const colors = {
    success: 'bg-green-50 border-green-500 text-green-800',
    error: 'bg-red-50 border-red-500 text-red-800',
    info: 'bg-blue-50 border-blue-500 text-blue-800',
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${colors[type]}`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-lg leading-none opacity-60 hover:opacity-100">×</button>
    </div>
  )
}
