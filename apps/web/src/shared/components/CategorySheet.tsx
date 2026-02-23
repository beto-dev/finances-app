import { useEffect, useState } from 'react'
import { Category } from '../types'

interface Props {
  categories: Category[]
  value: string | null   // current category id, null/'' = none
  onChange: (categoryId: string) => void
  onClose: () => void
}

export default function CategorySheet({ categories, value, onChange, onClose }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  const close = () => {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  const select = (id: string) => {
    onChange(id)
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${visible ? 'opacity-40' : 'opacity-0'}`}
        onClick={close}
      />

      {/* Sheet */}
      <div
        className={`relative bg-white rounded-t-3xl transition-transform duration-300 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-5 pb-3">
          <h3 className="text-base font-semibold text-gray-900">Categoría</h3>
        </div>

        {/* Grid */}
        <div className="px-4 pb-8 grid grid-cols-3 gap-3">
          {/* Sin categoría */}
          <button
            onClick={() => select('')}
            className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-95 ${
              !value ? 'bg-gray-100 ring-2 ring-gray-400 ring-offset-1' : 'bg-gray-50'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-2xl">
              —
            </div>
            <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">Sin categoría</span>
          </button>

          {categories.map((cat) => {
            const isSelected = value === cat.id
            const color = cat.color ?? '#9ca3af'
            return (
              <button
                key={cat.id}
                onClick={() => select(cat.id)}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-95 ${
                  isSelected ? 'ring-2 ring-offset-1 ring-brand-500 bg-brand-50' : ''
                }`}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold"
                  style={{ backgroundColor: color }}
                >
                  {cat.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-[11px] font-medium text-gray-700 text-center leading-tight line-clamp-2">
                  {cat.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
