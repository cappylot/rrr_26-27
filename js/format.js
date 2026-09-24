// Small formatting helpers shared by every view. Pure — safe to import from Node tests.

const EPS = 1e-9

/** Chess-style score, same convention as ChessManager's `Format.score`: 2 → "2", 2.5 → "2½", 0.5 → "½". */
export function score(v) {
  if (Math.abs(Math.round(v) - v) < EPS) return String(Math.round(v))
  const whole = Math.trunc(v)
  if (Math.abs(v - whole - 0.5) < EPS) return whole === 0 ? '½' : `${whole}½`
  // Quarter values appear in Sonneborn-Berger (½ × ½); show them exactly rather than rounding.
  return String(Math.round(v * 100) / 100)
}

/** "Kaplow, Orfeo" → "Orfeo Kaplow". Names without a comma are returned unchanged. */
export function displayName(name) {
  const i = name.indexOf(',')
  if (i < 0) return name.trim()
  return `${name.slice(i + 1).trim()} ${name.slice(0, i).trim()}`
}

/** "Kaplow, Orfeo" → "Kaplow". */
export function lastName(name) {
  const i = name.indexOf(',')
  return (i < 0 ? name.split(' ').at(-1) : name.slice(0, i)).trim()
}

/** "Grozea, Nicolae Theodor" → "NG" (first given name + surname). */
export function initials(name) {
  const i = name.indexOf(',')
  const first = i < 0 ? name.split(' ')[0] : name.slice(i + 1).trim()
  return ((first[0] ?? '') + (lastName(name)[0] ?? '')).toUpperCase()
}

/** Result as shown to people: "1-0", "½-½", "0-1", "+ −" for forfeits, "" when not finished. */
export function resultLabel(result) {
  switch (result) {
    case '1-0': return '1–0'
    case '0-1': return '0–1'
    case '1/2-1/2': return '½–½'
    case '+-': return '+ : −'
    case '-+': return '− : +'
    case '--': return '− : −'
    case 'bye': return 'bye'
    default: return ''
  }
}

/** ChessManager's CSV spelling of a result ("½-½" with a plain hyphen). */
export function resultCSV(result) {
  switch (result) {
    case '1-0': case '0-1': case '+-': case '-+': case '--': return result
    case '1/2-1/2': return '½-½'
    case 'bye': return 'bye'
    default: return ''
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-13" or "2026.09.13" → "13 Sep 2026". Unknown parts ("????.??.??") give "". */
export function date(value) {
  const m = /^(\d{4})[-.](\d{2})[-.](\d{2})$/.exec(value ?? '')
  if (!m) return ''
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

export function percent(v) {
  return `${Math.round(v * 100)}%`
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/** Escape text for insertion into HTML templates. */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
