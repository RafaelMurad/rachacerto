import type { APIRoute } from 'astro'
import { getSessionToken, validateSession } from '../../../../../lib/session'
import { getSupabase } from '../../../../../lib/supabase'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

export const PUT: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const bucketId = params.id!
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Configuração ausente' }), { status: 500, headers: HEADERS })
  }

  const token = getSessionToken(request, slug)
  if (!token) return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: HEADERS })
  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (!session) return new Response(JSON.stringify({ error: 'Sessão expirada' }), { status: 401, headers: HEADERS })

  let body: { name?: string; memberIds?: string[] }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido' }), { status: 400, headers: HEADERS })
  }

  const db = getSupabase(supabaseUrl, supabaseKey)

  const { data: existing } = await db
    .from('buckets')
    .select('is_default')
    .eq('id', bucketId)
    .eq('trip_id', session.tripId)
    .single()

  if (!existing) return new Response(JSON.stringify({ error: 'Bucket não encontrado' }), { status: 404, headers: HEADERS })

  if (body.name !== undefined && !existing.is_default) {
    const { error } = await db.from('buckets').update({ name: body.name.trim() }).eq('id', bucketId)
    if (error) return new Response(JSON.stringify({ error: 'Erro ao atualizar nome' }), { status: 500, headers: HEADERS })
  }

  if (body.memberIds !== undefined) {
    await db.from('bucket_members').delete().eq('bucket_id', bucketId)
    if (body.memberIds.length > 0) {
      const rows = body.memberIds.map(pid => ({ bucket_id: bucketId, person_id: pid }))
      const { error } = await db.from('bucket_members').insert(rows)
      if (error) return new Response(JSON.stringify({ error: 'Erro ao atualizar membros' }), { status: 500, headers: HEADERS })
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: HEADERS })
}

export const DELETE: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const bucketId = params.id!
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
  const { data: existing } = await db
    .from('buckets')
    .select('is_default')
    .eq('id', bucketId)
    .eq('trip_id', session.tripId)
    .single()

  if (!existing) return new Response(JSON.stringify({ error: 'Bucket não encontrado' }), { status: 404, headers: HEADERS })
  if (existing.is_default) return new Response(JSON.stringify({ error: 'O bucket Todos não pode ser deletado' }), { status: 403, headers: HEADERS })

  const { error } = await db.from('buckets').delete().eq('id', bucketId)
  if (error) return new Response(JSON.stringify({ error: 'Erro ao deletar bucket' }), { status: 500, headers: HEADERS })

  return new Response(JSON.stringify({ ok: true }), { headers: HEADERS })
}
