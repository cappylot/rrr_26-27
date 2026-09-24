// Turns data/tournament.json into the model every view reads, and checks it for mistakes.
// Pure (no DOM, no fetch) so the same code runs in the browser and in `node --test`.

import { displayName, lastName, initials } from './format.js'

const PLAYED = new Set(['1-0', '0-1', '1/2-1/2'])
const FORFEITS = new Set(['+-', '-+', '--'])

/** Points and category for one pairing, from White's and Black's side. */
export function outcome(result, scoring, isBye) {
  const { win = 1, draw = 0.5, loss = 0, bye = 0 } = scoring ?? {}
  if (isBye) return { category: 'bye', white: bye, black: null }
  switch (result) {
    case '1-0': return { category: 'played', white: win, black: loss }
    case '0-1': return { category: 'played', white: loss, black: win }
    case '1/2-1/2': return { category: 'played', white: draw, black: draw }
    case '+-': return { category: 'forfeit', white: win, black: loss }
    case '-+': return { category: 'forfeit', white: loss, black: win }
    case '--': return { category: 'forfeit', white: loss, black: loss }
    default: return { category: 'pending', white: null, black: null }
  }
}

export function buildModel(json) {
  const problems = []
  const scoring = { win: 1, draw: 0.5, loss: 0, bye: 0, ...(json.scoring ?? {}) }

  const players = (json.players ?? []).map((p, i) => ({
    id: String(p.id),
    name: String(p.name ?? p.id),
    display: displayName(String(p.name ?? p.id)),
    last: lastName(String(p.name ?? p.id)),
    initials: initials(String(p.name ?? p.id)),
    seat: Number.isFinite(p.seat) ? p.seat : i + 1,
    rating: Number.isFinite(p.rating) ? p.rating : null,
    federation: p.federation ?? null,
  }))
  // Short label for tight spots: the surname, plus an initial when two players share it.
  const surnames = new Map()
  for (const p of players) surnames.set(p.last, (surnames.get(p.last) ?? 0) + 1)
  for (const p of players) p.short = surnames.get(p.last) > 1 ? `${p.display[0]}. ${p.last}` : p.last

  const playerById = new Map()
  for (const p of players) {
    if (playerById.has(p.id)) problems.push(`Player id "${p.id}" is used twice.`)
    playerById.set(p.id, p)
  }
  const seats = new Set()
  for (const p of players) {
    if (seats.has(p.seat)) problems.push(`Seat ${p.seat} is given to more than one player.`)
    seats.add(p.seat)
  }

  const met = new Set()
  const rounds = [...(json.rounds ?? [])]
    .sort((a, b) => a.number - b.number)
    .map((r) => {
      const inRound = new Set()
      const boards = new Set()
      const pairings = [...(r.pairings ?? [])]
        .sort((a, b) => a.board - b.board)
        .map((p) => {
          const id = `r${r.number}-b${p.board}`
          const isBye = p.black == null
          const result = isBye ? 'bye' : String(p.result ?? '*')
          if (boards.has(p.board)) problems.push(`Round ${r.number}: board ${p.board} appears twice.`)
          boards.add(p.board)
          for (const side of isBye ? [p.white] : [p.white, p.black]) {
            if (!playerById.has(side)) problems.push(`Round ${r.number}, board ${p.board}: unknown player "${side}".`)
            if (inRound.has(side)) problems.push(`Round ${r.number}: "${side}" is paired twice.`)
            inRound.add(side)
          }
          if (!isBye && !PLAYED.has(result) && !FORFEITS.has(result) && result !== '*') {
            problems.push(`Round ${r.number}, board ${p.board}: result "${result}" isn't one of 1-0, 0-1, 1/2-1/2, +-, -+, --, *.`)
          }
          if (!isBye) {
            const key = [p.white, p.black].sort().join('|')
            if (met.has(key)) problems.push(`${p.white} and ${p.black} are paired against each other more than once.`)
            met.add(key)
          }
          const pts = outcome(result, scoring, isBye)
          return {
            id,
            round: r.number,
            board: p.board,
            white: playerById.get(p.white) ?? null,
            black: isBye ? null : playerById.get(p.black) ?? null,
            result,
            category: pts.category,
            points: { white: pts.white, black: pts.black },
            finished: pts.category !== 'pending',
            status: pts.category === 'pending' ? (p.status ?? 'ongoing') : 'finished',
            date: p.date ?? r.date ?? null,
            pgnPath: p.pgn ?? null,
            game: null, // filled in by the loader once the PGN has been parsed
          }
        })
      return { number: r.number, date: r.date ?? null, pairings }
    })

  const pairings = rounds.flatMap((r) => r.pairings)
  const totalRounds = json.totalRounds ?? (players.length % 2 === 0 ? players.length - 1 : players.length)

  return {
    meta: {
      name: json.name ?? 'Tournament',
      section: json.section ?? '',
      title: json.section ? `${json.name} — ${json.section}` : json.name,
      format: json.format ?? 'Round robin',
      timeControl: json.timeControl ?? '',
      totalRounds,
      updated: json.updated ?? null,
      scoring,
      tiebreaks: json.tiebreaks ?? ['SB', 'DE', 'WIN', 'BWG', 'LOT'],
    },
    players,
    playerById,
    rounds,
    pairings,
    pairingById: new Map(pairings.map((p) => [p.id, p])),
    problems,
    raw: json,
  }
}

/**
 * Each player's per-round "cards" (their view of every finished pairing), the same shape
 * ChessManager's engine works on. Unfinished games produce no card.
 */
export function cardsByPlayer(model) {
  const cards = new Map(model.players.map((p) => [p.id, []]))
  for (const p of model.pairings) {
    if (!p.finished || !p.white) continue
    if (p.category === 'bye') {
      cards.get(p.white.id)?.push({ round: p.round, board: p.board, opponent: null, color: null, points: p.points.white, category: 'bye', pairing: p })
      continue
    }
    if (!p.black) continue
    const forfeit = p.category === 'forfeit'
    const whiteCat = forfeit ? (p.points.white > p.points.black ? 'forfeitWin' : 'forfeitLoss') : 'played'
    const blackCat = forfeit ? (p.points.black > p.points.white ? 'forfeitWin' : 'forfeitLoss') : 'played'
    cards.get(p.white.id)?.push({ round: p.round, board: p.board, opponent: p.black.id, color: 'w', points: p.points.white, category: whiteCat, pairing: p })
    cards.get(p.black.id)?.push({ round: p.round, board: p.board, opponent: p.white.id, color: 'b', points: p.points.black, category: blackCat, pairing: p })
  }
  for (const list of cards.values()) list.sort((a, b) => a.round - b.round)
  return cards
}

/** The round people care about right now: the latest one that has been published. */
export function currentRound(model) {
  return model.rounds.at(-1) ?? null
}
