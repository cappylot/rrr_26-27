// A small UCI client for Stockfish. The transport is injected, so the same code drives the WASM
// engine in a browser Worker and a native or WASM process in Node (tools/analyze.mjs).
// Scores are turned into White's point of view; everything else is passed through as UCI.

/**
 * @param {(cmd: string) => void} send   writes one line to the engine
 * Feed every line the engine prints into `receive(line)`.
 */
export class UciEngine {
  constructor(send) {
    this.send = send
    this.waiters = []
    this.search = null
    this.queue = Promise.resolve()
    this.name = 'Stockfish'
    this.multiPv = 1
    this.generation = 0
  }

  receive(line) {
    line = String(line).trim()
    if (!line) return
    if (line.startsWith('id name ')) this.name = line.slice(8)
    for (const w of [...this.waiters]) {
      if (line.startsWith(w.prefix)) {
        this.waiters.splice(this.waiters.indexOf(w), 1)
        w.resolve(line)
      }
    }
    const s = this.search
    if (!s) return
    if (line.startsWith('info ') && line.includes(' pv ')) {
      const info = parseInfo(line, s.turn)
      if (!info || s.stopping) return
      s.lines[info.multipv - 1] = info
      s.depth = Math.max(s.depth, info.depth)
      // Report once a depth is complete for every line, so the lines never mix depths.
      if (info.multipv === s.multiPv || s.lines.filter(Boolean).length === s.multiPv) s.onInfo?.(snapshot(s))
    } else if (line.startsWith('bestmove')) {
      this.search = null
      s.resolve({ ...snapshot(s), bestmove: line.split(' ')[1] })
    }
  }

  waitFor(prefix) {
    return new Promise((resolve) => this.waiters.push({ prefix, resolve }))
  }

  async init(options = {}) {
    const ok = this.waitFor('uciok')
    this.send('uci')
    await ok
    for (const [name, value] of Object.entries(options)) this.send(`setoption name ${name} value ${value}`)
    await this.ready()
  }

  async ready() {
    const ok = this.waitFor('readyok')
    this.send('isready')
    await ok
  }

  newGame() {
    this.queue = this.queue.then(() => { this.send('ucinewgame'); return this.ready() })
    return this.queue
  }

  /**
   * Search one position. A new call cancels the running search (its promise still resolves, with
   * `cancelled: true`). `onInfo` gets { depth, lines: [{ multipv, depth, score, pv }] }.
   */
  go(fen, { depth = 18, multiPv = 1, movetime = null, onInfo = null } = {}) {
    if (this.search) {
      this.search.stopping = true
      this.search.cancelled = true
      this.send('stop')
    }
    const generation = ++this.generation
    const job = this.queue.then(async () => {
      // Superseded while waiting for the previous search to stop: skip it.
      if (generation !== this.generation) return { depth: 0, lines: [], bestmove: null, cancelled: true }
      if (multiPv !== this.multiPv) {
        this.send(`setoption name MultiPV value ${multiPv}`)
        this.multiPv = multiPv
      }
      const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w'
      const done = new Promise((resolve) => {
        this.search = { fen, turn, multiPv, depth: 0, lines: [], onInfo, resolve, stopping: false, cancelled: false }
      })
      const s = this.search
      this.send(`position fen ${fen}`)
      this.send(movetime ? `go movetime ${movetime}` : `go depth ${depth}`)
      const result = await done
      return { ...result, cancelled: s.cancelled }
    })
    this.queue = job.catch(() => {})
    return job
  }

  stop() {
    if (this.search) {
      this.search.stopping = true
      this.search.cancelled = true
      this.send('stop')
    }
  }
}

function snapshot(s) {
  const lines = s.lines.filter(Boolean).slice(0, s.multiPv)
  return { depth: lines.length ? Math.min(...lines.map((l) => l.depth)) : 0, lines }
}

/** "info depth 20 … multipv 2 score cp -35 … pv e2e4 e7e5" → { depth, multipv, score, pv }. */
export function parseInfo(line, turn = 'w') {
  const t = line.split(/\s+/)
  const at = (k) => t.indexOf(k)
  if (at('lowerbound') >= 0 || at('upperbound') >= 0) return null
  const sc = at('score')
  const pv = at('pv')
  if (sc < 0 || pv < 0) return null
  const sign = turn === 'w' ? 1 : -1
  const kind = t[sc + 1]
  const value = Number(t[sc + 2])
  const score = kind === 'mate' ? { mate: value === 0 ? 0 : sign * value } : { cp: sign * value }
  const mp = at('multipv')
  return {
    depth: Number(t[at('depth') + 1]) || 0,
    multipv: mp >= 0 ? Number(t[mp + 1]) : 1,
    score,
    pv: t.slice(pv + 1),
  }
}
