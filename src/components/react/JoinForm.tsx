import { useState } from 'react'

type Person = { id: string; name: string; color: string; hasPin: boolean }

interface Props {
  slug: string
  people: Person[]
}

export default function JoinForm({ slug, people }: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selected = people.find(p => p.id === selectedId)

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedId) { setError('Selecione seu nome'); return }
    if (selected?.hasPin && !pin) { setError('Digite seu PIN'); return }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, personId: selectedId, pin: pin || undefined }),
      })
      const data = await res.json() as { error?: string; requiresPin?: boolean }
      if (!res.ok) {
        if (data.requiresPin) { setError('Digite seu PIN'); return }
        throw new Error(data.error ?? 'Erro ao entrar')
      }
      window.location.href = `/t/${slug}/upload`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="font-mono">
      <div className="mb-6">
        <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'rgba(26,10,0,0.5)' }}>
          Você é...
        </label>
        <div className="flex flex-col gap-2">
          {people.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setSelectedId(p.id); setPin('') }}
              className="flex items-center gap-3 px-3 py-2.5 border-2 text-left transition-colors"
              style={{
                borderColor: selectedId === p.id ? '#ff6b35' : '#1a0a00',
                background: selectedId === p.id ? 'rgba(255,107,53,0.08)' : 'transparent',
              }}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className="text-sm font-bold text-brand-dark">{p.name}</span>
              {p.hasPin && (
                <span className="ml-auto text-xs" style={{ color: 'rgba(26,10,0,0.4)' }}>🔒</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {selected?.hasPin && (
        <div className="mb-6">
          <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'rgba(26,10,0,0.5)' }}>
            PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="4 dígitos"
            className="w-full border-2 border-brand-dark bg-transparent px-3 py-2 text-sm text-brand-dark placeholder:opacity-30 focus:outline-none focus:border-brand-orange"
          />
        </div>
      )}

      {error && (
        <p className="text-red-600 text-xs mb-4 border border-red-600 px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !selectedId}
        className="w-full bg-brand-dark text-brand-orange font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-orange hover:text-brand-dark transition-colors disabled:opacity-50"
      >
        {loading ? '⏳ ENTRANDO...' : '→ ENTRAR NO ACERTO'}
      </button>
    </form>
  )
}
