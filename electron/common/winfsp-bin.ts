import fs from 'node:fs';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { requestWithGitHubFallback } from './github-proxy';
import { logger } from './logger';
import { PluginEnsureResult } from './plugins/types';

// WinFsp 最新稳定版发布地址
export const WINFSP_VERSION = '2.0.23075';
export const WINFSP_MSI_URL = `https://github.com/winfsp/winfsp/releases/download/v2.0/winfsp-${WINFSP_VERSION}.msi`;

/**
 * 检查当前系统是否安装了 WinFsp 驱动
 */
export function isWinFspInstalled(): boolean {
  if (process.platform !== 'win32') return true; // 非 Windows 平台不需要 WinFsp (macOS 依赖 FUSE-T 或 macFUSE)

  // 1. 检查注册表键是否存在
  const standardPaths = [
    'C:\\Program Files (x86)\\WinFsp\\bin\\winfsp-x64.dll',
    'C:\\Program Files\\WinFsp\\bin\\winfsp-x64.dll',
    'C:\\Windows\\System32\\winfsp-x64.dll',
  ];
  for (const p of standardPaths) {
    if (fs.existsSync(p)) return true;
  }

  // 2. 通过 koffi 加载 winfsp 驱动 dll 探测
  try {
    const koffi = require('koffi');
    const lib = koffi.load('winfsp-x64.dll');
    if (lib) return true;
  } catch {}

  return false;
}

/**
 * 静默下载并安装 WinFsp MSI
 */
export async function downloadAndInstallWinFsp(userDataDir: string): Promise<PluginEnsureResult> {
  if (process.platform !== 'win32') {
    return { success: true, message: '非 Windows 平台无需安装 WinFsp' };
  }

  if (isWinFspInstalled()) {
    return { success: true, message: 'WinFsp 驱动已安装' };
  }

  const tmpDir = path.join(userDataDir, 'bin', '.tmp-winfsp');
  const msiPath = path.join(tmpDir, `winfsp-${WINFSP_VERSION}.msi`);

  logger.info('winfsp', 'Starting WinFsp download...', { url: WINFSP_MSI_URL, msiPath });

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1. 下载 MSI (走 GitHub 镜像代理降级)
    const { stream, usedProxy } = await requestWithGitHubFallback(WINFSP_MSI_URL, {
      userAgent: 'BucketView-WinFsp-bootstrap',
      timeout: 30000,
    });
    if (usedProxy) {
      logger.info('winfsp', 'Downloaded WinFsp using accelerated GitHub proxy');
    }

    const tmpPart = `${msiPath}.part`;
    await pipeline(stream, createWriteStream(tmpPart));
    fs.renameSync(tmpPart, msiPath);

    // 2. 执行 msiexec 静默安装
    logger.info('winfsp', 'Running msiexec install...');
    await new Promise<void>((resolve, reject) => {
      // /qn 静默安装，/norestart 不重启
      const child = spawn('msiexec.exe', ['/i', msiPath, '/qn', '/norestart'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        // 0: success, 3010: success restart required
        if (code === 0 || code === 3010) resolve();
        else reject(new Error(`msiexec exited with code ${code}`));
      });
    });

    if (isWinFspInstalled()) {
      logger.info('winfsp', 'WinFsp successfully installed');
      return { success: true, message: 'WinFsp 驱动已成功安装' };
    }

    return { success: false, message: 'WinFsp 安装完成但未检测到驱动组件，请以管理员身份重试' };
  } catch (err: any) {
    logger.error('winfsp', 'Failed to install WinFsp', err);
    return {
      success: false,
      message: `WinFsp 驱动自动安装失败: ${err?.message || String(err)}。建议手动下载安装: https://winfsp.dev/`,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
