// PGN parsing on top of chess.js: headers, every move with the position after it, and facts the
// stats page needs (how the game ended, castling, captures). Pure — runs in Node too.

import { Chess } from '../vendor/chess.js/chess.js'

export const TERMINATION = {
  checkmate: 'Checkmate',
  resignation: 'Resignation',
  time: 'Time',
  forfeit: 'Forfeit',
  agreed: 'Draw agreed',
  stalemate: 'Stalemate',
  repetition: 'Repetition',
  insufficient: 'Insufficient material',
  fifty: '50-move rule',
  unfinished: 'Unfinished',
}

export function parseGame(pgnText) {
  const chess = new Chess()
  chess.loadPgn(pgnText)
  const headers = chess.getHeaders()
  const history = chess.history({ verbose: true })
  const result = normaliseResult(headers.Result)

  const moves = history.map((m, i) => ({
    ply: i + 1,
    number: Math.floor(i / 2) + 1,
    color: m.color,
    san: m.san,
    from: m.from,
    to: m.to,
    piece: m.piece,
    captured: m.captured ?? null,
    promotion: m.promotion ?? null,
    castle: m.isKingsideCastle() ? 'O-O' : m.isQueensideCastle() ? 'O-O-O' : null,
    check: m.san.includes('+') || m.san.includes('#'),
    fen: m.after,
  }))

  const castling = { w: null, b: null }
  for (const m of moves) if (m.castle && !castling[m.color]) castling[m.color] = { type: m.castle, move: m.number }

  return {
    headers,
    result,
    startFen: history[0]?.before ?? chess.fen(),
    moves,
    plies: moves.length,
    fullMoves: Math.ceil(moves.length / 2),
    finalFen: chess.fen(),
    termination: termination(chess, headers, result),
    castling,
    captures: moves.filter((m) => m.captured).length,
    checks: moves.filter((m) => m.check).length,
    comments: chess.getComments?.() ?? [],
  }
}

function normaliseResult(r) {
  if (r === '1-0' || r === '0-1' || r === '1/2-1/2') return r
  if (r === '½-½') return '1/2-1/2'
  return '*'
}

function termination(chess, headers, result) {
  const tag = (headers.Termination ?? '').toLowerCase()
  if (tag.includes('time')) return 'time'
  if (tag.includes('forfeit') || tag.includes('abandon')) return 'forfeit'
  if (chess.isCheckmate()) return 'checkmate'
  if (chess.isStalemate()) return 'stalemate'
  if (chess.isInsufficientMaterial()) return 'insufficient'
  if (chess.isThreefoldRepetition()) return 'repetition'
  if (chess.isDrawByFiftyMoves()) return 'fifty'
  if (result === '1-0' || result === '0-1') return 'resignation'
  if (result === '1/2-1/2') return 'agreed'
  return 'unfinished'
}

/** Board + side + castling rights: the key used by data/openings.json. */
export function positionKey(fen) {
  return fen.split(' ').slice(0, 3).join(' ')
}

/**
 * Opening for a game: a PGN [Opening] tag wins; otherwise the deepest position of the game that
 * appears in the ECO table.
 */
export function classifyOpening(game, table) {
  const h = game.headers
  if (h.Opening && h.Opening !== '?') {
    return { eco: h.ECO && h.ECO !== '?' ? h.ECO : '', name: h.Variation ? `${h.Opening}: ${h.Variation}` : h.Opening, ply: null }
  }
  if (!table) return null
  let found = null
  for (const m of game.moves.slice(0, 40)) {
    const hit = table[positionKey(m.fen)]
    if (hit) {
      const [eco, name] = hit.split('|')
      found = { eco, name, ply: m.ply }
    }
  }
  return found
}

/** "Caro-Kann Defense: Tartakower Variation" → "Caro-Kann Defense". */
export function openingFamily(name) {
  return (name ?? '').split(':')[0].trim()
}

/** SAN move list as PGN movetext ("1. e4 c6 2. d4 …"), for sharing links. */
export function movetext(game) {
  const out = []
  for (const m of game.moves) {
    if (m.color === 'w') out.push(`${m.number}.`)
    out.push(m.san)
  }
  return out.join(' ')
}
