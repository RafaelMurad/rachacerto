import type { APIRoute } from 'astro'
import { getSessionToken, validateSession } from '../../../../../lib/session'
import { generatePixBRCode, generateQRDataURL } from '../../../../../lib/pix'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const

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

  let body: { pixKey?: string; amountCents?: number; merchantName?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido' }), { status: 400, headers: HEADERS })
  }

  if (!body.pixKey || !body.amountCents || !body.merchantName) {
    return new Response(JSON.stringify({ error: 'pixKey, amountCents e merchantName são obrigatórios' }), { status: 400, headers: HEADERS })
  }

  try {
    const brCode = generatePixBRCode(body.pixKey, body.amountCents, body.merchantName)
    const qrUrl = await generateQRDataURL(brCode)
    return new Response(JSON.stringify({ brCode, qrUrl }), { headers: HEADERS })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Erro ao gerar PIX' }),
      { status: 500, headers: HEADERS }
    )
  }
}
