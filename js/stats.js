// Aggregate statistics over finished games. Results come from tournament.json (so a game without
// a PGN still counts); move-based figures come from the games that have a PGN. Pure — no DOM.

import { classifyOpening, openingFamily } from './pgn.js'

export function computeStats(model, standingsRows, openingsTable = null) {
  const played = model.pairings.filter((p) => p.category === 'played')
  const withGame = played.filter((p) => p.game)

  const results = { white: 0, draw: 0, black: 0 }
  for (const p of played) {
    if (p.result === '1-0') results.white++
    else if (p.result === '0-1') results.black++
    else results.draw++
  }
  const n = played.length
  const whitePoints = played.reduce((s, p) => s + p.points.white, 0)
  const maxPoints = n * model.meta.scoring.win

  const lengths = withGame.map((p) => ({ pairing: p, moves: p.game.fullMoves, plies: p.game.plies }))
  lengths.sort((a, b) => b.plies - a.plies || a.pairing.round - b.pairing.round || a.pairing.board - b.pairing.board)
  const decisiveLengths = lengths.filter((l) => l.pairing.result !== '1/2-1/2')

  const terminations = countBy(withGame, (p) => p.game.termination)

  const firstMoves = countBy(withGame.filter((p) => p.game.moves[0]), (p) => p.game.moves[0].san)
  const replies = countBy(withGame.filter((p) => p.game.moves[1]), (p) => `${p.game.moves[0].san} ${p.game.moves[1].san}`)

  const openings = new Map()
  for (const p of withGame) {
    const o = p.opening ?? classifyOpening(p.game, openingsTable)
    const key = o ? o.name : 'Unclassified'
    const entry = openings.get(key) ?? { name: key, eco: o?.eco ?? '', family: o ? openingFamily(o.name) : 'Unclassified', games: [] }
    entry.games.push(p)
    openings.set(key, entry)
  }

  const castling = { w: { 'O-O': 0, 'O-O-O': 0, none: 0 }, b: { 'O-O': 0, 'O-O-O': 0, none: 0 } }
  for (const p of withGame) {
    for (const side of ['w', 'b']) castling[side][p.game.castling[side]?.type ?? 'none']++
  }

  const totals = {
    moves: withGame.reduce((s, p) => s + p.game.fullMoves, 0),
    plies: withGame.reduce((s, p) => s + p.game.plies, 0),
    captures: withGame.reduce((s, p) => s + p.game.captures, 0),
    checks: withGame.reduce((s, p) => s + p.game.checks, 0),
  }

  const players = standingsRows.map((row) => {
    const byColor = { w: { games: 0, points: 0 }, b: { games: 0, points: 0 } }
    for (const c of row.cards) {
      if (c.category !== 'played') continue
      byColor[c.color].games++
      byColor[c.color].points += c.points
    }
    const games = row.cards.filter((c) => c.category === 'played' && c.pairing.game)
    return {
      row,
      byColor,
      avgMoves: games.length ? games.reduce((s, c) => s + c.pairing.game.fullMoves, 0) / games.length : null,
    }
  })

  return {
    finished: n,
    scheduled: model.pairings.filter((p) => p.black).length,
    withPgn: withGame.length,
    results,
    decisiveShare: n ? (results.white + results.black) / n : null,
    whiteScore: maxPoints ? whitePoints / maxPoints : null,
    avgMoves: withGame.length ? totals.moves / withGame.length : null,
    totals,
    lengths,
    shortestDecisive: decisiveLengths.at(-1) ?? null,
    longest: lengths[0] ?? null,
    terminations,
    firstMoves,
    replies,
    openings: [...openings.values()].sort((a, b) => b.games.length - a.games.length || a.name.localeCompare(b.name)),
    castling,
    players,
  }
}

/** [{ key, count }] sorted by count desc, then key. */
function countBy(items, keyFn) {
  const m = new Map()
  for (const it of items) {
    const k = keyFn(it)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)))
}
