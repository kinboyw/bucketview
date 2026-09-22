<template>
  <a-drawer
    :open="drawerOpen"
    placement="right"
    :width="520"
    :closable="true"
    rootClassName="right-side-drawer"
    :styles="{ header: { borderBottom: '1px solid var(--ant-color-border-secondary)', padding: '12px 16px', background: 'var(--ant-color-bg-container)', color: 'var(--ant-color-text)' }, body: { padding: '0', background: 'var(--ant-color-bg-container)' } }"
    @close="handleClose"
  >
    <template #title>
      <span class="drawer-title">配置中心</span>
    </template>

    <div class="drawer-tabs">
      <div
        v-for="tab in tabs"
        :class="['drawer-tab', { 'drawer-tab-active': activeTab === tab.key }]"
        @click="activeTab = tab.key; if (tab.key === 'plugins') loadPluginsList();"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 连接配置 -->
    <div v-if="activeTab === 'bucket'" class="drawer-content drawer-content-bucket">
      <div class="connection-toolbar">
        <div class="connection-toolbar-copy">
          <div class="connection-toolbar-title">连接配置</div>
          <div class="connection-toolbar-desc">{{ persistentConnections.length }} 个连接</div>
        </div>
        <div class="connection-toolbar-actions">
          <a-button type="primary" size="small" @click="handleAddConnection">
            <PlusOutlined /> 添加连接
          </a-button>
          <a-dropdown :trigger="['click']">
            <a-button size="small" title="导入连接">
              <ImportOutlined /> 导入 <DownOutlined />
            </a-button>
            <template #overlay>
              <a-menu @click="handleImportMenuClick">
                <a-menu-item key="mc"><ImportOutlined /> 导入 MC Config</a-menu-item>
                <a-menu-item key="share"><ImportOutlined /> 导入分享连接</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </div>
      <div class="connection-list">
        <div v-for="conn in persistentConnections" :key="conn.id" class="connection-card">
          <div
            class="connection-card-header"
            :class="{ 'connection-card-header-static': !hasConnectionTargets(conn) }"
            @click="hasConnectionTargets(conn) && toggleConnection(conn.id)"
          >
            <div class="connection-card-info">
              <span v-if="hasConnectionTargets(conn)" class="expand-icon"><CaretDownOutlined v-if="!collapsedConnections.has(conn.id)" /><CaretRightOutlined v-else /></span>
              <CloudServerOutlined class="connection-icon" />
              <div class="connection-card-copy">
                <div class="connection-card-name-row">
                  <span class="connection-card-name" :class="{ 'connection-disabled': conn.enabled === false }">{{ conn.id }}</span>
                  <span v-if="conn.readonly" class="readonly-badge"><LockOutlined /> 只读</span>
                </div>
                <div class="connection-card-meta">
                  <span class="connection-card-endpoint" :title="conn.endpoint">{{ conn.useSSL ? 'https://' : 'http://' }}{{ conn.endpoint }}</span>
                  <span class="connection-card-scope">{{ connectionScopeLabel(conn) }}</span>
                  <span v-if="connectionTargetCount(conn)" class="connection-card-target-count">{{ connectionTargetCount(conn) }} 个挂载</span>
                </div>
              </div>
            </div>
            <div class="connection-card-actions">
              <span class="config-enable-switch" @click.stop>
                <a-switch :checked="conn.enabled !== false" size="small" @change="(val: boolean) => handleConnectionEnableChange(conn, val)" />
              </span>
              <a-tooltip title="添加挂载"><a-button type="text" size="small" @click.stop="handleAddTarget(conn)">
                <PlusOutlined />
              </a-button></a-tooltip>
              <a-dropdown :trigger="['click']">
                <a-tooltip title="更多操作"><a-button type="text" size="small" @click.stop><MoreOutlined /></a-button></a-tooltip>
                <template #overlay>
                  <a-menu @click="(event: { key: string | number }) => handleConnectionMenuClick(event, conn)">
                    <a-menu-item key="edit" :disabled="conn.readonly"><FormOutlined /> 编辑连接</a-menu-item>
                    <a-menu-item key="share" :disabled="conn.readonly"><ShareAltOutlined /> 分享连接</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item key="delete" class="menu-item-danger"><DeleteOutlined /> 删除连接</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </div>

          <!-- 挂载目标列表 -->
          <div v-if="hasConnectionTargets(conn) && !collapsedConnections.has(conn.id)" class="target-list">
            <div v-for="target in configStore.targetsByConnectionId(conn.id)" :key="target.id" class="target-card">
              <div class="target-card-info">
                <div class="target-card-name-row">
                  <HddOutlined class="target-icon" />
                  <span class="target-card-name" :class="{ 'target-disabled': !target.enabled }" :title="target.pathPrefix ? `${target.bucket}/${target.pathPrefix}` : target.bucket">
                    {{ target.pathPrefix ? `${target.bucket}/${target.pathPrefix}` : target.bucket }}
                  </span>
                  <span class="target-card-mount">{{ target.mountPoint || '未挂载' }}</span>
                </div>
                <div class="target-card-badges">
                  <span v-if="mountStates[target.id]" class="badge badge-mounted"><span class="badge-dot badge-dot-green"></span>已挂载</span>
                  <span v-if="!target.enabled" class="badge badge-off">不在侧栏显示</span>
                </div>
              </div>

              <div class="target-actions">
                <a-tooltip title="在侧边栏显示"><a-switch v-model:checked="target.enabled" size="small" @change="handleTargetEnableChange(target)" class="action-switch" /></a-tooltip>
                <div class="action-btns">
                  <a-tooltip title="编辑"><a-button type="text" size="small" @click="handleEditTarget(conn, target)"><FormOutlined /></a-button></a-tooltip>
                  <a-tooltip v-if="mountStates[target.id]" title="打开挂载目录">
                    <a-button type="text" size="small" @click="handleOpenLocalFolder(target)"><FolderOpenOutlined /></a-button>
                  </a-tooltip>
                  <a-tooltip v-if="mountStates[target.id]" title="卸载">
                    <a-button type="text" size="small" class="action-danger" :disabled="mountStates[target.id + '_loading']" @click="handleUmount(conn, target)">
                      <CloseSquareOutlined />
                    </a-button>
                  </a-tooltip>
                  <a-tooltip v-if="!mountStates[target.id]" title="挂载">
                    <a-button type="text" size="small" class="action-primary" :disabled="!target.mountPoint || mountStates[target.id + '_loading']" @click="handleMount(conn, target)">
                      <PlayCircleOutlined />
                    </a-button>
                  </a-tooltip>
                  <a-popconfirm title="确定删除此挂载？" @confirm="handleDeleteTarget(target.id)">
                    <a-tooltip title="删除"><a-button type="text" size="small" class="action-danger"><DeleteOutlined /></a-button></a-tooltip>
                  </a-popconfirm>
                </div>
              </div>
            </div>
          </div>
        </div>

        <a-empty v-if="persistentConnections.length === 0" description="暂无存储配置" class="drawer-empty" />
      </div>
    </div>

    <!-- 插件中心 -->
    <div v-if="activeTab === 'plugins'" class="drawer-content drawer-content-plugins">
      <div class="system-settings-intro">
        <div>
          <div class="system-settings-title">插件</div>
          <div class="system-settings-desc">当前系统支持的外部工具链插件，用于提供本地挂载、广播级专业播放等扩展能力。</div>
        </div>
        <a-button size="small" :loading="pluginsLoading" @click="loadPluginsList">
          <ReloadOutlined /> 检测状态
        </a-button>
      </div>

      <div class="plugin-list">
        <div v-for="plugin in pluginsList" :key="plugin.id" class="plugin-card">
          <div class="plugin-card-header">
            <div class="plugin-card-info">
              <div class="plugin-title-row">
                <span class="plugin-name">{{ plugin.name }}</span>
                <span class="plugin-platform-tag">支持多平台</span>
                <span v-if="plugin.status === 'ready'" class="badge badge-mounted" :title="plugin.source === 'system' ? '系统环境预装' : (plugin.source === 'custom' ? '自定义路径' : '本地自动管理')">
                  <span class="badge-dot badge-dot-green"></span>已安装 {{ plugin.version ? `(v${plugin.version})` : '' }}
                </span>
                <span v-else-if="plugin.status === 'downloading'" class="badge badge-primary">
                  <LoadingOutlined /> 安装中
                </span>
                <span v-else class="badge badge-off">
                  <span class="badge-dot badge-dot-gray"></span>未安装
                </span>
              </div>
              <div class="plugin-desc">{{ plugin.description }}</div>
            </div>
            <div class="plugin-header-actions">
              <!-- 安装 / 重新安装按钮 -->
              <template v-if="plugin.id === 'rclone'">
                <a-button
                  v-if="plugin.status !== 'ready'"
                  type="primary"
                  size="small"
                  :loading="pluginActionLoading[plugin.id]"
                  @click="handleDownloadRclonePlugin(plugin)"
                >
                  <DownloadOutlined /> 安装
                </a-button>
                <a-button
                  v-else
                  size="small"
                  :loading="pluginActionLoading[plugin.id]"
                  @click="handleDownloadRclonePlugin(plugin)"
                  title="重新下载驱动"
                >
                  重新安装
                </a-button>
              </template>
              <template v-else-if="plugin.id === 'mpv'">
                <a-button
                  v-if="plugin.status !== 'ready'"
                  type="primary"
                  size="small"
                  :loading="pluginActionLoading[plugin.id]"
                  @click="handleInstallMpvPlugin(plugin)"
                >
                  <DownloadOutlined /> 一键安装
                </a-button>
                <a-button
                  v-else
                  size="small"
                  :loading="pluginActionLoading[plugin.id]"
                  @click="handleInstallMpvPlugin(plugin)"
                  title="重新检测或安装 MPV"
                >
                  重新安装
                </a-button>
              </template>

              <!-- 配置按钮 -->
              <a-button
                size="small"
                :type="pluginConfigOpen[plugin.id] ? 'primary' : 'default'"
                :ghost="pluginConfigOpen[plugin.id]"
                @click="pluginConfigOpen[plugin.id] = !pluginConfigOpen[plugin.id]"
              >
                <SettingOutlined /> 配置
              </a-button>

              <!-- 启用/停用开关 -->
              <a-switch
                :checked="plugin.enabled"
                size="small"
                title="启用或停用此插件"
                @change="(val: boolean) => handleTogglePluginEnabled(plugin, val)"
              />
            </div>
          </div>

          <!-- 配置面板（点击配置按钮展开） -->
          <div v-if="pluginConfigOpen[plugin.id]" class="plugin-card-body">
            <!-- 路径信息及操作 -->
            <div class="plugin-field-row">
              <span class="plugin-field-label">程序路径</span>
              <div class="plugin-field-control">
                <a-input
                  :value="plugin.customPath || plugin.executablePath || ''"
                  size="small"
                  placeholder="未设置（自动在系统中查找）"
                  readonly
                  class="plugin-path-input"
                />
                <a-tooltip title="手动指定可执行文件">
                  <a-button size="small" @click="handleSelectPluginCustomPath(plugin)">
                    <FolderOpenOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="plugin.customPath" title="重置为默认检测路径">
                  <a-button size="small" @click="handleResetPluginCustomPath(plugin)">
                    重置
                  </a-button>
                </a-tooltip>
              </div>
            </div>

            <!-- rclone 专属配置 -->
            <template v-if="plugin.id === 'rclone'">
              <div class="plugin-field-row">
                <span class="plugin-field-label">缓存目录</span>
                <div class="plugin-field-control">
                  <a-input
                    v-model:value="defaultCacheDirectoryValue"
                    size="small"
                    placeholder="系统临时目录"
                    @change="handleDefaultCacheDirectoryChange"
                  />
                  <a-tooltip title="选择挂载缓存目录">
                    <a-button size="small" @click="handleSelectDefaultCacheDirectory">
                      <FolderOpenOutlined />
                    </a-button>
                  </a-tooltip>
                </div>
              </div>
            </template>

            <!-- mpv 专属配置 -->
            <template v-if="plugin.id === 'mpv'">
              <div class="plugin-field-row">
                <span class="plugin-field-label">播放策略</span>
                <div class="plugin-field-control">
                  <a-radio-group
                    :value="plugin.config?.playMode || 'smart'"
                    size="small"
                    @change="(e: any) => handleUpdatePluginSpecificConfig(plugin, { playMode: e.target.value })"
                  >
                    <a-radio-button value="smart">智能识别 (MOV/ProRes)</a-radio-button>
                    <a-radio-button value="always">始终接管所有视频</a-radio-button>
                    <a-radio-button value="manual">仅手动调起</a-radio-button>
                  </a-radio-group>
                </div>
              </div>
              <div class="plugin-field-row">
                <span class="plugin-field-label">硬件加速</span>
                <div class="plugin-field-control">
                  <a-switch
                    :checked="plugin.config?.hwdec !== false"
                    size="small"
                    @change="(val: boolean) => handleUpdatePluginSpecificConfig(plugin, { hwdec: val })"
                  />
                  <span class="plugin-field-tip">启用 GPU 硬件直解 (D3D11 / NVDEC / VideoToolbox)</span>
                </div>
              </div>
              <div class="plugin-field-row">
                <span class="plugin-field-label">窗口置顶</span>
                <div class="plugin-field-control">
                  <a-switch
                    :checked="plugin.config?.ontop === true"
                    size="small"
                    @change="(val: boolean) => handleUpdatePluginSpecificConfig(plugin, { ontop: val })"
                  />
                  <span class="plugin-field-tip">播放窗口始终保持在最前</span>
                </div>
              </div>
              <div class="plugin-field-row" style="margin-top: 2px;">
                <span class="plugin-field-label"></span>
                <div class="plugin-field-control">
                  <a-button size="small" type="link" style="padding: 0; height: auto; font-size: 11px;" @click="handleShowMpvInstallGuide">
                    查看手动安装命令行指引
                  </a-button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 系统设置 -->
    <div v-if="activeTab === 'system'" class="drawer-content drawer-content-settings">
      <div class="system-settings-intro">
        <div>
          <div class="system-settings-title">系统设置</div>
          <div class="system-settings-desc">管理本机路径、传输方式和应用运行行为。</div>
        </div>
      </div>

      <section class="system-setting-group">
        <div class="system-setting-group-head">
          <FolderOpenOutlined class="system-setting-group-icon" />
          <div>
            <div class="system-setting-group-title">路径与目录</div>
            <div class="system-setting-group-desc">挂载程序、缓存和下载文件的本地位置。</div>
          </div>
        </div>
        <div class="system-setting-list">
          <div class="system-setting-row system-setting-row-path">
            <div class="system-setting-copy"><div class="system-setting-label">挂载程序</div><div class="system-setting-desc">留空时首次挂载会自动下载 rclone。</div></div>
            <div class="system-setting-control"><a-input v-model:value="fuseBinValue" size="small" placeholder="自动管理 rclone" @change="handleFuseBinChange" /><a-tooltip title="选择本地程序"><a-button size="small" @click="handleSelectFuse"><FolderOpenOutlined /></a-button></a-tooltip></div>
          </div>
          <div class="system-setting-row system-setting-row-path">
            <div class="system-setting-copy"><div class="system-setting-label">默认缓存目录</div><div class="system-setting-desc">留空时使用系统临时目录。</div></div>
            <div class="system-setting-control"><a-input v-model:value="defaultCacheDirectoryValue" size="small" placeholder="系统临时目录" @change="handleDefaultCacheDirectoryChange" /><a-tooltip title="选择缓存目录"><a-button size="small" @click="handleSelectDefaultCacheDirectory"><FolderOpenOutlined /></a-button></a-tooltip></div>
          </div>
          <div class="system-setting-row system-setting-row-path">
            <div class="system-setting-copy"><div class="system-setting-label">默认下载目录</div><div class="system-setting-desc">设置后下载不再询问保存位置。</div></div>
            <div class="system-setting-control"><a-input v-model:value="defaultDownloadDirectoryValue" size="small" placeholder="每次选择目录" @change="handleDefaultDownloadDirectoryChange" /><a-tooltip title="选择下载目录"><a-button size="small" @click="handleSelectDefaultDownloadDirectory"><FolderOpenOutlined /></a-button></a-tooltip></div>
          </div>
        </div>
      </section>

      <section class="system-setting-group">
        <div class="system-setting-group-head">
          <HddOutlined class="system-setting-group-icon" />
          <div><div class="system-setting-group-title">列表与传输</div><div class="system-setting-group-desc">控制文件浏览方式和后台传输负载。</div></div>
        </div>
        <div class="system-setting-list">
          <div class="system-setting-row"><div class="system-setting-copy"><div class="system-setting-label">默认列表行数</div><div class="system-setting-desc">可在文件列表中临时调整。</div></div><div class="system-setting-control"><a-select v-model:value="defaultPageSizeValue" size="small" class="setting-select-sm" @change="handleDefaultPageSizeChange"><a-select-option :value="10">10 行/页</a-select-option><a-select-option :value="20">20 行/页</a-select-option><a-select-option :value="50">50 行/页</a-select-option><a-select-option :value="100">100 行/页</a-select-option></a-select></div></div>
          <div class="system-setting-row"><div class="system-setting-copy"><div class="system-setting-label">列表加载模式</div><div class="system-setting-desc">瀑布流滚动加载；翻页按页切换。</div></div><div class="system-setting-control"><a-radio-group v-model:value="listLoadModeValue" size="small" @change="handleListLoadModeChange"><a-radio-button value="waterfall">瀑布流</a-radio-button><a-radio-button value="pagination">翻页</a-radio-button></a-radio-group></div></div>
          <div class="system-setting-row"><div class="system-setting-copy"><div class="system-setting-label">传输并发数</div><div class="system-setting-desc">数值越高吞吐越高，也更占用带宽与 CPU。</div></div><div class="system-setting-control"><a-select v-model:value="transferConcurrencyValue" size="small" class="setting-select-md" @change="handleTransferConcurrencyChange"><a-select-option :value="1">1（串行）</a-select-option><a-select-option :value="2">2</a-select-option><a-select-option :value="3">3（推荐）</a-select-option><a-select-option :value="4">4</a-select-option><a-select-option :value="6">6</a-select-option><a-select-option :value="8">8</a-select-option></a-select></div></div>
        </div>
      </section>

      <section class="system-setting-group">
        <div class="system-setting-group-head">
          <CloseSquareOutlined class="system-setting-group-icon" />
          <div><div class="system-setting-group-title">应用行为与诊断</div><div class="system-setting-group-desc">关闭窗口后的运行方式，以及本地故障排查入口。</div></div>
        </div>
        <div class="system-setting-list">
          <div class="system-setting-row"><div class="system-setting-copy"><div class="system-setting-label">关闭主窗口时</div><div class="system-setting-desc">隐藏后，传输和挂载仍可在后台继续运行。</div></div><div class="system-setting-control"><a-radio-group v-model:value="closeBehaviorValue" size="small" @change="handleCloseBehaviorChange"><a-radio-button value="hide">隐藏到任务栏</a-radio-button><a-radio-button value="exit">退出应用</a-radio-button></a-radio-group></div></div>
          <div v-if="closeBehaviorValue === 'exit'" class="system-setting-row system-setting-row-secondary"><div class="system-setting-copy"><div class="system-setting-label">退出前显示影响提示</div><div class="system-setting-desc">关闭后可随时回到这里重新开启。</div></div><div class="system-setting-control system-setting-control-end"><a-switch v-model:checked="confirmBeforeExitValue" size="small" @change="handleConfirmBeforeExitChange" /></div></div>
          <div class="system-setting-row"><div class="system-setting-copy"><div class="system-setting-label">诊断日志</div><div class="system-setting-desc">用于排查崩溃、更新和传输异常，日志仅保存在本机。</div></div><div class="system-setting-control"><a-button size="small" @click="handleOpenLogDirectory"><FolderOpenOutlined /> 打开目录</a-button></div></div>
        </div>
      </section>

      <section class="system-setting-group system-setting-group-appearance">
        <div class="system-setting-group-head">
          <CheckCircleFilled class="system-setting-group-icon" />
          <div><div class="system-setting-group-title">连接主题色</div><div class="system-setting-group-desc">连接和标签页会按色组循环分配颜色。</div></div>
          <a-button size="small" class="system-setting-group-action" @click="handleCopyColorGroup">复制为自定义</a-button>
        </div>
        <div class="color-group-picker">
          <div
            v-for="group in connectionColorGroups"
            :key="group.id"
            :class="['color-group-card', { 'color-group-card-active': colorGroupIdValue === group.id }]"
            @click="handleConnectionColorGroupChange(group.id)"
          >
            <div class="color-group-card-head">
              <div class="color-group-title">
                <CheckCircleFilled v-if="colorGroupIdValue === group.id" class="color-group-check" />
                <span class="color-group-name">{{ group.name }}</span>
              </div>
              <span v-if="group.custom" class="color-group-tag">自定义</span>
            </div>
            <div class="color-group-strip">
              <span
                v-for="(color, index) in group.colors"
                :key="`${group.id}-${color}-${index}`"
                class="color-strip-item"
                :style="{ backgroundColor: color }"
                :title="color"
              ></span>
            </div>
          </div>
        </div>
        <div v-if="activeCustomColorGroup" class="color-group-editor">
          <div class="color-group-editor-head">
            <a-input v-model:value="activeCustomColorGroup.name" size="small" style="width: 180px" placeholder="色组名称" @change="syncActiveCustomColorGroup" />
            <a-button size="small" @click="handleAddColorToGroup">新增颜色</a-button>
            <a-popconfirm title="确定删除此自定义色组？" @confirm="handleDeleteCustomColorGroup">
              <a-button size="small" danger>删除色组</a-button>
            </a-popconfirm>
          </div>
          <div class="color-editor-list">
            <div v-for="(color, index) in activeCustomColorGroup.colors" :key="`${activeCustomColorGroup.id}-${index}`" class="color-editor-item">
              <input class="color-picker-input" type="color" :value="normalizeHexColor(color)" @input="handleColorPickerInput(index, $event)" />
              <a-input v-model:value="activeCustomColorGroup.colors[index]" size="small" class="color-hex-input" @blur="handleColorHexBlur(index)" />
              <a-button size="small" type="text" class="action-danger" @click="handleRemoveColorFromGroup(index)">
                <DeleteOutlined />
              </a-button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 关于 -->
    <div v-if="activeTab === 'about'" class="drawer-content">
      <div class="setting-card about-card">
        <div class="about-header">
          <img src="/favicon.svg" alt="logo" class="about-logo" />
          <div class="about-title-block">
            <div class="about-app-name">BucketView</div>
            <div class="about-app-desc">面向对象存储的跨平台桌面管理工具</div>
          </div>
        </div>

        <div class="setting-divider"></div>

        <div class="about-info-list">
          <div class="about-info-row">
            <span class="about-info-label">当前版本</span>
            <span class="about-info-value">v{{ appVersion }}</span>
          </div>
          <div class="about-info-row">
            <span class="about-info-label">运行平台</span>
            <span class="about-info-value">{{ appPlatform }}</span>
          </div>
          <div class="about-info-row">
            <span class="about-info-label">构建信息</span>
            <span class="about-info-value">{{ buildInfo }}</span>
          </div>
          <div class="about-info-row">
            <span class="about-info-label">许可证</span>
            <span class="about-info-value">MIT License</span>
          </div>
        </div>

        <div class="setting-divider"></div>

        <div class="about-update-block">
          <div class="about-update-title">版本更新</div>
          <div class="about-update-status">{{ updateStatusText }}</div>
          <div v-if="updateDownloading" class="about-progress">
            <a-progress :percent="updateProgress" size="small" :show-info="true" />
          </div>
          <div class="about-update-actions">
            <button
              type="button"
              class="about-action-btn about-action-btn-primary"
              :class="{ 'is-loading': updateChecking }"
              :disabled="updateChecking || updateDownloading || updateInstalling"
              @click="handleCheckUpdate"
            >
              <span v-if="updateChecking" class="about-action-spinner"></span>
              <span>{{ updateChecking ? '检查中...' : '检查更新' }}</span>
            </button>
            <button
              v-if="updateAvailableVersion && !updateDownloaded"
              type="button"
              class="about-action-btn"
              :class="{ 'is-loading': updateDownloading }"
              :disabled="updateChecking || updateDownloading || updateInstalling"
              @click="handleDownloadUpdate"
            >
              <span v-if="updateDownloading" class="about-action-spinner"></span>
              <span>{{ updateDownloading ? '下载中...' : '下载更新' }}</span>
            </button>
            <button
              v-if="updateDownloaded"
              type="button"
              class="about-action-btn about-action-btn-primary"
              :class="{ 'is-loading': updateInstalling }"
              :disabled="updateChecking || updateDownloading || updateInstalling"
              @click="handleInstallUpdate"
            >
              <span v-if="updateInstalling" class="about-action-spinner"></span>
              <span>{{ updateInstalling ? '安装中...' : '安装更新' }}</span>
            </button>
          </div>
          <div class="setting-desc">检查到新版本后可后台下载，下载完成后可手动安装；安装时应用会退出并完成替换。</div>
        </div>

        <div class="setting-divider"></div>

        <div class="about-copyright">
          <div class="about-copyright-title">版权声明</div>
          <div class="about-copyright-text">
            Copyright © 2023-{{ copyrightYear }} BucketView Contributors. All rights reserved.
          </div>
          <div class="about-copyright-text">
            本软件基于 MIT 协议开源发布，允许在遵守协议的前提下自由使用、复制、修改与分发。软件按“现状”提供，不作任何明示或暗示担保。
          </div>
          <div class="about-copyright-text">
            项目主页：
            <a class="about-link" href="https://github.com/kinboyw/bucketview" target="_blank" rel="noreferrer">github.com/kinboyw/bucketview</a>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑连接 Modal -->
    <a-modal
      :open="connectionModalState.visible"
      width="540px"
      :title="connectionModalTitle"
      @cancel="handleConnectionModalCancel"
    >
      <template #footer>
        <a-button @click="handleConnectionModalCancel">取消</a-button>
        <a-button :loading="connectionTesting" @click="handleTestConnection">测试连接</a-button>
        <a-button type="primary" @click="handleConnectionModalOk">提交</a-button>
      </template>
      <a-form
        ref="connectionModalFormRef"
        :model="connectionModalFormState"
        layout="vertical"
        name="connectionModalForm"
        class="compact-form"
      >
        <div class="connection-form-section">
          <div class="connection-form-section-title">基本信息</div>
          <div class="connection-form-section-desc">设置连接名称和对象存储服务地址。</div>
        </div>
        <div class="compact-row">
          <a-form-item
            name="id"
            label="连接名称"
            :rules="[{ required: true, message: '请输入连接名称' }]"
            class="compact-item compact-item-half"
          >
            <a-input
              v-model:value="connectionModalFormState.id"
              :disabled="connectionIdDisabled"
              placeholder="例如: my-minio"
              size="small"
            />
          </a-form-item>
          <div class="compact-row-spacer"></div>
          <a-form-item
            name="group"
            label="分组名称（可选）"
            class="compact-item compact-item-half"
          >
            <a-auto-complete
              v-model:value="connectionModalFormState.group"
              :options="existingGroupOptions"
              :filter-option="(input: string, option: { value?: string }) => String(option?.value || '').toLowerCase().includes(input.toLowerCase())"
              placeholder="默认分组"
              size="small"
            />
          </a-form-item>
        </div>
        <a-form-item
          name="endpoint"
          label="Endpoint"
          :rules="[
            { required: true, message: '请输入Endpoint' },
            {
              async validator(_rule: any, value: string) {
                const cleaned = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
                if (!cleaned) throw new Error('请输入Endpoint');
                if (!/^[\w.-]+(:\d+)?$/.test(cleaned)) throw new Error('格式: host:port（例如 s3.example.com:9000）');
              }
            }
          ]"
          class="compact-item"
        >
          <a-input
            v-model:value="connectionModalFormState.endpoint"
            placeholder="例如: s3.example.com:9000"
            size="small"
            @blur="handleEndpointBlur"
          >
            <template #addonBefore>
              <a-select v-model:value="endpointProtocol" style="width: 80px" size="small">
                <a-select-option value="http">http://</a-select-option>
                <a-select-option value="https">https://</a-select-option>
              </a-select>
            </template>
            <template #addonAfter>
              <a-switch v-model:checked="connectionModalFormState.pathStyle" size="small" />
              <span style="font-size: 11px; margin-left: 4px; color: #6b7280" title="启用则为 http://host/bucket, 禁用则为 http://bucket.host">PathStyle</span>
            </template>
          </a-input>
        </a-form-item>
        <a-form-item
          name="region"
          label="Region（部分服务需指定）"
          class="compact-item"
        >
          <a-input v-model:value="connectionModalFormState.region" placeholder="例如: us-east-1" size="small" />
        </a-form-item>
        <div class="connection-form-section connection-form-section-spaced">
          <div class="connection-form-section-title">认证信息</div>
          <div class="connection-form-section-desc">密钥仅保存在本地，用于访问对应的对象存储服务。</div>
        </div>
        <div class="compact-row">
          <a-form-item
            name="accessKeyId"
            label="AccessKeyId"
            :rules="[{ required: true, message: '请输入AccessKeyId' }]"
            class="compact-item compact-item-half"
          >
            <a-input v-model:value="connectionModalFormState.accessKeyId" placeholder="访问密钥ID" size="small" />
          </a-form-item>
          <div class="compact-row-spacer"></div>
          <a-form-item
            name="accessKeySecret"
            label="AccessKeySecret"
            :rules="[{ required: true, message: '请输入AccessKeySecret' }]"
            class="compact-item compact-item-half"
          >
            <a-input-password v-model:value="connectionModalFormState.accessKeySecret" placeholder="访问密钥密码" size="small" />
          </a-form-item>
        </div>
        <div class="advanced-config-toggle" :class="{ 'advanced-config-toggle-active': advancedConfigVisible }" @click="advancedConfigVisible = !advancedConfigVisible">
          <span>访问范围（可选）</span>
          <span class="advanced-config-summary">{{ connectionModalFormState.bucket ? (connectionModalFormState.pathPrefix ? `${connectionModalFormState.bucket}/${connectionModalFormState.pathPrefix}` : connectionModalFormState.bucket) : '全部 Bucket' }}</span>
          <DownOutlined v-if="advancedConfigVisible" class="toggle-icon" />
          <RightOutlined v-else class="toggle-icon" />
        </div>
        <div v-show="advancedConfigVisible" class="advanced-config-content">
          <div class="compact-row">
            <a-form-item name="bucket" label="Bucket (可选)" class="compact-item compact-item-half">
            <!-- 有 bucket 列表时：下拉选择 + input 模糊过滤 -->
            <a-select
              v-if="allBucketsCache.length && !bucketListFailed"
              v-model:value="connectionModalFormState.bucket"
              showSearch
              allowClear
              placeholder="搜索或留空访问所有桶"
              size="small"
              :filter-option="filterBucketOption"
              :not-found-content="null"
              @focus="handleBucketFocus"
            >
              <a-select-option v-for="b in allBucketsCache" :key="b" :value="b">{{ b }}</a-select-option>
            </a-select>
            <!-- 无 bucket 列表时：手动输入 -->
            <a-input
              v-else
              v-model:value="connectionModalFormState.bucket"
              placeholder="手动输入桶名"
              size="small"
              allowClear
            >
              <template #addonAfter>
                <span v-if="bucketFetching" style="color:#9ca3af"><a-spin size="small" /> 加载中</span>
                <span v-else-if="bucketListFailed" style="color:#9ca3af;font-size:11px">无权限</span>
                <span v-else style="cursor:pointer;color:#6b7280" @click="retryFetchBuckets">加载列表</span>
              </template>
            </a-input>
          </a-form-item>
          <div class="compact-row-spacer"></div>
            <a-form-item name="pathPrefix" label="路径前缀 (可选)" class="compact-item compact-item-half">
              <a-input
                v-model:value="connectionModalFormState.pathPrefix"
                placeholder="仅指定Bucket后生效"
                size="small"
                :disabled="!connectionModalFormState.bucket"
                @blur="connectionModalFormState.pathPrefix = StringUtil.trim(connectionModalFormState.pathPrefix || '', '/')"
              />
            </a-form-item>
          </div>
        </div>
      </a-form>
    </a-modal>

    <!-- 导入 MC Config Modal -->
    <a-modal
      v-model:open="mcImportVisible"
      title="导入 MinIO MC Config"
      width="860px"
      @ok="handleMcImport"
      :okButtonProps="{ disabled: mcImportItems.length === 0 || selectedMcImportCount === 0 }"
      :okText="mcImportItems.length ? `导入选中 ${selectedMcImportCount} 项` : '导入'"
      cancelText="取消"
      @cancel="handleMcImportCancel"
    >
      <div class="mc-import-toolbar">
        <span>粘贴或选择 <code>~/.mc/config.json</code> 后先解析，再选择需要导入的连接。</span>
        <a-button size="small" @click="handleMcImportFile"><FolderOpenOutlined /> 选择文件</a-button>
      </div>
      <a-textarea
        v-model:value="mcImportText"
        :rows="mcImportItems.length ? 4 : 10"
        placeholder="例如:&#13;&#10;{&#13;&#10;  &quot;version&quot;: &quot;10&quot;,&#13;&#10;  &quot;aliases&quot;: { ... }&#13;&#10;}"
      />
      <div class="mc-import-actions">
        <a-button size="small" type="primary" @click="handleMcImportParse">解析配置</a-button>
        <a-button size="small" :disabled="mcImportItems.length === 0" @click="handleMcImportSelectAll(true)">全选</a-button>
        <a-button size="small" :disabled="mcImportItems.length === 0" @click="handleMcImportSelectAll(false)">全不选</a-button>
        <span v-if="mcImportParseMessage" class="mc-import-message">{{ mcImportParseMessage }}</span>
      </div>

      <div v-if="mcImportItems.length" class="mc-import-list">
        <div v-for="item in mcImportItems" :key="item.sourceAlias" class="mc-import-row" :class="{ 'mc-import-row-disabled': !item.selected }">
          <div class="mc-import-card-head">
            <a-checkbox v-model:checked="item.selected" />
            <div class="mc-import-source">
              <span class="mc-import-source-name">{{ item.connection.id }}</span>
              <span class="mc-import-source-url">{{ item.sourceAlias }} · {{ item.connection.useSSL ? 'https://' : 'http://' }}{{ item.connection.endpoint }}</span>
            </div>
            <div class="mc-import-summary">
              <span>{{ item.connection.region || 'us-east-1' }}</span>
              <span>{{ item.connection.bucket ? (item.connection.pathPrefix ? `${item.connection.bucket}/${item.connection.pathPrefix}` : item.connection.bucket) : '全部 Bucket' }}</span>
            </div>
            <a-switch v-model:checked="item.connection.enabled" size="small" />
            <a-button size="small" @click="handleMcImportEditItem(item)">编辑</a-button>
          </div>
          <div class="mc-import-addressing">
            <a-radio-group v-model:value="item.connection.pathStyle" size="small">
              <a-radio-button :value="true">Path Style</a-radio-button>
              <a-radio-button :value="false">VirtualHost</a-radio-button>
            </a-radio-group>
          </div>
        </div>
      </div>
    </a-modal>

    <!-- 分享连接 Modal -->
    <a-modal
      v-model:open="shareModalState.visible"
      title="分享连接"
      width="560px"
      :footer="null"
    >
      <a-alert
        type="warning"
        show-icon
        message="请把完整地址当作密码传递"
        description="默认仅允许使用连接，不会在导入端显示或允许编辑 Secret Key。"
        style="margin-bottom: 12px"
      />
      <div class="share-mode-row">
        <a-checkbox v-model:checked="shareReadonly">导入后仅允许使用，不允许查看或编辑连接配置</a-checkbox>
      </div>
      <div class="share-expiry-row">
        <span class="share-expiry-label">分享有效期</span>
        <a-select v-model:value="shareExpiry" size="small" class="share-expiry-select" @change="refreshShareText">
          <a-select-option value="never">永久有效</a-select-option>
          <a-select-option value="1h">1 小时</a-select-option>
          <a-select-option value="1d">1 天</a-select-option>
          <a-select-option value="7d">7 天</a-select-option>
        </a-select>
      </div>
      <a-textarea :value="shareModalState.shareText" :rows="6" readonly />
      <div class="share-modal-actions">
        <span class="share-connection-name">{{ shareModalState.connectionName }}</span>
        <a-button type="primary" size="small" @click="handleCopyConnectionShare"><CopyOutlined /> 复制分享地址</a-button>
      </div>
    </a-modal>

    <!-- 导入分享连接 Modal -->
    <a-modal
      v-model:open="shareImportVisible"
      title="导入分享连接"
      width="560px"
      :ok-button-props="{ disabled: !shareImportPreview }"
      ok-text="导入连接"
      cancel-text="取消"
      @ok="handleImportConnectionShare"
      @cancel="handleShareImportCancel"
    >
      <a-textarea
        v-model:value="shareImportText"
        :rows="6"
        placeholder="粘贴 BucketView 连接分享地址"
        @change="parseConnectionShareText"
      />
      <a-alert
        v-if="shareImportPreview"
        type="success"
        show-icon
        message="分享地址校验成功"
        :description="`${shareImportPreview.id} · ${shareImportPreview.useSSL ? 'https://' : 'http://'}${shareImportPreview.endpoint}${shareImportPreview.bucket ? ` · ${shareImportPreview.bucket}${shareImportPreview.pathPrefix ? `/${shareImportPreview.pathPrefix}` : ''}` : ''}`"
        style="margin-top: 12px"
      />
      <div v-if="shareImportPreview && shareImportExpiresAt" class="share-import-expiry">有效期至 {{ formatShareExpiry(shareImportExpiresAt) }}</div>
    </a-modal>

    <!-- 添加挂载 Modal -->
    <a-modal
      :open="targetModalState.visible"
      width="480px"
      :title="targetModalState.editingTargetId ? '编辑挂载' : '添加挂载'"
      okText="提交"
      cancelText="取消"
      @ok="handleTargetModalOk"
      @cancel="targetModalState.visible = false"
    >
      <a-form layout="vertical" class="compact-form">
        <div class="compact-row">
          <a-form-item label="Bucket" required class="compact-item compact-item-half">
            <a-select
              v-if="allBucketsCache.length && !bucketListFailed"
              v-model:value="targetModalFormState.bucket"
              showSearch
              allowClear
              placeholder="搜索过滤"
              size="small"
              :filter-option="filterBucketOption"
              :disabled="!!targetModalState.lockedBucket"
              :not-found-content="null"
              @focus="handleTargetBucketFocus"
            >
              <a-select-option v-for="b in allBucketsCache" :key="b" :value="b">{{ b }}</a-select-option>
            </a-select>
            <a-input
              v-else
              v-model:value="targetModalFormState.bucket"
              placeholder="手动输入桶名"
              size="small"
              :disabled="!!targetModalState.lockedBucket"
            >
              <template #addonAfter>
                <span v-if="bucketFetching" style="color:#9ca3af"><a-spin size="small" /> 加载中</span>
                <span v-else-if="bucketListFailed" style="color:#9ca3af;font-size:11px">无权限</span>
                <span v-else style="cursor:pointer;color:#6b7280" @click="retryFetchBucketsTarget">加载列表</span>
              </template>
            </a-input>
          </a-form-item>
          <div class="compact-row-spacer"></div>
          <a-form-item label="路径前缀" class="compact-item compact-item-half">
            <a-input v-model:value="targetModalFormState.pathPrefix" :placeholder="targetPathPrefixPlaceholder" size="small" @blur="targetModalFormState.pathPrefix = StringUtil.trim(targetModalFormState.pathPrefix || '', '/')" />
            <div v-if="targetPathPrefixWarning" class="form-warning">{{ targetPathPrefixWarning }}</div>
          </a-form-item>
        </div>
        <div class="compact-row">
          <a-form-item :label="isWindows ? '盘符' : '挂载点'" required class="compact-item compact-item-half">
            <a-select
              v-if="isWindows"
              v-model:value="targetModalFormState.mountPoint"
              placeholder="选择盘符"
              size="small"
            >
              <a-select-option v-for="drive in availableDrives" :key="drive" :value="drive">{{ drive }}</a-select-option>
            </a-select>
            <a-input
              v-else
              v-model:value="targetModalFormState.mountPoint"
              placeholder="挂载路径，如 /mnt/bucket"
              size="small"
            />
          </a-form-item>
          <div class="compact-row-spacer"></div>
          <a-form-item label="缓存目录（可选）" class="compact-item compact-item-half">
            <a-input
              v-model:value="targetModalFormState.cacheDirectory"
              placeholder="留空则使用全局缓存目录"
              size="small"
            >
              <template #addonAfter>
                <FolderOpenOutlined @click="handleSelectCacheDir" style="cursor: pointer" />
              </template>
            </a-input>
          </a-form-item>
        </div>
        <div class="compact-row">
          <a-form-item label="开机自动挂载" class="compact-item compact-item-half">
            <a-switch v-model:checked="targetModalFormState.autoMount" size="small" />
            <span class="form-inline-hint">仅在应用以开机启动模式运行时生效</span>
          </a-form-item>
        </div>
      </a-form>
    </a-modal>
  </a-drawer>
</template>

<script lang="ts">
import { defineComponent, reactive, ref, computed, watch, onMounted, toRaw, h, nextTick } from 'vue';
import {
  PlusOutlined,
  ImportOutlined,
  DeleteOutlined,
  FormOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  CloseSquareOutlined,
  DownOutlined,
  RightOutlined,
  CloudServerOutlined,
  HddOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  CheckCircleFilled,
  MoreOutlined,
  ShareAltOutlined,
  LockOutlined,
  CopyOutlined,
  ReloadOutlined,
  LoadingOutlined,
  SettingOutlined,
  DownloadOutlined,
} from '@ant-design/icons-vue';
import { Connection, ConnectionColorGroup, MountTarget, PreloadStorage, PreloadNative, PreloadFuse, UpdaterResponse } from '../../electron/preload/types';
import { FormInstance, notification, Modal } from 'ant-design-vue';
import { defaultStorage, useConfigStore } from '../store/config';
import { defaultConnectionColorGroups, useSettingStore } from '../store/setting';
import StringUtil from '../common/stringUtil';
import { inferS3Addressing, type S3AddressingAdvice } from '../common/s3Addressing';
import _ from "lodash";

const storage = (window as any).storage as PreloadStorage;
const native = (window as any).native as PreloadNative;
const fuse = (window as any).fuse as PreloadFuse;

const isWindows = native.osType() === "Windows_NT";
const defaultDrives: string[] = [];
if (isWindows) {
  for (let i = 67; i <= 90; i++) {
    defaultDrives.push(String.fromCharCode(i) + ":");
  }
}

const defaultConnection: Connection = {
  id: "",
  endpoint: "",
  accessKeyId: "",
  accessKeySecret: "",
  region: "",
  bucket: "",
  pathPrefix: "",
  pathStyle: false,
};

interface McImportItem {
  sourceAlias: string;
  selected: boolean;
  protocol: 'http' | 'https';
  connection: Connection;
  addressing: S3AddressingAdvice;
}

export default defineComponent({
  components: { PlusOutlined, ImportOutlined, DeleteOutlined, FormOutlined, FolderOpenOutlined, PlayCircleOutlined, CloseSquareOutlined, DownOutlined, RightOutlined, CloudServerOutlined, HddOutlined, CaretDownOutlined, CaretRightOutlined, CheckCircleFilled, MoreOutlined, ShareAltOutlined, LockOutlined, CopyOutlined, ReloadOutlined, LoadingOutlined, SettingOutlined, DownloadOutlined },
  props: {
    open: { type: Boolean, default: undefined },
    visible: { type: Boolean, default: false },
  },
  emits: ['update:open', 'mountChanged'],
  setup(props, { emit }) {
    const configStore = useConfigStore();
    const persistentConnections = computed(() => configStore.connections.filter(conn => !conn.temporary));
    const settingStore = useSettingStore();
    const drawerOpen = computed(() => props.open ?? props.visible);
    const activeTab = ref('bucket');
    const endpointProtocol = ref<string>('http');
    const fuseBinValue = ref<string>(settingStore.fuseBin || '');
    const defaultCacheDirectoryValue = ref<string>(settingStore.defaultCacheDirectory || '');
    const defaultPageSizeValue = ref<number>(settingStore.defaultPageSize || 20);
    const defaultDownloadDirectoryValue = ref<string>(settingStore.defaultDownloadDirectory || '');
    const listLoadModeValue = ref<'pagination' | 'waterfall'>(settingStore.listLoadMode || 'waterfall');
    const transferConcurrencyValue = ref<number>(settingStore.transferConcurrency || 3);
    const closeBehaviorValue = ref<'hide' | 'exit'>(settingStore.closeBehavior === 'exit' ? 'exit' : 'hide');
    const confirmBeforeExitValue = ref<boolean>(settingStore.confirmBeforeExit !== false);
    const colorGroupIdValue = ref<string>(settingStore.connectionColorGroupId || defaultConnectionColorGroups[0].id);
    const mountStates = reactive<Record<string, boolean>>({});
    const windowsDrives = ref<string[]>([]);
    const bucketOptions = ref<string[]>([]);
    const bucketFetching = ref(false);
    const availableDrives = ref<string[]>([]);
    const collapsedConnections = ref<Set<string>>(new Set());
    const knownConnectionIds = new Set<string>();

    const toggleConnection = (id: string) => {
      const newSet = new Set(collapsedConnections.value);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      collapsedConnections.value = newSet;
    };

    const hasConnectionTargets = (conn: Connection) => configStore.targetsByConnectionId(conn.id).length > 0;
    const connectionTargetCount = (conn: Connection) => configStore.targetsByConnectionId(conn.id).length;
    const connectionScopeLabel = (conn: Connection) => {
      if (conn.bucket) return conn.pathPrefix ? `${conn.bucket}/${conn.pathPrefix}` : conn.bucket;
      return '全部 Bucket';
    };

    const syncCollapsedConnections = () => {
      const ids = new Set(persistentConnections.value.map(conn => conn.id));
      const next = new Set([...collapsedConnections.value].filter(id => ids.has(id)));
      ids.forEach(id => {
        if (!knownConnectionIds.has(id)) next.add(id);
      });
      knownConnectionIds.clear();
      ids.forEach(id => knownConnectionIds.add(id));
      collapsedConnections.value = next;
    };

    const handleImportMenuClick = ({ key }: { key: string | number }) => {
      if (String(key) === 'mc') mcImportVisible.value = true;
      if (String(key) === 'share') shareImportVisible.value = true;
    };

    const handleConnectionMenuClick = ({ key }: { key: string | number }, conn: Connection) => {
      switch (String(key)) {
        case 'edit':
          handleEditConnection(conn);
          break;
        case 'share':
          handleShareConnection(conn);
          break;
        case 'delete':
          handleDeleteConnection(conn.id);
          break;
      }
    };

    // ── 插件扩展中心状态与交互 ──
    const defaultPluginsList: any[] = [
      {
        id: 'rclone',
        name: '本地虚拟驱动器 (rclone)',
        category: 'filesystem',
        description: '支持将 S3 对象存储实时挂载为 Windows 本地盘符（或 macOS/Linux 文件夹），如本地磁盘般透明读写。',
        supportedPlatforms: ['Windows', 'macOS', 'Linux'],
        enabled: true,
        status: 'missing',
        version: '',
        config: {},
      },
      {
        id: 'mpv',
        name: '专业音视频播放引擎 (MPV)',
        category: 'media',
        description: '提供广播影视级专业视音频无损拉流解码（支持 Apple ProRes 全系列、多轨未压缩 PCM 音频与时间码轨）。',
        supportedPlatforms: ['Windows', 'macOS', 'Linux'],
        enabled: true,
        status: 'missing',
        version: '',
        config: { playMode: 'smart', hwdec: true },
      },
    ];
    const pluginsList = ref<any[]>([...defaultPluginsList]);
    const pluginsLoading = ref(false);
    const pluginActionLoading = reactive<Record<string, boolean>>({});
    const pluginConfigOpen = reactive<Record<string, boolean>>({ rclone: false, mpv: false });

    const loadPluginsList = async () => {
      if (!native?.getPlugins) return;
      pluginsLoading.value = true;
      try {
        const res = await native.getPlugins();
        if (Array.isArray(res) && res.length > 0) {
          pluginsList.value = res;
        }
      } catch (e) {
        console.error('[PLUGINS] Failed to load plugins:', e);
      } finally {
        pluginsLoading.value = false;
      }
    };

    const handleTogglePluginEnabled = async (plugin: any, val: boolean) => {
      plugin.enabled = val;
      try {
        const updated = await native.updatePluginConfig?.(plugin.id, { enabled: val });
        if (updated) {
          const idx = pluginsList.value.findIndex(p => p.id === plugin.id);
          if (idx !== -1) pluginsList.value[idx] = updated;
        }
        notification.success({ message: `${plugin.name} 已${val ? '启用' : '禁用'}` });
      } catch (e: any) {
        notification.error({ message: '更新插件状态失败', description: e.message });
      }
    };

    const handleUpdatePluginSpecificConfig = async (plugin: any, configUpdates: Record<string, any>) => {
      const mergedConfig = { ...(plugin.config || {}), ...configUpdates };
      try {
        const updated = await native.updatePluginConfig?.(plugin.id, { config: mergedConfig });
        if (updated) {
          const idx = pluginsList.value.findIndex(p => p.id === plugin.id);
          if (idx !== -1) pluginsList.value[idx] = updated;
        }
        notification.success({ message: '配置已更新' });
      } catch (e: any) {
        notification.error({ message: '保存插件配置失败', description: e.message });
      }
    };

    const handleSelectPluginCustomPath = (plugin: any) => {
      const filters = isWindows
        ? [{ name: '可执行文件', extensions: ['exe'] }]
        : [{ name: '可执行文件', extensions: ['*'] }];
      const paths = native.getLocalFilename(filters);
      if (paths) {
        native.updatePluginConfig?.(plugin.id, { customPath: paths }).then((updated: any) => {
          if (updated) {
            const idx = pluginsList.value.findIndex(p => p.id === plugin.id);
            if (idx !== -1) pluginsList.value[idx] = updated;
          }
          notification.success({ message: `已设置 ${plugin.name} 路径` });
        });
      }
    };

    const handleResetPluginCustomPath = async (plugin: any) => {
      try {
        const updated = await native.updatePluginConfig?.(plugin.id, { customPath: '' });
        if (updated) {
          const idx = pluginsList.value.findIndex(p => p.id === plugin.id);
          if (idx !== -1) pluginsList.value[idx] = updated;
        }
        notification.success({ message: `已重置 ${plugin.name} 路径为默认检测` });
      } catch (e: any) {
        notification.error({ message: '重置路径失败', description: e.message });
      }
    };

    const handleDownloadRclonePlugin = async (plugin: any) => {
      pluginActionLoading[plugin.id] = true;
      try {
        notification.info({ message: '正在自动下载 rclone 挂载驱动…' });
        const res = await native.ensurePluginRclone?.();
        if (res?.success) {
          notification.success({ message: 'rclone 驱动下载就绪！' });
          await loadPluginsList();
        } else {
          notification.error({ message: '下载失败', description: res?.message });
        }
      } catch (e: any) {
        notification.error({ message: '下载异常', description: e.message });
      } finally {
        pluginActionLoading[plugin.id] = false;
      }
    };

    const handleInstallMpvPlugin = async (plugin: any) => {
      pluginActionLoading[plugin.id] = true;
      try {
        notification.info({ message: '正在准备安装 MPV 播放引擎…', description: '后台静默下载安装中，请稍候…' });
        const res = await native.ensurePluginMpv?.();
        if (res?.success) {
          notification.success({ message: 'MPV 播放引擎安装就绪！' });
          await loadPluginsList();
        } else {
          notification.warning({ message: '自动安装未成功', description: res?.message || '已打开手动安装指引' });
          handleShowMpvInstallGuide();
        }
      } catch (e: any) {
        notification.error({ message: '安装异常', description: e.message });
        handleShowMpvInstallGuide();
      } finally {
        pluginActionLoading[plugin.id] = false;
      }
    };

    const handleShowMpvInstallGuide = () => {
      Modal.info({
        title: '安装 MPV 播放器指引',
        width: 500,
        content: () => h('div', { style: 'font-size: 13px; line-height: 1.6; margin-top: 12px;' }, [
          h('p', null, 'MPV 是用于广播影视级高码率视音频（如 Apple ProRes、多轨未压缩 PCM 等）的硬件加速播放引擎。'),
          h('div', { style: 'background: rgba(0,0,0,0.06); padding: 8px 12px; border-radius: 4px; font-family: monospace; margin: 8px 0;' },
            isWindows ? 'winget install shinchiro.mpv' : 'brew install mpv'
          ),
          h('p', { style: 'color: #8c8c8c; font-size: 12px;' }, '安装后刷新检测，或点击上方文件夹图标手动定位 mpv 可执行文件。'),
        ]),
        okText: '我知道了',
      });
    };

    const tabs = [
      { key: 'bucket', label: '连接' },
      { key: 'plugins', label: '插件' },
      { key: 'system', label: '系统' },
      { key: 'about', label: '关于' },
    ];

    const appVersion = ref(native.appVersion() || '0.0.0');
    const appPlatform = ref(native.osType() || '-');
    const copyrightYear = new Date().getFullYear();
    const buildInfo = computed(() => `v${appVersion.value} / ${appPlatform.value}`);
    const updateChecking = ref(false);
    const updateDownloading = ref(false);
    const updateInstalling = ref(false);
    const updateProgress = ref(0);
    const updateAvailableVersion = ref('');
    const updateDownloaded = ref(false);
    const updateStatusText = ref('点击“检查更新”查询是否有新版本');

    const handleCheckUpdate = () => {
      if (updateChecking.value || updateDownloading.value || updateInstalling.value) return;
      updateChecking.value = true;
      updateStatusText.value = '正在检查更新...';
      (window as any).__bucketViewUpdateSource = 'check';
      native.ipcSend('updater-check');
    };

    const handleDownloadUpdate = () => {
      if (!updateAvailableVersion.value || updateDownloading.value || updateInstalling.value) return;
      updateDownloading.value = true;
      updateProgress.value = 0;
      updateStatusText.value = `正在后台下载 v${updateAvailableVersion.value}...`;
      (window as any).__bucketViewUpdateSource = 'download';
      native.ipcSend('updater-download');
    };

    const handleInstallUpdate = () => {
      if (!updateDownloaded.value || updateInstalling.value) return;
      updateInstalling.value = true;
      updateStatusText.value = '正在准备安装更新...';
      (window as any).__bucketViewUpdateSource = null;
      native.ipcSend('updater-install');
    };

    const isAboutUpdateSource = (source: 'check' | 'download') =>
      (window as any).__bucketViewUpdateSource === source;

    const handleAboutUpdater = (_event: any, resp: UpdaterResponse) => {
      if (resp.cmd === 'checking') {
        if (!(updateChecking.value || isAboutUpdateSource('check'))) return;
        updateChecking.value = true;
        updateStatusText.value = '正在检查更新...';
        return;
      }
      if (resp.cmd === 'update-available') {
        const fromManualCheck = updateChecking.value || isAboutUpdateSource('check');
        updateChecking.value = false;
        updateAvailableVersion.value = resp.version;
        updateDownloaded.value = false;
        updateStatusText.value = `发现新版本 v${resp.version}，可手动下载更新`;
        if (fromManualCheck) {
          notification.info({
            message: '发现新版本',
            description: `v${resp.version} 可下载更新`,
          });
        }
        return;
      }
      if (resp.cmd === 'update-not-available') {
        if (!(updateChecking.value || isAboutUpdateSource('check'))) return;
        updateChecking.value = false;
        updateAvailableVersion.value = '';
        updateDownloaded.value = false;
        updateStatusText.value = `当前已是最新版本（v${resp.version || appVersion.value}）`;
        notification.success({
          message: '已是最新版本',
          description: `当前版本 v${resp.version || appVersion.value}`,
        });
        return;
      }
      if (resp.cmd === 'download-progress') {
        updateChecking.value = false;
        updateDownloading.value = true;
        updateProgress.value = Number(resp.parent || 0);
        updateStatusText.value = `正在后台下载更新包...${resp.parent}%`;
        return;
      }
      if (resp.cmd === 'update-downloaded') {
        updateChecking.value = false;
        updateDownloading.value = false;
        updateProgress.value = 100;
        updateDownloaded.value = true;
        updateAvailableVersion.value = resp.version;
        updateStatusText.value = `新版本 v${resp.version} 已下载完成，可安装更新`;
        return;
      }
      if (resp.cmd === 'installing') {
        updateInstalling.value = true;
        updateStatusText.value = '正在安装更新，应用即将退出...';
        return;
      }
      if (resp.cmd === 'error') {
        const wasActive =
          updateChecking.value ||
          updateDownloading.value ||
          updateInstalling.value ||
          isAboutUpdateSource('check') ||
          isAboutUpdateSource('download');
        if (!wasActive) return;
        const wasChecking = updateChecking.value || isAboutUpdateSource('check');
        updateChecking.value = false;
        updateDownloading.value = false;
        updateInstalling.value = false;
        updateStatusText.value = wasChecking
          ? `检查更新失败：${resp.message}`
          : `更新失败：${resp.message}`;
      }
    };

    const connectionColorGroups = computed(() => settingStore.connectionColorGroups);
    const activeCustomColorGroup = computed(() =>
      (settingStore.customConnectionColorGroups || []).find(group => group.id === colorGroupIdValue.value)
    );
    const isValidHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value || '');
    const normalizeHexColor = (value: string) => {
      const raw = String(value || '').trim();
      if (isValidHexColor(raw)) return raw.toUpperCase();
      if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw}`.toUpperCase();
      return '#2563EB';
    };
    const syncActiveCustomColorGroup = () => {
      const group = activeCustomColorGroup.value;
      if (!group) return;
      settingStore.upsertCustomConnectionColorGroup({
        ...toRaw(group),
        name: group.name.trim() || '自定义色组',
        colors: group.colors.map(normalizeHexColor),
      });
    };
    const handleConnectionColorGroupChange = (id: string) => {
      colorGroupIdValue.value = id;
      settingStore.setConnectionColorGroup(id);
    };
    const handleCopyColorGroup = () => {
      const source = connectionColorGroups.value.find(group => group.id === colorGroupIdValue.value) || settingStore.activeConnectionColorGroup;
      const nameBase = `${source.name} Copy`;
      const existingNames = new Set(connectionColorGroups.value.map(group => group.name));
      let name = nameBase;
      let index = 2;
      while (existingNames.has(name)) {
        name = `${nameBase} ${index++}`;
      }
      const group: ConnectionColorGroup = {
        id: `custom-${Date.now()}`,
        name,
        colors: [...source.colors],
        custom: true,
      };
      settingStore.upsertCustomConnectionColorGroup(group);
      handleConnectionColorGroupChange(group.id);
    };
    const handleAddColorToGroup = () => {
      const group = activeCustomColorGroup.value;
      if (!group) return;
      group.colors.push('#2563EB');
      syncActiveCustomColorGroup();
    };
    const handleRemoveColorFromGroup = (index: number) => {
      const group = activeCustomColorGroup.value;
      if (!group || group.colors.length <= 1) return;
      group.colors.splice(index, 1);
      syncActiveCustomColorGroup();
    };
    const handleColorPickerInput = (index: number, event: Event) => {
      const group = activeCustomColorGroup.value;
      const input = event.target as HTMLInputElement;
      if (!group) return;
      group.colors[index] = normalizeHexColor(input.value);
      syncActiveCustomColorGroup();
    };
    const handleColorHexBlur = (index: number) => {
      const group = activeCustomColorGroup.value;
      if (!group) return;
      group.colors[index] = normalizeHexColor(group.colors[index]);
      syncActiveCustomColorGroup();
    };
    const handleDeleteCustomColorGroup = () => {
      const group = activeCustomColorGroup.value;
      if (!group) return;
      settingStore.removeCustomConnectionColorGroup(group.id);
      colorGroupIdValue.value = settingStore.connectionColorGroupId || defaultConnectionColorGroups[0].id;
    };

    // 连接 Modal
    const connectionModalFormState = ref<Connection>(_.cloneDeep(defaultConnection));
    const connectionModalFormRef = ref<FormInstance>();
    const connectionModalState = reactive<{ visible: boolean; editing: boolean }>({
      visible: false,
      editing: false,
    });
    const mcImportEditingItem = ref<McImportItem | null>(null);
    const connectionModalTitle = computed(() => {
      if (mcImportEditingItem.value) return '编辑导入连接';
      return connectionModalState.editing ? '编辑连接' : '添加连接';
    });
    const connectionIdDisabled = computed(() => connectionModalState.editing && !mcImportEditingItem.value);

    const existingGroupOptions = computed(() => {
      const groups = new Set<string>();
      configStore.connections.forEach(conn => {
        if (conn.group) groups.add(conn.group);
      });
      return Array.from(groups).map(g => ({ value: g }));
    });

    const advancedConfigVisible = ref(false);
    const connectionTesting = ref(false);

    const shareModalState = reactive({
      visible: false,
      connectionName: '',
      shareText: '',
    });
    const shareReadonly = ref(true);
    const shareExpiry = ref<'never' | '1h' | '1d' | '7d'>('never');
    const shareSourceConnection = ref<Connection | null>(null);
    const shareImportVisible = ref(false);
    const shareImportText = ref('');
    const shareImportPreview = ref<Connection | null>(null);
    const shareImportExpiresAt = ref<number | null>(null);

    const getShareExpiryTimestamp = () => {
      const durations: Record<string, number> = { '1h': 60 * 60 * 1000, '1d': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000 };
      const duration = durations[shareExpiry.value];
      return duration ? Date.now() + duration : undefined;
    };

    const formatShareExpiry = (expiresAt: number) => new Date(expiresAt).toLocaleString();

    const refreshShareText = () => {
      if (!shareSourceConnection.value) return;
      shareModalState.shareText = native.createConnectionShare(
        _.cloneDeep(toRaw(shareSourceConnection.value)),
        shareReadonly.value,
        getShareExpiryTimestamp(),
      );
    };

    const handleTestConnection = async () => {
      try {
        await connectionModalFormRef.value?.validateFields();
      } catch (e) {
        notification.error({ message: "请先填写完整必填信息" });
        return;
      }

      connectionTesting.value = true;
      try {
        const conn = _.cloneDeep(toRaw(connectionModalFormState.value));
        conn.useSSL = endpointProtocol.value === 'https';
        conn.bucket = conn.bucket || '';
        conn.pathPrefix = conn.pathPrefix || '';
        storage.changeConfig(defaultStorage, conn);
        await storage.listBuckets(defaultStorage);
        notification.success({ message: "连接测试成功", description: "网络连通且认证信息合法" });
      } catch (err: any) {
        notification.error({ message: "连接测试失败", description: err.message || String(err) });
      } finally {
        connectionTesting.value = false;
      }
    };

    const handleShareConnection = (conn: Connection) => {
      try {
        shareModalState.connectionName = conn.id;
        shareSourceConnection.value = _.cloneDeep(toRaw(conn));
        shareReadonly.value = true;
        shareExpiry.value = 'never';
        refreshShareText();
        shareModalState.visible = true;
      } catch (err: any) {
        notification.error({ message: '生成分享地址失败', description: err?.message || String(err) });
      }
    };

    const handleCopyConnectionShare = () => {
      if (!shareModalState.shareText) return;
      refreshShareText();
      native.writeClipboard(shareModalState.shareText);
      notification.success({ message: '分享地址已复制' });
    };

    const parseConnectionShareText = () => {
      shareImportPreview.value = null;
      shareImportExpiresAt.value = null;
      const text = shareImportText.value.trim();
      if (!text) return;
      const result = native.parseConnectionShare(text);
      if (result.success && result.connection) {
        shareImportPreview.value = result.connection;
        shareImportExpiresAt.value = result.expiresAt || null;
      }
    };

    const handleImportConnectionShare = () => {
      const text = shareImportText.value.trim();
      const result = native.parseConnectionShare(text);
      if (!result.success || !result.connection) {
        notification.error({ message: '导入失败', description: result.message || '分享地址无效' });
        return;
      }

      const source = result.connection;
      const nameBase = source.id.trim() || '共享连接';
      let id = nameBase;
      let index = 2;
      while (configStore.getConnectionById(id)) {
        id = `${nameBase} (${index++})`;
      }
      const connection: Connection = {
        ...source,
        id,
        enabled: true,
        readonly: source.readonly === true,
      };
      configStore.addConnection(connection);
      configStore.openTab(connection.id);
      notification.success({ message: connection.readonly ? '导入只读连接成功' : '导入分享连接成功', description: connection.id });
      handleShareImportCancel();
    };

    const handleShareImportCancel = () => {
      shareImportVisible.value = false;
      shareImportText.value = '';
      shareImportPreview.value = null;
      shareImportExpiresAt.value = null;
    };

    watch(shareReadonly, refreshShareText);

    // 挂载 Modal
    const targetModalFormState = ref({ bucket: '', pathPrefix: '', mountPoint: '', cacheDirectory: '', autoMount: false });
    const targetModalState = reactive<{ visible: boolean; connectionId: string; lockedBucket: string; editingTargetId: string }>({
      visible: false,
      connectionId: "",
      lockedBucket: "",
      editingTargetId: "",
    });

    // pathPrefix 深度约束：mount 的 pathPrefix 不能比 connection 的更浅
    const targetPathPrefixPlaceholder = computed(() => {
      const conn = configStore.getConnectionById(targetModalState.connectionId);
      if (!conn) return '例如: project-x/docs';
      if (conn.pathPrefix) return `≥ ${conn.pathPrefix}（不可更浅）`;
      return '留空则为桶根目录';
    });

    const targetPathPrefixWarning = computed(() => {
      const conn = configStore.getConnectionById(targetModalState.connectionId);
      if (!conn || !conn.pathPrefix) return '';
      const mountPrefix = targetModalFormState.value.pathPrefix;
      if (!mountPrefix) return `留空将挂载整个桶，而文件列表仅展示 ${conn.pathPrefix} 以下的内容`;
      if (!mountPrefix.startsWith(conn.pathPrefix)) return `挂载前缀必须以 ${conn.pathPrefix} 开头，不能比文件列表前缀更浅`;
      return '';
    });

    const handleClose = () => emit('update:open', false);

    // ── 设置 ──
    const handleSelectFuse = () => { const name = native.getLocalFilename(); if (name) fuseBinValue.value = name; };
    const handleSelectDefaultCacheDirectory = () => { const paths = native.getLocalSaveFolder(); if (paths?.length) { defaultCacheDirectoryValue.value = paths[0]; settingStore.setDefaultCacheDirectory(paths[0]); } };
    const handleSelectDefaultDownloadDirectory = () => { const paths = native.getLocalSaveFolder(); if (paths?.length) { defaultDownloadDirectoryValue.value = paths[0]; settingStore.setDefaultDownloadDirectory(paths[0]); } };
    const handleFuseBinChange = () => { settingStore.fuseBin = fuseBinValue.value; };
    const handleDefaultCacheDirectoryChange = () => { settingStore.setDefaultCacheDirectory(defaultCacheDirectoryValue.value); };
    const handleDefaultDownloadDirectoryChange = () => { settingStore.setDefaultDownloadDirectory(defaultDownloadDirectoryValue.value); };
    const handleDefaultPageSizeChange = (val: number) => { settingStore.setDefaultPageSize(val); };
    const handleListLoadModeChange = () => { settingStore.setListLoadMode(listLoadModeValue.value); };
    const handleTransferConcurrencyChange = (val: number) => { settingStore.setTransferConcurrency(val); };
    const handleCloseBehaviorChange = () => { settingStore.setCloseBehavior(closeBehaviorValue.value); };
    const handleConfirmBeforeExitChange = (enabled: boolean) => { settingStore.setConfirmBeforeExit(enabled); };
    const handleOpenLogDirectory = async () => {
      try {
        const resp = await native.openLogDirectory?.();
        if (resp && resp.success === false) {
          notification.warning({ message: '无法打开日志目录', description: resp.message || '未知错误' });
        }
      } catch (error: any) {
        notification.error({ message: '打开日志目录失败', description: error?.message || String(error) });
      }
    };

    // ── Bucket 列表加载 & 过滤 ──
    const allBucketsCache = ref<string[]>([]);
    const bucketListFailed = ref(false);
    const fetchBuckets = async (conn: Connection) => {
      bucketFetching.value = true;
      bucketListFailed.value = false;
      try {
        storage.changeConfig(defaultStorage, _.cloneDeep(toRaw(conn)));
        const buckets = await storage.listBuckets(defaultStorage);
        allBucketsCache.value = buckets;
        bucketOptions.value = buckets;
      } catch (err: any) {
        bucketListFailed.value = true;
        allBucketsCache.value = [];
        bucketOptions.value = [];
        notification.error({
          message: '加载 Bucket 列表失败',
          description: err.message || '未知错误，请检查网络或 AK/SK 及 Path Style 配置。',
        });
      }
      finally { bucketFetching.value = false; }
    };

    /** showSearch 模式的客户端模糊过滤 */
    const filterBucketOption = (input: string, option: any) => {
      const label = option.value || option.label || '';
      return label.toLowerCase().includes(input.toLowerCase());
    };

    /** 连接 modal：聚焦时加载 bucket 列表 */
    const handleBucketFocus = () => {
      if (allBucketsCache.value.length || bucketListFailed.value) return;
      const form = connectionModalFormState.value;
      if (form.endpoint && form.accessKeyId && form.accessKeySecret) {
        fetchBuckets(form);
      }
    };

    /** 连接 modal：手动点击"加载列表"时重试 */
    const retryFetchBuckets = () => {
      const form = connectionModalFormState.value;
      if (form.endpoint && form.accessKeyId && form.accessKeySecret) {
        fetchBuckets(form);
      } else {
        notification.warning({ message: '请先填写 Endpoint、AccessKeyId 和 AccessKeySecret' });
      }
    };

    /** 挂载 modal：聚焦时加载 bucket 列表 */
    const handleTargetBucketFocus = () => {
      if (allBucketsCache.value.length || bucketListFailed.value) return;
      const conn = configStore.getConnectionById(targetModalState.connectionId);
      if (conn) fetchBuckets(conn);
    };

    /** 挂载 modal：手动点击"加载列表"时重试 */
    const retryFetchBucketsTarget = () => {
      const conn = configStore.getConnectionById(targetModalState.connectionId);
      if (conn) fetchBuckets(conn);
    };

    const mcImportVisible = ref(false);
    const mcImportText = ref('');
    const mcImportItems = ref<McImportItem[]>([]);
    const mcImportParseMessage = ref('');
    const selectedMcImportCount = computed(() => mcImportItems.value.filter(item => item.selected).length);

    const normalizeMcEndpoint = (url: string) => {
      const raw = String(url || '').trim();
      let protocol: 'http' | 'https' = raw.startsWith('https://') ? 'https' : 'http';
      let endpoint = raw.replace(/^https?:\/\//i, '');
      try {
        const parsed = new URL(raw.match(/^https?:\/\//i) ? raw : `http://${raw}`);
        protocol = parsed.protocol === 'https:' ? 'https' : 'http';
        endpoint = parsed.host;
      } catch {
        endpoint = endpoint.split('/')[0];
      }
      return { endpoint, protocol, useSSL: protocol === 'https' };
    };

    const ensureUniqueImportId = (baseId: string, usedIds: Set<string>) => {
      const cleanBaseId = (baseId || 'mc-connection').trim();
      if (!usedIds.has(cleanBaseId) && !configStore.connections.some(conn => conn.id === cleanBaseId)) {
        usedIds.add(cleanBaseId);
        return cleanBaseId;
      }
      let index = 2;
      let nextId = `${cleanBaseId}-${index}`;
      while (usedIds.has(nextId) || configStore.connections.some(conn => conn.id === nextId)) {
        index++;
        nextId = `${cleanBaseId}-${index}`;
      }
      usedIds.add(nextId);
      return nextId;
    };

    const handleMcImportParse = () => {
      mcImportParseMessage.value = '';
      mcImportItems.value = [];
      if (!mcImportText.value.trim()) {
        notification.warning({ message: '请先粘贴或选择 MC config 内容' });
        return;
      }

      try {
        const config = JSON.parse(mcImportText.value);
        if (!config.aliases || typeof config.aliases !== 'object') {
          notification.error({ message: '解析失败', description: '无效的配置格式，未找到 aliases' });
          return;
        }

        const usedIds = new Set<string>();
        const items: McImportItem[] = [];
        for (const [alias, aliasConfig] of Object.entries(config.aliases) as [string, any][]) {
          if (!aliasConfig?.url || !aliasConfig?.accessKey || !aliasConfig?.secretKey) continue;
          const endpoint = normalizeMcEndpoint(aliasConfig.url);
          const addressing = inferS3Addressing(endpoint.endpoint);
          const connectionId = ensureUniqueImportId(alias, usedIds);
          const connection: Connection = {
            id: connectionId,
            endpoint: endpoint.endpoint,
            accessKeyId: aliasConfig.accessKey,
            accessKeySecret: aliasConfig.secretKey,
            region: addressing.region || 'us-east-1',
            useSSL: endpoint.useSSL,
            pathStyle: addressing.pathStyle,
            bucket: '',
            pathPrefix: '',
            enabled: true,
            group: '',
          };
          items.push({
            sourceAlias: alias,
            selected: true,
            protocol: endpoint.protocol,
            connection,
            addressing,
          });
        }

        mcImportItems.value = items;
        if (items.length > 0) {
          mcImportParseMessage.value = `已解析 ${items.length} 个可导入连接`;
        } else {
          notification.warning({ message: '解析为空', description: '未找到包含 url/accessKey/secretKey 的有效 alias' });
        }
      } catch (e: any) {
        notification.error({ message: '解析失败', description: 'JSON 解析失败：' + e.message });
      }
    };

    const handleMcImportSelectAll = (selected: boolean) => {
      mcImportItems.value.forEach(item => { item.selected = selected; });
    };

    const validateMcImportItems = (items: McImportItem[]) => {
      const usedConnectionIds = new Set<string>();
      for (const item of items) {
        const conn = item.connection;
        conn.id = conn.id.trim();
        conn.endpoint = conn.endpoint.trim();
        conn.accessKeyId = conn.accessKeyId.trim();
        conn.accessKeySecret = conn.accessKeySecret.trim();
        conn.region = conn.region.trim() || 'us-east-1';
        conn.bucket = (conn.bucket || '').trim();
        conn.pathPrefix = conn.bucket ? StringUtil.trim(conn.pathPrefix || '', '/') : '';
        conn.useSSL = item.protocol === 'https';

        if (!conn.id || !conn.endpoint || !conn.accessKeyId || !conn.accessKeySecret) {
          return `${item.sourceAlias} 缺少连接名称、Endpoint 或 AK/SK`;
        }
        if (usedConnectionIds.has(conn.id)) {
          return `连接名称重复：${conn.id}`;
        }
        usedConnectionIds.add(conn.id);
      }
      return '';
    };

    const handleMcImportEditItem = (item: McImportItem) => {
      mcImportEditingItem.value = item;
      connectionModalFormState.value = _.cloneDeep(toRaw(item.connection));
      endpointProtocol.value = item.protocol;
      connectionModalState.visible = true;
      connectionModalState.editing = false;
      advancedConfigVisible.value = !!(item.connection.bucket || item.connection.pathPrefix);
      allBucketsCache.value = [];
      bucketOptions.value = [];
      bucketListFailed.value = false;
    };

    const handleMcImport = () => {
      if (mcImportItems.value.length === 0) {
        handleMcImportParse();
        return;
      }
      const selectedItems = mcImportItems.value.filter(item => item.selected);
      if (selectedItems.length === 0) {
        notification.warning({ message: '请选择至少一个连接' });
        return;
      }
      const validationError = validateMcImportItems(selectedItems);
      if (validationError) {
        notification.error({ message: '导入失败', description: validationError });
        return;
      }

      selectedItems.forEach((item) => {
        const conn = _.cloneDeep(toRaw(item.connection));
        configStore.addConnection(conn);
      });

      if (selectedItems[0]?.connection.id) {
        configStore.openTab(selectedItems[0].connection.id);
      }
      notification.success({ message: '导入成功', description: `导入 ${selectedItems.length} 个连接` });
      mcImportVisible.value = false;
      mcImportText.value = '';
      mcImportItems.value = [];
      mcImportParseMessage.value = '';
      mcImportEditingItem.value = null;
    };

    const handleMcImportCancel = () => {
      mcImportText.value = '';
      mcImportItems.value = [];
      mcImportParseMessage.value = '';
      mcImportEditingItem.value = null;
    };

    const handleMcImportFile = () => {
      const file = native.getLocalFilename([{ name: 'JSON Config', extensions: ['json'] }]);
      if (file) {
        try {
          const content = native.readLocalFile(file);
          mcImportText.value = content;
          handleMcImportParse();
        } catch (e: any) {
          notification.error({ message: '读取文件失败', description: e.message });
        }
      }
    };

    // ── 连接管理 ──
    const handleAddConnection = () => {
      mcImportEditingItem.value = null;
      connectionModalFormState.value = _.cloneDeep(defaultConnection);
      endpointProtocol.value = 'http';
      connectionModalState.visible = true;
      connectionModalState.editing = false;
      advancedConfigVisible.value = false;
      allBucketsCache.value = [];
      bucketOptions.value = [];
      bucketListFailed.value = false;
    };

    const handleEditConnection = async (conn: Connection) => {
      if (conn.readonly) {
        notification.warning({ message: '只读连接不可编辑', description: '该连接由分享地址导入，不能查看或修改 Secret Key' });
        return;
      }
      const targets = configStore.targetsByConnectionId(conn.id);
      if (await hasActiveMount(targets)) {
        notification.warning({ message: '请先卸载挂载', description: '连接配置正在被挂载使用，不能直接修改凭据或 Endpoint' });
        return;
      }
      mcImportEditingItem.value = null;
      connectionModalFormState.value = _.cloneDeep(toRaw(conn));
      endpointProtocol.value = conn.useSSL ? 'https' : 'http';
      connectionModalState.visible = true;
      connectionModalState.editing = true;
      advancedConfigVisible.value = !!(conn.bucket || conn.pathPrefix);
      allBucketsCache.value = [];
      bucketOptions.value = [];
      bucketListFailed.value = false;
    };

    const handleConnectionModalOk = () => {
      connectionModalFormRef.value?.validateFields().then(async () => {
        const conn = _.cloneDeep(toRaw(connectionModalFormState.value));
        conn.useSSL = endpointProtocol.value === 'https';
        conn.bucket = conn.bucket || '';
        conn.pathPrefix = StringUtil.trim(conn.pathPrefix || '', '/');
        if (mcImportEditingItem.value) {
          mcImportEditingItem.value.connection = conn;
          mcImportEditingItem.value.protocol = endpointProtocol.value === 'https' ? 'https' : 'http';
          notification.success({ message: "已更新导入连接", description: conn.id });
          connectionModalState.visible = false;
          mcImportEditingItem.value = null;
          return;
        }
        configStore.addConnection(conn);
        configStore.openTab(conn.id);
        const targets = configStore.targetsByConnectionId(conn.id);
        await Promise.all(targets.map(target => fuse.syncAutoMount(_.cloneDeep(toRaw(conn)), _.cloneDeep(toRaw(target)))));
        notification.success({ message: connectionModalState.editing ? "修改连接成功" : "添加连接成功", description: conn.id });
        connectionModalState.visible = false;
      }).catch(() => {
        notification.error({ message: "请检查所有数据是否按照要求填写" });
      });
    };

    const handleConnectionModalCancel = () => {
      connectionModalState.visible = false;
      mcImportEditingItem.value = null;
    };

    const excludedDriveLetters = (editingMountPoint?: string) => new Set(
      configStore.mountTargets
        .map(target => target.mountPoint)
        .filter((mountPoint): mountPoint is string => !!mountPoint && mountPoint !== editingMountPoint)
        .map(mountPoint => mountPoint.toUpperCase()),
    );

    const applyAvailableDrives = (occupied: string[], editingMountPoint?: string) => {
      const excluded = excludedDriveLetters(editingMountPoint);
      const occupiedSet = new Set(occupied.map(drive => drive.toUpperCase()));
      const localFree = fuse.availableDriveLetters();
      availableDrives.value = localFree.length === 0 ? [] : defaultDrives.filter((drive) =>
        !occupiedSet.has(drive) && !excluded.has(drive) && localFree.includes(drive),
      );
    };

    const refreshAvailableDrives = async (editingMountPoint?: string) => {
      if (!isWindows) return;
      applyAvailableDrives([], editingMountPoint);
      try {
        applyAvailableDrives(await fuse.driveList(), editingMountPoint);
      } catch {
        applyAvailableDrives([], editingMountPoint);
      }
    };

    const getTargetRuntimeStatus = async (target: MountTarget) => {
      const snapshot: MountTarget = {
        id: String(target.id),
        connectionId: String(target.connectionId),
        bucket: String(target.bucket || ''),
        pathPrefix: String(target.pathPrefix || ''),
        mountPoint: target.mountPoint ? String(target.mountPoint) : undefined,
        cacheDirectory: target.cacheDirectory ? String(target.cacheDirectory) : undefined,
        enabled: target.enabled === true,
        autoMount: target.autoMount === true,
      };
      try { return await fuse.getMountStatus(snapshot); }
      catch { return { status: 'unmounted' as const }; }
    };

    const hasActiveMount = async (targets: MountTarget[]) => {
      const statuses = await Promise.all(targets.map(target => getTargetRuntimeStatus(target)));
      return statuses.some(status => status.status === 'mounted' || status.status === 'mounting' || status.status === 'unmounting');
    };

    const handleDeleteConnection = async (connectionId: string) => {
      const targets = configStore.targetsByConnectionId(connectionId);
      const conn = configStore.getConnectionById(connectionId);
      if (conn) {
        for (const target of targets) {
          const resp = await fuse.umount(_.cloneDeep(toRaw(conn)), _.cloneDeep(toRaw(target)), { forgetAutoMount: true });
          if (!resp.success) {
            notification.error({ message: `删除连接失败`, description: `${target.bucket}：${resp.desc || '卸载失败'}` });
            return;
          }
        }
      }
      configStore.removeConnection(connectionId);
      notification.success({ message: `已删除连接 ${connectionId}` });
    };

    // ── 挂载目标管理 ──
    const handleAddTarget = (conn: Connection) => {
      targetModalFormState.value = {
        bucket: conn.bucket || '',
        pathPrefix: conn.pathPrefix || '',
        mountPoint: '',
        cacheDirectory: settingStore.defaultCacheDirectory || '',
        autoMount: false,
      };
      targetModalState.connectionId = conn.id;
      targetModalState.lockedBucket = conn.bucket || '';
      targetModalState.editingTargetId = '';

      availableDrives.value = [];
      targetModalState.visible = true;
      if (isWindows) {
        void refreshAvailableDrives().then(() => {
          if (!targetModalState.visible || targetModalState.editingTargetId) return;
          if (availableDrives.value.length > 0 && !targetModalFormState.value.mountPoint) {
            targetModalFormState.value.mountPoint = availableDrives.value[0];
          }
        });
      }

      // 获取 bucket 列表
      if (!targetModalState.lockedBucket) {
        fetchBuckets(conn);
      }

    };

    const handleEditTarget = async (conn: Connection, target: MountTarget) => {
      const runtime = await getTargetRuntimeStatus(target);
      if (runtime.status === 'mounted' || runtime.status === 'mounting' || runtime.status === 'unmounting') {
        notification.warning({ message: '请先卸载挂载', description: '挂载运行中不能修改 Bucket、挂载点或缓存目录' });
        return;
      }
      targetModalFormState.value = {
        bucket: target.bucket,
        pathPrefix: target.pathPrefix,
        mountPoint: target.mountPoint || '',
        cacheDirectory: target.cacheDirectory || '',
        autoMount: target.autoMount === true,
      };
      targetModalState.connectionId = conn.id;
      targetModalState.lockedBucket = conn.bucket || '';
      targetModalState.editingTargetId = target.id;

      availableDrives.value = [];
      targetModalState.visible = true;
      void refreshAvailableDrives(target.mountPoint);

      if (!targetModalState.lockedBucket) {
        fetchBuckets(conn);
      }

    };

    const handleTargetModalOk = async () => {
      const form = targetModalFormState.value;
      form.pathPrefix = StringUtil.trim(form.pathPrefix || '', '/');
      if (!form.bucket || !form.mountPoint) {
        notification.error({ message: "请填写 Bucket 和挂载路径" });
        return;
      }
      if (isWindows && !/^[A-Za-z]:$/.test(form.mountPoint.trim())) {
        notification.error({ message: "盘符格式不合法", description: "请选择一个盘符，例如 M:" });
        return;
      }
      if (!isWindows && !form.mountPoint.startsWith('/')) {
        notification.error({ message: "挂载路径必须是绝对路径", description: "例如 /mnt/bucket" });
        return;
      }
      // pathPrefix 深度校验：不能比 connection 的 pathPrefix 更浅
      const conn = configStore.getConnectionById(targetModalState.connectionId);
      if (conn && conn.pathPrefix && form.pathPrefix && !form.pathPrefix.startsWith(conn.pathPrefix)) {
        notification.error({ message: "路径前缀不合法", description: `挂载前缀必须以 ${conn.pathPrefix} 开头或包含它，不能比文件列表前缀更浅` });
        return;
      }
      // 编辑模式：保留原 target 的 enabled 状态
      const existingTarget = targetModalState.editingTargetId
        ? configStore.getTargetById(targetModalState.editingTargetId)
        : undefined;
      if (existingTarget) {
        const runtime = await getTargetRuntimeStatus(existingTarget);
        if (runtime.status === 'mounted' || runtime.status === 'mounting' || runtime.status === 'unmounting') {
          notification.warning({ message: '请先卸载挂载', description: '挂载运行中不能保存修改' });
          return;
        }
      }
      const target: MountTarget = {
        id: `${targetModalState.connectionId}/${form.bucket}${form.pathPrefix ? '/' + form.pathPrefix : ''}`,
        connectionId: targetModalState.connectionId,
        bucket: form.bucket,
        pathPrefix: form.pathPrefix,
        mountPoint: form.mountPoint,
        cacheDirectory: form.cacheDirectory,
        enabled: existingTarget ? existingTarget.enabled : true,
        autoMount: form.autoMount === true,
      };
      if (existingTarget && existingTarget.id !== target.id) {
        const oldConn = configStore.getConnectionById(existingTarget.connectionId);
        if (oldConn) await fuse.umount(_.cloneDeep(toRaw(oldConn)), _.cloneDeep(toRaw(existingTarget)), { forgetAutoMount: true });
        configStore.removeMountTarget(existingTarget.id);
      }
      configStore.addMountTarget(target);
      if (conn) await fuse.syncAutoMount(_.cloneDeep(toRaw(conn)), _.cloneDeep(toRaw(target)));
      notification.success({ message: targetModalState.editingTargetId ? "编辑挂载成功" : "添加挂载成功", description: form.bucket });
      targetModalState.visible = false;
    };

    const handleDeleteTarget = async (targetId: string) => {
      const target = configStore.getTargetById(targetId);
      const conn = target ? configStore.getConnectionById(target.connectionId) : undefined;
      if (target && conn) {
        const resp = await fuse.umount(_.cloneDeep(toRaw(conn)), _.cloneDeep(toRaw(target)), { forgetAutoMount: true });
        if (!resp.success) {
          notification.error({ message: '删除挂载失败', description: resp.desc || '卸载失败' });
          return;
        }
      }
      configStore.removeMountTarget(targetId);
      notification.success({ message: "已删除挂载" });
    };

    const handleTargetEnableChange = (target: MountTarget) => {
      configStore.addMountTarget(target);
    };

    const handleConnectionEnableChange = (conn: Connection, val: boolean) => {
      conn.enabled = val;
      configStore.addConnection(conn);
    };

    // ── 挂载/卸载 ──
    const handleOpenLocalFolder = (target: MountTarget) => {
      if (target.mountPoint) native.openLocalFolder(target.mountPoint);
    };

    const handleMount = (conn: Connection, target: MountTarget) => {
      const mountTarget = _.cloneDeep(toRaw(target));
      if (!mountTarget.cacheDirectory || mountTarget.cacheDirectory.trim().length === 0) {
        mountTarget.cacheDirectory = settingStore.defaultCacheDirectory || '';
      }
      if (!mountTarget.mountPoint) {
        notification.error({ message: "挂载失败", description: isWindows ? "请选择挂载盘符" : "请输入挂载路径" });
        return;
      }
      const label = target.pathPrefix ? `${target.bucket}/${target.pathPrefix}` : target.bucket;
      mountStates[target.id + '_loading'] = true;
      native.ensureRclone(settingStore.fuseBin || '').then((ensure) => {
        if (!ensure.success || !ensure.path) {
          throw new Error(ensure.message || '挂载程序不可用，请在系统设置中指定 rclone 路径');
        }
        if (settingStore.fuseBin !== ensure.path) {
          settingStore.fuseBin = ensure.path;
          fuseBinValue.value = ensure.path;
        }
        if (ensure.source === 'downloaded') {
          notification.info({ message: '已自动下载挂载程序', description: '首次挂载会下载 rclone，完成后继续挂载' });
        }
        return fuse.mount(_.cloneDeep(toRaw(conn)), mountTarget, ensure.path || '');
      }).then((resp) => {
        mountStates[target.id + '_loading'] = false;
        if (resp.success) {
          notification.success({ message: `${label} 挂载成功` });
          mountStates[target.id] = true;
          emit('mountChanged');
          return;
        }
        console.error('[MOUNT] 挂载失败:', resp.desc);
        notification.error({ message: `${label} 挂载失败`, description: resp.desc });
      }).catch((err) => {
        mountStates[target.id + '_loading'] = false;
        console.error('[MOUNT] 挂载异常:', err);
        notification.error({ message: `${label} 挂载失败`, description: err?.message || '未知错误' });
      });
    };

    const handleUmount = (conn: Connection, target: MountTarget) => {
      const label = target.pathPrefix ? `${target.bucket}/${target.pathPrefix}` : target.bucket;
      mountStates[target.id + '_loading'] = true;
      fuse.umount(_.cloneDeep(toRaw(conn)), _.cloneDeep(toRaw(target))).then((resp) => {
        if (resp.success) {
          notification.success({ message: `${label} 卸载成功` });
          mountStates[target.id] = false;
          emit('mountChanged');
        } else {
          console.error('[MOUNT] 卸载失败:', resp.desc);
          notification.error({ message: `${label} 卸载失败`, description: resp.desc });
        }
      }).catch((err) => {
        console.error('[MOUNT] 卸载异常:', err);
        notification.error({ message: `${label} 卸载失败` });
      }).finally(() => { mountStates[target.id + '_loading'] = false; });
    };

    const handleSelectCacheDir = () => {
      const paths = native.getLocalSaveFolder();
      if (paths?.length) targetModalFormState.value.cacheDirectory = paths[0];
    };

    // ── 挂载状态检查 ──
    const handleCheckMounts = () => {
      // 仅当存在有挂载盘符的目标时才进行检查
      const targetsWithMount = configStore.mountTargets.filter(t => t.mountPoint && t.mountPoint.length > 0);
      if (targetsWithMount.length === 0) {
        configStore.mountTargets.forEach(t => { mountStates[t.id] = false; });
        return;
      }
      for (const target of configStore.mountTargets) {
        if (target.mountPoint && target.mountPoint.length > 0) {
          getTargetRuntimeStatus(target).then((result) => { mountStates[target.id] = result.status === 'mounted'; })
            .catch(() => { mountStates[target.id] = false; });
        } else {
          mountStates[target.id] = false;
        }
      }
    };

    watch(drawerOpen, (val) => {
      if (val) {
        syncCollapsedConnections();
        handleCheckMounts();
        fuseBinValue.value = settingStore.fuseBin || '';
        defaultCacheDirectoryValue.value = settingStore.defaultCacheDirectory || '';
        defaultDownloadDirectoryValue.value = settingStore.defaultDownloadDirectory || '';
        defaultPageSizeValue.value = settingStore.defaultPageSize ?? 20;
        listLoadModeValue.value = settingStore.listLoadMode || 'waterfall';
        transferConcurrencyValue.value = settingStore.transferConcurrency || 3;
        closeBehaviorValue.value = settingStore.closeBehavior === 'exit' ? 'exit' : 'hide';
        confirmBeforeExitValue.value = settingStore.confirmBeforeExit !== false;
        colorGroupIdValue.value = settingStore.connectionColorGroupId || defaultConnectionColorGroups[0].id;
      }
    }, { immediate: true });
    watch(() => persistentConnections.value.map(conn => conn.id), syncCollapsedConnections, { immediate: true });
    const handleEndpointBlur = () => {
      let val = (connectionModalFormState.value.endpoint || '').trim();
      if (/^https?:\/\//i.test(val)) {
        endpointProtocol.value = val.toLowerCase().startsWith('https://') ? 'https' : 'http';
        val = val.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        connectionModalFormState.value.endpoint = val;
      }
    };

    // 根据 endpoint 自动推导 PathStyle、Region 以及协议
    watch(() => connectionModalFormState.value.endpoint, (rawVal) => {
      if (!rawVal || !connectionModalState.visible) return;
      let val = rawVal.trim();
      if (/^https?:\/\//i.test(val)) {
        endpointProtocol.value = val.toLowerCase().startsWith('https://') ? 'https' : 'http';
        val = val.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        nextTick(() => {
          connectionModalFormState.value.endpoint = val;
        });
      }
      const advice = inferS3Addressing(val);
      connectionModalFormState.value.pathStyle = advice.pathStyle;
      if (advice.region && !connectionModalState.editing) {
        connectionModalFormState.value.region = advice.region;
      }
      if (advice.protocol && !connectionModalState.editing) {
        endpointProtocol.value = advice.protocol;
      }
    });
    // bucket 清空时自动清空 pathPrefix
    watch(() => connectionModalFormState.value.bucket, (val) => {
      if (!val) connectionModalFormState.value.pathPrefix = '';
    });
    onMounted(() => {
      native.ipc('handler-updater', handleAboutUpdater);
    });

    return {
      configStore, persistentConnections, activeTab, tabs, endpointProtocol, drawerOpen,
      appVersion, appPlatform, copyrightYear, buildInfo,
      updateChecking, updateDownloading, updateInstalling, updateProgress,
      updateAvailableVersion, updateDownloaded, updateStatusText,
      handleCheckUpdate, handleDownloadUpdate, handleInstallUpdate,
      fuseBinValue, defaultCacheDirectoryValue, defaultPageSizeValue, defaultDownloadDirectoryValue,
      listLoadModeValue, transferConcurrencyValue, closeBehaviorValue, confirmBeforeExitValue, colorGroupIdValue,
      mountStates, isWindows, allBucketsCache, bucketFetching, availableDrives,
      connectionModalState, connectionModalFormState, connectionModalFormRef,
      connectionModalTitle, connectionIdDisabled,
      StringUtil, targetModalState, targetModalFormState,
      targetPathPrefixPlaceholder, targetPathPrefixWarning,
      existingGroupOptions, advancedConfigVisible, connectionTesting, handleTestConnection,
      handleEndpointBlur,
      handleClose,
      handleSelectFuse, handleSelectDefaultCacheDirectory, handleSelectDefaultDownloadDirectory,
      collapsedConnections, toggleConnection, hasConnectionTargets, connectionTargetCount, connectionScopeLabel,
      handleImportMenuClick, handleConnectionMenuClick,
      handleFuseBinChange, handleDefaultCacheDirectoryChange, handleDefaultDownloadDirectoryChange, handleDefaultPageSizeChange,
      handleListLoadModeChange, handleTransferConcurrencyChange, handleCloseBehaviorChange, handleConfirmBeforeExitChange, handleOpenLogDirectory, connectionColorGroups, activeCustomColorGroup,
      normalizeHexColor, handleConnectionColorGroupChange, handleCopyColorGroup, syncActiveCustomColorGroup,
      handleAddColorToGroup, handleRemoveColorFromGroup, handleColorPickerInput, handleColorHexBlur, handleDeleteCustomColorGroup,
      filterBucketOption, handleBucketFocus, retryFetchBuckets, bucketListFailed, handleTargetBucketFocus, retryFetchBucketsTarget,
      mcImportVisible, mcImportText, mcImportItems, mcImportParseMessage, selectedMcImportCount,
      handleMcImport, handleMcImportFile, handleMcImportParse, handleMcImportSelectAll, handleMcImportCancel,
      handleMcImportEditItem,
      handleAddConnection, handleEditConnection, handleConnectionModalOk, handleConnectionModalCancel, handleDeleteConnection,
      shareModalState, shareReadonly, shareExpiry, handleShareConnection, handleCopyConnectionShare, refreshShareText,
      shareImportVisible, shareImportText, shareImportPreview, parseConnectionShareText, handleImportConnectionShare, handleShareImportCancel,
      shareImportExpiresAt, formatShareExpiry,
      pluginsList, pluginsLoading, pluginActionLoading, pluginConfigOpen, loadPluginsList, handleTogglePluginEnabled,
      handleUpdatePluginSpecificConfig, handleSelectPluginCustomPath, handleResetPluginCustomPath, handleDownloadRclonePlugin,
      handleInstallMpvPlugin, handleShowMpvInstallGuide,
      handleAddTarget, handleTargetModalOk, handleDeleteTarget, handleTargetEnableChange,
      handleConnectionEnableChange, handleEditTarget,
      handleOpenLocalFolder, handleMount, handleUmount, handleSelectCacheDir,
    };
  },
});
</script>

<style lang="less">
.drawer-title { font-size: 14px; font-weight: 600; color: var(--ant-color-text); }
.drawer-tabs {
  display: flex; gap: 2px; padding: 0 16px; border-bottom: 1px solid var(--ant-color-border); background: var(--ant-color-bg-container);
  flex-shrink: 0;
  .drawer-tab {
    padding: 8px 14px 9px; font-size: 12px; color: var(--ant-color-text-tertiary); cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -1px; transition: color 0.15s, border-color 0.15s;
    &:hover { color: var(--ant-color-text-secondary); }
    &.drawer-tab-active { color: var(--ant-color-text); font-weight: 600; border-bottom-color: var(--ant-color-text-secondary); border-bottom-width: 3px; }
  }
}
.right-side-drawer {
  font-family: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Segoe UI", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;

  .ant-drawer-content,
  .ant-btn,
  .ant-input,
  .ant-input-number,
  .ant-input-affix-wrapper,
  .ant-select,
  .ant-radio-button-wrapper {
    font-family: inherit;
  }

  .ant-drawer-content,
  .ant-drawer-wrapper-body {
    height: 100%;
    min-height: 0;
  }

  .ant-drawer-content,
  .ant-drawer-wrapper-body {
    display: flex;
    flex-direction: column;
  }

  .ant-drawer-header,
  .drawer-tabs {
    flex: 0 0 auto;
  }

  .ant-drawer-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 0;
    min-height: 0;
    overflow: hidden;
  }
}

.drawer-content {
  height: 100%;
  min-height: 0;
  padding: 4px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: transparent;
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
}
.drawer-content-settings {
  display: block;
  height: auto;
  flex: 1 1 auto;
  padding-top: 10px;
  padding-bottom: 24px;
  overflow-y: auto;
  overflow-x: hidden;
  background:
    linear-gradient(to bottom, var(--ant-color-bg-container), var(--ant-color-bg-layout));
  scrollbar-gutter: stable;

  > .setting-section {
    margin-bottom: 10px;
  }

  > .setting-section:last-child {
    margin-bottom: 0;
  }
}
.drawer-content-bucket { padding-bottom: 0; overflow: hidden; }
.connection-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0 12px;
  border-bottom: 1px solid var(--ant-color-border-secondary);
  flex-shrink: 0;
}
.connection-toolbar-copy { min-width: 0; }
.connection-toolbar-title { color: var(--ant-color-text); font-size: 14px; font-weight: 600; line-height: 1.4; }
.connection-toolbar-desc { color: var(--ant-color-text-tertiary); font-size: 11px; line-height: 1.4; margin-top: 2px; }
.connection-toolbar-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.connection-toolbar-actions .ant-btn { display: inline-flex; align-items: center; gap: 4px; }
.connection-list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 4px 0 8px; }

.connection-card {
  background: transparent; border: none; border-radius: 0; overflow: visible; margin-bottom: 0; box-shadow: none;
  &:not(:last-child) { border-bottom: 1px solid rgba(128, 128, 128, 0.2); padding-bottom: 6px; margin-bottom: 6px; }
  .connection-card-header {
    display: flex; align-items: center; justify-content: space-between; padding: 10px 4px; background: transparent; border-bottom: none; cursor: pointer; transition: background 0.2s, border-radius 0.2s;
    &.connection-card-header-static { cursor: default; }
    &:hover { background: var(--ant-color-fill-tertiary); border-radius: 6px; }
    .connection-card-info { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;
      .expand-icon { font-size: 10px; color: var(--ant-color-text-tertiary); transition: color 0.2s; display: flex; align-items: center; width: 12px; }
      .connection-icon { font-size: 16px; color: var(--ant-color-primary); }
      .connection-card-copy { min-width: 0; flex: 1; }
      .connection-card-name-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .connection-card-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; color: var(--ant-color-text); letter-spacing: 0; &.connection-disabled { color: var(--ant-color-text-tertiary); } }
      .readonly-badge { display: inline-flex; align-items: center; gap: 3px; padding: 1px 5px; border: 1px solid var(--ant-color-border-secondary); border-radius: 4px; color: var(--ant-color-text-secondary); font-size: 10px; line-height: 1.4; flex-shrink: 0; }
      .connection-card-meta { display: flex; align-items: center; gap: 8px; min-width: 0; margin-top: 3px; color: var(--ant-color-text-tertiary); font-size: 11px; line-height: 1.35; }
      .connection-card-endpoint { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .connection-card-scope, .connection-card-target-count { flex-shrink: 0; }
      .connection-card-scope::before, .connection-card-target-count::before { content: '·'; margin-right: 8px; color: var(--ant-color-text-quaternary); }
    }
    .connection-card-actions {
      display: flex; align-items: center; gap: 4px; flex-shrink: 0;
      .ant-btn {
        height: 24px; width: 24px; padding: 0; display: flex; align-items: center; justify-content: center; color: var(--ant-color-text-secondary);
        &:hover { color: var(--ant-color-text); background: var(--ant-color-fill-tertiary); }
        &.action-danger { color: #ef4444; &:hover { background: #fee2e2; color: #b91c1c; } }
      }
    }
  }
}
.menu-item-danger { color: #dc2626; }
.share-modal-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
.share-connection-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ant-color-text-secondary); font-size: 12px; }
.share-mode-row { margin: 12px 0; padding: 10px 12px; border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; background: var(--ant-color-fill-quaternary); }
.share-expiry-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 10px 0 12px; }
.share-expiry-label { color: var(--ant-color-text-secondary); font-size: 12px; }
.share-expiry-select { width: 120px; }
.share-import-expiry { margin-top: 8px; color: var(--ant-color-text-secondary); font-size: 11px; }
.connection-form-section { margin: 2px 0 12px; }
.connection-form-section-spaced { margin-top: 16px; }
.connection-form-section-title { color: var(--ant-color-text); font-size: 12px; font-weight: 600; line-height: 1.4; }
.connection-form-section-desc { color: var(--ant-color-text-tertiary); font-size: 11px; line-height: 1.4; margin-top: 3px; }
.advanced-config-summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: auto; color: var(--ant-color-text-tertiary); font-size: 11px; }
.target-list { padding: 2px 4px 8px 38px; display: flex; flex-direction: column; gap: 2px; background: transparent; position: relative;
}

.target-card {
  display: flex; justify-content: space-between; align-items: center; border: 1px solid transparent; border-radius: 6px; padding: 6px 8px; background: transparent; position: relative; box-shadow: none; transition: background 0.2s;
  &:hover { background: var(--ant-color-fill-tertiary); }
  /* Vertical tree line segment for each card */
  &::before { content: ''; position: absolute; left: -4px; top: -2px; bottom: -2px; width: 0; border-left: 1px solid rgba(128, 128, 128, 0.4); opacity: 1; z-index: 1; }
  /* Horizontal tree line connecting to the mount icon */
  &::after { content: ''; position: absolute; left: -4px; top: 50%; width: 10px; height: 0; border-top: 1px solid rgba(128, 128, 128, 0.4); opacity: 1; z-index: 1; }
  /* First child reaches up to the parent connection */
  &:first-of-type::before { top: -16px; }
  /* Last child stops at the horizontal line */
  &:last-of-type::before { bottom: 50%; }

  .target-card-info {
    display: flex; flex-direction: column; gap: 4px; min-width: 0; margin-left: 6px;
    .target-card-name-row { display: flex; align-items: center; gap: 6px; }
    .target-icon { font-size: 12px; color: #10b981; }
    .target-card-name { font-size: 12px; font-weight: 600; color: var(--ant-color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; &.target-disabled { color: var(--ant-color-text-tertiary); } }
    .target-card-mount { font-size: 11px; color: var(--ant-color-text-tertiary); margin-left: 2px; flex-shrink: 0; }
    .target-card-badges { display: flex; align-items: center; gap: 6px; margin-left: 18px; }
  }
}

.badge {
  display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; padding: 2px 6px; border-radius: 4px; line-height: 1.4;
  .badge-dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }
  &.badge-mounted { background: #dcfce7; color: #15803d; .badge-dot-green { background: #22c55e; } }
  &.badge-off { background: var(--ant-color-fill-tertiary); color: var(--ant-color-text-secondary); }
}

.target-actions {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  .action-switch { margin-right: 4px; }
  .action-btns { display: flex; gap: 2px; }
  .ant-btn {
    height: 24px; width: 24px; padding: 0; display: flex; align-items: center; justify-content: center; color: var(--ant-color-text-secondary);
    &:hover { color: var(--ant-color-text); background: var(--ant-color-fill-tertiary); }
    &.action-primary { color: #4f46e5; &:hover:not(:disabled) { background: #e0e7ff; color: #4338ca; } &:disabled { color: var(--ant-color-text-tertiary); } }
    &.action-danger { color: #ef4444; &:hover { background: #fee2e2; color: #b91c1c; } }
  }
}

.add-target-btn {
  display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px; border: 1px dashed var(--ant-color-border); border-radius: 4px; color: var(--ant-color-text-secondary); font-size: 11px; cursor: pointer; transition: all 0.15s; margin-top: 4px; position: relative;
  &:hover { color: var(--ant-color-text-secondary); border-color: var(--ant-color-text-quaternary); background: var(--ant-color-bg-container); }
}
.add-btn-row {
  display: flex; align-items: center; justify-content: center; gap: 4px; padding: 8px; border: 1px dashed var(--ant-color-border); border-radius: 6px; color: var(--ant-color-text-secondary); font-size: 12px; cursor: pointer; transition: all 0.15s;
  &:hover { color: var(--ant-color-text-secondary); border-color: var(--ant-color-text-quaternary); background: var(--ant-color-bg-container); }
}
.drawer-empty { margin: 40px 0; }

.about-card {
  .about-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .about-logo {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    flex-shrink: 0;
  }
  .about-title-block { min-width: 0; }
  .about-app-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--ant-color-text);
    line-height: 1.3;
  }
  .about-app-desc {
    margin-top: 2px;
    font-size: 12px;
    color: var(--ant-color-text-tertiary);
  }
  .about-info-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .about-info-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
  }
  .about-info-label {
    color: var(--ant-color-text-secondary);
    flex-shrink: 0;
  }
  .about-info-value {
    color: var(--ant-color-text);
    text-align: right;
    word-break: break-all;
  }
  .about-update-block {
    .about-update-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--ant-color-text-secondary);
      margin-bottom: 6px;
    }
    .about-update-status {
      font-size: 12px;
      color: var(--ant-color-text);
      line-height: 1.5;
      margin-bottom: 10px;
    }
    .about-progress { margin-bottom: 10px; }
    .about-update-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 8px;
    }
  }
  .about-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 88px;
    height: 28px;
    padding: 0 12px;
    border: 1px solid var(--ant-color-border);
    border-radius: 6px;
    background: var(--ant-color-bg-container);
    color: var(--ant-color-text-secondary);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    user-select: none;
    -webkit-app-region: no-drag;

    &:hover:not(:disabled) {
      color: var(--ant-color-text);
      border-color: var(--ant-color-text-quaternary);
      background: var(--ant-color-fill-tertiary);
    }
    &:active:not(:disabled) { background: var(--ant-color-fill-secondary); }
    &:disabled { cursor: not-allowed; opacity: 0.55; }
    &.is-loading { cursor: progress; }
  }
  .about-action-btn-primary {
    border-color: color-mix(in srgb, var(--ant-color-text-secondary) 35%, var(--ant-color-border));
    background: var(--ant-color-fill-quaternary);
    color: var(--ant-color-text);
    font-weight: 600;
    &:hover:not(:disabled) {
      color: var(--ant-color-text);
      border-color: var(--ant-color-text-tertiary);
      background: var(--ant-color-fill-tertiary);
    }
  }
  .about-action-spinner {
    width: 10px;
    height: 10px;
    border: 1.5px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: about-spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  .about-copyright {
    .about-copyright-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--ant-color-text-secondary);
      margin-bottom: 6px;
    }
    .about-copyright-text {
      font-size: 11px;
      color: var(--ant-color-text-tertiary);
      line-height: 1.6;
      margin-bottom: 6px;
      &:last-child { margin-bottom: 0; }
    }
  }
  .about-link {
    color: var(--ant-color-text-secondary);
    text-decoration: underline;
    &:hover { color: var(--ant-color-text); }
  }
}

@keyframes about-spin {
  to { transform: rotate(360deg); }
}

.setting-card {
  background: var(--ant-color-bg-container); border: 1px solid var(--ant-color-border); border-radius: 6px; padding: 12px;
  .setting-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; .setting-label { font-size: 12px; color: var(--ant-color-text-secondary); } }
  .setting-desc { font-size: 11px; color: var(--ant-color-text-tertiary); margin-top: 6px; line-height: 1.5; }
  .setting-divider { height: 1px; background: var(--ant-color-border-secondary); margin: 14px 0; }
  .setting-sub-row { margin-top: 8px; padding: 8px 10px; border-radius: 6px; background: var(--ant-color-fill-quaternary); }
  .setting-desc-inline { margin-top: 2px; }
  .setting-form-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; .setting-form-label { font-size: 12px; color: var(--ant-color-text-secondary); min-width: 90px; white-space: nowrap; } .setting-form-control { flex: 1; display: flex; gap: 4px; min-width: 0; } }
  .color-group-row { margin-top: 14px; align-items: flex-start; }
  .color-group-picker {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 8px 0 10px 98px; max-height: 360px; overflow-y: auto; padding-right: 2px;
  }
  .color-group-card {
    position: relative; border: 1px solid var(--ant-color-border-secondary); border-left: 2px solid transparent; border-radius: 6px; padding: 7px 7px 7px 8px; background: var(--ant-color-bg-container); cursor: pointer; transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
    &:hover { border-color: var(--ant-color-text-quaternary); background: var(--ant-color-fill-tertiary); }
    &.color-group-card-active {
      border-color: var(--ant-color-border-secondary);
      border-left-color: var(--ant-color-primary);
      background: var(--ant-color-bg-container);
      box-shadow: none;
      .color-group-name { color: var(--ant-color-text); }
      &:hover {
        border-color: var(--ant-color-border-secondary);
        border-left-color: var(--ant-color-primary);
        background: var(--ant-color-fill-tertiary);
      }
    }
    &.color-group-card-active::after,
    &.color-group-card-active::before {
      content: none;
      display: none;
    }
  }
  .color-group-card-head {
    display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px;
    .color-group-title { display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1; }
    .color-group-check { font-size: 12px; color: var(--ant-color-primary); flex-shrink: 0; }
    .color-group-name { font-size: 11px; font-weight: 600; color: var(--ant-color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .color-group-tag { font-size: 10px; color: var(--ant-color-text-tertiary); background: var(--ant-color-fill-tertiary); border-radius: 3px; padding: 1px 4px; flex-shrink: 0; }
  }
  .color-group-strip {
    display: flex; width: 100%; height: 20px; overflow: hidden; border-radius: 5px; border: 1px solid rgba(0, 0, 0, 0.08);
    .color-strip-item { flex: 1; min-width: 0; }
  }
  .color-group-editor {
    margin-left: 98px; padding: 10px; border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; background: var(--ant-color-bg-layout);
  }
  .color-group-editor-head {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;
  }
  .color-editor-list {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); gap: 6px;
  }
  .color-editor-item {
    display: flex; align-items: center; gap: 4px; min-width: 0;
    .color-picker-input { width: 26px; height: 24px; padding: 0; border: 1px solid var(--ant-color-border); border-radius: 4px; background: transparent; cursor: pointer; }
    .color-hex-input { flex: 1; min-width: 0; font-size: 11px; }
    .ant-btn { flex: 0 0 auto; width: 22px; height: 22px; padding: 0; color: var(--ant-color-text-tertiary); &:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); } }
  }
}

.system-settings-intro { padding: 14px 0 12px; border-bottom: 1px solid var(--ant-color-border-secondary); }
.system-settings-title { color: var(--ant-color-text); font-size: 14px; font-weight: 600; line-height: 1.4; }
.system-settings-desc { color: var(--ant-color-text-tertiary); font-size: 11px; line-height: 1.5; margin-top: 3px; }
.system-setting-group { padding: 16px 0; border-bottom: 1px solid var(--ant-color-border-secondary); }
.system-setting-group:last-child { border-bottom: none; padding-bottom: 8px; }
.system-setting-group-head { display: flex; align-items: flex-start; gap: 9px; }
.system-setting-group-icon { color: var(--ant-color-primary); font-size: 15px; line-height: 19px; flex-shrink: 0; }
.system-setting-group-title { color: var(--ant-color-text); font-size: 13px; font-weight: 600; line-height: 1.45; }
.system-setting-group-desc { color: var(--ant-color-text-tertiary); font-size: 11px; line-height: 1.45; margin-top: 2px; }
.system-setting-group-action { margin-left: auto; flex-shrink: 0; }
.system-setting-list { margin-top: 12px; border-top: 1px solid var(--ant-color-border-secondary); }
.system-setting-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 18px; padding: 11px 0; border-bottom: 1px solid var(--ant-color-border-secondary); }
.system-setting-row:last-child { border-bottom: none; }
.system-setting-row-path { align-items: start; }
.system-setting-row-secondary { margin: -1px 0 0; padding: 10px; border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; background: var(--ant-color-fill-quaternary); }
.system-setting-copy { min-width: 0; }
.system-setting-label { color: var(--ant-color-text-secondary); font-size: 12px; font-weight: 500; line-height: 1.45; }
.system-setting-desc { color: var(--ant-color-text-tertiary); font-size: 11px; line-height: 1.45; margin-top: 2px; }
.system-setting-control { display: flex; align-items: center; gap: 6px; min-width: 0; justify-content: flex-end; }
.system-setting-control-end { justify-content: flex-end; }
.system-setting-row-path .system-setting-control { width: 278px; }
.system-setting-row-path .ant-input { min-width: 0; flex: 1; }
.system-setting-control .ant-btn { display: inline-flex; align-items: center; gap: 4px; }
.setting-select-sm { width: 108px; }
.setting-select-md { width: 128px; }
.system-setting-group-appearance .color-group-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 12px 0 0; }
.system-setting-group-appearance .color-group-card { min-width: 0; border: 1px solid var(--ant-color-border-secondary); border-left: 2px solid transparent; border-radius: 6px; padding: 7px 8px; background: var(--ant-color-bg-container); cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.system-setting-group-appearance .color-group-card:hover { background: var(--ant-color-fill-tertiary); border-color: var(--ant-color-text-quaternary); }
.system-setting-group-appearance .color-group-card-active { border-left-color: var(--ant-color-primary); }
.system-setting-group-appearance .color-group-card-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 5px; }
.system-setting-group-appearance .color-group-title { display: flex; align-items: center; gap: 5px; min-width: 0; }
.system-setting-group-appearance .color-group-check { color: var(--ant-color-primary); font-size: 12px; }
.system-setting-group-appearance .color-group-name { color: var(--ant-color-text-secondary); font-size: 11px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.system-setting-group-appearance .color-group-tag { color: var(--ant-color-text-tertiary); background: var(--ant-color-fill-tertiary); border-radius: 3px; font-size: 10px; padding: 1px 4px; }
.system-setting-group-appearance .color-group-strip { display: flex; height: 18px; overflow: hidden; border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 4px; }
.system-setting-group-appearance .color-strip-item { flex: 1; min-width: 0; }
.system-setting-group-appearance .color-group-editor { margin: 10px 0 0; padding: 10px; border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; background: var(--ant-color-bg-layout); }
.system-setting-group-appearance .color-group-editor-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.system-setting-group-appearance .color-editor-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); gap: 6px; }
.system-setting-group-appearance .color-editor-item { display: flex; align-items: center; gap: 4px; min-width: 0; }
.system-setting-group-appearance .color-picker-input { width: 26px; height: 24px; padding: 0; border: 1px solid var(--ant-color-border); border-radius: 4px; background: transparent; cursor: pointer; }
.system-setting-group-appearance .color-hex-input { min-width: 0; flex: 1; font-size: 11px; }
.system-setting-group-appearance .color-editor-item .ant-btn { width: 22px; height: 22px; padding: 0; color: var(--ant-color-text-tertiary); }
.system-setting-group-appearance .color-editor-item .ant-btn:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }

.ant-drawer-body {
  .ant-input,
  .ant-input-affix-wrapper,
  .ant-input-number,
  .ant-select-selector,
  .ant-input-group-addon {
    border-color: var(--ant-color-border);
  }
  .ant-input:hover,
  .ant-input:focus,
  .ant-input-affix-wrapper:hover,
  .ant-input-affix-wrapper-focused,
  .ant-input-number:hover,
  .ant-input-number-focused,
  .ant-select:not(.ant-select-disabled):hover .ant-select-selector,
  .ant-select-focused .ant-select-selector {
    border-color: var(--ant-color-text-tertiary) !important;
    box-shadow: 0 0 0 2px rgba(156, 163, 175, 0.1);
  }
  .ant-input-group-addon {
    background: var(--ant-color-bg-layout);
    color: var(--ant-color-text-secondary);
  }
  .ant-input-disabled,
  .ant-input-affix-wrapper-disabled,
  .ant-select-disabled .ant-select-selector,
  .ant-input-number-disabled {
    border-color: var(--ant-color-border-secondary) !important;
  }
  .form-warning { font-size: 11px; color: #d97706; margin-top: 2px; line-height: 14px; }
  .form-inline-hint { font-size: 11px; color: var(--ant-color-text-tertiary); line-height: 16px; }
}
</style>

<style lang="less">
.ant-modal {
  .ant-modal-header { border-bottom: 1px solid var(--ant-color-border); padding: 12px 24px; .ant-modal-title { font-size: 14px; font-weight: 600; color: var(--ant-color-text); } }
  .ant-modal-body { padding: 12px 24px; }
  .ant-modal-footer { border-top: 1px solid var(--ant-color-border-secondary); padding: 10px 24px; }
  .ant-form-item-label > label { color: var(--ant-color-text-secondary); font-size: 12px; }
  .ant-input,
  .ant-input-affix-wrapper,
  .ant-input-number,
  .ant-select-selector,
  .ant-input-group-addon {
    border-color: var(--ant-color-border);
  }
  .ant-input:hover,
  .ant-input:focus,
  .ant-input-affix-wrapper:hover,
  .ant-input-affix-wrapper-focused,
  .ant-input-number:hover,
  .ant-input-number-focused,
  .ant-select:not(.ant-select-disabled):hover .ant-select-selector,
  .ant-select-focused .ant-select-selector {
    border-color: var(--ant-color-text-tertiary) !important;
    box-shadow: 0 0 0 2px rgba(156, 163, 175, 0.1);
  }
  .ant-input-group-addon {
    background: var(--ant-color-bg-layout);
    color: var(--ant-color-text-secondary);
  }
  .ant-input-disabled,
  .ant-input-affix-wrapper-disabled,
  .ant-select-disabled .ant-select-selector,
  .ant-input-number-disabled {
    border-color: var(--ant-color-border-secondary) !important;
  }
  .compact-form .compact-item { margin-bottom: 8px; }
  .compact-row { display: flex; gap: 0; }
  .compact-row-spacer { width: 12px; flex-shrink: 0; }
  .compact-item-half { flex: 1; min-width: 0; }
  .advanced-config-toggle {
    display: flex; align-items: center; gap: 8px; padding: 9px 10px; background: transparent; border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; font-size: 12px; font-weight: 500; color: var(--ant-color-text-secondary); cursor: pointer; transition: color 0.15s, background 0.15s, border-color 0.15s; margin: 16px 0 8px;
    &:hover, &.advanced-config-toggle-active { background: var(--ant-color-fill-quaternary); color: var(--ant-color-text); border-color: var(--ant-color-border); }
    .toggle-icon { flex-shrink: 0; margin-left: auto; font-size: 10px; color: var(--ant-color-text-tertiary); }
  }
  .advanced-config-content {
    padding: 12px; background: var(--ant-color-bg-layout); border: 1px dashed var(--ant-color-border); border-radius: 6px; margin-bottom: 8px;
  }
  .mc-import-toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; font-size: 12px; color: var(--ant-color-text-secondary);
  }
  .mc-import-actions {
    display: flex; align-items: center; gap: 8px; margin: 10px 0;
    .mc-import-message { font-size: 12px; color: var(--ant-color-text-tertiary); margin-left: auto; }
  }
  .mc-import-list {
    max-height: 480px; overflow: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;
  }
  .mc-import-row {
    border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; padding: 8px 10px; background: var(--ant-color-bg-container);
    &.mc-import-row-disabled { opacity: 0.55; }
  }
  .mc-import-card-head {
    display: flex; align-items: center; gap: 8px;
    .mc-import-source { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .mc-import-source-name { font-size: 13px; font-weight: 600; color: var(--ant-color-text); }
    .mc-import-source-url { font-size: 11px; color: var(--ant-color-text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
  .mc-import-summary {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; min-width: 180px;
    span { font-size: 11px; color: var(--ant-color-text-secondary); background: var(--ant-color-fill-tertiary); border-radius: 4px; padding: 2px 6px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
  .mc-import-addressing {
    display: flex; justify-content: flex-end; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--ant-color-border-secondary);
  }

  /* 插件列表样式 */
  .drawer-content-plugins {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .plugin-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .plugin-card {
    border: 1px solid var(--ant-color-border-secondary);
    border-radius: 8px;
    background: var(--ant-color-bg-container);
    overflow: hidden;
    transition: border-color 0.2s;
    &:hover { border-color: var(--ant-color-border); }
  }
  .plugin-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    gap: 14px;
  }
  .plugin-card-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .plugin-title-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .plugin-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--ant-color-text);
  }
  .plugin-platform-tag {
    font-size: 11px;
    color: var(--ant-color-text-tertiary);
    background: var(--ant-color-fill-tertiary);
    border-radius: 4px;
    padding: 1px 6px;
    line-height: 16px;
  }
  .badge-dot-gray {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #9ca3af;
    margin-right: 5px;
  }
  .plugin-desc {
    font-size: 12px;
    line-height: 1.5;
    color: var(--ant-color-text-secondary);
  }
  .plugin-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .plugin-card-body {
    border-top: 1px solid var(--ant-color-border-secondary);
    background: var(--ant-color-fill-quaternary);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: fadeIn 0.15s ease-in-out;
  }
  .plugin-field-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
  }
  .plugin-field-label {
    width: 60px;
    flex-shrink: 0;
    color: var(--ant-color-text-secondary);
  }
  .plugin-field-control {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }
  .plugin-path-input {
    flex: 1;
  }
  .plugin-field-tip {
    font-size: 11px;
    color: var(--ant-color-text-tertiary);
  }
}
.ant-popconfirm { .ant-popconfirm-buttons { .ant-btn-primary { background: #b91c1c; border-color: #b91c1c; &:hover { background: #dc2626; border-color: #dc2626; } } } }
</style>
