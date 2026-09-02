export interface S3AddressingAdvice {
  pathStyle: boolean;
  provider: string;
  reason: string;
  region?: string;
}

const getHostname = (endpoint: string): string => {
  const value = String(endpoint || '').trim().replace(/^https?:\/\//i, '');
  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return value.split('/')[0].split(':')[0].toLowerCase();
  }
};

const hasDomainSuffix = (hostname: string, suffix: string): boolean => hostname === suffix || hostname.endsWith(`.${suffix}`);

/**
 * MC's `api` field describes request signing, not bucket addressing. Keep
 * provider-specific addressing decisions in one explicit and editable policy.
 */
export const inferS3Addressing = (endpoint: string): S3AddressingAdvice => {
  const hostname = getHostname(endpoint);

  if (hasDomainSuffix(hostname, 's3-legacy.mediacloud.imgo.tv')) {
    return {
      pathStyle: true,
      provider: 'MediaCloud 对象存储（Legacy）',
      reason: '已识别内部 Legacy Endpoint，自动填入长沙 2 区域。',
      region: 'cn-changsha-2',
    };
  }
  if (hasDomainSuffix(hostname, 's3.mediacloud.imgo.tv')) {
    return {
      pathStyle: true,
      provider: 'MediaCloud 对象存储',
      reason: '已识别内部 Endpoint，自动填入长沙 1 区域。',
      region: 'cn-changsha-1',
    };
  }
  if (hasDomainSuffix(hostname, 'aliyuncs.com')) {
    return { pathStyle: false, provider: '阿里云 OSS', reason: '该 Endpoint 使用 VirtualHost 访问。' };
  }
  if (hasDomainSuffix(hostname, 'myqcloud.com')) {
    return { pathStyle: false, provider: '腾讯云 COS', reason: '新建 Bucket 使用 VirtualHost 访问。' };
  }
  if (hasDomainSuffix(hostname, 'amazonaws.com')) {
    return { pathStyle: false, provider: 'AWS S3', reason: '建议使用 VirtualHost；可在下方改为 Path Style。' };
  }

  return { pathStyle: true, provider: 'S3 兼容服务', reason: '未识别云厂商，默认使用兼容性更高的 Path Style。' };
};
