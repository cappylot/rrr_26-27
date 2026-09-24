// Entry point: loads the data, routes between views, and wires up the global UI.

import { loadTournament, loadOpenings, attachOpenings } from './data.js'
import { computeStandings } from './standings.js'
import { computeStats } from './stats.js'
import { currentRound } from './tournament.js'
import { date, esc } from './format.js'
import { renderStandings } from './views/standings.js'
import { renderPairings } from './views/pairings.js'
import { renderGames } from './views/games.js'
import { renderStats } from './views/stats.js'
import { renderPlayer } from './views/player.js'
import { renderViewer, mountViewer } from './viewer.js'
import { setupExport } from './exportSheet.js'
import { installTooltip, loadSprite } from './ui.js'

const main = document.getElementById('main')
const ctx = { model: null, rows: [], stats: null, openings: null, route: null }
let cleanup = null
let renderToken = 0

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '')
  const [path, qs = ''] = raw.split('?')
  const parts = path.split('/').filter(Boolean)
  const query = new URLSearchParams(qs)
  switch (parts[0]) {
    case 'pairings': return { name: 'pairings', round: Number(parts[1]) || null, query }
    case 'games': return { name: 'games', query }
    case 'game': return { name: 'game', id: parts[1], ply: parts[2] != null ? Number(parts[2]) : null, query }
    case 'stats': return { name: 'stats', query }
    case 'player': return { name: 'player', id: decodeURIComponent(parts[1] ?? ''), query }
    default: return { name: 'standings', query }
  }
}

const NAV_FOR = { standings: 'standings', player: 'standings', pairings: 'pairings', games: 'games', game: 'games', stats: 'stats' }

async function render({ scroll = true } = {}) {
  const token = ++renderToken
  const route = parseRoute()
  ctx.route = route
  cleanup?.()
  cleanup = null

  let html
  let title = ''
  switch (route.name) {
    case 'pairings': html = renderPairings(ctx, route.round); title = 'Pairings'; break
    case 'games': html = renderGames(ctx, route.query); title = 'Games'; break
    case 'game': {
      html = renderViewer(ctx, route.id)
      const p = ctx.model.pairingById.get(route.id)
      title = p ? `${p.white.short} – ${p.black.short}` : 'Game'
      break
    }
    case 'stats': html = renderStats(ctx); title = 'Stats'; break
    case 'player': html = renderPlayer(ctx, route.id); title = ctx.model.playerById.get(route.id)?.display ?? 'Player'; break
    default: html = renderStandings(ctx); title = 'Standings'
  }
  main.innerHTML = html
  document.title = `${title} · ${ctx.model.meta.name}`
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === NAV_FOR[route.name]) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  }
  if (scroll) window.scrollTo({ top: 0 })

  if (route.name === 'game') {
    const dispose = await mountViewer(ctx, main, route.id, route.ply)
    if (token !== renderToken) dispose()
    else cleanup = dispose
  }
}

function recompute() {
  ctx.rows = computeStandings(ctx.model)
  ctx.stats = computeStats(ctx.model, ctx.rows, ctx.openings)
}

function header() {
  const { meta } = ctx.model
  const round = currentRound(ctx.model)
  document.getElementById('brand-sub').textContent =
    [meta.section, round ? `Round ${round.number} of ${meta.totalRounds}` : 'Starting soon'].filter(Boolean).join(' · ')
  document.getElementById('footer-title').textContent = meta.title
  document.getElementById('footer-updated').textContent = meta.updated ? `Updated ${date(meta.updated)}` : ''
}

function problems() {
  const el = document.getElementById('problems')
  const list = ctx.model.problems
  el.hidden = !list.length
  if (list.length) {
    el.innerHTML = `<strong>Some tournament data needs a look:</strong><ul>${list.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
  }
}

function setupTheme() {
  const btn = document.getElementById('theme-toggle')
  const dark = () => {
    const t = document.documentElement.dataset.theme
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  }
  const sync = () => {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = color
    btn.setAttribute('aria-label', dark() ? 'Switch to light theme' : 'Switch to dark theme')
  }
  btn.addEventListener('click', () => {
    const next = dark() ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('rrr-theme', next) } catch {}
    sync()
  })
  sync()
}

function setupInteractions() {
  // Whole standings rows are tappable, not just the name.
  main.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-href]')
    if (row && !e.target.closest('a, button')) location.hash = row.dataset.href
  })
  // Games filters live in the URL so a filtered list can be shared.
  main.addEventListener('change', (e) => {
    const form = e.target.closest('[data-filters]')
    if (!form) return
    const q = new URLSearchParams()
    for (const [k, v] of new FormData(form)) if (v) q.set(k, v)
    location.hash = `#/games${q.size ? `?${q}` : ''}`
  })
}

async function start() {
  setupTheme()
  installTooltip()
  try {
    // The piece sprite is needed by the game thumbnails, so it loads alongside the data.
    ;[ctx.model] = await Promise.all([loadTournament(), loadSprite()])
  } catch (err) {
    main.innerHTML = `<div class="card empty">Couldn't load the tournament data.<br><small>${esc(err.message)}</small></div>`
    return
  }
  recompute()
  header()
  problems()
  setupExport(() => ctx)
  setupInteractions()
  window.addEventListener('hashchange', () => render())
  await render({ scroll: false })

  // Opening names arrive a moment later; refresh the views that show them.
  ctx.openings = await loadOpenings()
  if (ctx.openings) {
    attachOpenings(ctx.model, ctx.openings)
    recompute()
    if (['games', 'stats'].includes(ctx.route.name)) render({ scroll: false })
    else if (ctx.route.name === 'game') {
      const el = main.querySelector('[data-opening]')
      const p = ctx.model.pairingById.get(ctx.route.id)
      if (el && p?.opening) el.textContent = `${p.opening.eco} ${p.opening.name}`
    }
  }
}

start()
