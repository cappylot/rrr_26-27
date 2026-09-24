import { esc, score, plural } from '../format.js'
import { TIEBREAKS, crossTable } from '../standings.js'
import { displayedTiebreaks } from '../export.js'
import { avatar, formGuide, statusLabel } from '../ui.js'
import { currentRound } from '../tournament.js'

const TIE_REASON = {
  SB: 'Sonneborn-Berger',
  DE: 'direct encounter',
  WIN: 'number of wins',
  WON: 'games won',
  BWG: 'wins with Black',
  BLK: 'games with Black',
  BH: 'Buchholz',
  CUM: 'cumulative score',
  LOT: 'pairing number (drawing of lots)',
}

export function renderStandings(ctx) {
  const { model, rows } = ctx
  const tbs = displayedTiebreaks(model)
  const round = currentRound(model)

  return `
  <section class="view" aria-labelledby="standings-title">
    <div class="page-head">
      <div>
        <p class="eyebrow">${esc(model.meta.format)} · ${esc(plural(model.players.length, 'player'))}</p>
        <h1 id="standings-title">Standings</h1>
      </div>
    </div>

    ${round ? nowCard(model, round) : ''}

    <div class="card">
      <div class="table-wrap">
        <table class="standings">
          <caption class="visually-hidden">Standings after ${round ? `round ${round.number}` : 'no rounds'}</caption>
          <thead>
            <tr>
              <th class="t-center" scope="col"><abbr title="Rank">#</abbr></th>
              <th class="t-left" scope="col">Player</th>
              <th scope="col"><abbr title="Points">Pts</abbr></th>
              <th scope="col" class="col-optional"><abbr title="Games played">Pl</abbr></th>
              ${tbs.filter((m) => m !== 'LOT').map((m) => `<th scope="col"><abbr title="${esc(TIEBREAKS[m].name)}">${esc(TIEBREAKS[m].short)}</abbr></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => standingRow(ctx, r, tbs)).join('')}
          </tbody>
        </table>
      </div>
      ${tieNotes(rows)}
    </div>
    <p class="legend-line">
      Ties are broken by ${model.meta.tiebreaks.map((m) => m === 'LOT'
        ? 'pairing number'
        : `${esc(TIE_REASON[m] ?? m)} (<abbr title="${esc(TIEBREAKS[m]?.name ?? m)}">${esc(m)}</abbr>)`).join(', then ')}.
      Tap a player for their games.
    </p>

    <h2 class="section-title">Cross-table</h2>
    <div class="card">
      ${crossTableHTML(model, rows)}
    </div>
  </section>`
}

function nowCard(model, round) {
  const games = round.pairings.filter((p) => p.black)
  const done = games.filter((p) => p.finished).length
  const pending = games.filter((p) => !p.finished)
  const pct = games.length ? done / games.length : 0
  const C = 2 * Math.PI * 18
  const text = pending.length
    ? pending.length === 1
      ? `${esc(pending[0].white.display)} – ${esc(pending[0].black.display)}: ${esc(statusLabel(pending[0]).toLowerCase())}`
      : `${plural(pending.length, 'game')} still to finish`
    : 'All games finished'
  return `
    <a class="card now" href="#/pairings/${round.number}" style="color:inherit;text-decoration:none">
      <svg class="now-ring" viewBox="0 0 46 46" role="img" aria-label="${done} of ${games.length} games finished">
        <circle class="track" cx="23" cy="23" r="18"/>
        <circle class="fill" cx="23" cy="23" r="18" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" transform="rotate(-90 23 23)"/>
        <text x="23" y="23">${done}/${games.length}</text>
      </svg>
      <span class="now-text">
        <strong>Round ${round.number} of ${model.meta.totalRounds}</strong>
        <span>${text}</span>
      </span>
      <span class="btn">Pairings</span>
    </a>`
}

function standingRow(ctx, r, tbs) {
  const { model } = ctx
  const leader = r.rank === 1 && r.score > 0
  return `
    <tr class="${leader ? 'leader' : ''}" data-href="#/player/${esc(r.player.id)}">
      <td class="rank"><span>${r.rank}</span></td>
      <td class="player">
        <a class="who" href="#/player/${esc(r.player.id)}">
          ${avatar(r.player)}
          <span class="who-text">
            <span class="who-name">${esc(r.player.display)}</span>
            ${formGuide(model, r.player, r.cards)}
          </span>
        </a>
      </td>
      <td class="pts">${score(r.score)}</td>
      <td class="col-optional tb">${r.played}</td>
      ${tbs.filter((m) => m !== 'LOT').map((m) => `<td class="tb">${score(r.tiebreaks[m] ?? 0)}</td>`).join('')}
    </tr>`
}

function tieNotes(rows) {
  const notes = []
  rows.forEach((r, i) => {
    if (!r.decidedBy || !rows[i + 1]) return
    // Only explain ties among players who have actually scored — "0 vs 0 on pairing number" is noise.
    if (r.score === 0 && r.decidedBy === 'LOT') return
    notes.push(`<strong>${esc(r.player.display)}</strong> is ahead of <strong>${esc(rows[i + 1].player.display)}</strong> on ${esc(TIE_REASON[r.decidedBy] ?? r.decidedBy)}.`)
  })
  return notes.length ? `<div class="ties"><span class="eyebrow">Ties</span>${notes.map((n) => `<p>${n}</p>`).join('')}</div>` : ''
}

export function crossTableHTML(model, rows) {
  const { cells } = crossTable(model, rows)
  const head = rows.map((_, i) => `<th scope="col">${i + 1}</th>`).join('')
  const body = rows.map((r, i) => {
    const tds = cells[i].map((cell, j) => {
      if (!cell) return '<td></td>'
      if (cell.kind === 'self') return '<td class="self" aria-label="—"></td>'
      const p = cell.pairing
      const opp = rows[j].player.display
      if (cell.kind === 'live') {
        return `<td class="res live"><a href="#/pairings/${p.round}" title="${esc(`${statusLabel(p)} vs ${opp}, round ${p.round}`)}">…</a></td>`
      }
      const cls = cell.points >= model.meta.scoring.win ? 'win' : cell.points === model.meta.scoring.draw ? 'draw' : 'loss'
      const label = `${score(cell.points)} vs ${opp} with ${cell.color === 'w' ? 'White' : 'Black'}, round ${p.round}${cell.forfeit ? ' (forfeit)' : ''}`
      const href = p.game ? `#/game/${p.id}` : `#/pairings/${p.round}`
      return `<td class="res ${cls}"><a href="${href}" title="${esc(label)}" aria-label="${esc(label)}">${score(cell.points)}${cell.forfeit ? '<sup>f</sup>' : ''}</a></td>`
    }).join('')
    return `<tr><td class="name"><span class="n">${i + 1}</span><a href="#/player/${esc(r.player.id)}"><span class="full">${esc(r.player.display)}</span><span class="short">${esc(r.player.short)}</span></a></td>${tds}<td class="total">${score(r.score)}</td></tr>`
  }).join('')
  return `
    <div class="table-wrap">
      <table class="cross">
        <caption class="visually-hidden">Cross-table: each row shows what that player scored against each opponent</caption>
        <thead><tr><th class="name t-left" scope="col">Player</th>${head}<th scope="col" class="total">Pts</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`
}
