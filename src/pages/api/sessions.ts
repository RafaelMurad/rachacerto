import type { APIRoute } from 'astro'
import { ulid } from 'ulid'
import { getSupabase } from '../../lib/supabase'
import { generateToken, hashPin } from '../../lib/slug'
import { makeSessionCookie } from '../../lib/session'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

type PersonRow = {
  id: string
  name: string
  color: string
  trip_id: string
  pin_hash: string | null
  invite_token: string
}

export const POST: APIRoute = async ({ request }) => {
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  let body: { slug?: string; personId?: string; pin?: string; inviteToken?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload inválido' }),
      { status: 400, headers: HEADERS }
    )
  }

  const db = getSupabase(supabaseUrl, supabaseKey)
  let person: PersonRow | null = null
  let slug = ''

  if (body.inviteToken) {
    // Invite link path: find person by invite token, then get trip slug
    const { data } = await db
      .from('people')
      .select('id, name, color, trip_id, pin_hash, invite_token')
      .eq('invite_token', body.inviteToken)
      .single()

    if (!data) {
      return new Response(
        JSON.stringify({ error: 'Link de convite inválido' }),
        { status: 404, headers: HEADERS }
      )
    }
    person = data as PersonRow

    const { data: trip } = await db
      .from('trips')
      .select('slug')
      .eq('id', person.trip_id)
      .single()

    if (!trip) {
      return new Response(
        JSON.stringify({ error: 'Acerto não encontrado' }),
        { status: 404, headers: HEADERS }
      )
    }
    slug = trip.slug
  } else if (body.personId && body.slug) {
    // Name picker path: find person by id, verify they belong to this trip
    slug = body.slug

    const { data: trip } = await db
      .from('trips')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!trip) {
      return new Response(
        JSON.stringify({ error: 'Acerto não encontrado' }),
        { status: 404, headers: HEADERS }
      )
    }

    const { data } = await db
      .from('people')
      .select('id, name, color, trip_id, pin_hash, invite_token')
      .eq('id', body.personId)
      .eq('trip_id', trip.id)
      .single()

    if (!data) {
      return new Response(
        JSON.stringify({ error: 'Pessoa não encontrada neste acerto' }),
        { status: 404, headers: HEADERS }
      )
    }
    person = data as PersonRow
  } else {
    return new Response(
      JSON.stringify({ error: 'Forneça inviteToken ou personId + slug' }),
      { status: 400, headers: HEADERS }
    )
  }

  // PIN validation — only required if person has a pin_hash
  if (person.pin_hash) {
    if (!body.pin) {
      return new Response(
        JSON.stringify({ error: 'PIN obrigatório', requiresPin: true }),
        { status: 401, headers: HEADERS }
      )
    }
    const supplied = await hashPin(body.pin)
    if (supplied !== person.pin_hash) {
      return new Response(
        JSON.stringify({ error: 'PIN incorreto' }),
        { status: 401, headers: HEADERS }
      )
    }
  }

  const token = generateToken()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await db.from('sessions').insert({
    id: ulid(),
    person_id: person.id,
    token,
    expires_at: expiresAt,
  })

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Erro ao criar sessão' }),
      { status: 500, headers: HEADERS }
    )
  }

  return new Response(
    JSON.stringify({
      personId: person.id,
      personName: person.name,
      personColor: person.color,
    }),
    {
      headers: {
        ...HEADERS,
        'Set-Cookie': makeSessionCookie(slug!, token),
      },
    }
  )
}
