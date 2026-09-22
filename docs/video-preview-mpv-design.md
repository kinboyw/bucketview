# 广播影视级专业视频预览（ProRes / MOV）支持方案

## 1. 现状与痛点

- **文件特征**：影视制作与广电常用的 `Apple ProRes 422 (HQ/LT/Proxy/4444)`，通常封装为 `.mov` 格式，伴随多轨未压缩 PCM 音频（`pcm_s16le`）及时间码流（`tmcd / 0x64636D74`），码率普遍在 100Mbps ~ 250Mbps 以上。
- **核心痛点**：
  1. **解码器缺失**：Chromium / Web 规范仅支持网络常用流媒体格式（H.264/H.265/VP9/AV1 + AAC/Opus），对 ProRes 与 PCM 音频在 `<video>` 中无法硬解或软解；
  2. **时间码轨兼容问题**：FFmpeg / 解复用器在默认探测时若未显式忽略 `tmcd` 流，会报错 `Unsupported codec with id 0 for input stream 7`；
  3. **转码负载高**：150Mbps+ 的 ProRes 实时软件转码极其消耗 CPU，拖拽 Seek 体验差。

---

## 2. 演进路线规划

### 阶段一：短期方案（方案 3 - 独立嵌入式 mpv 二进制进程播放器）
- **定位**：快速落地、免编译 C++ 原生扩展、稳定性最高。
- **架构设计**：
  1. 随包分发或按需静默拉取轻量裁剪版 `mpv.exe`（~30MB，类似已实现的 `rclone` 机制）；
  2. 当用户预览 `.mov`（或检测到 ProRes/DNxHD 编码）时，通过主进程拉起 `mpv` 进程；
  3. 通过 `mpv --input-ipc-server=\\.\pipe\mpv-pipe-bucketview` 实现 JSON-IPC 控制（播放/暂停/Seek/音量/时间码获取）；
  4. 启动参数配置：
     - `--hwdec=auto`：硬件加速直解（NVDEC/D3D11VA/VideoToolbox），轻松拉动百兆码率；
     - `--demuxer-lavf-o=discard=data`：自动丢弃/忽略 tmcd 时间码数据流，彻底避免解码器报错；
     - 直接输入 S3 Presigned URL 或通过 FUSE 本地挂载路径加载。

### 阶段二：长期方案（方案 1 - libmpv + Node Native Addon 内嵌绘制）
- **定位**：极致无缝的 UI 融合体验。
- **架构设计**：
  1. 集成 `libmpv` 动态库（`.dll` / `.dylib`）；
  2. 通过 C++ Node Addon 或 WebGL / WebGPU 共享纹理离屏渲染，直接渲染至 Vue 组件的 `<canvas>` / 自定义 WebGL 容器中；
  3. 复用 Vue 编写的统一深浅色控制栏、选时跳帧、色彩空间调节（Rec.709 / BT.2020 / HDR）。

---

## 3. 阶段一（mpv 二进制验证与实施步骤）

1. **环境与二进制就绪**：
   - Windows 测试版准备 `mpv.exe`；
   - 编写 IPC 桥接层（`electron/main/mpv.ts` 与 `electron/preload`）；
2. **在线流验证测试**：
   - 验证传入 S3 签名链接时的网络 Range 缓冲、ProRes 422 播放流畅度及时间码支持；
3. **前端预览联动**：
   - 在 `FileManage.vue` 视频预览入口判断，对 `.mov` 优先调起 mpv 播放器通道。
