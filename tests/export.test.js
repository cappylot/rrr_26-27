import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadReal } from './helpers.js'
import { computeStandings, crossTable } from '../js/standings.js'
import { standingsCSV, pairingsCSV, crossTableCSV, combinedPGN } from '../js/export.js'
import { Chess } from '../vendor/chess.js/chess.js'

test('standings CSV uses the ChessManager layout', async () => {
  const model = await loadReal()
  const csv = standingsCSV(model, computeStandings(model))
  assert.equal(csv.split('\r\n')[0], 'Rank,Player,Rating,Points,SB,WIN,BWG,LOT')
  assert.equal(csv.split('\r\n')[1], '1,"Peukert, Jonathan",,1,0,1,1,7')
  assert.equal(csv.split('\r\n')[3], '3,"Peukert, Hauke",,½,0.25,0,0,3')
  assert.ok(!csv.endsWith('\r\n'))
})

test('pairings CSV', async () => {
  const model = await loadReal()
  assert.equal(pairingsCSV(model), [
    'Round,Board,White,Result,Black',
    '1,1,"Kaplow, Orfeo",,"Grünzner, Malwin"',
    '1,2,"Guo, Andi",0-1,"Peukert, Jonathan"',
    '1,3,"Peukert, Hauke",½-½,"Johnen, Paul"',
    '1,4,"Tomaszewski, Vincent",1-0,"Grozea, Nicolae Theodor"',
  ].join('\r\n'))
})

test('cross-table CSV has X on the diagonal', async () => {
  const model = await loadReal()
  const lines = crossTableCSV(crossTable(model)).split('\r\n')
  assert.equal(lines[0], 'Rank,Player,1,2,3,4,5,6,7,8,Points')
  assert.equal(lines[1], '1,"Peukert, Jonathan",X,,,,,1,,,1')
  assert.equal(lines.length, 9)
})

test('combined PGN contains every game and loads back', async () => {
  const model = await loadReal()
  const pgn = combinedPGN(model.pairings)
  assert.equal(pgn.match(/\[Event /g).length, 3)
  for (const chunk of pgn.split(/\n\n(?=\[Event )/)) {
    const c = new Chess()
    c.loadPgn(chunk)
    assert.ok(c.history().length > 50)
  }
})
