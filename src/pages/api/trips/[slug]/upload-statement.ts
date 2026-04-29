import type { APIRoute } from 'astro'
import { ulid } from 'ulid'
import { getSessionToken, validateSession } from '../../../../lib/session'
import { getSupabase } from '../../../../lib/supabase'
import {
  extractTransactionsFromStatementText,
  extractTransactionsFromStatementImage,
} from '../../../../lib/claude'
import { extractText } from 'unpdf'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export const POST: APIRoute = async ({ request, params }) => {
  const slug = params.slug!
  const apiKey = import.meta.env.GEMINI_API_KEY
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_KEY

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração ausente' }),
      { status: 500, headers: HEADERS }
    )
  }

  // Validate session
  const token = getSessionToken(request, slug)
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Não autenticado' }),
      { status: 401, headers: HEADERS }
    )
  }
  const session = await validateSession(token, supabaseUrl, supabaseKey)
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Sessão expirada — entre novamente' }),
      { status: 401, headers: HEADERS }
    )
  }

  // Parse multipart form
  let file: File
  try {
    const formData = await request.formData()
    const raw = formData.get('file')
    if (!(raw instanceof File)) throw new Error('Campo "file" ausente')
    file = raw
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Payload inválido' }),
      { status: 400, headers: HEADERS }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return new Response(
      JSON.stringify({ error: 'Arquivo muito grande (máximo 10 MB)' }),
      { status: 400, headers: HEADERS }
    )
  }

  const mimeType = file.type

  // Check MIME type first — before reading the full buffer into memory
  if (mimeType !== 'application/pdf' && mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/webp') {
    return new Response(
      JSON.stringify({ error: 'Tipo de arquivo não suportado — use PDF, PNG ou JPG' }),
      { status: 400, headers: HEADERS }
    )
  }

  const arrayBuffer = await file.arrayBuffer()

  // Extract transactions based on file type
  let rawTransactions: Awaited<ReturnType<typeof extractTransactionsFromStatementText>>

  if (mimeType === 'application/pdf') {
    let text: string
    try {
      const { text: extracted } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true })
      text = extracted
    } catch {
      return new Response(
        JSON.stringify({ error: 'PDF protegido por senha ou inválido — remova a senha e tente novamente' }),
        { status: 400, headers: HEADERS }
      )
    }
    try {
      rawTransactions = await extractTransactionsFromStatementText(text, apiKey)
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : 'Erro na extração do extrato' }),
        { status: 500, headers: HEADERS }
      )
    }
  } else {
    // Encode image to base64 in chunks to avoid stack overflow on large files
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    const chunkSize = 1024
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const base64 = btoa(binary)
    try {
      rawTransactions = await extractTransactionsFromStatementImage(
        base64,
        mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
        apiKey
      )
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : 'Erro na extração do extrato' }),
        { status: 500, headers: HEADERS }
      )
    }
  }

  if (rawTransactions.length === 0) {
    return new Response(
      JSON.stringify({ transactions: [], warning: 'Nenhuma transação encontrada neste arquivo' }),
      { headers: HEADERS }
    )
  }

  // Save to DB with payer = session person
  const db = getSupabase(supabaseUrl, supabaseKey)
  const dbRows = rawTransactions.map(t => ({
    id: ulid(),
    trip_id: session.tripId,
    payer_id: session.personId,
    source: 'statement',
    date: t.date,
    description: t.description,
    amount_cents: t.amount_cents,
    raw: t.raw,
  }))

  const { error: insertErr } = await db.from('transactions').insert(dbRows)
  if (insertErr) {
    return new Response(
      JSON.stringify({ error: 'Erro ao salvar transações' }),
      { status: 500, headers: HEADERS }
    )
  }

  const transactions = dbRows.map(r => ({
    id: r.id,
    date: r.date,
    description: r.description,
    amount_cents: r.amount_cents,
    payerId: r.payer_id,
    source: r.source as 'statement',
    raw: r.raw,
  }))

  return new Response(
    JSON.stringify({ transactions }),
    { headers: HEADERS }
  )
}
