import { ulid } from 'ulid'
import type { Person, Transaction } from './types'

const MODEL = 'gemini-2.5-flash-lite'
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

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
  raw?: string
}

type RawStatementTransaction = {
  date: string
  description: string
  amount_cents: number
  raw?: string
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
  }>
  error?: { message: string }
}

async function callGemini(
  apiKey: string,
  systemPrompt: string | null,
  parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }>
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  }

  if (systemPrompt) {
    body.system_instruction = { parts: [{ text: systemPrompt }] }
  }

  const res = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json() as GeminiResponse

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Gemini API error ${res.status}`)
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Resposta inesperada da IA')
  return text
}

export async function extractTransactionsFromChat(
  text: string,
  people: Person[],
  apiKey: string
): Promise<Transaction[]> {
  const raw = await callGemini(
    apiKey,
    CHAT_SYSTEM_PROMPT,
    [{
      text: `Pessoas no acerto: ${JSON.stringify(people.map(p => ({ id: p.id, name: p.name })))}

Chat do WhatsApp:
${text}`,
    }]
  )

  let parsed: RawChatTransaction[]
  try {
    parsed = JSON.parse(raw) as RawChatTransaction[]
  } catch {
    throw new Error('IA retornou resposta inválida — tente novamente')
  }

  return parsed.map(t => ({
    ...t,
    id: ulid(),
    source: 'chat' as const,
    payerId: t.payerId || null,
    raw: t.raw ?? null,
    bucketId: null,
  }))
}

export async function extractTransactionsFromStatementText(
  text: string,
  apiKey: string
): Promise<Omit<Transaction, 'id' | 'payerId' | 'source'>[]> {
  const raw = await callGemini(apiKey, STATEMENT_TEXT_PROMPT, [{ text }])

  let parsed: RawStatementTransaction[]
  try {
    parsed = JSON.parse(raw) as RawStatementTransaction[]
  } catch {
    throw new Error('IA retornou resposta inválida — tente novamente')
  }

  return parsed.map(t => ({ ...t, raw: t.raw ?? null, bucketId: null }))
}

export async function extractTransactionsFromStatementImage(
  base64: string,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  apiKey: string
): Promise<Omit<Transaction, 'id' | 'payerId' | 'source'>[]> {
  const raw = await callGemini(
    apiKey,
    null, // image instructions go in user turn alongside the image
    [
      { inline_data: { mime_type: mimeType, data: base64 } },
      { text: STATEMENT_IMAGE_PROMPT },
    ]
  )

  let parsed: RawStatementTransaction[]
  try {
    parsed = JSON.parse(raw) as RawStatementTransaction[]
  } catch {
    throw new Error('IA retornou resposta inválida — tente novamente')
  }

  return parsed.map(t => ({ ...t, raw: t.raw ?? null, bucketId: null }))
}
