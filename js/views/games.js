import { esc, plural } from '../format.js'
import { boardThumb, sidePoints, sideClass, terminationLabel, gameDate } from '../ui.js'

export function renderGames(ctx, query) {
  const { model } = ctx
  const all = model.pairings.filter((p) => p.game)
  const roundFilter = Number(query.get('round')) || null
  const playerFilter = query.get('player') || null
  const games = all.filter((p) =>
    (!roundFilter || p.round === roundFilter) &&
    (!playerFilter || p.white?.id === playerFilter || p.black?.id === playerFilter))
    .sort((a, b) => b.round - a.round || a.board - b.board)

  const roundOptions = model.rounds.filter((r) => r.pairings.some((p) => p.game))
  const players = [...model.players].sort((a, b) => a.last.localeCompare(b.last))

  return `
  <section class="view" aria-labelledby="games-title">
    <div class="page-head">
      <div>
        <p class="eyebrow">${plural(all.length, 'game')} with moves</p>
        <h1 id="games-title">Games</h1>
      </div>
    </div>
    <form class="filters" data-filters>
      <label class="visually-hidden" for="f-round">Round</label>
      <select class="select" id="f-round" name="round">
        <option value="">All rounds</option>
        ${roundOptions.map((r) => `<option value="${r.number}" ${r.number === roundFilter ? 'selected' : ''}>Round ${r.number}</option>`).join('')}
      </select>
      <label class="visually-hidden" for="f-player">Player</label>
      <select class="select" id="f-player" name="player">
        <option value="">All players</option>
        ${players.map((p) => `<option value="${esc(p.id)}" ${p.id === playerFilter ? 'selected' : ''}>${esc(p.display)}</option>`).join('')}
      </select>
    </form>
    <div class="game-list">
      ${games.length ? games.map((p) => gameCard(p)).join('') : '<div class="card empty">No games match these filters yet.</div>'}
    </div>
  </section>`
}

export function gameCard(p) {
  const g = p.game
  const last = g.moves.at(-1)
  const facts = [
    `Round ${p.round} · Board ${p.board}`,
    plural(g.fullMoves, 'move'),
    gameDate(p),
  ].filter(Boolean)
  const end = terminationLabel(g)
  return `
    <a class="card game-card" href="#/game/${p.id}" aria-label="${esc(`${p.white.display} against ${p.black.display}, round ${p.round}`)}">
      ${boardThumb(g.finalFen, { lastMove: last, label: `Final position of ${p.white.display} – ${p.black.display}` })}
      <span class="game-meta">
        <span class="players">
          ${line(p, 'white')}
          ${line(p, 'black')}
        </span>
        <span class="opening">${p.opening ? `${p.opening.eco ? `<b>${esc(p.opening.eco)}</b> ` : ''}${esc(p.opening.name)}` : '&nbsp;'}</span>
        <span class="facts">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}${end ? `<span class="badge ${g.termination === 'checkmate' ? 'mate' : ''}">${esc(end)}</span>` : ''}</span>
      </span>
    </a>`
}

function line(p, color) {
  return `<span class="pl ${sideClass(p, color)}"><span class="piece-dot ${color[0]}" aria-hidden="true"></span><span class="name">${esc(p[color].display)}</span><span class="pts">${sidePoints(p, color)}</span></span>`
}
