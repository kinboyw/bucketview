import { createRouter, createMemoryHistory } from 'vue-router';
import FileManage from "./views/FileManage.vue";

const routes = [
  { path: '/', name: '文件管理', component: FileManage },
]

const router = createRouter({
  history: createMemoryHistory(),
  routes,
});

export default router;
