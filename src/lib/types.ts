export type Person = {
  id: string      // ULID
  name: string
  color: string   // hex da paleta, ex: '#FF6B35'
}

export type Trip = {
  id: string      // ULID
  name: string
  people: Person[]
  createdAt: string // ISO 8601
}

export type Transaction = {
  id: string          // ULID
  date: string        // 'DD/MM/YYYY' ou string do chat
  description: string
  amount: number      // em centavos — R$10,50 = 1050
  payerId: string     // Person.id, ou '' se pagador não identificado
  raw: string         // linha original do chat
}
