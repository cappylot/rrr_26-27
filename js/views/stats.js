import { esc, score, percent, plural } from '../format.js'
import { TERMINATION } from '../pgn.js'

export function renderStats(ctx) {
  const { model, stats: s } = ctx
  if (!s.finished) {
    return `<section class="view"><div class="page-head"><h1>Stats</h1></div><div class="card empty">Stats appear once the first game has finished.</div></section>`
  }
  const avg = s.avgMoves == null ? '–' : Math.round(s.avgMoves)

  return `
  <section class="view" aria-labelledby="stats-title">
    <div class="page-head">
      <div>
        <p class="eyebrow">${plural(s.finished, 'finished game')} · ${plural(s.withPgn, 'with moves', 'with moves')}</p>
        <h1 id="stats-title">Stats</h1>
      </div>
    </div>

    <div class="kpis">
      ${kpi('Games finished', `${s.finished}<small>/ ${model.players.length * (model.players.length - 1) / 2}</small>`, `${percent(s.finished / (model.players.length * (model.players.length - 1) / 2))} of the event`)}
      ${kpi('Decisive', percent(s.decisiveShare), `${s.results.white + s.results.black} of ${s.finished} games`)}
      ${kpi('White score', percent(s.whiteScore), `${score(s.results.white + s.results.draw / 2)} of ${s.finished} points`)}
      ${kpi('Average length', `${avg}<small>moves</small>`, s.withPgn ? `${s.totals.moves} moves in total` : 'no PGNs yet')}
    </div>

    <div class="two-col">
      <div class="card">
        <div class="card-head"><h2>Results</h2><span class="hint">by colour</span></div>
        ${resultsSplit(s)}
      </div>
      <div class="card">
        <div class="card-head"><h2>How games ended</h2></div>
        ${bars(s.terminations.map((t) => ({ label: TERMINATION[t.key] ?? t.key, value: t.count, unit: t.count === 1 ? 'game' : 'games' })))}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Game length</h2><span class="hint">moves</span></div>
      ${bars(s.lengths.map((l) => ({
        label: `<a href="#/game/${l.pairing.id}">${esc(l.pairing.white.short)} – ${esc(l.pairing.black.short)}</a>`,
        html: true,
        tip: `${l.pairing.white.display} – ${l.pairing.black.display}`,
        value: l.moves,
        unit: 'moves',
      })))}
    </div>

    <div class="facts-grid">
      ${s.shortestDecisive ? fact('Quickest win', s.shortestDecisive) : ''}
      ${s.longest ? fact('Longest game', s.longest) : ''}
    </div>

    <div class="two-col">
      <div class="card">
        <div class="card-head"><h2>First moves</h2></div>
        ${bars(s.firstMoves.map((m) => ({ label: `1. ${m.key}`, value: m.count, unit: m.count === 1 ? 'game' : 'games' })))}
      </div>
      <div class="card">
        <div class="card-head"><h2>Castling</h2></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th class="t-left">Side</th><th>O-O</th><th>O-O-O</th><th>None</th></tr></thead>
            <tbody>
              ${['w', 'b'].map((c) => `<tr><td class="t-left">${c === 'w' ? 'White' : 'Black'}</td><td>${s.castling[c]['O-O']}</td><td>${s.castling[c]['O-O-O']}</td><td>${s.castling[c].none}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Openings</h2><span class="hint">${plural(s.openings.length, 'line')}</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th class="t-left">ECO</th><th class="t-left">Opening</th><th>Games</th></tr></thead>
          <tbody>
            ${s.openings.map((o) => `<tr>
              <td class="t-left"><b>${esc(o.eco)}</b></td>
              <td class="t-left" style="white-space:normal;min-width:180px">${esc(o.name)}<br><span class="muted" style="font-size:12.5px">${o.games.map((p) => `<a href="#/game/${p.id}">${esc(p.white.short)}–${esc(p.black.short)}</a>`).join(', ')}</span></td>
              <td>${o.games.length}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Players</h2><span class="hint">finished games</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th class="t-left">Player</th><th><abbr title="Games">G</abbr></th><th><abbr title="Wins">W</abbr></th><th><abbr title="Draws">D</abbr></th><th><abbr title="Losses">L</abbr></th>
            <th><abbr title="Points with White / games with White">White</abbr></th><th><abbr title="Points with Black / games with Black">Black</abbr></th><th><abbr title="Average game length in moves">Avg</abbr></th>
          </tr></thead>
          <tbody>
            ${s.players.map(({ row, byColor, avgMoves }) => `<tr>
              <td class="t-left"><a href="#/player/${esc(row.player.id)}"><span class="full">${esc(row.player.display)}</span><span class="short">${esc(row.player.short)}</span></a></td>
              <td>${row.finished}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td>
              <td>${byColor.w.games ? `${score(byColor.w.points)}/${byColor.w.games}` : '–'}</td>
              <td>${byColor.b.games ? `${score(byColor.b.points)}/${byColor.b.games}` : '–'}</td>
              <td>${avgMoves == null ? '–' : Math.round(avgMoves)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <p class="legend-line">Results count every finished game in the tournament; move-based figures use the games that have a PGN. Forfeits are left out.</p>
  </section>`
}

function kpi(label, value, note) {
  return `<div class="card kpi"><span class="label">${esc(label)}</span><span class="value">${value}</span><span class="note">${esc(note)}</span></div>`
}

function resultsSplit(s) {
  const segs = [
    { key: 'white', label: 'White wins', cls: 'white', color: 'var(--c-white)', n: s.results.white },
    { key: 'draw', label: 'Draws', cls: 'draw', color: 'var(--c-draw)', n: s.results.draw },
    { key: 'black', label: 'Black wins', cls: 'black', color: 'var(--c-black)', n: s.results.black },
  ]
  const total = s.finished
  const bar = segs.filter((x) => x.n).map((x) => {
    const share = x.n / total
    const label = share >= 0.12 ? String(x.n) : ''
    return `<span class="seg ${x.cls}" tabindex="0" style="flex:${x.n};background:${x.color}" data-tip-value="${x.n} · ${percent(share)}" data-tip-label="${esc(x.label)}" aria-label="${esc(`${x.label}: ${x.n} (${percent(share)})`)}">${label}</span>`
  }).join('')
  const legend = segs.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.label)} <b>${x.n}</b></span>`).join('')
  return `<div class="chart"><div class="split" role="group" aria-label="Results by colour">${bar}</div><div class="legend">${legend}</div></div>`
}

/** Horizontal bars, one hue (magnitude). Value sits at the bar tip; the table-free values stay visible. */
function bars(items) {
  if (!items.length) return '<div class="chart empty">No data yet.</div>'
  const max = Math.max(...items.map((i) => i.value))
  return `<div class="chart"><div class="bars">${items.map((i) => {
    const w = max ? (i.value / max) * 100 : 0
    const label = i.html ? i.label : esc(i.label)
    const tip = i.tip ?? i.label
    return `<div class="bar-row">
      <span class="lbl">${label}</span>
      <span class="bar-track">
        <span class="bar" tabindex="0" style="width:calc(${w}% - 48px)" data-tip-value="${i.value} ${esc(i.unit)}" data-tip-label="${esc(tip)}" aria-label="${esc(`${tip}: ${i.value} ${i.unit}`)}"></span>
        <span class="bar-val">${i.value}</span>
      </span>
    </div>`
  }).join('')}</div></div>`
}

function fact(label, item) {
  const p = item.pairing
  return `<a class="card fact" href="#/game/${p.id}">
    <span class="label">${esc(label)}</span>
    <strong>${esc(p.white.display)} – ${esc(p.black.display)}</strong>
    <span>${plural(item.moves, 'move')} · round ${p.round} · ${esc(p.game.result === '1/2-1/2' ? 'draw' : TERMINATION[p.game.termination]?.toLowerCase() ?? '')}</span>
  </a>`
}
