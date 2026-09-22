import http from 'node:http';
import https from 'node:https';
import { logger } from './logger';

/**
 * 代理源列表：
 * 优先使用用户的内置代理节点，后备常用公共加速镜像
 */
const GITHUB_PROXY_PREFIXES = [
  'https://gh.kinboy.wang/',
  'https://ghfast.top/',
  'https://ghproxy.net/',
];

/**
 * 判断 URL 是否属于 GitHub 下载相关直链
 */
export function isGitHubUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'github.com' ||
      host === 'raw.githubusercontent.com' ||
      host.endsWith('.github.com') ||
      host.endsWith('.githubusercontent.com')
    );
  } catch {
    return false;
  }
}

/**
 * 获取加上加速代理前缀的候选 URL 列表
 */
export function getGitHubFallbackUrls(originalUrl: string): string[] {
  if (!isGitHubUrl(originalUrl)) return [originalUrl];

  const fallbacks: string[] = [originalUrl];
  for (const prefix of GITHUB_PROXY_PREFIXES) {
    const cleanPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    fallbacks.push(`${cleanPrefix}${originalUrl}`);
  }
  return fallbacks;
}

/**
 * 带多重重定向与网络代理降级重试的底层 HTTP 请求流
 */
export function requestWithGitHubFallback(
  originalUrl: string,
  options?: {
    timeout?: number;
    userAgent?: string;
  }
): Promise<{ stream: http.IncomingMessage; finalUrl: string; usedProxy: boolean }> {
  const candidateUrls = getGitHubFallbackUrls(originalUrl);
  const timeoutMs = options?.timeout || 15000;
  const userAgent = options?.userAgent || 'BucketView-Downloader';

  return new Promise(async (resolve, reject) => {
    let lastError: Error | null = null;

    for (let i = 0; i < candidateUrls.length; i++) {
      const targetUrl = candidateUrls[i];
      const isFallback = i > 0;
      if (isFallback) {
        logger.warn('gh-proxy', `Primary download failed or timed out, trying fallback proxy (${i}/${candidateUrls.length - 1}): ${targetUrl}`);
      }

      try {
        const stream = await doSingleRequest(targetUrl, 0, timeoutMs, userAgent);
        resolve({ stream, finalUrl: targetUrl, usedProxy: isFallback });
        return;
      } catch (err: any) {
        lastError = err;
        logger.warn('gh-proxy', `Request failed for url: ${targetUrl}`, { message: err?.message || String(err) });
      }
    }

    reject(lastError || new Error(`All download attempts failed for: ${originalUrl}`));
  });
}

function doSingleRequest(
  url: string,
  redirectCount: number,
  timeoutMs: number,
  userAgent: string
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 6) {
      reject(new Error('Too many redirects'));
      return;
    }

    let req: http.ClientRequest | null = null;
    let timer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    try {
      const isHttps = url.startsWith('https:');
      const lib = isHttps ? https : http;

      req = lib.get(
        url,
        {
          headers: {
            'User-Agent': userAgent,
            Accept: 'application/octet-stream, */*',
          },
        },
        (res) => {
          cleanup();
          const status = res.statusCode || 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            let nextUrl = res.headers.location;
            if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
              nextUrl = new URL(nextUrl, url).toString();
            }
            resolve(doSingleRequest(nextUrl, redirectCount + 1, timeoutMs, userAgent));
            return;
          }

          if (status !== 200) {
            res.resume();
            reject(new Error(`Server returned HTTP ${status}`));
            return;
          }

          resolve(res);
        }
      );

      timer = setTimeout(() => {
        if (req) {
          req.destroy(new Error(`Connection timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      req.on('error', (err) => {
        cleanup();
        reject(err);
      });
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}
