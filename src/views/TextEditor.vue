<template>
  <div class="text-editor-wrapper">
    <div class="text-editor-toolbar" v-if="isMarkdown">
      <a-radio-group v-model:value="markdownMode" size="small" button-style="solid">
        <a-radio-button value="preview">Markdown 预览</a-radio-button>
        <a-radio-button value="edit">源代码</a-radio-button>
      </a-radio-group>
    </div>
    <div v-if="loading" class="text-editor-loading">
      <a-spin />
    </div>
    <div v-if="errorText" class="text-editor-error">{{ errorText }}</div>
    <div v-show="!isMarkdown || markdownMode === 'edit'" ref="editorContainer" class="text-editor-container"></div>
    <div v-if="isMarkdown && markdownMode === 'preview'" class="markdown-preview-container markdown-body" v-html="markdownHtml"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import * as monaco from 'monaco-editor';
import { marked } from 'marked';
import 'github-markdown-css/github-markdown.css';

const CHUNK_SIZE = 1024 * 1024;
const MAX_LOAD_BYTES = 10 * 1024 * 1024;
const TEXT_EDITABLE_THRESHOLD = 2 * 1024 * 1024;

const extToLang: Record<string, string> = {
  js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
  vue: 'html', html: 'html', htm: 'html', xhtml: 'html',
  css: 'css', less: 'less', sass: 'scss', scss: 'scss',
  json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell',
  py: 'python', rb: 'ruby', java: 'java', go: 'go',
  cs: 'csharp', vb: 'vb', php: 'php', rust: 'rust', rs: 'rust',
  cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
  swift: 'swift', kotlin: 'kotlin', kt: 'kotlin', dart: 'dart',
  lua: 'lua', r: 'r', scala: 'scala', ini: 'ini',
  conf: 'ini', cfg: 'ini', env: 'ini', properties: 'ini',
  csv: 'plaintext', log: 'plaintext', txt: 'plaintext',
  dockerfile: 'dockerfile', makefile: 'makefile',
};

export default defineComponent({
  name: 'TextEditor',
  props: {
    src: { type: String, required: true },
    language: { type: String, default: '' },
    editable: { type: Boolean, default: true },
    chunked: { type: Boolean, default: false },
    fileSize: { type: Number, default: 0 },
    themeMode: { type: String as () => 'light' | 'dark', default: 'dark' },
  },
  emits: ['save', 'dirty-change'],
  setup(props, { emit }) {
    const editorContainer = ref<HTMLElement>();
    const loading = ref(true);
    const errorText = ref('');
    const dirty = ref(false);
    const loadedBytes = ref(0);
    const chunkLoading = ref(false);
    const hasMore = ref(true);
    const loadLimitReached = ref(false);

    let editor: monaco.editor.IStandaloneCodeEditor | null = null;
    let originalContent = '';
    let currentContent = '';
    let nextStartByte = 0;
    let pendingLine = '';
    let scrollSuppressUntil = 0;
    let isChunkAppending = false;
    const decoder = new TextDecoder('utf-8');

    const resolveLanguage = () => {
      if (props.language && props.language !== 'text') {
        return extToLang[props.language] || props.language;
      }
      return 'plaintext';
    };

    const isMarkdown = computed(() => resolveLanguage() === 'markdown');
    const markdownMode = ref('preview');
    const markdownHtml = computed(() => {
      if (!isMarkdown.value || markdownMode.value !== 'preview') return '';
      return marked.parse(currentContent || originalContent || '') as string;
    });

    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const partialInfo = computed(() => {
      if (!props.chunked) return '';
      return `${formatSize(loadedBytes.value)} / ${formatSize(props.fileSize)}`;
    });

    const initEditor = (content: string, isChunked: boolean) => {
      if (!editorContainer.value) return;
      loading.value = false;

      editor = monaco.editor.create(editorContainer.value, {
        value: content,
        language: resolveLanguage(),
        theme: props.themeMode === 'dark' ? 'vs-dark' : 'vs',
        readOnly: !props.editable || isChunked,
        automaticLayout: true,
        minimap: { enabled: content.length > 2000 },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
        renderWhitespace: 'selection',
        padding: { top: 8 },
      });

      originalContent = content;
      currentContent = content;

      editor.onDidChangeModelContent(() => {
        if (isChunkAppending) return;
        currentContent = editor?.getValue() || '';
        dirty.value = currentContent !== originalContent;
        emit('dirty-change', dirty.value);
      });

      // 仅非分段模式提供 Ctrl+S 保存
      if (!isChunked && props.editable) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          if (dirty.value) {
            emit('save', currentContent);
            originalContent = currentContent;
            dirty.value = false;
          }
        });
      }

      if (isChunked) {
        editor.onDidScrollChange(() => {
          if (!hasMore.value || chunkLoading.value || loadLimitReached.value) return;
          if (Date.now() < scrollSuppressUntil) return;
          const layoutInfo = editor!.getLayoutInfo();
          const scrollTop = editor!.getScrollTop();
          const scrollHeight = editor!.getScrollHeight();
          if (scrollTop + layoutInfo.height >= scrollHeight - 50) {
            loadNextChunk();
          }
        });
      }
    };

    const trimIncompleteLine = (text: string): { content: string; pending: string } => {
      if (text.endsWith('\n')) return { content: text, pending: '' };
      const lastNewline = text.lastIndexOf('\n');
      if (lastNewline >= 0) {
        return { content: text.substring(0, lastNewline + 1), pending: text.substring(lastNewline + 1) };
      }
      return { content: '', pending: text };
    };

    const loadFirstChunk = async () => {
      try {
        const endByte = Math.min(CHUNK_SIZE - 1, props.fileSize - 1);
        const resp = await fetch(props.src, { headers: { Range: `bytes=0-${endByte}` } });

        if (resp.status === 200) {
          const text = await resp.text();
          hasMore.value = false;
          initEditor(text, false);
          loadedBytes.value = props.fileSize;
          return;
        }

        if (resp.status !== 206) throw new Error(`HTTP ${resp.status}`);

        const buffer = await resp.arrayBuffer();
        let text = decoder.decode(buffer, { stream: true });
        loadedBytes.value = buffer.byteLength;
        nextStartByte = buffer.byteLength;

        if (loadedBytes.value < props.fileSize) {
          const trimmed = trimIncompleteLine(text);
          text = trimmed.content;
          pendingLine = trimmed.pending;
        } else {
          hasMore.value = false;
          text += decoder.decode();
        }

        initEditor(text, true);
      } catch (err: any) {
        loading.value = false;
        errorText.value = `加载失败: ${err.message}`;
      }
    };

    const loadNextChunk = async () => {
      if (chunkLoading.value || !hasMore.value || loadLimitReached.value) return;
      chunkLoading.value = true;

      try {
        const endByte = Math.min(nextStartByte + CHUNK_SIZE - 1, props.fileSize - 1);
        const resp = await fetch(props.src, { headers: { Range: `bytes=${nextStartByte}-${endByte}` } });

        if (resp.status === 200) {
          const fullText = await resp.text();
          hasMore.value = false;
          appendToEditor(pendingLine + fullText);
          pendingLine = '';
          loadedBytes.value = props.fileSize;
          return;
        }

        const buffer = await resp.arrayBuffer();
        let decoded = decoder.decode(buffer, { stream: true });

        let text = pendingLine + decoded;
        pendingLine = '';

        nextStartByte = endByte + 1;
        loadedBytes.value = nextStartByte;

        if (loadedBytes.value < props.fileSize) {
          const trimmed = trimIncompleteLine(text);
          text = trimmed.content;
          pendingLine = trimmed.pending;
        } else {
          hasMore.value = false;
          text += decoder.decode();
          if (pendingLine) { text += pendingLine; pendingLine = ''; }
        }

        if (text) appendToEditor(text);
      } catch {
        // silently fail - user can still view loaded content
      } finally {
        chunkLoading.value = false;
      }
    };

    const appendToEditor = (text: string) => {
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;
      const boundaryLine = model.getLineCount();
      const lastLineEnd = model.getLineMaxColumn(boundaryLine);
      isChunkAppending = true;
      editor.executeEdits('chunk-load', [{
        range: new monaco.Range(boundaryLine, lastLineEnd, boundaryLine, lastLineEnd),
        text: '\n' + text,
        forceMoveMarkers: true,
      }]);
      isChunkAppending = false;
      originalContent = editor.getValue();
      currentContent = originalContent;
      dirty.value = false;
      emit('dirty-change', false);
      scrollSuppressUntil = Date.now() + 2500;
      requestAnimationFrame(() => {
        const layoutInfo = editor!.getLayoutInfo();
        const centerOffset = layoutInfo.height / 2;
        const targetScrollTop = editor!.getTopForLineNumber(boundaryLine) - centerOffset;
        const startScrollTop = editor!.getScrollTop();
        const distance = targetScrollTop - startScrollTop;
        if (Math.abs(distance) < 10) return;
        const duration = 600;
        const startTime = performance.now();
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
        const animate = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = easeOutCubic(progress);
          editor!.setScrollTop(startScrollTop + distance * eased);
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      });
    };

    const markSaved = () => {
      originalContent = currentContent;
      dirty.value = false;
    };

    const getCurrentContent = () => currentContent;

    onMounted(() => {
      if (props.chunked) {
        loadFirstChunk();
      } else {
        fetch(props.src)
          .then((resp) => {
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return resp.text();
          })
          .then((text) => {
            initEditor(text, false);
          })
          .catch((err) => {
            loading.value = false;
            errorText.value = `加载失败: ${err.message}`;
          });
      }
    });

    onBeforeUnmount(() => {
      editor?.dispose();
      editor = null;
    });

    watch(() => props.themeMode, (mode) => {
      monaco.editor.setTheme(mode === 'dark' ? 'vs-dark' : 'vs');
    });

    watch(() => props.src, () => {
      editor?.dispose();
      editor = null;
      loading.value = true;
      errorText.value = '';
      dirty.value = false;
      pendingLine = '';
      nextStartByte = 0;
      loadedBytes.value = 0;
      hasMore.value = true;
      loadLimitReached.value = false;
      chunkLoading.value = false;
      decoder.decode();
    });

    return {
      editorContainer, loading, errorText, dirty, markSaved, getCurrentContent,
      chunkLoading, partialInfo, loadLimitReached,
      formatSize, loadedBytes, hasMore,
      isMarkdown, markdownMode, markdownHtml,
    };
  },
});
</script>

<style lang="less" scoped>
.text-editor-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.text-editor-toolbar {
  padding: 8px 16px;
  background: var(--ant-color-bg-container);
  border-bottom: 1px solid var(--ant-color-border-secondary);
  display: flex;
  justify-content: flex-end;
}

.text-editor-container {
  flex: 1;
  min-height: 0;
}

.markdown-preview-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 32px;
  background-color: var(--preview-panel, var(--ant-color-bg-container, #ffffff));
}

.text-editor-loading,
.text-editor-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--preview-muted, var(--ant-color-text-secondary, #64748b));
  font-size: 13px;
}

.text-editor-error {
  color: #b91c1c;
}
</style>
