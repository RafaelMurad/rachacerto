import type { APIRoute } from 'astro'
import { ulid } from 'ulid'
import { getSessionToken, validateSession } from '../../../../lib/session'
import { getSupabase } from '../../../../lib/supabase'
import type { BucketWithMembers } from '../../../../lib/types'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

type BucketRow = { id: string; trip_id: string; name: string; is_default: boolean }
type MemberRow = { bucket_id: string; person_id: string }
type TxRow = { bucket_id: string | null; amount_cents: number }

function buildBuckets(
  bucketRows: BucketRow[],
  memberRows: MemberRow[],
  txRows: TxRow[],
): BucketWithMembers[] {
  return bucketRows.map(b => {
    const memberIds = memberRows.filter(m => m.bucket_id === b.id).map(m => m.person_id)
    const myTxs = txRows.filter(t =>
      b.is_default ? (t.bucket_id === b.id || t.bucket_id === null) : t.bucket_id === b.id
    )
    return {
      id: b.id,
      tripId: b.trip_id,
      name: b.name,
      isDefault: b.is_default,
      memberIds,
      transactionCount: myTxs.length,
      totalCents: myTxs.reduce((s, t) => s + t.amount_cents, 0),
    }
  })
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
  const tripId = session.tripId

  const { data: bucketRows } = await db
    .from('buckets')
    .select('id, trip_id, name, is_default')
    .eq('trip_id', tripId)
    .order('created_at')

  const bucketIds = (bucketRows ?? []).map((b: BucketRow) => b.id)

  const [{ data: memberRows }, { data: txRows }] = await Promise.all([
    db.from('bucket_members').select('bucket_id, person_id').in('bucket_id', bucketIds.length ? bucketIds : ['']),
    db.from('transactions').select('bucket_id, amount_cents').eq('trip_id', tripId),
  ])

  const buckets = buildBuckets(
    (bucketRows ?? []) as BucketRow[],
    (memberRows ?? []) as MemberRow[],
    (txRows ?? []) as TxRow[],
  )

  return new Response(JSON.stringify({ buckets }), { headers: HEADERS })
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

  let body: { name?: string; memberIds?: string[] }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido' }), { status: 400, headers: HEADERS })
  }

  if (!body.name?.trim()) {
    return new Response(JSON.stringify({ error: 'name é obrigatório' }), { status: 400, headers: HEADERS })
  }
  if (!body.memberIds || body.memberIds.length === 0) {
    return new Response(JSON.stringify({ error: 'memberIds não pode ser vazio' }), { status: 400, headers: HEADERS })
  }

  const db = getSupabase(supabaseUrl, supabaseKey)
  const bucketId = ulid()

  const { error: bucketErr } = await db.from('buckets').insert({
    id: bucketId,
    trip_id: session.tripId,
    name: body.name.trim(),
    is_default: false,
  })
  if (bucketErr) return new Response(JSON.stringify({ error: 'Erro ao criar bucket' }), { status: 500, headers: HEADERS })

  const memberRows = body.memberIds.map(pid => ({ bucket_id: bucketId, person_id: pid }))
  const { error: memberErr } = await db.from('bucket_members').insert(memberRows)
  if (memberErr) return new Response(JSON.stringify({ error: 'Erro ao adicionar membros' }), { status: 500, headers: HEADERS })

  const bucket: BucketWithMembers = {
    id: bucketId,
    tripId: session.tripId,
    name: body.name.trim(),
    isDefault: false,
    memberIds: body.memberIds,
    transactionCount: 0,
    totalCents: 0,
  }

  return new Response(JSON.stringify({ bucket }), { status: 201, headers: HEADERS })
}
