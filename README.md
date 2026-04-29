# RachaCerto

Web app que lê o chat do WhatsApp e o extrato bancário da viagem e devolve os PIX mínimos pra zerar tudo entre o grupo. Sem cadastro de despesas, sem app instalado.

> **Stack:** Astro 6 · React 19 islands · Tailwind v4 · Supabase (Postgres) · Claude Haiku 4.5 · Cloudflare Pages + Workers

<div align="center">
  <img src="docs/demo.gif" alt="RachaCerto demo" width="960" />
</div>

---

## O que funciona hoje

| Rota | O que é |
|---|---|
| `/` | Landing page |
| `/novo` | Criar um acerto — nome + pessoas |
| `/t/[slug]` | Página pública do acerto: participantes, status, links de convite |
| `/t/[slug]/join` | Seletor de nome (+ PIN opcional) para entrar no acerto |
| `/t/[slug]/join/[token]` | Entrada instantânea via link de convite |
| `/t/[slug]/upload` | Upload pessoal: extrato bancário (PDF/imagem) ou chat do WhatsApp |
| `/t/[slug]/review` | Revisão e edição de transações + configuração de buckets de divisão |
| `/t/[slug]/result` | Saldos por pessoa + transferências mínimas com QR code PIX |

---

## Setup local

### 1. Dependências

```bash
pnpm install
```

### 2. Variáveis de ambiente

Crie `.dev.vars` na raiz (nunca commitado):

```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

### 3. Supabase — criar as tabelas

No SQL Editor do seu projeto Supabase:

```sql
create table trips (
  id          text primary key,
  slug        text unique not null,
  name        text not null,
  created_at  timestamptz default now()
);

create table people (
  id           text primary key,
  trip_id      text not null references trips(id) on delete cascade,
  name         text not null,
  color        text not null,
  invite_token text unique not null,
  pin_hash     text,
  created_at   timestamptz default now()
);

create table sessions (
  id          text primary key,
  person_id   text not null references people(id) on delete cascade,
  token       text unique not null,
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);

create table transactions (
  id           text primary key,
  trip_id      text not null references trips(id) on delete cascade,
  payer_id     text references people(id),
  source       text not null,         -- 'chat' | 'statement' | 'manual'
  date         text not null,         -- DD/MM/YYYY
  description  text not null,
  amount_cents integer not null,      -- R$10,50 = 1050
  raw          text,
  created_at   timestamptz default now()
);
```

### 4. Rodar

```bash
pnpm dev
```

Abre em `http://localhost:4321`.

---

## Comandos

```bash
pnpm dev          # dev server local (porta 4321)
pnpm build        # build de produção para Cloudflare Pages
pnpm typecheck    # checa tipos sem build
pnpm preview      # preview do build localmente
```

---

## Como testar o fluxo completo

1. **Criar acerto:** `/novo` → dê um nome, adicione 2+ pessoas → "CRIAR ACERTO"
2. **Copiar convite:** na página `/t/[slug]` que aparece, copie o link de convite de uma pessoa
3. **Entrar:** abra o link de convite em outra aba/janeiro — você é redirecionado para `/upload`
4. **Upload de extrato:** na aba "EXTRATO", suba um PDF ou screenshot de extrato bancário
5. **Upload de chat:** na aba "CHAT", exporte uma conversa do WhatsApp (`.txt`) ou cole o texto
6. Repita os passos 2–5 para cada pessoa do acerto

Cada arquivo enviado chama a Claude API e salva as transações no Supabase com `payer_id` da sessão.

---

## Como o modelo de sessão funciona

Cada acerto tem um **slug** (URL pública). Cada pessoa tem um **invite_token** único. Quando alguém entra:

- Via link de convite → o token identifica a pessoa → sessão criada na hora
- Via seletor de nome → escolhe o nome → PIN opcional → sessão criada

A sessão é um cookie `rca_session_[slug]` HttpOnly (30 dias). Todos os uploads são atribuídos automaticamente à pessoa da sessão — sem precisar inferir o pagador.

---

## Arquitetura

```
src/
├── pages/
│   ├── index.astro              # landing
│   ├── novo.astro               # criar acerto
│   ├── t/[slug].astro           # página pública do acerto
│   ├── t/[slug]/
│   │   ├── join.astro           # seletor de nome + PIN
│   │   ├── join/[token].astro   # entrada via convite (redirect puro)
│   │   └── upload.astro         # upload pessoal (protegida por sessão)
│   └── api/
│       ├── trips.ts             # POST /api/trips
│       ├── sessions.ts          # POST /api/sessions
│       ├── sessions/[slug].ts   # GET /api/sessions/[slug]
│       └── trips/[slug]/
│           ├── upload-statement.ts  # POST — extrato bancário (PDF ou imagem)
│           └── upload-chat.ts       # POST — chat do WhatsApp (.txt)
├── components/
│   ├── astro/                   # componentes sem JS
│   └── react/
│       ├── SetupForm.tsx        # formulário de criação de acerto
│       ├── JoinForm.tsx         # seletor de nome + PIN
│       └── UploadPanel.tsx      # tabs extrato + chat
└── lib/
    ├── types.ts                 # tipos de domínio (Trip, Person, Transaction)
    ├── supabase.ts              # factory do cliente Supabase
    ├── slug.ts                  # geradores de slug/token, hash de PIN (Web Crypto)
    ├── session.ts               # helpers de cookie de sessão + validação no DB
    └── claude.ts                # extratores via Claude API (chat, PDF, imagem)
```

---

## Deploy (Cloudflare Pages)

1. Conecte o repositório no painel do Cloudflare Pages
2. Build command: `pnpm build`
3. Build output: `dist`
4. Adicione as variáveis de ambiente nas configurações de "Secrets":
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

---

## Próximos passos (Sessão 4)

- Revisão e edição de transações extraídas
- Criar buckets de divisão (quem participa de cada grupo de despesas)
- Algoritmo de saldo e simplificação de débitos
- Geração de QR codes PIX via `pix-utils`
- Página pública de resultado editável e compartilhável
