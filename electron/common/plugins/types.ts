export type PluginId = 'rclone' | 'mpv';

export type PluginSource = 'system' | 'managed' | 'custom';

export type PluginStatus = 'ready' | 'missing' | 'downloading' | 'error';

export interface PluginMeta {
  id: PluginId;
  name: string;
  category: 'filesystem' | 'media';
  description: string;
  supportedPlatforms: string[];
  enabled: boolean;
  status: PluginStatus;
  source?: PluginSource;
  version?: string;
  executablePath?: string;
  customPath?: string;
  config: Record<string, any>;
  errorMessage?: string;
}

export interface PluginEnsureResult {
  success: boolean;
  path?: string;
  source?: PluginSource;
  version?: string;
  message?: string;
}
