import { useState, useCallback } from 'react'
import type { Transaction } from '../../lib/types'

interface Props {
  slug: string
  personName: string
  personColor: string
}

type Tab = 'statement' | 'chat'

export default function UploadPanel({ slug, personName, personColor }: Props) {
  const [tab, setTab] = useState<Tab>('statement')
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')

  // ── Statement upload ──────────────────────────────────────────────────────

  const uploadStatement = useCallback(async (file: File) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) {
      setError('Tipo de arquivo não suportado — use PDF, PNG ou JPG')
      return
    }
    setLoading(true)
    setError('')
    setWarning('')
    setTransactions([])
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/trips/${slug}/upload-statement`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json() as { transactions?: Transaction[]; error?: string; warning?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na extração')
      setTransactions(data.transactions ?? [])
      if (data.warning) setWarning(data.warning)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [slug])

  const handleStatementDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadStatement(file)
  }, [slug, uploadStatement])

  // ── Chat upload ───────────────────────────────────────────────────────────

  const [chatText, setChatText] = useState('')
  const [chatPreview, setChatPreview] = useState<string[]>([])

  const loadChatText = (content: string) => {
    setChatText(content)
    setChatPreview(content.split('\n').filter(l => l.trim()).slice(0, 5))
    setError('')
    setTransactions([])
    setWarning('')
  }

  const handleChatFile = useCallback((file: File) => {
    if (!file.name.endsWith('.txt')) {
      setError('Apenas arquivos .txt são aceitos')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      if (typeof e.target?.result === 'string') loadChatText(e.target.result)
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  const handleChatDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleChatFile(file)
  }, [handleChatFile])

  const handleChatPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = e.clipboardData.getData('text')
    if (pasted) loadChatText(pasted)
  }, [])

  const extractChat = async () => {
    if (!chatText) return
    setLoading(true)
    setError('')
    setWarning('')
    setTransactions([])
    try {
      const res = await fetch(`/api/trips/${slug}/upload-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatText }),
      })
      const data = await res.json() as { transactions?: Transaction[]; error?: string; warning?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na extração')
      setTransactions(data.transactions ?? [])
      if (data.warning) setWarning(data.warning)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="font-mono">
      {/* Identity chip */}
      <div className="flex items-center gap-2 mb-6 px-3 py-2 border-2" style={{ borderColor: personColor }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: personColor }} />
        <span className="text-sm font-bold text-brand-dark">Você é {personName}</span>
      </div>

      {/* Tab selector */}
      <div className="flex gap-0 mb-6 border-2 border-brand-dark">
        {(['statement', 'chat'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setError(''); setWarning(''); setTransactions([]) }}
            className="flex-1 py-2 text-xs font-extrabold tracking-widest transition-colors"
            style={{
              background: tab === t ? '#1a0a00' : 'transparent',
              color: tab === t ? '#ff6b35' : '#1a0a00',
            }}
          >
            {t === 'statement' ? 'EXTRATO' : 'CHAT'}
          </button>
        ))}
      </div>

      {/* Statement tab */}
      {tab === 'statement' && (
        <div>
          <div
            onDrop={handleStatementDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            className="border-2 border-dashed p-8 text-center mb-4 transition-colors"
            style={{
              borderColor: isDragging ? '#ff6b35' : '#1a0a00',
              background: isDragging ? 'rgba(255,107,53,0.08)' : 'transparent',
            }}
          >
            <input
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              id="statement-file"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadStatement(f) }}
            />
            <label htmlFor="statement-file" className="cursor-pointer block">
              <p className="text-sm font-bold text-brand-dark mb-1">
                Arraste o extrato aqui ou clique para selecionar
              </p>
              <p className="text-xs" style={{ color: 'rgba(26,10,0,0.5)' }}>
                PDF, PNG ou JPG · máx 10 MB
              </p>
            </label>
          </div>
        </div>
      )}

      {/* Chat tab */}
      {tab === 'chat' && (
        <div>
          <div
            onDrop={handleChatDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onPaste={handleChatPaste}
            tabIndex={0}
            className="border-2 border-dashed p-8 text-center mb-4 transition-colors focus:outline-none"
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
              onChange={e => { const f = e.target.files?.[0]; if (f) handleChatFile(f) }}
            />
            <label htmlFor="chat-file" className="cursor-pointer block">
              <p className="text-sm font-bold text-brand-dark mb-1">
                {chatText ? '✓ Chat carregado' : 'Arraste o .txt aqui ou clique para selecionar'}
              </p>
              <p className="text-xs" style={{ color: 'rgba(26,10,0,0.5)' }}>
                Ou cole o texto com Ctrl+V
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(26,10,0,0.4)' }}>
                WhatsApp → ⋮ → Mais → Exportar conversa → Sem mídia
              </p>
            </label>
          </div>
          {chatPreview.length > 0 && (
            <div className="bg-brand-dark text-brand-cream text-xs p-3 mb-4">
              <p className="text-brand-orange mb-1 tracking-widest uppercase text-xs">Preview:</p>
              {chatPreview.map((line, i) => (
                <p key={i} className="truncate" style={{ opacity: 0.6 }}>{line}</p>
              ))}
              <p style={{ opacity: 0.3 }} className="mt-1">...</p>
            </div>
          )}
          {chatText && !transactions.length && (
            <button
              onClick={extractChat}
              disabled={loading}
              className="w-full bg-brand-dark text-brand-orange font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-orange hover:text-brand-dark transition-colors disabled:opacity-50 mb-4"
            >
              {loading ? 'LENDO O CHAT...' : '→ EXTRAIR TRANSAÇÕES'}
            </button>
          )}
        </div>
      )}

      {loading && tab === 'statement' && (
        <p className="text-xs text-center py-4" style={{ color: 'rgba(26,10,0,0.5)' }}>
          Processando com IA...
        </p>
      )}

      {error && (
        <p className="text-xs font-bold mb-4 border border-red-600 text-red-600 px-3 py-2">
          {error}
        </p>
      )}

      {warning && (
        <p className="text-xs font-bold mb-4 border border-brand-orange text-brand-orange px-3 py-2">
          {warning}
        </p>
      )}

      {transactions.length > 0 && (
        <div>
          <p className="text-xs tracking-widest uppercase mb-3" style={{ color: 'rgba(26,10,0,0.5)' }}>
            {transactions.length} transações salvas
          </p>
          <div className="flex flex-col gap-1.5">
            {transactions.map(t => (
              <div
                key={t.id}
                className="flex items-center justify-between text-sm px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.6)' }}
              >
                <span className="truncate" style={{ color: 'rgba(26,10,0,0.7)' }}>
                  {t.description}
                </span>
                <span className="font-extrabold text-brand-dark whitespace-nowrap ml-2">
                  R$ {(t.amount_cents / 100).toFixed(2).replace('.', ',')}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-center mt-4" style={{ color: 'rgba(26,10,0,0.4)' }}>
            Salvo. Você pode enviar outro arquivo ou fechar.
          </p>
        </div>
      )}
    </div>
  )
}
