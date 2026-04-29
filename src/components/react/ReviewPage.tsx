import { useState, useEffect, useCallback } from 'react'
import type { Transaction, BucketWithMembers, Person } from '../../lib/types'

interface Props {
  slug: string
  people: Person[]
}

type Tab = 'transactions' | 'buckets'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function sourceBadge(source: Transaction['source']): string {
  if (source === 'chat') return 'chat'
  if (source === 'statement') return 'extrato'
  return 'manual'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PersonDot({ person }: { person: Person | undefined }) {
  if (!person) return <span className="w-3 h-3 rounded-full bg-gray-300 flex-shrink-0 inline-block" />
  return (
    <span
      className="w-3 h-3 rounded-full flex-shrink-0 inline-block"
      style={{ backgroundColor: person.color }}
      title={person.name}
    />
  )
}

interface TransactionRowProps {
  tx: Transaction
  people: Person[]
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => void
}

function TransactionRow({ tx, people, onEdit, onDelete }: TransactionRowProps) {
  const payer = people.find(p => p.id === tx.payerId)
  return (
    <div className="flex items-center gap-3 py-3 border-b border-brand-dark/10">
      <PersonDot person={payer} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-brand-dark truncate">{tx.description}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs px-1.5 py-0.5 font-bold" style={{ background: 'rgba(26,10,0,0.08)' }}>
            {sourceBadge(tx.source)}
          </span>
          <span className="text-xs" style={{ color: 'rgba(26,10,0,0.4)' }}>{tx.date}</span>
          {!tx.payerId && (
            <span className="text-xs text-red-600 font-bold">⚠ pagador não identificado</span>
          )}
        </div>
      </div>
      <span className="text-sm font-bold text-brand-dark whitespace-nowrap">{formatCents(tx.amount_cents)}</span>
      <button
        onClick={() => onEdit(tx)}
        className="text-xs font-bold text-brand-orange hover:underline ml-1"
        aria-label="Editar"
      >
        ✎
      </button>
      <button
        onClick={() => onDelete(tx.id)}
        className="text-xs font-bold text-red-500 hover:underline"
        aria-label="Deletar"
      >
        ✕
      </button>
    </div>
  )
}

interface EditFormProps {
  tx: Transaction | null  // null = new transaction
  people: Person[]
  buckets: BucketWithMembers[]
  onSave: (tx: Transaction) => void
  onCancel: () => void
  slug: string
}

function EditForm({ tx, people, buckets, onSave, onCancel, slug }: EditFormProps) {
  const [description, setDescription] = useState(tx?.description ?? '')
  const [amountStr, setAmountStr] = useState(tx ? String(tx.amount_cents / 100) : '')
  const [date, setDate] = useState(tx?.date ?? '')
  const [payerId, setPayerId] = useState(tx?.payerId ?? '')
  const [bucketId, setBucketId] = useState(tx?.bucketId ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount_cents = Math.round(parseFloat(amountStr.replace(',', '.')) * 100)
    if (!description.trim() || !date || isNaN(amount_cents) || amount_cents <= 0) {
      setError('Preencha descrição, valor e data')
      return
    }

    setLoading(true)
    setError('')
    try {
      const body = {
        description: description.trim(),
        amount_cents,
        date,
        payer_id: payerId || null,
        bucket_id: bucketId || null,
      }

      const url = tx
        ? `/api/trips/${slug}/transactions/${tx.id}`
        : `/api/trips/${slug}/transactions`
      const method = tx ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { transaction?: Transaction; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar')
      if (!data.transaction) throw new Error('Resposta inválida do servidor')
      onSave(data.transaction)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'border-2 border-brand-dark bg-transparent px-2 py-1.5 text-sm text-brand-dark focus:outline-none focus:border-brand-orange w-full'

  return (
    <form onSubmit={handleSubmit} className="bg-amber-50 border-2 border-brand-orange p-4 mb-2">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <label className="text-xs font-bold uppercase tracking-widest block mb-1" style={{ color: 'rgba(26,10,0,0.5)' }}>Descrição</label>
          <input className={inputClass} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Jantar" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest block mb-1" style={{ color: 'rgba(26,10,0,0.5)' }}>Valor (R$)</label>
          <input className={inputClass} type="text" inputMode="decimal" value={amountStr} onChange={e => setAmountStr(e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest block mb-1" style={{ color: 'rgba(26,10,0,0.5)' }}>Data</label>
          <input className={inputClass} type="text" value={date} onChange={e => setDate(e.target.value)} placeholder="DD/MM/AAAA" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest block mb-1" style={{ color: 'rgba(26,10,0,0.5)' }}>Pagador</label>
          <select className={inputClass} value={payerId} onChange={e => setPayerId(e.target.value)}>
            <option value="">— não identificado</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest block mb-1" style={{ color: 'rgba(26,10,0,0.5)' }}>Bucket</label>
          <select className={inputClass} value={bucketId} onChange={e => setBucketId(e.target.value)}>
            <option value="">— Todos (padrão)</option>
            {buckets.filter(b => !b.isDefault).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-red-600 text-xs mb-3 border border-red-600 px-2 py-1">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="bg-brand-dark text-brand-orange font-extrabold tracking-widest text-xs px-4 py-2 hover:bg-brand-orange hover:text-brand-dark transition-colors disabled:opacity-50">
          {loading ? '⏳' : tx ? 'SALVAR' : 'ADICIONAR'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-bold text-brand-dark border-2 border-brand-dark px-4 py-2 hover:bg-brand-dark/10 transition-colors">
          CANCELAR
        </button>
      </div>
    </form>
  )
}

// ── BucketCard ────────────────────────────────────────────────────────────────

interface BucketCardProps {
  bucket: BucketWithMembers
  people: Person[]
  onToggleMember: (bucketId: string, personId: string, currentlyIn: boolean) => void
  onDelete: (bucketId: string) => void
  onRename: (bucketId: string, name: string) => void
}

function BucketCard({ bucket, people, onToggleMember, onDelete, onRename }: BucketCardProps) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(bucket.name)

  const handleRename = () => {
    if (nameVal.trim() && nameVal !== bucket.name) onRename(bucket.id, nameVal.trim())
    setEditing(false)
  }

  return (
    <div className="border-2 border-brand-dark/20 p-4 mb-3">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          {editing && !bucket.isDefault ? (
            <input
              autoFocus
              className="text-sm font-bold border-b-2 border-brand-orange bg-transparent outline-none text-brand-dark"
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
            />
          ) : (
            <button
              onClick={() => !bucket.isDefault && setEditing(true)}
              className={`text-sm font-bold text-brand-dark ${bucket.isDefault ? '' : 'hover:text-brand-orange cursor-text'}`}
            >
              {bucket.name}
              {bucket.isDefault && <span className="ml-2 text-xs font-normal" style={{ color: 'rgba(26,10,0,0.4)' }}>padrão</span>}
            </button>
          )}
          <p className="text-xs mt-1" style={{ color: 'rgba(26,10,0,0.4)' }}>
            {bucket.transactionCount} transações · {formatCents(bucket.totalCents)}
          </p>
        </div>
        {!bucket.isDefault && (
          <button onClick={() => onDelete(bucket.id)} className="text-xs text-red-500 hover:underline font-bold ml-2">
            ✕ DELETAR
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {people.map(p => {
          const isMember = bucket.memberIds.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => !bucket.isDefault && onToggleMember(bucket.id, p.id, isMember)}
              disabled={bucket.isDefault}
              className="flex items-center gap-1.5 px-2 py-1 border text-xs font-bold transition-colors"
              style={{
                borderColor: isMember ? p.color : 'rgba(26,10,0,0.2)',
                background: isMember ? `${p.color}22` : 'transparent',
                color: '#1a0a00',
                cursor: bucket.isDefault ? 'default' : 'pointer',
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReviewPage({ slug, people }: Props) {
  const [tab, setTab] = useState<Tab>('transactions')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [buckets, setBuckets] = useState<BucketWithMembers[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTx, setEditingTx] = useState<Transaction | 'new' | null>(null)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [txRes, bktRes] = await Promise.all([
        fetch(`/api/trips/${slug}/transactions`),
        fetch(`/api/trips/${slug}/buckets`),
      ])
      const txData = await txRes.json() as { transactions?: Transaction[] }
      const bktData = await bktRes.json() as { buckets?: BucketWithMembers[] }
      setTransactions(txData.transactions ?? [])
      setBuckets(bktData.buckets ?? [])
    } catch {
      setError('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { loadData() }, [loadData])

  const handleTxSaved = (tx: Transaction) => {
    setTransactions(prev => {
      const idx = prev.findIndex(t => t.id === tx.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = tx
        return next
      }
      return [tx, ...prev]
    })
    setEditingTx(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar esta transação?')) return
    try {
      const res = await fetch(`/api/trips/${slug}/transactions/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Erro ao deletar')
      }
      setTransactions(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar transação')
    }
  }

  const handleToggleMember = async (bucketId: string, personId: string, currentlyIn: boolean) => {
    const bucket = buckets.find(b => b.id === bucketId)
    if (!bucket) return
    const newMemberIds = currentlyIn
      ? bucket.memberIds.filter(id => id !== personId)
      : [...bucket.memberIds, personId]

    try {
      const res = await fetch(`/api/trips/${slug}/buckets/${bucketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: newMemberIds }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Erro ao atualizar membros')
      }
      setBuckets(prev => prev.map(b => b.id === bucketId ? { ...b, memberIds: newMemberIds } : b))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar membros')
    }
  }

  const handleDeleteBucket = async (bucketId: string) => {
    if (!confirm('Deletar este bucket? As transações voltam para "Todos".')) return
    try {
      const res = await fetch(`/api/trips/${slug}/buckets/${bucketId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Erro ao deletar bucket')
      }
      setBuckets(prev => prev.filter(b => b.id !== bucketId))
      setTransactions(prev => prev.map(t => t.bucketId === bucketId ? { ...t, bucketId: null } : t))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar bucket')
    }
  }

  const handleRenameBucket = async (bucketId: string, name: string) => {
    try {
      const res = await fetch(`/api/trips/${slug}/buckets/${bucketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Erro ao renomear bucket')
      }
      setBuckets(prev => prev.map(b => b.id === bucketId ? { ...b, name } : b))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao renomear bucket')
    }
  }

  const handleCreateBucket = async () => {
    try {
      const res = await fetch(`/api/trips/${slug}/buckets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Novo bucket', memberIds: people.map(p => p.id) }),
      })
      const data = await res.json() as { bucket?: BucketWithMembers; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar bucket')
      if (data.bucket) setBuckets(prev => [...prev, data.bucket!])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar bucket')
    }
  }

  const tabBtn = (t: Tab, label: string, count: number) => (
    <button
      onClick={() => setTab(t)}
      className="flex-1 py-3 font-mono text-xs font-extrabold tracking-widest uppercase border-b-2 transition-colors"
      style={{
        borderColor: tab === t ? '#ff6b35' : 'transparent',
        color: tab === t ? '#ff6b35' : 'rgba(26,10,0,0.4)',
      }}
    >
      {label} ({count})
    </button>
  )

  if (loading) return <p className="font-mono text-sm text-brand-dark/40 py-8 text-center">Carregando...</p>

  return (
    <div className="font-mono">
      {error && <p className="text-red-600 text-xs mb-4 border border-red-600 px-3 py-2">{error}</p>}

      {/* Tabs */}
      <div className="flex border-b-2 border-brand-dark/10 mb-6">
        {tabBtn('transactions', 'Transações', transactions.length)}
        {tabBtn('buckets', 'Buckets', buckets.length)}
      </div>

      {/* Transactions tab */}
      {tab === 'transactions' && (
        <div>
          {editingTx && editingTx !== 'new' && (
            <EditForm tx={editingTx} people={people} buckets={buckets} onSave={handleTxSaved} onCancel={() => setEditingTx(null)} slug={slug} />
          )}
          {transactions.map(tx => (
            editingTx === tx ? null : (
              <TransactionRow key={tx.id} tx={tx} people={people} onEdit={setEditingTx} onDelete={handleDelete} />
            )
          ))}
          {editingTx === 'new' && (
            <EditForm tx={null} people={people} buckets={buckets} onSave={handleTxSaved} onCancel={() => setEditingTx(null)} slug={slug} />
          )}
          <button
            onClick={() => setEditingTx('new')}
            className="w-full mt-4 border-2 border-dashed border-brand-dark/30 text-xs font-bold tracking-widest text-brand-dark/40 py-3 hover:border-brand-orange hover:text-brand-orange transition-colors"
          >
            + ADICIONAR TRANSAÇÃO
          </button>
          <a
            href={`/t/${slug}/result`}
            className="block w-full mt-6 bg-brand-dark text-brand-orange font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-orange hover:text-brand-dark transition-colors text-center"
          >
            → VER QUEM DEVE QUANTO
          </a>
        </div>
      )}

      {/* Buckets tab */}
      {tab === 'buckets' && (
        <div>
          {buckets.map(b => (
            <BucketCard
              key={b.id}
              bucket={b}
              people={people}
              onToggleMember={handleToggleMember}
              onDelete={handleDeleteBucket}
              onRename={handleRenameBucket}
            />
          ))}
          <button
            onClick={handleCreateBucket}
            className="w-full mt-2 border-2 border-dashed border-brand-dark/30 text-xs font-bold tracking-widest text-brand-dark/40 py-3 hover:border-brand-orange hover:text-brand-orange transition-colors"
          >
            + NOVO BUCKET
          </button>
          <a
            href={`/t/${slug}/result`}
            className="block w-full mt-6 bg-brand-dark text-brand-orange font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-orange hover:text-brand-dark transition-colors text-center"
          >
            → VER QUEM DEVE QUANTO
          </a>
        </div>
      )}
    </div>
  )
}
