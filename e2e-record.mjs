/**
 * RachaCerto — animated demo recorder
 * Runs a headed Playwright browser with slow motion, records video, exports GIF.
 * Run with: node e2e-record.mjs
 */
import { chromium } from 'playwright'
import { writeFileSync, unlinkSync, mkdirSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'

const BASE = 'http://localhost:4325'
const VIDEO_DIR = '/tmp/rachacerto-demo'
const OUT_GIF = '/Users/rafa/Code/rachAcerto/docs/demo.gif'

const SAMPLE_CHAT = `[01/04/2025, 20:15] Rafa: paguei o jantar hoje, R$ 120,00
[01/04/2025, 21:00] Ju: ok! eu pago o café amanhã
[02/04/2025, 09:30] Ju: paguei o café, R$ 35,50
[02/04/2025, 14:00] Rafa: gasolina R$ 80,00`

const chatFile = join(tmpdir(), 'demo-chat.txt')

function log(msg) { console.log(`  ✓ ${msg}`) }
function step(msg) { console.log(`\n→ ${msg}`) }

try {
  mkdirSync(VIDEO_DIR, { recursive: true })
  writeFileSync(chatFile, SAMPLE_CHAT, 'utf-8')

  const browser = await chromium.launch({
    headless: false,
    slowMo: 600, // ms between actions — makes interactions look natural
    args: ['--window-size=1280,800', '--window-position=0,0'],
  })

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
  })

  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)

  // ── Landing ───────────────────────────────────────────────────────────────
  step('Landing')
  await page.goto(BASE)
  await page.waitForSelector('text=RachaCerto')
  await page.waitForTimeout(1200) // pause so viewer can read
  log('landing loaded')

  // ── /novo ─────────────────────────────────────────────────────────────────
  step('Create trip')
  await page.goto(`${BASE}/novo`)
  await page.waitForSelector('input[placeholder*="Viagem"]')
  await page.waitForTimeout(600)

  await page.fill('input[placeholder*="Viagem"]', 'Viagem PG · Abril 2026')
  await page.waitForTimeout(400)

  await page.fill('input[placeholder="Nome da pessoa"]', 'Rafa')
  await page.click('button:has-text("+")')
  await page.waitForSelector('text=Rafa')

  await page.fill('input[placeholder="Nome da pessoa"]', 'Ju')
  await page.click('button:has-text("+")')
  await page.waitForSelector('text=Ju')

  await page.fill('input[placeholder="Nome da pessoa"]', 'Pedro')
  await page.click('button:has-text("+")')
  await page.waitForSelector('text=Pedro')

  await page.waitForTimeout(800)

  let tripData
  const [apiResponse] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/trips') && r.request().method() === 'POST'),
    page.click('button:has-text("CRIAR ACERTO")'),
  ])
  tripData = await apiResponse.json()
  if (!tripData.slug) throw new Error(`Trip creation failed: ${JSON.stringify(tripData)}`)

  const { slug, people } = tripData
  await page.waitForTimeout(1200)
  log(`trip created: ${slug}`)

  // ── Join as Rafa ──────────────────────────────────────────────────────────
  step('Join + upload chat')
  const rafa = people.find(p => p.name === 'Rafa')
  await page.goto(`${BASE}/t/${slug}/join/${rafa.invite_token}`)
  await page.waitForURL(/\/upload/, { timeout: 10000 })
  await page.waitForTimeout(800)

  // Switch to CHAT tab
  await page.click('button:has-text("CHAT")')
  await page.waitForTimeout(600)

  // Load chat file
  await page.waitForSelector('#chat-file', { state: 'attached' })
  await page.locator('#chat-file').setInputFiles(chatFile)
  await page.waitForSelector('text=Chat carregado')
  await page.waitForTimeout(800)

  // Extract
  await page.click('button:has-text("EXTRAIR TRANSAÇÕES")')
  log('extracting (Gemini)...')
  await page.waitForSelector('text=R$', { timeout: 45000 })
  await page.waitForTimeout(1500)
  log('extracted')

  // ── Trip page with review CTA ─────────────────────────────────────────────
  step('Trip page')
  await page.goto(`${BASE}/t/${slug}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
  // Show trip page briefly; navigate to review directly (CTA may need session context)
  log('trip page loaded')

  // ── Review page ───────────────────────────────────────────────────────────
  step('Review page')
  await page.goto(`${BASE}/t/${slug}/review`)
  await page.waitForURL(/\/review/)
  await page.waitForSelector('text=Transações')
  await page.waitForTimeout(1000)

  // Switch to Buckets tab
  await page.click('button:has-text("Buckets")')
  await page.waitForTimeout(800)

  // Switch back to Transactions
  await page.click('button:has-text("Transações")')
  await page.waitForTimeout(600)

  // Navigate to result
  await page.click('a:has-text("VER QUEM DEVE QUANTO")')
  await page.waitForURL(/\/result/)

  // ── Result page ───────────────────────────────────────────────────────────
  step('Result page')
  await page.waitForSelector('text=Resumo')
  await page.waitForTimeout(2000) // let viewer read the result
  log('result shown')

  await ctx.close()
  await browser.close()

  // Find the recorded video
  const files = readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'))
  if (!files.length) throw new Error('No video recorded')
  const videoPath = join(VIDEO_DIR, files[0])
  log(`video saved: ${videoPath}`)

  // Convert WebM → GIF via ffmpeg (palette for quality)
  step('Converting to GIF')
  mkdirSync('docs', { recursive: true })

  execSync(
    `ffmpeg -y -i "${videoPath}" -vf "fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" "${OUT_GIF}"`,
    { stdio: 'pipe' }
  )

  log(`GIF saved: ${OUT_GIF}`)
  console.log('\n✅ Demo recorded!')
  console.log(`   Add to README: ![demo](docs/demo.gif)`)

} catch (err) {
  console.error(`\n❌ Failed: ${err.message}`)
  process.exit(1)
} finally {
  try { unlinkSync(chatFile) } catch {}
}
