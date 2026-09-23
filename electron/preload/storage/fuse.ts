import nodeOs from "node:os";
import nodeFs from "node:fs";
import nodePath from "node:path";
import nodeProcess from "child_process";
import nodeHttp from "node:http";
import nodeNet from "node:net";
import nodeCrypto from "node:crypto";
import { Connection, MountTarget, FuseMountResponse, FuseUmountResponse, FuseMountStatus, FuseMountStatusResponse, VfsRefreshVerifiedResult } from "../types";
import { getDriveList } from "../drivelist";
import { Platform, sleep } from "../../common";
import Store from "electron-store";
import { decryptConnectionSecrets, encryptConnectionSecrets } from "../../common/secret-crypto";

const store = new Store();
const activeMountKey = (targetId: string) => `app.runtime.mounts.${targetId}`;

const configDir = nodePath.join(nodePath.dirname(store.path), "bucketview");

/** Remove rclone conf that contains plaintext secrets after process has started. */
const scrubMountConfigSecrets = (mountConfigFile: string) => {
  try {
    if (nodeFs.existsSync(mountConfigFile)) {
      nodeFs.unlinkSync(mountConfigFile);
    }
  } catch {}
};

/** Runtime filenames must not be derived directly from user-controlled target ids. */
function targetRuntimeStem(targetId: string): string {
  return nodeCrypto.createHash('sha256').update(targetId).digest('hex').slice(0, 32);
}

function runtimeFilePath(targetId: string, suffix: string): string {
  return nodePath.join(configDir, `${targetRuntimeStem(targetId)}.${suffix}`);
}

function legacyRuntimeFilePath(targetId: string, suffix: string): string {
  return nodePath.join(configDir, `${targetId}.${suffix}`);
}

function resolveRuntimeFile(targetId: string, suffix: string): string {
  const current = runtimeFilePath(targetId, suffix);
  if (nodeFs.existsSync(current)) return current;
  return legacyRuntimeFilePath(targetId, suffix);
}

async function allocateRcPort(): Promise<number> {
  const server = nodeNet.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!port) throw new Error('无法分配 rclone RC 端口');
  return port;
}

/** 从 .rc 文件读取实际 rc 端口，若文件不存在则用 hash 计算 */
function readRcPort(targetId: string): number | null {
  const mountConfigRcFile = resolveRuntimeFile(targetId, 'rc');
  try {
    const port = nodeFs.readFileSync(mountConfigRcFile).toString().trim();
    const parsed = Number(port);
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) return parsed;
  } catch {}
  return null;
}

interface RcResponse {
  status: number;
  body: string;
}

/** HTTP POST 到 rclone RC endpoint，返回响应供上层验证 */
function rcPost(rcPort: number, operation: string, params: Record<string, string>): Promise<RcResponse> {
  return new Promise((resolve) => {
    const body = JSON.stringify(params);
    console.log(`[RC] POST /${operation} → localhost:${rcPort} params=${body}`);
    const req = nodeHttp.request({
      hostname: 'localhost',
      port: rcPort,
      path: `/${operation}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[RC] /${operation} response ${res.statusCode}: ${data.substring(0, 200)}`);
        resolve({ status: res.statusCode || 0, body: data });
      });
    });
    req.on('error', (err) => {
      console.error(`[RC] /${operation} error: ${err.message}`);
      resolve({ status: 0, body: err.message });
    });
    req.on('timeout', () => {
      console.error(`[RC] /${operation} timeout (3s)`);
      req.destroy(); resolve({ status: 0, body: 'timeout' });
    });
    req.write(body);
    req.end();
  });
}

/** 检查 RC 响应是否包含 "file does not exist" 等错误 */
function rcResponseHasError(resp: RcResponse): boolean {
  if (resp.status !== 200) return true;
  try {
    const json = JSON.parse(resp.body);
    const result = json.result || json.error;
    if (!result) return false;
    for (const val of Object.values(result as Record<string, string>)) {
      if (typeof val === 'string' && val.includes('file does not exist')) return true;
    }
  } catch {}
  return false;
}

/** 从 vfs/forget 响应中解析 forgotten 列表 */
function parseForgottenList(resp: RcResponse): string[] {
  try {
    const json = JSON.parse(resp.body);
    return json.forgotten || [];
  } catch { return []; }
}

// ── Windows SHChangeNotify: 通知 Explorer 刷新指定目录视图 ──

// SHCNE_DELETE   = 0x00000004 — 文件被删除
// SHCNE_UPDATEDIR = 0x00001000 — 目录内容有变化
// SHCNF_PATHW | SHCNF_FLUSHNOWAIT = 0x0005 | 0x1000 = 0x1005
//   SHCNF_PATHW (0x0005) = Unicode 路径字符串
//   SHCNF_FLUSHNOWAIT (0x1000) = 不等待 Explorer 处理完成，避免阻塞
const SHCNE_DELETE = 0x00000004;
const SHCNE_UPDATEDIR = 0x00001000;
const SHCNF_PATHW_FLUSHNOWAIT = 0x1005;

let shChangeNotifyFunc: any | null = null;

/** 惰性加载 shell32.dll 的 SHChangeNotify 函数（仅 Windows）
 *  使用动态 require 避免 vite-plugin-electron-renderer 误将 koffi 打包进渲染进程 */
function loadShChangeNotify(): boolean {
  if (shChangeNotifyFunc) return true;
  if (!Platform.windows()) return false;
  try {
    const koffi = require('koffi');
    const shell32 = koffi.load('shell32.dll');
    // SHChangeNotify(wEventId, uFlags, dwItem1, dwItem2)
    // https://learn.microsoft.com/en-us/windows/win32/shell/shchangenotify
    shChangeNotifyFunc = shell32.func('__stdcall', 'SHChangeNotify', 'void', [
      'uint32', 'uint32', 'str16', 'void *',
    ]);
    return true;
  } catch (err) {
    console.warn(`[SHChangeNotify] failed to load: ${err.message}`);
    shChangeNotifyFunc = null;
    return false;
  }
}

/** 确保 Windows 路径格式正确：盘符根目录必须带尾部 `\`
 *  SHChangeNotify 对 `M:` (驱动器当前目录) 与 `M:\` (驱动器根目录) 行为不同
 *  `M:` 可能不触发 Explorer 正确刷新，`M:\` 才是标准目录路径 */
function normalizeDirPath(dirPath: string): string {
  if (/^[A-Za-z]:$/.test(dirPath)) return dirPath + '\\';
  return dirPath;
}

/** 通知 Windows Explorer 刷新指定目录的文件视图，并清理 Explorer 访问可能重新引入的 VFS 缓存
 *
 *  exe 文件特殊问题：Explorer 对 .exe 文件会提取内嵌图标（SHGetFileInfo），
 *  持有内核句柄。SHChangeNotify 让 Explorer 刷新后文件消失，
 *  但 Explorer 图标线程随后通过 WinFsp 重新访问该文件，
 *  rclone 的 _checkObject 将磁盘缓存"复活"，导致文件"先消失后出现"。
 *
 *  解决方案：
 *  Phase 1: SHCNE_DELETE + SHCNE_UPDATEDIR → Explorer 刷新（文件消失）
 *  Phase 2: 等待 500ms → 再次 vfs/forget+refresh 清理复活缓存 + 删除磁盘缓存
 *  Phase 3: SHCNE_UPDATEDIR → 最终刷新（确保 Explorer 显示最新状态）
 */
async function notifyExplorerRefreshAndCleanup(
  dirPath: string, deletedFiles: string[],
  targetId: string, vfsDir: string,
  connectionId: string, bucket: string, pathPrefix: string, cacheDir: string,
): Promise<void> {
  if (!Platform.windows()) return;
  try {
    if (!loadShChangeNotify()) return;
    const normDir = normalizeDirPath(dirPath);

    // Phase 1: SHCNE_DELETE 通知 Explorer 每个文件被删除，促使释放句柄
    for (const fileName of deletedFiles) {
      const fullPath = nodePath.join(normDir, fileName);
      console.log(`[SHChangeNotify] Phase 1: SHCNE_DELETE: ${fullPath}`);
      shChangeNotifyFunc!(SHCNE_DELETE, SHCNF_PATHW_FLUSHNOWAIT, fullPath, null);
    }
    // Phase 1: SHCNE_UPDATEDIR 刷新目录（此时文件消失）
    console.log(`[SHChangeNotify] Phase 1: SHCNE_UPDATEDIR: ${normDir}`);
    shChangeNotifyFunc!(SHCNE_UPDATEDIR, SHCNF_PATHW_FLUSHNOWAIT, normDir, null);

    // Phase 2: 等待 Explorer 处理通知（图标线程可能通过 WinFsp 重新访问 exe）
    //  这会导致 rclone _checkObject 将缓存"复活"回 VFS
    await sleep(500);

    // Phase 2: 再次清理 VFS 缓存（清除 Explorer 访问可能重新引入的条目）
    for (const fileName of deletedFiles) {
      console.log(`[VFS] Phase 2 cleanup: vfs/forget file="${fileName}"`);
      const resp = await Fuse.vfsForgetRC(targetId, fileName);
      const forgotten = parseForgottenList(resp);
      if (forgotten.includes(fileName)) {
        console.warn(`[VFS] Phase 2: file "${fileName}" reappeared in VFS after Explorer access! Clearing.`);
      }
    }
    // 再次删除磁盘缓存
    if (cacheDir && deletedFiles.length > 0) {
      Fuse.deleteVfsDiskCache(connectionId, bucket, pathPrefix, deletedFiles, cacheDir);
    }
    // 再次失效目录 + 刷新
    console.log(`[VFS] Phase 2 cleanup: vfs/forget+refresh dir="${vfsDir || '(root)'}"`);
    await Fuse.vfsForgetDirRC(targetId, vfsDir);
    await Fuse.vfsRefreshRC(targetId, vfsDir);

    // Phase 3: 最终 SHCNE_UPDATEDIR，确保 Explorer 显示最新状态
    console.log(`[SHChangeNotify] Phase 3: SHCNE_UPDATEDIR: ${normDir}`);
    shChangeNotifyFunc!(SHCNE_UPDATEDIR, SHCNF_PATHW_FLUSHNOWAIT, normDir, null);
  } catch (err) {
    console.warn(`[SHChangeNotify] cleanup failed: ${err.message}`);
  }
}

function readPid(targetId: string): number | null {
  try {
    const raw = nodeFs.readFileSync(resolveRuntimeFile(targetId, 'pid')).toString().trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function getProcessExeName(pid: number): string {
  if (!Platform.windows()) {
    try {
      return String(nodeProcess.execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { timeout: 1500, encoding: 'utf8' })).trim();
    } catch { return ''; }
  }
  try {
    const koffi = require('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    const OpenProcess = kernel32.func('__stdcall', 'OpenProcess', 'void *', ['uint32', 'bool', 'uint32']);
    const QueryFullProcessImageNameW = kernel32.func('__stdcall', 'QueryFullProcessImageNameW', 'bool', ['void *', 'uint32', '_Out_ str16', '_Inout_ uint32 *']);
    const CloseHandle = kernel32.func('__stdcall', 'CloseHandle', 'bool', ['void *']);

    const hProcess = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
    if (!hProcess) return '';
    try {
      const sizeBuf = [512];
      const nameBuf = ' '.repeat(512);
      if (QueryFullProcessImageNameW(hProcess, 0, nameBuf, sizeBuf)) {
        return nameBuf.slice(0, sizeBuf[0]);
      }
    } finally {
      CloseHandle(hProcess);
    }
  } catch {}
  return '';
}

function isManagedRcloneProcess(pid: number, rcPort: number | null): boolean {
  const exe = getProcessExeName(pid).toLowerCase();
  if (exe && (exe.endsWith('rclone.exe') || exe.includes('rclone'))) return true;
  return false;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function hasLiveUnverifiedProcess(targetId: string): boolean {
  const pid = readPid(targetId);
  return !!pid && isProcessAlive(pid) && !isManagedRcloneProcess(pid, readRcPort(targetId));
}

function normalizedMountPath(mountPoint: string): string {
  if (Platform.windows() && /^[A-Za-z]:$/.test(mountPoint.trim())) return mountPoint.trim() + '\\';
  return mountPoint;
}

function isMountPointAccessible(mountPoint: string): boolean {
  try {
    const root = normalizedMountPath(mountPoint);
    nodeFs.accessSync(root);
    nodeFs.readdirSync(root);
    return true;
  } catch {
    return false;
  }
}

/** 强制清理 Windows 映射盘符并通知资源管理器立即删除图标 */
function removeWindowsDriveMapping(mountPoint: string): void {
  if (!Platform.windows() || !mountPoint) return;
  const drive = mountPoint.trim().slice(0, 2).toUpperCase(); // e.g. "Z:"
  if (!/^[A-Z]:$/.test(drive)) return;

  // 1. WNetCancelConnection2W (直接通过 Win32 网络重定向器内核注销盘符，即使有句柄也强行断开)
  try {
    const koffi = require('koffi');
    const mpr = koffi.load('mpr.dll');
    const WNetCancelConnection2W = mpr.func('__stdcall', 'WNetCancelConnection2W', 'uint32', ['str16', 'uint32', 'bool']);
    WNetCancelConnection2W(drive, 1 /* CONNECT_UPDATE_PROFILE */, true /* force */);
  } catch {}

  // 2. DefineDosDeviceW(DDD_REMOVE_DEFINITION) 清除任何符号链接/虚拟设备驱动器映射
  try {
    const koffi = require('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    const DefineDosDeviceW = kernel32.func('__stdcall', 'DefineDosDeviceW', 'bool', ['uint32', 'str16', 'str16']);
    DefineDosDeviceW(0x00000002 /* DDD_REMOVE_DEFINITION */, drive, null);
    DefineDosDeviceW(0x00000004 /* DDD_EXACT_MATCH_ON_REMOVE */ | 0x00000002, drive, null);
  } catch {}

  // 3. net use /delete /y (清理当前登录会话中的网络连接映射)
  try {
    nodeProcess.execSync(`net use ${drive} /delete /y`, { windowsHide: true, timeout: 3000, stdio: 'ignore' });
  } catch {}

  // 4. SHChangeNotify(SHCNE_DRIVEREMOVED) 通知 Windows Explorer 立即抹除此盘符图标
  try {
    if (loadShChangeNotify() && shChangeNotifyFunc) {
      const SHCNE_DRIVEREMOVED = 0x00000080;
      const SHCNF_PATHW_FLUSHNOWAIT = 0x1005;
      shChangeNotifyFunc(SHCNE_DRIVEREMOVED, SHCNF_PATHW_FLUSHNOWAIT, `${drive}\\`, null);
    }
  } catch {}
}

/** 从 pid 文件读取并终止属于当前 target 的 rclone 进程。 */
function killStaleProcess(mountTargetId: string): void {
  const mountConfigPidFile = resolveRuntimeFile(mountTargetId, 'pid');
  const pid = readPid(mountTargetId);
  const rcPort = readRcPort(mountTargetId);
  if (pid && isProcessAlive(pid)) {
    if (isManagedRcloneProcess(pid, rcPort) || !Platform.windows()) {
      try {
        if (Platform.windows()) {
          try { process.kill(pid, 'SIGKILL'); } catch {}
          nodeProcess.execFileSync('taskkill', ['/pid', String(pid), '/f', '/t'], { windowsHide: true, timeout: 3000, stdio: 'ignore' });
        } else {
          process.kill(pid, 'SIGKILL');
        }
      } catch { /* 进程可能已退出 */ }
      try { nodeFs.unlinkSync(mountConfigPidFile); } catch {}
    } else {
      console.warn(`[MOUNT] skip killing unverified pid ${pid} for target ${mountTargetId}`);
      return;
    }
  } else {
    try { nodeFs.unlinkSync(mountConfigPidFile); } catch {}
  }
}

/** 通过 rc 端口优雅退出 rclone 进程 */
async function quitViaRc(mountTargetId: string): Promise<void> {
  try {
    const rcPort = readRcPort(mountTargetId);
    if (rcPort) {
      // 优先通过内置 HTTP POST 直接发送 rclone /core/quit
      await rcPost(rcPort, 'core/quit', {});
      await sleep(500);
    }
  } catch {}
}

/** Windows: 清理幽灵盘符（盘符存在但不可访问） */
async function cleanupGhostDrive(mountPoint: string): Promise<void> {
  if (!Platform.windows() || !mountPoint) return;
  removeWindowsDriveMapping(mountPoint);
}

export class Fuse {
  private static readonly targetLocks = new Map<string, Promise<void>>();
  private static readonly runtimeStatus = new Map<string, { status: FuseMountStatus; desc?: string }>();

  private static async withTargetLock<T>(targetId: string, fn: () => Promise<T>): Promise<T> {
    const previous = Fuse.targetLocks.get(targetId) || Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    Fuse.targetLocks.set(targetId, queued);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (Fuse.targetLocks.get(targetId) === queued) Fuse.targetLocks.delete(targetId);
    }
  }

  private static setRuntimeStatus(targetId: string, status: FuseMountStatus, desc?: string): void {
    Fuse.runtimeStatus.set(targetId, { status, desc });
  }

  private static async rcAlive(targetId: string): Promise<boolean> {
    const rcPort = readRcPort(targetId);
    if (!rcPort) return false;
    const resp = await rcPost(rcPort, 'core/version', {});
    return resp.status === 200;
  }

  private static async isManagedMount(target: MountTarget): Promise<boolean> {
    const rcPort = readRcPort(target.id);
    const pid = readPid(target.id);
    if (!rcPort || !pid || !isProcessAlive(pid)) return false;
    if (!await Fuse.checkMount(target.mountPoint, 1)) return false;
    return Fuse.rcAlive(target.id);
  }

  public static async getMountStatus(mountTarget: MountTarget): Promise<FuseMountStatusResponse> {
    const runtime = Fuse.runtimeStatus.get(mountTarget.id);
    const pid = readPid(mountTarget.id) || undefined;
    const rcPort = readRcPort(mountTarget.id) || undefined;
    if (runtime?.status === 'mounting' || runtime?.status === 'unmounting') {
      return { targetId: mountTarget.id, status: runtime.status, mountPoint: mountTarget.mountPoint, pid, rcPort, desc: runtime.desc };
    }
    if (await Fuse.isManagedMount(mountTarget)) {
      Fuse.setRuntimeStatus(mountTarget.id, 'mounted');
      return { targetId: mountTarget.id, status: 'mounted', mountPoint: mountTarget.mountPoint, pid, rcPort };
    }
    if (hasLiveUnverifiedProcess(mountTarget.id)) {
      const desc = '挂载进程仍在运行，但无法确认其归属，请检查后再操作';
      Fuse.setRuntimeStatus(mountTarget.id, 'error', desc);
      return { targetId: mountTarget.id, status: 'error', mountPoint: mountTarget.mountPoint, pid, rcPort, desc };
    }
    const stale = !!pid || !!rcPort;
    if (stale && mountTarget.mountPoint && await Fuse.checkMount(mountTarget.mountPoint, 1)) {
      const desc = '挂载进程或控制端点不可用';
      Fuse.setRuntimeStatus(mountTarget.id, 'error', desc);
      return { targetId: mountTarget.id, status: 'error', mountPoint: mountTarget.mountPoint, pid, rcPort, desc };
    }
    Fuse.setRuntimeStatus(mountTarget.id, 'unmounted');
    return { targetId: mountTarget.id, status: 'unmounted', mountPoint: mountTarget.mountPoint, pid, rcPort };
  }
  public static async checkMount(mountPoint: string | undefined, retry: number = 1): Promise<boolean> {
    if (!mountPoint) return false;
    if (retry < 1) retry = 1;

    for (let i = 1; i <= retry; i++) {
      const drives = await Fuse.driveList();
      const driveExists = drives.includes(mountPoint);
      if (!driveExists) {
        if (i < retry) { await sleep(1000); continue; }
        return false;
      }
      if (isMountPointAccessible(mountPoint)) return true;
      if (i < retry) { await sleep(1000); continue; }
      return false;
    }
    return false;
  }

  public static async driveList(): Promise<string[]> {
    const drives = await getDriveList();
    return drives.map((drive) => drive.mountpoint);
  }

  /** 挂载前清理：终止残留进程 + 清理幽灵盘符 */
  private static async cleanupBeforeMount(mountTarget: MountTarget): Promise<void> {
    // 1. 通过 rc 优雅退出旧进程
    await quitViaRc(mountTarget.id);
    // 2. 强制终止残留 pid
    killStaleProcess(mountTarget.id);
    // 3. 清理 rc 文件
    try { nodeFs.unlinkSync(resolveRuntimeFile(mountTarget.id, 'rc')); } catch {}
    // 4. 清理目标盘符的幽灵盘符
    await cleanupGhostDrive(mountTarget.mountPoint || '');
    // 5. 等待清理生效
    await sleep(500);
  }

  public static async preMountCleanup(mountTarget: MountTarget): Promise<void> {
    await Fuse.withTargetLock(mountTarget.id, () => Fuse.cleanupBeforeMount(mountTarget));
  }

  public static async syncAutoMount(connection: Connection, mountTarget: MountTarget): Promise<void> {
    const key = `app.openAtLogin.targets.${mountTarget.id}`;
    if (mountTarget.autoMount === true) {
      store.set(key, { connection: encryptConnectionSecrets(decryptConnectionSecrets(connection)), mountTarget });
    } else {
      store.delete(key);
    }
  }

  public static async mount(connection: Connection, mountTarget: MountTarget, fuseBin: string): Promise<FuseMountResponse> {
    return Fuse.withTargetLock(mountTarget.id, () => Fuse.mountInternal(connection, mountTarget, fuseBin));
  }

  private static async mountInternal(connection: Connection, mountTarget: MountTarget, fuseBin: string): Promise<FuseMountResponse> {
    if (await Fuse.isManagedMount(mountTarget)) {
      const resolvedConnection = decryptConnectionSecrets(connection);
      store.set(activeMountKey(mountTarget.id), {
        connection: encryptConnectionSecrets(resolvedConnection),
        mountTarget,
      });
      Fuse.setRuntimeStatus(mountTarget.id, 'mounted');
      return { success: true };
    }
    if (hasLiveUnverifiedProcess(mountTarget.id)) {
      const desc = '挂载进程仍在运行，但无法确认其归属，请先人工检查';
      Fuse.setRuntimeStatus(mountTarget.id, 'error', desc);
      return { success: false, desc };
    }

    Fuse.setRuntimeStatus(mountTarget.id, 'mounting');

    // 挂载前清理残留状态
    await Fuse.cleanupBeforeMount(mountTarget);

    const resolvedConnection = decryptConnectionSecrets(connection);
    const mountConfigFile = runtimeFilePath(mountTarget.id, 'conf');
    const mountConfigLogFile = runtimeFilePath(mountTarget.id, 'log');
    const mountConfigPidFile = runtimeFilePath(mountTarget.id, 'pid');
    const mountConfigRcFile = runtimeFilePath(mountTarget.id, 'rc');

    // rclone 远程路径: BucketView_{connectionId}:{bucket}/{pathPrefix}
    const remotePath = mountTarget.pathPrefix
      ? `BucketView_${resolvedConnection.id}:${mountTarget.bucket}/${mountTarget.pathPrefix}`
      : `BucketView_${resolvedConnection.id}:${mountTarget.bucket}`;

    try {
      nodeFs.mkdirSync(configDir, { recursive: true });
      nodeFs.mkdirSync(nodePath.dirname(mountConfigFile), { recursive: true });
      nodeFs.writeFileSync(mountConfigFile, Fuse.getMountConfig(resolvedConnection), { mode: 0o600 });
      try { nodeFs.unlinkSync(mountConfigLogFile); } catch {}

      if (fuseBin.length == 0) {
        scrubMountConfigSecrets(mountConfigFile);
        return { success: false, desc: "请前往插件中心安装或选择 rclone 挂载程序" }
      }

      if (Platform.windows()) {
        try {
          const { isWinFspInstalled } = require('../../common/winfsp-bin');
          if (!isWinFspInstalled()) {
            scrubMountConfigSecrets(mountConfigFile);
            return {
              success: false,
              desc: "Windows 本地挂载依赖 WinFsp 内核驱动，请先在【配置中心 -> 扩展插件】中一键安装 WinFsp 驱动。",
            };
          }
        } catch {}
      }

      if (!mountTarget.mountPoint || mountTarget.mountPoint.trim().length === 0) {
        scrubMountConfigSecrets(mountConfigFile);
        return { success: false, desc: "请指定挂载盘符/路径" }
      }
      if (Platform.windows() && !/^[A-Za-z]:$/.test(mountTarget.mountPoint.trim())) {
        scrubMountConfigSecrets(mountConfigFile);
        return { success: false, desc: "Windows 挂载点必须是盘符，例如 M:" };
      }
      if (!Platform.windows() && !nodePath.isAbsolute(mountTarget.mountPoint)) {
        scrubMountConfigSecrets(mountConfigFile);
        return { success: false, desc: "挂载点必须是绝对路径，例如 /mnt/bucket" };
      }

      if (!Platform.windows()) {
        nodeFs.mkdirSync(mountTarget.mountPoint, { recursive: true });
      }

      // 检查盘符是否已被占用
      const drives = await Fuse.driveList();
      if (Platform.windows() && drives.includes(mountTarget.mountPoint)) {
        try { nodeFs.accessSync(mountTarget.mountPoint); }
        catch {
          scrubMountConfigSecrets(mountConfigFile);
          return { success: false, desc: `盘符 ${mountTarget.mountPoint} 存在幽灵盘符残留，请先重启或手动清理` };
        }
        scrubMountConfigSecrets(mountConfigFile);
        return { success: false, desc: `盘符 ${mountTarget.mountPoint} 已被占用` };
      }

      const rcPort = await allocateRcPort();
      const resp = await new Promise<FuseMountResponse>((resolve, reject) => {
        // volname: connection/bucket[/pathPrefix]，bucket 过长截断
        const truncateBucket = (name: string, maxLen: number = 16): string =>
          name.length <= maxLen ? name : name.substring(0, maxLen) + '…';
        const volnameParts = [resolvedConnection.id, truncateBucket(mountTarget.bucket)];
        if (mountTarget.pathPrefix) volnameParts.push(mountTarget.pathPrefix);
        const volname = volnameParts.join(' - ').replace(/[\\/:*?"<>|]/g, '_');
        const args = ["mount", remotePath, mountTarget.mountPoint,
          "--log-file", mountConfigLogFile, "--log-level", "DEBUG",
          "--config", mountConfigFile, "--s3-chunk-size", "128M",
          "--contimeout", "3s", "--timeout", "30s",
          "--low-level-retries", "3", "--s3-upload-concurrency", "10", "--s3-list-version", "2",
          "--volname", volname, "--dir-cache-time", "10m",
          "--rc", "--rc-no-auth", `--rc-addr=localhost:${rcPort}`];
        if (Platform.windows()) args.push("--network-mode");
        if (!Platform.windows()) {
          args.push("--allow-other")
        }
        if (mountTarget.cacheDirectory && mountTarget.cacheDirectory.trim().length > 0) {
          args.push("--cache-dir", mountTarget.cacheDirectory, "--vfs-cache-mode", "full", "--vfs-cache-max-age", "5m");
        }
        const subprocess = nodeProcess.spawn(fuseBin, args, {
          detached: true,
          windowsHide: true,
        });
        subprocess.once("error", (err) => {
          reject(new Error(err.message));
        })
        subprocess.once("spawn", () => {
          if (subprocess.pid) {
            nodeFs.writeFileSync(mountConfigPidFile, subprocess.pid.toString());
            // rclone has read conf into memory; drop plaintext secret file ASAP.
            setTimeout(() => scrubMountConfigSecrets(mountConfigFile), 1500);
          }
          nodeFs.writeFileSync(mountConfigRcFile, rcPort.toString());
          resolve({ success: true });
        })
        subprocess.once('exit', (code, signal) => {
          const current = Fuse.runtimeStatus.get(mountTarget.id);
          if (current?.status === 'mounted' || current?.status === 'mounting') {
            Fuse.setRuntimeStatus(mountTarget.id, 'error', `rclone 已退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）`);
            store.delete(activeMountKey(mountTarget.id));
            for (const suffix of ['pid', 'rc']) { try { nodeFs.unlinkSync(runtimeFilePath(mountTarget.id, suffix)); } catch {} }
          }
        });
        subprocess.unref();
      });

      let mountState = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (await Fuse.isManagedMount(mountTarget)) {
          mountState = true;
          break;
        }
        await sleep(1000);
      }
      if (!mountState) {
        // 读取 rclone 日志获取详细错误信息
        let logDetail = '';
        try {
          if (nodeFs.existsSync(mountConfigLogFile)) {
            const logContent = nodeFs.readFileSync(mountConfigLogFile, 'utf8');
            // 提取 ERROR 和最后几行关键日志
            const errorLines = logContent.split('\n').filter(l => l.includes('ERROR') || l.includes('error'));
            const lastLines = logContent.split('\n').filter(l => l.trim().length > 0).slice(-5);
            logDetail = [...errorLines.slice(-3), ...lastLines].join('\n');
          }
        } catch {}
        // 清理残留进程和文件
        killStaleProcess(mountTarget.id);
        await cleanupGhostDrive(mountTarget.mountPoint || '');
        try { nodeFs.unlinkSync(mountConfigLogFile); } catch {}
        try { nodeFs.unlinkSync(mountConfigRcFile); } catch {}
        scrubMountConfigSecrets(mountConfigFile);
        const desc = logDetail || "挂载异常：挂载点或 rclone 控制端点不可用";
        Fuse.setRuntimeStatus(mountTarget.id, 'error', desc);
        return { success: false, desc };
      }

      store.set('app.openAtLogin.fuseBin', fuseBin);
      store.set(activeMountKey(mountTarget.id), {
        connection: encryptConnectionSecrets(resolvedConnection),
        mountTarget,
      });
      const autoKey = `app.openAtLogin.targets.${mountTarget.id}`;
      if (mountTarget.autoMount === true || (mountTarget.autoMount === undefined && store.has(autoKey))) {
        store.set(autoKey, { connection: encryptConnectionSecrets(resolvedConnection), mountTarget });
      } else if (mountTarget.autoMount === false && store.has(autoKey)) {
        store.delete(autoKey);
      }
      Fuse.setRuntimeStatus(mountTarget.id, 'mounted');
      return resp;

    } catch (error) {
      // 异常后清理残留
      killStaleProcess(mountTarget.id);
      await cleanupGhostDrive(mountTarget.mountPoint || '');
      scrubMountConfigSecrets(mountConfigFile);
      const desc = error?.message || String(error);
      Fuse.setRuntimeStatus(mountTarget.id, 'error', desc);
      return { success: false, desc };
    }
  }

  public static async umount(connection: Connection, mountTarget: MountTarget, options: { forgetAutoMount?: boolean } = {}): Promise<FuseUmountResponse> {
    return Fuse.withTargetLock(mountTarget.id, () => Fuse.umountInternal(connection, mountTarget, options));
  }

  private static async umountInternal(connection: Connection, mountTarget: MountTarget, options: { forgetAutoMount?: boolean } = {}): Promise<FuseUmountResponse> {
    Fuse.setRuntimeStatus(mountTarget.id, 'unmounting');
    try {
      // 1. 如果配置了 Windows 挂载盘符，调用 rclone rc 的 mount/unmount 接口显式释放 WinFsp 驱动句柄
      const rcPort = readRcPort(mountTarget.id);
      if (rcPort && mountTarget.mountPoint) {
        try {
          await rcPost(rcPort, 'mount/unmount', { mountPoint: mountTarget.mountPoint });
          await sleep(300);
        } catch {}
      }

      // 2. 通过 RC 端口发送 core/quit 让 rclone 退出
      await quitViaRc(mountTarget.id);
      await sleep(500);

      // 3. 检查残留进程并强制清理
      let pid = readPid(mountTarget.id);
      if (pid && isProcessAlive(pid)) {
        killStaleProcess(mountTarget.id);
        await sleep(500);
      }

      // 4. 强制从 Windows 内核中注销网络盘符，并通知资源管理器立即删除盘符图标
      if (Platform.windows() && mountTarget.mountPoint) {
        removeWindowsDriveMapping(mountTarget.mountPoint);
      }

      for (const suffix of ['pid', 'rc', 'conf', 'log']) {
        try { nodeFs.unlinkSync(runtimeFilePath(mountTarget.id, suffix)); } catch {}
        try { nodeFs.unlinkSync(legacyRuntimeFilePath(mountTarget.id, suffix)); } catch {}
      }
      if (options.forgetAutoMount) {
        store.delete(`app.openAtLogin.targets.${mountTarget.id}`);
      }
      store.delete(activeMountKey(mountTarget.id));
      Fuse.setRuntimeStatus(mountTarget.id, 'unmounted');
      return { success: true };
    } catch (error: any) {
      if (Platform.windows() && mountTarget.mountPoint) {
        removeWindowsDriveMapping(mountTarget.mountPoint);
      }
      const desc = error?.message || String(error);
      Fuse.setRuntimeStatus(mountTarget.id, 'error', desc);
      return { success: false, desc };
    }
  }

  /** 刷新指定目录的 VFS 缓存（立即从远程读取更新）
   *  根目录时省略 dir 参数（rclone 对 dir="" 或 dir="/" 会报 "file does not exist"）
   *  子目录路径去掉前导 "/" */
  public static async vfsRefreshRC(targetId: string, dir: string): Promise<RcResponse> {
    const rcPort = readRcPort(targetId);
    if (!rcPort) { console.log(`[VFS] vfsRefresh skip: no rc port for ${targetId}`); return { status: 0, body: 'no rc port' }; }
    const isRoot = !dir || dir === '/';
    const cleanDir = dir.startsWith('/') ? dir.slice(1) : dir;
    console.log(`[VFS] vfsRefresh target=${targetId} dir="${isRoot ? '(root)' : cleanDir}"`);
    const params: Record<string, string> = { recursive: 'true' };
    if (!isRoot) params.dir = cleanDir;
    return rcPost(rcPort, 'vfs/refresh', params);
  }

  /** 清除指定文件的 VFS 缓存（下次访问时自动拉取） */
  public static async vfsForgetRC(targetId: string, file: string): Promise<RcResponse> {
    const rcPort = readRcPort(targetId);
    if (!rcPort) { console.log(`[VFS] vfsForget skip: no rc port for ${targetId}`); return { status: 0, body: 'no rc port' }; }
    console.log(`[VFS] vfsForget target=${targetId} file="${file}"`);
    return rcPost(rcPort, 'vfs/forget', { file });
  }

  /** 清除指定目录的 VFS 缓存（下次访问时从远程重新拉取）
   *  根目录时省略 dir 参数（同 vfsRefresh） */
  public static async vfsForgetDirRC(targetId: string, dir: string): Promise<RcResponse> {
    const rcPort = readRcPort(targetId);
    if (!rcPort) { console.log(`[VFS] vfsForgetDir skip: no rc port for ${targetId}`); return { status: 0, body: 'no rc port' }; }
    const isRoot = !dir || dir === '/';
    const cleanDir = dir.startsWith('/') ? dir.slice(1) : dir;
    console.log(`[VFS] vfsForgetDir target=${targetId} dir="${isRoot ? '(root)' : cleanDir}"`);
    const params: Record<string, string> = {};
    if (!isRoot) params.dir = cleanDir;
    return rcPost(rcPort, 'vfs/forget', params);
  }

  /** 获取存储的挂载目标信息 */
  private static getStoredTarget(targetId: string): { connection: Connection; mountTarget: MountTarget } | null {
    const stored = store.get(`app.openAtLogin.targets.${targetId}`) as { connection: Connection; mountTarget: MountTarget } | undefined;
    if (!stored) return null;
    return { ...stored, connection: decryptConnectionSecrets(stored.connection) };
  }

  /** 将 app 层路径转换为 VFS 相对路径（strip mount 的 pathPrefix）
   *  例: mount pathPrefix="data", appPath="data/sub/file.txt" → VFS: "sub/file.txt"
   *  例: mount pathPrefix="", appPath="sub/file.txt" → VFS: "sub/file.txt" */
  private static appPathToVfsPath(appPath: string, mountPathPrefix: string): string {
    if (!mountPathPrefix) return appPath;  // 无 pathPrefix，appPath 即 VFS 路径
    if (!appPath) return '';  // 空 appPath → VFS 根
    if (appPath === mountPathPrefix) return '';  // 等于 pathPrefix → VFS 根
    if (appPath.startsWith(mountPathPrefix + '/')) return appPath.slice(mountPathPrefix.length + 1);
    // appPath 不在 mount 范围内，返回原路径（RC 调用大概率不生效）
    return appPath;
  }

  /** 检查 app 层路径是否在 mount 的 pathPrefix 范围内 */
  static isWithinMountScope(appDir: string, mountPathPrefix: string): boolean {
    if (!mountPathPrefix) return true;  // 无 pathPrefix，覆盖整个 bucket
    if (!appDir) return false;  // 有 pathPrefix 时，bucket 根不在 mount 范围内
    return appDir === mountPathPrefix || appDir.startsWith(mountPathPrefix + '/');
  }

  /** 删除磁盘上的 VFS 文件缓存（vfs/ + vfsMeta/）
 *  vfs/forget 只清除内存引用，磁盘缓存文件仍存在。
 *  当 Explorer 重新访问时，_checkObject 可能将磁盘缓存"复活"，
 *  导致已删除的文件在本地文件夹中"先消失后出现"。
 *  直接删除磁盘缓存可防止此问题。
 *
 *  磁盘路径: {cacheDir}/vfs/{remoteName}/{remoteRoot}/{vfsPath}
 *            {cacheDir}/vfsMeta/{remoteName}/{remoteRoot}/{vfsPath}
 *  例: cacheDir/vfs/BucketView_aigc/aigc-assets/TRAE_SOLO_CN-Setup-x64.exe
 *      cacheDir/vfsMeta/BucketView_aigc/aigc-assets/TRAE_SOLO_CN-Setup-x64.exe */
  public static deleteVfsDiskCache(
    connectionId: string, bucket: string, pathPrefix: string,
    vfsPaths: string[], cacheDir: string,
  ): void {
    if (!cacheDir || vfsPaths.length === 0) return;
    const remoteRoot = pathPrefix ? `${bucket}/${pathPrefix}` : bucket;
    const remoteName = `BucketView_${connectionId}`;
    for (const vfsPath of vfsPaths) {
      if (!vfsPath) continue;
      for (const subDir of ['vfs', 'vfsMeta']) {
        const diskPath = nodePath.join(cacheDir, subDir, remoteName, remoteRoot, vfsPath);
        try {
          if (nodeFs.existsSync(diskPath)) {
            nodeFs.unlinkSync(diskPath);
            console.log(`[VFS] deleted disk cache: ${diskPath}`);
          }
        } catch (err: any) {
          console.warn(`[VFS] failed to delete disk cache ${diskPath}: ${err.message}`);
        }
      }
    }
  }

  /** 带验证的 VFS 缓存刷新：文件级精准失效 + 目录级列表刷新 + RC 响应验证 + 重试
   *  验证策略：
   *  - 删除文件：vfs/forget + 磁盘缓存删除 + vfs/refresh RC 调用成功即视为验证通过
   *    （forgotten=[X] 表示"文件已被成功忘记"，不是"文件仍存在"）
   *  - 新增文件：refresh 后再次 vfs/forget file=X，若 forgotten=[X] → VFS 已含该文件 */
  public static async vfsRefreshVerified(
    targetId: string,
    dir: string,
    forgetFiles: string[] = [],
    expectDeleted: string[] = [],
    expectAdded: string[] = [],
    maxRetries: number = 2,
  ): Promise<VfsRefreshVerifiedResult> {
    const stored = Fuse.getStoredTarget(targetId);
    if (!stored) {
      console.log(`[VFS] vfsRefreshVerified skip: no stored target for ${targetId}`);
      return { verified: false, retries: 0 };
    }
    const mountPathPrefix = stored.mountTarget.pathPrefix || '';
    const rcPort = readRcPort(targetId);
    if (!rcPort) {
      console.log(`[VFS] vfsRefreshVerified skip: no rc port for ${targetId}`);
      return { verified: false, retries: 0 };
    }

    // 转换路径
    const vfsDir = Fuse.appPathToVfsPath(dir, mountPathPrefix);
    const vfsForgetPaths = forgetFiles.map(f => Fuse.appPathToVfsPath(f, mountPathPrefix));
    const vfsAddedPaths = expectAdded.map(f => Fuse.appPathToVfsPath(f, mountPathPrefix));
    const needVerifyAdded = vfsAddedPaths.length > 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // ── Step 1: 失效文件内容缓存（内存层） ──
      for (const vfsFile of vfsForgetPaths) {
        if (!vfsFile) continue;
        console.log(`[VFS] verify attempt ${attempt + 1}: forget file="${vfsFile}"`);
        await Fuse.vfsForgetRC(targetId, vfsFile);
      }

      // ── Step 1.5: 删除磁盘上的 VFS 文件缓存 ──
      // vfs/forget 只清除内存引用，磁盘缓存文件仍存在
      // 当 Explorer 重新访问时，_checkObject 可能将磁盘缓存"复活"
      const cacheDir = stored.mountTarget.cacheDirectory || '';
      if (cacheDir && vfsForgetPaths.length > 0) {
        Fuse.deleteVfsDiskCache(
          stored.connection.id, stored.mountTarget.bucket, mountPathPrefix,
          vfsForgetPaths, cacheDir,
        );
      }

      // ── Step 2: 失效目录缓存 + 刷新目录列表 ──
      console.log(`[VFS] verify attempt ${attempt + 1}: forget+refresh dir="${vfsDir || '(root)'}"`);
      const forgetDirResp = await Fuse.vfsForgetDirRC(targetId, vfsDir);
      const refreshResp = await Fuse.vfsRefreshRC(targetId, vfsDir);

      // RC 调用本身失败，等待后重试
      if (rcResponseHasError(forgetDirResp) || rcResponseHasError(refreshResp)) {
        console.warn(`[VFS] verify attempt ${attempt + 1}: RC error, retrying after delay`);
        await sleep(800 * (attempt + 1));
        continue;
      }

      // 删除文件：RC 调用成功即验证通过（forget 已清除缓存，refresh 已从远程读取最新列表）
      // 新增文件无需验证时：也直接成功
      if (!needVerifyAdded) {
        console.log(`[VFS] verify OK on attempt ${attempt + 1}: RC calls succeeded for dir="${vfsDir || '(root)'}"`);
        return { verified: true, retries: attempt };
      }

      // ── Step 3: 验证新增文件是否出现在 VFS ──
      await sleep(200 + attempt * 100);

      let stillMissingPaths: string[] = [];
      for (const vfsPath of vfsAddedPaths) {
        if (!vfsPath) continue;
        const checkResp = await Fuse.vfsForgetRC(targetId, vfsPath);
        const forgotten = parseForgottenList(checkResp);
        // forgotten=[X] → 文件在 VFS 中 → 已出现；forgotten=[] → 文件不在 VFS → 尚未出现
        if (!forgotten.includes(vfsPath)) stillMissingPaths.push(vfsPath);
      }

      if (stillMissingPaths.length === 0) {
        console.log(`[VFS] verify OK on attempt ${attempt + 1}: all added files found in VFS for dir="${vfsDir || '(root)'}"`);
        return { verified: true, retries: attempt };
      }

      console.warn(`[VFS] verify attempt ${attempt + 1}: added files still missing: [${stillMissingPaths.map(p => nodePath.basename(p)).join(',')}]`);
      // 重试：再次 forget+refresh 目录
      await Fuse.vfsForgetDirRC(targetId, vfsDir);
      await Fuse.vfsRefreshRC(targetId, vfsDir);
    }

    // 最终失败（仅新增文件验证失败）
    console.warn(`[VFS] verify failed after ${maxRetries + 1} attempts for dir="${vfsDir || '(root)'}"`);
    let finalStillMissing: string[] = [];
    for (const vfsPath of vfsAddedPaths) {
      if (!vfsPath) continue;
      const resp = await Fuse.vfsForgetRC(targetId, vfsPath);
      if (!parseForgottenList(resp).includes(vfsPath)) finalStillMissing.push(`未出现: ${nodePath.basename(vfsPath)}`);
    }
    return { verified: finalStillMissing.length === 0, retries: maxRetries, stillPresent: [], stillMissing: finalStillMissing };
  }

  // ── 简化版公开方法（无验证，供外部直接调用） ──

  public static async vfsRefresh(targetId: string, dir: string): Promise<void> {
    await Fuse.vfsRefreshRC(targetId, dir);
  }

  public static async vfsForget(targetId: string, file: string): Promise<void> {
    await Fuse.vfsForgetRC(targetId, file);
  }

  public static async vfsForgetDir(targetId: string, dir: string): Promise<void> {
    await Fuse.vfsForgetDirRC(targetId, dir);
  }

  /** 通知 Windows Explorer 刷新指定挂载目录的文件视图
   *  deletedFiles: 被删除的文件名列表（不含路径），会先发送 SHCNE_DELETE 释放 Explorer 文件句柄 */
  /** 通知 Windows Explorer 刷新挂载目录并清理 exe 文件可能重新引入的 VFS 缓存
   *  三阶段流程：SHCNE_DELETE → 等待+VFS二次清理 → SHCNE_UPDATEDIR */
  public static async notifyExplorerRefresh(
    dirPath: string, deletedFiles: string[],
    targetId: string, vfsDir: string,
    connectionId: string, bucket: string, pathPrefix: string, cacheDir: string,
  ): Promise<void> {
    await notifyExplorerRefreshAndCleanup(dirPath, deletedFiles, targetId, vfsDir, connectionId, bucket, pathPrefix, cacheDir);
  }

  private static getMountConfig(connection: Connection): string {
    return (`
[BucketView_${connection.id}]
type = s3
provider = Minio
access_key_id = ${connection.accessKeyId}
secret_access_key = ${connection.accessKeySecret}
endpoint = ${connection.useSSL ? 'https' : 'http'}://${connection.endpoint}
region = ${connection.region}
            `).trim()
  }
}
