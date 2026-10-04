// Game review maths: evaluations → win chances → per-move accuracy, labels and game accuracy.
// Follows Lichess (lila's WinPercent / AccuracyPercent and its ?! ? ?? thresholds) so the figures
// feel familiar. Pure — runs in Node too.
//
// A review starts from a raw analysis file (data/analysis/<id>.json), which only stores what the
// engine said: one evaluation per position, White's point of view. Everything below is derived
// when the site loads, so tweaking a formula never needs the games to be analysed again.

import { positionKey } from './pgn.js'

export const REVIEW_VERSION = 1

/** Evaluations beyond ±10 pawns (and every mate) count as fully winning, as on Lichess. */
const CP_CEILING = 1000

export const LABEL = {
  book: { name: 'Book', symbol: '' },
  best: { name: 'Best move', symbol: '' },
  inaccuracy: { name: 'Inaccuracy', symbol: '?!' },
  mistake: { name: 'Mistake', symbol: '?' },
  blunder: { name: 'Blunder', symbol: '??' },
}

/**
 * Centipawns (White's view) for an engine score; mates become ±CP_CEILING. A checkmated position
 * is `{ mate: 0, winner: 'w' | 'b' }`.
 */
export function scoreToCp(score) {
  if (score.mate === 0) return score.winner === 'b' ? -CP_CEILING : CP_CEILING
  if (score.mate != null) return score.mate > 0 ? CP_CEILING : -CP_CEILING
  return Math.max(-CP_CEILING, Math.min(CP_CEILING, score.cp))
}

/** White's chance of winning, 0–100, from centipawns (Lichess' fitted sigmoid). */
export function winPercent(cp) {
  const c = Math.max(-CP_CEILING, Math.min(CP_CEILING, cp))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1)
}

/** Accuracy of one move from the mover's win% before and after it. */
export function moveAccuracy(before, after) {
  if (after >= before) return 100
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411
  return Math.max(0, Math.min(100, raw + 1))
}

/** Label for a drop in the mover's win% (Lichess: 0.1 / 0.2 / 0.3 in winning chances). */
export function classify(drop) {
  if (drop >= 15) return 'blunder'
  if (drop >= 10) return 'mistake'
  if (drop >= 5) return 'inaccuracy'
  return null
}

/**
 * Game accuracy for both sides (Lichess): each move's accuracy is weighted by how volatile the
 * position was around it; a side's figure is the mean of that weighted mean and the harmonic mean.
 * `cps` holds White-view centipawns for every position, starting position included.
 */
export function gameAccuracy(cps, firstMover = 'w') {
  const wins = cps.map(winPercent)
  const moves = wins.length - 1
  if (moves < 1) return { w: null, b: null }
  const size = Math.max(2, Math.min(8, Math.floor(moves / 10)))
  const windows = []
  for (let i = 0; i < size - 2; i++) windows.push(wins.slice(0, size))
  for (let i = 0; i + size <= wins.length; i++) windows.push(wins.slice(i, i + size))
  const weights = windows.map((xs) => Math.max(0.5, Math.min(12, stdDev(xs))))

  const per = { w: [], b: [] }
  for (let i = 0; i < moves; i++) {
    const color = (i % 2 === 0) === (firstMover === 'w') ? 'w' : 'b'
    const [before, after] = color === 'w' ? [wins[i], wins[i + 1]] : [100 - wins[i], 100 - wins[i + 1]]
    per[color].push({ acc: moveAccuracy(before, after), weight: weights[i] ?? weights.at(-1) })
  }
  const side = (xs) => {
    if (!xs.length) return null
    const weighted = xs.reduce((s, x) => s + x.acc * x.weight, 0) / xs.reduce((s, x) => s + x.weight, 0)
    const harmonic = xs.length / xs.reduce((s, x) => s + 1 / Math.max(1, x.acc), 0)
    return (weighted + harmonic) / 2
  }
  return { w: side(per.w), b: side(per.b) }
}

function stdDev(xs) {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
}

/** Stable fingerprint of a game's moves, so a stale analysis file is never shown. */
export function movesHash(game) {
  const text = game.moves.map((m) => m.from + m.to + (m.promotion ?? '')).join(' ')
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Number of leading plies that stay inside the ECO table. */
export function bookPlies(game, table) {
  if (!table) return 0
  let n = 0
  for (const m of game.moves.slice(0, 40)) {
    if (!table[positionKey(m.fen)]) break
    n = m.ply
  }
  return n
}

/** "e2e4" → { from, to, promotion }. */
export function parseUci(uci) {
  return uci ? { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? null } : null
}

/**
 * Turn a raw analysis into what the views show. Returns null when the file doesn't fit the game.
 * perPly[i] describes the move with ply i (index 0 is the starting position, with no move).
 */
export function buildReview(game, raw, { source = 'site' } = {}) {
  if (!raw || raw.movesHash !== movesHash(game) || raw.evals?.length !== game.moves.length + 1) return null
  // A checkmated position has no engine score: the side that just moved has won.
  const evals = raw.evals.map((e, i) => (e.mate === 0 ? { mate: 0, winner: game.moves[i - 1]?.color ?? 'w' } : { cp: e.cp, mate: e.mate }))
  const cps = evals.map(scoreToCp)
  const wins = cps.map(winPercent)
  const book = raw.book ?? 0

  const sides = {
    w: { accuracy: null, acpl: 0, inaccuracy: 0, mistake: 0, blunder: 0, moves: 0 },
    b: { accuracy: null, acpl: 0, inaccuracy: 0, mistake: 0, blunder: 0, moves: 0 },
  }
  const perPly = [{ eval: evals[0], cp: cps[0], win: wins[0], best: raw.evals[0].best ?? null, pv: raw.evals[0].pv ?? null }]
  for (const m of game.moves) {
    const i = m.ply
    const sign = m.color === 'w' ? 1 : -1
    const before = m.color === 'w' ? wins[i - 1] : 100 - wins[i - 1]
    const after = m.color === 'w' ? wins[i] : 100 - wins[i]
    const prev = raw.evals[i - 1]
    const played = m.from + m.to + (m.promotion ?? '')
    const isBest = prev.best === played
    let label = null
    if (i <= book) label = 'book'
    else if (isBest) label = 'best'
    else label = classify(before - after)

    const s = sides[m.color]
    s.moves++
    s.acpl += Math.max(0, sign * (cps[i - 1] - cps[i]))
    if (label in s) s[label]++
    perPly.push({
      eval: evals[i],
      cp: cps[i],
      win: wins[i],
      best: raw.evals[i].best ?? null,
      pv: raw.evals[i].pv ?? null,
      label,
      accuracy: moveAccuracy(before, after),
      // What the engine wanted instead of the move played (the position before it).
      better: isBest ? null : prev.best ?? null,
      betterPv: isBest ? null : prev.pv ?? null,
    })
  }
  const acc = gameAccuracy(cps, game.moves[0]?.color ?? 'w')
  for (const c of ['w', 'b']) {
    sides[c].accuracy = acc[c]
    sides[c].acpl = sides[c].moves ? Math.round(sides[c].acpl / sides[c].moves) : null
  }
  return { source, engine: raw.engine, depth: raw.depth, book, perPly, w: sides.w, b: sides.b }
}

/** Eval as people read it: "+0.35", "−1.20", "#3", "#−2". White's point of view. */
export function formatEval(score) {
  if (!score) return ''
  if (score.mate != null) {
    if (score.mate === 0) return score.winner === 'b' ? '0–1' : '1–0'
    return `#${score.mate < 0 ? '−' : ''}${Math.abs(score.mate)}`
  }
  const v = score.cp / 100
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`
}
