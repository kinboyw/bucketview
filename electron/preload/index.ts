import { contextBridge, clipboard, FileFilter, ipcRenderer, IpcRendererEvent } from 'electron';
import { PREVIEW_IPC } from '../common/preview';
import type { PreviewDownloadRequest, PreviewTextSaveRequest, PreviewThemeUpdate, PreviewWindowPayload } from '../common/preview';
import {
  Storage,
  Connection,
  MountTarget,
  DeleteObjectResponse,
  CreateDirectoryResponse,
  TransferObjectOption,
  ProgressCallback,
  ListObjectsResponse,
  CancelFunction,
  SignObjectResponse,
  FuseMountResponse,
  FuseUmountResponse,
  UpdaterResponse,
  TransferFile,
  HeadObjectResponse,
} from './types';
import { S3Storage } from './storage/s3';
import { Transfer, markCancel, clearCancel } from './storage/transfer';
import { app, dialog, getCurrentWebContents, shell } from '@electron/remote';
import nodePath from 'node:path';
import { Fuse } from './storage/fuse';
import nodeOs from 'node:os';
import { Platform } from '../common';
import { ensureRcloneBinary, managedRclonePath, bundledRclonePath } from '../common/rclone-bin'
import { decryptSecret as decryptSecretValue, encryptSecret as encryptSecretValue } from '../common/secret-crypto';
import fse from 'fs-extra';
import { stat } from 'original-fs';
import { constant } from 'lodash';
import { EventEmitter } from 'events';

const deepLoopTraversal = async (
  directory: string,
  filePathArr: TransferFile[],
  rootDirectory: string,
  prefix: string
) => {
  const filesList = await fse.readdir(directory);
  for (let i = 0, len = filesList.length; i < len; i++) {
    const filename = filesList[i];
    const filePath = nodePath.join(directory, filename);
    const stats = await fse.stat(filePath);
    if (stats.isDirectory()) {
      await deepLoopTraversal(filePath, filePathArr, rootDirectory, prefix);
    } else {
      const isFile = stats.isFile();
      isFile &&
        filePathArr.push({
          name: filePath,
          prefix: [prefix, nodePath.dirname(filePath).replace(rootDirectory, '').split(nodePath.sep).join('/')].filter(Boolean).join('/'),
          size: stats.size,
          lastModified: stats.mtimeMs,
        });
    }
  }
};

const minio = new S3Storage();
const transferMinio = new S3Storage();

const storages: { [key: string]: Storage } = { minio: minio };
const transferStorages: { [key: string]: Storage } = { minio: transferMinio };
const eventBus = new EventEmitter();
const transfer = new Transfer(transferStorages, eventBus);

const getOptionString = (value: any, fallback: string = '') => typeof value === 'string' ? value : fallback;

const createTransferJob = (key: string, storage: Storage, options: TransferObjectOption) => {
  const connection = options.connection || storage.connection;
  return {
    key,
    uid: options.uid,
    prefix: options.prefix,
    objectName: options.objectName,
    localPath: options.localPath,
    name: options.name,
    connection,
    connectionId: options.connectionId || connection?.id || '',
    bucket: getOptionString(options.bucket, storage.bucket),
    pathPrefix: getOptionString(options.pathPrefix, storage.pathPrefix),
    sourceDirectory: options.sourceDirectory,
    totalBytes: options.totalBytes,
    forceOverwrite: options.forceOverwrite,
    resumeFrom: options.resumeFrom,
    record: options,
  };
};


contextBridge.exposeInMainWorld('storage', {
  emit(event: string, ...args: any[]) {
    eventBus.emit(event, ...args)
  },
  on(event: string, listerner: (...args :any[]) => void){
    eventBus.on(event, listerner)
  },
  changeConfig(key: string, connection: Connection): void {
    storages[key]?.changeConfig(connection);
  },
  setTarget(key: string, bucket: string, pathPrefix?: string): void {
    storages[key]?.setTarget(bucket, pathPrefix);
  },
  listBuckets(key: string): Promise<string[]> {
    return storages[key]?.listBuckets();
  },
  getObject(key: string, options: TransferObjectOption): void {
    const storage = storages[key];
    transfer.Add({
      type: 'download',
      ...createTransferJob(key, storage, options),
      forceOverwrite: (options as any).forceOverwrite,
      resumeFrom: (options as any).resumeFrom,
    });
  },
  putObject(key: string, options: TransferObjectOption): void {
    const storage = storages[key];
    transfer.Add({
      type: 'upload',
      ...createTransferJob(key, storage, options),
    });
  },
  listObjects(key: string, prefix: string, startAfter: string): Promise<ListObjectsResponse> {
    return storages[key]?.listObjects(prefix, startAfter);
  },
  deleteObject(key: string, filenames: string[]): Promise<DeleteObjectResponse> {
    return storages[key]?.deleteObject(filenames);
  },
  signObject(key: string, objectName: string): Promise<SignObjectResponse> {
    return storages[key]?.signObject(objectName);
  },
  createDirectory(key: string, prefix: string): Promise<CreateDirectoryResponse> {
    return storages[key]?.createDirectory(prefix);
  },
  deleteDirectory(key: string, prefix: string): Promise<CreateDirectoryResponse> {
    return storages[key]?.deleteDirectory(prefix);
  },
  headObject(key: string, objectName: string): Promise<HeadObjectResponse> {
    return storages[key]?.headObject(objectName);
  },
  listQueue(offset: number, limit: number) {
    return transfer.listQueue(offset, limit)
  },
  listFailedQueue(offset: number, limit: number) {
    return transfer.listFailedQueue(offset, limit)
  },
  listSuccededQueue(offset: number, limit: number) {
    return transfer.listSuccededQueue(offset, limit)
  },
  upsertTransferRecord(uid: string, data: any) {
    transfer.upsertTransferRecord(uid, data);
  },
  listTransferRecords(offset: number, limit: number) {
    return transfer.listTransferRecords(offset, limit);
  },
  countTransferRecords() {
    return transfer.countTransferRecords();
  },
  isTransferReady() {
    return transfer.isReady();
  },
  waitTransferReady() {
    return transfer.whenReady();
  },
  deleteTransferRecord(uid: string) {
    transfer.deleteTransferRecord(uid);
  },
  clearTransferRecords() {
    transfer.clearTransferRecords();
  },
  recoverInterrupted() {
    return transfer.recoverInterrupted();
  },
  markCancel(uid: string) {
    markCancel(uid);
  },
  clearCancel(uid: string) {
    clearCancel(uid);
  },
});

contextBridge.exposeInMainWorld('native', {
  getLocalFilename(filters?: FileFilter[]): string {
    const ret = dialog.showOpenDialogSync({
      filters,
      properties: ['openFile'], // 选择文件
    });
    if (!ret) return '';
    return ret[0];
  },
  getLocalSaveFolder(): string[] {
    const ret = dialog.showOpenDialogSync({
      properties: ['openDirectory'],
    }) || [];
    return ret ;
  },
  async getLocalFilenames(prefix: string): Promise<TransferFile[]> {
    const ret = dialog.showOpenDialogSync({
      properties: ['openFile', 'multiSelections', 'openDirectory'],
    }) || [];
    const filenames: Array<TransferFile> = [];
    for (let i = 0; i < ret.length; i++) {
      const name = ret[i];
      const stats = fse.statSync(name);
      if (stats.isDirectory()) {
        await deepLoopTraversal(name, filenames, nodePath.dirname(name) + nodePath.sep, prefix);
        continue;
      }
      filenames.push({ name, prefix: prefix, size: stats.size, lastModified: stats.mtimeMs });
    }
    return filenames;
  },
  async getLocalFiles(prefix: string): Promise<TransferFile[]> {
    const ret = dialog.showOpenDialogSync({
      properties: ['openFile', 'multiSelections'],
    }) || [];
    return ret.map(name => {
      const stats = fse.statSync(name);
      return { name, prefix, size: stats.size, lastModified: stats.mtimeMs };
    });
  },
  async getLocalPaths(paths: string[], prefix: string): Promise<TransferFile[]> {
    const filenames: Array<TransferFile> = [];
    for (const path of paths) {
      const stats = fse.statSync(path);
      if (stats.isDirectory()) {
        await deepLoopTraversal(path, filenames, nodePath.dirname(path) + nodePath.sep, prefix);
      } else {
        filenames.push({ name: path, prefix, size: stats.size, lastModified: stats.mtimeMs });
      }
    }
    return filenames;
  },
  pathBasename(path: string): string {
    return nodePath.basename(path);
  },
  pathDirname(path: string): string {
    return nodePath.dirname(path);
  },
  writeClipboard(s: string): void {
    clipboard.writeText(s, 'selection');
  },
  osType(): string {
    return nodeOs.type();
  },
  openDevTools(): void {
    getCurrentWebContents().openDevTools();
  },
  openLocalFolder(path: string): void {
    shell.openPath(path);
  },
  showLocalFile(path: string): void {
    shell.showItemInFolder(path);
  },
  pathJoin(...parts: string[]): string {
    return nodePath.join(...parts);
  },
  localFileSize(path: string): number | null {
    try {
      const stats = fse.statSync(path);
      return stats.size;
    } catch {
      return null;
    }
  },
  resolveUniquePath(localPath: string): string {
    // If file doesn't exist, return original path
    if (!fse.existsSync(localPath)) return localPath;
    // Insert "(n)" before the LAST extension dot
    const lastDotIdx = localPath.lastIndexOf('.');
    const base = lastDotIdx > 0 ? localPath.slice(0, lastDotIdx) : localPath;
    const ext = lastDotIdx > 0 ? localPath.slice(lastDotIdx) : '';
    for (let n = 2; n <= 99; n++) {
      const candidate = `${base} (${n})${ext}`;
      if (!fse.existsSync(candidate)) return candidate;
    }
    // Fallback: just return original (will be overwritten)
    return localPath;
  },
  fuseBin(): string {
    // Prefer previously downloaded/managed binary, then optional bundled binary for dev.
    const managed = managedRclonePath(app.getPath('userData'), nodeOs.platform(), nodeOs.arch());
    if (fse.existsSync(managed)) return managed;

    let resources = nodePath.dirname(app.getAppPath());
    if (process.env.VITE_DEV_SERVER_URL) {
      resources = app.getAppPath();
    }
    const bundled = bundledRclonePath(resources, nodeOs.platform(), nodeOs.arch());
    if (fse.existsSync(bundled)) return bundled;
    return managed;
  },
  async ensureRclone(preferredPath?: string): Promise<{ success: boolean; path?: string; message?: string; source?: string }> {
    let resources = nodePath.dirname(app.getAppPath());
    if (process.env.VITE_DEV_SERVER_URL) {
      resources = app.getAppPath();
    }
    const result = await ensureRcloneBinary({
      userDataDir: app.getPath('userData'),
      resourcesDir: resources,
      preferredPath,
    });
    if (result.success && result.path) {
      return { success: true, path: result.path, source: result.source };
    }
    return { success: false, message: result.message || 'rclone 不可用' };
  },
  appVersion(): string {
    return app.getVersion();
  },
  encryptSecret(value: string): string {
    return encryptSecretValue(value);
  },
  decryptSecret(value: string): string {
    return decryptSecretValue(value);
  },
  setTransferConcurrency(value: number): void {
    ipcRenderer.send('set-transfer-concurrency', value);
  },
  async getLogPath(): Promise<{ file: string; directory: string }> {
    return ipcRenderer.invoke('app-get-log-path');
  },
  async openLogDirectory(): Promise<{ success: boolean; message?: string }> {
    return ipcRenderer.invoke('app-open-log-dir');
  },
  ipc(channel: string, listener: (event: IpcRendererEvent, ...args: UpdaterResponse[]) => void): void {
    ipcRenderer.on(channel, listener);
  },
  ipcSend(channel: string, ...args: any[]): void {
    ipcRenderer.send(channel, ...args);
  },
  getPathForFile(file: File): string {
    return (file as File & { path?: string }).path || '';
  },
  readLocalFile(path: string): string {
    return fse.readFileSync(path, 'utf-8');
  },
  writeTempFile(filename: string, content: string): string {
    const tmpDir = nodeOs.tmpdir();
    const tmpPath = nodePath.join(tmpDir, `bucketview-${Date.now()}-${filename}`);
    fse.writeFileSync(tmpPath, content, 'utf-8');
    return tmpPath;
  },
});

contextBridge.exposeInMainWorld('previewWindow', {
  open(payload: PreviewWindowPayload) {
    return ipcRenderer.invoke(PREVIEW_IPC.open, payload);
  },
  ready() {
    ipcRenderer.send(PREVIEW_IPC.ready);
  },
  updateTheme(update: PreviewThemeUpdate) {
    ipcRenderer.send(PREVIEW_IPC.updateTheme, update);
  },
  setTextDirty(dirty: boolean) {
    ipcRenderer.send(PREVIEW_IPC.setTextDirty, dirty);
  },
  onCloseRequested(listener: () => void) {
    const handler = () => listener();
    ipcRenderer.on(PREVIEW_IPC.closeRequested, handler);
    return () => ipcRenderer.removeListener(PREVIEW_IPC.closeRequested, handler);
  },
  confirmClose() {
    ipcRenderer.send(PREVIEW_IPC.confirmClose);
  },
  onData(listener: (payload: PreviewWindowPayload) => void) {
    const handler = (_event: IpcRendererEvent, payload: PreviewWindowPayload) => listener(payload);
    ipcRenderer.on(PREVIEW_IPC.data, handler);
    return () => ipcRenderer.removeListener(PREVIEW_IPC.data, handler);
  },
  saveText(request: PreviewTextSaveRequest) {
    ipcRenderer.send(PREVIEW_IPC.saveText, request);
  },
  onSaveText(listener: (request: PreviewTextSaveRequest) => void) {
    const handler = (_event: IpcRendererEvent, request: PreviewTextSaveRequest) => listener(request);
    ipcRenderer.on(PREVIEW_IPC.saveText, handler);
    return () => ipcRenderer.removeListener(PREVIEW_IPC.saveText, handler);
  },
  requestDownload(request: PreviewDownloadRequest) {
    ipcRenderer.send(PREVIEW_IPC.requestDownload, request);
  },
  onRequestDownload(listener: (request: PreviewDownloadRequest) => void) {
    const handler = (_event: IpcRendererEvent, request: PreviewDownloadRequest) => listener(request);
    ipcRenderer.on(PREVIEW_IPC.requestDownload, handler);
    return () => ipcRenderer.removeListener(PREVIEW_IPC.requestDownload, handler);
  },
});

contextBridge.exposeInMainWorld('fuse', {
  checkMount(mountpoint: string | undefined, retry: number = 1): Promise<boolean> {
    return Fuse.checkMount(mountpoint, retry);
  },

  driveList(): Promise<string[]> {
    return Fuse.driveList();
  },

  preMountCleanup(mountTarget: MountTarget): Promise<void> {
    return Fuse.preMountCleanup(mountTarget);
  },

  mount(connection: Connection, mountTarget: MountTarget, fuseBin: string): Promise<FuseMountResponse> {
    return Fuse.mount(connection, mountTarget, fuseBin);
  },

  umount(connection: Connection, mountTarget: MountTarget): Promise<FuseUmountResponse> {
    return Fuse.umount(connection, mountTarget);
  },

  vfsRefresh(targetId: string, dir: string): Promise<void> {
    return Fuse.vfsRefresh(targetId, dir);
  },

  vfsForget(targetId: string, file: string): Promise<void> {
    return Fuse.vfsForget(targetId, file);
  },

  vfsForgetDir(targetId: string, dir: string): Promise<void> {
    return Fuse.vfsForgetDir(targetId, dir);
  },

  vfsRefreshVerified(targetId: string, dir: string, forgetFiles?: string[], expectDeleted?: string[], expectAdded?: string[], maxRetries?: number) {
    return Fuse.vfsRefreshVerified(targetId, dir, forgetFiles, expectDeleted, expectAdded, maxRetries);
  },

  isWithinMountScope(appDir: string, mountPathPrefix: string): boolean {
    return Fuse.isWithinMountScope(appDir, mountPathPrefix);
  },

  notifyExplorerRefresh(dirPath: string, deletedFiles: string[], targetId: string, vfsDir: string, connectionId: string, bucket: string, pathPrefix: string, cacheDir: string): Promise<void> {
    return Fuse.notifyExplorerRefresh(dirPath, deletedFiles, targetId, vfsDir, connectionId, bucket, pathPrefix, cacheDir);
  },
});

window.addEventListener('message', (ev) => {
  if (ev.data && ev.data.payload === 'removeLoading') {
    ipcRenderer.send('removeLoading');
  }
});
