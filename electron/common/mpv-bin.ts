import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { PluginEnsureResult } from './plugins/types';
import { logger } from './logger';
import { requestWithGitHubFallback } from './github-proxy';

export const MPV_VERSION = '0.41.0';

function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
  });
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    const ps = [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ];
    await run('powershell.exe', ps);
    return;
  }
  await run('unzip', ['-o', zipPath, '-d', destDir]);
}

function isExecutable(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 100 * 1024) return false;
    if (process.platform !== 'win32') {
      fs.accessSync(filePath, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function findFile(root: string, name: string): string | null {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.name.toLowerCase() === name.toLowerCase()) {
        return full;
      }
    }
  }
  return null;
}

export function managedMpvDir(userDataDir: string): string {
  return path.join(userDataDir, 'bin', 'mpv');
}

export function managedMpvPath(userDataDir: string, platform: NodeJS.Platform): string {
  const exe = platform === 'win32' ? 'mpv.exe' : 'mpv';
  return path.join(managedMpvDir(userDataDir), exe);
}

function getMpvDownloadUrl(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === 'win32') {
    if (arch === 'x64') {
      return `https://github.com/mpv-player/mpv/releases/download/v${MPV_VERSION}/mpv-v${MPV_VERSION}-x86_64-pc-windows-msvc.zip`;
    }
    if (arch === 'arm64') {
      return `https://github.com/mpv-player/mpv/releases/download/v${MPV_VERSION}/mpv-v${MPV_VERSION}-aarch64-pc-windows-msvc.zip`;
    }
  } else if (platform === 'darwin') {
    if (arch === 'arm64') {
      return `https://github.com/mpv-player/mpv/releases/download/v${MPV_VERSION}/mpv-v${MPV_VERSION}-macos-15-arm.zip`;
    }
    return `https://github.com/mpv-player/mpv/releases/download/v${MPV_VERSION}/mpv-v${MPV_VERSION}-macos-15-intel.zip`;
  }
  return null;
}

/**
 * 直接下载并解压官方便携版 MPV 到 userData/bin/mpv
 */
export async function downloadAndExtractMpv(userDataDir: string): Promise<PluginEnsureResult> {
  const platform = process.platform;
  const arch = process.arch;
  const url = getMpvDownloadUrl(platform, arch);

  if (!url) {
    return {
      success: false,
      message: `当前操作系统与架构暂无直接下载包 (${platform}/${arch})，请手动指定 mpv 路径。`,
    };
  }

  const destPath = managedMpvPath(userDataDir, platform);
  const targetDir = managedMpvDir(userDataDir);
  const tmpDir = path.join(userDataDir, 'bin', '.tmp-mpv');
  const zipPath = path.join(tmpDir, `mpv-${MPV_VERSION}.zip`);
  const extractDir = path.join(tmpDir, 'extract');

  logger.info('mpv-bin', 'Starting direct MPV download', { url, destPath });

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1. 下载 zip 文件（优先原地址，网络不通时自动使用代理镜像）
    const { stream, usedProxy } = await requestWithGitHubFallback(url, {
      userAgent: 'BucketView-mpv-bootstrap',
      timeout: 30000,
    });
    if (usedProxy) {
      logger.info('mpv-bin', 'Downloaded MPV using accelerated GitHub proxy');
    }
    const tmpPart = `${zipPath}.part`;
    await pipeline(stream, createWriteStream(tmpPart));
    fs.renameSync(tmpPart, zipPath);

    // 2. 解压 zip 文件
    await extractZip(zipPath, extractDir);

    // 3. 寻找解压出的可执行程序并移动到目标目录
    const targetBinaryName = platform === 'win32' ? 'mpv.exe' : 'mpv';
    let binaryFile = findFile(extractDir, targetBinaryName);

    if (!binaryFile) {
      return { success: false, message: '下载的 MPV 压缩包中未找到可执行文件' };
    }

    fs.mkdirSync(targetDir, { recursive: true });

    // 将整个解压内容或者同级依赖 dll 复制过去（Windows 版带有关联 dll 和证书文件）
    const binaryParentDir = path.dirname(binaryFile);
    const files = fs.readdirSync(binaryParentDir);
    for (const file of files) {
      const srcFile = path.join(binaryParentDir, file);
      const dstFile = path.join(targetDir, file);
      try {
        fs.copyFileSync(srcFile, dstFile);
      } catch {}
    }

    if (platform !== 'win32') {
      try {
        fs.chmodSync(destPath, 0o755);
      } catch {}
    }

    if (!isExecutable(destPath)) {
      return { success: false, message: 'MPV 解压完成但文件无法执行，请检查权限' };
    }

    logger.info('mpv-bin', 'MPV successfully installed', { path: destPath });
    return {
      success: true,
      path: destPath,
      source: 'managed',
      version: MPV_VERSION,
    };
  } catch (err: any) {
    logger.error('mpv-bin', 'Failed to download and extract MPV', err);
    return {
      success: false,
      message: `自动下载 MPV 失败: ${err?.message || String(err)}。建议检查网络或使用手动路径。`,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
