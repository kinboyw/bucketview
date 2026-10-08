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

  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const windir = process.env['WINDIR'] || 'C:\\Windows';

  // 1. 标准路径和常见自定义安装路径
  const standardPaths = [
    path.join(programFiles, 'WinFsp', 'bin', 'winfsp-x64.dll'),
    path.join(programFilesX86, 'WinFsp', 'bin', 'winfsp-x64.dll'),
    path.join(programFilesX86, 'WinFsp', 'bin', 'winfsp-x86.dll'),
    path.join(windir, 'System32', 'winfsp-x64.dll'),
  ];
  for (const p of standardPaths) {
    if (fs.existsSync(p)) return true;
  }

  // 2. 从 Windows 注册表精确读取 WinFsp 安装目录（用户可能安装在非 C 盘，如 D:\、H:\Software\WinSFP 等）
  try {
    const regKeys = [
      'HKLM\\SOFTWARE\\WinFsp',
      'HKLM\\SOFTWARE\\WOW6432Node\\WinFsp',
    ];
    for (const key of regKeys) {
      try {
        const stdout = require('node:child_process').execSync(`reg query "${key}" /v InstallDir 2>nul`, {
          windowsHide: true,
          timeout: 2000,
          encoding: 'utf8',
        });
        const match = stdout.match(/InstallDir\s+REG_SZ\s+(.+)/i);
        if (match && match[1]) {
          const installDir = match[1].trim();
          if (fs.existsSync(path.join(installDir, 'bin', 'winfsp-x64.dll')) || fs.existsSync(installDir)) {
            return true;
          }
        }
      } catch {}
    }
  } catch {}

  // 3. 通过 koffi 尝试加载系统注册的 winfsp 驱动 dll 探测
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

    // 2. 执行 msiexec 安装
    logger.info('winfsp', 'Running msiexec install...', { msiPath });
    await new Promise<void>((resolve, reject) => {
      // /passive 带进度提示，避免全静默 /qn 在部分 Windows 系统上静默被 UAC 拦截或降权失败
      const child = spawn('msiexec.exe', ['/i', msiPath, '/passive', '/norestart'], {
        windowsHide: false,
        stdio: 'ignore',
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        // 0: success, 3010: success restart required
        if (code === 0 || code === 3010) resolve();
        else reject(new Error(`msiexec 安装退出，返回码: ${code}`));
      });
    });

    // 等待安装文件落盘生效
    for (let i = 0; i < 10; i++) {
      if (isWinFspInstalled()) {
        logger.info('winfsp', 'WinFsp successfully installed');
        return { success: true, message: 'WinFsp 驱动已成功安装' };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    return { success: false, message: 'WinFsp 安装完成但未检测到驱动组件，请检查是否允许了系统权限' };
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
