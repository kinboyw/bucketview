import { createApp } from 'vue'
import App from './App.vue'
import Antd from 'ant-design-vue';
import Router from "./router";
import store from "./store";

const app = createApp(App)
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', info, err)
  try {
    const native = (window as any).native
    native?.ipcSend?.('renderer-error', {
      info,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  } catch {}
}

window.addEventListener('unhandledrejection', (event) => {
  console.error('[UnhandledRejection]', event.reason)
  try {
    const native = (window as any).native
    native?.ipcSend?.('renderer-error', {
      info: 'unhandledrejection',
      message: event.reason instanceof Error ? event.reason.message : String(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack : undefined,
    })
  } catch {}
})
app
  .use(Antd)
  .use(Router)
  .use(store)
  .mount('#app')
  .$nextTick(() => {
    postMessage({ payload: 'removeLoading' }, '*')
  })
