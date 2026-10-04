// Engine and review pieces of the game viewer: eval bar, engine lines, review card, eval graph.
// These return HTML strings or update elements in place; the viewer wires up the behaviour.

import { esc, plural } from './format.js'
import { icon } from './ui.js'
import { LABEL, formatEval, scoreToCp, winPercent } from './review.js'
import { uciToSan } from './analyse.js'

export const DEPTHS = [16, 18, 20, 22, 26, 30]

export function evalBarHtml() {
  return `<div class="eval-bar" data-evalbar hidden aria-hidden="true"><span class="eval-fill"></span><span class="eval-num"></span></div>`
}

/** White's share of the bar for a score; a decided game fills it completely. */
export function updateEvalBar(el, score, flipped) {
  if (!el) return
  el.classList.toggle('flipped', flipped)
  if (!score) {
    el.style.setProperty('--white', '50%')
    el.querySelector('.eval-num').textContent = ''
    return
  }
  const white = winPercent(scoreToCp(score))
  el.style.setProperty('--white', `${white}%`)
  const num = el.querySelector('.eval-num')
  num.textContent = shortEval(score)
  num.classList.toggle('on-white', white >= 50)
}

function shortEval(score) {
  if (score.mate === 0) return score.winner === 'b' ? '0–1' : '1–0'
  if (score.mate != null) return `M${Math.abs(score.mate)}`
  const v = Math.abs(score.cp / 100)
  return v >= 10 ? v.toFixed(0) : v.toFixed(1)
}

export function engineCardHtml({ analysis, settings }) {
  const on = analysis || settings.enabled
  const head = analysis
    ? '<h2>Stockfish</h2>'
    : `<label class="switch"><input type="checkbox" data-eng="enabled" ${on ? 'checked' : ''}><span class="track" aria-hidden="true"></span><span>Engine</span></label>`
  return `
  <div class="card engine-card ${on ? 'on' : ''}" data-engine>
    <div class="engine-head">
      ${head}
      <span class="engine-status" data-eng-status>${on ? '' : 'Off'}</span>
      <button type="button" class="icon-btn sm" data-eng="arrow" aria-pressed="${settings.arrow}" aria-label="Show best-move arrow" title="Best-move arrow">${icon.arrow}</button>
      <button type="button" class="icon-btn sm" data-eng="settings" aria-expanded="false" aria-label="Engine settings" title="Settings">${icon.gear}</button>
    </div>
    <div class="engine-settings" data-eng-settings hidden>
      <div class="seg-field"><span>Lines</span>
        <div class="segmented" role="group" aria-label="Number of engine lines">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-eng-lines-n="${n}" aria-pressed="${settings.lines === n}">${n}</button>`).join('')}
        </div>
      </div>
      <label class="seg-field"><span>Depth</span>
        <select class="select sm" data-eng="depth">
          ${DEPTHS.map((d) => `<option value="${d}" ${settings.depth === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="engine-lines" data-eng-lines></div>
  </div>`
}

/** Engine lines as SAN. In analysis mode each move is a button that plays the line up to it. */
export function linesHtml(fen, result, { clickable, maxPlies = 12 } = {}) {
  if (!result?.lines?.length) return ''
  return result.lines.map((line, j) => {
    const moves = uciToSan(fen, line.pv.slice(0, maxPlies))
    const parts = moves.map((m, k) => {
      const no = m.color === 'w' ? `${m.number}.` : k === 0 ? `${m.number}…` : ''
      const label = `${no ? `<span class="no">${no}</span>` : ''}${esc(m.san)}`
      return clickable
        ? `<button type="button" data-pv-line="${j}" data-pv-k="${k}">${label}</button>`
        : `<span>${label}</span>`
    })
    return `<div class="eline"><span class="escore ${scoreClass(line.score)}">${esc(formatEval(line.score))}</span><span class="epv">${parts.join(' ')}</span></div>`
  }).join('')
}

function scoreClass(score) {
  const cp = scoreToCp(score)
  return cp > 30 ? 'adv-w' : cp < -30 ? 'adv-b' : ''
}

/** "Game review" card, or the button to generate one when the site has none yet. */
export function reviewCardHtml(p, review) {
  if (!review) {
    return `
    <div class="card review-card" data-review>
      <div class="card-head"><h2>Game review</h2></div>
      <div class="review-empty">
        <p>No review for this game yet. One is added automatically soon after the game is published,
        or you can run Stockfish here in your browser (about a minute).</p>
        <button type="button" class="btn btn-primary" data-review-generate>${icon.analyze}Generate review</button>
        <div class="progress" data-review-progress hidden><span></span></div>
      </div>
    </div>`
  }
  const hint = review.source === 'local'
    ? 'Generated in your browser · not counted in stats'
    : `${esc(review.engine ?? 'Stockfish')} · depth ${review.depth}`
  const side = (color, c) => `
    <div class="acc-side">
      <span class="who"><span class="piece-dot ${c}" aria-hidden="true"></span>${esc(p[color].short)}</span>
      <span class="acc"><b>${accuracyText(review[c].accuracy)}</b><small>accuracy</small></span>
      <span class="counts">
        ${count('inaccuracy', review[c].inaccuracy)}${count('mistake', review[c].mistake)}${count('blunder', review[c].blunder)}
      </span>
      <span class="acpl" title="Average centipawn loss">ACPL ${review[c].acpl ?? '–'}</span>
    </div>`
  return `
  <div class="card review-card" data-review>
    <div class="card-head"><h2>Game review</h2><span class="hint">${hint}</span></div>
    <div class="acc-row">${side('white', 'w')}${side('black', 'b')}</div>
    <div class="graph-wrap" data-graph></div>
    <p class="review-note" data-review-note aria-live="polite"></p>
  </div>`
}

export function accuracyText(a) {
  return a == null ? '–' : `${Math.round(a)}%`
}

function count(label, n) {
  return `<span class="cnt lbl-${label}" title="${esc(plural(n, LABEL[label].name.toLowerCase()))}"><b>${n}</b> ${LABEL[label].symbol}</span>`
}

/** Win-chance graph over the game. White's share is the filled area. */
export function graphSvg(review, ply) {
  const pts = review.perPly
  const n = pts.length - 1
  if (n < 1) return ''
  const W = 600
  const H = 110
  const x = (i) => (i / n) * W
  const y = (i) => H - (pts[i].win / 100) * H
  let d = `M0 ${H} `
  for (let i = 0; i <= n; i++) d += `L${x(i).toFixed(1)} ${y(i).toFixed(1)} `
  d += `L${W} ${H} Z`
  const dots = pts.map((pt, i) => (['inaccuracy', 'mistake', 'blunder'].includes(pt.label)
    ? `<circle class="dot lbl-${pt.label}" cx="${x(i).toFixed(1)}" cy="${y(i).toFixed(1)}" r="4.5"/>` : '')).join('')
  return `<svg class="eval-graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evaluation graph. Click to jump to a move." data-graph-svg>
    <rect class="bg" width="${W}" height="${H}"/>
    <path class="area" d="${d}"/>
    <line class="mid" x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}"/>
    <line class="cursor" x1="${x(ply)}" x2="${x(ply)}" y1="0" y2="${H}" data-graph-cursor/>
    ${dots}
  </svg>`
}

export function moveGraphCursor(svg, ply, total) {
  const line = svg?.querySelector('[data-graph-cursor]')
  if (!line || !total) return
  const v = (Math.min(ply, total) / total) * 600
  line.setAttribute('x1', v)
  line.setAttribute('x2', v)
}

/** One sentence about the move just played: its label, and the better move if there was one. */
export function reviewNote(review, game, ply) {
  if (!review) return ''
  const pt = review.perPly[ply]
  if (!pt) return ''
  if (ply === 0) return `Starting position · ${esc(formatEval(pt.eval))}`
  const m = game.moves[ply - 1]
  const moveName = `${m.number}${m.color === 'w' ? '.' : '…'} ${esc(m.san)}`
  const evalText = `<span class="muted">${esc(formatEval(pt.eval))}</span>`
  if (pt.label === 'book') return `<b class="lbl-book">Book move</b> · ${moveName} ${evalText}`
  if (pt.label === 'best') return `<b class="lbl-best">Best move</b> · ${moveName} ${evalText}`
  if (LABEL[pt.label]?.symbol) {
    const prev = review.perPly[ply - 1]
    const before = ply > 1 ? game.moves[ply - 2].fen : game.startFen
    const better = pt.better ? uciToSan(before, [pt.better])[0] : null
    const alt = better ? ` Best was <b>${esc(better.san)}</b> <span class="muted">(${esc(formatEval(prev.eval))})</span>.` : ''
    return `<b class="lbl-${pt.label}">${LABEL[pt.label].name} ${LABEL[pt.label].symbol}</b> · ${moveName} ${evalText}.${alt}`
  }
  return `${moveName} ${evalText}`
}
