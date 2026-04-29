import type { APIRoute } from 'astro'
import { ulid } from 'ulid'
import { getSessionToken, validateSession } from '../../../../lib/session'
import { getSupabase } from '../../../../lib/supabase'
import type { Transaction } from '../../../../lib/types'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

function rowToTransaction(r: Record<string, unknown>): Transaction {
  return {
    id: r.id as string,
    date: r.date as string,
    description: r.description as string,
    amount_cents: r.amount_cents as number,
    payerId: r.payer_id as string | null,
    source: r.source as 'chat' | 'statement' | 'manual',
    raw: r.raw as string | null,
    bucketId: r.bucket_id as string | null,
  }
}

export const GET: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Configuração ausente' }), { status: 500, headers: HEADERS })
  }

  const token = getSessionToken(request, slug)
  if (!token) return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: HEADERS })
  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (!session) return new Response(JSON.stringify({ error: 'Sessão expirada' }), { status: 401, headers: HEADERS })

  const db = getSupabase(supabaseUrl, supabaseKey)
  const { data, error } = await db
    .from('transactions')
    .select('*')
    .eq('trip_id', session.tripId)
    .order('date', { ascending: false })

  if (error) return new Response(JSON.stringify({ error: 'Erro ao buscar transações' }), { status: 500, headers: HEADERS })

  return new Response(
    JSON.stringify({ transactions: (data ?? []).map(rowToTransaction) }),
    { headers: HEADERS }
  )
}

export const POST: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Configuração ausente' }), { status: 500, headers: HEADERS })
  }

  const token = getSessionToken(request, slug)
  if (!token) return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: HEADERS })
  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (!session) return new Response(JSON.stringify({ error: 'Sessão expirada' }), { status: 401, headers: HEADERS })

  let body: { description?: string; amount_cents?: number; date?: string; payer_id?: string; bucket_id?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido' }), { status: 400, headers: HEADERS })
  }

  if (!body.description?.trim() || !body.amount_cents || !body.date) {
    return new Response(JSON.stringify({ error: 'description, amount_cents e date são obrigatórios' }), { status: 400, headers: HEADERS })
  }

  const db = getSupabase(supabaseUrl, supabaseKey)
  const newRow = {
    id: ulid(),
    trip_id: session.tripId,
    payer_id: body.payer_id ?? null,
    source: 'manual' as const,
    date: body.date,
    description: body.description.trim(),
    amount_cents: body.amount_cents,
    raw: null,
    bucket_id: body.bucket_id ?? null,
  }

  const { error } = await db.from('transactions').insert(newRow)
  if (error) return new Response(JSON.stringify({ error: 'Erro ao criar transação' }), { status: 500, headers: HEADERS })

  return new Response(
    JSON.stringify({ transaction: rowToTransaction(newRow) }),
    { status: 201, headers: HEADERS }
  )
}
