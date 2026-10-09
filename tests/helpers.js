import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { loadTournament } from '../js/data.js'
import { buildModel } from '../js/tournament.js'

export const root = fileURLToPath(new URL('..', import.meta.url))
export const fetchText = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

export const loadReal = () => loadTournament({ base: 'data/', fetchText })

/**
 * The real data frozen after round 1: later rounds keep their pairings but lose their results,
 * so the snapshot assertions below don't break every time a new result is entered.
 */
export const loadRound1 = () => loadTournament({
  base: 'data/',
  fetchText: async (path) => {
    const text = await fetchText(path)
    if (!path.endsWith('tournament.json')) return text
    const t = JSON.parse(text)
    for (const r of t.rounds) {
      if (r.number === 1) continue
      r.pairings = r.pairings.map(({ board, white, black }) => ({ board, white, black, result: '*' }))
    }
    return JSON.stringify(t)
  },
})
export const openingsTable = async () => JSON.parse(await fetchText('data/openings.json'))

/** Build a model from a compact fixture: players "a".."h" with seats 1.., rounds as [white, black, result] triples. */
export function fixture(ids, rounds, extra = {}) {
  return buildModel({
    name: 'Test', totalRounds: ids.length - 1 + (ids.length % 2),
    players: ids.map((id, i) => ({ id, name: `${id.toUpperCase()}, Player`, seat: i + 1 })),
    rounds: rounds.map((pairs, i) => ({
      number: i + 1,
      pairings: pairs.map(([white, black, result], b) => ({ board: b + 1, white, black, result })),
    })),
    ...extra,
  })
}
