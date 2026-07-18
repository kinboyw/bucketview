import { WebContents, app } from 'electron';
import { Platform, sleep } from '../common';
import axios from 'axios';
import YAML from 'yaml';
import semver from 'semver';
import { DownloaderHelper } from 'node-downloader-helper';
import type { UpdateFile, UpdateInfo } from '../preload/types';
import nodeCrypto from 'node:crypto';
import nodePath from 'node:path';
import nodeOs from 'node:os';
import nodeFs from 'node:fs';
import nodeProcess from 'node:child_process';

const DEFAULT_UPDATE_FEED_URL = 'https://github.com/kinboyw/bucketview/releases/latest/download';
const AUTO_INSTALL_PLATFORMS = new Set<NodeJS.Platform>(['win32', 'darwin']);

interface PendingUpdate {
  version: string;
  fileName: string;
  feedURL: string;
  sha512: string;
  size: number;
  downloadPath?: string;
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const normalizeFeedURL = (feedURL: string) => feedURL.trim().replace(/\/+$/, '');

const isUpdateFile = (value: unknown): value is UpdateFile => {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<UpdateFile>;
  return typeof file.name === 'string'
    && typeof file.arch === 'string'
    && typeof file.sha512 === 'string'
    && /^[a-f0-9]{128}$/i.test(file.sha512)
    && typeof file.size === 'number'
    && Number.isFinite(file.size)
    && file.size > 0;
};

const isUpdateInfo = (value: unknown): value is UpdateInfo => {
  if (!value || typeof value !== 'object') return false;
  const info = value as Partial<UpdateInfo>;
  return typeof info.version === 'string'
    && semver.valid(info.version) !== null
    && Array.isArray(info.files)
    && info.files.every(isUpdateFile);
};

const calculateSha512 = (filePath: string) => new Promise<string>((resolve, reject) => {
  const hash = nodeCrypto.createHash('sha512');
  const stream = nodeFs.createReadStream(filePath);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
  stream.on('error', reject);
});

class HandlerUpdater {
  private updateInfo?: PendingUpdate;

  public async check(
    contents: WebContents,
    feedURL: string = process.env.BUCKETVIEW_UPDATE_FEED_URL || DEFAULT_UPDATE_FEED_URL,
  ): Promise<boolean> {
    if (process.env.VITE_DEV_SERVER_URL) return false;
    if (!AUTO_INSTALL_PLATFORMS.has(nodeOs.platform())) return false;

    const normalizedFeedURL = normalizeFeedURL(feedURL);
    if (!normalizedFeedURL) return false;

    const latestFileName = `latest-${nodeOs.platform()}.yml`;
    const latestURL = `${normalizedFeedURL}/${latestFileName}`;

    try {
      const response = await axios.get<string>(latestURL, {
        timeout: 15_000,
        responseType: 'text',
        headers: {
          Accept: 'application/x-yaml, text/yaml, text/plain',
          'Cache-Control': 'no-cache',
        },
        params: { t: Date.now() },
      });
      const parsed = YAML.parse(response.data) as unknown;
      if (!isUpdateInfo(parsed)) {
        throw new Error('更新清单格式无效');
      }

      if (!semver.gt(parsed.version, app.getVersion())) {
        contents.send('handler-updater', { cmd: 'update-not-available' });
        return false;
      }

      const file = parsed.files.find(item => item.name.endsWith('.zip') && item.arch === nodeOs.arch());
      if (!file) {
        console.warn(`[updater] No ${nodeOs.platform()}/${nodeOs.arch()} asset in ${latestURL}`);
        return false;
      }

      this.updateInfo = {
        version: parsed.version,
        fileName: file.name,
        feedURL: normalizedFeedURL,
        sha512: file.sha512,
        size: file.size,
      };
      contents.send('handler-updater', {
        cmd: 'update-available',
        version: parsed.version,
      });
      return true;
    } catch (error) {
      // 启动检查失败不打扰用户；下载或安装阶段的错误仍会显示通知。
      console.warn(`[updater] Update check failed: ${getErrorMessage(error)}`);
      return false;
    }
  }

  public async download(contents: WebContents): Promise<boolean> {
    try {
      if (!this.updateInfo) throw new Error('未找到可下载的更新');

      const downloadURL = `${this.updateInfo.feedURL}/${this.updateInfo.fileName}`;
      const expectedPath = nodePath.join(nodeOs.tmpdir(), this.updateInfo.fileName);
      nodeFs.rmSync(expectedPath, { force: true });

      const downloader = new DownloaderHelper(downloadURL, nodeOs.tmpdir(), {
        retry: { maxRetries: 5, delay: 5_000 },
        resumeOnIncomplete: true,
        resumeOnIncompleteMaxRetry: 3,
        fileName: this.updateInfo.fileName,
        override: true,
      });

      downloader.on('progress.throttled', stats => {
        contents.send('handler-updater', {
          cmd: 'download-progress',
          parent: Number(stats.progress.toFixed(2)),
        });
      });

      const state = await downloader.start();
      if (!state) throw new Error('更新包下载未完成');

      const downloadPath = downloader.getDownloadPath();
      const stat = nodeFs.statSync(downloadPath);
      if (stat.size !== this.updateInfo.size) {
        nodeFs.rmSync(downloadPath, { force: true });
        throw new Error('更新包大小校验失败，请重试');
      }

      const actualSha512 = await calculateSha512(downloadPath);
      if (actualSha512.toLowerCase() !== this.updateInfo.sha512.toLowerCase()) {
        nodeFs.rmSync(downloadPath, { force: true });
        throw new Error('更新包完整性校验失败，请重试');
      }

      this.updateInfo.downloadPath = downloadPath;
      contents.send('handler-updater', {
        cmd: 'update-downloaded',
        version: this.updateInfo.version,
      });
      return true;
    } catch (error) {
      contents.send('handler-updater', {
        cmd: 'error',
        message: getErrorMessage(error),
      });
      return false;
    }
  }

  public async installDownloaded(contents: WebContents): Promise<boolean> {
    try {
      if (!this.updateInfo?.downloadPath) throw new Error('更新包尚未下载完成');
      if (!AUTO_INSTALL_PLATFORMS.has(nodeOs.platform())) throw new Error('当前平台暂不支持自动安装更新');

      let resources = nodePath.dirname(app.getAppPath());
      if (process.env.VITE_DEV_SERVER_URL) resources = app.getAppPath();

      let autoUpdaterBin = `autoUpdater-${nodeOs.platform()}-${nodeOs.arch()}${Platform.windows() ? '.exe' : ''}`;
      autoUpdaterBin = nodePath.join(resources, 'bin', autoUpdaterBin);
      if (!nodeFs.existsSync(autoUpdaterBin)) throw new Error('未找到自动更新助手');

      const currentExe = app.getPath('exe');
      let installPath = nodePath.dirname(currentExe);
      if (Platform.macos()) installPath = '/Applications';

      // Windows 下先复制助手，避免当前安装目录中的文件被占用。
      if (Platform.windows()) {
        const tempUpdaterBin = nodePath.join(nodeOs.tmpdir(), nodePath.basename(autoUpdaterBin));
        nodeFs.copyFileSync(autoUpdaterBin, tempUpdaterBin);
        autoUpdaterBin = tempUpdaterBin;
      }

      contents.send('handler-updater', {
        cmd: 'installing',
        version: this.updateInfo.version,
      });
      await sleep(500);

      nodeProcess.spawn(autoUpdaterBin, [this.updateInfo.downloadPath, installPath, currentExe], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return true;
    } catch (error) {
      contents.send('handler-updater', {
        cmd: 'error',
        message: getErrorMessage(error),
      });
      return false;
    }
  }
}

export const handlerUpdater = new HandlerUpdater();
