import type { APIRoute } from 'astro'
import { getSupabase } from '../../../../lib/supabase'
import { getSessionToken, validateSession } from '../../../../lib/session'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

export const PUT: APIRoute = async ({ request, params }) => {
  const personId = params.id!
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Configuração ausente' }), { status: 500, headers: HEADERS })
  }

  let pixKey: string
  let slug: string
  try {
    const body = await request.json() as { pixKey?: string; slug?: string }
    pixKey = body.pixKey?.trim() ?? ''
    slug = body.slug ?? ''

    // Validate session belongs to this person
    const token = getSessionToken(request, slug)
    if (!token) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: HEADERS })
    }
    const session = await validateSession(token, supabaseUrl, supabaseKey)
    if (!session || session.personId !== personId) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 403, headers: HEADERS })
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido' }), { status: 400, headers: HEADERS })
  }

  if (!pixKey) {
    return new Response(JSON.stringify({ ok: true }), { headers: HEADERS }) // no-op if empty
  }

  const db = getSupabase(supabaseUrl, supabaseKey)
  const { error } = await db.from('people').update({ pix_key: pixKey }).eq('id', personId)

  if (error) {
    return new Response(JSON.stringify({ error: 'Erro ao salvar chave PIX' }), { status: 500, headers: HEADERS })
  }

  return new Response(JSON.stringify({ ok: true }), { headers: HEADERS })
}
