// The Export sheet (PGN / CSV / JSON downloads) and the printable, PDF-style documents.

import { esc, score, resultLabel, plural } from './format.js'
import { TIEBREAKS, crossTable } from './standings.js'
import { standingsCSV, pairingsCSV, crossTableCSV, combinedPGN, displayedTiebreaks, download, slug } from './export.js'
import { toast } from './ui.js'

const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/></svg>'
const printer = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2M7 14h10v6H7Z"/></svg>'

export function setupExport(getCtx) {
  const dialog = document.getElementById('export-sheet')
  const body = document.getElementById('export-body')

  document.getElementById('export-open').addEventListener('click', () => {
    body.innerHTML = sheetHTML(getCtx())
    dialog.showModal()
  })
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) return dialog.close()
    const item = e.target.closest('[data-export]')
    if (!item) return
    runExport(getCtx(), item.dataset.export, item.dataset.arg)
    if (item.dataset.export.startsWith('print')) dialog.close()
  })

  // Ctrl/Cmd+P on standings or pairings prints the clean document for that page.
  window.addEventListener('beforeprint', () => {
    if (document.body.classList.contains('print-doc')) return
    const ctx = getCtx()
    const route = ctx.route
    if (route?.name === 'standings') preparePrint(ctx, 'standings')
    else if (route?.name === 'pairings') preparePrint(ctx, 'pairings', route.round)
  })
  window.addEventListener('afterprint', () => document.body.classList.remove('print-doc'))
}

function sheetHTML(ctx) {
  const { model } = ctx
  const pgnCount = model.pairings.filter((p) => p.pgnText).length
  const base = slug(model.meta.title)
  const rounds = model.rounds.filter((r) => r.pairings.some((p) => p.pgnText))
  const current = ctx.route?.name === 'pairings' ? ctx.route.round ?? model.rounds.at(-1)?.number : model.rounds.at(-1)?.number
  const item = (kind, key, title, detail, arg = '') => `
    <button class="export-item" type="button" data-export="${key}" data-arg="${esc(arg)}">
      <span class="ico ${kind}">${kind.toUpperCase()}</span>
      <span class="t"><strong>${esc(title)}</strong><span>${esc(detail)}</span></span>
      ${kind === 'pdf' ? printer : arrow}
    </button>`
  return `
    <div class="export-group">
      <h3>Games</h3>
      <div class="export-list">
        ${item('pgn', 'pgn-all', 'All games', `${plural(pgnCount, 'game')} · ${base}.pgn`)}
        ${rounds.map((r) => item('pgn', 'pgn-round', `Round ${r.number} games`, `${plural(r.pairings.filter((p) => p.pgnText).length, 'game')}`, r.number)).join('')}
      </div>
    </div>
    <div class="export-group">
      <h3>Tables</h3>
      <div class="export-list">
        ${item('csv', 'csv-standings', 'Standings', 'Rank, player, points, tiebreaks')}
        ${item('csv', 'csv-pairings', 'Pairings', 'Every round, board and result')}
        ${item('csv', 'csv-cross', 'Cross-table', 'Player against player')}
        ${item('json', 'json', 'Tournament data', 'tournament.json — players, rounds, results')}
      </div>
    </div>
    <div class="export-group">
      <h3>Print or save as PDF</h3>
      <div class="export-list">
        ${item('pdf', 'print-standings', 'Standings', `After round ${model.rounds.at(-1)?.number ?? 0}`)}
        ${current ? item('pdf', 'print-pairings', `Round ${current} pairings`, 'Board, White, result, Black', current) : ''}
        ${item('pdf', 'print-cross', 'Cross-table', `${plural(model.players.length, 'player')}`)}
      </div>
    </div>`
}

function runExport(ctx, key, arg) {
  const { model, rows } = ctx
  const base = slug(model.meta.title)
  const csv = 'text/csv'
  switch (key) {
    case 'pgn-all': return save(`${base}.pgn`, combinedPGN(model.pairings), 'application/x-chess-pgn')
    case 'pgn-round': return save(`${base}-round-${arg}.pgn`, combinedPGN(model.pairings.filter((p) => p.round === Number(arg))), 'application/x-chess-pgn')
    // A BOM makes Excel read the ½ and umlauts as UTF-8.
    case 'csv-standings': return save(`${base}-standings.csv`, '\ufeff' + standingsCSV(model, rows), csv)
    case 'csv-pairings': return save(`${base}-pairings.csv`, '\ufeff' + pairingsCSV(model), csv)
    case 'csv-cross': return save(`${base}-crosstable.csv`, '\ufeff' + crossTableCSV(crossTable(model, rows)), csv)
    case 'json': return save('tournament.json', JSON.stringify(model.raw, null, 2) + '\n', 'application/json')
    case 'print-standings': return printDoc(ctx, 'standings')
    case 'print-pairings': return printDoc(ctx, 'pairings', Number(arg))
    case 'print-cross': return printDoc(ctx, 'cross')
  }
}

function save(name, text, type) {
  download(name, text, type)
  toast(`Downloaded ${name}`)
}

function printDoc(ctx, kind, round) {
  preparePrint(ctx, kind, round)
  // Let the DOM settle before the print dialog snapshots it.
  requestAnimationFrame(() => setTimeout(() => window.print(), 50))
}

export function preparePrint(ctx, kind, round) {
  const root = document.getElementById('print-root')
  root.innerHTML = printHTML(ctx, kind, round)
  document.body.classList.add('print-doc')
}

export function printHTML(ctx, kind, roundNumber) {
  const { model, rows } = ctx
  const title = model.meta.title
  if (kind === 'pairings') {
    const round = model.rounds.find((r) => r.number === roundNumber) ?? model.rounds.at(-1)
    return doc(title, `Round ${round.number} — Pairings`, `
      <table>
        <thead><tr><th class="bd">Bd</th><th class="l">White</th><th class="c">Result</th><th class="r">Black</th></tr></thead>
        <tbody>${round.pairings.map((p) => `<tr>
          <td class="bd">${p.board}</td>
          <td class="l">${esc(p.white?.name ?? '')}</td>
          <td class="c">${p.black ? resultCell(p) : 'bye'}</td>
          <td class="r">${p.black ? esc(p.black.name) : ''}</td>
        </tr>`).join('')}</tbody>
      </table>`)
  }
  if (kind === 'cross') {
    const { cells } = crossTable(model, rows)
    return doc(title, 'Cross-table', `
      <table class="x">
        <thead><tr><th class="bd">#</th><th class="l">Player</th>${rows.map((_, i) => `<th class="c">${i + 1}</th>`).join('')}<th class="c">Pts</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr><td class="bd">${r.rank}</td><td class="l">${esc(r.player.name)}</td>${cells[i].map((c) =>
          `<td class="c${c?.kind === 'self' ? ' self' : ''}">${!c || c.kind === 'self' ? '' : c.kind === 'live' ? '*' : score(c.points)}</td>`).join('')}<td class="c b">${score(r.score)}</td></tr>`).join('')}</tbody>
      </table>`)
  }
  const tbs = displayedTiebreaks(model).filter((m) => m !== 'LOT')
  const after = model.rounds.at(-1)
  return doc(title, `Standings after Round ${after?.number ?? 0}`, `
    <table>
      <thead><tr><th class="bd">Rk</th><th class="l">Player</th><th class="c">Pts</th><th class="c">Pl</th>${tbs.map((m) => `<th class="c">${esc(TIEBREAKS[m].short)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr><td class="bd">${r.rank}</td><td class="l">${esc(r.player.name)}</td><td class="c b">${score(r.score)}</td><td class="c">${r.played}</td>${tbs.map((m) => `<td class="c">${score(r.tiebreaks[m] ?? 0)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <p class="foot">Tiebreaks: ${model.meta.tiebreaks.map((m) => esc(TIEBREAKS[m]?.name ?? m)).join(', ')}.</p>`)
}

function resultCell(p) {
  if (!p.finished) return '<span class="blank"></span> : <span class="blank"></span>'
  const [w, b] = [p.points.white, p.points.black].map((v) => score(v))
  return p.category === 'forfeit' ? esc(resultLabel(p.result)) : `<span class="filled">${w}</span> : <span class="filled">${b}</span>`
}

function doc(title, subtitle, table) {
  return `<article class="pdoc"><header><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></header>${table}</article>`
}
