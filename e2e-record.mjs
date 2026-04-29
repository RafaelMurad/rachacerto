/**
 * RachaCerto — animated demo recorder
 * Runs a headed Playwright browser with slow motion, records video, exports GIF.
 * Run with: node e2e-record.mjs
 *
 * Requires: ffmpeg + gifski (`brew install gifski`)
 */
import { chromium } from 'playwright'
import { writeFileSync, unlinkSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'

const BASE = 'http://localhost:4325'
const VIDEO_DIR = '/tmp/rachacerto-demo'
const FRAMES_DIR = '/tmp/rachacerto-frames'
const OUT_GIF = '/Users/rafa/Code/rachAcerto/docs/demo.gif'

const SAMPLE_CHAT = `[01/04/2025, 20:15] Rafa: paguei o jantar hoje, R$ 120,00
[01/04/2025, 21:00] Ju: ok! eu pago o café amanhã
[02/04/2025, 09:30] Ju: paguei o café, R$ 35,50
[02/04/2025, 14:00] Rafa: gasolina R$ 80,00`

const chatFile = join(tmpdir(), 'demo-chat.txt')

function log(msg) { console.log(`  ✓ ${msg}`) }
function step(msg) { console.log(`\n→ ${msg}`) }

/**
 * Injects a colored cursor ring that tracks mouse movement and pulses on clicks.
 * Uses addInitScript so it survives page navigations automatically.
 */
async function injectCursorHighlight(page) {
  await page.addInitScript(() => {
    const ring = document.createElement('div')
    ring.id = '__cursor_ring'
    Object.assign(ring.style, {
      position: 'fixed',
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      border: '2.5px solid rgba(99,102,241,0.9)',
      backgroundColor: 'rgba(99,102,241,0.10)',
      pointerEvents: 'none',
      zIndex: '999999',
      transform: 'translate(-50%,-50%)',
      transition: 'transform 80ms ease, background-color 100ms ease',
      opacity: '0',
    })
    document.documentElement.appendChild(ring)

    document.addEventListener('mousemove', e => {
      ring.style.left = e.clientX + 'px'
      ring.style.top = e.clientY + 'px'
      ring.style.opacity = '1'
    })
    document.addEventListener('mousedown', () => {
      ring.style.transform = 'translate(-50%,-50%) scale(0.55)'
      ring.style.backgroundColor = 'rgba(99,102,241,0.30)'
    })
    document.addEventListener('mouseup', () => {
      ring.style.transform = 'translate(-50%,-50%) scale(1)'
      ring.style.backgroundColor = 'rgba(99,102,241,0.10)'
    })
  })

  // Also inject smooth scroll and hide the scrollbar for a cleaner recording
  await page.addInitScript(() => {
    document.documentElement.style.scrollBehavior = 'smooth'
    const style = document.createElement('style')
    style.textContent = '::-webkit-scrollbar { display: none }'
    document.head.appendChild(style)
  })
}

try {
  mkdirSync(VIDEO_DIR, { recursive: true })
  mkdirSync(FRAMES_DIR, { recursive: true })
  writeFileSync(chatFile, SAMPLE_CHAT, 'utf-8')

  const browser = await chromium.launch({
    headless: false,
    slowMo: 600,
    args: ['--window-size=1280,800', '--window-position=0,0'],
  })

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
  })

  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)

  await injectCursorHighlight(page)

  // ── Landing ───────────────────────────────────────────────────────────────
  step('Landing')
  await page.goto(BASE)
  await page.waitForSelector('text=RachaCerto')
  await page.waitForTimeout(1400)
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

  await page.click('button:has-text("CHAT")')
  await page.waitForTimeout(600)

  await page.waitForSelector('#chat-file', { state: 'attached' })
  await page.locator('#chat-file').setInputFiles(chatFile)
  await page.waitForSelector('text=Chat carregado')
  await page.waitForTimeout(800)

  await page.click('button:has-text("EXTRAIR TRANSAÇÕES")')
  log('extracting (Gemini)...')
  await page.waitForSelector('text=R$', { timeout: 45000 })
  await page.waitForTimeout(1500)
  log('extracted')

  // ── Trip page ─────────────────────────────────────────────────────────────
  step('Trip page')
  await page.goto(`${BASE}/t/${slug}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
  log('trip page loaded')

  // ── Review page ───────────────────────────────────────────────────────────
  step('Review page')
  await page.goto(`${BASE}/t/${slug}/review`)
  await page.waitForURL(/\/review/)
  await page.waitForSelector('text=Transações')
  await page.waitForTimeout(1000)

  await page.click('button:has-text("Buckets")')
  await page.waitForTimeout(800)

  await page.click('button:has-text("Transações")')
  await page.waitForTimeout(600)

  await page.click('a:has-text("VER QUEM DEVE QUANTO")')
  await page.waitForURL(/\/result/)

  // ── Result page ───────────────────────────────────────────────────────────
  step('Result page')
  await page.waitForSelector('text=Resumo')
  await page.waitForTimeout(800)

  // Scroll down to reveal PIX transfers, then back up
  await page.evaluate(() => window.scrollTo({ top: 320, behavior: 'smooth' }))
  await page.waitForTimeout(900)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  await page.waitForTimeout(1200)
  log('result shown')

  await ctx.close()
  await browser.close()

  // Find the recorded WebM
  const files = readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'))
  if (!files.length) throw new Error('No video recorded')
  const videoPath = join(VIDEO_DIR, files[0])
  log(`video saved: ${videoPath}`)

  // ── Export via gifski (better quality than palettegen) ────────────────────
  step('Extracting frames')
  // Clean frames dir
  rmSync(FRAMES_DIR, { recursive: true, force: true })
  mkdirSync(FRAMES_DIR)

  // Add 0.5s black fade-in and fade-out to the video, then extract frames as PNG
  execSync(
    `ffmpeg -y -i "${videoPath}" \
      -vf "fps=12,scale=960:-1:flags=lanczos,fade=in:st=0:d=0.4,fade=out:st=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}" | awk '{print $1-0.5}')" \
      "${FRAMES_DIR}/frame%04d.png"`,
    { stdio: 'pipe' }
  )

  const frameCount = readdirSync(FRAMES_DIR).filter(f => f.endsWith('.png')).length
  log(`${frameCount} frames extracted`)

  step('Encoding GIF with gifski')
  mkdirSync('docs', { recursive: true })

  execSync(
    `gifski --fps 12 --quality 90 -o "${OUT_GIF}" "${FRAMES_DIR}/frame"*.png`,
    { stdio: 'inherit' }
  )

  log(`GIF saved: ${OUT_GIF}`)
  console.log('\n✅ Demo recorded!')
  console.log(`   README embed: ![demo](docs/demo.gif)`)

} catch (err) {
  console.error(`\n❌ Failed: ${err.message}`)
  process.exit(1)
} finally {
  try { unlinkSync(chatFile) } catch {}
}
