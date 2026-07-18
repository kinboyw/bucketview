
<template>
  <CodeBlock :code="viewerState.text" :lang="lang" :prismjs="true"
  theme="tomorrow" />
</template>

<script lang="ts">
import { defineComponent, onMounted , reactive} from 'vue';
import CodeBlock from 'vue3-code-block';
import { getFileExtenstion } from '../common/file';
import 'prismjs/themes/prism-tomorrow.css';

export default defineComponent({
  name: 'pdf',
  props: {
    src: String,
  },
  components: { CodeBlock },
  setup(props) {
    const pdfSrc = props.src || ""

    let viewerState = reactive({text: ""})
    const lang = getFileExtenstion(pdfSrc)
    onMounted(() => {
      fetch(pdfSrc)
        .then((response) => response.text())
        .then((text) => {
          viewerState.text = text;
        });
    })

    return {
      pdfSrc,
      viewerState,
      lang,
    }
  }
});
</script>
