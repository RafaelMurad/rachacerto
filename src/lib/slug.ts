// URL-safe chars without ambiguous lookalikes (0/O, 1/l/I); 32 chars = zero modulo bias
const URL_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789r'

export function generateSlug(): string {
  const array = new Uint8Array(8)
  crypto.getRandomValues(array)
  return Array.from(array, b => URL_CHARS[b % URL_CHARS.length]).join('')
}

export function generateToken(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('')
}
