// Game viewer: board, move list, navigation (buttons, keys, swipe, autoplay) and game actions.

import { Chessboard, COLOR } from '../vendor/cm-chessboard/src/Chessboard.js'
import { Markers } from '../vendor/cm-chessboard/src/extensions/markers/Markers.js'
import { esc, resultLabel, plural, date } from './format.js'
import { movetext } from './pgn.js'
import { icon, sidePoints, sideClass, terminationLabel, gameDate, copyText, loadSprite, toast } from './ui.js'
import { download, slug } from './export.js'

const LASTMOVE = { class: 'marker-lastmove', slice: 'markerSquare' }
const CHECK = { class: 'marker-check', slice: 'markerCircleFilled' }

export function renderViewer(ctx, id) {
  const p = ctx.model.pairingById.get(id)
  if (!p?.game) {
    return `<section class="view"><a class="back" href="#/games">${icon.chevronLeft}Games</a><div class="card empty">This game isn't available.</div></section>`
  }
  const g = p.game
  const d = gameDate(p)
  const sub = [`Round ${p.round} · Board ${p.board}`, d, g.headers.TimeControl && g.headers.TimeControl !== '?' ? g.headers.TimeControl : '']
    .filter(Boolean).join(' · ')

  return `
  <section class="view viewer" aria-labelledby="viewer-title">
    <div>
      <a class="back" href="#/games">${icon.chevronLeft}Games</a>
      <div class="viewer-head">
        <h1 id="viewer-title">${esc(p.white.display)} <span class="muted">–</span> ${esc(p.black.display)}</h1>
        <p class="sub">${esc(sub)}</p>
      </div>
    </div>

    <div class="viewer-stage">
      <div class="board-col">
        <div class="player-bar" data-bar="top"></div>
        <div class="board-frame" data-board aria-label="Chess board" role="img"></div>
        <div class="player-bar" data-bar="bottom"></div>
        <div class="controls" role="toolbar" aria-label="Move navigation">
          <button type="button" data-nav-go="first" aria-label="First position (Home)">${icon.first}</button>
          <button type="button" data-nav-go="prev" aria-label="Previous move (Left arrow)">${icon.prev}</button>
          <button type="button" class="play" data-nav-go="play" aria-label="Autoplay (Space)" aria-pressed="false">${icon.play}</button>
          <button type="button" data-nav-go="next" aria-label="Next move (Right arrow)">${icon.next}</button>
          <button type="button" data-nav-go="last" aria-label="Last position (End)">${icon.last}</button>
          <button type="button" data-nav-go="flip" aria-label="Flip board (F)">${icon.flip}</button>
        </div>
        <p class="visually-hidden" aria-live="polite" data-announce></p>
      </div>

      <div class="side-col">
        <div class="card moves-card">
          <div class="moves-head">
            <h2>Moves</h2>
            <span class="opening" data-opening>${p.opening ? `${esc(p.opening.eco)} ${esc(p.opening.name)}` : ''}</span>
          </div>
          <div class="moves" data-moves>
            ${moveList(g)}
            <div class="result-row">${esc(resultLabel(g.result) || '*')}<small>${esc(terminationLabel(g))}</small></div>
          </div>
        </div>
        <div class="actions">
          <button class="btn" type="button" data-act="copy">${icon.copy}Copy PGN</button>
          <button class="btn" type="button" data-act="download">${icon.download}PGN</button>
          <a class="btn" data-act="lichess" href="${lichessUrl(g)}" target="_blank" rel="noopener">${icon.external}Lichess</a>
          <button class="btn" type="button" data-act="link">${icon.link}Link</button>
        </div>
        <div class="card">
          <dl class="info-grid">
            <dt>White</dt><dd><a href="#/player/${esc(p.white.id)}">${esc(p.white.display)}</a></dd>
            <dt>Black</dt><dd><a href="#/player/${esc(p.black.id)}">${esc(p.black.display)}</a></dd>
            <dt>Result</dt><dd>${esc(resultLabel(p.result))} · ${esc(terminationLabel(g))}</dd>
            <dt>Length</dt><dd>${esc(plural(g.fullMoves, 'move'))}</dd>
            ${p.opening ? `<dt>Opening</dt><dd>${esc(p.opening.eco)} ${esc(p.opening.name)}</dd>` : ''}
            ${g.headers.Date && date(g.headers.Date) ? `<dt>Date</dt><dd>${esc(date(g.headers.Date))}</dd>` : ''}
          </dl>
        </div>
      </div>
    </div>
  </section>`
}

function moveList(g) {
  let html = ''
  for (const m of g.moves) {
    if (m.color === 'w') html += `<span class="no">${m.number}.</span>`
    else if (m.ply === 1) html += `<span class="no">${m.number}…</span><span></span>`
    html += `<button type="button" data-ply="${m.ply}">${esc(m.san)}</button>`
  }
  return html
}

function lichessUrl(g) {
  // lichess.org/analysis/pgn/<movetext> opens the moves on an analysis board, no account needed.
  return `https://lichess.org/analysis/pgn/${encodeURIComponent(movetext(g)).replaceAll('%20', '_')}`
}

/** Wire up the viewer after its HTML is in the page. Returns a cleanup function. */
export async function mountViewer(ctx, root, id, startPly) {
  const p = ctx.model.pairingById.get(id)
  if (!p?.game) return () => {}
  const g = p.game
  const total = g.moves.length
  let ply = Number.isFinite(startPly) ? Math.max(0, Math.min(total, startPly)) : total
  let flipped = false
  let timer = null

  const frame = root.querySelector('[data-board]')
  const movesEl = root.querySelector('[data-moves]')
  const announce = root.querySelector('[data-announce]')
  const buttons = Object.fromEntries([...root.querySelectorAll('[data-nav-go]')].map((b) => [b.dataset.navGo, b]))

  await loadSprite()
  const board = new Chessboard(frame, {
    position: fenAt(ply),
    orientation: COLOR.white,
    assetsUrl: 'vendor/cm-chessboard/assets/',
    assetsCache: true,
    style: { cssClass: 'rrr', showCoordinates: true, borderType: 'none', animationDuration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160 },
    extensions: [{ class: Markers, props: { autoMarkers: null } }],
  })

  function fenAt(n) {
    return n === 0 ? g.startFen : g.moves[n - 1].fen
  }

  function bars() {
    const top = flipped ? 'white' : 'black'
    const bottom = flipped ? 'black' : 'white'
    const turn = ply === total ? null : (ply % 2 === 0 ? 'white' : 'black')
    for (const [slot, color] of [['top', top], ['bottom', bottom]]) {
      const el = root.querySelector(`[data-bar="${slot}"]`)
      const atEnd = ply === total
      el.className = `player-bar ${atEnd ? sideClass(p, color) : ''} ${turn === color ? 'to-move' : ''}`
      // At the final position, say how it ended next to the winner (or under the board for a draw).
      const showNote = atEnd && g.termination !== 'unfinished' &&
        (sideClass(p, color) === 'winner' || (p.result === '1/2-1/2' && slot === 'bottom'))
      const note = showNote ? `<span class="end-note">${esc(terminationLabel(g))}</span>` : ''
      el.innerHTML = `<span class="piece-dot ${color[0]}" aria-hidden="true"></span><a class="name" href="#/player/${esc(p[color].id)}">${esc(p[color].display)}</a><span class="clock-dot" aria-hidden="true"></span>${note}<span class="pts">${atEnd ? sidePoints(p, color) : ''}</span>`
    }
  }

  function render(animate) {
    board.setPosition(fenAt(ply), animate)
    board.removeMarkers()
    const m = g.moves[ply - 1]
    if (m) {
      board.addMarker(LASTMOVE, m.from)
      board.addMarker(LASTMOVE, m.to)
      if (m.check) {
        const kingSq = findKing(m.fen, m.color === 'w' ? 'b' : 'w')
        if (kingSq) board.addMarker(CHECK, kingSq)
      }
    }
    for (const b of movesEl.querySelectorAll('button[aria-current]')) b.removeAttribute('aria-current')
    const current = movesEl.querySelector(`button[data-ply="${ply}"]`)
    if (current) {
      current.setAttribute('aria-current', 'true')
      // Scroll only the move list, never the page.
      const top = current.offsetTop - movesEl.clientHeight / 2 + current.clientHeight / 2
      movesEl.scrollTo({ top, behavior: animate ? 'smooth' : 'auto' })
    } else if (ply === 0) {
      movesEl.scrollTo({ top: 0 })
    }
    buttons.first.disabled = buttons.prev.disabled = ply === 0
    buttons.next.disabled = buttons.last.disabled = ply === total
    announce.textContent = m ? `${m.number}${m.color === 'w' ? '.' : '…'} ${m.san}` : 'Starting position'
    bars()
    history.replaceState(null, '', `#/game/${p.id}${ply === total ? '' : `/${ply}`}`)
  }

  function go(n, animate = Math.abs(n - ply) === 1) {
    const next = Math.max(0, Math.min(total, n))
    if (next === ply) return
    ply = next
    render(animate)
  }

  function stop() {
    clearInterval(timer)
    timer = null
    buttons.play.setAttribute('aria-pressed', 'false')
    buttons.play.innerHTML = icon.play
  }

  function play() {
    if (timer) return stop()
    if (ply === total) go(0, false)
    buttons.play.setAttribute('aria-pressed', 'true')
    buttons.play.innerHTML = icon.pause
    timer = setInterval(() => {
      if (ply >= total) return stop()
      go(ply + 1)
    }, 1000)
  }

  function flip() {
    flipped = !flipped
    board.setOrientation(flipped ? COLOR.black : COLOR.white, false)
    bars()
  }

  root.querySelector('.controls').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav-go]')
    if (!b) return
    const action = b.dataset.navGo
    if (action !== 'play') stop()
    if (action === 'first') go(0)
    else if (action === 'prev') go(ply - 1)
    else if (action === 'next') go(ply + 1)
    else if (action === 'last') go(total)
    else if (action === 'flip') flip()
    else if (action === 'play') play()
  })

  movesEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ply]')
    if (!b) return
    stop()
    go(Number(b.dataset.ply))
  })

  const filename = `${slug(`${p.white.last}-${p.black.last}`)}-r${p.round}.pgn`
  root.querySelector('.actions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]')
    if (!b) return
    if (b.dataset.act === 'copy') copyText(p.pgnText, 'PGN copied')
    else if (b.dataset.act === 'download') { download(filename, p.pgnText, 'application/x-chess-pgn'); toast('PGN downloaded') }
    else if (b.dataset.act === 'link') {
      const url = `${location.origin}${location.pathname}#/game/${p.id}${ply === total ? '' : `/${ply}`}`
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        navigator.share({ title: `${p.white.display} – ${p.black.display}`, url }).catch(() => {})
      } else copyText(url, 'Link copied')
    }
  })

  const onKey = (e) => {
    if (e.target.closest?.('input, select, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
    const map = { ArrowLeft: () => go(ply - 1), ArrowRight: () => go(ply + 1), Home: () => go(0), End: () => go(total), f: flip, F: flip, ' ': play }
    const fn = map[e.key]
    if (!fn) return
    if (e.target.closest?.('button') && e.key === ' ') return
    e.preventDefault()
    if (e.key !== ' ') stop()
    fn()
  }
  document.addEventListener('keydown', onKey)

  // Horizontal swipe on the board steps through the moves.
  let start = null
  frame.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, t: Date.now() } })
  frame.addEventListener('pointerup', (e) => {
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const dt = Date.now() - start.t
    start = null
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 700) {
      stop()
      go(dx < 0 ? ply + 1 : ply - 1)
    }
  })
  frame.addEventListener('pointercancel', () => { start = null })

  render(false)

  return () => {
    stop()
    document.removeEventListener('keydown', onKey)
    board.destroy()
  }
}

function findKing(fen, color) {
  const target = color === 'w' ? 'K' : 'k'
  const rows = fen.split(' ')[0].split('/')
  for (let r = 0; r < 8; r++) {
    let f = 0
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { f += Number(ch); continue }
      if (ch === target) return 'abcdefgh'[f] + (8 - r)
      f++
    }
  }
  return null
}
