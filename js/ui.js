// Shared browser-side UI pieces: icons, small components, toast, tooltip.

import { esc, score, date } from './format.js'
import { TERMINATION } from './pgn.js'

export const icon = {
  chevronRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  first: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M18 6l-7 6 7 6"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  last: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M6 6l7 6-7 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13M15.5 5.5v13"/></svg>',
  flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v15M7 19l-3-3M7 19l3-3M17 20V5M17 5l-3 3M17 5l3 3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18V7a1.5 1.5 0 0 1 1.5-1.5H10"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2M7 14h10v6H7Z"/></svg>',
}

export function avatar(player) {
  return `<span class="avatar" aria-hidden="true">${esc(player.initials)}</span>`
}

/** Per-round form guide from a player's perspective: W / D / L squares, plus a live marker. */
export function formGuide(model, player, cards) {
  const byRound = new Map(cards.map((c) => [c.round, c]))
  const items = []
  for (const round of model.rounds) {
    const c = byRound.get(round.number)
    if (c) {
      const cls = c.category === 'bye' ? '' : c.points >= model.meta.scoring.win ? 'w' : c.points === model.meta.scoring.draw ? 'd' : 'l'
      const letter = c.category === 'bye' ? '–' : cls.toUpperCase()
      items.push(`<i class="${cls}" title="Round ${round.number}: ${letterTitle(cls)}">${letter}</i>`)
      continue
    }
    const pending = round.pairings.find((p) => !p.finished && (p.white?.id === player.id || p.black?.id === player.id))
    if (pending) items.push(`<i class="live" title="Round ${round.number}: ${statusLabel(pending)}">•</i>`)
  }
  return items.length ? `<span class="form" aria-hidden="true">${items.join('')}</span>` : ''
}

function letterTitle(cls) {
  return { w: 'win', d: 'draw', l: 'loss' }[cls] ?? 'bye'
}

export function statusLabel(pairing) {
  if (pairing.status === 'scheduled') return 'Not started'
  if (pairing.status === 'postponed') return 'Postponed'
  return 'In progress'
}

export function statusPill(pairing) {
  const label = statusLabel(pairing)
  const quiet = pairing.status === 'scheduled' || pairing.status === 'postponed'
  return `<span class="live-pill${quiet ? ' quiet' : ''}">${esc(label === 'In progress' ? 'Live' : label)}</span>`
}

/** Points text for one side of a pairing ("1", "½", "0", "" when unfinished). */
export function sidePoints(pairing, side) {
  const v = pairing.points[side]
  return v == null ? '' : score(v)
}

export function sideClass(pairing, side) {
  if (!pairing.finished || pairing.category === 'bye') return ''
  const mine = pairing.points[side]
  const theirs = pairing.points[side === 'white' ? 'black' : 'white']
  if (mine > theirs) return 'winner'
  if (mine === theirs && pairing.result === '1/2-1/2') return 'draw'
  return ''
}

export function terminationLabel(game) {
  return TERMINATION[game.termination] ?? ''
}

export function gameDate(pairing) {
  return date(pairing.date ?? pairing.game?.headers?.Date)
}

/** Static SVG board for a FEN, drawn with the (already loaded) piece sprite. */
export function boardThumb(fen, { flipped = false, lastMove = null, label = '' } = {}) {
  const rows = fen.split(' ')[0].split('/')
  let squares = ''
  let pieces = ''
  const hl = new Set(lastMove ? [lastMove.from, lastMove.to] : [])
  for (let r = 0; r < 8; r++) {
    let f = 0
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { f += Number(ch); continue }
      const color = ch === ch.toUpperCase() ? 'w' : 'b'
      const [x, y] = flipped ? [(7 - f) * 40, (7 - r) * 40] : [f * 40, r * 40]
      pieces += `<use href="#${color}${ch.toLowerCase()}" x="${x}" y="${y}"/>`
      f++
    }
  }
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = 'abcdefgh'[f] + (8 - r)
      const [x, y] = flipped ? [(7 - f) * 40, (7 - r) * 40] : [f * 40, r * 40]
      squares += `<rect class="${(r + f) % 2 ? 'd' : 'l'}" x="${x}" y="${y}" width="40" height="40"/>`
      if (hl.has(sq)) squares += `<rect x="${x}" y="${y}" width="40" height="40" fill="var(--sq-mark)"/>`
    }
  }
  return `<svg class="thumb" viewBox="0 0 320 320" role="img" aria-label="${esc(label || 'Final position')}">${squares}${pieces}</svg>`
}

let spritePromise = null
/** Inline the piece sprite once, under the id cm-chessboard looks for, so both share it. */
export function loadSprite(url = 'vendor/cm-chessboard/assets/pieces/standard.svg') {
  spritePromise ??= fetch(url).then((r) => r.text()).then((svg) => {
    if (document.getElementById('cm-chessboard-sprite')) return
    const wrapper = document.createElement('div')
    wrapper.id = 'cm-chessboard-sprite'
    wrapper.setAttribute('aria-hidden', 'true')
    wrapper.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;transform:scale(0)'
    wrapper.innerHTML = svg
    document.body.append(wrapper)
  }).catch(() => {})
  return spritePromise
}

let toastTimer = null
export function toast(message) {
  const el = document.getElementById('toast')
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200)
}

export async function copyText(text, message = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast(message)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.append(ta)
    ta.select()
    try { document.execCommand('copy'); toast(message) } catch { toast('Copy failed') }
    ta.remove()
  }
}

/** One tooltip for every element carrying data-tip-value / data-tip-label (hover and focus). */
export function installTooltip() {
  const tip = document.getElementById('tooltip')
  const show = (el, x, y) => {
    tip.replaceChildren()
    const strong = document.createElement('strong')
    strong.textContent = el.dataset.tipValue
    const span = document.createElement('span')
    span.textContent = el.dataset.tipLabel ?? ''
    tip.append(strong, span)
    tip.hidden = false
    const r = tip.getBoundingClientRect()
    const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2))
    const top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12
    tip.style.left = `${left}px`
    tip.style.top = `${top}px`
  }
  const hide = () => { tip.hidden = true }
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('[data-tip-value]')
    if (el && e.pointerType === 'mouse') show(el, e.clientX, e.clientY)
    else if (!tip.hidden) hide()
  })
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tip-value]')
    if (!el) return hide()
    const r = el.getBoundingClientRect()
    show(el, r.left + r.width / 2, r.top)
  })
  document.addEventListener('focusout', hide)
  document.addEventListener('scroll', hide, { passive: true })
}
