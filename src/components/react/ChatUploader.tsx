import { useState, useEffect, useCallback } from 'react'
import type { Trip, Transaction } from '../../lib/types'

export default function ChatUploader() {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('rca_trip')
    if (!raw) { window.location.href = '/novo'; return }
    setTrip(JSON.parse(raw) as Trip)
  }, [])

  const loadText = (content: string) => {
    setText(content)
    setPreview(content.split('\n').filter(l => l.trim()).slice(0, 5))
    setError('')
    setTransactions([])
  }

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.txt')) {
      setError('Apenas arquivos .txt são aceitos (WhatsApp → Exportar Chat → Sem Mídia)')
      return
    }
    const reader = new FileReader()
    reader.onload = e => loadText(e.target?.result as string)
    reader.readAsText(file, 'utf-8')
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = e.clipboardData.getData('text')
    if (pasted) loadText(pasted)
  }, [])

  const extract = async () => {
    if (!text || !trip) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/extract-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, people: trip.people }),
      })
      const data = await res.json() as { transactions?: Transaction[]; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na extração')
      if (!data.transactions?.length) throw new Error('Nenhuma transação encontrada no chat')
      setTransactions(data.transactions)
      sessionStorage.setItem('rca_transactions', JSON.stringify(data.transactions))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  if (!trip) return null

  return (
    <div className="font-mono">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onPaste={handlePaste}
        tabIndex={0}
        className="border-2 border-dashed p-8 text-center mb-4 focus:outline-none transition-colors"
        style={{
          borderColor: isDragging ? '#ff6b35' : '#1a0a00',
          background: isDragging ? 'rgba(255,107,53,0.08)' : 'transparent',
        }}
      >
        <input
          type="file"
          accept=".txt"
          id="chat-file"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <label htmlFor="chat-file" className="cursor-pointer block">
          <p className="text-sm font-bold text-brand-dark mb-1">
            {text ? '✓ Chat carregado' : 'Arraste o .txt aqui ou clique para selecionar'}
          </p>
          <p className="text-xs" style={{ color: 'rgba(26,10,0,0.5)' }}>
            Ou cole o texto diretamente com Ctrl+V
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(26,10,0,0.4)' }}>
            WhatsApp → ⋮ → Mais → Exportar conversa → Sem mídia
          </p>
        </label>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="bg-brand-dark text-brand-cream text-xs p-3 mb-4">
          <p className="text-brand-orange mb-1 tracking-widest uppercase text-xs">Preview:</p>
          {preview.map((line, i) => (
            <p key={i} className="truncate" style={{ opacity: 0.6 }}>{line}</p>
          ))}
          <p style={{ opacity: 0.3 }} className="mt-1">...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs font-bold mb-4 border border-red-600 text-red-600 px-3 py-2">
          {error}
        </p>
      )}

      {/* Extract button */}
      {text && !transactions.length && (
        <button
          onClick={extract}
          disabled={loading}
          className="w-full bg-brand-dark text-brand-orange font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-orange hover:text-brand-dark transition-colors disabled:opacity-50"
        >
          {loading ? '⏳ LENDO O CHAT COM IA...' : '→ EXTRAIR TRANSAÇÕES'}
        </button>
      )}

      {/* Results */}
      {transactions.length > 0 && (
        <div>
          <p className="text-xs tracking-widest uppercase mb-3" style={{ color: 'rgba(26,10,0,0.5)' }}>
            {transactions.length} transações encontradas
          </p>
          <div className="flex flex-col gap-1.5 mb-6">
            {transactions.map(t => {
              const payer = trip.people.find(p => p.id === t.payerId)
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between text-sm px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.6)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {payer && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: payer.color }}
                      />
                    )}
                    <span className="truncate" style={{ color: 'rgba(26,10,0,0.7)' }}>
                      {t.description}
                    </span>
                  </div>
                  <span className="font-extrabold text-brand-dark whitespace-nowrap ml-2">
                    R$ {(t.amount_cents / 100).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-center" style={{ color: 'rgba(26,10,0,0.4)' }}>
            ✓ Transações salvas. Revisão e buckets chegam na próxima sessão.
          </p>
        </div>
      )}
    </div>
  )
}
