// Loads the tournament: data/tournament.json, then every referenced PGN. The fetch function is
// injectable so tests can read from disk with the same code path.

import { buildModel } from './tournament.js'
import { parseGame, classifyOpening } from './pgn.js'
import { resultLabel } from './format.js'

const defaultFetchText = async (path) => {
  const res = await fetch(path, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.text()
}

export async function loadTournament({ base = 'data/', fetchText = defaultFetchText } = {}) {
  const json = JSON.parse(await fetchText(`${base}tournament.json`))
  const model = buildModel(json)
  await Promise.all(model.pairings.filter((p) => p.pgnPath).map(async (p) => {
    try {
      p.pgnText = await fetchText(base + p.pgnPath)
      p.game = parseGame(p.pgnText)
    } catch (err) {
      model.problems.push(`Round ${p.round}, board ${p.board}: couldn't read ${p.pgnPath} (${err.message}).`)
      return
    }
    if (p.finished && p.game.result !== '*' && p.game.result !== p.result && p.category === 'played') {
      model.problems.push(`Round ${p.round}, board ${p.board}: tournament.json says ${resultLabel(p.result)} but the PGN says ${resultLabel(p.game.result)}.`)
    }
  }))
  return model
}

let openingsPromise = null

/** The ECO table is ~60 kB gzipped, so it's fetched only when a view needs opening names. */
export function loadOpenings({ base = 'data/', fetchText = defaultFetchText } = {}) {
  openingsPromise ??= fetchText(`${base}openings.json`).then(JSON.parse).catch(() => null)
  return openingsPromise
}

export function attachOpenings(model, table) {
  for (const p of model.pairings) if (p.game && !p.opening) p.opening = classifyOpening(p.game, table)
}
