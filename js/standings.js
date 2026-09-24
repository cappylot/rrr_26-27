// Standings and tiebreaks. Mirrors ChessManager's TiebreakEngine (FIDE Handbook C.07) so the
// website and the app always agree on the order:
//   * group by score, then split each tied group by each tiebreak in turn;
//   * Direct Encounter is evaluated inside the tied group only, and only when every member of
//     the group has played every other member (otherwise it's 0 for all of them);
//   * LOT (drawing of lots) is the pairing number, lowest first, so ranks are always unique.
// Pure — no DOM.

import { cardsByPlayer } from './tournament.js'

const EPS = 1e-9
const eq = (a, b) => Math.abs(a - b) < EPS

export const TIEBREAKS = {
  SB: { name: 'Sonneborn-Berger', short: 'SB' },
  DE: { name: 'Direct encounter', short: 'DE' },
  WIN: { name: 'Number of wins', short: 'WIN' },
  WON: { name: 'Games won over the board', short: 'WON' },
  BWG: { name: 'Wins with Black', short: 'BWG' },
  BLK: { name: 'Games with Black', short: 'BLK' },
  BH: { name: 'Buchholz', short: 'BH' },
  CUM: { name: 'Cumulative score', short: 'CUM' },
  LOT: { name: 'Drawing of lots (pairing number)', short: 'LOT' },
}

export function computeStandings(model) {
  const { scoring, totalRounds, tiebreaks } = model.meta
  const cards = cardsByPlayer(model)
  const score = new Map()
  for (const p of model.players) score.set(p.id, sum(cards.get(p.id).map((c) => c.points)))

  const byeCap = scoring.draw * totalRounds

  /** Per-round contribution to Buchholz / SB (FIDE Art. 16.4). */
  const contributions = (id) => cards.get(id).map((c) => {
    if (c.category === 'played') return { card: c, value: score.get(c.opponent) ?? 0 }
    const cap = c.category === 'bye' ? byeCap : (score.get(c.opponent) ?? byeCap)
    return { card: c, value: Math.min(score.get(id), cap) }
  })

  const played = (id) => cards.get(id).filter((c) => c.category === 'played')

  const value = {
    SB: (id) => sum(contributions(id).map((x) => x.card.points * x.value)),
    BH: (id) => sum(contributions(id).map((x) => x.value)),
    WIN: (id) => cards.get(id).filter((c) =>
      c.category === 'forfeitWin' || ((c.category === 'played' || c.category === 'bye') && eq(c.points, scoring.win) && c.points > 0)).length,
    WON: (id) => played(id).filter((c) => eq(c.points, scoring.win)).length,
    BWG: (id) => played(id).filter((c) => c.color === 'b' && eq(c.points, scoring.win)).length,
    BLK: (id) => played(id).filter((c) => c.color === 'b').length,
    CUM: (id) => {
      let running = 0
      let total = 0
      for (const c of cards.get(id)) { running += c.points; total += running }
      return total
    },
    LOT: (id) => model.playerById.get(id).seat,
  }

  const directEncounter = (id, group) => {
    const valid = group.every((a) => {
      const opps = new Set(played(a).map((c) => c.opponent))
      return group.every((b) => b === a || opps.has(b))
    })
    if (!valid) return 0
    const others = new Set(group.filter((g) => g !== id))
    return sum(played(id).filter((c) => others.has(c.opponent)).map((c) => c.points))
  }

  // Returns rank-ordered subgroups; `by` is the tiebreak that separated a subgroup from the next.
  const refine = (group, i) => {
    if (group.length < 2 || i >= tiebreaks.length) return [{ ids: group, by: null }]
    const method = tiebreaks[i]
    if (method === 'LOT') {
      return [...group].sort((a, b) => value.LOT(a) - value.LOT(b)).map((id) => ({ ids: [id], by: 'LOT' }))
    }
    const fn = method === 'DE' ? (id) => directEncounter(id, group) : value[method]
    if (!fn) return refine(group, i + 1)
    const valued = group.map((id) => ({ id, v: fn(id) })).sort((a, b) => b.v - a.v)
    const subgroups = []
    for (const item of valued) {
      const last = subgroups.at(-1)
      if (last && eq(last.v, item.v)) last.ids.push(item.id)
      else subgroups.push({ v: item.v, ids: [item.id] })
    }
    return subgroups.flatMap((sg, k) => {
      const parts = refine(sg.ids, i + 1)
      parts.at(-1).by = k < subgroups.length - 1 ? method : null
      return parts
    })
  }

  // Group by score (desc), seat order as a stable starting point.
  const ids = [...model.players].sort((a, b) => a.seat - b.seat).map((p) => p.id)
  ids.sort((a, b) => score.get(b) - score.get(a))
  const groups = []
  for (const id of ids) {
    const last = groups.at(-1)
    if (last && eq(score.get(last[0]), score.get(id))) last.push(id)
    else groups.push([id])
  }
  const ordered = groups.flatMap((g) => {
    const parts = refine(g, 0)
    parts.at(-1).by = null // the next group has a different score
    return parts
  })

  const rows = []
  let rank = 1
  for (const { ids: sub, by } of ordered) {
    sub.forEach((id, offset) => {
      const list = cards.get(id)
      const playedList = played(id)
      const tb = {}
      for (const m of tiebreaks) tb[m] = m === 'DE' ? null : (value[m]?.(id) ?? null)
      rows.push({
        player: model.playerById.get(id),
        rank,
        tiedWithNext: offset < sub.length - 1,
        // Tiebreak that put this player above the next one on the same score (null otherwise).
        decidedBy: offset === sub.length - 1 ? by : null,
        score: score.get(id),
        played: playedList.length,
        finished: list.length,
        wins: list.filter((c) => c.points > 0 && eq(c.points, scoring.win)).length,
        draws: list.filter((c) => eq(c.points, scoring.draw) && c.category !== 'bye').length,
        losses: list.filter((c) => c.category !== 'bye' && eq(c.points, scoring.loss) && !eq(scoring.loss, scoring.draw)).length,
        tiebreaks: tb,
        cards: list,
      })
    })
    rank += sub.length
  }
  return rows
}

/**
 * Round-robin cross-table in rank order. cell(i, j) = what row player i scored against column
 * player j: a number, 'live' for a game still being played, 'self' on the diagonal, or null.
 */
export function crossTable(model, rows = computeStandings(model)) {
  const order = rows.map((r) => r.player.id)
  const index = new Map(order.map((id, i) => [id, i]))
  const cells = order.map((id) => order.map((other) => (id === other ? { kind: 'self' } : null)))
  for (const p of model.pairings) {
    if (!p.white || !p.black) continue
    const w = index.get(p.white.id)
    const b = index.get(p.black.id)
    if (w == null || b == null) continue
    if (!p.finished) {
      cells[w][b] = { kind: 'live', pairing: p }
      cells[b][w] = { kind: 'live', pairing: p }
      continue
    }
    const forfeit = p.category === 'forfeit'
    cells[w][b] = { kind: 'result', points: p.points.white, color: 'w', forfeit, pairing: p }
    cells[b][w] = { kind: 'result', points: p.points.black, color: 'b', forfeit, pairing: p }
  }
  return { rows, cells }
}

function sum(values) {
  return values.reduce((a, b) => a + (b ?? 0), 0)
}
