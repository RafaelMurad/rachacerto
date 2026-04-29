import type { APIRoute } from 'astro'
import { ulid } from 'ulid'
import { getSupabase } from '../../lib/supabase'
import { generateSlug, generateToken } from '../../lib/slug'
import type { Person } from '../../lib/types'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

export const POST: APIRoute = async ({ request }) => {
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  let name: string
  let people: Person[]
  try {
    const body = await request.json() as { name?: string; people?: Person[] }
    name = body.name?.trim() ?? ''
    people = body.people ?? []
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload inválido' }),
      { status: 400, headers: HEADERS }
    )
  }

  if (!name) {
    return new Response(
      JSON.stringify({ error: 'Nome do acerto obrigatório' }),
      { status: 400, headers: HEADERS }
    )
  }
  if (people.length < 2) {
    return new Response(
      JSON.stringify({ error: 'Mínimo 2 pessoas' }),
      { status: 400, headers: HEADERS }
    )
  }

  const db = getSupabase(supabaseUrl, supabaseKey)

  // Generate a unique 8-char slug (collision extremely unlikely but check anyway)
  let slug = generateSlug()
  for (let i = 0; i < 4; i++) {
    const { data } = await db.from('trips').select('id').eq('slug', slug).maybeSingle()
    if (!data) break
    slug = generateSlug()
  }

  const tripId = ulid()

  const { error: tripErr } = await db
    .from('trips')
    .insert({ id: tripId, slug, name })

  if (tripErr) {
    return new Response(
      JSON.stringify({ error: 'Erro ao criar acerto' }),
      { status: 500, headers: HEADERS }
    )
  }

  const peopleRows = people.map(p => ({
    id: p.id,
    trip_id: tripId,
    name: p.name,
    color: p.color,
    invite_token: generateToken(),
    pin_hash: null,
  }))

  const { error: peopleErr } = await db.from('people').insert(peopleRows)

  if (peopleErr) {
    // Roll back the trip
    await db.from('trips').delete().eq('id', tripId)
    return new Response(
      JSON.stringify({ error: 'Erro ao salvar pessoas' }),
      { status: 500, headers: HEADERS }
    )
  }

  const { data: savedPeople } = await db
    .from('people')
    .select('id, name, color, invite_token')
    .eq('trip_id', tripId)
    .order('created_at')

  return new Response(
    JSON.stringify({ slug, people: savedPeople }),
    { headers: HEADERS }
  )
}
