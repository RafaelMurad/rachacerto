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
