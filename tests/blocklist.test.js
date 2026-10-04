import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { root } from './helpers.js'

// Ad and tracker blockers (EasyPrivacy, EasyList, uBlock Origin, AdGuard) use generic URL rules
// that also hit first-party files. A blocked module stops the whole site from loading, as
// `js/analyse.js` once did, so no file we serve may match one of these. Add rules here if another
// one ever bites.
const RULES = [
  /\/analy[sz]e\.js/i, /\/analysis\.js/i, /\/analysis-logger\//i, /\/analytics?[./-]/i,
  /\/track(ing|er)?\.js/i, /\/beacon\.js/i, /\/pixel\.js/i,
  /\/ads?[./_-]/i, /\/advert/i, /\/banners?[./_-]/i, /\/adengine\.js/i, /\/telemetry/i,
]

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...await walk(p))
    else out.push(relative(root, p))
  }
  return out
}

test('no served file has a name that ad or tracker blockers block', async () => {
  const files = (await Promise.all(['js', 'css', 'vendor', 'data'].map((d) => walk(join(root, d))))).flat()
  const hits = files.filter((f) => RULES.some((r) => r.test(`/${f}`)))
  assert.deepEqual(hits, [])
})
