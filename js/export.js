// File exports. The CSV layouts match ChessManager's ExportService (same columns, "½" scores,
// CRLF line endings, RFC 4180 quoting) so the files open the same way as the app's exports.
// Builders are pure; `download` is the only browser-specific part.

import { score, resultCSV } from './format.js'
import { TIEBREAKS } from './standings.js'

const CRLF = '\r\n'

function csvField(field) {
  const s = String(field ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}
const csvRow = (fields) => fields.map(csvField).join(',')

/** Tiebreaks shown in tables and CSVs: the configured order without Direct Encounter (as in the app). */
export function displayedTiebreaks(model) {
  return model.meta.tiebreaks.filter((m) => m !== 'DE' && TIEBREAKS[m])
}

export function standingsCSV(model, rows) {
  const order = displayedTiebreaks(model)
  const lines = [csvRow(['Rank', 'Player', 'Rating', 'Points', ...order.map((m) => TIEBREAKS[m].short)])]
  for (const r of rows) {
    lines.push(csvRow([r.rank, r.player.name, r.player.rating ?? '', score(r.score),
      ...order.map((m) => score(r.tiebreaks[m] ?? 0))]))
  }
  return lines.join(CRLF)
}

export function pairingsCSV(model) {
  const lines = [csvRow(['Round', 'Board', 'White', 'Result', 'Black'])]
  for (const round of model.rounds) {
    for (const p of round.pairings) {
      lines.push(csvRow([round.number, p.board, p.white?.name ?? '', resultCSV(p.result), p.black?.name ?? '—(bye)']))
    }
  }
  return lines.join(CRLF)
}

export function crossTableCSV(table) {
  const { rows, cells } = table
  const lines = [csvRow(['Rank', 'Player', ...rows.map((_, i) => String(i + 1)), 'Points'])]
  rows.forEach((r, i) => {
    const fields = [r.rank, r.player.name]
    cells[i].forEach((cell) => {
      if (!cell) fields.push('')
      else if (cell.kind === 'self') fields.push('X')
      else if (cell.kind === 'live') fields.push('')
      else fields.push(score(cell.points))
    })
    fields.push(score(r.score))
    lines.push(csvRow(fields))
  })
  return lines.join(CRLF)
}

/** Every PGN of the given pairings joined into one file, in round/board order. */
export function combinedPGN(pairings) {
  return pairings
    .filter((p) => p.pgnText)
    .sort((a, b) => a.round - b.round || a.board - b.board)
    .map((p) => p.pgnText.trim())
    .join('\n\n') + '\n'
}

export function slug(text) {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Save text as a file via a temporary Blob link. */
export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
