// Game viewer: board, move list, navigation (buttons, keys, swipe, autoplay) and game actions,
// plus the engine (eval bar, lines, best-move arrow) and the game review.
//
// The same code drives the analysis view (#/analysis/<id>/<ply>). It shows only the engine-related
// parts and lets you make moves; a move off the game starts one side line that replaces any earlier one.

import { Chessboard, COLOR, INPUT_EVENT_TYPE } from '../vendor/cm-chessboard/src/Chessboard.js'
import { Markers } from '../vendor/cm-chessboard/src/extensions/markers/Markers.js'
import { Arrows } from '../vendor/cm-chessboard/src/extensions/arrows/Arrows.js'
import { PromotionDialog, PROMOTION_DIALOG_RESULT_TYPE } from '../vendor/cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js'
import { Chess } from '../vendor/chess.js/chess.js'
import { esc, resultLabel, plural, date } from './format.js'
import { movetext } from './pgn.js'
import { icon, sidePoints, sideClass, terminationLabel, gameDate, copyText, loadSprite, toast } from './ui.js'
import { download, slug } from './export.js'
import { LABEL, buildReview, movesHash, parseUci } from './review.js'
import { analyseGame } from './evaluate.js'
import { loadOpenings } from './data.js'
import { getEngine, createEngine, stopEngine, loadSettings, saveSettings, loadLocalReview, saveLocalReview } from './engine.js'
import {
  evalBarHtml, updateEvalBar, engineCardHtml, linesHtml, reviewCardHtml, graphSvg, moveGraphCursor, reviewNote,
} from './engineUi.js'

const LASTMOVE = { class: 'marker-lastmove', slice: 'markerSquare' }
const CHECK = { class: 'marker-check', slice: 'markerCircleFilled' }
const ARROW_ENGINE = { class: 'arrow-engine' }
const ARROW_BETTER = { class: 'arrow-better' }
/** Depth used when a visitor generates a review in their browser (the site's own use depth 22). */
const LOCAL_REVIEW_DEPTH = 16

export function renderViewer(ctx, id, { analysis = false } = {}) {
  const p = ctx.model.pairingById.get(id)
  if (!p?.game) {
    return `<section class="view"><a class="back" href="#/games">${icon.chevronLeft}Games</a><div class="card empty">This game isn't available.</div></section>`
  }
  const g = p.game
  const d = gameDate(p)
  const sub = [`Round ${p.round} · Board ${p.board}`, d, g.headers.TimeControl && g.headers.TimeControl !== '?' ? g.headers.TimeControl : '']
    .filter(Boolean).join(' · ')
  const settings = loadSettings()
  const review = p.review ?? localReview(p)
  const showReview = p.finished && g.moves.length > 0

  const head = analysis
    ? `<a class="back" href="#/game/${p.id}" data-back-game>${icon.chevronLeft}Game</a>
      <div class="viewer-head">
        <h1 id="viewer-title">Analysis <span class="muted">·</span> ${esc(p.white.short)} – ${esc(p.black.short)}</h1>
        <p class="sub">${esc(`Round ${p.round} · Board ${p.board}`)} · Drag pieces to try your own moves</p>
      </div>`
    : `<a class="back" href="#/games">${icon.chevronLeft}Games</a>
      <div class="viewer-head">
        <h1 id="viewer-title">${esc(p.white.display)} <span class="muted">–</span> ${esc(p.black.display)}</h1>
        <p class="sub">${esc(sub)}</p>
      </div>`

  return `
  <section class="view viewer ${analysis ? 'analysis' : ''}" aria-labelledby="viewer-title">
    <div>${head}</div>

    <div class="viewer-stage">
      <div class="board-col">
        ${analysis ? '' : '<div class="player-bar" data-bar="top"></div>'}
        <div class="board-wrap">
          ${evalBarHtml()}
          <div class="board-frame" data-board aria-label="Chess board" role="img"></div>
        </div>
        ${analysis ? '' : '<div class="player-bar" data-bar="bottom"></div>'}
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
        ${engineCardHtml({ analysis, settings })}
        <div class="card moves-card">
          <div class="moves-head">
            <h2>Moves</h2>
            <span class="opening" data-opening>${p.opening ? `${esc(p.opening.eco)} ${esc(p.opening.name)}` : ''}</span>
          </div>
          <div class="moves" data-moves></div>
        </div>
        ${showReview ? reviewCardHtml(p, review) : ''}
        ${analysis ? '' : `
        <div class="actions">
          <a class="btn btn-primary wide" data-act="analyze" href="#/analysis/${p.id}">${icon.analyze}Analyze with Stockfish</a>
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
        </div>`}
      </div>
    </div>
  </section>`
}

function localReview(p) {
  if (!p.game || !p.finished) return null
  const raw = loadLocalReview(p.id, movesHash(p.game))
  return raw ? buildReview(p.game, raw, { source: 'local' }) : null
}

function lichessUrl(g) {
  // lichess.org/analysis/pgn/<movetext> opens the moves on an analysis board, no account needed.
  return `https://lichess.org/analysis/pgn/${encodeURIComponent(movetext(g)).replaceAll('%20', '_')}`
}

/** Wire up the viewer after its HTML is in the page. Returns a cleanup function. */
export async function mountViewer(ctx, root, id, startPly, { analysis = false } = {}) {
  const p = ctx.model.pairingById.get(id)
  if (!p?.game) return () => {}
  const g = p.game
  const settings = loadSettings()
  let review = p.review ?? localReview(p)
  let ply = Number.isFinite(startPly) ? Math.max(0, Math.min(g.moves.length, startPly)) : g.moves.length
  let flipped = false
  let timer = null
  let disposed = false
  // Analysis only: one side line ({ from: game ply it leaves at, moves }) and whether we're on it.
  let side = null
  let onSide = false
  let engineResult = null
  let engineFen = null
  let searchingFen = null
  let searchToken = 0
  let betterArrow = null
  let reviewAbort = null

  const frame = root.querySelector('[data-board]')
  const movesEl = root.querySelector('[data-moves]')
  const announce = root.querySelector('[data-announce]')
  const evalBar = root.querySelector('[data-evalbar]')
  const engineCard = root.querySelector('[data-engine]')
  const linesEl = root.querySelector('[data-eng-lines]')
  const statusEl = root.querySelector('[data-eng-status]')
  const buttons = Object.fromEntries([...root.querySelectorAll('[data-nav-go]')].map((b) => [b.dataset.navGo, b]))

  const engineOn = () => analysis || settings.enabled
  const line = () => (onSide && side ? [...g.moves.slice(0, side.from), ...side.moves] : g.moves)
  const total = () => line().length

  await loadSprite()
  if (disposed) return () => {}
  const board = new Chessboard(frame, {
    position: fenAt(ply),
    orientation: COLOR.white,
    assetsUrl: 'vendor/cm-chessboard/assets/',
    assetsCache: true,
    style: { cssClass: 'rrr', showCoordinates: true, borderType: 'none', animationDuration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160 },
    extensions: [
      { class: Markers, props: { autoMarkers: null } },
      { class: Arrows, props: { headSize: 5 } },
      ...(analysis ? [{ class: PromotionDialog }] : []),
    ],
  })

  function fenAt(n) {
    return n === 0 ? g.startFen : line()[n - 1].fen
  }

  function bars() {
    if (analysis) return
    const top = flipped ? 'white' : 'black'
    const bottom = flipped ? 'black' : 'white'
    const atEnd = ply === g.moves.length
    const turn = atEnd ? null : (ply % 2 === 0 ? 'white' : 'black')
    for (const [slot, color] of [['top', top], ['bottom', bottom]]) {
      const el = root.querySelector(`[data-bar="${slot}"]`)
      el.className = `player-bar ${atEnd ? sideClass(p, color) : ''} ${turn === color ? 'to-move' : ''}`
      // At the final position, say how it ended next to the winner (or under the board for a draw).
      const showNote = atEnd && g.termination !== 'unfinished' &&
        (sideClass(p, color) === 'winner' || (p.result === '1/2-1/2' && slot === 'bottom'))
      const note = showNote ? `<span class="end-note">${esc(terminationLabel(g))}</span>` : ''
      const acc = review && atEnd && review[color[0]].accuracy != null ? `<span class="bar-acc" title="Accuracy">${Math.round(review[color[0]].accuracy)}%</span>` : ''
      el.innerHTML = `<span class="piece-dot ${color[0]}" aria-hidden="true"></span><a class="name" href="#/player/${esc(p[color].id)}">${esc(p[color].display)}</a><span class="clock-dot" aria-hidden="true"></span>${acc}${note}<span class="pts">${atEnd ? sidePoints(p, color) : ''}</span>`
    }
  }

  function moveButton(m, attrs) {
    const pt = review?.perPly[m.ply]
    const lbl = attrs.includes('data-ply') && pt?.label && LABEL[pt.label].symbol ? pt.label : null
    const sym = lbl ? `<sup>${LABEL[lbl].symbol}</sup>` : ''
    return `<button type="button" ${attrs}${lbl ? ` class="lbl-${lbl}" title="${LABEL[lbl].name}"` : ''}>${esc(m.san)}${sym}</button>`
  }

  /** Ply that ends the move-list row holding the game move the side line replaces. */
  function sideRowEnd() {
    const n = g.moves.length
    const k = Math.min(side.from + 1, n)
    return g.moves[k - 1]?.color === 'w' && k < n ? k + 1 : k
  }

  function drawMoves() {
    let html = ''
    const after = side ? sideRowEnd() : -1
    for (const m of g.moves) {
      if (m.color === 'w') html += `<span class="no">${m.number}.</span>`
      else if (m.ply === 1) html += `<span class="no">${m.number}…</span><span></span>`
      html += moveButton(m, `data-ply="${m.ply}"`)
      if (m.ply === after) html += sideLineHtml()
    }
    if (side && after < 1) html += sideLineHtml()
    html += `<div class="result-row">${esc(resultLabel(g.result) || '*')}<small>${esc(terminationLabel(g))}</small></div>`
    movesEl.innerHTML = html
  }

  function sideLineHtml() {
    const parts = side.moves.map((m, k) => {
      const no = m.color === 'w' ? `${m.number}.` : k === 0 ? `${m.number}…` : ''
      return `${no ? `<span class="no">${no}</span>` : ''}<button type="button" data-side="${k}">${esc(m.san)}</button>`
    })
    return `<div class="side-line"><span class="side-moves">${parts.join(' ')}</span><button type="button" class="btn sm" data-side-exit>${icon.chevronLeft}Back to game</button></div>`
  }

  function current() {
    if (onSide && side && ply > side.from) return movesEl.querySelector(`button[data-side="${ply - side.from - 1}"]`)
    return movesEl.querySelector(`button[data-ply="${ply}"]`)
  }

  function render(animate) {
    board.setPosition(fenAt(ply), animate)
    board.removeMarkers()
    const m = line()[ply - 1]
    if (m) {
      board.addMarker(LASTMOVE, m.from)
      board.addMarker(LASTMOVE, m.to)
      if (m.check) {
        const kingSq = findKing(m.fen, m.color === 'w' ? 'b' : 'w')
        if (kingSq) board.addMarker(CHECK, kingSq)
      }
    }
    for (const b of movesEl.querySelectorAll('button[aria-current]')) b.removeAttribute('aria-current')
    const cur = current()
    if (cur) {
      cur.setAttribute('aria-current', 'true')
      // Scroll only the move list, never the page.
      const top = movesEl.scrollTop + cur.getBoundingClientRect().top - movesEl.getBoundingClientRect().top - movesEl.clientHeight / 2 + cur.clientHeight / 2
      movesEl.scrollTo({ top, behavior: animate ? 'smooth' : 'auto' })
    } else if (ply === 0) {
      movesEl.scrollTo({ top: 0 })
    }
    buttons.first.disabled = buttons.prev.disabled = ply === 0
    buttons.next.disabled = buttons.last.disabled = ply === total()
    announce.textContent = m ? `${m.number}${m.color === 'w' ? '.' : '…'} ${m.san}` : 'Starting position'
    bars()
    reviewView()
    drawArrows()
    runEngine()
    const gamePly = onSide && side ? Math.min(ply, side.from) : ply
    const hash = analysis ? `#/analysis/${p.id}/${gamePly}` : `#/game/${p.id}${ply === g.moves.length ? '' : `/${ply}`}`
    history.replaceState(null, '', hash)
    const back = root.querySelector('[data-back-game]')
    if (back) back.href = `#/game/${p.id}${gamePly === g.moves.length ? '' : `/${gamePly}`}`
  }

  function go(n, animate = Math.abs(n - ply) === 1) {
    const next = Math.max(0, Math.min(total(), n))
    if (next === ply) return
    ply = next
    render(animate)
  }

  // ---------- Review ----------

  function onGameLine() {
    return !(onSide && side && ply > side.from)
  }

  function reviewView() {
    const card = root.querySelector('[data-review]')
    if (!card || !review) return
    const graph = card.querySelector('[data-graph]')
    if (graph && !graph.firstChild) graph.innerHTML = graphSvg(review, Math.min(ply, g.moves.length))
    const gamePly = onGameLine() ? ply : side.from
    moveGraphCursor(graph?.querySelector('svg'), gamePly, g.moves.length)
    const note = card.querySelector('[data-review-note]')
    if (note) note.innerHTML = onGameLine() ? reviewNote(review, g, ply) : 'Your own line · the review covers the game moves.'
    const pt = onGameLine() ? review.perPly[ply] : null
    betterArrow = pt && LABEL[pt.label]?.symbol && pt.better ? parseUci(pt.better) : null
  }

  function setReview(next) {
    review = next
    const card = root.querySelector('[data-review]')
    if (card) {
      card.outerHTML = reviewCardHtml(p, review)
      wireReviewCard()
    }
    drawMoves()
    render(false)
  }

  function wireReviewCard() {
    const card = root.querySelector('[data-review]')
    if (!card) return
    card.querySelector('[data-graph]')?.addEventListener('click', (e) => {
      const svg = e.currentTarget.querySelector('svg')
      if (!svg) return
      const r = svg.getBoundingClientRect()
      const target = Math.round(((e.clientX - r.left) / r.width) * g.moves.length)
      stop()
      onSide = false
      go(target, false)
    })
    card.querySelector('[data-review-generate]')?.addEventListener('click', generateReview)
  }

  async function generateReview(e) {
    const btn = e.currentTarget
    const bar = root.querySelector('[data-review-progress]')
    btn.disabled = true
    btn.textContent = 'Starting Stockfish…'
    bar.hidden = false
    reviewAbort = new AbortController()
    let engine = null
    try {
      engine = await createEngine()
      const openings = ctx.openings ?? await loadOpenings()
      const raw = await analyseGame(g, engine, {
        depth: LOCAL_REVIEW_DEPTH,
        openings,
        signal: reviewAbort.signal,
        onProgress: (done, n) => {
          btn.textContent = `Analysing… ${Math.round((done / n) * 100)}%`
          bar.firstElementChild.style.width = `${(done / n) * 100}%`
        },
      })
      saveLocalReview(p.id, raw.movesHash, raw)
      if (!disposed) setReview(buildReview(g, raw, { source: 'local' }))
    } catch (err) {
      if (!disposed && err.name !== 'AbortError') {
        btn.disabled = false
        btn.textContent = 'Try again'
        bar.hidden = true
        toast(err.message || 'The review failed')
      }
    } finally {
      engine?.terminate()
    }
  }

  // ---------- Engine ----------

  function drawArrows() {
    board.removeArrows()
    if (betterArrow) board.addArrow(ARROW_BETTER, betterArrow.from, betterArrow.to)
    const best = engineOn() && settings.arrow && engineResult?.lines[0]?.pv[0]
    if (best && engineFen === fenAt(ply)) {
      const a = parseUci(best)
      if (!betterArrow || a.from !== betterArrow.from || a.to !== betterArrow.to) board.addArrow(ARROW_ENGINE, a.from, a.to)
    }
  }

  let frameRequested = false
  function showEngine() {
    if (frameRequested) return
    frameRequested = true
    requestAnimationFrame(() => {
      frameRequested = false
      if (disposed || !engineOn()) return
      const fen = fenAt(ply)
      if (engineFen !== fen) return
      linesEl.innerHTML = linesHtml(fen, engineResult, { clickable: analysis })
      updateEvalBar(evalBar, engineResult?.lines[0]?.score, flipped)
      statusEl.textContent = engineResult?.depth ? `depth ${engineResult.depth}${engineResult.done ? '' : ` / ${settings.depth}`}` : 'Thinking…'
      drawArrows()
    })
  }

  async function runEngine() {
    engineCard.classList.toggle('on', engineOn())
    evalBar.hidden = !engineOn()
    root.querySelector('.board-wrap').classList.toggle('with-eval', engineOn())
    if (!engineOn()) {
      stopEngine()
      linesEl.innerHTML = ''
      statusEl.textContent = 'Off'
      engineResult = null
      return
    }
    const fen = fenAt(ply)
    if (engineFen === fen && engineResult?.done) return showEngine()
    if (searchingFen === fen) return
    engineFen = fen
    engineResult = null
    const chess = new Chess(fen)
    if (chess.isGameOver()) {
      const winner = chess.turn() === 'w' ? 'b' : 'w'
      const score = chess.isCheckmate() ? { mate: 0, winner } : { cp: 0 }
      linesEl.innerHTML = `<div class="eline over">${chess.isCheckmate() ? 'Checkmate' : chess.isStalemate() ? 'Stalemate' : 'Draw'}</div>`
      statusEl.textContent = ''
      updateEvalBar(evalBar, score, flipped)
      return
    }
    if (!linesEl.firstChild) statusEl.textContent = 'Loading engine…'
    let engine
    try {
      engine = await getEngine()
    } catch {
      statusEl.textContent = "Couldn't start"
      return
    }
    if (disposed || engineFen !== fen || !engineOn()) return
    searchingFen = fen
    const token = ++searchToken
    const res = await engine.go(fen, {
      depth: settings.depth,
      multiPv: settings.lines,
      onInfo: (info) => {
        if (engineFen !== fen) return
        engineResult = info
        showEngine()
      },
    })
    if (token === searchToken) searchingFen = null
    if (!res.cancelled && engineFen === fen && !disposed) {
      engineResult = { ...res, done: true }
      showEngine()
    }
  }

  function restartEngine() {
    engineFen = null
    searchingFen = null
    engineResult = null
    runEngine()
  }

  engineCard.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.eng === 'arrow') {
      settings.arrow = !settings.arrow
      b.setAttribute('aria-pressed', String(settings.arrow))
      saveSettings(settings)
      drawArrows()
    } else if (b.dataset.eng === 'settings') {
      const panel = engineCard.querySelector('[data-eng-settings]')
      panel.hidden = !panel.hidden
      b.setAttribute('aria-expanded', String(!panel.hidden))
    } else if (b.dataset.engLinesN) {
      settings.lines = Number(b.dataset.engLinesN)
      for (const x of engineCard.querySelectorAll('[data-eng-lines-n]')) x.setAttribute('aria-pressed', String(x === b))
      saveSettings(settings)
      restartEngine()
    } else if (b.dataset.pvLine != null) {
      playLine(engineResult.lines[Number(b.dataset.pvLine)].pv.slice(0, Number(b.dataset.pvK) + 1))
    }
  })
  engineCard.addEventListener('change', (e) => {
    if (e.target.dataset.eng === 'enabled') {
      settings.enabled = e.target.checked
      saveSettings(settings)
      restartEngine()
      drawArrows()
    } else if (e.target.dataset.eng === 'depth') {
      settings.depth = Number(e.target.value)
      saveSettings(settings)
      restartEngine()
    }
  })

  // ---------- Making moves (analysis) ----------

  function playMove(uci) {
    const fen = fenAt(ply)
    const chess = new Chess(fen)
    const u = parseUci(uci)
    let mv
    try {
      mv = chess.move({ from: u.from, to: u.to, promotion: u.promotion ?? undefined })
    } catch {
      return false
    }
    const cur = line()
    const next = cur[ply]
    if (next && next.from === mv.from && next.to === mv.to && (next.promotion ?? null) === (mv.promotion ?? null)) {
      ply++
      return true
    }
    const move = {
      ply: ply + 1, number: Number(fen.split(' ')[5]), color: mv.color, san: mv.san, from: mv.from, to: mv.to,
      promotion: mv.promotion ?? null, check: /[+#]/.test(mv.san), fen: mv.after,
    }
    if (onSide && side && ply >= side.from) side = { from: side.from, moves: [...side.moves.slice(0, ply - side.from), move] }
    else side = { from: ply, moves: [move] }
    onSide = true
    ply++
    return true
  }

  function playLine(ucis) {
    stop()
    for (const u of ucis) if (!playMove(u)) break
    drawMoves()
    render(ucis.length === 1)
  }

  let pendingMove = null
  if (analysis) {
    board.enableMoveInput((event) => {
      switch (event.type) {
        case INPUT_EVENT_TYPE.moveInputStarted: {
          const chess = new Chess(fenAt(ply))
          return chess.moves({ square: event.squareFrom }).length > 0
        }
        case INPUT_EVENT_TYPE.validateMoveInput: {
          const chess = new Chess(fenAt(ply))
          const legal = chess.moves({ square: event.squareFrom, verbose: true }).filter((m) => m.to === event.squareTo)
          if (!legal.length) return false
          if (legal.some((m) => m.promotion)) {
            board.showPromotionDialog(event.squareTo, chess.turn() === 'w' ? COLOR.white : COLOR.black, (result) => {
              if (result.type === PROMOTION_DIALOG_RESULT_TYPE.pieceSelected) playLine([event.squareFrom + event.squareTo + result.piece.charAt(1)])
              else board.setPosition(fenAt(ply), true)
            })
            return true
          }
          pendingMove = event.squareFrom + event.squareTo
          return true
        }
        case INPUT_EVENT_TYPE.moveInputFinished:
          if (pendingMove) {
            const u = pendingMove
            pendingMove = null
            // Let the board finish its own move before it is redrawn.
            setTimeout(() => { if (!disposed) playLine([u]) })
          }
          return undefined
        default:
          return undefined
      }
    })
  }

  // ---------- Navigation ----------

  function stop() {
    clearInterval(timer)
    timer = null
    buttons.play.setAttribute('aria-pressed', 'false')
    buttons.play.innerHTML = icon.play
  }

  function play() {
    if (timer) return stop()
    if (ply === total()) go(0, false)
    buttons.play.setAttribute('aria-pressed', 'true')
    buttons.play.innerHTML = icon.pause
    timer = setInterval(() => {
      if (ply >= total()) return stop()
      go(ply + 1)
    }, 1000)
  }

  function flip() {
    flipped = !flipped
    board.setOrientation(flipped ? COLOR.black : COLOR.white, false)
    bars()
    if (engineResult && engineOn()) updateEvalBar(evalBar, engineResult.lines[0]?.score, flipped)
    evalBar.classList.toggle('flipped', flipped)
  }

  root.querySelector('.controls').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav-go]')
    if (!b) return
    const action = b.dataset.navGo
    if (action !== 'play') stop()
    if (action === 'first') go(0)
    else if (action === 'prev') go(ply - 1)
    else if (action === 'next') go(ply + 1)
    else if (action === 'last') go(total())
    else if (action === 'flip') flip()
    else if (action === 'play') play()
  })

  movesEl.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    stop()
    if (b.dataset.ply != null) {
      const n = Number(b.dataset.ply)
      if (onSide && side && n > side.from) onSide = false
      const animate = Math.abs(n - ply) === 1
      ply = n
      render(animate)
    } else if (b.dataset.side != null) {
      onSide = true
      go(side.from + Number(b.dataset.side) + 1)
    } else if (b.hasAttribute('data-side-exit')) {
      const back = side.from
      side = null
      onSide = false
      ply = back
      drawMoves()
      render(false)
    }
  })

  const filename = `${slug(`${p.white.last}-${p.black.last}`)}-r${p.round}.pgn`
  root.querySelector('.actions')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]')
    if (!b) return
    if (b.dataset.act === 'analyze') { b.href = `#/analysis/${p.id}/${ply}`; return }
    if (b.dataset.act === 'copy') copyText(p.pgnText, 'PGN copied')
    else if (b.dataset.act === 'download') { download(filename, p.pgnText, 'application/x-chess-pgn'); toast('PGN downloaded') }
    else if (b.dataset.act === 'link') {
      const url = `${location.origin}${location.pathname}#/game/${p.id}${ply === g.moves.length ? '' : `/${ply}`}`
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        navigator.share({ title: `${p.white.display} – ${p.black.display}`, url }).catch(() => {})
      } else copyText(url, 'Link copied')
    }
  })

  const onKey = (e) => {
    if (e.target.closest?.('input, select, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
    if (board.isPromotionDialogShown?.()) return
    const map = { ArrowLeft: () => go(ply - 1), ArrowRight: () => go(ply + 1), Home: () => go(0), End: () => go(total()), f: flip, F: flip, ' ': play }
    const fn = map[e.key]
    if (!fn) return
    if (e.target.closest?.('button') && e.key === ' ') return
    e.preventDefault()
    if (e.key !== ' ') stop()
    fn()
  }
  document.addEventListener('keydown', onKey)

  // Horizontal swipe on the board steps through the moves (not in analysis, where you drag pieces).
  if (!analysis) {
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
  }

  wireReviewCard()
  drawMoves()
  render(false)

  return () => {
    disposed = true
    stop()
    reviewAbort?.abort()
    stopEngine()
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
