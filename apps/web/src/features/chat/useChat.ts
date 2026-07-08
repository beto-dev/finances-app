import { useState } from 'react'
import client from '../../shared/api/client'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = async (text: string) => {
    const history = messages.map(({ role, content }) => ({ role, content }))
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setIsLoading(true)
    try {
      const res = await client.post<{ reply: string }>(
        '/api/chat/',
        { message: text, history },
        { timeout: 60000 },
      )
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Lo siento, hubo un error al procesar tu pregunta. Intenta de nuevo.' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const clearMessages = () => setMessages([])

  return { messages, isLoading, sendMessage, clearMessages }
}
