import type { APIRoute } from 'astro'
import { getSessionToken, validateSession } from '../../../../lib/session'
import { getSupabase } from '../../../../lib/supabase'
import { calcBalances, minimizeTransfers } from '../../../../lib/settle'
import type { Transaction, BucketWithMembers, Person } from '../../../../lib/types'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

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
  const tripId = session.tripId

  const { data: bucketRowsForIds } = await db.from('buckets').select('id').eq('trip_id', tripId)
  const bucketIds = (bucketRowsForIds ?? []).map(b => b.id as string)

  const [
    { data: peopleRows },
    { data: txRows },
    { data: bucketRows },
    { data: memberRows },
  ] = await Promise.all([
    db.from('people').select('id, name, color, pix_key').eq('trip_id', tripId),
    db.from('transactions').select('id, date, description, amount_cents, payer_id, source, raw, bucket_id').eq('trip_id', tripId),
    db.from('buckets').select('id, trip_id, name, is_default').eq('trip_id', tripId),
    db.from('bucket_members').select('bucket_id, person_id').in('bucket_id', bucketIds.length ? bucketIds : ['']),
  ])

  const people: Person[] = (peopleRows ?? []).map(p => ({
    id: p.id as string,
    name: p.name as string,
    color: p.color as string,
    pixKey: (p.pix_key as string | null) ?? undefined,
  }))

  const transactions: Transaction[] = (txRows ?? []).map(t => ({
    id: t.id as string,
    date: t.date as string,
    description: t.description as string,
    amount_cents: t.amount_cents as number,
    payerId: t.payer_id as string | null,
    source: t.source as 'chat' | 'statement' | 'manual',
    raw: t.raw as string | null,
    bucketId: t.bucket_id as string | null,
  }))

  const buckets: BucketWithMembers[] = (bucketRows ?? []).map(b => {
    const memberIds = (memberRows ?? [])
      .filter(m => (m as { bucket_id: string }).bucket_id === b.id)
      .map(m => (m as { person_id: string }).person_id)
    const myTxs = transactions.filter(t =>
      (b.is_default as boolean) ? (t.bucketId === b.id || t.bucketId === null) : t.bucketId === b.id
    )
    return {
      id: b.id as string,
      tripId: b.trip_id as string,
      name: b.name as string,
      isDefault: b.is_default as boolean,
      memberIds,
      transactionCount: myTxs.length,
      totalCents: myTxs.reduce((s, t) => s + t.amount_cents, 0),
    }
  })

  const peopleMap = new Map(people.map(p => [p.id, p]))
  const balances = calcBalances(transactions, buckets, people)
  const settlements = minimizeTransfers(balances, peopleMap)

  return new Response(JSON.stringify({ balances, settlements }), { headers: HEADERS })
}
