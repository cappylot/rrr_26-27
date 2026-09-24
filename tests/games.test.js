import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadReal, openingsTable } from './helpers.js'
import { computeStandings } from '../js/standings.js'
import { computeStats } from '../js/stats.js'
import { attachOpenings } from '../js/data.js'

test('every PGN parses and agrees with tournament.json', async () => {
  const model = await loadReal()
  assert.deepEqual(model.problems, [])
  const withPgn = model.pairings.filter((p) => p.pgnPath)
  assert.equal(withPgn.length, 3)
  for (const p of withPgn) {
    assert.ok(p.game, `${p.id} parsed`)
    assert.equal(p.game.result, p.result, `${p.id} result`)
    assert.equal(p.game.headers.White, p.white.name)
    assert.equal(p.game.headers.Black, p.black.name)
    assert.equal(p.game.headers.Round, `${p.round}.${p.board}`)
  }
})

test('game facts: length, termination and castling', async () => {
  const model = await loadReal()
  const g = (id) => model.pairingById.get(id).game
  assert.equal(g('r1-b2').fullMoves, 31)
  assert.equal(g('r1-b2').termination, 'resignation')
  assert.equal(g('r1-b3').fullMoves, 43)
  assert.equal(g('r1-b3').termination, 'agreed')
  assert.equal(g('r1-b4').fullMoves, 37)
  assert.equal(g('r1-b4').termination, 'checkmate')
  assert.equal(g('r1-b4').moves.at(-1).san, 'Nf6#')
  assert.deepEqual(g('r1-b3').castling.w, { type: 'O-O', move: 13 })
})

test('openings are recognised from the ECO table', async () => {
  const model = await loadReal()
  attachOpenings(model, await openingsTable())
  const o = (id) => model.pairingById.get(id).opening
  assert.equal(o('r1-b2').eco, 'B15')
  assert.match(o('r1-b2').name, /^Caro-Kann Defense/)
  assert.equal(o('r1-b3').eco, 'D00')
  assert.match(o('r1-b3').name, /London System/)
  assert.equal(o('r1-b4').eco, 'D37')
  assert.match(o('r1-b4').name, /^Queen's Gambit Declined/)
})

test('tournament stats', async () => {
  const model = await loadReal()
  const stats = computeStats(model, computeStandings(model), await openingsTable())
  assert.equal(stats.finished, 3)
  assert.equal(stats.scheduled, 4)
  assert.deepEqual(stats.results, { white: 1, draw: 1, black: 1 })
  assert.equal(stats.whiteScore, 0.5)
  assert.equal(Math.round(stats.decisiveShare * 100), 67)
  assert.equal(stats.avgMoves, (31 + 43 + 37) / 3)
  assert.equal(stats.longest.pairing.id, 'r1-b3')
  assert.equal(stats.shortestDecisive.pairing.id, 'r1-b2')
  assert.deepEqual(stats.firstMoves, [{ key: 'd4', count: 2 }, { key: 'e4', count: 1 }])
  assert.deepEqual(stats.terminations.map((t) => t.key).sort(), ['agreed', 'checkmate', 'resignation'])
  assert.deepEqual(stats.castling.w, { 'O-O': 3, 'O-O-O': 0, none: 0 })
})
