import type { APIRoute } from 'astro'
import { getSessionToken, validateSession } from '../../../../../lib/session'
import { getSupabase } from '../../../../../lib/supabase'
import type { Transaction } from '../../../../../lib/types'

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

export const PUT: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const txId = params.id!
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Configuração ausente' }), { status: 500, headers: HEADERS })
  }

  const token = getSessionToken(request, slug)
  if (!token) return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: HEADERS })
  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (!session) return new Response(JSON.stringify({ error: 'Sessão expirada' }), { status: 401, headers: HEADERS })

  let body: { description?: string; amount_cents?: number; date?: string; payer_id?: string | null; bucket_id?: string | null }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido' }), { status: 400, headers: HEADERS })
  }

  const db = getSupabase(supabaseUrl, supabaseKey)

  // Build only the fields that were provided
  const updates: Record<string, unknown> = {}
  if (body.description !== undefined) updates.description = body.description.trim()
  if (body.amount_cents !== undefined) updates.amount_cents = body.amount_cents
  if (body.date !== undefined) updates.date = body.date
  if ('payer_id' in body) updates.payer_id = body.payer_id
  if ('bucket_id' in body) updates.bucket_id = body.bucket_id

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhum campo para atualizar' }), { status: 400, headers: HEADERS })
  }

  const { data, error } = await db
    .from('transactions')
    .update(updates)
    .eq('id', txId)
    .eq('trip_id', session.tripId)
    .select()
    .single()

  if (error || !data) {
    return new Response(JSON.stringify({ error: 'Transação não encontrada ou erro ao atualizar' }), { status: 404, headers: HEADERS })
  }

  return new Response(JSON.stringify({ transaction: rowToTransaction(data as Record<string, unknown>) }), { headers: HEADERS })
}

export const DELETE: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const txId = params.id!
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
  const { error } = await db
    .from('transactions')
    .delete()
    .eq('id', txId)
    .eq('trip_id', session.tripId)

  if (error) return new Response(JSON.stringify({ error: 'Erro ao deletar transação' }), { status: 500, headers: HEADERS })

  return new Response(JSON.stringify({ ok: true }), { headers: HEADERS })
}
