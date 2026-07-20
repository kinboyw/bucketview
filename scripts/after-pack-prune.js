const fs = require('fs')
const path = require('path')

/**
 * Prune non-runtime native extras after packing.
 * - keep only current platform/arch koffi binary
 * - drop better-sqlite3 source/deps leftovers
 * - drop accidental unpacked baggage
 */
exports.default = async function pruneNativeExtras(context) {
  const unpackedRoot = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules'
  )

  const platform = context.electronPlatformName // win32 | darwin | linux
  const archMap = {
    0: 'ia32',
    1: 'x64',
    2: 'armv7l',
    3: 'arm64',
    4: 'universal',
  }
  const arch =
    typeof context.arch === 'string'
      ? context.arch
      : archMap[context.arch] || String(context.arch)

  const koffiDir = path.join(unpackedRoot, 'koffi', 'build', 'koffi')
  if (fs.existsSync(koffiDir)) {
    const keep = `${platform}_${arch}`
    for (const name of fs.readdirSync(koffiDir)) {
      const target = path.join(koffiDir, name)
      if (name === keep) {
        console.log(`[afterPack] keep koffi/${name}`)
        continue
      }
      fs.rmSync(target, { recursive: true, force: true })
      console.log(`[afterPack] removed koffi/${name}`)
    }
  }

  const sqliteRoot = path.join(unpackedRoot, 'better-sqlite3')
  for (const rel of ['deps', 'src', path.join('build', 'Release', 'obj')]) {
    const target = path.join(sqliteRoot, rel)
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true })
      console.log(`[afterPack] removed better-sqlite3/${rel}`)
    }
  }

  const quickjs = path.join(unpackedRoot, 'quickjs-wasi')
  if (fs.existsSync(quickjs)) {
    fs.rmSync(quickjs, { recursive: true, force: true })
    console.log('[afterPack] removed quickjs-wasi')
  }
}
