// Regenerates data/openings.json (position -> "ECO|Opening name") from the ECO table that ships
// with the npm package `chess-openings` (WTFPL). Only needed if you want to refresh the table:
//
//   npm install --no-save chess-openings@0.1.1
//   node tools/build-openings.mjs
//
// Keys are the first three FEN fields (board, side to move, castling rights); the en-passant
// field is dropped so the lookup doesn't depend on how a library writes it.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const source = process.argv[2] ?? 'chess-openings/dist/chess/openings/eco.js'
const { eco } = require(source)

const table = {}
for (const [fen, entry] of Object.entries(eco)) {
  table[fen.split(' ').slice(0, 3).join(' ')] = `${entry.eco}|${entry.name}`
}

const out = fileURLToPath(new URL('../data/openings.json', import.meta.url))
writeFileSync(out, JSON.stringify(table))
console.log(`wrote ${Object.keys(table).length} positions to ${out}`)
