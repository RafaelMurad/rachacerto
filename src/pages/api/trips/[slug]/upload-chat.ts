import type { APIRoute } from 'astro'
import { getSessionToken, validateSession } from '../../../../lib/session'
import { getSupabase } from '../../../../lib/supabase'
import { extractTransactionsFromChat } from '../../../../lib/claude'
import type { Person } from '../../../../lib/types'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

export const POST: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const apiKey = import.meta.env.GEMINI_API_KEY
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  // Validate session
  const token = getSessionToken(request, slug)
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Não autenticado' }),
      { status: 401, headers: HEADERS }
    )
  }
  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Sessão expirada — entre novamente' }),
      { status: 401, headers: HEADERS }
    )
  }

  let text: string
  try {
    const body = await request.json() as { text?: string }
    text = body.text?.trim() ?? ''
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload inválido' }),
      { status: 400, headers: HEADERS }
    )
  }

  if (!text) {
    return new Response(
      JSON.stringify({ error: 'Texto do chat não fornecido' }),
      { status: 400, headers: HEADERS }
    )
  }

  // Fetch people for this trip (needed for payer inference)
  const db = getSupabase(supabaseUrl, supabaseKey)
  const { data: peopleRows, error: peopleErr } = await db
    .from('people')
    .select('id, name, color')
    .eq('trip_id', session.tripId)

  if (peopleErr) {
    return new Response(
      JSON.stringify({ error: 'Erro ao buscar participantes' }),
      { status: 500, headers: HEADERS }
    )
  }

  const people: Person[] = (peopleRows ?? []).map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
  }))

  let extracted
  try {
    extracted = await extractTransactionsFromChat(text, people, apiKey)
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Erro na extração do chat' }),
      { status: 500, headers: HEADERS }
    )
  }

  if (extracted.length === 0) {
    return new Response(
      JSON.stringify({ transactions: [], warning: 'Nenhuma transação encontrada no chat' }),
      { headers: HEADERS }
    )
  }

  // Save to DB — payer_id may be null for unresolved payers
  const dbRows = extracted.map(t => ({
    id: t.id,
    trip_id: session.tripId,
    payer_id: t.payerId,
    source: 'chat',
    date: t.date,
    description: t.description,
    amount_cents: t.amount_cents,
    raw: t.raw,
  }))

  const { error: insertErr } = await db.from('transactions').insert(dbRows)
  if (insertErr) {
    return new Response(
      JSON.stringify({ error: 'Erro ao salvar transações' }),
      { status: 500, headers: HEADERS }
    )
  }

  const transactions = dbRows.map(r => ({
    id: r.id,
    date: r.date,
    description: r.description,
    amount_cents: r.amount_cents,
    payerId: r.payer_id,
    source: r.source as 'chat',
    raw: r.raw,
  }))

  return new Response(
    JSON.stringify({ transactions }),
    { headers: HEADERS }
  )
}
