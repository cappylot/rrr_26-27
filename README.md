# Royal Round Robin 26/27 — Invitational

The tournament website: standings, pairings, games with a move-by-move viewer, stats, and
downloads (PGN, CSV, JSON, print-to-PDF). It is a plain static site with no build step.
GitHub Pages serves this folder exactly as it is.

**Live site:** https://cappylot.github.io/rrr_26-27/ (once Pages is switched on, see below)

## Updating after a round

Everything the site shows comes from two places:

| File | What it holds |
|---|---|
| `data/tournament.json` | Players, pairings and results. The standings are calculated from these results. |
| `data/games/*.pgn` | One PGN per finished game. The game viewer and stats read these. |

You can edit both in GitHub's web editor (open the file, then the pencil icon), or ask Claude
to do it. The site updates about a minute after each commit.

### 1. Enter a result

Find the pairing in `data/tournament.json` and set its `result`:

| `result` | Meaning |
|---|---|
| `"1-0"` / `"0-1"` / `"1/2-1/2"` | Game played |
| `"*"` | Not finished yet. It shows as **Live**. Add `"status": "scheduled"` or `"status": "postponed"` to show that instead. |
| `"+-"` / `"-+"` | Forfeit win for White or Black |
| `"--"` | Both players forfeit |

Also change `"updated"` near the top of the file to today's date.

### 2. Add the game's PGN

1. Save the PGN as `data/games/r<round>-b<board>.pgn`, for example `data/games/r2-b1.pgn`.
2. Point the pairing at it: `"pgn": "games/r2-b1.pgn"`. Optionally add a date: `"date": "2026-10-01"`.

The PGN headers don't have to be perfect, because names and results come from the JSON. The
site does warn at the top of the page if the PGN's `[Result]` disagrees with the JSON. For tidy
downloads, set:

```
[Event "Royal Round Robin 26/27 — Invitational"]
[Round "2.1"]
[White "Kaplow, Orfeo"]
[Black "Peukert, Jonathan"]
[Result "1-0"]
```

Add `[Termination "Time forfeit"]` if a game was lost on time. Otherwise a decisive game that
doesn't end in mate is shown as a resignation. Opening names are detected automatically; a PGN
`[Opening "…"]` tag overrides the detection.

### 3. Publish a new round

Append a round to `"rounds"` using the board order from ChessManager's pairing sheet. The player
ids are listed under `"players"`.

```json
{
  "number": 2,
  "pairings": [
    { "board": 1, "white": "gruenzner",   "black": "j-peukert",  "result": "*" },
    { "board": 2, "white": "johnen",      "black": "kaplow",     "result": "*" },
    { "board": 3, "white": "grozea",      "black": "h-peukert",  "result": "*" },
    { "board": 4, "white": "tomaszewski", "black": "guo",        "result": "*" }
  ]
}
```

(The pairings above are only an example of the format. Always copy them from ChessManager.)

The site shows only the rounds that are in the file. If something is wrong, for example an
unknown player id or a player paired twice, a yellow banner lists the problem.

## Standings and tiebreaks

The standings use ChessManager's round-robin rules, so the site and the app always agree:

- **Order:** points first. Ties are then broken by Sonneborn-Berger → direct encounter → number
  of wins → wins with Black → pairing number. The order can be changed with `"tiebreaks"`.
- **Direct encounter** only counts when every tied player has played every other tied player.
- **Forfeits** score points but don't count as games played.

The Standings CSV has the same columns as ChessManager's CSV export: Rank, Player, Rating,
Points, SB, WIN, BWG, LOT. SB values with quarter points (for example 0.25) are written exactly.

## Switching on GitHub Pages (one time)

In the repo, go to **Settings → Pages**. Under **Build and deployment**:

1. Choose **Deploy from a branch**.
2. Pick the branch this site is on and the **/ (root)** folder.
3. Click **Save**.

The `.nojekyll` file makes GitHub serve the files unchanged.

## Working on the site

```sh
npm test            # standings, tiebreaks, PGN parsing, stats and CSV layouts (Node 18+)
npm run serve       # http://localhost:8080
```

| Folder or file | Contents |
|---|---|
| `js/` | The code. `tournament.js`, `standings.js`, `pgn.js`, `stats.js` and `export.js` are pure logic, which the tests cover. `views/` and `viewer.js` draw the pages. |
| `css/style.css` | Screen styles. The colours are the ChessManager palette. |
| `css/print.css` | Print and PDF layout. |
| `data/openings.json` | The ECO opening table. Regenerate it with `tools/build-openings.mjs`. |
| `vendor/` | Third-party libraries, copied in unchanged. |

## Credits

- **[chess.js](https://github.com/jhlywa/chess.js):** BSD-2-Clause.
- **[cm-chessboard](https://github.com/shaack/cm-chessboard):** MIT. It includes the standard
  chess pieces by Cburnett from Wikimedia Commons, licensed CC BY-SA 3.0.
- **Opening names:** from the ECO table in [chess-openings](https://www.npmjs.com/package/chess-openings), licensed WTFPL.
