import { createStaticPix, hasError } from 'pix-utils'
import QRCode from 'qrcode'

/**
 * Generates a PIX BR Code string (copy-paste or QR payload).
 * pixKey: CPF, phone, email, or random key
 * amountCents: integer in centavos (R$10,50 = 1050)
 * merchantName: shown on the PIX receipt (max 25 chars)
 */
export function generatePixBRCode(
  pixKey: string,
  amountCents: number,
  merchantName: string
): string {
  const pix = createStaticPix({
    merchantName: merchantName.slice(0, 25),
    merchantCity: 'BRASIL',
    pixKey,
    transactionAmount: amountCents / 100,
  })

  if (hasError(pix)) {
    throw new Error(`PIX BR Code error: ${pix.error}`)
  }

  return pix.toBRCode()
}

/**
 * Generates a QR code as a data URL (data:image/png;base64,...).
 * Pass the BR Code string from generatePixBRCode().
 */
export async function generateQRDataURL(brCode: string): Promise<string> {
  return QRCode.toDataURL(brCode, { width: 256, margin: 2 })
}
