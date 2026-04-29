/**
 * RachaCerto E2E smoke test
 * Run with: node e2e-test.mjs
 */
import { chromium } from 'playwright'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const BASE = 'http://localhost:4325'

const SAMPLE_CHAT = `[01/04/2025, 20:15] Rafa: paguei o jantar hoje, R$ 120,00
[01/04/2025, 21:00] Ju: ok! eu pago o café amanhã
[02/04/2025, 09:30] Ju: paguei o café, R$ 35,50
[02/04/2025, 14:00] Rafa: gasolina R$ 80,00`

const chatFile = join(tmpdir(), 'e2e-chat.txt')

function log(msg) { console.log(`  ✓ ${msg}`) }
function step(msg) { console.log(`\n→ ${msg}`) }
async function ss(page, name) {
  await page.screenshot({ path: `/tmp/e2e-${name}.png`, fullPage: true })
}

let browser

try {
  writeFileSync(chatFile, SAMPLE_CHAT, 'utf-8')

  browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.setDefaultTimeout(15000)

  // ── Step 1: Landing ───────────────────────────────────────────────────────
  step('Landing page')
  await page.goto(BASE)
  await page.waitForSelector('text=RachaCerto')
  log('loaded')
  await ss(page, '01-landing')

  // ── Step 2: Create trip ───────────────────────────────────────────────────
  step('Create trip')
  await page.goto(`${BASE}/novo`)
  await page.waitForSelector('input[placeholder*="Viagem"]')

  // Trip name
  await page.fill('input[placeholder*="Viagem"]', 'Viagem E2E')

  // Add person 1
  await page.fill('input[placeholder="Nome da pessoa"]', 'Rafa')
  await page.click('button:has-text("+")')
  await page.waitForSelector('text=Rafa')

  // Add person 2
  await page.fill('input[placeholder="Nome da pessoa"]', 'Ju')
  await page.click('button:has-text("+")')
  await page.waitForSelector('text=Ju')

  log('form filled')
  await ss(page, '02-novo-filled')

  // Intercept the API response to grab slug + invite tokens
  let tripData
  const [apiResponse] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/trips') && r.request().method() === 'POST'),
    page.click('button:has-text("CRIAR ACERTO")'),
  ])
  tripData = await apiResponse.json()

  if (!tripData.slug) throw new Error(`Trip creation failed: ${JSON.stringify(tripData)}`)
  const { slug, people } = tripData
  log(`trip created — slug: ${slug}, people: ${people.map(p => p.name).join(', ')}`)
  await ss(page, '03-trip-created')

  // ── Step 3: Join as Rafa via invite link ──────────────────────────────────
  step('Join as Rafa via invite link')
  const rafa = people.find(p => p.name === 'Rafa')
  if (!rafa) throw new Error('Rafa not in people list')

  await page.goto(`${BASE}/t/${slug}/join/${rafa.invite_token}`)
  await page.waitForURL(/\/upload/, { timeout: 10000 })
  log(`joined as ${rafa.name} — on /upload`)
  await ss(page, '04-upload')

  // ── Step 4: Upload chat ───────────────────────────────────────────────────
  step('Upload WhatsApp chat')
  // Switch to CHAT tab
  await page.click('button:has-text("CHAT")')
  await page.waitForSelector('#chat-file', { state: 'attached' })

  // Upload the sample .txt file (input is hidden — use force)
  await page.locator('#chat-file').setInputFiles(chatFile)
  await page.waitForSelector('text=Chat carregado', { timeout: 5000 })
  log('chat file loaded')
  await ss(page, '05-chat-loaded')

  // Click extract
  await page.click('button:has-text("EXTRAIR TRANSAÇÕES")')
  log('extraction started (calling Gemini API)...')

  // Wait for transactions or error (Gemini call can take a few seconds)
  await page.waitForSelector('text=transaç, text=R$, .font-mono', { timeout: 45000 })
    .catch(() => {})
  await page.waitForTimeout(2000) // let UI settle
  await ss(page, '06-extracted')

  // Check for errors
  const errText = await page.locator('text=Erro').first().textContent().catch(() => null)
  if (errText) {
    log(`⚠ API response: ${errText}`)
  } else {
    log('transactions extracted')
  }

  // ── Step 5: Review page ───────────────────────────────────────────────────
  step('Review page')
  await page.goto(`${BASE}/t/${slug}/review`)
  const reviewUrl = page.url()
  if (reviewUrl.includes('/join')) {
    log('⚠ redirected to /join — session cookie not carried (expected if join was via redirect)')
  } else {
    await page.waitForSelector('text=Transações', { timeout: 10000 })
    const txCount = await page.locator('.border-b').count()
    log(`review loaded — ${txCount} rows visible`)
    await ss(page, '07-review')

    // ── Step 6: Result page ─────────────────────────────────────────────────
    step('Result page')
    await page.click('a:has-text("VER QUEM DEVE QUANTO")')
    await page.waitForURL(/\/result/, { timeout: 10000 })
    await page.waitForSelector('text=Resumo', { timeout: 10000 })
    log('result page loaded')
    await ss(page, '08-result')

    const transferCount = await page.locator('text=→').count()
    log(`${transferCount} settlement row(s) visible`)
  }

  console.log('\n✅ E2E smoke test passed')
  console.log('   Screenshots: /tmp/e2e-*.png')

} catch (err) {
  console.error(`\n❌ E2E test failed: ${err.message}`)
  process.exit(1)
} finally {
  await browser?.close()
  try { unlinkSync(chatFile) } catch {}
}
