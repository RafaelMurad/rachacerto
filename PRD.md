# PRD · "PG Acerto" → produto real

> Discovery + PRD + Plano de execução
> v0.1 · abril/2026 · Rafa Murad
> Status: rascunho — pra discutir e iterar

---

## 1 · Vision & princípios

### O que é

Um web app que **lê o que já existe** (chat do WhatsApp + extrato bancário) e devolve **três coisas que importam**:

1. *quem deve quanto pra quem*
2. *o **mínimo possível** de PIX pra zerar tudo*
3. *um QR code clicável pra cada PIX*

Sem cadastro de despesa, sem digitar nada, sem app instalado. Cola o que você já tem, recebe o veredito.

### Por que existe

Splitwise tem 14 anos, 10M de usuários e fatura menos de US$5M/ano. A categoria é dura porque pede um trabalho que ninguém quer fazer: **digitar tudo durante a viagem**. Esse produto inverte: ele lê o que ficou pra trás. WhatsApp + extrato já contam a história — só falta interpretar.

### Princípios

- **Zero digitação.** Toda transação vem de upload (chat ou PDF) ou de OCR. Edição manual existe, mas é exceção, não regra.
- **Zero cadastro no MVP.** Cada acerto vira uma URL compartilhável. Sem senha, sem e-mail.
- **PIX-nativo.** Não é um "Splitwise em português". É um produto pensado pra como brasileiro racha de fato — WhatsApp + PIX.
- **Artefato compartilhável.** O resultado não é só uma tela com números. É uma página pública editorial que vira print no grupo. *A mensagem do amigo tem que dar inveja.*
- **Erra graciosamente.** A IA vai errar 5–10% das transações. A UX assume isso desde o dia 1: revisão antes de fechar.

### O que NÃO é

- ❌ Splitwise. Não é gestão contínua de despesas entre pessoas que dividem casa.
- ❌ App de gastos pessoal. Não substitui Mobills, Organizze, etc.
- ❌ Carteira de pagamento. Não processa PIX — só gera o QR code que você abre no banco.
- ❌ Open Finance / agregador. Pelo menos não no MVP.
- ❌ Internacional. Sem multi-moeda no MVP. PIX é o ponto.

---

## 2 · Usuário-alvo & gatilho de uso

### Persona principal

**Rafa, 32, mora em MG, viaja com amigos 3–4× por ano.**

- Tem conta em 2–3 bancos (Revolut, Nubank, talvez Itaú/BB)
- WhatsApp é onde rola toda combinação ("paguei o uber", "cara, quanto deu o pedágio?")
- Já é o "cara da planilha" do grupo
- Tem fricção real: cada viagem ele perde 1–2 horas no fim batendo conferência
- Já testou Splitwise, achou chato, ninguém do grupo quer cadastrar despesa em tempo real

### Gatilho de uso

**Final de uma viagem de 2–7 dias** com 3–6 pessoas. Voltou pra casa, alguém posta no grupo *"e aí, vamo acertar?"*. **Esse é o momento.** Não é durante a viagem.

### Frequência

3–6× por ano, por usuário ativo. Baixa frequência **é uma característica**, não bug. O produto não precisa ser engajamento diário — precisa ser **insubstituível no momento certo**.

### Mercado

Brasil tem ~150M de usuários PIX. Se 10% viaja em grupo 2× por ano, são 30M de eventos/ano. Mesmo capturando 0,1%, são 30k acertos/ano — o suficiente pra validar.

---

## 3 · Core user flow (happy path)

```
1. Landing → "Começar um acerto" (sem login)

2. Setup (30s)
   ├─ Nome do acerto: "PG abril 2026"
   └─ Adicionar pessoas: Rafa · Ju · Higor · João
       (apenas nomes; cada um ganha cor automática)

3. Upload (60s)
   ├─ Cola/anexa o .txt do WhatsApp (Exportar Chat → Sem mídia)
   ├─ Anexa 1 ou + PDFs de extrato
   └─ [Skip se quiser inserir manual]

4. Revisão (2–4min)
   ├─ Lista de transações extraídas
   ├─ Pra cada uma: data · descrição · valor · pagador · sugestão de bucket
   ├─ Edita / remove / adiciona o que faltou
   └─ Confirma

5. Buckets (1min)
   ├─ Cria/edita "como dividir":
   │   • Bucket "Tudo" (÷ todos)
   │   • Bucket "Caipi" (÷ Rafa + Ju)
   │   • Bucket "Araraquara" (÷ todos − João)
   └─ Arrasta cada transação pro bucket certo
       (a IA chuta um inicial)

6. Veredito (instantâneo)
   ├─ Tabela de saldo final
   ├─ N PIX simplificados (mínimo possível)
   └─ Pra cada PIX: QR + chave + copy-paste

7. Compartilhar
   ├─ URL pública: pgacerto.app/t/abc123
   └─ Mensagem pré-formatada: "Galera, fechei o acerto: [link]"

8. Acompanhar (v0.2+)
   ├─ Cada pessoa vê o link, marca "paguei"
   └─ Status do grupo: 2/3 pagos
```

---

## 4 · Features por fase

### MVP (v0.1) — o que vai pra produção primeiro

| # | Feature | Como funciona |
|---|---|---|
| 1 | Criar acerto | Nome + lista de pessoas |
| 2 | Upload de chat .txt | Drag-drop ou colar texto |
| 3 | Upload de PDF de extrato | 1+ arquivos, qualquer banco BR |
| 4 | Extração via Claude | Server-side API call → JSON estruturado |
| 5 | Revisão de transações | Tabela editável (add/del/edit) |
| 6 | Buckets manuais | Criar bucket → escolher quem participa → atribuir transação |
| 7 | Cálculo de saldos | Cliente, instantâneo, sem API |
| 8 | Algoritmo de simplificação | Minimiza nº de PIX (greedy creditors↔debtors) |
| 9 | QR Code PIX | Lib client-side, padrão BR Code do BCB |
| 10 | URL pública | `pgacerto.app/t/{slug}` — todos com link veem |
| 11 | Página resultado editorial | Inspirada no atual GitHub Pages, mas dinâmica |
| 12 | Mensagem pré-formatada | Botão "Copiar resumo pro grupo" |

### v0.2 — depois que os amigos testarem

| # | Feature | Por quê |
|---|---|---|
| 13 | Auth magic-link | Pra cada um marcar "paguei" |
| 14 | Persistência (Supabase) | Acertos não somem |
| 15 | "Marcar pago" | Status visível pro grupo |
| 16 | Comentários por transação | "Esse uber foi só meu, tira" |
| 17 | Histórico do usuário | Lista de acertos passados |
| 18 | Foto de comprovante | Upload + lightbox (já existe no protótipo) |
| 19 | Templates ("viagem", "rolê", "rateio do mês") | Buckets pré-configurados |

### v1.0 — se a coisa pegar

| # | Feature | Por quê |
|---|---|---|
| 20 | PWA com install prompt | iOS/Android sem app store |
| 21 | Open Finance (Pluggy/Belvo) | Conecta o banco direto, sem PDF |
| 22 | Multi-moeda + câmbio | Viagens ao exterior |
| 23 | Recorrências (vaquinha mensal) | Só se gente pedir |
| 24 | Compartilhar via link curto | t.me/whatsapp friendly |

### Anti-features (intencionalmente fora pra sempre)

- Notificações push diárias
- Categorização automática de gastos pessoais
- Análise / dashboard de gastos
- Integração com cartão de crédito da pessoa
- Pagamento *dentro* do app
- "Rede social" (lista de amigos, perfis)

---

## 5 · Stack técnica

### Recomendação

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | **Astro 5** + **React islands** (`@astrojs/react`) | Islands architecture: HTML estático onde fizer sentido, React rico onde precisar |
| Estilo | **Tailwind v4 + shadcn/ui** | Funciona perfeito com Astro+React |
| Backend | **Astro Actions + Pages Functions** (Cloudflare Workers) | Type-safe, edge runtime, conceito próximo de Server Actions |
| Banco | **Supabase** (Postgres + Auth + Storage) | Free tier generoso, RLS poderoso, BR-friendly |
| LLM | **Anthropic Claude API** (Sonnet 4.6) | Você já tem acesso, melhor em PT-BR |
| PDF parsing | **`unpdf`** (edge-compatible) + Claude estrutura | Funciona em Cloudflare Workers, universal |
| PIX QR | **`pix-utils`** (npm) | Implementa BR Code do BCB |
| Hospedagem | **Cloudflare Pages** | Free tier sólido (100k req/dia), GitHub integration nativa |
| Domínio | **`.app` ou `.com.br`** | ~R$50–80/ano |
| Analytics | **Plausible** ou **Cloudflare Web Analytics** | Privacy-friendly, R$0 |

### Por que essa stack

**Por que Astro em vez de Next.js?** Em abril/2026 a Vercel sofreu um supply-chain attack via Context.ai, e Next.js teve CVEs de RCE recentes (CVE-2025-55182 em RSC, CVE-2026-23869 em App Router 13–16). Astro tem uma superfície de ataque menor e — mais importante — uma **arquitetura ("islands") que casa muito bem com esse produto**:

- **A página pública de resultado** (`/t/{slug}`) é majoritariamente leitura — vira HTML estático puro. Carrega rápido, vai bem em qualquer rede ruim, dá zero atrito pros amigos abrirem o link no WhatsApp.
- **Os fluxos de criar/editar trip** (upload, revisão, atribuir buckets) são interativos — viram React islands isoladas. Você escreve React onde React adiciona valor, e nada mais.

**Por que Cloudflare em vez de Vercel?** Histórico de segurança mais sólido, free tier mais generoso (100k requests/dia), e tira o projeto da bolha que sofreu o ataque recente. Workflow é praticamente idêntico — conecta GitHub, auto-deploy de `main`.

Cada peça te força a aprender algo novo: islands architecture, Astro Actions, Cloudflare Workers, Postgres com RLS, embed de LLM em produção, padrões de pagamento BR. Tudo gratuito até centenas de MAU.

### Arquitetura (high-level)

```
┌─ Browser ───────────────────────────────────────┐
│  • Astro = HTML estático nas páginas públicas   │
│  • React islands nos fluxos interativos:        │
│    ChatUploader, TransactionEditor, BucketUI    │
│  • Cálculo de saldo (puro JS, client-side)      │
│  • PIX QR (client-side, lib pix-utils)          │
└────────┬────────────────────────────────────────┘
         │ Astro Actions / fetch para
         │ /api/extract-chat
         │ /api/extract-statement
         ▼
┌─ Cloudflare Workers (edge runtime) ─────────────┐
│  • Recebe arquivo (chat .txt ou PDF)            │
│  • unpdf extrai texto                           │
│  • Chama Anthropic API                          │
│  • Devolve JSON estruturado                     │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─ Supabase ──────────────────────────────────────┐
│  • trips, people, transactions, buckets, pix    │
│  • Magic-link auth (v0.2)                       │
│  • RLS: cada acerto, quem tem o link vê         │
└─────────────────────────────────────────────────┘
```

### Estrutura de pastas (proposta)

```
src/
├── pages/
│   ├── index.astro              # landing pública
│   ├── novo.astro               # wizard de criar acerto (carrega islands)
│   ├── t/[slug].astro           # página pública do acerto (mostly static)
│   └── api/                     # Cloudflare Workers
│       ├── extract-chat.ts
│       ├── extract-statement.ts
│       └── trips/[slug].ts      # CRUD via Supabase (v0.2)
│
├── components/
│   ├── astro/                   # componentes estáticos puros (zero JS)
│   │   ├── Masthead.astro
│   │   ├── PersonChip.astro
│   │   └── PixCard.astro        # QR + chave + copy-paste
│   │
│   └── react/                   # islands interativas
│       ├── ChatUploader.tsx
│       ├── StatementUploader.tsx
│       ├── TransactionEditor.tsx
│       ├── BucketAssigner.tsx
│       └── MarkAsPaid.tsx       # v0.2
│
├── lib/
│   ├── claude.ts                # cliente Anthropic
│   ├── settle.ts                # algoritmo de simplificação
│   ├── pix.ts                   # geração de BR Code
│   └── supabase.ts              # cliente DB (v0.2)
│
└── styles/
    └── global.css               # Tailwind + tokens editoriais
```

**Regra de ouro:** se um componente nunca precisa reagir a interação do usuário, ele é `.astro` (zero JS no bundle). Se precisa, é `.tsx` (React island). *Default to Astro — só vira island quando dor.*

### Privacidade & dados sensíveis

Extratos bancários são **dados sensíveis**. Política do MVP:

- ✅ PDFs processados em memória, **nunca persistidos**
- ✅ Apenas as transações estruturadas (data, descrição, valor) vão pro DB
- ✅ Página de privacidade clara: o que sobe, o que fica, o que some
- ✅ Header `x-no-store` em endpoints de upload
- ❌ Sem armazenamento de PDFs raw — nem com criptografia (não vale o risco)

---

## 6 · Decisões de produto que precisam ser feitas

Cada uma tem opção recomendada, mas vale discutir.

### DEC-1 · Auth no MVP?

| Opção | Prós | Contras |
|---|---|---|
| **A · Sem auth, URL pública (rec MVP)** | Friction zero, ship em 2 fds | Qualquer um com link pode editar |
| B · Magic link obrigatório | Tracking de "quem pagou", segurança | +1 semana de dev, friction de onboarding |
| C · "Dono edita, resto só vê" via token | Híbrido inteligente | Complexidade de auth diferenciada |

**Recomendação:** A no MVP. Migra pra C na v0.2 sem quebrar nada.

### DEC-2 · Como extrair transações de extrato?

| Opção | Prós | Contras |
|---|---|---|
| A · Parser custom por banco | Preciso, rápido | Cada banco diferente, manutenção infinita |
| **B · PDF → texto → Claude (rec MVP)** | Universal, qualquer banco BR | Custo por chamada, ~5–10% erro |
| C · Open Finance (Pluggy/Belvo) | UX maravilhosa, real-time | Compliance, custo, BCB approval |

**Recomendação:** B no MVP. C eventual na v1.0 *se* a base de usuários justificar custo (~R$2/conta/mês via Pluggy).

### DEC-3 · Layout pra mobile?

| Opção | Prós | Contras |
|---|---|---|
| **A · Web responsivo (rec MVP)** | Ship rápido, manutenção única | Não dá pra "instalar" |
| B · PWA com install prompt | Vira ícone na home, offline básico | +1 fd de config + service worker |
| C · Capacitor → app stores | Push notif, presença nas lojas | App review, contas de dev (R$1.500/ano) |

**Recomendação:** A no MVP. B na v0.2 (custo é baixo). C provavelmente nunca.

### DEC-4 · Modelo de receita (longo prazo)

| Opção | Mecânica | Realidade |
|---|---|---|
| A · Freemium SaaS (R$5/mês unlimited) | Splitwise model | Categoria comprovadamente paga mal |
| **B · Transacional (R$3–5 por acerto premium)** | Pago só quando "fecha" um acerto grande | Sem assinatura, sem churn, viral |
| C · 100% grátis + ads contextuais | Revenue por impressão | Volume alto necessário, UX pior |
| D · 100% grátis pra sempre | Projeto pessoal, portfólio | Sem receita, mas sem pressão também |

**Recomendação:** D pelos primeiros 3–6 meses. Se atingir 100+ acertos/mês, reavalia entre B e C.

### DEC-5 · Nome do produto

`pgacerto` é nome de protótipo, não de produto. Direções:

- **Verbais BR:** Acerta · Racha · Fecha · Zera · Quita
- **Culturais BR:** Vaquinha · Mutirão · Bondé · Tribo
- **Tech-y:** Tab.app · Splid (já existe) · Pixly · Brindle
- **Editorial:** O Acerto · A Quitação · Plot Twist

**Recomendação:** decidir depois do MVP funcional. Domínio é o gargalo principal — checa disponibilidade quando for nomear.

---

## 7 · Skills que você vai construir

| Skill | Onde no projeto | Por que importa |
|---|---|---|
| **Especificar feature pra agente** | Toda nova feature: você escreve a spec, Claude Code implementa | A skill #1 de 2026. Vale ouro, ninguém ensina formal. |
| **Plan mode → review → execute** | Toda task: Shift+Tab duas vezes, lê o plano, ajusta, aprova | Evita 80% dos retrabalhos. Hábito que fica pra vida. |
| **CLAUDE.md design** | Raiz do repo + por feature | Engenharia de contexto — saber o que o agente precisa saber e o que tirar. |
| **Code review crítico** | A cada PR / a cada session | Ler o que outro escreveu é mais didático que escrever do zero. |
| **Slash commands customizados** | `.claude/commands/` | Automatiza padrões repetidos (commit, deploy, lint). |
| **Subagents pra tarefas isoladas** | `.claude/agents/` (v0.2+) | Ex: agente de security review com permissões reduzidas. |
| Astro 5 + Islands architecture | Toda UI (via Claude Code) | Você revisa, então aprende ao revisar. |
| Postgres + Supabase RLS | Data layer (via Claude Code) | DB skill que você ganha lendo o que o agente escreve. |
| LLM em produção | Extração (via Claude Code) | Prompt engineering real — vai dirigir o Claude pra dirigir o Claude. |
| Padrão BR Code (PIX) | QR generation | Spec interessante, agente implementa, você verifica. |
| Algoritmo de simplificação de débito | Settlement | Escreve o spec do algoritmo, agente implementa, você testa. |
| Git hygiene em ritmo agentic | Toda session | PRs frequentes pra manter diff revisável. |

---

## 8 · Plano de execução (6 semanas, ~3h/semana)

Premissa: você dirige Claude Code, ele codifica. Cada sessão é ~3h: 30min especificando, 1h o agente trabalha (você acompanha), 1h você revisa o código e ajusta o que tá errado, 30min ship/commit/deploy.

**Ritmo padrão de cada session:**
1. Abre o repo, `claude` no terminal
2. Diz o que quer construir (referencia a seção do PRD)
3. Ativa **plan mode** (Shift+Tab × 2)
4. Lê o plano. Discute. Ajusta. Aprova só quando tá certo.
5. Sai do plan mode. Agente executa.
6. Você acompanha (Ctrl+T pra ver progresso)
7. Quando termina: revisa diff, testa local, pede ajustes se preciso
8. `/ship` (slash command custom) commit + push + deploy

### Sessão 0 — Setup (~2h, uma vez só)
- [ ] Instalar Claude Code: `npm install -g @anthropic-ai/claude-code`
- [ ] Login: `claude` → autenticar via Claude Team plan (já incluso)
- [ ] Criar repo no GitHub (nome novo, público)
- [ ] Clonar local, `cd` no repo
- [ ] **Adicionar `CLAUDE.md` na raiz** (template fornecido — ver arquivo separado)
- [ ] **Criar `.claude/commands/ship.md`** (workflow de commit padrão)
- [ ] Comprar domínio + apontar pro Cloudflare
- [ ] `claude` → "leia o PRD.md e o CLAUDE.md, depois inicialize o projeto Astro com as integrations que mandei"

### Sessão 1 — Esqueleto + landing
- [ ] Spec: "Quero o setup completo do Astro 5 com React, Tailwind, Cloudflare adapter, shadcn/ui, e uma landing page simples no `/` dizendo 'Em construção, abril 2026'"
- [ ] Plan mode → revisa estrutura de pastas → aprova
- [ ] Agente executa
- [ ] Você revisa diff, testa local (`pnpm dev`)
- [ ] Deploy pro Cloudflare Pages funcionando
- **Entrega:** site no ar, repo limpo

### Sessão 2 — Fluxo de criar trip + upload de chat
- [ ] Spec: "Página `/novo` com wizard pra criar acerto: nome + lista de pessoas. Componente `<ChatUploader />` (React island) que aceita .txt. Endpoint `/api/extract-chat` em Cloudflare Worker que recebe o texto, chama Claude API e retorna JSON estruturado de transações."
- [ ] Plan mode → revisa o prompt do Claude → ajusta → aprova
- [ ] Agente executa
- [ ] Você testa com o `_chat.txt` real do PG (já temos)
- [ ] Mede taxa de erro real
- **Entrega:** consegue subir um chat e ver transações extraídas

### Sessão 3 — Extrato PDF + revisão de transações
- [ ] Spec: "Componente `<StatementUploader />` (React island) pra PDFs. Endpoint `/api/extract-statement` usa `unpdf` (edge-compatible) + Claude. Tela de revisão com tabela editável (add/del/edit). Detecta duplicatas (mesma data + valor)."
- [ ] Plan mode → especialmente revisa o handling de erros
- [ ] Testa com extratos do Revolut/Nubank reais
- **Entrega:** lista unificada e editável de transações

### Sessão 4 — Buckets + math + PIX QR
- [ ] Spec: "UI de criar bucket (nome + checkbox de quem participa). Atribuir transação a bucket. Algoritmo de saldo (pago − devia). Algoritmo greedy de simplificação de débito. Geração de PIX QR via `pix-utils`."
- [ ] Plan mode → revisa o algoritmo (pseudocódigo) antes de codar
- [ ] Testa com os números do PG real (sabemos o resultado correto)
- **Entrega:** dado um trip, calcula PIX simplificados com QR

### Sessão 5 — Página pública editorial + share
- [ ] Spec: "Página estática `/t/[slug]` com layout editorial (referência: o atual GitHub Pages do PG). URL com slug random. Botão 'copiar resumo pro grupo' que copia mensagem pré-formatada. Web Share API onde disponível."
- [ ] Reaproveitar muito do CSS do `index.html` editorial atual
- **Entrega:** **MVP v0.1 lançado.** Você usa pro próximo acerto.

### Sessão 6 — Feedback do grupo + ajustes
- [ ] Roda o site com a galera num acerto real
- [ ] Coleta bugs / pedidos
- [ ] Spec curto pra cada bug → triagem → executa
- **Entrega:** v0.1.1 + lista priorizada pra v0.2

### Continuação (v0.2 → quando der vontade)

Cada feature da seção 4 vira uma sessão. Sem deadline. Persistência (Supabase + auth + comments + status pago) provavelmente é mais 4–5 sessões.

---

## 8.5 · Como dirigir o agente (workflow padrão)

### Antes de TODA feature

**Plan mode é não-negociável.** Atalho: `Shift+Tab` duas vezes. O agente analisa, lista arquivos que vai mexer, descreve a abordagem — sem tocar em nada. Você revisa. Aprova ou ajusta. Só então sai do plan mode.

Sem plan mode, ele faz coisa demais e você só descobre depois.

### Hábitos que separam quem ship de quem sofre

1. **PRs pequenos.** Cada session = 1 PR. Diff revisável (< 500 linhas idealmente). Se passou disso, divide.
2. **`/clear` agressivo.** Entre features sem relação, limpa o contexto. O custo de re-contextualizar é menor que o custo de contexto poluído.
3. **CLAUDE.md curto.** Aponte para docs por tarefa em vez de empilhar tudo. Cada token no CLAUDE.md compete por atenção.
4. **Verificação obrigatória.** Toda feature termina com você rodando local + abrindo no browser. Se não testou, não terminou.
5. **Commit messages que o agente escreve, você revisa.** Slash command `/ship` resolve.

### Anti-patterns pra evitar

- ❌ **Vibe coding** — "vai lá e faz" sem spec → agente vai longe demais errado
- ❌ **Slash commands demais** — se você tem >5, virou complexidade pelo bem da complexidade
- ❌ **Agent teams pra projeto pequeno** — esse projeto NÃO precisa de múltiplos agentes paralelos. Single agent + você. Simples.
- ❌ **Aceitar diff grande sem ler** — você perde a vantagem didática do método inteiro
- ❌ **Não usar plan mode em mudanças grandes** — vai consertar depois

---

## 9 · Métricas de sucesso

Por fase, o que significa "deu certo".

### MVP (após sessão 5)

- ✅ Pelo menos 3 amigos usaram pra um acerto real
- ✅ Tempo do upload ao veredito: < 5min
- ✅ Erro de extração: < 15% das transações precisam edição manual
- ✅ Pelo menos um amigo usou sem você do lado

### v0.2 (algumas sessões depois)

- ✅ 10+ acertos criados por pessoas que não são você
- ✅ Pelo menos 30% dos PIX de cada acerto são marcados "pago"
- ✅ Pelo menos 1 pessoa volta pra um 2º acerto

### v1.0 (post-launch, 3 meses)

- ✅ 100+ acertos/mês
- ✅ Custo de Claude < 30% do que você gastaria de assinatura mensal
- ✅ Pelo menos 1 menção orgânica em rede social que não veio de você

Se nada disso bater, **não é fracasso** — é input. Fun + skill build foi entregue.

---

## 10 · Riscos & mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Custo da Claude API explode | Médio | Cache agressivo de extrações, hash do arquivo. Usar Haiku 4.5 onde der. |
| PDFs de bancos exóticos não funcionam | Alto | Fallback pra "input manual". Métrica de bancos suportados. |
| Privacidade vira issue | Baixo-médio | Política clara desde o dia 1. Não persistir raw. Open source o parser. |
| Você se cansa antes da v0.2 | Médio | Sessions de 3h são leves. Se cair, ship o MVP e descansa. Não tem deadline real. |
| BCB regula generators de PIX | Baixo | Você só gera QR estático, não processa. Tá no padrão público. |
| Splitwise lança mesma feature em PT-BR | Médio | Pelo timing atual, eles tão focados em Europa. Mas sim — vai chegar. Daí tu tem o jeito brasileiro de ouro. |
| **Aceitar diff sem revisar** (vibe coding) | **Alto** | Disciplina: toda session termina com `git diff` lido. Se passou de 500 linhas, dividiu errado. |
| **CLAUDE.md vira lixo gigante** | Médio | Reler e podar a cada 5 sessions. Mover detalhes pra docs por tarefa. |
| **Agente codifica feature errada** | Médio | Plan mode obrigatório antes de qualquer mudança não-trivial. |
| **Custo do Claude Code disparado** | Baixo-médio | `/clear` agressivo. Sessions focadas. Plano Team já cobre uso normal. |

---

## 11 · Open questions pra próxima sessão

1. **Nome + domínio.** Quando partir pro código, vale 1h fechando isso.
2. **Branding visual.** Mantém vibe editorial ou vira algo mais playful pra mobile?
3. **Banco prioritário.** Qual extrato você usa mais? Esse é o "Banco 0" que tem que funcionar perfeito.
4. **Hospedagem do banco.** Supabase tem region em São Paulo (latência ↓) mas custa mais. US East funciona ok? *Opinião:* US East por enquanto.
5. **Open source ou não?** Repo público desde o início pode atrair contribuidores e vira portfólio. Privado dá mais flexibilidade. *Opinião:* público desde já.

---

## 12 · Próximo passo concreto

Antes da Sessão 1, fecha em uma sessão de **2h** (Sessão 0):

- [ ] Nome + domínio comprado
- [ ] Logo simples (pode ser só wordmark em Fraunces)
- [ ] Repo criado (público) no GitHub
- [ ] **Claude Code instalado** (`npm install -g @anthropic-ai/claude-code`) e logado
- [ ] **`CLAUDE.md` na raiz** (template fornecido nesse pacote)
- [ ] **`.claude/commands/ship.md`** (slash command de commit padrão)
- [ ] Cloudflare Pages + domínio configurados
- [ ] README curto (1 parágrafo do que é)
- [ ] Primeiro `claude` no terminal: *"Lê o PRD.md e o CLAUDE.md, faz uma pergunta sobre o que ainda não está claro antes de começarmos."*

Se você fizer só isso, o resto vem.

---

*Doc vivo. Edita à vontade. Quando atualizar features, atualize o CLAUDE.md também.*
