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
