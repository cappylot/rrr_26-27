import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadReal, openingsTable } from './helpers.js'
import { computeStandings } from '../js/standings.js'
import { computeStats, playerAccuracy } from '../js/stats.js'
import { parseGame } from '../js/pgn.js'
import {
  winPercent, moveAccuracy, classify, gameAccuracy, buildReview, movesHash, bookPlies, formatEval, scoreToCp,
} from '../js/review.js'
import { parseInfo } from '../js/uci.js'
import { uciToSan } from '../js/evaluate.js'

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

test('win% follows the Lichess sigmoid and is capped at ±10 pawns', () => {
  close(winPercent(0), 50)
  close(winPercent(100), 59.10, 0.01)
  close(winPercent(-100), 40.90, 0.01)
  close(winPercent(1000), winPercent(5000))
  assert.equal(scoreToCp({ mate: 3 }), 1000)
  assert.equal(scoreToCp({ mate: -2 }), -1000)
  assert.equal(scoreToCp({ mate: 0, winner: 'b' }), -1000)
})

test('move accuracy: 100 when nothing is lost, falling with the win% drop', () => {
  assert.equal(moveAccuracy(50, 50), 100)
  assert.equal(moveAccuracy(50, 70), 100)
  close(moveAccuracy(50, 40), 103.1668100711649 * Math.exp(-0.4354415386753951) - 3.166924740191411 + 1)
  assert.ok(moveAccuracy(90, 10) < 5)
  assert.ok(moveAccuracy(90, 10) >= 0)
})

test('labels use the Lichess thresholds', () => {
  assert.equal(classify(4.9), null)
  assert.equal(classify(5), 'inaccuracy')
  assert.equal(classify(10), 'mistake')
  assert.equal(classify(15), 'blunder')
})

test('game accuracy: a flawless game scores 100, a blunder pulls one side down', () => {
  const steady = Array(21).fill(20)
  const flawless = gameAccuracy(steady)
  close(flawless.w, 100)
  close(flawless.b, 100)
  const cps = [...steady]
  cps[11] = -600 // White's 6th move throws the game away; Black keeps playing well.
  for (let i = 12; i < cps.length; i++) cps[i] = -600
  const acc = gameAccuracy(cps)
  assert.ok(acc.w < 85, `white ${acc.w}`)
  close(acc.b, 100)
})

const PGN = '[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'

test('buildReview labels moves, counts mistakes and rejects a stale file', () => {
  const game = parseGame(PGN)
  const raw = {
    version: 1, engine: 'Test', depth: 10, movesHash: movesHash(game), book: 2,
    evals: [
      { cp: 30, best: 'e2e4' }, { cp: 30, best: 'e7e5' }, { cp: 30, best: 'g1f3' }, { cp: 10, best: 'b8c6' },
      { cp: 10, best: 'f1c4' }, { cp: 20, best: 'd8e7' }, { mate: 1, best: 'h5f7' }, { mate: 0 },
    ],
  }
  const r = buildReview(game, raw)
  assert.deepEqual(r.perPly.slice(1).map((x) => x.label), ['book', 'book', null, 'best', 'best', 'blunder', 'best'])
  assert.equal(r.b.blunder, 1)
  assert.equal(r.w.blunder, 0)
  assert.equal(r.perPly[6].better, 'd8e7')
  assert.equal(formatEval(r.perPly[7].eval), '1–0')
  assert.ok(r.w.accuracy > r.b.accuracy)
  assert.equal(buildReview(game, { ...raw, movesHash: 'deadbeef' }), null)
  assert.equal(buildReview(game, { ...raw, evals: raw.evals.slice(1) }), null)
})

test('book plies stop at the first position outside the ECO table', async () => {
  const table = await openingsTable()
  assert.equal(bookPlies(parseGame(PGN), table) >= 2, true)
  assert.equal(bookPlies(parseGame(PGN), null), 0)
})

test('UCI info lines become White-view scores', () => {
  const info = parseInfo('info depth 20 seldepth 28 multipv 2 score cp 35 nodes 1 nps 1 pv e7e5 g1f3', 'b')
  assert.deepEqual(info, { depth: 20, multipv: 2, score: { cp: -35 }, pv: ['e7e5', 'g1f3'] })
  assert.deepEqual(parseInfo('info depth 9 score mate -3 pv a1a2', 'w').score, { mate: -3 })
  assert.equal(parseInfo('info depth 9 score cp 10 lowerbound pv a1a2', 'w'), null)
  assert.deepEqual(uciToSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e7e5', 'zz']).map((m) => m.san), ['e4', 'e5'])
})

test('committed analysis files load as reviews and feed the stats', async () => {
  const model = await loadReal()
  const finished = model.pairings.filter((p) => p.game && p.finished)
  for (const p of finished) {
    assert.ok(p.review, `${p.id} has a review`)
    assert.equal(p.review.perPly.length, p.game.moves.length + 1)
    for (const c of ['w', 'b']) assert.ok(p.review[c].accuracy > 0 && p.review[c].accuracy <= 100)
  }
  const rows = computeStandings(model)
  const stats = computeStats(model, rows)
  assert.equal(stats.reviewed, finished.length)
  assert.equal(stats.accuracyRanking.length, 8)
  assert.ok(stats.mostAccurateGame)
  const kaplow = rows.find((r) => r.player.id === 'kaplow')
  const acc = playerAccuracy(kaplow.cards)
  assert.equal(acc.games, 1)
  assert.equal(acc.avg, model.pairingById.get('r1-b1').review.w.accuracy)
})
