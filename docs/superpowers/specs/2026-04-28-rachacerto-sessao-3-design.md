# RachaCerto Sessão 3 — Collaborative Trip + Statement Upload

> v1.0 · 2026-04-28 · Rafa Murad

---

## Goal

Migrate from a single-browser sessionStorage model to a Supabase-backed collaborative one. Each participant joins the trip from their own device, uploads their own bank statement (PDF or screenshot), and all transactions are attributed automatically by identity — no payer inference needed for statements.

## Architecture

### Mental model shift

| Before (Sessões 1–2) | After (Sessão 3) |
|---|---|
| One organizer, one browser | Multiple participants, multiple devices |
| sessionStorage only | Supabase (Postgres) for persistence |
| Payer always inferred by AI | Statement payer = session person (certain) |
| Wizard: /novo → /novo/upload | Wizard: /novo → /t/[slug] → /t/[slug]/upload |

### Phase flow

1. **Trip creation** (`/novo`): organizer creates trip + people → `POST /api/trips` → saved to Supabase → redirect to `/t/[slug]`
2. **Joining** (`/t/[slug]/join`): each participant opens the trip URL, identifies themselves via name picker / invite link / PIN → session cookie (HttpOnly, 30-day)
3. **Personal upload** (`/t/[slug]/upload`): authenticated by session cookie → upload bank statement (PDF or screenshot) → transactions saved with `payer_id = session.person_id` automatically

Organizer also uploads the WhatsApp chat from their upload page. Chat transactions use existing Claude Haiku extraction (payer inferred from context), saved to same `transactions` table with `source = 'chat'`.

---

## Pages

### New pages

| Route | Type | Purpose |
|---|---|---|
| `/t/[slug]` | Astro (SSR) | Trip home — people list, join status, invite links |
| `/t/[slug]/join` | Astro + React island | Name picker + optional PIN |
| `/t/[slug]/join/[token]` | Astro (SSR) | Instant join via invite link |
| `/t/[slug]/upload` | Astro + React island | Protected — statement upload + chat upload |

### Changed pages

| Route | Change |
|---|---|
| `/novo` | SetupForm POSTs to `/api/trips` instead of sessionStorage |
| `/novo/upload` | Retired (page deleted) — chat upload logic moves into `UploadPanel` inside `/t/[slug]/upload` |

---

## Data Model

### Supabase schema

```sql
-- public.trips
create table trips (
  id          text primary key,          -- ULID
  slug        text unique not null,      -- 8-char random URL-safe string
  name        text not null,
  created_at  timestamptz default now()
);

-- public.people
create table people (
  id           text primary key,         -- ULID
  trip_id      text not null references trips(id) on delete cascade,
  name         text not null,
  color        text not null,
  invite_token text unique not null,     -- random 32-char token for /join/[token]
  pin_hash     text,                     -- SHA-256 of 4-digit PIN; null = no PIN
  created_at   timestamptz default now()
);

-- public.sessions
create table sessions (
  id          text primary key,          -- ULID
  person_id   text not null references people(id) on delete cascade,
  token       text unique not null,      -- opaque 32-char random token; stored in cookie
  expires_at  timestamptz not null,      -- created_at + 30 days
  created_at  timestamptz default now()
);

-- public.transactions
create table transactions (
  id           text primary key,         -- ULID
  trip_id      text not null references trips(id) on delete cascade,
  payer_id     text references people(id),  -- null if payer unresolved from chat
  source       text not null,            -- 'chat' | 'statement' | 'manual'
  date         text not null,            -- DD/MM/YYYY
  description  text not null,
  amount_cents integer not null,         -- R$10,50 = 1050
  raw          text,                     -- original chat line or null for statements
  created_at   timestamptz default now()
);
```

### Access model

All DB calls go through Cloudflare Workers using the Supabase **service key** — never exposed to the browser. No RLS for MVP. All data access is server-mediated via API endpoints.

### New environment variables

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

Added to `.dev.vars` locally and Cloudflare Pages secrets in production. `src/env.d.ts` updated with these two vars.

---

## Supabase Client

**`src/lib/supabase.ts`** — thin wrapper used by all API endpoints:

```typescript
import { createClient } from '@supabase/supabase-js'

export function getSupabase(env: { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string }) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })
}
```

Note: `@supabase/supabase-js` uses the Fetch API internally — fully compatible with Cloudflare Workers edge runtime.

---

## API Endpoints

### `POST /api/trips`

Creates trip + all people in one transaction. Returns slug.

**Request body:**
```typescript
{ name: string; people: Array<{ id: string; name: string; color: string }> }
```

**Response:**
```typescript
{ slug: string; people: Array<{ id: string; name: string; color: string; inviteToken: string }> }
```

Logic:
1. Generate 8-char slug (random URL-safe, check uniqueness in DB)
2. Insert trip row
3. Insert all people rows with generated `invite_token` (random 32-char) per person
4. Return `{ slug, people }` — client uses slug to redirect, inviteTokens to show invite links

### `POST /api/sessions`

Creates a session for a person joining a trip.

**Request body (name picker):**
```typescript
{ slug: string; personId: string; pin?: string }
```

**Request body (invite link):**
```typescript
{ inviteToken: string }
```

Logic:
1. If `inviteToken`: find person by `people.invite_token`
2. If `personId + slug`: find person by id, verify they belong to that trip
3. If person has `pin_hash` and no PIN supplied: return 401 `{ error: 'PIN obrigatório' }`
4. If PIN supplied: verify `sha256(pin) === pin_hash`; if mismatch: return 401
5. Create session record (`token` = random 32-char, `expires_at` = now + 30 days)
6. Set `Set-Cookie: rca_session_[slug]=TOKEN; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`
7. Return `{ personId, personName, personColor }`

### `GET /api/sessions/[slug]`

Validates session cookie for a given trip. Used by protected pages on load.

**Response:**
```typescript
{ personId: string; personName: string; personColor: string } | { error: 'not_authenticated' }
```

Logic: read `rca_session_[slug]` cookie → look up in `sessions` table → check `expires_at` → return person info.

### `POST /api/trips/[slug]/upload-statement`

Uploads and extracts transactions from a bank statement. Protected.

**Auth:** validates `rca_session_[slug]` cookie → gets `person_id`

**Request:** `multipart/form-data` with field `file` (PDF or image)

**Logic:**
1. Validate session → get `person_id`
2. Detect file MIME type
3. If `application/pdf`: extract text with `unpdf` → call `extractTransactionsFromStatementText()`
4. If `image/*`: read as base64 → call `extractTransactionsFromStatementImage()`
5. Insert all transactions with `payer_id = person_id`, `source = 'statement'`, `trip_id`
6. Return `{ transactions: Transaction[] }` (the saved rows)

**Error cases:**
- No session / expired: 401
- File too large (>10MB): 400
- PDF password-protected (unpdf throws): 400 `{ error: 'PDF protegido por senha — remova a senha e tente novamente' }`
- Extraction returns 0 transactions: 200 with empty array + `{ warning: 'Nenhuma transação encontrada' }`

### `POST /api/trips/[slug]/upload-chat`

Migrated from `/api/extract-chat`. Now requires session + saves to DB.

**Auth:** validates session cookie

**Request body:**
```typescript
{ text: string }
```

**Logic:**
1. Validate session → get `person_id` and `trip_id`
2. Fetch trip's people from DB (to pass to Claude for payer inference)
3. Call existing `extractTransactionsFromChat(text, people, apiKey)`
4. Insert all transactions with `source = 'chat'`, `trip_id` (payer_id may be null for unresolved)
5. Return `{ transactions: Transaction[] }`

---

## Join Flow Detail

### Name picker (`/t/[slug]/join`)

1. Page loads: server fetches people for this trip; filters to those without an active session
2. React island (`JoinForm`): dropdown of available names
3. If selected person has `pin_hash !== null`: PIN input field appears
4. Submit → `POST /api/sessions` → on success: redirect to `/t/[slug]/upload`

### Invite link (`/t/[slug]/join/[token]`)

1. Astro SSR page: immediately POSTs to `/api/sessions` with `{ inviteToken: token }`
2. On success: sets cookie + redirects to `/t/[slug]/upload`
3. On failure (already claimed, expired): shows error message with link to name picker

### PIN (opt-in per person)

- During `SetupForm`, organizer can optionally enter a 4-digit PIN per person (expandable row)
- PIN stored as `sha256(pin)` in `people.pin_hash`
- `SetupForm` shows PIN fields under each person as optional ("Proteger com PIN" toggle)
- Shown in name picker UI only if `pin_hash` is non-null for that person

---

## Statement Extraction

### `lib/claude.ts` additions

```typescript
// Text path (PDF → unpdf → this function)
export async function extractTransactionsFromStatementText(
  text: string,
  apiKey: string
): Promise<Omit<Transaction, 'id' | 'payerId'>[]>

// Vision path (image upload or fallback)
export async function extractTransactionsFromStatementImage(
  base64: string,
  mimeType: string,
  apiKey: string
): Promise<Omit<Transaction, 'id' | 'payerId'>[]>
```

Both return transactions without `id` or `payerId` — those are added by the endpoint before inserting.

**Model:** `claude-haiku-4-5-20251001` for both paths (cost: ~R$0.02 text, ~R$0.08 vision per statement).

**System prompt (both paths):**
```
Você é um assistente financeiro. Extraia transações de um extrato bancário.

Retorne SOMENTE um array JSON válido. Sem texto adicional.

Cada item:
- date: string (DD/MM/YYYY)
- description: string (descrição curta em português)
- amount_cents: number (valor em centavos — R$10,50 = 1050; apenas débitos/gastos)
- raw: string (linha original ou null)

Regras:
- Extraia apenas débitos (saídas de dinheiro)
- Ignore entradas (créditos, salário, PIX recebido)
- Ignore saldo, tarifas bancárias, IOF
- Se houver itens duplicados (mesma data + valor + descrição), inclua apenas uma vez
```

---

## `src/lib/types.ts` changes

Add `source` to Transaction, make `payerId` nullable:

```typescript
export type Person = { id: string; name: string; color: string }
export type Trip = { id: string; slug: string; name: string; people: Person[]; createdAt: string }
export type Transaction = {
  id: string
  date: string
  description: string
  amount_cents: number       // renamed from amount for clarity; centavos
  payerId: string | null     // null = unresolved from chat
  source: 'chat' | 'statement' | 'manual'
  raw: string | null
}
```

Note: `amount` renamed to `amount_cents` for explicitness — update all references in ChatUploader display code.

---

## Trip Home Page (`/t/[slug]`)

Server-rendered Astro page. Shows:
- Trip name + people list with colored chips
- Per-person status: "Não entrou" / "Entrou" / "X transações adicionadas"
- Invite links per person (copy button → `/t/[slug]/join/[token]`)
- "Entrar no acerto" button → `/t/[slug]/join`
- If session cookie present for this slug: shows "Você é [name]" + button to `/t/[slug]/upload`

---

## Upload Page (`/t/[slug]/upload`)

Protected Astro page + React island (`UploadPanel`).

On load: calls `GET /api/sessions/[slug]` → if not authenticated, redirect to `/t/[slug]/join`.

Two tabs:
1. **Extrato** (bank statement) — drag-drop zone, accepts `.pdf`, `.png`, `.jpg`, `.jpeg`
2. **Chat do WhatsApp** — existing drag-drop zone (replaces `/novo/upload`)

Each upload shows a preview of extracted transactions before confirming. After confirming, transactions are saved to DB. User can upload multiple statements (one at a time).

---

## SetupForm changes

After successful trip creation:
1. Receives `{ slug, people }` from `POST /api/trips`
2. Organizer is shown the trip URL to share: `rachacerto.app/t/[slug]`
3. Optional: per-person invite links listed below
4. "Vou ao meu acerto" button → `/t/[slug]`

sessionStorage usage for `rca_trip` is removed. `rca_transactions` also removed (transactions live in DB).

---

## Error Handling

| Scenario | Behavior |
|---|---|
| PDF password-protected | 400 + user-friendly message |
| 0 transactions extracted | 200 + warning banner, user can try again or skip |
| Session expired | Redirect to `/t/[slug]/join` with `?reason=expired` |
| Trip slug not found | 404 page |
| Person already has session (invite link re-used) | Create new session anyway (re-join is fine) |
| Supabase unreachable | 500 + "Serviço indisponível, tente novamente" |

---

## Out of scope (Sessão 4+)

- Transaction review/edit UI (TransactionEditor)
- Buckets and split rules (BucketAssigner)
- Settlement calculation and PIX QR
- Public result page (`/t/[slug]` result view)
- "Mark as paid" flow
- Supabase RLS (added with auth in v0.2)
