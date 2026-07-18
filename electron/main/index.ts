import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray, Notification, ipcMain, screen, type WebContents } from 'electron'
import nodeOs from 'node:os'
import nodePath from 'node:path'
import * as remoteMain from '@electron/remote/main';
import loadingHtml from "./loading";
import { Platform } from "../common";
import Store from "electron-store";
import { Fuse } from '../preload/storage/fuse';
import { Connection, MountTarget } from '../preload/types';
import Registry from "winreg";
import { handlerUpdater } from "./updater";
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
    if (process.env.VITE_DEV_SERVER_URL) {
      return;
    }
    if (isQuitting) return;

    e.preventDefault();  // 阻止默认关闭行为，发送给前端处理
    if (BrowserWindow.getAllWindows().length === 0) return;

    win.webContents.send('request-app-close');
  });

  ipcMain.once('confirm-app-close', () => {
    isQuitting = true;
    if (previewWin && !previewWin.isDestroyed()) previewWin.destroy();
    win?.destroy();
  });

  ipcMain.on('updater-download', () => {
    handlerUpdater.download(win.webContents);
  });

  ipcMain.on('updater-install', async () => {
    const state = await handlerUpdater.installDownloaded(win.webContents);
    if (state) {
      isQuitting = true;
      win.removeAllListeners("close");
      if (tray) {
        tray.destroy();
      }
      app.quit();
    }
  });

  const showMainWindowAndCheckUpdate = async () => {
    win.show();
    loadingWin.hide();
    loadingWin.close();
    await handlerUpdater.check(win.webContents);
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
  let openAtLogin = loginItemSettings?.openAtLogin;
  if (Platform.windows()) {
    try {
      const appPath = app.getPath('exe');
      const key = new Registry({
        hive: Registry.HKCU,
        key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      });
      openAtLogin = await new Promise<boolean>((resolve, reject) => {
        key.get(app.name, (error: any, item: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(item && item.value.indexOf(appPath) >= 0);
          }
        });
      });
    } catch (error) {
    }
  }
  // 配置右键菜单
  var trayMenu = Menu.buildFromTemplate([
    {
      type: 'checkbox',
      label: '开机启动',
      checked: openAtLogin,
      click: () => {
        if (app.isPackaged) {
          app.setLoginItemSettings({
            openAtLogin: !loginItemSettings?.openAtLogin,
            path: process.execPath,
            openAsHidden: true,
            args: ["--openAsHidden"],
          })
        }
      }
    },
    { type: 'separator' },
    {
      label: '显示窗口',
      click: () => {
        createWindow();
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
  tray?.setToolTip('BucketView');

  if (shouldOpenWindow) {
    return;
  }

  // 自动挂载
  const store = new Store();
  const targets = store.get("app.openAtLogin.targets", {}) as { [key: string]: { connection: Connection, mountTarget: MountTarget } };
  const fuseBin = store.get(`app.openAtLogin.fuseBin`, "") as string;
  const keys = Object.keys(targets);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const { connection, mountTarget } = targets[key];
    const resp = await Fuse.mount(connection, mountTarget, fuseBin);
    if (!resp.success) {
      // TODO: 记录日志
    }
  }
})

if (process.platform === 'darwin') {
  app.on('before-quit', function () {
    forceQuit = true;
  });
}

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
