import { defineStore } from "pinia";
import { ConnectionColorGroup, Setting } from "../../electron/preload/types";

export const defaultConnectionColorGroups: ConnectionColorGroup[] = [
  {
    id: 'warm-horizon',
    name: 'Warm Horizon',
    colors: ['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51'],
  },
  {
    id: 'coastal-signal',
    name: 'Coastal Signal',
    colors: ['#003049', '#D62828', '#F77F00', '#FCBF49', '#457B9D'],
  },
  {
    id: 'electric-pop',
    name: 'Electric Pop',
    colors: ['#FFBE0B', '#FB5607', '#FF006E', '#8338EC', '#3A86FF'],
  },
  {
    id: 'ink-rose',
    name: 'Ink Rose',
    colors: ['#2B2D42', '#8D99AE', '#EF233C', '#D90429', '#457B9D'],
  },
  {
    id: 'earth-clay',
    name: 'Earth Clay',
    colors: ['#606C38', '#283618', '#BC6C25', '#A98467', '#6C584C'],
  },
  {
    id: 'harbor-sun',
    name: 'Harbor Sun',
    colors: ['#023047', '#219EBC', '#8ECAE6', '#FFB703', '#FB8500'],
  },
  {
    id: 'modern-bright',
    name: 'Modern Bright',
    colors: ['#EF476F', '#FFD166', '#06D6A0', '#118AB2', '#073B4C'],
  },
  {
    id: 'imperial-market',
    name: 'Imperial Market',
    colors: ['#3D348B', '#7678ED', '#F7B801', '#F18701', '#F35B04'],
  },
  {
    id: 'canyon-sea',
    name: 'Canyon Sea',
    colors: ['#005F73', '#0A9396', '#94D2BD', '#CA6702', '#BB3E03'],
  },
  {
    id: 'gallery-night',
    name: 'Gallery Night',
    colors: ['#22223B', '#4A4E69', '#9A8C98', '#C9ADA7', '#9B2226'],
  },
  {
    id: 'plum-citrus',
    name: 'Plum Citrus',
    colors: ['#390099', '#9E0059', '#FF0054', '#FF5400', '#FFBD00'],
  },
  {
    id: 'mint-ember',
    name: 'Mint Ember',
    colors: ['#0B132B', '#3A506B', '#5BC0BE', '#F25F5C', '#FFE066'],
  },
  {
    id: 'botanical',
    name: 'Botanical',
    colors: ['#386641', '#6A994E', '#A7C957', '#BC4749', '#DDA15E'],
  },
  {
    id: 'violet-flame',
    name: 'Violet Flame',
    colors: ['#2D00F7', '#B100E8', '#F20089', '#FF6D00', '#00BBF9'],
  },
  {
    id: 'atlantic-coral',
    name: 'Atlantic Coral',
    colors: ['#1D3557', '#457B9D', '#A8DADC', '#E63946', '#F4A261'],
  },
  {
    id: 'olive-lake',
    name: 'Olive Lake',
    colors: ['#31572C', '#90A955', '#F9C74F', '#F9844A', '#577590'],
  },
  {
    id: 'paper-signal',
    name: 'Paper Signal',
    colors: ['#14213D', '#FCA311', '#E5383B', '#660708', '#5E60CE'],
  },
  {
    id: 'deep-candy',
    name: 'Deep Candy',
    colors: ['#03071E', '#9D0208', '#DC2F02', '#FFBA08', '#3A86FF'],
  },
  {
    id: 'sea-glass',
    name: 'Sea Glass',
    colors: ['#006D77', '#83C5BE', '#E29578', '#FFDDD2', '#5A189A'],
  },
  {
    id: 'orchid-field',
    name: 'Orchid Field',
    colors: ['#5A189A', '#9D4EDD', '#F72585', '#4CC9F0', '#4895EF'],
  },
];

const fallbackColorGroup = defaultConnectionColorGroups[0];

export const useSettingStore = defineStore('setting', {
  state: () => {
    const data: Setting = {
      appVersion: "",
      fuseBin: "",
      flashUploadEnabled: true,
      flashUploadThresholdMB: 50,
      defaultCacheDirectory: "",
      defaultPageSize: 20,
      defaultDownloadDirectory: "",
      themeMode: 'light',
      listLoadMode: 'waterfall',
      transferConcurrency: 3,
      closeBehavior: 'hide',
      confirmBeforeExit: true,
      connectionColorGroupId: fallbackColorGroup.id,
      customConnectionColorGroups: [],
    }
    return data;
  },
  getters: {
    connectionColorGroups(state): ConnectionColorGroup[] {
      return [
        ...defaultConnectionColorGroups,
        ...(state.customConnectionColorGroups || []).map(group => ({ ...group, custom: true })),
      ];
    },
    activeConnectionColorGroup(state): ConnectionColorGroup {
      const groups = [
        ...defaultConnectionColorGroups,
        ...(state.customConnectionColorGroups || []).map(group => ({ ...group, custom: true })),
      ];
      return groups.find(group => group.id === state.connectionColorGroupId) || fallbackColorGroup;
    },
    activeConnectionColors(): string[] {
      const group = this.activeConnectionColorGroup as ConnectionColorGroup;
      return group.colors.length > 0 ? group.colors : fallbackColorGroup.colors;
    },
  },
  actions: {
    setFlashUploadEnabled(enabled: boolean) {
      this.flashUploadEnabled = enabled;
    },
    setFlashUploadThresholdMB(threshold: number) {
      this.flashUploadThresholdMB = threshold;
    },
    setDefaultCacheDirectory(dir: string) {
      this.defaultCacheDirectory = dir;
    },
    setDefaultPageSize(size: number) {
      this.defaultPageSize = size;
    },
    setDefaultDownloadDirectory(dir: string) {
      this.defaultDownloadDirectory = dir;
    },
    setThemeMode(mode: 'light' | 'dark') {
      this.themeMode = mode;
      document.documentElement.setAttribute('data-theme', mode);
    },
    setListLoadMode(mode: 'pagination' | 'waterfall') {
      this.listLoadMode = mode;
    },
    setTransferConcurrency(value: number) {
      const n = Math.max(1, Math.min(8, Math.floor(Number(value) || 3)));
      this.transferConcurrency = n;
      try {
        (window as any).native?.setTransferConcurrency?.(n);
      } catch {}
    },
    setCloseBehavior(behavior: 'hide' | 'exit') {
      this.closeBehavior = behavior;
    },
    setConfirmBeforeExit(enabled: boolean) {
      this.confirmBeforeExit = enabled;
    },
    setConnectionColorGroup(id: string) {
      this.connectionColorGroupId = id;
    },
    upsertCustomConnectionColorGroup(group: ConnectionColorGroup) {
      const normalized = {
        ...group,
        custom: true,
        colors: group.colors.filter(color => /^#[0-9a-fA-F]{6}$/.test(color)),
      };
      if (!normalized.id) normalized.id = `custom-${Date.now()}`;
      if (!normalized.name) normalized.name = '自定义色组';
      if (normalized.colors.length === 0) normalized.colors = [...fallbackColorGroup.colors];

      const groups = [...(this.customConnectionColorGroups || [])];
      const index = groups.findIndex(item => item.id === normalized.id);
      if (index >= 0) groups[index] = normalized;
      else groups.push(normalized);
      this.customConnectionColorGroups = groups;
    },
    removeCustomConnectionColorGroup(id: string) {
      this.customConnectionColorGroups = (this.customConnectionColorGroups || []).filter(group => group.id !== id);
      if (this.connectionColorGroupId === id) {
        this.connectionColorGroupId = fallbackColorGroup.id;
      }
    }
  },
  persist: {
    key: 'setting',
    storage: localStorage,
  }
})
