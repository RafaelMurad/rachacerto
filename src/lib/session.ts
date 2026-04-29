import { getSupabase } from './supabase'

export type SessionData = {
  personId: string
  personName: string
  personColor: string
  tripId: string
}

export function getSessionCookieName(slug: string): string {
  return `rca_session_${slug}`
}

export function getSessionToken(request: Request, slug: string): string | null {
  const cookieHeader = request.headers.get('cookie') ?? ''
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey.trim() === getSessionCookieName(slug)) return rest.join('=')
  }
  return null
}

export function makeSessionCookie(slug: string, token: string): string {
  const maxAge = 30 * 24 * 60 * 60 // 30 days in seconds
  const secure = import.meta.env.PROD ? 'Secure; ' : ''
  return `${getSessionCookieName(slug)}=${token}; HttpOnly; ${secure}SameSite=Strict; Max-Age=${maxAge}; Path=/`
}

export async function validateSession(
  token: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<SessionData | null> {
  const db = getSupabase(supabaseUrl, supabaseKey)

  const { data: session } = await db
    .from('sessions')
    .select('person_id, expires_at')
    .eq('token', token)
    .single()

  if (!session) return null
  if (new Date(session.expires_at) < new Date()) return null

  const { data: person } = await db
    .from('people')
    .select('id, name, color, trip_id')
    .eq('id', session.person_id)
    .single()

  if (!person) return null

  return {
    personId: person.id,
    personName: person.name,
    personColor: person.color,
    tripId: person.trip_id,
  }
}
