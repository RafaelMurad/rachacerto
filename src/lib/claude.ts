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
