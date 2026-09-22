import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn, ChildProcess } from 'node:child_process';
import { app } from 'electron';
import { logger } from './logger';

let currentMpvProcess: ChildProcess | null = null;

/**
 * 常见系统路径中探测 mpv 可执行文件
 */
export function findSystemMpv(): string | null {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWin) {
    const candidates = [
      'C:\\Program Files\\MPV Player\\mpv.exe',
      'C:\\Program Files\\mpv\\mpv.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs\\mpv\\mpv.exe'),
      path.join(process.env.APPDATA || '', 'mpv\\mpv.exe'),
      'C:\\mpv\\mpv.exe',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  } else if (isMac) {
    const candidates = [
      '/opt/homebrew/bin/mpv',
      '/usr/local/bin/mpv',
      '/Applications/mpv.app/Contents/MacOS/mpv',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  } else {
    const candidates = ['/usr/bin/mpv', '/usr/local/bin/mpv'];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  return null;
}

/**
 * 检查 mpv 是否就绪
 */
export async function isMpvAvailable(): Promise<{ available: boolean; path?: string }> {
  const directPath = findSystemMpv();
  if (directPath) return { available: true, path: directPath };

  // 尝试在环境变量 PATH 中查找
  return new Promise((resolve) => {
    execFile('mpv', ['--version'], { windowsHide: true, timeout: 2000 }, (err) => {
      if (!err) {
        resolve({ available: true, path: 'mpv' });
      } else {
        resolve({ available: false });
      }
    });
  });
}

export interface MpvPlayOptions {
  url: string;
  title?: string;
  bounds?: { x?: number; y?: number; width?: number; height?: number };
  geometry?: string;
  autofitLarger?: string;
  autofitSmaller?: string;
  ontop?: boolean;
}

/**
 * 使用 MPV 启动或替换播放指定 URL
 */
export async function playWithMpv(options: MpvPlayOptions): Promise<{ success: boolean; message?: string }> {
  try {
    const { available, path: mpvPath } = await isMpvAvailable();
    if (!available || !mpvPath) {
      return {
        success: false,
        message: '未检测到 MPV 播放器。请安装 MPV（例如运行 winget install shinchiro.mpv 或 brew install mpv）。',
      };
    }

    // 关闭之前已由应用启动的播放器实例（保持单实例体验）
    if (currentMpvProcess && !currentMpvProcess.killed) {
      try {
        currentMpvProcess.kill('SIGTERM');
      } catch {}
      currentMpvProcess = null;
    }

    const title = options.title || 'BucketView 专业视频预览';
    const args = [
      `--title=${title}`,
      '--force-window',
      '--hwdec=auto',
      '--demuxer-lavf-o=discard=data', // 自动过滤并忽略 tmcd/数据流，避免 Unsupported codec 报错
      '--keep-open=yes',              // 播放完成后停留在最后一帧，方便回看
    ];

    // 限制窗口大小与位置
    if (options.geometry) {
      args.push(`--geometry=${options.geometry}`);
    } else if (options.bounds && options.bounds.width && options.bounds.height) {
      const { x, y, width, height } = options.bounds;
      if (typeof x === 'number' && typeof y === 'number') {
        args.push(`--geometry=${Math.round(width)}x${Math.round(height)}+${Math.round(x)}+${Math.round(y)}`);
      } else {
        args.push(`--autofit=${Math.round(width)}x${Math.round(height)}`);
        args.push('--geometry=50%:50%');
      }
    } else {
      args.push(`--autofit-larger=${options.autofitLarger || '75%x75%'}`);
      args.push(`--autofit-smaller=${options.autofitSmaller || '640x360'}`);
      args.push('--geometry=50%:50%');
    }

    if (options.ontop) {
      args.push('--ontop');
    }

    args.push(options.url);

    logger.info('mpv', 'Launching mpv player', { path: mpvPath, title, args });
    const child = spawn(mpvPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });

    child.unref();
    currentMpvProcess = child;

    child.on('error', (err) => {
      logger.error('mpv', 'mpv process error', err);
    });

    child.on('exit', () => {
      if (currentMpvProcess === child) {
        currentMpvProcess = null;
      }
    });

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('mpv', 'Failed to play with mpv', error);
    return { success: false, message: msg };
  }
}
