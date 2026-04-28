# RachaCerto · Sessão 1+2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold Astro 5 project + Y2K Brasil landing page + wizard criar acerto (nome+pessoas) + upload de chat com extração via Claude API.

**Architecture:** Multi-page Astro com React islands isoladas por passo do wizard. Estado do wizard viaja via `sessionStorage` entre páginas. Edge runtime (Cloudflare Workers) para a API de extração.

**Tech Stack:** Astro 5 · React 19 · Tailwind v4 (Vite plugin) · Cloudflare adapter · Anthropic SDK (Haiku 4.5) · ulid · TypeScript strict

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `package.json` | Criar | Deps e scripts do projeto |
| `astro.config.mjs` | Criar | React + Tailwind v4 Vite plugin + Cloudflare adapter |
| `tsconfig.json` | Criar | TypeScript strict (extends astro/tsconfigs/strict) |
| `wrangler.toml` | Criar | Config do Cloudflare Pages |
| `.gitignore` | Criar | Ignora dist, node_modules, .dev.vars, .superpowers |
| `.dev.vars` | Criar | ANTHROPIC_API_KEY local (nunca commitado) |
| `src/env.d.ts` | Criar | Tipos de import.meta.env |
| `src/styles/global.css` | Criar | Tailwind v4 + tokens Y2K Brasil + utilitário CRT |
| `src/lib/types.ts` | Criar | Person, Trip, Transaction |
| `src/layouts/BaseLayout.astro` | Criar | HTML shell + import CSS + slot |
| `src/components/astro/Nav.astro` | Criar | Barra de navegação Y2K |
| `src/pages/index.astro` | Criar | Landing split hero |
| `src/lib/claude.ts` | Criar | extractTransactionsFromChat() |
| `src/pages/api/extract-chat.ts` | Criar | Cloudflare Worker endpoint |
| `src/components/react/SetupForm.tsx` | Criar | Island: nome + pessoas |
| `src/pages/novo.astro` | Criar | Wizard step 1 shell |
| `src/components/react/ChatUploader.tsx` | Criar | Island: drag-drop + extração |
| `src/pages/novo/upload.astro` | Criar | Wizard step 2 shell |

---

## Task 1: Config files + dependências

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `.gitignore`
- Create: `.dev.vars`
- Create: `src/env.d.ts`
- Create: `public/favicon.svg`

- [ ] **Step 1: Criar package.json**

```json
{
  "name": "rachacerto",
  "type": "module",
  "version": "0.1.0",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "typecheck": "astro check",
    "wrangler": "wrangler"
  }
}
```

- [ ] **Step 2: Instalar dependências**

```bash
pnpm add astro @astrojs/react @astrojs/cloudflare react react-dom
pnpm add -D @types/react @types/react-dom typescript tailwindcss @tailwindcss/vite
pnpm add ulid @anthropic-ai/sdk unpdf pix-utils
```

Esperado: `node_modules/` criado, `package.json` atualizado com as versões.

- [ ] **Step 3: Criar astro.config.mjs**

```js
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import cloudflare from '@astrojs/cloudflare'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
})
```

- [ ] **Step 4: Criar tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 5: Criar wrangler.toml**

```toml
name = "rachacerto"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"
```

- [ ] **Step 6: Criar .gitignore**

```
dist/
node_modules/
.env
.dev.vars
.wrangler/
.astro/
.superpowers/
```

- [ ] **Step 7: Criar .dev.vars (não será commitado)**

```
ANTHROPIC_API_KEY=sk-ant-COLOQUE_SUA_CHAVE_AQUI
```

- [ ] **Step 8: Criar src/env.d.ts**

```ts
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly ANTHROPIC_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 9: Criar public/favicon.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#1a0a00"/>
  <text x="4" y="24" font-family="monospace" font-size="20" font-weight="900" fill="#ff6b35">R$</text>
</svg>
```

- [ ] **Step 10: Rodar typecheck para verificar setup**

```bash
pnpm typecheck
```

Esperado: pode reportar erros de arquivos ausentes — normal nesse ponto. O importante é que o comando executa sem crash.

- [ ] **Step 11: Commit**

```bash
git add package.json astro.config.mjs tsconfig.json wrangler.toml .gitignore src/env.d.ts public/favicon.svg
git commit -m "feat: bootstrap astro 5 + tailwind v4 + cloudflare adapter"
```

---

## Task 2: Design tokens + CSS global (Y2K Brasil)

**Files:**
- Create: `src/styles/global.css`

- [ ] **Step 1: Criar src/styles/global.css**

```css
@import "tailwindcss";

@theme {
  --color-brand-orange: #ff6b35;
  --color-brand-dark: #1a0a00;
  --color-brand-cream: #f7c59f;
  --color-brand-light: #efefd0;
  --color-brand-bg: #efefd0;

  --font-family-mono: 'Courier New', Courier, monospace;
  --font-family-serif: Georgia, 'Times New Roman', serif;
}

/* CRT scanlines — aplicar com class="crt" no elemento raiz */
.crt {
  position: relative;
}
.crt::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 4px
  );
  pointer-events: none;
  z-index: 9999;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: add y2k brasil design tokens and crt overlay"
```

---

## Task 3: Domain types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Criar src/lib/types.ts**

```ts
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
```

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm typecheck
```

Esperado: sem erros em `src/lib/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: define domain types (Person, Trip, Transaction)"
```

---

## Task 4: BaseLayout + Nav

**Files:**
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/components/astro/Nav.astro`

- [ ] **Step 1: Criar src/layouts/BaseLayout.astro**

```astro
---
import '../styles/global.css'

interface Props {
  title: string
  description?: string
}

const { title, description = 'Racha a conta. Fecha o acerto.' } = Astro.props
---
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} · RachaCerto</title>
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body class="bg-brand-bg text-brand-dark">
    <slot />
  </body>
</html>
```

- [ ] **Step 2: Criar src/components/astro/Nav.astro**

```astro
---
interface Props {
  showBack?: boolean
}
const { showBack = false } = Astro.props
---
<nav class="bg-brand-dark px-4 py-2 flex items-center justify-between font-mono">
  <a href="/" class="text-brand-orange text-sm font-bold tracking-widest hover:opacity-80 transition-opacity">
    RACHACERTO
  </a>
  <div class="flex items-center gap-3">
    {showBack && (
      <a
        href="javascript:history.back()"
        class="text-brand-cream text-xs opacity-60 hover:opacity-100 transition-opacity"
      >
        ← voltar
      </a>
    )}
    <span class="bg-brand-orange text-brand-dark text-xs font-extrabold px-2 py-0.5 leading-none">
      BETA
    </span>
  </div>
</nav>
```

- [ ] **Step 3: Commit**

```bash
git add src/layouts/BaseLayout.astro src/components/astro/Nav.astro
git commit -m "feat: add base layout and nav component"
```

---

## Task 5: Landing page

**Files:**
- Create: `src/pages/index.astro`

- [ ] **Step 1: Criar src/pages/index.astro**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
import Nav from '../components/astro/Nav.astro'
---
<BaseLayout title="Racha a conta. Fecha o acerto.">
  <div class="crt min-h-screen flex flex-col">
    <Nav />

    <!-- Hero split -->
    <section
      class="flex-1 grid md:grid-cols-2"
      style="background: linear-gradient(160deg, #ff6b35, #f7c59f 60%, #efefd0)"
    >
      <!-- Left: copy -->
      <div class="flex flex-col justify-center px-8 py-12 md:px-16">
        <p class="font-mono text-xs tracking-widest uppercase mb-4" style="color: rgba(26,10,0,0.5)">
          sem planilha. sem app. só o whatsapp.
        </p>
        <h1
          class="font-serif text-5xl md:text-6xl font-black text-brand-dark leading-none mb-8"
          style="text-shadow: 3px 3px 0 #ff6b35"
        >
          RACHA A<br />CONTA.<br />FECHA O<br />ACERTO.
        </h1>
        <a
          href="/novo"
          class="inline-block bg-brand-dark text-brand-orange font-mono text-sm font-extrabold tracking-widest px-6 py-3 self-start hover:bg-brand-orange hover:text-brand-dark transition-colors"
        >
          → COMEÇAR UM ACERTO
        </a>
      </div>

      <!-- Right: result mockup -->
      <div class="hidden md:flex items-center justify-center p-12">
        <div class="w-full max-w-xs font-mono">
          <div class="bg-brand-dark text-brand-orange text-xs tracking-widest px-3 py-1.5 mb-2">
            VIAGEM PG // RESULTADO
          </div>
          <div class="flex flex-col gap-1.5 mb-3">
            <div class="flex justify-between text-sm px-3 py-2" style="background: rgba(255,255,255,0.6)">
              <span style="color: rgba(26,10,0,0.6)">Rafa → Ju</span>
              <span class="font-extrabold text-brand-dark">R$ 87,50</span>
            </div>
            <div class="flex justify-between text-sm px-3 py-2" style="background: rgba(255,255,255,0.6)">
              <span style="color: rgba(26,10,0,0.6)">João → Higor</span>
              <span class="font-extrabold text-brand-dark">R$ 45,00</span>
            </div>
            <div class="flex justify-between text-sm px-3 py-2" style="background: rgba(255,255,255,0.6)">
              <span style="color: rgba(26,10,0,0.6)">Ana → Rafa</span>
              <span class="font-extrabold text-brand-dark">R$ 23,00</span>
            </div>
          </div>
          <div class="bg-brand-orange text-white font-extrabold text-sm text-center px-3 py-2">
            ▣ VER QR CODES →
          </div>
        </div>
      </div>
    </section>

    <!-- Feature tags -->
    <section class="bg-brand-dark px-4 py-3 flex flex-wrap gap-3 justify-center">
      {['✓ sem cadastro', '✓ qualquer banco BR', '✓ PIX direto', '✓ 5 minutos'].map(tag => (
        <span class="font-mono text-xs font-bold border px-3 py-1" style="color: #ff6b35; border-color: rgba(255,107,53,0.4); background: rgba(255,107,53,0.1)">
          {tag}
        </span>
      ))}
    </section>
  </div>
</BaseLayout>
```

- [ ] **Step 2: Testar no browser**

```bash
pnpm dev
```

Abrir `http://localhost:4321`. Verificar:
- Nav escura com RACHACERTO e BETA badge
- Hero com gradiente laranja→creme
- Headline com text-shadow laranja
- CTA "COMEÇAR UM ACERTO" linkando pra /novo
- Mockup do resultado visível em desktop
- Feature tags no rodapé escuro

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add y2k brasil landing page with split hero"
```

---

## Task 6: Claude helper

**Files:**
- Create: `src/lib/claude.ts`

- [ ] **Step 1: Criar src/lib/claude.ts**

```ts
import Anthropic from '@anthropic-ai/sdk'
import { ulid } from 'ulid'
import type { Person, Transaction } from './types'

const EXTRACT_SYSTEM_PROMPT = `Você é um assistente financeiro. Extraia transações de pagamento de um chat do WhatsApp exportado.

Retorne SOMENTE um array JSON válido. Sem texto adicional, sem explicação, sem markdown.

Cada transação deve ter exatamente estes campos:
- date: string (formato DD/MM/YYYY ou como aparece no chat)
- description: string (descrição curta do que foi pago, em português)
- amount: number (valor em centavos — R$10,50 = 1050; R$100 = 10000)
- payerId: string (ID da pessoa que pagou, da lista fornecida; string vazia "" se não identificado)
- raw: string (a linha exata do chat, incluindo data/hora e nome)

Regras:
- Ignore mensagens sem valor monetário e conversas casuais
- Extraia apenas pagamentos e despesas reais
- Se a mensagem menciona "paguei", "gastei", "botei" ou um valor em R$, é candidata a transação
- Quando o pagador estiver claro pelo nome, use o ID correspondente da lista fornecida`

type RawTransaction = {
  date: string
  description: string
  amount: number
  payerId: string
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
    system: EXTRACT_SYSTEM_PROMPT,
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
  if (content.type !== 'text') {
    throw new Error('Resposta inesperada da IA')
  }

  const raw = JSON.parse(content.text) as RawTransaction[]
  return raw.map(t => ({ ...t, id: ulid() }))
}
```

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm typecheck
```

Esperado: sem erros em `src/lib/claude.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/claude.ts
git commit -m "feat: add claude helper for chat transaction extraction"
```

---

## Task 7: Endpoint /api/extract-chat

**Files:**
- Create: `src/pages/api/extract-chat.ts`

- [ ] **Step 1: Criar src/pages/api/extract-chat.ts**

```ts
import type { APIRoute } from 'astro'
import type { Person } from '../../lib/types'
import { extractTransactionsFromChat } from '../../lib/claude'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'x-no-store': '1',
} as const

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração da API ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  let text: string
  let people: Person[]
  try {
    const body = await request.json() as { text: string; people: Person[] }
    text = body.text
    people = body.people ?? []
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload inválido' }),
      { status: 400, headers: HEADERS }
    )
  }

  if (!text?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Texto do chat não fornecido' }),
      { status: 400, headers: HEADERS }
    )
  }

  try {
    const transactions = await extractTransactionsFromChat(text, people, apiKey)
    return new Response(JSON.stringify({ transactions }), { headers: HEADERS })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: HEADERS }
    )
  }
}
```

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm typecheck
```

Esperado: sem erros em `src/pages/api/extract-chat.ts`.

- [ ] **Step 3: Testar endpoint manualmente (requer ANTHROPIC_API_KEY no .dev.vars)**

```bash
pnpm dev
# Em outro terminal:
curl -X POST http://localhost:4321/api/extract-chat \
  -H "Content-Type: application/json" \
  -d '{"text":"[01/04/2026, 14:32] Rafa: paguei o uber, R$45,00","people":[{"id":"01HV...","name":"Rafa","color":"#FF6B35"}]}'
```

Esperado: `{"transactions":[{"id":"...","date":"01/04/2026","description":"Uber","amount":4500,"payerId":"01HV...","raw":"..."}]}`

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/extract-chat.ts
git commit -m "feat: add extract-chat cloudflare worker endpoint"
```

---

## Task 8: SetupForm island

**Files:**
- Create: `src/components/react/SetupForm.tsx`

- [ ] **Step 1: Criar src/components/react/SetupForm.tsx**

```tsx
import { useState } from 'react'
import { ulid } from 'ulid'
import type { Trip, Person } from '../../lib/types'

const COLORS = [
  '#FF6B35', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#DDA0DD', '#F7DC6F', '#98D8C8', '#FF8B94',
]

export default function SetupForm() {
  const [tripName, setTripName] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [personInput, setPersonInput] = useState('')
  const [errors, setErrors] = useState<{ name?: string; people?: string }>({})

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!tripName.trim()) errs.name = 'Nome do acerto é obrigatório'
    if (people.length < 2) errs.people = 'Adicione pelo menos 2 pessoas'
    if (Object.keys(errs).length) { setErrors(errs); return }

    const trip: Trip = {
      id: ulid(),
      name: tripName.trim(),
      people,
      createdAt: new Date().toISOString(),
    }
    sessionStorage.setItem('rca_trip', JSON.stringify(trip))
    window.location.href = '/novo/upload'
  }

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
        {errors.name && (
          <p className="text-red-600 text-xs mt-1">{errors.name}</p>
        )}
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
        {errors.people && (
          <p className="text-red-600 text-xs mt-2">{errors.people}</p>
        )}
      </div>

      <button
        type="submit"
        className="w-full bg-brand-dark text-brand-orange font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-orange hover:text-brand-dark transition-colors"
      >
        → PRÓXIMO: UPLOAD DO CHAT
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm typecheck
```

Esperado: sem erros em `src/components/react/SetupForm.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/react/SetupForm.tsx
git commit -m "feat: add SetupForm react island (trip name + people)"
```

---

## Task 9: Página /novo (wizard step 1)

**Files:**
- Create: `src/pages/novo.astro`

- [ ] **Step 1: Criar src/pages/novo.astro**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
import Nav from '../components/astro/Nav.astro'
import SetupForm from '../components/react/SetupForm'
---
<BaseLayout title="Novo acerto">
  <Nav showBack={true} />
  <main
    class="min-h-[calc(100vh-40px)]"
    style="background: linear-gradient(160deg, #f7c59f, #efefd0)"
  >
    <div class="max-w-lg mx-auto px-4 py-10">
      <div class="font-mono mb-8">
        <p class="text-xs tracking-widest uppercase mb-1" style="color: rgba(26,10,0,0.5)">
          passo 1 de 2
        </p>
        <h1
          class="text-3xl font-black text-brand-dark"
          style="font-family: Georgia, serif; text-shadow: 2px 2px 0 #ff6b35"
        >
          QUEM TÁ NO ACERTO?
        </h1>
      </div>
      <SetupForm client:load />
    </div>
  </main>
</BaseLayout>
```

- [ ] **Step 2: Testar no browser**

```bash
pnpm dev
```

Navegar para `http://localhost:4321/novo`. Verificar:
- Nav com botão "← voltar"
- Heading "QUEM TÁ NO ACERTO?" com text-shadow laranja
- Formulário com campo de nome e input de pessoas
- Adicionar 2+ pessoas → chips coloridos aparecem
- Submit com nome + 2 pessoas → navega para /novo/upload (404 por enquanto — ok)
- Submit sem nome → erro "Nome do acerto é obrigatório"
- Submit com < 2 pessoas → erro "Adicione pelo menos 2 pessoas"

- [ ] **Step 3: Commit**

```bash
git add src/pages/novo.astro
git commit -m "feat: add /novo wizard step 1 page"
```

---

## Task 10: ChatUploader island

**Files:**
- Create: `src/components/react/ChatUploader.tsx`

- [ ] **Step 1: Criar src/components/react/ChatUploader.tsx**

```tsx
import { useState, useEffect, useCallback } from 'react'
import type { Trip, Transaction } from '../../lib/types'

export default function ChatUploader() {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('rca_trip')
    if (!raw) { window.location.href = '/novo'; return }
    setTrip(JSON.parse(raw) as Trip)
  }, [])

  const loadText = (content: string) => {
    setText(content)
    setPreview(content.split('\n').filter(l => l.trim()).slice(0, 5))
    setError('')
    setTransactions([])
  }

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.txt')) {
      setError('Apenas arquivos .txt são aceitos (WhatsApp → Exportar Chat → Sem Mídia)')
      return
    }
    const reader = new FileReader()
    reader.onload = e => loadText(e.target?.result as string)
    reader.readAsText(file, 'utf-8')
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text')
    if (pasted) loadText(pasted)
  }, [])

  const extract = async () => {
    if (!text || !trip) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/extract-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, people: trip.people }),
      })
      const data = await res.json() as { transactions?: Transaction[]; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na extração')
      if (!data.transactions?.length) throw new Error('Nenhuma transação encontrada no chat')
      setTransactions(data.transactions)
      sessionStorage.setItem('rca_transactions', JSON.stringify(data.transactions))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  if (!trip) return null

  return (
    <div className="font-mono">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onPaste={handlePaste}
        tabIndex={0}
        className="border-2 border-dashed p-8 text-center mb-4 focus:outline-none transition-colors"
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
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <label htmlFor="chat-file" className="cursor-pointer block">
          <p className="text-sm font-bold text-brand-dark mb-1">
            {text ? '✓ Chat carregado' : 'Arraste o .txt aqui ou clique para selecionar'}
          </p>
          <p className="text-xs" style={{ color: 'rgba(26,10,0,0.5)' }}>
            Ou cole o texto diretamente com Ctrl+V
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(26,10,0,0.4)' }}>
            WhatsApp → ⋮ → Mais → Exportar conversa → Sem mídia
          </p>
        </label>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="bg-brand-dark text-brand-cream text-xs p-3 mb-4">
          <p className="text-brand-orange mb-1 tracking-widest uppercase text-xs">Preview:</p>
          {preview.map((line, i) => (
            <p key={i} className="truncate" style={{ opacity: 0.6 }}>{line}</p>
          ))}
          <p style={{ opacity: 0.3 }} className="mt-1">...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs font-bold mb-4 border border-red-600 text-red-600 px-3 py-2">
          {error}
        </p>
      )}

      {/* Extract button */}
      {text && !transactions.length && (
        <button
          onClick={extract}
          disabled={loading}
          className="w-full bg-brand-dark text-brand-orange font-extrabold tracking-widest text-sm px-6 py-3 hover:bg-brand-orange hover:text-brand-dark transition-colors disabled:opacity-50"
        >
          {loading ? '⏳ LENDO O CHAT COM IA...' : '→ EXTRAIR TRANSAÇÕES'}
        </button>
      )}

      {/* Results */}
      {transactions.length > 0 && (
        <div>
          <p className="text-xs tracking-widest uppercase mb-3" style={{ color: 'rgba(26,10,0,0.5)' }}>
            {transactions.length} transações encontradas
          </p>
          <div className="flex flex-col gap-1.5 mb-6">
            {transactions.map(t => {
              const payer = trip.people.find(p => p.id === t.payerId)
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between text-sm px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.6)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {payer && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: payer.color }}
                      />
                    )}
                    <span className="truncate" style={{ color: 'rgba(26,10,0,0.7)' }}>
                      {t.description}
                    </span>
                  </div>
                  <span className="font-extrabold text-brand-dark whitespace-nowrap ml-2">
                    R$ {(t.amount / 100).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-center" style={{ color: 'rgba(26,10,0,0.4)' }}>
            ✓ Transações salvas. Revisão e buckets chegam na próxima sessão.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm typecheck
```

Esperado: sem erros em `src/components/react/ChatUploader.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/react/ChatUploader.tsx
git commit -m "feat: add ChatUploader react island with drag-drop and ai extraction"
```

---

## Task 11: Página /novo/upload (wizard step 2)

**Files:**
- Create: `src/pages/novo/upload.astro`

- [ ] **Step 1: Criar src/pages/novo/upload.astro**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro'
import Nav from '../../components/astro/Nav.astro'
import ChatUploader from '../../components/react/ChatUploader'
---
<BaseLayout title="Upload do chat">
  <Nav showBack={true} />
  <main
    class="min-h-[calc(100vh-40px)]"
    style="background: linear-gradient(160deg, #f7c59f, #efefd0)"
  >
    <div class="max-w-lg mx-auto px-4 py-10">
      <div class="font-mono mb-8">
        <p class="text-xs tracking-widest uppercase mb-1" style="color: rgba(26,10,0,0.5)">
          passo 2 de 2
        </p>
        <h1
          class="text-3xl font-black text-brand-dark mb-2"
          style="font-family: Georgia, serif; text-shadow: 2px 2px 0 #ff6b35"
        >
          COLA O CHAT.
        </h1>
        <p class="text-sm" style="color: rgba(26,10,0,0.6)">
          WhatsApp → conversa → ⋮ → Mais → Exportar conversa → Sem mídia
        </p>
      </div>
      <ChatUploader client:load />
    </div>
  </main>
</BaseLayout>
```

- [ ] **Step 2: Testar fluxo completo no browser**

```bash
pnpm dev
```

Testar fluxo completo:
1. `/` → clicar "COMEÇAR UM ACERTO" → vai pra `/novo`
2. `/novo` → preencher nome + 2 pessoas → submit → vai pra `/novo/upload`
3. `/novo/upload` → arrastar um `.txt` do WhatsApp → preview aparece → clicar "EXTRAIR" → lista de transações aparece

- [ ] **Step 3: Commit**

```bash
git add src/pages/novo/upload.astro
git commit -m "feat: add /novo/upload wizard step 2 page"
```

---

## Task 12: Verificação final + GitHub

**Files:** nenhum arquivo novo

- [ ] **Step 1: Typecheck**

```bash
pnpm typecheck
```

Esperado: `Found 0 errors.`

- [ ] **Step 2: Build de produção**

```bash
pnpm build
```

Esperado: build completo em `dist/`, sem warnings críticos. Output inclui `dist/_worker.js` (Cloudflare Worker).

- [ ] **Step 3: Criar repositório no GitHub**

```bash
gh repo create rachacerto --public --source=. --remote=origin --description "Racha a conta. Fecha o acerto."
```

Esperado: URL do repositório exibida (ex: `https://github.com/<usuario>/rachacerto`).

- [ ] **Step 4: Push**

```bash
git push -u origin main
```

Esperado: todos os commits enviados pro GitHub.

- [ ] **Step 5: Confirmar critérios de conclusão**

- [ ] `pnpm dev` sobe sem erro em `localhost:4321`
- [ ] `pnpm typecheck` passa com 0 erros
- [ ] `pnpm build` compila sem warnings críticos
- [ ] Landing carrega em `/` com layout split hero Y2K
- [ ] `/novo` aceita nome + pessoas e navega para `/novo/upload`
- [ ] `/novo/upload` aceita `.txt` e exibe transações extraídas via Claude
- [ ] API `/api/extract-chat` responde no edge runtime

---

*Plano gerado em 28/04/2026 a partir do design spec aprovado.*
