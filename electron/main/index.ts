import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray, Notification, ipcMain, screen, type WebContents } from 'electron'
import nodeOs from 'node:os'
import nodePath from 'node:path'
import * as remoteMain from '@electron/remote/main';
import loadingHtml from "./loading";
import { Platform } from "../common";
import Store from "electron-store";
import { ensureRcloneBinary } from '../common/rclone-bin';
import { Fuse } from '../preload/storage/fuse';
import { Connection, MountTarget } from '../preload/types';
import Registry from "winreg";
import { handlerUpdater } from "./updater";
import { logger } from '../common/logger';
import {
  PREVIEW_IPC,
  type PreviewDownloadRequest,
  type PreviewFileType,
  type PreviewTextSaveRequest,
  type PreviewThemeUpdate,
  type PreviewWindowOpenResult,
  type PreviewWindowPayload,
} from "../common/preview";

remoteMain.initialize();
Store.initRenderer();

process.on('uncaughtException', (error) => {
  logger.error('main', 'uncaughtException', { message: error?.message, stack: error?.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('main', 'unhandledRejection', reason instanceof Error ? { message: reason.message, stack: reason.stack } : { reason: String(reason) });
});
app.on('render-process-gone', (_event, webContents, details) => {
  logger.error('main', 'render-process-gone', { reason: details.reason, exitCode: details.exitCode, url: webContents.getURL?.() });
});
app.on('child-process-gone', (_event, details) => {
  logger.error('main', 'child-process-gone', details as any);
});

// if (Platform.windows()) {
//   app.setAppUserModelId('app.bucketview.desktop');
// }

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.js    > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.DIST_ELECTRON = nodePath.join(__dirname, '..')
process.env.DIST = nodePath.join(process.env.DIST_ELECTRON, '../dist')
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? nodePath.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

// Disable GPU Acceleration for Windows 7
if (nodeOs.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.exit(0)
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let tray: Tray | null = null;
let win: BrowserWindow | null = null
let previewWin: BrowserWindow | null = null
let previewPayload: PreviewWindowPayload | null = null
let previewOwnerWebContents: WebContents | null = null
let previewTextDirty = false
let previewCloseConfirmed = false
let forceQuit = false;
// Here, you can also use other preload
const preload = nodePath.join(__dirname, '../preload/index.js')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = nodePath.join(process.env.DIST, 'index.html')
const previewHtml = nodePath.join(process.env.DIST, 'preview.html')

const supportedPreviewTypes = new Set<PreviewFileType>([
  'image', 'video', 'audio', 'pdf', 'model', 'office', 'text',
])

const getPreviewBackgroundColor = (payload: Pick<PreviewWindowPayload, 'theme' | 'themeTokens'>) => {
  const themedBackground = payload.themeTokens?.colorBgLayout
  return typeof themedBackground === 'string' && /^#[0-9a-fA-F]{6}$/.test(themedBackground)
    ? themedBackground
    : payload.theme === 'dark' ? '#0b1016' : '#f1f5f9'
}

const normalizeTitleBarColor = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value
  const shortHex = value.match(/^#([0-9a-fA-F]{3})$/)
  if (!shortHex) return fallback
  return `#${shortHex[1].split('').map(char => `${char}${char}`).join('')}`
}

const getPreviewTitleBarOverlay = (payload: Pick<PreviewWindowPayload, 'theme' | 'themeTokens'>) => ({
  color: normalizeTitleBarColor(
    payload.themeTokens?.colorBgContainer,
    payload.theme === 'dark' ? '#141414' : '#ffffff',
  ),
  symbolColor: payload.theme === 'dark' ? '#f0f0f0' : '#262626',
  height: 32,
})

const isValidPreviewThemeUpdate = (update: unknown): update is PreviewThemeUpdate => {
  if (!update || typeof update !== 'object') return false
  const candidate = update as Partial<PreviewThemeUpdate>
  return (candidate.theme === 'light' || candidate.theme === 'dark')
    && !!candidate.themeTokens
    && typeof candidate.themeTokens === 'object'
    && typeof candidate.themeTokens.colorPrimary === 'string'
    && typeof candidate.themeTokens.colorBgLayout === 'string'
    && typeof candidate.themeTokens.colorBgContainer === 'string'
    && typeof candidate.themeTokens.colorText === 'string'
}

const isValidPreviewPayload = (payload: unknown): payload is PreviewWindowPayload => {
  if (!payload || typeof payload !== 'object') return false
  const candidate = payload as Partial<PreviewWindowPayload>
  return typeof candidate.id === 'string'
    && candidate.id.length > 0
    && typeof candidate.title === 'string'
    && typeof candidate.url === 'string'
    && typeof candidate.fileExtension === 'string'
    && (candidate.theme === 'light' || candidate.theme === 'dark')
    && isValidPreviewThemeUpdate({ theme: candidate.theme, themeTokens: candidate.themeTokens })
    && typeof candidate.fileType === 'string'
    && supportedPreviewTypes.has(candidate.fileType as PreviewFileType)
}

const sendPreviewPayload = () => {
  if (!previewWin || previewWin.isDestroyed() || !previewPayload) return
  previewWin.webContents.send(PREVIEW_IPC.data, previewPayload)
}

const createOrUpdatePreviewWindow = async (payload: PreviewWindowPayload, ownerWebContents: WebContents) => {
  previewPayload = payload
  previewOwnerWebContents = ownerWebContents
  previewTextDirty = false
  previewCloseConfirmed = false

  if (previewWin && !previewWin.isDestroyed()) {
    previewWin.setTitle(payload.title || '文件预览')
    previewWin.setBackgroundColor(getPreviewBackgroundColor(payload))
    previewWin.setTitleBarOverlay(getPreviewTitleBarOverlay(payload))
    if (previewWin.isMinimized()) previewWin.restore()
    previewWin.show()
    previewWin.focus()
    sendPreviewPayload()
    return
  }

  const ownerWindow = BrowserWindow.fromWebContents(ownerWebContents)
  const display = ownerWindow
    ? screen.getDisplayMatching(ownerWindow.getBounds())
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const previewWidth = Math.min(1200, Math.max(640, display.workArea.width - 80))
  const previewHeight = Math.min(820, Math.max(420, display.workArea.height - 80))

  const target = new BrowserWindow({
    title: payload.title || '文件预览',
    icon: nodePath.join(process.env.PUBLIC, 'favicon.ico'),
    show: false,
    x: display.workArea.x + Math.round((display.workArea.width - previewWidth) / 2),
    y: display.workArea.y + Math.round((display.workArea.height - previewHeight) / 2),
    width: previewWidth,
    height: previewHeight,
    minWidth: Math.min(720, previewWidth),
    minHeight: Math.min(480, previewHeight),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: getPreviewTitleBarOverlay(payload),
    backgroundColor: getPreviewBackgroundColor(payload),
    webPreferences: {
      preload,
      webSecurity: false,
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  previewWin = target
  remoteMain.enable(target.webContents)

  target.once('ready-to-show', () => {
    if (!target.isDestroyed()) target.show()
  })
  target.on('close', (event) => {
    if (previewWin !== target || previewCloseConfirmed || !previewTextDirty) return
    event.preventDefault()
    target.webContents.send(PREVIEW_IPC.closeRequested)
  })
  target.on('closed', () => {
    if (previewWin === target) {
      previewWin = null
      previewPayload = null
      previewOwnerWebContents = null
      previewTextDirty = false
      previewCloseConfirmed = false
    }
  })
  target.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith('https:')) shell.openExternal(targetUrl)
    return { action: 'deny' }
  })

  try {
    if (process.env.VITE_DEV_SERVER_URL) {
      await target.loadURL(new URL('preview.html', url!).toString())
    } else {
      await target.loadFile(previewHtml)
    }
    sendPreviewPayload()
  } catch (error) {
    if (!target.isDestroyed()) target.destroy()
    throw error
  }
}

ipcMain.handle(PREVIEW_IPC.open, async (event, payload: unknown): Promise<PreviewWindowOpenResult> => {
  if (!isValidPreviewPayload(payload)) {
    return { success: false, error: '预览参数无效' }
  }

  try {
    await createOrUpdatePreviewWindow(payload, event.sender)
    return { success: true }
  } catch (error) {
    console.error('[preview] Failed to open preview window:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.on(PREVIEW_IPC.ready, (event) => {
  if (previewWin && event.sender === previewWin.webContents) sendPreviewPayload()
})

ipcMain.on(PREVIEW_IPC.updateTheme, (event, update: unknown) => {
  if (!previewWin || previewWin.isDestroyed() || !previewPayload) return
  if (!previewOwnerWebContents || event.sender !== previewOwnerWebContents) return
  if (!isValidPreviewThemeUpdate(update)) return

  previewPayload = { ...previewPayload, ...update }
  previewWin.setBackgroundColor(getPreviewBackgroundColor(previewPayload))
  previewWin.setTitleBarOverlay(getPreviewTitleBarOverlay(previewPayload))
  sendPreviewPayload()
})

ipcMain.on(PREVIEW_IPC.setTextDirty, (event, dirty: unknown) => {
  if (!previewWin || previewWin.isDestroyed() || event.sender !== previewWin.webContents) return
  previewTextDirty = dirty === true
})

ipcMain.on(PREVIEW_IPC.confirmClose, (event) => {
  if (!previewWin || previewWin.isDestroyed() || event.sender !== previewWin.webContents) return
  previewCloseConfirmed = true
  previewTextDirty = false
  previewWin.close()
})

ipcMain.on(PREVIEW_IPC.saveText, (event, request: PreviewTextSaveRequest) => {
  if (!previewWin || event.sender !== previewWin.webContents) return
  if (!previewPayload || request?.previewId !== previewPayload.id) return
  if (!previewOwnerWebContents || previewOwnerWebContents.isDestroyed()) return
  previewOwnerWebContents.send(PREVIEW_IPC.saveText, request)
})

ipcMain.on(PREVIEW_IPC.requestDownload, (event, request: PreviewDownloadRequest) => {
  if (!previewWin || event.sender !== previewWin.webContents) return
  if (!previewPayload || request?.previewId !== previewPayload.id) return
  if (!previewOwnerWebContents || previewOwnerWebContents.isDestroyed()) return
  previewOwnerWebContents.send(PREVIEW_IPC.requestDownload, request)
})

const cleanup = () => {
  if (previewWin && !previewWin.isDestroyed()) {
    previewWin.destroy()
    previewWin = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
}
app.on('before-quit', cleanup)
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(0) })
process.on('SIGTERM', () => { cleanup(); process.exit(0) })

const winWidth: number = 1000, winHeight: number = 750;

async function createWindow() {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return
  }
  const loadingWin = new BrowserWindow({
    show: false,
    frame: false, // 无边框（窗口、工具栏等），只包含网页内容
    width: winWidth,
    height: winHeight,
    minWidth: winWidth,
    minHeight: winHeight,
    resizable: false,
    // backgroundColor: "#2e2c29",
    transparent: true, // 窗口是否支持透明，如果想做高级效果最好为true
  });

  loadingWin.loadURL(loadingHtml);
  loadingWin.once('ready-to-show', () => {
    loadingWin.show();
  })

  win = new BrowserWindow({
    title: 'BucketView',
    icon: nodePath.join(process.env.PUBLIC, 'favicon.ico'),
    show: false,
    width: winWidth,
    height: winHeight,
    minWidth: winWidth,
    minHeight: winHeight,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(0,0,0,0)',
      symbolColor: '#747474',
      height: 32
    },
    webPreferences: {
      preload,
      webSecurity: false,
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true,
    },
  })
  remoteMain.enable(win.webContents);

  // 关闭窗口提示
  let isQuitting = false;
  win.on('close', e => {
    if (isQuitting || forceQuit) return;

    e.preventDefault();  // 阻止默认关闭行为，发送给前端处理
    if (BrowserWindow.getAllWindows().length === 0) return;

    win.webContents.send('request-app-close');
  });

  ipcMain.once('confirm-app-close', () => {
    isQuitting = true;
    if (previewWin && !previewWin.isDestroyed()) previewWin.destroy();
    win?.destroy();
  });

  const hideMainWindow = () => {
    if (!win || win.isDestroyed()) return;
    if (win.isFullScreen()) win.setFullScreen(false);
    win.hide();
  };
  ipcMain.removeAllListeners('hide-app-window');
  ipcMain.on('hide-app-window', hideMainWindow);
  // 兼容升级前已加载的渲染进程，旧的最小化指令也按隐藏处理。
  ipcMain.removeAllListeners('minimize-app-window');
  ipcMain.on('minimize-app-window', hideMainWindow);

  // Transfer concurrency preference (used by preload transfer queue on next app start /
  // and exposed for future live reconfiguration).
  ipcMain.removeAllListeners('renderer-error');
  ipcMain.on('renderer-error', (_event, payload: any) => {
    logger.error('renderer', payload?.info || 'renderer-error', payload);
  });

  try { ipcMain.removeHandler('app-get-log-path'); } catch {}
  ipcMain.handle('app-get-log-path', () => {
    return {
      file: logger.getLogFilePath(),
      directory: logger.getLogDirectory(),
    };
  });
  try { ipcMain.removeHandler('app-open-log-dir'); } catch {}
  ipcMain.handle('app-open-log-dir', async () => {
    const dir = logger.getLogDirectory();
    if (!dir) return { success: false, message: '日志目录不可用' };
    const err = await shell.openPath(dir);
    return err ? { success: false, message: err } : { success: true };
  });

  ipcMain.removeAllListeners('set-transfer-concurrency');
  ipcMain.on('set-transfer-concurrency', (_event, value: unknown) => {
    const n = Math.max(1, Math.min(8, Math.floor(Number(value) || 3)));
    try {
      const store = new Store();
      store.set('app.transferConcurrency', n);
      process.env.BUCKETVIEW_TRANSFER_CONCURRENCY = String(n);
      logger.info('transfer', 'concurrency updated', { concurrency: n });
    } catch (error) {
      logger.warn('transfer', 'failed to persist concurrency', error);
    }
  });
  try {
    const store = new Store();
    const saved = Number(store.get('app.transferConcurrency', 3));
    if (Number.isFinite(saved) && saved >= 1) {
      process.env.BUCKETVIEW_TRANSFER_CONCURRENCY = String(Math.min(8, Math.floor(saved)));
    }
  } catch {}

  ipcMain.removeAllListeners('updater-check');
  ipcMain.on('updater-check', () => {
    void handlerUpdater.check(win.webContents, undefined, true);
  });

  ipcMain.removeAllListeners('updater-download');
  ipcMain.on('updater-download', () => {
    void handlerUpdater.download(win.webContents);
  });

  ipcMain.removeAllListeners('updater-install');
  ipcMain.on('updater-install', async () => {
    try {
      const state = await handlerUpdater.installDownloaded(win.webContents);
      if (!state) return;

      // Installer needs the app fully exited so package files are not locked.
      forceQuit = true;
      isQuitting = true;
      try { win.removeAllListeners('close'); } catch {}
      try {
        if (previewWin && !previewWin.isDestroyed()) {
          previewWin.removeAllListeners('close');
          previewWin.destroy();
        }
      } catch {}
      try {
        if (tray) {
          tray.destroy();
          tray = null as any;
        }
      } catch {}
      try {
        if (win && !win.isDestroyed()) {
          win.destroy();
        }
      } catch {}
      // Force process exit; app.quit() can hang on Windows with open native modules / tray.
      setTimeout(() => {
        try { app.exit(0); } catch { process.exit(0); }
      }, 200);
    } catch (error) {
      console.error('[updater] install handler failed:', error);
    }
  });

  let startupUpdateScheduled = false;
  const scheduleStartupUpdateCheck = () => {
    if (startupUpdateScheduled || !win || win.isDestroyed()) return;
    startupUpdateScheduled = true;
    // Defer update check until UI is interactive to reduce startup jank.
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      void handlerUpdater.check(win.webContents).catch((error) => {
        logger.warn('updater', 'startup check failed', error);
      });
    }, 5000);
  };

  const showMainWindowAndCheckUpdate = async () => {
    if (!win || win.isDestroyed()) return;
    win.show();
    if (!loadingWin.isDestroyed()) {
      loadingWin.hide();
      loadingWin.close();
    }
    scheduleStartupUpdateCheck();
  };

  ipcMain.once('removeLoading', async () => {
    if (!loadingWin.isDestroyed()) {
      await showMainWindowAndCheckUpdate();
    }
  });

  win.once('ready-to-show', () => {
    setTimeout(async () => {
      if (!loadingWin.isDestroyed()) {
        await showMainWindowAndCheckUpdate();
      }
    }, 3000);
  })

  if (process.env.VITE_DEV_SERVER_URL) { // electron-vite-vue#298
    win.loadURL(url)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // // Test actively push message to the Electron-Renderer
  // win.webContents.on('did-finish-load', () => {
  //   win?.webContents.send('main-process-message', new Date().toLocaleString())
  // })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
  // win.webContents.on('will-navigate', (event, url) => { }) #344
}

app.whenReady().then(async () => {
  if (!gotTheLock) return;

  const loginItemSettings = app.getLoginItemSettings();
  const shouldOpenWindow = Platform.windows()
    ? process.argv.indexOf("--openAsHidden") < 0
    : Platform.macos()
      ? !loginItemSettings.wasOpenedAsHidden
      : true;

  if (shouldOpenWindow) {
    await createWindow();
  }

  try {
    tray = new Tray(nativeImage.createFromPath(nodePath.join(process.env.PUBLIC, "favicon.png")).resize({ width: 16, height: 16 }));
  } catch (err) {
    console.error('[main] Failed to create tray:', err);
  }
  const loginItemName = 'BucketView';
  const loginItemPath = process.execPath;
  const loginItemArgs = app.isPackaged
    ? ["--openAsHidden"]
    : [app.getAppPath(), "--openAsHidden"];
  const windowsRunKey = new Registry({
    hive: Registry.HKCU,
    key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  });

  const readOpenAtLogin = async (): Promise<boolean> => {
    if (!Platform.windows()) {
      return app.getLoginItemSettings({ path: loginItemPath, args: loginItemArgs }).openAtLogin;
    }

    return new Promise<boolean>((resolve) => {
      windowsRunKey.get(loginItemName, (error: any, item: any) => {
        if (error || !item?.value) {
          resolve(false);
          return;
        }
        const command = String(item.value).toLowerCase();
        resolve(
          command.includes(loginItemPath.toLowerCase()) &&
          command.includes('--openashidden')
        );
      });
    });
  };

  const writeOpenAtLogin = async (enabled: boolean): Promise<boolean> => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      name: loginItemName,
      path: loginItemPath,
      args: loginItemArgs,
      openAsHidden: true,
    });

    // 回读系统实际状态，避免菜单显示已切换但注册表未真正写入。
    await new Promise(resolve => setTimeout(resolve, 80));
    return readOpenAtLogin();
  };

  let openAtLogin = await readOpenAtLogin();
  // 原生 checkbox 会让 Windows 为整个菜单预留一列勾选区，造成明显左侧空白。
  // 改用普通状态菜单项，并在切换后重建菜单。
  openAtLogin = Boolean(openAtLogin);
  const rebuildTrayMenu = () => {
    const trayMenu = Menu.buildFromTemplate([
      {
        label: `开机启动：${openAtLogin ? '已开启' : '已关闭'}`,
        click: async () => {
          const requestedState = !openAtLogin;
          try {
            const actualState = await writeOpenAtLogin(requestedState);
            if (actualState !== requestedState) {
              throw new Error('系统未保存开机启动设置');
            }
            openAtLogin = actualState;
            rebuildTrayMenu();
            if (Notification.isSupported()) {
              new Notification({
                title: 'BucketView',
                body: openAtLogin ? '已开启开机自动启动' : '已关闭开机自动启动',
              }).show();
            }
          } catch (error) {
            openAtLogin = await readOpenAtLogin();
            rebuildTrayMenu();
            console.error('[main] Failed to update open-at-login setting:', error);
            if (Notification.isSupported()) {
              new Notification({
                title: 'BucketView',
                body: '开机启动设置失败，请检查系统权限后重试',
              }).show();
            }
          }
        }
      },
      { type: 'separator' },
      {
        label: '显示窗口',
        click: () => {
          void createWindow();
        }
      },
      { type: 'separator' },
      {
        label: '退出程序',
        click: () => {
          app.quit();
        }
      }
    ]);
    tray?.setContextMenu(trayMenu);
  };

  rebuildTrayMenu();
  tray?.setToolTip('BucketView');
  tray?.on('click', () => {
    void createWindow();
  });

  if (shouldOpenWindow) {
    return;
  }

  // 自动挂载（按需下载 rclone）
  const store = new Store();
  const targets = store.get("app.openAtLogin.targets", {}) as { [key: string]: { connection: Connection, mountTarget: MountTarget } };
  const preferredFuseBin = store.get(`app.openAtLogin.fuseBin`, "") as string;
  let resourcesDir = nodePath.dirname(app.getAppPath());
  if (process.env.VITE_DEV_SERVER_URL) {
    resourcesDir = app.getAppPath();
  }
  const ensure = await ensureRcloneBinary({
    userDataDir: app.getPath('userData'),
    resourcesDir,
    preferredPath: preferredFuseBin,
  });
  if (!ensure.success) {
    console.error('[auto-mount] rclone unavailable:', ensure.message || 'unknown error');
    return;
  }
  const fuseBinPath = ensure.path || '';
  if (!fuseBinPath) {
    console.error('[auto-mount] rclone path missing');
    return;
  }
  store.set('app.openAtLogin.fuseBin', fuseBinPath);
  const keys = Object.keys(targets);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const { connection, mountTarget } = targets[key];
    const resp = await Fuse.mount(connection, mountTarget, fuseBinPath);
    if (!resp.success) {
      // TODO: 记录日志
    }
  }
})

app.on('before-quit', () => {
  // 系统退出、托盘退出和更新安装属于真正退出，不再触发标题栏关闭策略。
  forceQuit = true;
});

app.on('window-all-closed', () => {
  win = null
  previewWin = null
  previewPayload = null
  previewOwnerWebContents = null
  previewTextDirty = false
  previewCloseConfirmed = false
  if (process.platform !== 'darwin' || forceQuit) {
    app.quit()
  }
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  } else {
    createWindow()
  }
})

app.on('activate', () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  } else {
    createWindow()
  }
})
