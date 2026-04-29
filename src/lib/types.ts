export type Person = {
  id: string      // ULID
  name: string
  color: string   // hex da paleta, ex: '#FF6B35'
  pixKey?: string
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
  bucketId: string | null  // null = belongs to default "Todos" bucket
}

export type Bucket = {
  id: string
  tripId: string
  name: string
  isDefault: boolean  // true for "Todos" — cannot be deleted
}

export type BucketWithMembers = Bucket & {
  memberIds: string[]
  transactionCount: number
  totalCents: number
}

export type PersonBalance = {
  personId: string
  personName: string
  personColor: string
  paidCents: number
  owedCents: number
  netCents: number  // positive = creditor, negative = debtor
}

export type Settlement = {
  fromId: string
  fromName: string
  toId: string
  toName: string
  toPixKey: string | null
  amountCents: number
}
