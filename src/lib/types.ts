export type Person = {
  id: string      // ULID
  name: string
  color: string   // hex da paleta, ex: '#FF6B35'
}

export type Trip = {
  id: string       // ULID
  slug: string     // 8-char URL-safe string
  name: string
  people: Person[]
  createdAt: string // ISO 8601
}

export type Transaction = {
  id: string               // ULID
  date: string             // 'DD/MM/YYYY'
  description: string
  amount_cents: number     // em centavos — R$10,50 = 1050
  payerId: string | null   // Person.id, ou null se pagador não identificado
  source: 'chat' | 'statement' | 'manual'
  raw: string | null       // linha original ou null
}
