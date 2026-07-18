import { FileFilter, IpcRendererEvent } from 'electron';

export type PreviewFileType = 'image' | 'video' | 'audio' | 'pdf' | 'model' | 'office' | 'text';
export type PreviewTheme = 'light' | 'dark';

export interface PreviewThemeTokens {
  colorPrimary: string;
  colorBgBase: string;
  colorBgLayout: string;
  colorBgContainer: string;
  colorBgElevated: string;
  colorBgSpotlight: string;
  colorText: string;
  colorTextSecondary: string;
  colorTextTertiary: string;
  colorBorder: string;
  colorBorderSecondary: string;
  colorFillSecondary: string;
  colorFillTertiary: string;
}

export interface PreviewThemeUpdate {
  theme: PreviewTheme;
  themeTokens: PreviewThemeTokens;
}

export interface PreviewImageItem {
  name: string;
  url: string;
  size?: number;
}

export interface PreviewWindowPayload {
  id: string;
  title: string;
  size?: number;
  fileType: PreviewFileType;
  fileExtension: string;
  url: string;
  theme: PreviewTheme;
  themeTokens: PreviewThemeTokens;
  images?: PreviewImageItem[];
  imageStartIndex?: number;
  chunked?: boolean;
  fileSize?: number;
  canSaveText?: boolean;
}

export interface PreviewWindowOpenResult {
  success: boolean;
  error?: string;
}

export interface PreviewTextSaveRequest {
  previewId: string;
  content: string;
}

export interface PreviewDownloadRequest {
  previewId: string;
}

type LegacyStorageConfigMap = { [key: string]: LegacyStorageConfig };

// ─── 新模型：Connection + MountTarget ───

export interface Connection {
  id: string;
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
  useSSL?: boolean;
  pathStyle?: boolean;
  /** 可选：限定该连接只访问指定桶，为空则可访问所有有权限的桶 */
  bucket?: string;
  /** 可选：限定访问桶内指定路径前缀，仅在 bucket 指定时生效 */
  pathPrefix?: string;
  /** 是否启用，禁用时不显示标签页 */
  enabled?: boolean;
  /** 可选：连接所属的分组名称，用于在侧边栏分类显示 */
  group?: string;
}

export interface MountTarget {
  id: string;
  /** 所属 connection ID */
  connectionId: string;
  bucket: string;
  pathPrefix: string;
  mountPoint?: string;
  cacheDirectory?: string;
  enabled?: boolean;
}

export interface Storage {
  /** 名称 全局唯一 */
  name: string;
  /** SDK 相关文档地址 */
  docUrl?: string;
  connection: Connection;
  bucket: string;
  pathPrefix: string;
  /** 切换连接凭据 */
  changeConfig: (connection: Connection, proxy?: string) => void;
  /** 设置当前目标桶和路径前缀 */
  setTarget: (bucket: string, pathPrefix?: string) => void;
  /** 列出连接下所有桶 */
  listBuckets: () => Promise<string[]>;
  /** 下载对象 */
  getObject: (options: TransferObjectOption, cb: ProgressCallback, cancelFunc: CancelFunction) => Promise<void>;
  /** 上传对象 */
  putObject: (options: TransferObjectOption, cb: ProgressCallback, cancelFunc: CancelFunction) => Promise<void>;
  /** 检查远程对象是否存在及元数据 */
  headObject: (objectName: string) => Promise<HeadObjectResponse>;
  /** 获取对象列表 */
  listObjects: (prefix: string, nextContinuationToken: string | null) => Promise<ListObjectsResponse>;
  /** 删除对象 */
  deleteObject: (objectNames: string[]) => Promise<DeleteObjectResponse>;
  /** 签名对象 */
  signObject: (objectName: string) => Promise<SignObjectResponse>;
  /** 创建目录 */
  createDirectory: (prefix: string) => Promise<CreateDirectoryResponse>;
  /** 删除目录 */
  deleteDirectory: (prefix: string) => Promise<DeleteObjectResponse>;
}

export interface PreloadStorage {
  emit: (event: string, ...args: any[]) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
  changeConfig: (key: string, connection: Connection) => void;
  setTarget: (key: string, bucket: string, pathPrefix?: string) => void;
  listBuckets: (key: string) => Promise<string[]>;
  getObject: (key: string, options: TransferObjectOption) => void;
  putObject: (key: string, options: TransferObjectOption) => void;
  headObject: (key: string, objectName: string) => Promise<HeadObjectResponse>;
  listObjects: (key: string, prefix: string, nextContinuationToken: string | null) => Promise<ListObjectsResponse>;
  deleteObject: (key: string, objectNames: string[]) => Promise<DeleteObjectResponse>;
  signObject: (key: string, objectName: string) => Promise<SignObjectResponse>;
  createDirectory: (key: string, prefix: string) => Promise<CreateDirectoryResponse>;
  deleteDirectory: (key: string, prefix: string) => Promise<DeleteObjectResponse>;
  listQueue: (offset: number, limit: number) => any;
  listFailedQueue: (offset: number, limit: number) => any;
  listSuccededQueue: (offset: number, limit: number) => any;
  upsertTransferRecord: (uid: string, data: any) => void;
  listTransferRecords: (offset: number, limit: number) => any[];
  countTransferRecords: () => number;
  deleteTransferRecord: (uid: string) => void;
  clearTransferRecords: () => void;
  recoverInterrupted: () => any[];
  markCancel: (uid: string) => void;
  clearCancel: (uid: string) => void;
}

export interface PreloadNative {
  getLocalSaveFolder: () => string[];
  getLocalFilenames: (prefix: string) => Promise<TransferFile[]>;
  getLocalFiles: (prefix: string) => Promise<TransferFile[]>;
  getLocalPaths: (paths: string[], prefix: string) => Promise<TransferFile[]>;
  getLocalFilename: (filters?: FileFilter[]) => string;
  getPathForFile: (file: File) => string;
  pathBasename: (path: string) => string;
  pathDirname: (path: string) => string;
  writeClipboard: (s: string) => void;
  osType: () => string;
  openDevTools: () => void;
  openLocalFolder: (path: string) => void;
  showLocalFile: (path: string) => void;
  pathJoin: (...parts: string[]) => string;
  localFileSize: (path: string) => number | null;
  resolveUniquePath: (localPath: string) => string;
  fuseBin: () => string;
  appVersion: () => string;
  ipc: (channel: string, listener: (event: IpcRendererEvent, ...args: UpdaterResponse[]) => void) => void;
  ipcSend: (channel: string, ...args: any[]) => void;
  readLocalFile: (path: string) => string;
  writeTempFile: (filename: string, content: string) => string;
}

export interface PreloadPreviewWindow {
  open: (payload: PreviewWindowPayload) => Promise<PreviewWindowOpenResult>;
  ready: () => void;
  updateTheme: (update: PreviewThemeUpdate) => void;
  setTextDirty: (dirty: boolean) => void;
  onCloseRequested: (listener: () => void) => () => void;
  confirmClose: () => void;
  onData: (listener: (payload: PreviewWindowPayload) => void) => () => void;
  saveText: (request: PreviewTextSaveRequest) => void;
  onSaveText: (listener: (request: PreviewTextSaveRequest) => void) => () => void;
  requestDownload: (request: PreviewDownloadRequest) => void;
  onRequestDownload: (listener: (request: PreviewDownloadRequest) => void) => () => void;
}

export type StorageOptionValidationRule =
  | 'domain'
  | 'domainPath'
  | 'domainQuery'
  | {
      pattern: RegExp | string;
      message: string;
    };

export type StorageOptionValidationRuleArr = StorageOptionValidationRule[];

export declare enum StorageOptionsSpan {
  small = 4,
  middle = 8,
  large = 12,
}

interface StorageOption {
  /** 表单字段描述 */
  label: string;
  /** 表单字段名 */
  name: string;
  /** 默认值 */
  value: any;
  /** 值类型 */
  valueType: 'input' | 'switch' | 'select';
  /** form 控件长度 */
  span?: StorageOptionsSpan | number;
  /** select 选项 */
  options?: {
    label: string;
    value: any;
  }[];
  /** 是否必填 */
  required?: boolean;
  /** 验证规则 */
  validationRule?: StorageOptionValidationRuleArr;
  /** 配置项描述 */
  desc?: string;
}

export type StorageOptions = StorageOption[];

export interface TransferObjectOption {
  objectName: string;
  localPath: string;
  [key: string]: any;
}

export interface ObjectInfo {
  name: string;
  size?: number;
  objectName: string;
  lastModified?: Date;
  type?: 'directory' | 'normal';
}

export interface SignObjectResponseSuccess {
  success: true;
  url: string;
}

export interface SignObjectResponseError {
  success: false;
  desc: string;
}
export type SignObjectResponse = SignObjectResponseSuccess | SignObjectResponseError;

export interface DeleteObjectResponse {
  success: boolean;
  desc?: string;
}

export interface CreateDirectoryResponse {
  success: boolean;
  desc?: string;
}

export interface LegacyStorageConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint: string;
  pathStyle?: boolean;
  useSSL?: boolean;
  params?: string;
  mountPoint?: string;
  cacheDirectory?: string;
  enabled?: boolean;
}

export interface StreamProgressEvent {
  consumedBytes: number;
  totalBytes: number;
  percentage: string;
  speed: string;
  remaining: string;
}

interface ProgressEventRunning extends StreamProgressEvent {
  status: 'running';
}

interface ProgressEventError {
  status: 'error';
  desc: string;
}

interface ProgressEventSuccess {
  status: 'success';
  filesize?: number;
  [key: string]: any;
}

interface ProgressEventEnd {
  status: 'end';
  [key: string]: any;
}

interface ProgressEventCancel {
  status: 'cancel';
  [key: string]: any;
}
export type ProgressEvent =
  | ProgressEventRunning
  | ProgressEventError
  | ProgressEventSuccess
  | ProgressEventEnd
  | ProgressEventCancel;

export interface ProgressCallback {
  (event: ProgressEvent): void;
}

export interface CancelFunction {
  (): boolean;
}

export interface ListObjectsResponse {
  success: boolean;
  desc?: string;
  nextContinuationToken?: string | null;
  objectInfos: ObjectInfo[];
}

export interface HeadObjectResponse {
  exists: boolean;
  size?: number;
  etag?: string;
  checksumCRC32C?: string;
  lastModified?: Date;
  desc?: string;
}

export interface Setting {
  appVersion: string;
  fuseBin: string;
  flashUploadEnabled?: boolean;
  flashUploadThresholdMB?: number;
  defaultCacheDirectory?: string;
  defaultPageSize?: number;
  defaultDownloadDirectory?: string;
  themeMode?: 'light' | 'dark';
  listLoadMode?: 'pagination' | 'waterfall';
  connectionColorGroupId?: string;
  customConnectionColorGroups?: ConnectionColorGroup[];
}

export interface ConnectionColorGroup {
  id: string;
  name: string;
  colors: string[];
  custom?: boolean;
}

export interface FuseMountResponse {
  success: boolean;
  desc?: string;
}

export type FuseUmountResponse = FuseMountResponse;

export interface VfsRefreshVerifiedResult {
  verified: boolean;
  retries: number;
  /** 验证失败时，仍在挂载目录中存在的已删除文件 basename 列表 */
  stillPresent?: string[];
  /** 验证失败时，在挂载目录中缺失的已添加文件 basename 列表 */
  stillMissing?: string[];
}

export interface PreloadFuse {
  checkMount: (mountpoint: string | undefined, retry?: number) => Promise<boolean>;
  driveList: () => Promise<string[]>;
  preMountCleanup: (mountTarget: MountTarget) => Promise<void>;
  mount: (connection: Connection, mountTarget: MountTarget, fuseBin: string) => Promise<FuseMountResponse>;
  umount: (connection: Connection, mountTarget: MountTarget) => Promise<FuseUmountResponse>;
  vfsRefresh: (targetId: string, dir: string) => Promise<void>;
  vfsForget: (targetId: string, file: string) => Promise<void>;
  vfsForgetDir: (targetId: string, dir: string) => Promise<void>;
  vfsRefreshVerified: (targetId: string, dir: string, forgetFiles?: string[], expectDeleted?: string[], expectAdded?: string[], maxRetries?: number) => Promise<VfsRefreshVerifiedResult>;
  isWithinMountScope: (appDir: string, mountPathPrefix: string) => boolean;
  notifyExplorerRefresh: (dirPath: string, deletedFiles: string[], targetId: string, vfsDir: string, connectionId: string, bucket: string, pathPrefix: string, cacheDir: string) => Promise<void>;
}

export interface DriveDataInterface {
  total: number;
  used: number;
  available: number;
  percentageUsed: number;
  mountpoint: string;
  name: string | undefined;
}

export interface UpdaterAvailableResponse {
  cmd: 'update-available';
  version: string;
}

export interface UpdaterNotAvailableResponse {
  cmd: 'update-not-available';
  version?: string;
}

export interface UpdaterProgressResponse {
  cmd: 'download-progress';
  parent: number;
}

export interface UpdaterDownloadedResponse {
  cmd: 'update-downloaded';
  version: string;
}

export interface UpdaterInstallingResponse {
  cmd: 'installing';
  version: string;
}

export interface UpdaterErrorResponse {
  cmd: 'error';
  message: string;
}

export type UpdaterResponse =
  | UpdaterAvailableResponse
  | UpdaterNotAvailableResponse
  | UpdaterProgressResponse
  | UpdaterDownloadedResponse
  | UpdaterInstallingResponse
  | UpdaterErrorResponse;

// updater
export interface UpdateInfo {
  version: string;
  files: UpdateFile[];
  releaseDate: string | Date;
}

export interface UpdateFile {
  name: string;
  sha512: string;
  arch: string;
  size: number;
}

export interface TransferFile {
  name: string;
  prefix: string;
  size: number;
  lastModified: number;
}
