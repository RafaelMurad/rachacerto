import { useState, useEffect, useCallback } from 'react'
import type { PersonBalance, Settlement } from '../../lib/types'

interface Props {
  slug: string
  currentPersonId: string | null
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface QRButtonProps {
  settlement: Settlement
  slug: string
  currentPersonId: string | null
  onPixKeySaved: () => void
}

function QRButton({ settlement, slug, currentPersonId, onPixKeySaved }: QRButtonProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [pixInput, setPixInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isCurrentUserRecipient = settlement.toId === currentPersonId

  // Case 1: No PIX key, current user IS the recipient → show input to add key
  if (!settlement.toPixKey && isCurrentUserRecipient) {
    const handleSave = async () => {
      const key = pixInput.trim()
      if (!key) return
      setSaving(true)
      setSaveError(null)
      try {
        const res = await fetch(`/api/people/${settlement.toId}/pix-key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pixKey: key, slug }),
        })
        const data = await res.json() as { ok?: boolean; error?: string }
        if (!res.ok || !data.ok) {
          setSaveError(data.error ?? 'Erro ao salvar chave')
          return
        }
        onPixKeySaved()
      } catch {
        setSaveError('Erro de rede')
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="mt-1">
        <p className="text-xs mb-2" style={{ color: 'rgba(26,10,0,0.5)' }}>
          Adicione sua chave PIX para {settlement.fromName} pagar via QR:
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={pixInput}
            onChange={e => setPixInput(e.target.value)}
            placeholder="CPF, e-mail, celular ou chave aleatória"
            className="flex-1 border border-brand-dark/30 px-2 py-1 text-xs font-mono text-brand-dark bg-transparent focus:outline-none focus:border-brand-orange"
          />
          <button
            onClick={handleSave}
            disabled={saving || !pixInput.trim()}
            className="text-xs font-bold text-brand-orange border border-brand-orange px-2 py-1 hover:bg-brand-orange hover:text-white transition-colors disabled:opacity-40"
          >
            {saving ? '⏳' : 'SALVAR'}
          </button>
        </div>
        {saveError && <p className="text-xs text-red-600 mt-1">{saveError}</p>}
      </div>
    )
  }

  // Case 2: No PIX key, current user is NOT the recipient → show message
  if (!settlement.toPixKey) {
    return (
      <span className="text-xs" style={{ color: 'rgba(26,10,0,0.4)' }}>
        Peça a chave PIX de {settlement.toName}
      </span>
    )
  }

  // Case 3: PIX key exists — show QR generate button
  const handleGenerate = async () => {
    setLoading(true)
    setQrError(null)
    try {
      const res = await fetch(`/api/trips/${slug}/settlement/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pixKey: settlement.toPixKey,
          amountCents: settlement.amountCents,
          merchantName: settlement.toName,
        }),
      })
      const data = await res.json() as { qrUrl?: string; brCode?: string; error?: string }
      if (!res.ok || !data.qrUrl) {
        setQrError(data.error ?? 'Não foi possível gerar o QR. Verifique a chave PIX.')
        return
      }
      setQrUrl(data.qrUrl)
    } catch {
      setQrError('Erro de rede ao gerar QR')
    } finally {
      setLoading(false)
    }
  }

  if (qrUrl) {
    return (
      <div className="mt-2">
        <img src={qrUrl} alt="QR PIX" className="w-40 h-40 border-2 border-brand-dark" />
        <p className="text-xs mt-1 font-mono break-all" style={{ color: 'rgba(26,10,0,0.5)' }}>
          Chave: {settlement.toPixKey}
        </p>
        <button
          onClick={() => navigator.clipboard.writeText(settlement.toPixKey!)}
          className="text-xs font-bold text-brand-orange hover:underline mt-1"
        >
          COPIAR CHAVE
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="text-xs font-bold text-brand-orange border border-brand-orange px-2 py-1 hover:bg-brand-orange hover:text-white transition-colors disabled:opacity-50"
      >
        {loading ? '⏳' : '→ VER QR PIX'}
      </button>
      {qrError && (
        <p className="text-xs text-red-600 mt-1">{qrError}</p>
      )}
    </div>
  )
}

export default function ResultPage({ slug, currentPersonId }: Props) {
  const [balances, setBalances] = useState<PersonBalance[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSettlement = useCallback(() => {
    setLoading(true)
    fetch(`/api/trips/${slug}/settlement`)
      .then(r => r.json())
      .then((data: { balances?: PersonBalance[]; settlements?: Settlement[]; error?: string }) => {
        if (data.error) { setError(data.error); return }
        setBalances(data.balances ?? [])
        setSettlements(data.settlements ?? [])
      })
      .catch(() => setError('Erro ao carregar resultado'))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => { loadSettlement() }, [loadSettlement])

  if (loading) return <p className="font-mono text-sm text-brand-dark/40 py-8 text-center">Calculando...</p>
  if (error) return <p className="font-mono text-sm text-red-600 py-4 border border-red-600 px-3">{error}</p>

  return (
    <div className="font-mono">
      {/* Balances */}
      <div className="mb-8">
        <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'rgba(26,10,0,0.5)' }}>
          Resumo
        </p>
        <div className="grid grid-cols-1 gap-3">
          {balances.map(b => (
            <div key={b.personId} className="flex items-center justify-between py-3 border-b border-brand-dark/10">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: b.personColor }} />
                <span className="text-sm font-bold text-brand-dark">{b.personName}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold" style={{ color: b.netCents >= 0 ? '#16a34a' : '#dc2626' }}>
                  {b.netCents >= 0 ? '+' : ''}{formatCents(b.netCents)}
                </p>
                <p className="text-xs" style={{ color: 'rgba(26,10,0,0.4)' }}>
                  pagou {formatCents(b.paidCents)} · devia {formatCents(b.owedCents)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Settlements */}
      <div>
        <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'rgba(26,10,0,0.5)' }}>
          Transferências
        </p>
        {settlements.length === 0 && (
          <p className="text-sm text-brand-dark/60">Tudo certo! Nenhuma transferência necessária.</p>
        )}
        {settlements.map((s, i) => (
          <div key={i} className="border-2 border-brand-dark/15 p-4 mb-3">
            <p className="text-sm font-bold text-brand-dark mb-1">
              {s.fromName} → {s.toName}
            </p>
            <p className="text-lg font-extrabold text-brand-dark mb-3">{formatCents(s.amountCents)}</p>
            <QRButton
              settlement={s}
              slug={slug}
              currentPersonId={currentPersonId}
              onPixKeySaved={loadSettlement}
            />
          </div>
        ))}
      </div>

      <a
        href={`/t/${slug}/review`}
        className="block w-full mt-8 border-2 border-brand-dark text-brand-dark font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-dark hover:text-brand-orange transition-colors text-center"
      >
        ← VOLTAR PARA REVISÃO
      </a>
    </div>
  )
}
