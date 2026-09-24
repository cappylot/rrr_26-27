import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStandings, crossTable } from '../js/standings.js'
import { loadReal, fixture } from './helpers.js'

const order = (rows) => rows.map((r) => r.player.id)

test('round 1 standings match the ChessManager tiebreak order', async () => {
  const model = await loadReal()
  assert.deepEqual(model.problems, [])
  const rows = computeStandings(model)
  assert.deepEqual(order(rows), ['j-peukert', 'tomaszewski', 'h-peukert', 'johnen', 'kaplow', 'guo', 'grozea', 'gruenzner'])
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(rows.map((r) => r.score), [1, 1, 0.5, 0.5, 0, 0, 0, 0])
  // Jonathan and Vincent: SB 0, no mutual game, one win each → Jonathan's win with Black decides.
  assert.equal(rows[0].tiebreaks.BWG, 1)
  assert.equal(rows[1].tiebreaks.BWG, 0)
  // Hauke and Paul drew each other: SB ¼ each, DE equal, so it comes down to pairing number.
  assert.equal(rows[2].tiebreaks.SB, 0.25)
  assert.equal(rows[3].tiebreaks.SB, 0.25)
  // Orfeo and Malwin's game is still going: no points, no games counted.
  assert.equal(rows.find((r) => r.player.id === 'kaplow').played, 0)
})

// Two players on 2½ with equal SB, WIN and BWG; e beat b, so direct encounter puts e first.
const deRounds = [
  [['a', 'f', '1/2-1/2'], ['b', 'e', '0-1'], ['c', 'd', '1/2-1/2']],
  [['f', 'd', '1-0'], ['e', 'c', '0-1'], ['a', 'b', '0-1']],
  [['b', 'f', '0-1'], ['c', 'a', '0-1'], ['d', 'e', '0-1']],
  [['f', 'e', '1/2-1/2'], ['a', 'd', '1-0'], ['b', 'c', '1/2-1/2']],
  [['c', 'f', '0-1'], ['d', 'b', '0-1'], ['e', 'a', '0-1']],
]

test('direct encounter separates players tied on points and SB', () => {
  const rows = computeStandings(fixture(['a', 'b', 'c', 'd', 'e', 'f'], deRounds))
  assert.deepEqual(order(rows), ['f', 'a', 'e', 'b', 'c', 'd'])
  const [e, b] = [rows[2], rows[3]]
  assert.equal(e.score, 2.5); assert.equal(b.score, 2.5)
  assert.equal(e.tiebreaks.SB, 5); assert.equal(b.tiebreaks.SB, 5)
  assert.equal(e.tiebreaks.WIN, b.tiebreaks.WIN)
  assert.equal(e.tiebreaks.BWG, b.tiebreaks.BWG)
})

test('without direct encounter the same tie falls through to pairing number', () => {
  const rows = computeStandings(fixture(['a', 'b', 'c', 'd', 'e', 'f'], deRounds, { tiebreaks: ['SB', 'WIN', 'BWG', 'LOT'] }))
  assert.deepEqual(order(rows).slice(2, 4), ['b', 'e'])
})

test('Sonneborn-Berger ranks a player with better wins first', () => {
  const rounds = [
    [['a', 'd', '1-0'], ['b', 'c', '0-1']],
    [['d', 'c', '1-0'], ['a', 'b', '1-0']],
    [['b', 'd', '1-0'], ['c', 'a', '1-0']],
  ]
  const rows = computeStandings(fixture(['a', 'b', 'c', 'd'], rounds))
  assert.deepEqual(order(rows), ['c', 'a', 'd', 'b'])
  assert.deepEqual(rows.map((r) => r.tiebreaks.SB), [3, 2, 2, 1])
})

test('direct encounter is ignored when the tied players have not all met', () => {
  // After one round a and c both have 1 point but haven't played each other.
  const rows = computeStandings(fixture(['a', 'b', 'c', 'd'], [[['a', 'd', '1-0'], ['c', 'b', '1-0']]]))
  assert.deepEqual(order(rows).slice(0, 2), ['a', 'c'])
})

test('forfeits score but do not count as games played', () => {
  const rows = computeStandings(fixture(['a', 'b', 'c', 'd'], [[['a', 'd', '+-'], ['b', 'c', '1/2-1/2']]]))
  const a = rows.find((r) => r.player.id === 'a')
  assert.equal(a.score, 1)
  assert.equal(a.played, 0)
  assert.equal(a.tiebreaks.WIN, 1)
})

test('cross-table is rank-ordered with results mirrored and live games marked', async () => {
  const model = await loadReal()
  const { rows, cells } = crossTable(model)
  const idx = (id) => rows.findIndex((r) => r.player.id === id)
  assert.equal(cells[idx('j-peukert')][idx('guo')].points, 1)
  assert.equal(cells[idx('guo')][idx('j-peukert')].points, 0)
  assert.equal(cells[idx('kaplow')][idx('gruenzner')].kind, 'live')
  assert.equal(cells[0][0].kind, 'self')
  assert.equal(cells[idx('kaplow')][idx('guo')], null)
})

test('standings record which tiebreak separated tied neighbours', async () => {
  const rows = computeStandings(await loadReal())
  assert.equal(rows[0].decidedBy, 'BWG')   // Jonathan over Vincent
  assert.equal(rows[1].decidedBy, null)    // next player has fewer points
  assert.equal(rows[2].decidedBy, 'LOT')   // Hauke over Paul
})
