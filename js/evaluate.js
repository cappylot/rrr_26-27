// Runs the engine over every position of a game and returns the raw analysis that
// data/analysis/<id>.json stores. Used by tools/analyze.mjs and by "Generate review" in the
// browser, so both produce the same format. Pure apart from the engine passed in.

import { Chess } from '../vendor/chess.js/chess.js'
import { REVIEW_VERSION, movesHash, bookPlies } from './review.js'

const PV_PLIES = 8

/**
 * @param game     a parsed game (js/pgn.js)
 * @param engine   a UciEngine (js/uci.js), already initialised
 * @param options  { depth, openings (ECO table, for book moves), onProgress(done, total), signal }
 */
export async function analyseGame(game, engine, { depth = 18, openings = null, onProgress = null, signal = null } = {}) {
  const fens = [game.startFen, ...game.moves.map((m) => m.fen)]
  const evals = []
  await engine.newGame()
  for (let i = 0; i < fens.length; i++) {
    if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError')
    evals.push(await evaluate(engine, fens[i], depth))
    onProgress?.(i + 1, fens.length)
  }
  return {
    version: REVIEW_VERSION,
    engine: engine.name,
    depth,
    movesHash: movesHash(game),
    book: bookPlies(game, openings),
    evals,
  }
}

async function evaluate(engine, fen, depth) {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return { mate: 0 }
  if (chess.isDraw()) return { cp: 0 }
  const res = await engine.go(fen, { depth, multiPv: 1 })
  const line = res.lines[0]
  if (!line) return { cp: 0 }
  const out = line.score.mate != null ? { mate: line.score.mate } : { cp: line.score.cp }
  out.best = res.bestmove && res.bestmove !== '(none)' ? res.bestmove : line.pv[0]
  out.pv = line.pv.slice(0, PV_PLIES).join(' ')
  return out
}

/** UCI moves → SAN from a position, stopping at the first illegal move. */
export function uciToSan(fen, uciMoves) {
  const chess = new Chess(fen)
  const out = []
  for (const u of uciMoves) {
    try {
      const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      out.push({ uci: u, san: m.san, color: m.color, fen: m.after, number: Number(m.before.split(' ')[5]) })
    } catch {
      break
    }
  }
  return out
}
