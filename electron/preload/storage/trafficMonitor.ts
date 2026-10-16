import { EventEmitter } from 'events';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export interface TrafficStats {
  downloadSpeed: number;     // 实时下载速率 (Bytes/s)
  uploadSpeed: number;       // 实时上传速率 (Bytes/s)
  totalDownloaded: number;   // 本次会话累计下载 (Bytes)
  totalUploaded: number;     // 本次会话累计上传 (Bytes)
  activeSockets: number;     // 活跃连接数
}

export class TrafficMonitor extends EventEmitter {
  private static instance: TrafficMonitor;

  private totalDownloaded = 0;
  private totalUploaded = 0;

  private bytesDownloadedInWindow = 0;
  private bytesUploadedInWindow = 0;

  private currentDownloadSpeed = 0;
  private currentUploadSpeed = 0;

  private activeSocketsCount = 0;
  private timer: NodeJS.Timeout | null = null;
  private instrumentedSockets = new WeakSet<object>();

  public static getInstance(): TrafficMonitor {
    if (!TrafficMonitor.instance) {
      TrafficMonitor.instance = new TrafficMonitor();
    }
    return TrafficMonitor.instance;
  }

  constructor() {
    super();
    this.startSampling();
  }

  /**
   * 启动每秒采样定时器
   */
  private startSampling() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.sample();
    }, 1000);
  }

  private sample() {
    // 当前秒传输字节即为瞬间速率
    const instantDown = this.bytesDownloadedInWindow;
    const instantUp = this.bytesUploadedInWindow;

    // 平滑处理（轻微滑动平均，避免读一瞬立刻变0导致视觉抖动）
    this.currentDownloadSpeed = instantDown;
    this.currentUploadSpeed = instantUp;

    // 清零当前时间窗口增量
    this.bytesDownloadedInWindow = 0;
    this.bytesUploadedInWindow = 0;

    const stats: TrafficStats = {
      downloadSpeed: this.currentDownloadSpeed,
      uploadSpeed: this.currentUploadSpeed,
      totalDownloaded: this.totalDownloaded,
      totalUploaded: this.totalUploaded,
      activeSockets: this.activeSocketsCount,
    };

    this.emit('stats', stats);
  }

  public recordDownload(bytes: number) {
    if (bytes <= 0) return;
    this.bytesDownloadedInWindow += bytes;
    this.totalDownloaded += bytes;
  }

  public recordUpload(bytes: number) {
    if (bytes <= 0) return;
    this.bytesUploadedInWindow += bytes;
    this.totalUploaded += bytes;
  }

  /**
   * 对一个 Net Socket 进行插桩监听
   */
  public attachSocket(socket: net.Socket) {
    if (!socket || typeof socket.on !== 'function' || this.instrumentedSockets.has(socket)) {
      return;
    }
    this.instrumentedSockets.add(socket);
    this.activeSocketsCount++;

    // 1. 监控从远程接收的下行字节流
    socket.on('data', (chunk: Buffer | string) => {
      const len = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      this.recordDownload(len);
    });

    // 2. 监控发往远程的上行字节流
    const origWrite = socket.write;
    const self = this;
    socket.write = function (chunk: any, ...args: any[]) {
      if (chunk) {
        const len = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        self.recordUpload(len);
      }
      return origWrite.apply(this, [chunk, ...args] as any);
    };

    const cleanup = () => {
      if (this.instrumentedSockets.has(socket)) {
        this.instrumentedSockets.delete(socket);
        this.activeSocketsCount = Math.max(0, this.activeSocketsCount - 1);
      }
    };

    socket.once('close', cleanup);
    socket.once('error', cleanup);
  }

  /**
   * 对 Node.js http.Agent 或 https.Agent 插桩
   */
  public instrumentAgent<T extends http.Agent | https.Agent>(agent: T): T {
    if (!agent) return agent;
    const anyAgent = agent as any;
    if (anyAgent.__traffic_instrumented) return agent;
    anyAgent.__traffic_instrumented = true;

    const origCreateConnection = anyAgent.createConnection;
    if (typeof origCreateConnection === 'function') {
      const self = this;
      anyAgent.createConnection = function (options: any, callback: any) {
        const socket = origCreateConnection.call(this, options, (err: any, stream: any) => {
          if (!err && stream) {
            self.attachSocket(stream);
          }
          if (typeof callback === 'function') {
            callback(err, stream);
          }
        });
        if (socket && typeof socket.on === 'function') {
          self.attachSocket(socket);
        }
        return socket;
      };
    }

    return agent;
  }

  public getStats(): TrafficStats {
    return {
      downloadSpeed: this.currentDownloadSpeed,
      uploadSpeed: this.currentUploadSpeed,
      totalDownloaded: this.totalDownloaded,
      totalUploaded: this.totalUploaded,
      activeSockets: this.activeSocketsCount,
    };
  }
}

export const trafficMonitor = TrafficMonitor.getInstance();
