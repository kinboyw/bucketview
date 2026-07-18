import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import PreviewApp from './PreviewApp.vue';

createApp(PreviewApp)
  .use(Antd)
  .mount('#preview-app');
