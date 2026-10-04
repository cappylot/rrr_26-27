// Engine analysis for every finished game: writes data/analysis/<round>-<board>.json, which the
// site turns into game reviews and accuracy stats. Games whose file is already up to date (same
// moves, same or deeper depth) are skipped, so it is cheap to run after every round.
//
//   npm run analyze                      # native `stockfish` if installed, else the vendored WASM
//   node tools/analyze.mjs --depth 24    # deeper
//   node tools/analyze.mjs --engine /path/to/stockfish --force r2-b1
//
// The GitHub Action in .github/workflows/analyze.yml runs this on every push that touches a game.

import { spawn, spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadTournament } from '../js/data.js'
import { UciEngine } from '../js/uci.js'
import { analyseGame } from '../js/evaluate.js'
import { movesHash, REVIEW_VERSION } from '../js/review.js'

const root = new URL('../', import.meta.url)
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args.splice(i, 2)[1] : fallback
}
const depth = Number(flag('depth', 22))
const enginePath = flag('engine', null)
const threads = Number(flag('threads', 0)) || null
const hash = Number(flag('hash', 256))
const force = args.includes('--force') ? (args.splice(args.indexOf('--force'), 1), true) : false
const only = new Set(args)

function startEngine() {
  const wasm = fileURLToPath(new URL('vendor/stockfish/stockfish-19-lite-single.js', root))
  const native = enginePath ?? ['stockfish', '/usr/games/stockfish'].find((c) => spawnSync(c, [], { input: 'quit\n' }).status === 0)
  const [cmd, cmdArgs] = native ? [native, []] : [process.execPath, [wasm]]
  const proc = spawn(cmd, cmdArgs, { stdio: ['pipe', 'pipe', 'inherit'] })
  const engine = new UciEngine((line) => proc.stdin.write(`${line}\n`))
  let buf = ''
  proc.stdout.on('data', (chunk) => {
    buf += chunk
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      engine.receive(buf.slice(0, nl))
      buf = buf.slice(nl + 1)
    }
  })
  engine.close = () => { proc.stdin.end('quit\n') }
  return engine
}

const fetchText = (path) => readFile(new URL(path, root), 'utf8')
const model = await loadTournament({ base: 'data/', fetchText: (p) => fetchText(p) })
const openings = JSON.parse(await fetchText('data/openings.json'))
await mkdir(new URL('data/analysis/', root), { recursive: true })

const todo = []
for (const p of model.pairings) {
  if (!p.game || !p.finished || !p.game.moves.length) continue
  if (only.size && !only.has(p.id)) continue
  const file = new URL(`data/analysis/${p.id}.json`, root)
  if (!force && existsSync(file)) {
    const old = JSON.parse(await readFile(file, 'utf8'))
    if (old.version === REVIEW_VERSION && old.movesHash === movesHash(p.game) && old.depth >= depth) continue
  }
  todo.push({ p, file })
}

if (!todo.length) {
  console.log('All analysis files are up to date.')
  process.exit(0)
}

const engine = startEngine()
const cores = (await import('node:os')).availableParallelism?.() ?? 1
await engine.init({ Threads: threads ?? Math.max(1, cores), Hash: hash })
console.log(`${engine.name}, depth ${depth}: ${todo.length} game${todo.length === 1 ? '' : 's'} to analyse`)

for (const { p, file } of todo) {
  const started = Date.now()
  const raw = await analyseGame(p.game, engine, {
    depth,
    openings,
    onProgress: process.stdout.isTTY ? (done, total) => process.stdout.write(`\r  ${p.id}: ${done}/${total} positions`) : null,
  })
  await writeFile(file, `${JSON.stringify(raw, null, 0).replace(/\},\{/g, '},\n{')}\n`)
  console.log(`\r  ${p.id}: done in ${Math.round((Date.now() - started) / 1000)} s          `)
}
engine.close()
