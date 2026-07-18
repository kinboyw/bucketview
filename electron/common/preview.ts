export const PREVIEW_IPC = {
  open: 'preview-window:open',
  data: 'preview-window:data',
  ready: 'preview-window:ready',
  updateTheme: 'preview-window:update-theme',
  setTextDirty: 'preview-window:set-text-dirty',
  closeRequested: 'preview-window:close-requested',
  confirmClose: 'preview-window:confirm-close',
  saveText: 'preview-window:save-text',
  requestDownload: 'preview-window:request-download',
} as const;

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
