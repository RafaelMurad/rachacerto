# RachaCerto Sessão 4A — Math Layer Design

## Goal

Adicionar a camada de matemática ao RachaCerto: revisão de transações, buckets de divisão, cálculo de saldo simplificado e geração de QR code PIX. Ao final desta sessão, o usuário consegue ir de uploads → revisar transações → definir quem divide o quê → ver quem deve quanto → gerar QR PIX para cada transferência.

---

## Scope (4A only)

**In scope:**
- Revisão e edição de transações (edit/delete/add manual)
- Buckets de divisão com membros configuráveis
- Algoritmo de saldo + simplificação de débitos (`lib/settle.ts`)
- Geração de BR Code / QR PIX (`lib/pix.ts`)
- Campo `pix_key` na tabela `people` (coletado no join flow)
- Página `/t/[slug]/review` com abas Transações e Buckets
- Página `/t/[slug]/result` com saldos + QR codes

**Out of scope (4B):**
- Redesign visual geral
- Auth com magic link (v0.2)
- Compartilhamento público da página de resultado

---

## Data Model Changes

### Alter `people` table

```sql
alter table people add column pix_key text;
```

Collected during join flow (both name picker and invite link). Optional at MVP — if absent, result page shows account info request instead of QR.

### New `buckets` table

```sql
create table buckets (
  id          text primary key,
  trip_id     text not null references trips(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz default now()
);
```

### New `bucket_members` table

```sql
create table bucket_members (
  bucket_id   text not null references buckets(id) on delete cascade,
  person_id   text not null references people(id) on delete cascade,
  primary key (bucket_id, person_id)
);
```

### Default "Todos" bucket

Created automatically when a trip is created (in `POST /api/trips`). Contains all people. Cannot be deleted. Transactions not assigned to any custom bucket fall into "Todos" by default.

Each transaction belongs to exactly one bucket via a `bucket_id` foreign key on `transactions`:

```sql
alter table transactions add column bucket_id text references buckets(id) on delete set null;
```

When `bucket_id IS NULL`, the transaction is treated as belonging to the "Todos" bucket.

---

## UI Design

### `/t/[slug]/review` — Tabbed page

Two tabs rendered as a React island (`ReviewPage.tsx`):

**Tab 1: Transações**
- List of all trip transactions sorted by date desc
- Each row: colored person dot (payer), description, source badge (extrato/chat/manual), amount, edit + delete icons
- Transactions with `payer_id IS NULL` shown with warning badge "pagador não identificado"
- Inline edit form (no modal): replaces row with editable fields (description, amount, date, payer dropdown)
- "+ ADICIONAR" button at bottom reveals inline form for manual entry
- CTA at bottom: "→ VER QUEM DEVE QUANTO" (navigates to `/t/[slug]/result`)

**Tab 2: Buckets**
- Card per bucket: name, member chips (colored dots + name), transaction count + total
- Chips are clickable toggles to add/remove a person from the bucket
- "Todos" bucket: non-deletable, name not editable, always shows all people
- Custom buckets: editable name, deletable (transactions fall back to Todos on delete)
- "+ Novo bucket" button: creates bucket with current user's name, prompts to rename
- Same CTA at bottom

### `/t/[slug]/result` — Result page

Static-ish Astro page, data fetched server-side:
- Summary cards: one per person (name, paid total, owed total, net balance)
- Settlement list: each transfer as a row with "De → Para: R$ X,XX" + QR code button
- QR code button: opens inline QR image (data URL) + copyable PIX key string
- If pix_key missing for recipient: shows "Peça a chave PIX de [name]" instead

---

## API Endpoints

All endpoints require a valid session cookie (`rca_session_[slug]`). Any authenticated member of the trip can edit any transaction or bucket.

### Transactions

| Method | Path | Body / Params | Response |
|---|---|---|---|
| `GET` | `/api/trips/[slug]/transactions` | — | `{ transactions: Transaction[] }` |
| `POST` | `/api/trips/[slug]/transactions` | `{ description, amount_cents, date, payer_id?, bucket_id? }` | `{ transaction: Transaction }` |
| `PUT` | `/api/trips/[slug]/transactions/[id]` | `{ description?, amount_cents?, date?, payer_id?, bucket_id? }` | `{ transaction: Transaction }` |
| `DELETE` | `/api/trips/[slug]/transactions/[id]` | — | `{ ok: true }` |

### Buckets

| Method | Path | Body / Params | Response |
|---|---|---|---|
| `GET` | `/api/trips/[slug]/buckets` | — | `{ buckets: BucketWithMembers[] }` |
| `POST` | `/api/trips/[slug]/buckets` | `{ name, memberIds: string[] }` | `{ bucket: BucketWithMembers }` |
| `PUT` | `/api/trips/[slug]/buckets/[id]` | `{ name?, memberIds? }` | `{ bucket: BucketWithMembers }` |
| `DELETE` | `/api/trips/[slug]/buckets/[id]` | — | `{ ok: true }` (403 if "Todos") |

### Settlement

| Method | Path | Response |
|---|---|---|
| `GET` | `/api/trips/[slug]/settlement` | `{ balances: PersonBalance[], settlements: Settlement[] }` |

Settlement endpoint is read-only — computes on the fly from current transactions + buckets.

---

## Domain Types (`src/lib/types.ts` additions)

```typescript
export type Bucket = {
  id: string
  tripId: string
  name: string
  isDefault: boolean  // true for "Todos"
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
```

Also add `pix_key?: string` to `Person` type and `bucket_id?: string` to `Transaction`.

---

## `lib/settle.ts`

```typescript
// Pure functions — no DB, no API calls, fully unit-testable

export function calcBalances(
  transactions: Transaction[],
  buckets: BucketWithMembers[],
  people: Person[]
): PersonBalance[]

export function minimizeTransfers(
  balances: PersonBalance[],
  peopleMap: Map<string, Person>
): Settlement[]
```

**`calcBalances` algorithm:**
1. For each transaction:
   - Find its bucket (via `bucket_id`, or default "Todos" bucket if null)
   - Split `amount_cents` evenly among bucket members (integer division; remainder goes to first member)
   - Credit the payer `amount_cents`; debit each member their share
2. Aggregate per person: `netCents = totalPaid - totalOwed`

**`minimizeTransfers` algorithm:**
1. Separate people into creditors (net > 0) and debtors (net < 0)
2. Sort both descending by absolute value
3. Greedily match largest debtor → largest creditor
4. If debtor amount > creditor amount: creditor zeroed, debtor reduced; advance creditor pointer
5. If creditor amount > debtor amount: debtor zeroed, creditor reduced; advance debtor pointer
6. If equal: both zeroed, advance both pointers
7. Result: minimal set of transfers

---

## `lib/pix.ts`

```typescript
import { createStaticPix, hasError } from 'pix-utils'

export function generatePixBRCode(
  pixKey: string,
  amountCents: number,
  merchantName: string
): string

export async function generateQRDataURL(brCode: string): Promise<string>
  // Uses `qrcode` npm package → returns data:image/png;base64,...
```

---

## Join Flow Change

`JoinForm.tsx` gains an optional PIX key input field after PIN (or after name selection if no PIN).
`/api/sessions` — on session creation, also `UPDATE people SET pix_key = $1 WHERE id = $2` if `pixKey` provided in body.

Alternatively (simpler): add a separate `PUT /api/people/[id]/pix-key` endpoint called after session creation. This keeps `sessions.ts` focused.

**Decision: separate endpoint** — cleaner separation of concerns.

---

## File Map

**New files:**
- `src/lib/settle.ts` — `calcBalances`, `minimizeTransfers`
- `src/lib/pix.ts` — `generatePixBRCode`, `generateQRDataURL`
- `src/pages/t/[slug]/review.astro` — page shell, session guard
- `src/pages/t/[slug]/result.astro` — page shell, server-side settlement fetch
- `src/components/react/ReviewPage.tsx` — tabbed review island
- `src/components/react/ResultPage.tsx` — result display island
- `src/pages/api/trips/[slug]/transactions.ts` — GET + POST
- `src/pages/api/trips/[slug]/transactions/[id].ts` — PUT + DELETE
- `src/pages/api/trips/[slug]/buckets.ts` — GET + POST
- `src/pages/api/trips/[slug]/buckets/[id].ts` — PUT + DELETE
- `src/pages/api/trips/[slug]/settlement.ts` — GET
- `src/pages/api/people/[id]/pix-key.ts` — PUT

**Modified files:**
- `src/lib/types.ts` — add `Bucket`, `BucketWithMembers`, `PersonBalance`, `Settlement`; extend `Person` + `Transaction`
- `src/pages/api/trips.ts` — create default "Todos" bucket on trip creation
- `src/components/react/JoinForm.tsx` — add PIX key input, call pix-key endpoint after session
- `src/pages/t/[slug].astro` — add "→ REVISAR TRANSAÇÕES" link if any transactions exist

---

## Testing

Unit tests for `lib/settle.ts` only (as per CLAUDE.md):
- `calcBalances` with 2 people, 1 bucket, 1 transaction → correct split
- `calcBalances` with remainder (odd amount) → first member absorbs extra cent
- `calcBalances` with multiple buckets, different members
- `minimizeTransfers` with 3 people → minimal transfers
- `minimizeTransfers` with already-zeroed balance → no transfers

Test file: `src/lib/settle.test.ts` using Vitest.

---

## Migration SQL

```sql
-- Run in Supabase SQL Editor before deploying 4A

alter table people add column pix_key text;

create table buckets (
  id          text primary key,
  trip_id     text not null references trips(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz default now()
);

create table bucket_members (
  bucket_id   text not null references buckets(id) on delete cascade,
  person_id   text not null references people(id) on delete cascade,
  primary key (bucket_id, person_id)
);

-- Must run after CREATE TABLE buckets (foreign key dependency)
alter table transactions add column bucket_id text references buckets(id) on delete set null;

-- Indexes for common queries
create index on transactions(trip_id);
create index on bucket_members(bucket_id);
create index on bucket_members(person_id);
```
