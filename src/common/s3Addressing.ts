export interface S3AddressingAdvice {
  pathStyle: boolean;
  provider: string;
  reason: string;
  region?: string;
  protocol?: 'http' | 'https';
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
 * 提取知名云厂商 endpoint 中的 region 信息
 */
const extractRegion = (hostname: string): string | undefined => {
  // 1. AWS S3:
  // s3.cn-north-1.amazonaws.com.cn -> cn-north-1
  // s3.us-west-2.amazonaws.com -> us-west-2
  // s3-us-west-2.amazonaws.com -> us-west-2
  if (hasDomainSuffix(hostname, 'amazonaws.com') || hasDomainSuffix(hostname, 'amazonaws.com.cn')) {
    const awsMatch = hostname.match(/^s3[.-]([a-z0-9-]+)\.amazonaws\.com/i);
    if (awsMatch && awsMatch[1] && !['external-1'].includes(awsMatch[1])) {
      return awsMatch[1];
    }
  }

  // 2. 阿里云 OSS:
  // oss-cn-hangzhou.aliyuncs.com -> cn-hangzhou
  // oss-cn-hangzhou-internal.aliyuncs.com -> cn-hangzhou
  if (hasDomainSuffix(hostname, 'aliyuncs.com')) {
    const aliMatch = hostname.match(/^oss-([a-z0-9-]+?)(-internal)?\.aliyuncs\.com/i);
    if (aliMatch && aliMatch[1]) {
      return aliMatch[1];
    }
  }

  // 3. 腾讯云 COS:
  // cos.ap-guangzhou.myqcloud.com -> ap-guangzhou
  if (hasDomainSuffix(hostname, 'myqcloud.com')) {
    const txMatch = hostname.match(/^cos\.([a-z0-9-]+)\.myqcloud\.com/i);
    if (txMatch && txMatch[1]) {
      return txMatch[1];
    }
  }

  // 4. 华为云 OBS:
  // obs.cn-north-4.myhuaweicloud.com -> cn-north-4
  if (hasDomainSuffix(hostname, 'myhuaweicloud.com')) {
    const hwMatch = hostname.match(/^obs\.([a-z0-9-]+)\.myhuaweicloud\.com/i);
    if (hwMatch && hwMatch[1]) {
      return hwMatch[1];
    }
  }

  // 5. 百度云 BOS:
  // gz.bcebos.com -> gz
  if (hasDomainSuffix(hostname, 'bcebos.com')) {
    const bdMatch = hostname.match(/^([a-z0-9-]+)\.bcebos\.com/i);
    if (bdMatch && bdMatch[1]) {
      return bdMatch[1];
    }
  }

  // 6. 七牛云 Kodo:
  // s3-cn-east-1.qiniucs.com -> cn-east-1
  if (hasDomainSuffix(hostname, 'qiniucs.com')) {
    const qnMatch = hostname.match(/^s3-([a-z0-9-]+)\.qiniucs\.com/i);
    if (qnMatch && qnMatch[1]) {
      return qnMatch[1];
    }
  }

  // 7. 京东云 OSS:
  // s3.cn-north-1.jdcloud-oss.com -> cn-north-1
  if (hasDomainSuffix(hostname, 'jdcloud-oss.com')) {
    const jdMatch = hostname.match(/^s3\.([a-z0-9-]+)\.jdcloud-oss\.com/i);
    if (jdMatch && jdMatch[1]) {
      return jdMatch[1];
    }
  }

  return undefined;
};

/**
 * MC's `api` field describes request signing, not bucket addressing. Keep
 * provider-specific addressing decisions in one explicit and editable policy.
 */
export const inferS3Addressing = (endpoint: string): S3AddressingAdvice => {
  const trimmed = String(endpoint || '').trim();
  const hostname = getHostname(trimmed);
  const protocol = trimmed.toLowerCase().startsWith('https://') ? 'https' : (trimmed.toLowerCase().startsWith('http://') ? 'http' : undefined);

  // 内部媒体云
  if (hasDomainSuffix(hostname, 's3-legacy.mediacloud.imgo.tv')) {
    return {
      pathStyle: true,
      provider: 'MediaCloud 对象存储（Legacy）',
      reason: '已识别内部 Legacy Endpoint，默认使用 PathStyle，自动填入长沙 2 区域。',
      region: 'cn-changsha-2',
      protocol: protocol || 'http',
    };
  }
  if (hasDomainSuffix(hostname, 's3.mediacloud.imgo.tv')) {
    return {
      pathStyle: true,
      provider: 'MediaCloud 对象存储',
      reason: '已识别内部 Endpoint，默认使用 PathStyle，自动填入长沙 1 区域。',
      region: 'cn-changsha-1',
      protocol: protocol || 'http',
    };
  }

  // 阿里云 OSS
  if (hasDomainSuffix(hostname, 'aliyuncs.com')) {
    return {
      pathStyle: false,
      provider: '阿里云 OSS',
      reason: '阿里云 OSS 使用 VirtualHost 访问。',
      region: extractRegion(hostname),
      protocol: protocol || 'https',
    };
  }

  // 腾讯云 COS
  if (hasDomainSuffix(hostname, 'myqcloud.com')) {
    return {
      pathStyle: false,
      provider: '腾讯云 COS',
      reason: '腾讯云 COS 使用 VirtualHost 访问。',
      region: extractRegion(hostname),
      protocol: protocol || 'https',
    };
  }

  // 华为云 OBS
  if (hasDomainSuffix(hostname, 'myhuaweicloud.com')) {
    return {
      pathStyle: false,
      provider: '华为云 OBS',
      reason: '华为云 OBS 使用 VirtualHost 访问。',
      region: extractRegion(hostname),
      protocol: protocol || 'https',
    };
  }

  // 百度云 BOS
  if (hasDomainSuffix(hostname, 'bcebos.com')) {
    return {
      pathStyle: false,
      provider: '百度云 BOS',
      reason: '百度云 BOS 使用 VirtualHost 访问。',
      region: extractRegion(hostname),
      protocol: protocol || 'https',
    };
  }

  // 七牛云 Kodo
  if (hasDomainSuffix(hostname, 'qiniucs.com')) {
    return {
      pathStyle: false,
      provider: '七牛云 Kodo',
      reason: '七牛云 Kodo S3 兼容接入推荐 VirtualHost 访问。',
      region: extractRegion(hostname),
      protocol: protocol || 'https',
    };
  }

  // 京东云 OSS
  if (hasDomainSuffix(hostname, 'jdcloud-oss.com')) {
    return {
      pathStyle: false,
      provider: '京东云 OSS',
      reason: '京东云 OSS 使用 VirtualHost 访问。',
      region: extractRegion(hostname),
      protocol: protocol || 'https',
    };
  }

  // Cloudflare R2: <account-id>.r2.cloudflarestorage.com
  if (hasDomainSuffix(hostname, 'r2.cloudflarestorage.com')) {
    return {
      pathStyle: true,
      provider: 'Cloudflare R2',
      reason: 'Cloudflare R2 推荐使用 PathStyle 访问。',
      region: 'auto',
      protocol: protocol || 'https',
    };
  }

  // AWS S3
  if (hasDomainSuffix(hostname, 'amazonaws.com') || hasDomainSuffix(hostname, 'amazonaws.com.cn')) {
    return {
      pathStyle: false,
      provider: 'AWS S3',
      reason: 'AWS S3 推荐使用 VirtualHost 访问。',
      region: extractRegion(hostname) || 'us-east-1',
      protocol: protocol || 'https',
    };
  }

  return {
    pathStyle: true,
    provider: 'S3 兼容服务',
    reason: '未识别云厂商，默认使用兼容性更高的 Path Style。',
    region: extractRegion(hostname),
    protocol,
  };
};
