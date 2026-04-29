import type { APIRoute } from 'astro'
import { getSessionToken, validateSession } from '../../../lib/session'

const HEADERS = { 'Content-Type': 'application/json' } as const

export const GET: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  const token = getSessionToken(request, slug)
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'not_authenticated' }),
      { status: 401, headers: HEADERS }
    )
  }

  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'not_authenticated' }),
      { status: 401, headers: HEADERS }
    )
  }

  return new Response(
    JSON.stringify({
      personId: session.personId,
      personName: session.personName,
      personColor: session.personColor,
    }),
    { headers: HEADERS }
  )
}
