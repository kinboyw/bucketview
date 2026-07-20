import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { createWriteStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

/** Keep in sync with .github/workflows/release.yml historical version. */
export const RCLONE_VERSION = '1.74.1'

export type RcloneEnsureResult = {
  success: boolean
  path?: string
  source?: 'custom' | 'managed' | 'bundled' | 'downloaded'
  message?: string
}

function requestFollow(
  url: string,
  redirects = 0
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects while downloading rclone'))
      return
    }
    const lib = url.startsWith('https:') ? https : http
    const req = lib.get(url, {
      headers: { 'User-Agent': 'BucketView-rclone-bootstrap' },
    }, (res) => {
      const status = res.statusCode || 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        resolve(requestFollow(res.headers.location, redirects + 1))
        return
      }
      if (status !== 200) {
        res.resume()
        reject(new Error(`Download failed with HTTP ${status}`))
        return
      }
      resolve(res)
    })
    req.on('error', reject)
  })
}

export function rcloneBinaryName(platform: NodeJS.Platform, arch: string): string {
  const exe = platform === 'win32' ? '.exe' : ''
  return `rclone-${platform}-${arch}${exe}`
}

export function rcloneArchiveMeta(platform: NodeJS.Platform, arch: string): {
  asset: string
  innerBinary: string
} {
  if (platform === 'win32' && arch === 'x64') {
    return {
      asset: `rclone-v${RCLONE_VERSION}-windows-amd64.zip`,
      innerBinary: `rclone-v${RCLONE_VERSION}-windows-amd64/rclone.exe`,
    }
  }
  if (platform === 'darwin' && arch === 'x64') {
    return {
      asset: `rclone-v${RCLONE_VERSION}-osx-amd64.zip`,
      innerBinary: `rclone-v${RCLONE_VERSION}-osx-amd64/rclone`,
    }
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return {
      asset: `rclone-v${RCLONE_VERSION}-osx-arm64.zip`,
      innerBinary: `rclone-v${RCLONE_VERSION}-osx-arm64/rclone`,
    }
  }
  if (platform === 'linux' && arch === 'x64') {
    return {
      asset: `rclone-v${RCLONE_VERSION}-linux-amd64.zip`,
      innerBinary: `rclone-v${RCLONE_VERSION}-linux-amd64/rclone`,
    }
  }
  if (platform === 'linux' && arch === 'arm64') {
    return {
      asset: `rclone-v${RCLONE_VERSION}-linux-arm64.zip`,
      innerBinary: `rclone-v${RCLONE_VERSION}-linux-arm64/rclone`,
    }
  }
  throw new Error(`Unsupported platform for rclone: ${platform}/${arch}`)
}

export function managedRclonePath(userDataDir: string, platform: NodeJS.Platform, arch: string): string {
  return path.join(userDataDir, 'bin', rcloneBinaryName(platform, arch))
}

export function bundledRclonePath(resourcesDir: string, platform: NodeJS.Platform, arch: string): string {
  return path.join(resourcesDir, 'bin', rcloneBinaryName(platform, arch))
}

function isExecutable(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size < 1024 * 1024) return false
    if (process.platform !== 'win32') {
      fs.accessSync(filePath, fs.constants.X_OK)
    }
    return true
  } catch {
    return false
  }
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.part`
  try {
    const res = await requestFollow(url)
    await pipeline(res, createWriteStream(tmp))
    fs.renameSync(tmp, dest)
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }) } catch {}
    throw err
  }
}

function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`))
    })
  })
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true })
  if (process.platform === 'win32') {
    // Expand-Archive is available on supported Windows builds.
    const ps = [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ]
    await run('powershell.exe', ps)
    return
  }
  await run('unzip', ['-o', zipPath, '-d', destDir])
}

/**
 * Resolve rclone binary path. Download into userData/bin on first use.
 */
export async function ensureRcloneBinary(options: {
  userDataDir: string
  resourcesDir: string
  platform?: NodeJS.Platform
  arch?: string
  preferredPath?: string
}): Promise<RcloneEnsureResult> {
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const preferred = (options.preferredPath || '').trim()

  if (preferred && isExecutable(preferred)) {
    return { success: true, path: preferred, source: 'custom' }
  }

  const managed = managedRclonePath(options.userDataDir, platform, arch)
  if (isExecutable(managed)) {
    return { success: true, path: managed, source: 'managed' }
  }

  const bundled = bundledRclonePath(options.resourcesDir, platform, arch)
  if (isExecutable(bundled)) {
    return { success: true, path: bundled, source: 'bundled' }
  }

  let meta: { asset: string; innerBinary: string }
  try {
    meta = rcloneArchiveMeta(platform, arch)
  } catch (err: any) {
    return { success: false, message: err?.message || String(err) }
  }

  const url = `https://downloads.rclone.org/v${RCLONE_VERSION}/${meta.asset}`
  const workDir = path.join(options.userDataDir, 'bin', '.tmp-rclone')
  const zipPath = path.join(workDir, meta.asset)
  const extractDir = path.join(workDir, 'extract')

  try {
    fs.rmSync(workDir, { recursive: true, force: true })
    fs.mkdirSync(workDir, { recursive: true })
    await downloadToFile(url, zipPath)
    await extractZip(zipPath, extractDir)

    const extracted = path.join(extractDir, meta.innerBinary)
    if (!fs.existsSync(extracted)) {
      // Some archives may flatten paths; search for rclone binary.
      const fallback = findFile(extractDir, platform === 'win32' ? 'rclone.exe' : 'rclone')
      if (!fallback) {
        return { success: false, message: '下载的 rclone 压缩包中未找到可执行文件' }
      }
      fs.mkdirSync(path.dirname(managed), { recursive: true })
      fs.copyFileSync(fallback, managed)
    } else {
      fs.mkdirSync(path.dirname(managed), { recursive: true })
      fs.copyFileSync(extracted, managed)
    }

    if (platform !== 'win32') {
      try { fs.chmodSync(managed, 0o755) } catch {}
    }

    if (!isExecutable(managed)) {
      return { success: false, message: 'rclone 下载完成但无法执行，请检查权限' }
    }

    return { success: true, path: managed, source: 'downloaded' }
  } catch (err: any) {
    return {
      success: false,
      message: `自动下载 rclone 失败：${err?.message || String(err)}。也可在系统设置中手动指定挂载程序路径。`,
    }
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {}
  }
}

function findFile(root: string, name: string): string | null {
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) stack.push(full)
      else if (ent.isFile() && ent.name === name) return full
    }
  }
  return null
}
