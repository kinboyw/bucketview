import { createApp } from 'vue'
import App from './App.vue'
import Antd from 'ant-design-vue';
import Router from "./router";
import store from "./store";

const app = createApp(App)
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', info, err)
}
app
  .use(Antd)
  .use(Router)
  .use(store)
  .mount('#app')
  .$nextTick(() => {
    postMessage({ payload: 'removeLoading' }, '*')
  })
