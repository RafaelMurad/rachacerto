# RachaCerto Sessão 3 — Collaborative Trips + Statement Upload

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from single-browser sessionStorage to Supabase-backed collaborative trips where each participant joins from their own device, uploads their own bank statement (PDF or screenshot), and transactions are attributed automatically by identity.

**Architecture:** Trip creation saves to Supabase; each person joins via name picker, invite link, or PIN and gets a 30-day session cookie; personal uploads go to `/t/[slug]/upload` where the session determines `payer_id` automatically — no AI inference needed for statements. The WhatsApp chat upload is migrated to the same upload page.

**Tech Stack:** Astro 6 SSR, React 19 islands, `@supabase/supabase-js` v2 (REST, Fetch API — edge-compatible), `unpdf` for PDF text extraction, Anthropic Haiku 4.5 for both text and vision extraction, Cloudflare Workers (Web Crypto API for tokens/hashes), Tailwind v4.

---

## File Map

**New files:**
- `src/lib/supabase.ts` — Supabase client factory
- `src/lib/slug.ts` — slug + token generators, PIN hasher (Web Crypto)
- `src/lib/session.ts` — session cookie helpers + DB validation
- `src/pages/api/trips.ts` — `POST /api/trips`
- `src/pages/api/sessions.ts` — `POST /api/sessions`
- `src/pages/api/sessions/[slug].ts` — `GET /api/sessions/[slug]`
- `src/pages/api/trips/[slug]/upload-statement.ts` — multipart upload + extract + save
- `src/pages/api/trips/[slug]/upload-chat.ts` — chat text upload + extract + save
- `src/pages/t/[slug].astro` — trip home page
- `src/pages/t/[slug]/join.astro` — name picker join page
- `src/pages/t/[slug]/join/[token].astro` — invite link instant join
- `src/pages/t/[slug]/upload.astro` — protected personal upload page
- `src/components/react/JoinForm.tsx` — name picker + PIN island
- `src/components/react/UploadPanel.tsx` — two-tab statement+chat upload island

**Modified files:**
- `src/env.d.ts` — add SUPABASE_URL, SUPABASE_SERVICE_KEY
- `src/lib/types.ts` — update Transaction (amount→amount_cents, payerId nullable, source), add slug to Trip
- `src/lib/claude.ts` — rename amount→amount_cents in chat extraction; add statement text + vision extractors
- `src/components/react/SetupForm.tsx` — POST to `/api/trips`, show trip URL + invite links
- `src/components/react/ChatUploader.tsx` — fix amount_cents reference (temporary, file deleted in Task 13)

**Deleted files (Task 13):**
- `src/pages/novo/upload.astro`
- `src/components/react/ChatUploader.tsx`
- `src/pages/api/extract-chat.ts`

---

## Task 1: Install Supabase + update types + rename amount→amount_cents

**Files:**
- Modify: `package.json` (via pnpm add)
- Modify: `src/env.d.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/claude.ts`
- Modify: `src/components/react/ChatUploader.tsx`

- [ ] **Step 1: Install @supabase/supabase-js**

```bash
cd /Users/rafa/Code/rachAcerto && pnpm add @supabase/supabase-js
```

Expected: `@supabase/supabase-js 2.x.x` added to package.json dependencies.

- [ ] **Step 2: Update src/env.d.ts**

Replace the entire file with:

```typescript
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly ANTHROPIC_API_KEY: string
  readonly SUPABASE_URL: string
  readonly SUPABASE_SERVICE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 3: Update src/lib/types.ts**

Replace the entire file with:

```typescript
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
```

- [ ] **Step 4: Update src/lib/claude.ts — rename amount→amount_cents, fix return type**

Replace the entire file with:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { ulid } from 'ulid'
import type { Person, Transaction } from './types'

const CHAT_SYSTEM_PROMPT = `Você é um assistente financeiro. Extraia transações de pagamento de um chat do WhatsApp exportado.

Retorne SOMENTE um array JSON válido. Sem texto adicional, sem explicação, sem markdown.

Cada transação deve ter exatamente estes campos:
- date: string (formato DD/MM/YYYY ou como aparece no chat)
- description: string (descrição curta do que foi pago, em português)
- amount_cents: number (valor em centavos — R$10,50 = 1050; R$100 = 10000)
- payerId: string (ID da pessoa que pagou, da lista fornecida; string vazia "" se não identificado)
- raw: string (a linha exata do chat, incluindo data/hora e nome)

Regras:
- Ignore mensagens sem valor monetário e conversas casuais
- Extraia apenas pagamentos e despesas reais
- Se a mensagem menciona "paguei", "gastei", "botei" ou um valor em R$, é candidata a transação
- Quando o pagador estiver claro pelo nome, use o ID correspondente da lista fornecida`

const STATEMENT_TEXT_PROMPT = `Você é um assistente financeiro. Extraia transações de um extrato bancário.

Retorne SOMENTE um array JSON válido. Sem texto adicional.

Cada item deve ter exatamente estes campos:
- date: string (DD/MM/YYYY)
- description: string (descrição curta em português)
- amount_cents: number (valor em centavos — R$10,50 = 1050)
- raw: string (linha original do extrato)

Regras:
- Extraia apenas débitos (saídas de dinheiro — compras, transferências enviadas, pagamentos)
- Ignore entradas (créditos, salário, PIX recebido, reembolsos)
- Ignore saldo, tarifas bancárias isoladas, IOF
- Se houver itens duplicados (mesma data + valor + descrição), inclua apenas uma vez`

const STATEMENT_IMAGE_PROMPT = `Você é um assistente financeiro. Extraia transações desta imagem de extrato bancário.

Retorne SOMENTE um array JSON válido. Sem texto adicional.

Cada item deve ter exatamente estes campos:
- date: string (DD/MM/YYYY)
- description: string (descrição curta em português)
- amount_cents: number (valor em centavos — R$10,50 = 1050)
- raw: string (texto exato como aparece na imagem)

Regras:
- Extraia apenas débitos (saídas de dinheiro)
- Ignore entradas, saldo, tarifas, IOF
- Se houver itens duplicados, inclua apenas uma vez`

type RawChatTransaction = {
  date: string
  description: string
  amount_cents: number
  payerId: string
  raw: string
}

type RawStatementTransaction = {
  date: string
  description: string
  amount_cents: number
  raw: string
}

export async function extractTransactionsFromChat(
  text: string,
  people: Person[],
  apiKey: string
): Promise<Transaction[]> {
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: CHAT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Pessoas no acerto: ${JSON.stringify(people.map(p => ({ id: p.id, name: p.name })))}

Chat do WhatsApp:
${text}`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Resposta inesperada da IA')

  const raw = JSON.parse(content.text) as RawChatTransaction[]
  return raw.map(t => ({
    ...t,
    id: ulid(),
    source: 'chat' as const,
    payerId: t.payerId || null,
    raw: t.raw ?? null,
  }))
}

export async function extractTransactionsFromStatementText(
  text: string,
  apiKey: string
): Promise<Omit<Transaction, 'id' | 'payerId' | 'source'>[]> {
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: STATEMENT_TEXT_PROMPT,
    messages: [{ role: 'user', content: text }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Resposta inesperada da IA')

  const raw = JSON.parse(content.text) as RawStatementTransaction[]
  return raw.map(t => ({ ...t, raw: t.raw ?? null }))
}

export async function extractTransactionsFromStatementImage(
  base64: string,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  apiKey: string
): Promise<Omit<Transaction, 'id' | 'payerId' | 'source'>[]> {
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          { type: 'text', text: STATEMENT_IMAGE_PROMPT },
        ],
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Resposta inesperada da IA')

  const raw = JSON.parse(content.text) as RawStatementTransaction[]
  return raw.map(t => ({ ...t, raw: t.raw ?? null }))
}
```

- [ ] **Step 5: Fix src/components/react/ChatUploader.tsx — rename amount_cents in display**

Find line 167 in `src/components/react/ChatUploader.tsx`:
```typescript
R$ {(t.amount / 100).toFixed(2).replace('.', ',')}
```
Change to:
```typescript
R$ {(t.amount_cents / 100).toFixed(2).replace('.', ',')}
```

Also, the `transactions` state type will now require `source` and `payerId: string | null`. The ChatUploader will be deleted in Task 13, so only fix the compile error. The component still saves to sessionStorage for now — that's intentional; it gets replaced by UploadPanel in Task 12.

- [ ] **Step 6: Verify typecheck passes**

```bash
cd /Users/rafa/Code/rachAcerto && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: install supabase, update transaction type (amount_cents, source, nullable payerId)"
```

---

## Task 2: Create src/lib/supabase.ts + src/lib/slug.ts

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/slug.ts`

- [ ] **Step 1: Create src/lib/supabase.ts**

```typescript
import { createClient } from '@supabase/supabase-js'

export function getSupabase(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false },
  })
}
```

- [ ] **Step 2: Create src/lib/slug.ts**

Uses Web Crypto API — fully compatible with Cloudflare Workers edge runtime.

```typescript
// URL-safe chars without ambiguous lookalikes (0/O, 1/l/I)
const URL_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'

export function generateSlug(): string {
  const array = new Uint8Array(8)
  crypto.getRandomValues(array)
  return Array.from(array, b => URL_CHARS[b % URL_CHARS.length]).join('')
}

export function generateToken(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts src/lib/slug.ts && git commit -m "feat: add supabase client factory and slug/token/pin utilities"
```

---

## Task 3: Create src/lib/session.ts

**Files:**
- Create: `src/lib/session.ts`

- [ ] **Step 1: Create src/lib/session.ts**

```typescript
import { getSupabase } from './supabase'

export type SessionData = {
  personId: string
  personName: string
  personColor: string
  tripId: string
}

export function getSessionCookieName(slug: string): string {
  return `rca_session_${slug}`
}

export function getSessionToken(request: Request, slug: string): string | null {
  const cookieHeader = request.headers.get('cookie') ?? ''
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey.trim() === getSessionCookieName(slug)) return rest.join('=')
  }
  return null
}

export function makeSessionCookie(slug: string, token: string): string {
  const maxAge = 30 * 24 * 60 * 60 // 30 days in seconds
  const secure = import.meta.env.PROD ? 'Secure; ' : ''
  return `${getSessionCookieName(slug)}=${token}; HttpOnly; ${secure}SameSite=Strict; Max-Age=${maxAge}; Path=/`
}

export async function validateSession(
  token: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<SessionData | null> {
  const db = getSupabase(supabaseUrl, supabaseKey)

  const { data: session } = await db
    .from('sessions')
    .select('person_id, expires_at')
    .eq('token', token)
    .single()

  if (!session) return null
  if (new Date(session.expires_at) < new Date()) return null

  const { data: person } = await db
    .from('people')
    .select('id, name, color, trip_id')
    .eq('id', session.person_id)
    .single()

  if (!person) return null

  return {
    personId: person.id,
    personName: person.name,
    personColor: person.color,
    tripId: person.trip_id,
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/session.ts && git commit -m "feat: add session cookie helpers and DB validation"
```

---

## Task 4: Create POST /api/trips

**Files:**
- Create: `src/pages/api/trips.ts`

- [ ] **Step 1: Create src/pages/api/trips.ts**

```typescript
import type { APIRoute } from 'astro'
import { ulid } from 'ulid'
import { getSupabase } from '../../lib/supabase'
import { generateSlug, generateToken } from '../../lib/slug'
import type { Person } from '../../lib/types'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

export const POST: APIRoute = async ({ request }) => {
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  let name: string
  let people: Person[]
  try {
    const body = await request.json() as { name?: string; people?: Person[] }
    name = body.name?.trim() ?? ''
    people = body.people ?? []
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload inválido' }),
      { status: 400, headers: HEADERS }
    )
  }

  if (!name) {
    return new Response(
      JSON.stringify({ error: 'Nome do acerto obrigatório' }),
      { status: 400, headers: HEADERS }
    )
  }
  if (people.length < 2) {
    return new Response(
      JSON.stringify({ error: 'Mínimo 2 pessoas' }),
      { status: 400, headers: HEADERS }
    )
  }

  const db = getSupabase(supabaseUrl, supabaseKey)

  // Generate a unique 8-char slug (collision extremely unlikely but check anyway)
  let slug = generateSlug()
  for (let i = 0; i < 4; i++) {
    const { data } = await db.from('trips').select('id').eq('slug', slug).maybeSingle()
    if (!data) break
    slug = generateSlug()
  }

  const tripId = ulid()

  const { error: tripErr } = await db
    .from('trips')
    .insert({ id: tripId, slug, name })

  if (tripErr) {
    return new Response(
      JSON.stringify({ error: 'Erro ao criar acerto' }),
      { status: 500, headers: HEADERS }
    )
  }

  const peopleRows = people.map(p => ({
    id: p.id,
    trip_id: tripId,
    name: p.name,
    color: p.color,
    invite_token: generateToken(),
    pin_hash: null,
  }))

  const { error: peopleErr } = await db.from('people').insert(peopleRows)

  if (peopleErr) {
    // Roll back the trip
    await db.from('trips').delete().eq('id', tripId)
    return new Response(
      JSON.stringify({ error: 'Erro ao salvar pessoas' }),
      { status: 500, headers: HEADERS }
    )
  }

  const { data: savedPeople } = await db
    .from('people')
    .select('id, name, color, invite_token')
    .eq('trip_id', tripId)
    .order('created_at')

  return new Response(
    JSON.stringify({ slug, people: savedPeople }),
    { headers: HEADERS }
  )
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/trips.ts && git commit -m "feat: add POST /api/trips — create trip and people in Supabase"
```

---

## Task 5: Create session API endpoints

**Files:**
- Create: `src/pages/api/sessions.ts`
- Create: `src/pages/api/sessions/[slug].ts`

- [ ] **Step 1: Create src/pages/api/sessions.ts**

```typescript
import type { APIRoute } from 'astro'
import { ulid } from 'ulid'
import { getSupabase } from '../../lib/supabase'
import { generateToken, hashPin } from '../../lib/slug'
import { makeSessionCookie } from '../../lib/session'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

type PersonRow = {
  id: string
  name: string
  color: string
  trip_id: string
  pin_hash: string | null
  invite_token: string
}

export const POST: APIRoute = async ({ request }) => {
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  let body: { slug?: string; personId?: string; pin?: string; inviteToken?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload inválido' }),
      { status: 400, headers: HEADERS }
    )
  }

  const db = getSupabase(supabaseUrl, supabaseKey)
  let person: PersonRow | null = null
  let slug: string

  if (body.inviteToken) {
    // Invite link path: find person by invite token, then get trip slug
    const { data } = await db
      .from('people')
      .select('id, name, color, trip_id, pin_hash, invite_token')
      .eq('invite_token', body.inviteToken)
      .single()

    if (!data) {
      return new Response(
        JSON.stringify({ error: 'Link de convite inválido' }),
        { status: 404, headers: HEADERS }
      )
    }
    person = data as PersonRow

    const { data: trip } = await db
      .from('trips')
      .select('slug')
      .eq('id', person.trip_id)
      .single()

    if (!trip) {
      return new Response(
        JSON.stringify({ error: 'Acerto não encontrado' }),
        { status: 404, headers: HEADERS }
      )
    }
    slug = trip.slug
  } else if (body.personId && body.slug) {
    // Name picker path: find person by id, verify they belong to this trip
    slug = body.slug

    const { data: trip } = await db
      .from('trips')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!trip) {
      return new Response(
        JSON.stringify({ error: 'Acerto não encontrado' }),
        { status: 404, headers: HEADERS }
      )
    }

    const { data } = await db
      .from('people')
      .select('id, name, color, trip_id, pin_hash, invite_token')
      .eq('id', body.personId)
      .eq('trip_id', trip.id)
      .single()

    if (!data) {
      return new Response(
        JSON.stringify({ error: 'Pessoa não encontrada neste acerto' }),
        { status: 404, headers: HEADERS }
      )
    }
    person = data as PersonRow
  } else {
    return new Response(
      JSON.stringify({ error: 'Forneça inviteToken ou personId + slug' }),
      { status: 400, headers: HEADERS }
    )
  }

  // PIN validation — only required if person has a pin_hash
  if (person.pin_hash) {
    if (!body.pin) {
      return new Response(
        JSON.stringify({ error: 'PIN obrigatório', requiresPin: true }),
        { status: 401, headers: HEADERS }
      )
    }
    const supplied = await hashPin(body.pin)
    if (supplied !== person.pin_hash) {
      return new Response(
        JSON.stringify({ error: 'PIN incorreto' }),
        { status: 401, headers: HEADERS }
      )
    }
  }

  const token = generateToken()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await db.from('sessions').insert({
    id: ulid(),
    person_id: person.id,
    token,
    expires_at: expiresAt,
  })

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Erro ao criar sessão' }),
      { status: 500, headers: HEADERS }
    )
  }

  return new Response(
    JSON.stringify({
      personId: person.id,
      personName: person.name,
      personColor: person.color,
    }),
    {
      headers: {
        ...HEADERS,
        'Set-Cookie': makeSessionCookie(slug, token),
      },
    }
  )
}
```

- [ ] **Step 2: Create src/pages/api/sessions/[slug].ts**

```typescript
import type { APIRoute } from 'astro'
import { getSessionToken, validateSession } from '../../../lib/session'

const HEADERS = { 'Content-Type': 'application/json' } as const

export const GET: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  const token = getSessionToken(request, slug)
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'not_authenticated' }),
      { status: 401, headers: HEADERS }
    )
  }

  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'not_authenticated' }),
      { status: 401, headers: HEADERS }
    )
  }

  return new Response(
    JSON.stringify({
      personId: session.personId,
      personName: session.personName,
      personColor: session.personColor,
    }),
    { headers: HEADERS }
  )
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/sessions.ts src/pages/api/sessions/[slug].ts && git commit -m "feat: add session API — POST /api/sessions and GET /api/sessions/[slug]"
```

---

## Task 6: Update SetupForm to use /api/trips + add slug to Trip

**Files:**
- Modify: `src/components/react/SetupForm.tsx`

The form now has two states: `creating` (the existing form) and `created` (confirmation screen showing the trip URL and invite links).

- [ ] **Step 1: Replace src/components/react/SetupForm.tsx**

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors. (The `Trip` type now requires `slug`, but `SetupForm` no longer creates `Trip` objects — the server handles that.)

- [ ] **Step 3: Commit**

```bash
git add src/components/react/SetupForm.tsx && git commit -m "feat: update SetupForm to POST to /api/trips and show trip URL + invite links"
```

---

## Task 7: Create trip home page /t/[slug].astro

**Files:**
- Create: `src/pages/t/[slug].astro`

This is a server-rendered Astro page. It fetches trip data from Supabase and checks whether the visitor has a session cookie.

- [ ] **Step 1: Create src/pages/t/[slug].astro**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro'
import Nav from '../../components/astro/Nav.astro'
import { getSupabase } from '../../lib/supabase'
import { getSessionToken, validateSession } from '../../lib/session'

const { slug } = Astro.params as { slug: string }

const supabaseUrl = import.meta.env.SUPABASE_URL
const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  return Astro.redirect('/')
}

const db = getSupabase(supabaseUrl, supabaseKey)

const { data: trip } = await db
  .from('trips')
  .select('id, name')
  .eq('slug', slug)
  .single()

if (!trip) {
  return new Response(null, { status: 404 })
}

const { data: people } = await db
  .from('people')
  .select('id, name, color, invite_token')
  .eq('trip_id', trip.id)
  .order('created_at')

// Count transactions per person
const { data: txRows } = await db
  .from('transactions')
  .select('payer_id')
  .eq('trip_id', trip.id)

const txCountByPayer = ((txRows ?? []) as Array<{ payer_id: string | null }>).reduce<Record<string, number>>(
  (acc, tx) => {
    if (tx.payer_id) acc[tx.payer_id] = (acc[tx.payer_id] ?? 0) + 1
    return acc
  },
  {}
)

// Check current visitor's session
const token = getSessionToken(Astro.request, slug)
const currentSession = token ? await validateSession(token, supabaseUrl, supabaseKey) : null

const origin = new URL(Astro.request.url).origin
---

<BaseLayout title={`${trip.name} · RachaCerto`}>
  <Nav showBack={true} />
  <main class="max-w-lg mx-auto px-4 py-8 font-mono">

    <h1 class="text-2xl font-extrabold tracking-tight text-brand-dark mb-1">{trip.name}</h1>
    <p class="text-xs tracking-widest uppercase mb-8" style="color: rgba(26,10,0,0.4)">
      rachacerto.app/t/{slug}
    </p>

    {currentSession && (
      <div
        class="border-2 border-brand-orange px-4 py-3 mb-6 flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <span
            class="w-3 h-3 rounded-full"
            style={`background:${(people ?? []).find(p => p.id === currentSession.personId)?.color ?? '#ccc'}`}
          />
          <span class="text-sm font-bold text-brand-dark">Você é {currentSession.personName}</span>
        </div>
        <a
          href={`/t/${slug}/upload`}
          class="text-xs font-extrabold text-brand-orange hover:underline tracking-widest"
        >
          → MEUS UPLOADS
        </a>
      </div>
    )}

    <!-- People list -->
    <div class="mb-8">
      <p class="text-xs font-bold tracking-widest uppercase mb-3" style="color: rgba(26,10,0,0.5)">
        Participantes
      </p>
      <div class="flex flex-col gap-2">
        {(people ?? []).map(person => {
          const txCount = txCountByPayer[person.id] ?? 0
          const inviteUrl = `${origin}/t/${slug}/join/${person.invite_token}`
          return (
            <div class="flex items-center justify-between py-2 border-b border-brand-dark/10">
              <div class="flex items-center gap-2">
                <span
                  class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={`background:${person.color}`}
                />
                <span class="text-sm font-bold text-brand-dark">{person.name}</span>
                {txCount > 0 && (
                  <span class="text-xs px-1.5 py-0.5 font-bold" style="background:rgba(26,10,0,0.08)">
                    {txCount} tx
                  </span>
                )}
              </div>
              <button
                type="button"
                class="text-xs text-brand-orange font-bold hover:underline js-copy"
                data-value={inviteUrl}
              >
                Copiar convite
              </button>
            </div>
          )
        })}
      </div>
    </div>

    {!currentSession && (
      <a
        href={`/t/${slug}/join`}
        class="block w-full bg-brand-dark text-brand-orange font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-orange hover:text-brand-dark transition-colors text-center"
      >
        → ENTRAR NO ACERTO
      </a>
    )}
  </main>
</BaseLayout>

<script>
  document.querySelectorAll<HTMLButtonElement>('.js-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value ?? ''
      navigator.clipboard.writeText(value)
      const original = btn.textContent
      btn.textContent = 'Copiado!'
      setTimeout(() => { btn.textContent = original }, 1500)
    })
  })
</script>
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/t/[slug].astro && git commit -m "feat: add trip home page /t/[slug] with participants and invite links"
```

---

## Task 8: Create join pages + JoinForm island

**Files:**
- Create: `src/pages/t/[slug]/join.astro`
- Create: `src/pages/t/[slug]/join/[token].astro`
- Create: `src/components/react/JoinForm.tsx`

- [ ] **Step 1: Create src/components/react/JoinForm.tsx**

```typescript
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
```

- [ ] **Step 2: Create src/pages/t/[slug]/join.astro**

```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro'
import Nav from '../../../components/astro/Nav.astro'
import JoinForm from '../../../components/react/JoinForm'
import { getSupabase } from '../../../lib/supabase'
import { getSessionToken, validateSession } from '../../../lib/session'

const { slug } = Astro.params as { slug: string }
const supabaseUrl = import.meta.env.SUPABASE_URL
const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) return Astro.redirect('/')

// If already has a valid session, skip join and go to upload
const token = getSessionToken(Astro.request, slug)
if (token) {
  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (session) return Astro.redirect(`/t/${slug}/upload`)
}

const db = getSupabase(supabaseUrl, supabaseKey)

const { data: trip } = await db.from('trips').select('id, name').eq('slug', slug).single()
if (!trip) return new Response(null, { status: 404 })

const { data: people } = await db
  .from('people')
  .select('id, name, color, pin_hash')
  .eq('trip_id', trip.id)
  .order('created_at')

const peopleForForm = (people ?? []).map(p => ({
  id: p.id,
  name: p.name,
  color: p.color,
  hasPin: p.pin_hash !== null,
}))
---

<BaseLayout title={`Entrar em ${trip.name} · RachaCerto`}>
  <Nav showBack={true} />
  <main class="max-w-md mx-auto px-4 py-8">
    <h1 class="font-mono text-xl font-extrabold tracking-tight text-brand-dark mb-1">
      Entrar no acerto
    </h1>
    <p class="font-mono text-sm mb-8" style="color: rgba(26,10,0,0.5)">{trip.name}</p>
    <JoinForm client:load slug={slug} people={peopleForForm} />
  </main>
</BaseLayout>
```

- [ ] **Step 3: Create src/pages/t/[slug]/join/[token].astro**

Instant join via invite link — no form, immediate redirect.

```astro
---
import { getSupabase } from '../../../../lib/supabase'
import { generateToken } from '../../../../lib/slug'
import { makeSessionCookie } from '../../../../lib/session'
import { ulid } from 'ulid'

const { slug, token: inviteToken } = Astro.params as { slug: string; token: string }
const supabaseUrl = import.meta.env.SUPABASE_URL
const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) return Astro.redirect(`/t/${slug}/join`)

const db = getSupabase(supabaseUrl, supabaseKey)

const { data: person } = await db
  .from('people')
  .select('id, name, trip_id')
  .eq('invite_token', inviteToken)
  .single()

if (!person) {
  // Invalid token — fall back to name picker
  return Astro.redirect(`/t/${slug}/join`)
}

// Create session
const sessionToken = generateToken()
const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

await db.from('sessions').insert({
  id: ulid(),
  person_id: person.id,
  token: sessionToken,
  expires_at: expiresAt,
})

return new Response(null, {
  status: 302,
  headers: {
    Location: `/t/${slug}/upload`,
    'Set-Cookie': makeSessionCookie(slug, sessionToken),
  },
})
---
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/react/JoinForm.tsx src/pages/t/[slug]/join.astro "src/pages/t/[slug]/join/[token].astro" && git commit -m "feat: add join flow — name picker, PIN support, instant invite link"
```

---

## Task 9: Add statement extraction to src/lib/claude.ts

> This task is already complete as part of Task 1 — `extractTransactionsFromStatementText` and `extractTransactionsFromStatementImage` were added to `src/lib/claude.ts` in Step 4 of Task 1. No additional changes needed.

- [ ] **Verify the functions exist in src/lib/claude.ts**

```bash
grep -n "extractTransactionsFromStatement" /Users/rafa/Code/rachAcerto/src/lib/claude.ts
```

Expected output:
```
XX: export async function extractTransactionsFromStatementText(
XX: export async function extractTransactionsFromStatementImage(
```

If the functions are missing (e.g., Task 1 was done partially), add them now using the code from Task 1 Step 4.

---

## Task 10: Create POST /api/trips/[slug]/upload-statement

**Files:**
- Create: `src/pages/api/trips/[slug]/upload-statement.ts`

- [ ] **Step 1: Create src/pages/api/trips/[slug]/upload-statement.ts**

```typescript
import type { APIRoute } from 'astro'
import { ulid } from 'ulid'
import { getSessionToken, validateSession } from '../../../../lib/session'
import { getSupabase } from '../../../../lib/supabase'
import {
  extractTransactionsFromStatementText,
  extractTransactionsFromStatementImage,
} from '../../../../lib/claude'
import { extractText } from 'unpdf'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'x-no-store': '1',
} as const

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export const POST: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const apiKey = import.meta.env.ANTHROPIC_API_KEY
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  // Validate session
  const token = getSessionToken(request, slug)
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Não autenticado' }),
      { status: 401, headers: HEADERS }
    )
  }
  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Sessão expirada — entre novamente' }),
      { status: 401, headers: HEADERS }
    )
  }

  // Parse multipart form
  let file: File
  try {
    const formData = await request.formData()
    const raw = formData.get('file')
    if (!(raw instanceof File)) throw new Error('Campo "file" ausente')
    file = raw
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Payload inválido' }),
      { status: 400, headers: HEADERS }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return new Response(
      JSON.stringify({ error: 'Arquivo muito grande (máximo 10 MB)' }),
      { status: 400, headers: HEADERS }
    )
  }

  const mimeType = file.type
  const arrayBuffer = await file.arrayBuffer()

  // Extract transactions based on file type
  let rawTransactions: Array<{ date: string; description: string; amount_cents: number; raw: string | null }>

  if (mimeType === 'application/pdf') {
    let text: string
    try {
      const { text: extracted } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true })
      text = extracted
    } catch {
      return new Response(
        JSON.stringify({ error: 'PDF protegido por senha ou inválido — remova a senha e tente novamente' }),
        { status: 400, headers: HEADERS }
      )
    }
    rawTransactions = await extractTransactionsFromStatementText(text, apiKey)
  } else if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp') {
    // Encode image to base64 in chunks to avoid stack overflow on large files
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    const chunkSize = 1024
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const base64 = btoa(binary)
    rawTransactions = await extractTransactionsFromStatementImage(
      base64,
      mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
      apiKey
    )
  } else {
    return new Response(
      JSON.stringify({ error: 'Tipo de arquivo não suportado — use PDF, PNG ou JPG' }),
      { status: 400, headers: HEADERS }
    )
  }

  if (rawTransactions.length === 0) {
    return new Response(
      JSON.stringify({ transactions: [], warning: 'Nenhuma transação encontrada neste arquivo' }),
      { headers: HEADERS }
    )
  }

  // Save to DB with payer = session person
  const db = getSupabase(supabaseUrl, supabaseKey)
  const rows = rawTransactions.map(t => ({
    id: ulid(),
    trip_id: session.tripId,
    payer_id: session.personId,
    source: 'statement',
    date: t.date,
    description: t.description,
    amount_cents: t.amount_cents,
    raw: t.raw,
  }))

  const { error: insertErr } = await db.from('transactions').insert(rows)
  if (insertErr) {
    return new Response(
      JSON.stringify({ error: 'Erro ao salvar transações' }),
      { status: 500, headers: HEADERS }
    )
  }

  return new Response(
    JSON.stringify({ transactions: rows }),
    { headers: HEADERS }
  )
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "src/pages/api/trips/[slug]/upload-statement.ts" && git commit -m "feat: add POST /api/trips/[slug]/upload-statement — PDF and image extraction"
```

---

## Task 11: Create POST /api/trips/[slug]/upload-chat (migrate from /api/extract-chat)

**Files:**
- Create: `src/pages/api/trips/[slug]/upload-chat.ts`

- [ ] **Step 1: Create src/pages/api/trips/[slug]/upload-chat.ts**

```typescript
import type { APIRoute } from 'astro'
import { ulid } from 'ulid'
import { getSessionToken, validateSession } from '../../../../lib/session'
import { getSupabase } from '../../../../lib/supabase'
import { extractTransactionsFromChat } from '../../../../lib/claude'
import type { Person } from '../../../../lib/types'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'x-no-store': '1',
} as const

export const POST: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const apiKey = import.meta.env.ANTHROPIC_API_KEY
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  // Validate session
  const token = getSessionToken(request, slug)
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Não autenticado' }),
      { status: 401, headers: HEADERS }
    )
  }
  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Sessão expirada — entre novamente' }),
      { status: 401, headers: HEADERS }
    )
  }

  let text: string
  try {
    const body = await request.json() as { text?: string }
    text = body.text?.trim() ?? ''
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload inválido' }),
      { status: 400, headers: HEADERS }
    )
  }

  if (!text) {
    return new Response(
      JSON.stringify({ error: 'Texto do chat não fornecido' }),
      { status: 400, headers: HEADERS }
    )
  }

  // Fetch people for this trip (needed for payer inference)
  const db = getSupabase(supabaseUrl, supabaseKey)
  const { data: peopleRows } = await db
    .from('people')
    .select('id, name, color')
    .eq('trip_id', session.tripId)

  const people: Person[] = (peopleRows ?? []).map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
  }))

  let extracted
  try {
    extracted = await extractTransactionsFromChat(text, people, apiKey)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: HEADERS }
    )
  }

  if (extracted.length === 0) {
    return new Response(
      JSON.stringify({ transactions: [], warning: 'Nenhuma transação encontrada no chat' }),
      { headers: HEADERS }
    )
  }

  // Save to DB — payer_id may be null for unresolved payers
  const rows = extracted.map(t => ({
    id: t.id,
    trip_id: session.tripId,
    payer_id: t.payerId,
    source: 'chat',
    date: t.date,
    description: t.description,
    amount_cents: t.amount_cents,
    raw: t.raw,
  }))

  const { error: insertErr } = await db.from('transactions').insert(rows)
  if (insertErr) {
    return new Response(
      JSON.stringify({ error: 'Erro ao salvar transações' }),
      { status: 500, headers: HEADERS }
    )
  }

  return new Response(
    JSON.stringify({ transactions: rows }),
    { headers: HEADERS }
  )
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "src/pages/api/trips/[slug]/upload-chat.ts" && git commit -m "feat: add POST /api/trips/[slug]/upload-chat — save chat transactions to DB"
```

---

## Task 12: Create UploadPanel + /t/[slug]/upload.astro

**Files:**
- Create: `src/components/react/UploadPanel.tsx`
- Create: `src/pages/t/[slug]/upload.astro`

- [ ] **Step 1: Create src/components/react/UploadPanel.tsx**

```typescript
import { useState, useCallback } from 'react'

type Transaction = {
  id: string
  date: string
  description: string
  amount_cents: number
  source: 'chat' | 'statement' | 'manual'
}

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

  const uploadStatement = async (file: File) => {
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
  }

  const handleStatementDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadStatement(file)
  }, [slug])

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

  const handleChatFile = (file: File) => {
    if (!file.name.endsWith('.txt')) {
      setError('Apenas arquivos .txt são aceitos')
      return
    }
    const reader = new FileReader()
    reader.onload = e => loadChatText(e.target?.result as string)
    reader.readAsText(file, 'utf-8')
  }

  const handleChatDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleChatFile(file)
  }, [])

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
              {loading ? '⏳ LENDO O CHAT...' : '→ EXTRAIR TRANSAÇÕES'}
            </button>
          )}
        </div>
      )}

      {loading && (
        <p className="text-xs text-center py-4" style={{ color: 'rgba(26,10,0,0.5)' }}>
          ⏳ Processando com IA...
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
            ✓ Salvo. Você pode enviar outro arquivo ou fechar.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create src/pages/t/[slug]/upload.astro**

```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro'
import Nav from '../../../components/astro/Nav.astro'
import UploadPanel from '../../../components/react/UploadPanel'
import { getSupabase } from '../../../lib/supabase'
import { getSessionToken, validateSession } from '../../../lib/session'

const { slug } = Astro.params as { slug: string }
const supabaseUrl = import.meta.env.SUPABASE_URL
const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) return Astro.redirect('/')

// Require session — redirect to join if not authenticated
const token = getSessionToken(Astro.request, slug)
if (!token) return Astro.redirect(`/t/${slug}/join`)

const session = await validateSession(token, supabaseUrl, supabaseKey)
if (!session) return Astro.redirect(`/t/${slug}/join?reason=expired`)

// Fetch trip name for the page title
const db = getSupabase(supabaseUrl, supabaseKey)
const { data: trip } = await db.from('trips').select('name').eq('slug', slug).single()
if (!trip) return new Response(null, { status: 404 })
---

<BaseLayout title={`Meus uploads · ${trip.name} · RachaCerto`}>
  <Nav showBack={true} />
  <main class="max-w-md mx-auto px-4 py-8">
    <h1 class="font-mono text-xl font-extrabold tracking-tight text-brand-dark mb-1">
      Seus uploads
    </h1>
    <p class="font-mono text-sm mb-8" style="color: rgba(26,10,0,0.5)">{trip.name}</p>
    <UploadPanel
      client:load
      slug={slug}
      personName={session.personName}
      personColor={session.personColor}
    />
  </main>
</BaseLayout>
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/react/UploadPanel.tsx "src/pages/t/[slug]/upload.astro" && git commit -m "feat: add upload page and UploadPanel island with statement + chat tabs"
```

---

## Task 13: Cleanup — delete old files, verify build

**Files:**
- Delete: `src/pages/novo/upload.astro`
- Delete: `src/components/react/ChatUploader.tsx`
- Delete: `src/pages/api/extract-chat.ts`

- [ ] **Step 1: Delete retired files**

```bash
rm src/pages/novo/upload.astro
rm src/components/react/ChatUploader.tsx
rm src/pages/api/extract-chat.ts
```

- [ ] **Step 2: Verify no references remain to deleted files**

```bash
grep -r "ChatUploader\|extract-chat\|novo/upload" src/ --include="*.ts" --include="*.tsx" --include="*.astro"
```

Expected: no output. If any references remain, fix them before continuing.

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

Expected: successful build, `dist/server/entry.mjs` generated with no critical warnings.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: remove retired pages (novo/upload, ChatUploader, extract-chat)"
```

---

## Supabase setup note (required before testing)

The plan above produces working, typesafe code but requires a live Supabase project to run. Before testing end-to-end:

1. Create a project at supabase.com
2. Run this SQL in the Supabase SQL editor:

```sql
create table trips (
  id text primary key,
  slug text unique not null,
  name text not null,
  created_at timestamptz default now()
);

create table people (
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  name text not null,
  color text not null,
  invite_token text unique not null,
  pin_hash text,
  created_at timestamptz default now()
);

create table sessions (
  id text primary key,
  person_id text not null references people(id) on delete cascade,
  token text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create table transactions (
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  payer_id text references people(id),
  source text not null,
  date text not null,
  description text not null,
  amount_cents integer not null,
  raw text,
  created_at timestamptz default now()
);
```

3. Add to `.dev.vars`:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

4. Add the same vars as secrets in Cloudflare Pages dashboard.
