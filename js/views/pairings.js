import { esc, date } from '../format.js'
import { icon, sidePoints, sideClass, statusPill, gameDate } from '../ui.js'

export function renderPairings(ctx, roundNumber) {
  const { model } = ctx
  const round = model.rounds.find((r) => r.number === roundNumber) ?? model.rounds.at(-1)
  if (!round) return `<section class="view"><div class="page-head"><h1>Pairings</h1></div><div class="card empty">No rounds have been published yet.</div></section>`

  const games = round.pairings.filter((p) => p.black)
  const done = games.filter((p) => p.finished).length
  const chips = model.rounds.map((r) => {
    const live = r.pairings.some((p) => p.black && !p.finished)
    return `<a class="chip" href="#/pairings/${r.number}" ${r.number === round.number ? 'aria-current="true"' : ''}>Round ${r.number}${live ? '<span class="dot" aria-label="games in progress"></span>' : ''}</a>`
  }).join('')

  return `
  <section class="view" aria-labelledby="pairings-title">
    <div class="page-head">
      <div>
        <p class="eyebrow">Round ${round.number} of ${model.meta.totalRounds}${round.date ? ` · ${esc(date(round.date))}` : ''}</p>
        <h1 id="pairings-title">Pairings</h1>
        <p class="sub">${done} of ${games.length} games finished</p>
      </div>
    </div>
    ${model.rounds.length > 1 ? `<nav class="chips" aria-label="Rounds">${chips}</nav>` : ''}
    <div class="boards">
      ${round.pairings.map((p) => boardCard(p)).join('')}
    </div>
  </section>`
}

function boardCard(p) {
  if (!p.black) {
    return `
      <article class="card board-card" aria-label="Board ${p.board}: bye">
        <div class="board-card-head"><span class="board-no">Board ${p.board}</span><span class="badge">Bye</span></div>
        ${side(p, 'white')}
      </article>`
  }
  const d = gameDate(p)
  const right = !p.finished
    ? statusPill(p)
    : p.game
      ? `<a class="board-link" href="#/game/${p.id}">View game${icon.chevronRight}</a>`
      : p.category === 'forfeit' ? '<span class="badge">Forfeit</span>' : ''
  return `
    <article class="card board-card" aria-label="Board ${p.board}: ${esc(p.white.display)} against ${esc(p.black.display)}">
      <div class="board-card-head">
        <span class="board-no">Board ${p.board}${d ? `<span class="date">${esc(d)}</span>` : ''}</span>
        ${right}
      </div>
      ${side(p, 'white')}
      ${side(p, 'black')}
    </article>`
}

function side(p, color) {
  const player = p[color]
  const cls = sideClass(p, color)
  return `
    <div class="side ${cls}">
      <span class="piece-dot ${color[0]}" role="img" aria-label="${color === 'white' ? 'White' : 'Black'}"></span>
      <a class="name" href="#/player/${esc(player.id)}">${esc(player.display)}</a>
      <span class="pts" aria-label="${p.finished ? `${sidePoints(p, color)} points` : 'not finished'}">${p.finished ? sidePoints(p, color) : '–'}</span>
    </div>`
}
