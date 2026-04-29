<div align="center">

# RachaCerto

**Divide despesas de viagem pelo chat do WhatsApp — sem app, sem cadastro.**

Envia o `.txt` do grupo, a IA lê as despesas, você recebe os PIX mínimos pra zerar tudo.

[![Build](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square)](https://github.com/rafbgarcia/rachacerto)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Deploy](https://img.shields.io/badge/deploy-Cloudflare%20Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

<br/>

[![Tech Stack](https://skillicons.dev/icons?i=astro,ts,react,tailwind,cloudflare,postgres&theme=dark)](https://skillicons.dev)

<br/>

<img src="docs/demo.gif" alt="RachaCerto — demo completo" width="880" />

</div>

---

## Como funciona

```
1. Cria o acerto   →   2. Cada um envia o extrato ou chat   →   3. Resultado com QR code PIX
```

> [!NOTE]
> Extratos bancários (PDF/imagem) são processados **em memória** e nunca persistidos. Só as transações estruturadas ficam no banco.

---

## Rotas

| Rota | Descrição |
|---|---|
| `/` | Landing page |
| `/novo` | Criar um acerto — nome + pessoas |
| `/t/[slug]` | Página pública do acerto |
| `/t/[slug]/join` | Entrar no acerto (nome + PIN opcional) |
| `/t/[slug]/join/[token]` | Entrada instantânea via link de convite |
| `/t/[slug]/upload` | Upload pessoal: extrato bancário ou chat do WhatsApp |
| `/t/[slug]/review` | Revisão e edição de transações + buckets de divisão |
| `/t/[slug]/result` | Saldos finais + transferências mínimas com QR code PIX |

---

<details>
<summary><strong>Setup local</strong></summary>

### 1. Dependências

```bash
pnpm install
```

### 2. Variáveis de ambiente

Crie `.dev.vars` na raiz (nunca commitado):

```
GEMINI_API_KEY=AIza...
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

create table buckets (
  id           text primary key,
  trip_id      text not null references trips(id) on delete cascade,
  name         text not null,
  participant_ids text[] not null default '{}',
  created_at   timestamptz default now()
);

create table bucket_transactions (
  bucket_id      text not null references buckets(id) on delete cascade,
  transaction_id text not null references transactions(id) on delete cascade,
  primary key (bucket_id, transaction_id)
);
```

### 4. Rodar

```bash
pnpm dev
```

Abre em `http://localhost:4321`.

</details>

<details>
<summary><strong>Comandos</strong></summary>

```bash
pnpm dev          # dev server local (porta 4321)
pnpm build        # build de produção para Cloudflare Pages
pnpm typecheck    # checa tipos sem build
pnpm preview      # preview do build localmente
node e2e-test.mjs # smoke test E2E (precisa do dev server rodando)
node e2e-record.mjs  # grava demo.gif (precisa do dev server + ffmpeg)
```

</details>

<details>
<summary><strong>Como testar o fluxo completo</strong></summary>

1. **Criar acerto:** `/novo` → dê um nome, adicione 2+ pessoas → "CRIAR ACERTO"
2. **Copiar convite:** na página `/t/[slug]`, copie o link de convite de uma pessoa
3. **Entrar:** abra o link de convite — você é redirecionado para `/upload`
4. **Upload de chat:** na aba "CHAT", exporte uma conversa do WhatsApp (`.txt`) ou cole o texto
5. **Upload de extrato:** na aba "EXTRATO", suba um PDF ou screenshot de extrato bancário
6. Repita os passos 2–5 para cada pessoa do acerto
7. **Ver resultado:** `/t/[slug]/result` — saldos + QR codes PIX

</details>

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
│   │   ├── join/[token].astro   # entrada instantânea via convite
│   │   ├── upload.astro         # upload pessoal
│   │   ├── review.astro         # revisão de transações + buckets
│   │   └── result.astro         # saldos + PIX
│   └── api/
│       ├── trips.ts
│       ├── sessions.ts
│       └── trips/[slug]/
│           ├── upload-statement.ts
│           ├── upload-chat.ts
│           ├── transactions/
│           ├── buckets/
│           └── settlement/
├── components/
│   ├── astro/
│   └── react/
│       ├── SetupForm.tsx
│       ├── JoinForm.tsx
│       ├── UploadPanel.tsx
│       ├── ReviewPage.tsx
│       └── ResultPage.tsx
└── lib/
    ├── types.ts
    ├── supabase.ts
    ├── slug.ts
    ├── session.ts
    ├── claude.ts      # Gemini 2.5 Flash (edge-compatible, sem SDK)
    ├── settle.ts      # algoritmo de simplificação de débitos
    └── pix.ts         # geração de BR Code + QR code PIX
```

---

<details>
<summary><strong>Deploy (Cloudflare Pages)</strong></summary>

1. Conecte o repositório no painel do Cloudflare Pages
2. Build command: `pnpm build`
3. Build output: `dist`
4. Adicione as variáveis nas configurações de "Secrets":
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

</details>

---

<div align="center">

Feito no Brasil · [PRD](PRD.md) · [Issues](../../issues)

</div>
