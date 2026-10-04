// The in-browser engine: Stockfish 19 lite (single-threaded WASM, ~1.8 MB) in a Web Worker. It is
// only downloaded the first time someone switches the engine on. One engine serves the whole page.

import { UciEngine } from './uci.js'

const WORKER_URL = 'vendor/stockfish/stockfish-19-lite-single.js'

let enginePromise = null

/** A new engine in its own Worker. Call `engine.terminate()` when done. */
export async function createEngine() {
  const worker = new Worker(WORKER_URL)
  const engine = new UciEngine((cmd) => worker.postMessage(cmd))
  worker.addEventListener('message', (e) => engine.receive(e.data))
  const failed = new Promise((_, reject) => worker.addEventListener('error', () => reject(new Error('The engine could not start.'))))
  await Promise.race([engine.init({ Hash: 32 }), failed])
  engine.name = engine.name.replace(/^Stockfish (\S+).*/, 'Stockfish $1 lite')
  engine.terminate = () => worker.terminate()
  return engine
}

/** The shared engine for live analysis, started on first use. */
export function getEngine() {
  enginePromise ??= createEngine().catch((err) => {
    enginePromise = null
    throw err
  })
  return enginePromise
}

/** Stop whatever the engine is thinking about (navigating away, engine switched off). */
export function stopEngine() {
  enginePromise?.then((e) => e.stop()).catch(() => {})
}

// Viewer settings, remembered per browser. Storage can be unavailable (private mode), so every
// access is guarded and the defaults always work.
const KEY = 'rrr-engine'
export const DEFAULTS = { enabled: false, lines: 3, depth: 22, arrow: true }

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { ...DEFAULTS, ...saved }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch {}
}

// Reviews generated in the browser ("Generate review") are cached per game and move list.
const reviewKey = (id, hash) => `rrr-review:${id}:${hash}`

export function loadLocalReview(id, hash) {
  try { return JSON.parse(localStorage.getItem(reviewKey(id, hash)) ?? 'null') } catch { return null }
}

export function saveLocalReview(id, hash, raw) {
  try { localStorage.setItem(reviewKey(id, hash), JSON.stringify(raw)) } catch {}
}
