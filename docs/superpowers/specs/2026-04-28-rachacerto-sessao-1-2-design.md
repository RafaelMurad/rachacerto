# RachaCerto · Sessão 1+2 — Design Spec

> Aprovado em 28/04/2026
> Escopo: Skeleton Astro + Landing + Wizard criar acerto + Upload de chat

---

## Produto

**Nome:** RachaCerto  
**Tagline:** Racha a conta. Fecha o acerto.  
**Stack:** Astro 5 · React islands · Tailwind v4 · shadcn/ui · Cloudflare Workers · Claude Haiku 4.5

---

## Escopo desta sessão

| Sessão | O que entrega |
|---|---|
| 1 | Projeto Astro inicializado + todas as integrações + landing page |
| 2 | Wizard `/novo` (setup) + `/novo/upload` (chat) + `/api/extract-chat` |

---

## Arquitetura

### Abordagem: Multi-page Astro + React islands

Cada passo do wizard é uma página `.astro`. A lógica interativa de cada passo é uma React island isolada. Estado viaja via `sessionStorage` entre páginas.

**Por quê não uma island única:** URL por passo (back button funciona), bundle menor, alinha com a filosofia "default Astro" do projeto.

**Por quê não Astro Actions:** o wizard é upload-heavy (drag-drop, paste). React islands são mais adequadas para essa UX.

---

## Páginas e rotas

| Rota | Arquivo | Tipo | Descrição |
|---|---|---|---|
| `/` | `src/pages/index.astro` | Astro estático | Landing page |
| `/novo` | `src/pages/novo.astro` | Astro + island | Step 1: nome + pessoas |
| `/novo/upload` | `src/pages/novo/upload.astro` | Astro + island | Step 2: upload chat |
| `/api/extract-chat` | `src/pages/api/extract-chat.ts` | Cloudflare Worker | Extração via Claude |

---

## Componentes React (islands)

### `SetupForm.tsx`
- Campos: nome do acerto (obrigatório, máx 60 chars) + lista de pessoas
- Adicionar pessoa: input + Enter ou botão "+"
- Cada pessoa recebe cor automática de uma paleta de 8 cores (rotação)
- ID de pessoa: ULID via `ulid` package
- Submit: valida (mín 2 pessoas), salva em `sessionStorage`, navega pra `/novo/upload`
- Error states: nome vazio, menos de 2 pessoas

### `ChatUploader.tsx`
- Aceita: drag-drop de arquivo `.txt` OU paste de texto (`Ctrl+V`)
- Mostra preview das primeiras 5 linhas do chat antes de processar
- Botão "Extrair transações" → POST `/api/extract-chat`
- Loading state: spinner com mensagem "Lendo o chat com IA..."
- Resultado: lista de `Transaction[]` extraídas (leitura apenas nesta sessão — edição vem na Sessão 3)
- Error states: arquivo inválido (não `.txt`), falha na API, zero transações encontradas

---

## Tipos de domínio

`src/lib/types.ts` — definidos antes de qualquer implementação:

```ts
export type Person = {
  id: string        // ULID
  name: string
  color: string     // hex da paleta
}

export type Trip = {
  id: string        // ULID
  name: string
  people: Person[]
  createdAt: string // ISO 8601
}

export type Transaction = {
  id: string        // ULID
  date: string      // ISO 8601 ou string do chat
  description: string
  amount: number    // em centavos
  payerId: string   // Person.id — string vazia '' se pagador não identificado
  raw: string       // linha original do chat
}
```

---

## Fluxo de estado (MVP sem Supabase)

```
/novo (SetupForm)
  → valida form
  → sessionStorage.setItem('rca_trip', JSON.stringify(Trip))
  → window.location.href = '/novo/upload'

/novo/upload (ChatUploader)
  → trip = JSON.parse(sessionStorage.getItem('rca_trip'))
  → guard: se trip === null → redirect('/novo')
  → POST /api/extract-chat { text: string, people: Person[] }
  → sessionStorage.setItem('rca_transactions', JSON.stringify(Transaction[]))
  → (próxima sessão: navega pra revisão)
```

---

## API: `/api/extract-chat`

**Runtime:** Cloudflare Worker (edge, sem Node APIs)

**Request:**
```ts
{ text: string, people: Person[] }
```

**Response:**
```ts
{ transactions: Transaction[] }
// ou
{ error: string }
```

**Modelo:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — econômico para extração estruturada.

**Prompt strategy:** System prompt define o schema JSON esperado. User message contém o texto do chat + lista de nomes. Claude tenta mapear pagador para `Person.id`. Transações com pagador ambíguo retornam `payerId: ''`.

**Headers de privacidade:**
```
Cache-Control: no-store
x-no-store: 1
```

---

## Design system: Y2K Brasil

### Tokens (em `src/styles/global.css`)

```css
@theme {
  --color-brand-orange: #ff6b35;
  --color-brand-dark:   #1a0a00;
  --color-brand-cream:  #f7c59f;
  --color-brand-light:  #efefd0;
  --color-brand-bg:     #efefd0;
}
```

### Tipografia
- Headlines: `Georgia, serif` — bold, impactante
- Labels, nav, tags, código: `'Courier New', monospace`
- Body: `system-ui` — legível, sem drama

### Textura CRT
Overlay sutil com `repeating-linear-gradient` de scanlines. Intensidade baixa (3–4% opacidade) pra não cansar. Aplicada na landing e na página de resultado — wizard é mais limpo.

---

## Landing page: layout B (split hero)

```
┌─ Nav ─────────────────────────────────────────┐
│ [RACHACERTO]                          [BETA]   │
└───────────────────────────────────────────────┘
┌─ Hero ────────────────────────────────────────┐
│  Left 50%                  Right 50%          │
│  ─────────────────         ────────────────── │
│  sem planilha.             [mockup resultado] │
│  sem app.                  Rafa → Ju R$87,50  │
│  só o WhatsApp.            João → Higor R$45  │
│                            [VER QR CODES →]   │
│  RACHA A CONTA.                               │
│  FECHA O ACERTO.                              │
│                                               │
│  [→ COMEÇAR UM ACERTO]                        │
└───────────────────────────────────────────────┘
┌─ Features ────────────────────────────────────┐
│  ✓ sem cadastro  ✓ qualquer banco BR  ✓ PIX   │
└───────────────────────────────────────────────┘
```

**Mobile:** hero vira coluna única (copy em cima, mockup some ou vira menor embaixo). CTA fica no thumb zone.

---

## Inicialização do projeto

### Dependências a instalar

```bash
pnpm create astro@latest . -- --template minimal --typescript strict --no-git
pnpm astro add react tailwind cloudflare
pnpm add -D @types/react
pnpm add ulid pix-utils unpdf
pnpm add @anthropic-ai/sdk
pnpm dlx shadcn@latest init
```

### Variáveis de ambiente

`.dev.vars` (Cloudflare local):
```
ANTHROPIC_API_KEY=sk-...
```

`wrangler.toml`: binding do secret para produção.

---

## Critérios de conclusão da sessão

- [ ] `pnpm dev` sobe sem erro
- [ ] `pnpm typecheck` passa com zero erros
- [ ] `pnpm build` compila pro Cloudflare Pages
- [ ] Landing carrega em `/` com layout split e CTA funcional
- [ ] `/novo` aceita nome + pessoas e navega pro upload
- [ ] `/novo/upload` aceita `.txt` e exibe transações extraídas
- [ ] API `/api/extract-chat` responde em edge runtime

---

*Spec gerada pelo brainstorming session — fonte da verdade até a implementação começar.*
