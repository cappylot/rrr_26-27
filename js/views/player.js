import { esc, score, resultLabel } from '../format.js'
import { TIEBREAKS } from '../standings.js'
import { displayedTiebreaks } from '../export.js'
import { avatar, icon, statusLabel } from '../ui.js'

export function renderPlayer(ctx, id) {
  const { model, rows } = ctx
  const row = rows.find((r) => r.player.id === id)
  if (!row) return `<section class="view"><a class="back" href="#/standings">${icon.chevronLeft}Standings</a><div class="card empty">Player not found.</div></section>`
  const p = row.player
  const tbs = displayedTiebreaks(model).filter((m) => m !== 'LOT')

  const lines = []
  for (const round of model.rounds) {
    const pairing = round.pairings.find((x) => x.white?.id === id || x.black?.id === id)
    if (!pairing) continue
    lines.push(roundLine(model, pairing, id))
  }

  const colour = { w: { g: 0, pts: 0 }, b: { g: 0, pts: 0 } }
  for (const c of row.cards) if (c.category === 'played') { colour[c.color].g++; colour[c.color].pts += c.points }

  return `
  <section class="view" aria-labelledby="player-title">
    <a class="back" href="#/standings">${icon.chevronLeft}Standings</a>
    <div class="card player-hero ${row.rank === 1 && row.score > 0 ? 'leader' : ''}">
      ${avatar(p)}
      <div style="min-width:0">
        <h1 id="player-title">${esc(p.display)}</h1>
        <p class="sub">Rank ${row.rank} · Seat ${p.seat}${p.rating ? ` · ${p.rating}` : ''}</p>
      </div>
      <div class="big"><strong>${score(row.score)}</strong><span>of ${row.finished} ${row.finished === 1 ? 'game' : 'games'}</span></div>
    </div>

    <div class="kpis">
      <div class="card kpi"><span class="label">Record</span><span class="value">${row.wins}<small>W</small> ${row.draws}<small>D</small> ${row.losses}<small>L</small></span></div>
      <div class="card kpi"><span class="label">With White</span><span class="value">${score(colour.w.pts)}<small>/ ${colour.w.g}</small></span></div>
      <div class="card kpi"><span class="label">With Black</span><span class="value">${score(colour.b.pts)}<small>/ ${colour.b.g}</small></span></div>
      <div class="card kpi"><span class="label">Tiebreaks</span><span class="value" style="font-size:18px;line-height:1.5">${tbs.map((m) => `<abbr title="${esc(TIEBREAKS[m].name)}" style="text-decoration:none">${esc(m)}</abbr> ${score(row.tiebreaks[m] ?? 0)}`).join(' · ')}</span></div>
    </div>

    <h2 class="section-title">Rounds</h2>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th class="t-left">Rd</th><th class="t-left">Opponent</th><th class="t-center">Colour</th><th>Result</th><th></th></tr></thead>
          <tbody>${lines.join('') || '<tr><td colspan="5" class="t-center muted">No games yet.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </section>`
}

function roundLine(model, pairing, id) {
  if (!pairing.black) {
    return `<tr><td class="t-left">${pairing.round}</td><td class="t-left">Bye</td><td></td><td>${score(pairing.points.white ?? 0)}</td><td></td></tr>`
  }
  const isWhite = pairing.white.id === id
  const opp = isWhite ? pairing.black : pairing.white
  const mine = pairing.points[isWhite ? 'white' : 'black']
  const res = pairing.finished ? `<strong>${score(mine)}</strong> <span class="muted">(${esc(resultLabel(pairing.result))})</span>` : `<span class="live-pill${pairing.status === 'ongoing' ? '' : ' quiet'}">${esc(statusLabel(pairing) === 'In progress' ? 'Live' : statusLabel(pairing))}</span>`
  const link = pairing.game ? `<a class="board-link" href="#/game/${pairing.id}">Game${icon.chevronRight}</a>` : ''
  return `<tr>
    <td class="t-left">${pairing.round}</td>
    <td class="t-left"><a href="#/player/${esc(opp.id)}">${esc(opp.display)}</a></td>
    <td class="t-center"><span class="piece-dot ${isWhite ? 'w' : 'b'}" style="display:inline-block;vertical-align:middle" role="img" aria-label="${isWhite ? 'White' : 'Black'}"></span></td>
    <td>${res}</td>
    <td>${link}</td>
  </tr>`
}
