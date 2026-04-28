# CLAUDE.md

> Contexto persistente do projeto. Carregado automaticamente em toda session do Claude Code.
> **Mantenha curto.** Cada token aqui compete por atenção. Detalhes vão em `/docs/` por tópico.

---

## O que é o projeto

Web app que lê chat do WhatsApp + extrato bancário e devolve PIX simplificados pra zerar despesas de viagem em grupo. Brasil-only no MVP, PIX-nativo, zero cadastro de despesa pelo usuário.

**Source of truth:** `PRD.md` na raiz. Sempre referencie features pela seção do PRD.

## Stack

- **Astro 5** com `output: 'server'` e adapter `@astrojs/cloudflare`
- **React** apenas em islands (`@astrojs/react`) — preferir `.astro` quando não precisa interatividade
- **Tailwind v4** + **shadcn/ui** pra componentes React
- **Supabase** (Postgres + Auth + Storage) — só a partir da v0.2
- **Anthropic Claude API** (Sonnet 4.6 default; Haiku 4.5 onde der pra economizar)
- **`unpdf`** pra PDF parsing (edge-compatible — funciona em Cloudflare Workers)
- **`pix-utils`** pra geração de BR Code PIX
- **Cloudflare Pages** pra hospedagem; **Cloudflare Workers** pra API endpoints

## Convenções

### Estrutura de pastas

```
src/
├── pages/
│   ├── index.astro              # landing
│   ├── novo.astro               # criar acerto
│   ├── t/[slug].astro           # página pública (mostly static)
│   └── api/                     # Cloudflare Workers
├── components/
│   ├── astro/                   # zero JS no bundle
│   └── react/                   # islands interativas
├── lib/                         # utilitários puros
└── styles/global.css            # Tailwind + tokens editoriais
```

### Regra de ouro: Astro vs React island

- **Default `.astro`** — qualquer componente que renderiza HTML estático
- **Só vira `.tsx`** quando precisa de estado, eventos, ou efeitos
- Se em dúvida: `.astro`. Migra pra island quando a dor aparecer.

### Naming

- Arquivos: `kebab-case.astro`, `PascalCase.tsx`
- Componentes React: `PascalCase`
- Endpoints API: `/api/extract-chat`, `/api/extract-statement` (kebab-case)
- IDs de bucket / pessoa: ULID via `ulid` package

### TypeScript

- `strict: true` no `tsconfig.json` (não negociável)
- Sem `any`. Quando necessário, use `unknown` + narrowing.
- Tipos de domínio em `src/lib/types.ts`

### Estilo

- Indent: 2 spaces
- Aspas simples em JS/TS, duplas em JSX/HTML
- Sem ponto-vírgula no fim de linha (TS)
- Tailwind: ordem de classes via `prettier-plugin-tailwindcss`

## Princípios não-negociáveis

1. **Privacidade primeiro.** PDFs de extrato processados em memória, nunca persistidos em DB nem em logs. Apenas transações estruturadas vão pro Supabase.
2. **Zero digitação no happy path.** Toda transação vem de upload (chat ou PDF). Edição manual existe mas é exceção.
3. **Erra graciosamente.** A IA vai errar 5–10%. Sempre tela de revisão antes de fechar.
4. **Sem auth no MVP.** Trip = URL com slug random. Auth (magic link) entra na v0.2.
5. **Não armazenar dados sensíveis em env vars não-marcadas.** Todo secret no Cloudflare Pages é "encrypted at rest".

## Workflow agentic (pra mim, Claude)

### Antes de implementar QUALQUER feature

1. Leia a seção relevante do `PRD.md`
2. Use **plan mode** se a mudança toca >2 arquivos
3. No plano, sempre liste:
   - Arquivos novos vs. modificados
   - Tipos / interfaces que vão ser criados
   - Testes ou verificações pra rodar no fim
4. Aguarde aprovação antes de executar

### Ao escrever código

- **Comece pelo tipo.** Defina interfaces TS antes da implementação.
- **Errors first.** Pense nos error states antes do happy path.
- **Edge runtime.** Cloudflare Workers — sem Node APIs (`fs`, `crypto.createHash`, etc). Use Web APIs.
- **Sem comentários óbvios.** Comente o "porquê", não o "o quê".
- **Tudo em PT-BR (UI).** Strings de interface em português. Identificadores em inglês.

### Ao terminar uma feature

- Rode `pnpm typecheck` (deve passar zero errors)
- Rode `pnpm build` localmente (deve buildar pro Cloudflare Pages)
- Liste pro usuário: arquivos tocados + como testar
- **Não faça commit/push automaticamente.** Use `/ship` quando o usuário aprovar.

## Comandos úteis

```bash
pnpm dev            # dev server local
pnpm build          # build de produção
pnpm typecheck      # checa tipos sem build
pnpm preview        # preview do build local
pnpm wrangler       # CLI do Cloudflare
```

## O que NÃO fazer

- ❌ Não usar `localStorage` em React islands sem checar SSR (`typeof window !== 'undefined'`)
- ❌ Não criar slash commands novos sem o usuário pedir
- ❌ Não instalar dependências grandes sem justificar (cada lib é superfície de ataque)
- ❌ Não commit `.env`, `.dev.vars`, ou qualquer arquivo com secret
- ❌ Não puxar `any` do TypeScript pra "fazer compilar"
- ❌ Não escrever testes E2E no MVP — só testes unitários do `lib/settle.ts` e `lib/pix.ts`

## Glossário do domínio

- **Acerto** (trip) = uma viagem ou rolê com despesas pra dividir
- **Pessoa** (person) = participante de um acerto
- **Bucket** = grupo de transações que segue uma regra de divisão (ex: "÷ todos", "÷ Rafa+Ju")
- **Transação** (transaction) = despesa ou pagamento individual
- **Saldo** (balance) = quanto cada pessoa pagou menos quanto devia
- **PIX simplificado** (settlement) = transferência mínima pra zerar saldos
- **BR Code** = padrão BCB pra QR code de PIX

## Links úteis

- PRD completo: `./PRD.md`
- Astro docs: https://docs.astro.build
- Cloudflare Workers + Astro: https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/
- Anthropic API: https://docs.claude.com
- pix-utils: https://github.com/PicPay/pix-utils
- unpdf: https://github.com/unjs/unpdf
- BR Code spec (BCB): https://www.bcb.gov.br/estabilidadefinanceira/spbadendos
