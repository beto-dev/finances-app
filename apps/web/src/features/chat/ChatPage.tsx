import { useRef, useEffect, useState } from 'react'
import { MessageCircle, Send, Trash2 } from 'lucide-react'
import { useChat } from './useChat'

const SUGGESTED_PROMPTS = [
  '¿Cuánto gasté este mes?',
  '¿Cuál fue mi gasto más alto?',
  'Resumen de los últimos 3 meses',
  '¿En qué categoría gasté más?',
]

export default function ChatPage() {
  const { messages, isLoading, sendMessage, clearMessages } = useChat()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    sendMessage(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-[75vh] md:h-[80vh]">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600/10 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#18181B]">Asistente</h1>
            <p className="text-xs text-[#A1A1AA]">Pregunta sobre tus finanzas</p>
          </div>
        </div>
        {!isEmpty && (
          <button
            onClick={clearMessages}
            className="flex items-center gap-1.5 text-xs text-[#71717A] hover:text-[#18181B] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-brand-600/10 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-brand-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#18181B] mb-1">¿En qué te puedo ayudar?</h2>
              <p className="text-sm text-[#71717A]">Hazme preguntas sobre tus gastos e ingresos</p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  disabled={isLoading}
                  className="text-left text-xs px-3 py-2.5 rounded-xl bg-white border border-[#E4E4E7] text-[#18181B] hover:bg-brand-50 hover:border-brand-200 transition-colors disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 pb-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[82%] px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-brand-600 text-white rounded-2xl rounded-tr-sm'
                      : 'bg-white border border-[#E4E4E7] text-[#18181B] rounded-2xl rounded-tl-sm shadow-sm'
                  }`}
                  style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#E4E4E7] rounded-2xl rounded-tl-sm shadow-sm px-4 py-3.5">
                  <div className="flex gap-1.5 items-center">
                    <span className="w-2 h-2 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="mt-4 shrink-0 flex gap-2 items-end bg-white border border-[#E4E4E7] rounded-2xl px-4 py-3 shadow-sm">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu pregunta..."
          rows={1}
          disabled={isLoading}
          className="flex-1 resize-none text-sm text-[#18181B] placeholder-[#A1A1AA] outline-none bg-transparent leading-5 disabled:opacity-60"
          style={{ maxHeight: '120px', overflowY: 'auto' }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
