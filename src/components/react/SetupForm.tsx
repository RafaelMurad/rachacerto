import { useState } from 'react'
import { ulid } from 'ulid'
import type { Person } from '../../lib/types'

const COLORS = [
  '#FF6B35', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#DDA0DD', '#F7DC6F', '#98D8C8', '#FF8B94',
]

type CreatedTrip = {
  slug: string
  people: Array<{ id: string; name: string; color: string; invite_token: string }>
}

export default function SetupForm() {
  const [tripName, setTripName] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [personInput, setPersonInput] = useState('')
  const [errors, setErrors] = useState<{ name?: string; people?: string; submit?: string }>({})
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState<CreatedTrip | null>(null)

  const addPerson = () => {
    const name = personInput.trim()
    if (!name) return
    setPeople(prev => [
      ...prev,
      { id: ulid(), name, color: COLORS[prev.length % COLORS.length] },
    ])
    setPersonInput('')
  }

  const handlePersonKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addPerson() }
  }

  const removePerson = (id: string) =>
    setPeople(prev => prev.filter(p => p.id !== id))

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!tripName.trim()) errs.name = 'Nome do acerto é obrigatório'
    if (people.length < 2) errs.people = 'Adicione pelo menos 2 pessoas'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    setErrors({})
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tripName.trim(), people }),
      })
      const data = await res.json() as { slug?: string; people?: CreatedTrip['people']; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro ao criar acerto')
      setCreated({ slug: data.slug!, people: data.people! })
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Erro inesperado' })
    } finally {
      setLoading(false)
    }
  }

  // ── Confirmation screen ──────────────────────────────────────────────────
  if (created) {
    const tripUrl = `${window.location.origin}/t/${created.slug}`
    return (
      <div className="font-mono">
        <div className="border-2 border-brand-dark p-4 mb-6">
          <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: 'rgba(26,10,0,0.5)' }}>
            Link do acerto
          </p>
          <p className="text-sm font-bold text-brand-dark break-all">{tripUrl}</p>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(tripUrl)}
            className="mt-2 text-xs font-bold text-brand-orange hover:underline"
          >
            Copiar link
          </button>
        </div>

        <div className="mb-6">
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'rgba(26,10,0,0.5)' }}>
            Links de convite (um por pessoa)
          </p>
          <div className="flex flex-col gap-2">
            {created.people.map(p => {
              const inviteUrl = `${window.location.origin}/t/${created.slug}/join/${p.invite_token}`
              return (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-sm font-bold text-brand-dark">{p.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(inviteUrl)}
                    className="text-xs font-bold text-brand-orange hover:underline whitespace-nowrap"
                  >
                    Copiar convite
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <a
          href={`/t/${created.slug}`}
          className="block w-full bg-brand-dark text-brand-orange font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-orange hover:text-brand-dark transition-colors text-center"
        >
          → IR PARA O ACERTO
        </a>
      </div>
    )
  }

  // ── Creation form ────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="font-mono">
      {/* Nome do acerto */}
      <div className="mb-6">
        <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'rgba(26,10,0,0.5)' }}>
          Nome do acerto
        </label>
        <input
          type="text"
          value={tripName}
          onChange={e => setTripName(e.target.value)}
          placeholder="ex: Viagem PG · Abril 2026"
          maxLength={60}
          className="w-full border-2 border-brand-dark bg-transparent px-3 py-2 text-sm text-brand-dark placeholder:opacity-30 focus:outline-none focus:border-brand-orange"
        />
        {errors.name && <p className="text-red-600 text-xs mt-1">{errors.name}</p>}
      </div>

      {/* Pessoas */}
      <div className="mb-8">
        <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'rgba(26,10,0,0.5)' }}>
          Pessoas
        </label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={personInput}
            onChange={e => setPersonInput(e.target.value)}
            onKeyDown={handlePersonKeyDown}
            placeholder="Nome da pessoa"
            className="flex-1 border-2 border-brand-dark bg-transparent px-3 py-2 text-sm text-brand-dark placeholder:opacity-30 focus:outline-none focus:border-brand-orange"
          />
          <button
            type="button"
            onClick={addPerson}
            className="bg-brand-dark text-brand-orange font-extrabold px-4 py-2 text-sm hover:bg-brand-orange hover:text-brand-dark transition-colors"
          >
            +
          </button>
        </div>
        <div className="flex flex-wrap gap-2 min-h-[28px]">
          {people.map(person => (
            <span
              key={person.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: person.color }}
            >
              {person.name}
              <button
                type="button"
                onClick={() => removePerson(person.id)}
                className="opacity-70 hover:opacity-100 leading-none"
                aria-label={`Remover ${person.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {errors.people && <p className="text-red-600 text-xs mt-2">{errors.people}</p>}
      </div>

      {errors.submit && (
        <p className="text-red-600 text-xs mb-4 border border-red-600 px-3 py-2">{errors.submit}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-dark text-brand-orange font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-orange hover:text-brand-dark transition-colors disabled:opacity-50"
      >
        {loading ? '⏳ CRIANDO...' : '→ CRIAR ACERTO'}
      </button>
    </form>
  )
}
