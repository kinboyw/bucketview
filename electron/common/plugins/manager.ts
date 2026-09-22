import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { app } from 'electron';
import { PluginMeta, PluginId, PluginEnsureResult } from './types';
import { ensureRcloneBinary, managedRclonePath, bundledRclonePath } from '../rclone-bin';
import { findSystemMpv, playWithMpv, MpvPlayOptions } from '../mpv-player';
import { downloadAndExtractMpv, managedMpvPath } from '../mpv-bin';
import Store from 'electron-store';
import { logger } from '../logger';

const store = new Store();

const PLUGIN_CONFIG_STORE_KEY = 'app.plugins';

export interface StoredPluginConfig {
  enabled?: boolean;
  customPath?: string;
  config?: Record<string, any>;
}

export class PluginManager {
  private static instance: PluginManager;

  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  private getStoredConfig(id: PluginId): StoredPluginConfig {
    try {
      const all = store.get(PLUGIN_CONFIG_STORE_KEY, {}) as Record<string, StoredPluginConfig>;
      return all[id] || {};
    } catch {
      return {};
    }
  }

  private setStoredConfig(id: PluginId, data: Partial<StoredPluginConfig>): void {
    try {
      const all = store.get(PLUGIN_CONFIG_STORE_KEY, {}) as Record<string, StoredPluginConfig>;
      all[id] = { ...(all[id] || {}), ...data };
      store.set(PLUGIN_CONFIG_STORE_KEY, all);
    } catch (e) {
      logger.error('plugins', `Failed to save plugin config: ${id}`, e);
    }
  }

  /**
   * 获取所有插件元数据及当前运行状态
   */
  public async getPlugins(): Promise<PluginMeta[]> {
    const [rcloneMeta, mpvMeta] = await Promise.all([
      this.getRcloneMeta(),
      this.getMpvMeta(),
    ]);
    return [rcloneMeta, mpvMeta];
  }

  /**
   * 检查并组装 rclone 插件信息
   */
  public async getRcloneMeta(): Promise<PluginMeta> {
    const stored = this.getStoredConfig('rclone');
    const enabled = stored.enabled !== false; // 默认启用
    const customPath = (stored.customPath || '').trim();

    const userDataDir = app.getPath('userData');
    const resourcesDir = process.env.VITE_DEV_SERVER_URL ? app.getAppPath() : path.dirname(app.getAppPath());

    let status: PluginMeta['status'] = 'missing';
    let source: PluginMeta['source'] = undefined;
    let executablePath: string | undefined = undefined;
    let version: string | undefined = undefined;

    // 1. 用户自定义路径
    if (customPath && fs.existsSync(customPath)) {
      status = 'ready';
      source = 'custom';
      executablePath = customPath;
    } else {
      // 2. 检查 managed 路径
      const managed = managedRclonePath(userDataDir, process.platform, process.arch);
      if (fs.existsSync(managed)) {
        status = 'ready';
        source = 'managed';
        executablePath = managed;
      } else {
        // 3. 检查 bundled 路径
        const bundled = bundledRclonePath(resourcesDir, process.platform, process.arch);
        if (fs.existsSync(bundled)) {
          status = 'ready';
          source = 'managed';
          executablePath = bundled;
        }
      }
    }

    if (executablePath) {
      const rawVer = await this.queryBinaryVersion(executablePath, ['version']);
      if (rawVer) {
        const m = rawVer.match(/rclone\s+v?([0-9.]+)/i);
        version = m ? m[1] : (rawVer.split(' ')[1] || rawVer);
      }
    }

    return {
      id: 'rclone',
      name: '本地虚拟驱动器 (rclone)',
      category: 'filesystem',
      description: '支持将 S3 对象存储实时挂载为 Windows 本地盘符（或 macOS/Linux 文件夹），如本地磁盘般透明读写。',
      supportedPlatforms: ['Windows', 'macOS', 'Linux'],
      enabled,
      status,
      source,
      version: version || '1.74.1',
      executablePath,
      customPath,
      config: {
        cacheDirectory: stored.config?.cacheDirectory || '',
        transferConcurrency: stored.config?.transferConcurrency ?? 3,
      },
    };
  }

  /**
   * 检查并组装 mpv 插件信息
   */
  public async getMpvMeta(): Promise<PluginMeta> {
    const stored = this.getStoredConfig('mpv');
    const enabled = stored.enabled !== false; // 默认启用
    const customPath = (stored.customPath || '').trim();

    const userDataDir = app.getPath('userData');
    const resourcesDir = process.env.VITE_DEV_SERVER_URL ? app.getAppPath() : path.dirname(app.getAppPath());

    let status: PluginMeta['status'] = 'missing';
    let source: PluginMeta['source'] = undefined;
    let executablePath: string | undefined = undefined;
    let version: string | undefined = undefined;

    // 1. 用户自定义路径
    if (customPath && fs.existsSync(customPath)) {
      status = 'ready';
      source = 'custom';
      executablePath = customPath;
    } else {
      // 2. 检查 managed 路径（应用数据目录内）
      const managedPath = managedMpvPath(userDataDir, process.platform);
      if (fs.existsSync(managedPath)) {
        status = 'ready';
        source = 'managed';
        executablePath = managedPath;
      }

      // 3. 检查 bundled 资源路径
      if (!executablePath) {
        const bundledCandidates = [
          path.join(resourcesDir, 'bin', 'mpv', process.platform === 'win32' ? 'mpv.exe' : 'mpv'),
          path.join(resourcesDir, 'bin', process.platform === 'win32' ? 'mpv.exe' : 'mpv'),
        ];
        for (const b of bundledCandidates) {
          if (fs.existsSync(b)) {
            status = 'ready';
            source = 'managed';
            executablePath = b;
            break;
          }
        }
      }

      // 4. 常见系统安装路径
      if (!executablePath) {
        const systemPath = findSystemMpv();
        if (systemPath) {
          status = 'ready';
          source = 'system';
          executablePath = systemPath;
        } else {
          // 5. 检查环境变量 mpv
          const inPath = await this.checkPathExecutable('mpv');
          if (inPath) {
            status = 'ready';
            source = 'system';
            executablePath = 'mpv';
          }
        }
      }
    }

    if (executablePath) {
      version = await this.queryBinaryVersion(executablePath, ['--version']);
      if (version) {
        // mpv v0.41.0-xxx -> 0.41.0
        const m = version.match(/mpv\s+v?([0-9.]+)/i);
        if (m) version = m[1];
      }
    }

    return {
      id: 'mpv',
      name: '专业音视频播放引擎 (MPV)',
      category: 'media',
      description: '提供广播影视级专业视音频无损拉流解码（支持 Apple ProRes 全系列、多轨未压缩 PCM 音频与时间码轨）。',
      supportedPlatforms: ['Windows', 'macOS', 'Linux'],
      enabled,
      status,
      source,
      version,
      executablePath,
      customPath,
      config: {
        playMode: stored.config?.playMode || 'smart', // 'smart' (ProRes/MOV智能调起) | 'always' (全部接管) | 'manual' (仅手动)
        hwdec: stored.config?.hwdec !== false,        // 硬件加速
      },
    };
  }

  /**
   * 更新插件启用状态与配置项
   */
  public async updatePluginConfig(id: PluginId, updates: { enabled?: boolean; customPath?: string; config?: Record<string, any> }): Promise<PluginMeta> {
    this.setStoredConfig(id, updates);
    if (id === 'rclone') {
      return this.getRcloneMeta();
    }
    return this.getMpvMeta();
  }

  /**
   * 确保 rclone 就绪（支持自动下载）
   */
  public async ensureRclone(preferredPath?: string): Promise<PluginEnsureResult> {
    const stored = this.getStoredConfig('rclone');
    const pathCandidate = preferredPath || stored.customPath || '';
    const userDataDir = app.getPath('userData');
    const resourcesDir = process.env.VITE_DEV_SERVER_URL ? app.getAppPath() : path.dirname(app.getAppPath());

    const result = await ensureRcloneBinary({
      userDataDir,
      resourcesDir,
      preferredPath: pathCandidate,
    });

    if (result.success && result.path) {
      const version = await this.queryBinaryVersion(result.path, ['version']);
      return {
        success: true,
        path: result.path,
        source: result.source,
        version,
      };
    }

    return {
      success: false,
      message: result.message || 'rclone 下载或准备失败',
    };
  }

  /**
   * 自动安装或准备 MPV 播放引擎
   */
  public async ensureMpv(): Promise<PluginEnsureResult> {
    const currentMeta = await this.getMpvMeta();
    if (currentMeta.status === 'ready' && currentMeta.executablePath) {
      return {
        success: true,
        path: currentMeta.executablePath,
        source: currentMeta.source,
        version: currentMeta.version,
      };
    }

    const userDataDir = app.getPath('userData');

    // 优先：直接通过官方 release zip 下载并解压到 userData/bin/mpv/（与 rclone 行为完全一致，不依赖 winget/brew）
    try {
      logger.info('plugins', 'Attempting direct HTTP download for MPV portable zip...');
      const downloadResult = await downloadAndExtractMpv(userDataDir);
      if (downloadResult.success && downloadResult.path) {
        return downloadResult;
      }
      logger.warn('plugins', 'Direct MPV download failed, attempting system package manager fallback...', downloadResult.message);
    } catch (e: any) {
      logger.warn('plugins', 'Direct MPV download exception, fallback to system manager', e?.message);
    }

    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    if (isWin) {
      // 备选降级：若系统刚好有 winget 则尝试静默安装
      const localAppData = process.env.LOCALAPPDATA || '';
      const wingetCandidate = path.join(localAppData, 'Microsoft', 'WindowsApps', 'winget.exe');
      if (fs.existsSync(wingetCandidate)) {
        try {
          logger.info('plugins', 'Fallback: Attempting silent MPV install via winget...', { wingetCandidate });
          await new Promise<void>((resolve, reject) => {
            execFile(
              wingetCandidate,
              ['install', '--id', 'shinchiro.mpv', '-e', '--accept-source-agreements', '--accept-package-agreements', '--silent'],
              { windowsHide: true, timeout: 180000 },
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          const recheck = await this.getMpvMeta();
          if (recheck.status === 'ready' && recheck.executablePath) {
            return {
              success: true,
              path: recheck.executablePath,
              source: recheck.source,
              version: recheck.version,
            };
          }
        } catch (e: any) {
          logger.warn('plugins', 'winget install failed', e?.message);
        }
      }
    } else if (isMac) {
      // macOS 备选降级：homebrew
      const brewCandidate = '/opt/homebrew/bin/brew';
      const brewPath = fs.existsSync(brewCandidate) ? brewCandidate : (fs.existsSync('/usr/local/bin/brew') ? '/usr/local/bin/brew' : null);
      if (brewPath) {
        try {
          logger.info('plugins', 'Fallback: Attempting brew install mpv...');
          await new Promise<void>((resolve, reject) => {
            execFile(brewPath, ['install', 'mpv'], { timeout: 180000 }, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          const recheck = await this.getMpvMeta();
          if (recheck.status === 'ready' && recheck.executablePath) {
            return {
              success: true,
              path: recheck.executablePath,
              source: recheck.source,
              version: recheck.version,
            };
          }
        } catch (e: any) {
          logger.warn('plugins', 'brew install failed', e?.message);
        }
      }
    }

    return {
      success: false,
      message: '自动下载与安装未完成，请检查网络或在插件设置中指定本地 mpv 路径。',
    };
  }

  /**
   * 执行 MPV 播放
   */
  public async playMpv(options: MpvPlayOptions): Promise<{ success: boolean; message?: string }> {
    const meta = await this.getMpvMeta();
    if (!meta.enabled) {
      return { success: false, message: 'MPV 扩展插件已被禁用，请先在插件中心开启。' };
    }
    const mergedOptions: MpvPlayOptions = {
      ...options,
      ontop: options.ontop ?? meta.config?.ontop,
    };
    return playWithMpv(mergedOptions);
  }

  private checkPathExecutable(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      execFile(cmd, ['--version'], { windowsHide: true, timeout: 2000 }, (err) => {
        resolve(!err);
      });
    });
  }

  private queryBinaryVersion(execPath: string, args: string[]): Promise<string | undefined> {
    return new Promise((resolve) => {
      execFile(execPath, args, { windowsHide: true, timeout: 3000 }, (err, stdout) => {
        if (!err && stdout) {
          const firstLine = stdout.split('\n')[0].trim();
          resolve(firstLine);
        } else {
          resolve(undefined);
        }
      });
    });
  }
}

export const pluginManager = PluginManager.getInstance();
