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
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 连接配置 -->
    <div v-if="activeTab === 'bucket'" class="drawer-content drawer-content-bucket">
      <div class="connection-list">
        <div v-for="conn in configStore.connections" :key="conn.id" class="connection-card">
          <div class="connection-card-header" @click="toggleConnection(conn.id)">
            <div class="connection-card-info">
              <span class="expand-icon"><CaretDownOutlined v-if="!collapsedConnections.has(conn.id)" /><CaretRightOutlined v-else /></span>
              <CloudServerOutlined class="connection-icon" />
              <span class="connection-card-name" :class="{ 'connection-disabled': conn.enabled === false }">{{ conn.id }}</span>
              <span class="connection-card-endpoint">{{ conn.endpoint }}</span>
            </div>
            <div class="connection-card-actions">
              <span class="config-enable-switch" @click.stop>
                <a-switch :checked="conn.enabled !== false" size="small" @change="(val: boolean) => handleConnectionEnableChange(conn, val)" />
              </span>
              <a-tooltip title="添加挂载"><a-button type="text" size="small" @click.stop="handleAddTarget(conn)">
                <PlusOutlined />
              </a-button></a-tooltip>
              <a-tooltip title="编辑"><a-button type="text" size="small" @click.stop="handleEditConnection(conn)">
                <FormOutlined />
              </a-button></a-tooltip>
              <a-popconfirm title="确定删除此连接及其所有挂载？" placement="left" @confirm="handleDeleteConnection(conn.id)">
                <a-tooltip title="删除"><a-button type="text" size="small" class="action-danger" @click.stop>
                  <DeleteOutlined />
                </a-button></a-tooltip>
              </a-popconfirm>
            </div>
          </div>

          <!-- 挂载目标列表 -->
          <div class="target-list" v-show="!collapsedConnections.has(conn.id)">
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

        <a-empty v-if="configStore.connections.length === 0" description="暂无存储配置" class="drawer-empty" />
      </div>

      <div class="drawer-footer-actions">
        <div class="add-btn-row" @click="handleAddConnection">
          <PlusOutlined /> 添加连接
        </div>
        <div class="add-btn-row" @click="mcImportVisible = true">
          <ImportOutlined /> 导入 MC Config
        </div>
      </div>
    </div>

    <!-- 传输设置 -->
    <div v-if="activeTab === 'transfer'" class="drawer-content">
      <div class="setting-card">
        <div class="setting-row">
          <span class="setting-label">闪传（跳过重复上传）</span>
          <a-switch v-model:checked="flashUploadEnabled" @change="handleFlashUploadEnabledChange" />
        </div>
        <div class="setting-row" v-if="flashUploadEnabled">
          <span class="setting-label">阈值（MB）</span>
          <a-input-number
            v-model:value="flashUploadThresholdMB"
            :min="1"
            :max="1024"
            :step="10"
            style="width: 100px"
            size="small"
            @change="handleFlashUploadThresholdChange"
          />
        </div>
        <div class="setting-desc" v-if="flashUploadEnabled">
          超过此大小的文件将自动检查远程是否已存在同名同大小文件
        </div>
      </div>
    </div>

    <!-- 系统设置 -->
    <div v-if="activeTab === 'system'" class="drawer-content">
      <div class="setting-card">
        <div class="setting-form-row">
          <span class="setting-form-label">挂载程序</span>
          <div class="setting-form-control">
            <a-input v-model:value="fuseBinValue" size="small" style="width: calc(100% - 32px)" @change="handleFuseBinChange" />
            <a-button size="small" @click="handleSelectFuse">
              <FolderOpenOutlined />
            </a-button>
          </div>
        </div>
        <div class="setting-form-row">
          <span class="setting-form-label">默认缓存目录</span>
          <div class="setting-form-control">
            <a-input v-model:value="defaultCacheDirectoryValue" size="small" style="width: calc(100% - 32px)" placeholder="未设置时使用系统临时目录" @change="handleDefaultCacheDirectoryChange" />
            <a-button size="small" @click="handleSelectDefaultCacheDirectory">
              <FolderOpenOutlined />
            </a-button>
          </div>
        </div>
        <div class="setting-desc">存储桶挂载时缓存路径的默认值，留空则使用系统临时目录</div>
        <div class="setting-form-row" style="margin-top: 10px">
          <span class="setting-form-label">默认下载目录</span>
          <div class="setting-form-control">
            <a-input v-model:value="defaultDownloadDirectoryValue" size="small" style="width: calc(100% - 32px)" placeholder="未设置时每次下载需选择目录" @change="handleDefaultDownloadDirectoryChange" />
            <a-button size="small" @click="handleSelectDefaultDownloadDirectory">
              <FolderOpenOutlined />
            </a-button>
          </div>
        </div>
        <div class="setting-desc">指定后下载文件时直接使用此目录，不再弹出目录选择框</div>
        <div class="setting-form-row" style="margin-top: 10px">
          <span class="setting-form-label">默认列表行数</span>
          <div class="setting-form-control">
            <a-select v-model:value="defaultPageSizeValue" size="small" style="width: 100px" @change="handleDefaultPageSizeChange">
              <a-select-option :value="10">10 行/页</a-select-option>
              <a-select-option :value="20">20 行/页</a-select-option>
              <a-select-option :value="50">50 行/页</a-select-option>
              <a-select-option :value="100">100 行/页</a-select-option>
            </a-select>
          </div>
        </div>
        <div class="setting-desc">文件列表每页默认显示的行数，可在列表页临时调整</div>
        <div class="setting-form-row" style="margin-top: 10px">
          <span class="setting-form-label">列表加载模式</span>
          <div class="setting-form-control">
            <a-radio-group v-model:value="listLoadModeValue" size="small" @change="handleListLoadModeChange">
              <a-radio-button value="waterfall">瀑布流</a-radio-button>
              <a-radio-button value="pagination">翻页</a-radio-button>
            </a-radio-group>
          </div>
        </div>
        <div class="setting-desc">瀑布流模式下通过滚动鼠标加载更多文件；翻页模式下通过页码翻页</div>
        <div class="setting-divider"></div>
        <div class="setting-form-row">
          <span class="setting-form-label">关闭主窗口时</span>
          <div class="setting-form-control">
            <a-radio-group v-model:value="closeBehaviorValue" size="small" @change="handleCloseBehaviorChange">
              <a-radio-button value="hide">隐藏到任务栏</a-radio-button>
              <a-radio-button value="exit">退出应用</a-radio-button>
            </a-radio-group>
          </div>
        </div>
        <div class="setting-desc">默认隐藏主窗口并保留任务栏通知区域图标，后台传输、挂载等任务可继续运行。</div>
        <div v-if="closeBehaviorValue === 'exit'" class="setting-row setting-sub-row">
          <div>
            <div class="setting-label">退出前显示影响提示</div>
            <div class="setting-desc setting-desc-inline">关闭提醒后，可随时在这里重新开启。</div>
          </div>
          <a-switch v-model:checked="confirmBeforeExitValue" size="small" @change="handleConfirmBeforeExitChange" />
        </div>
        <div class="setting-form-row color-group-row">
          <span class="setting-form-label">连接主题色组</span>
          <div class="setting-form-control">
            <a-button size="small" @click="handleCopyColorGroup">复制为自定义</a-button>
          </div>
        </div>
        <div class="setting-desc">连接和标签页主题色会按当前色组循环分配，连接数量超过色号数量时允许重复。</div>
        <div class="color-group-picker">
          <div
            v-for="group in connectionColorGroups"
            :key="group.id"
            :class="['color-group-card', { 'color-group-card-active': colorGroupIdValue === group.id }]"
            @click="handleConnectionColorGroupChange(group.id)"
          >
            <div class="color-group-card-head">
              <span class="color-group-name">{{ group.name }}</span>
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
      </div>
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
      width="480px"
      :title="connectionModalTitle"
      @cancel="handleConnectionModalCancel"
    >
      <template #footer>
        <a-button @click="connectionModalState.visible = false">取消</a-button>
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
              :filter-option="(input, option) => option.value.toLowerCase().includes(input.toLowerCase())"
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
            { pattern: /^[\w.-]+(:\d+)?$/, message: '格式: host:port，不含协议前缀' }
          ]"
          class="compact-item"
        >
          <a-input
            v-model:value="connectionModalFormState.endpoint"
            placeholder="例如: s3.example.com:9000"
            size="small"
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
        <div class="advanced-config-toggle" @click="advancedConfigVisible = !advancedConfigVisible">
          <span>高级配置选项</span>
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
              <span>{{ item.connection.pathStyle ? 'PathStyle' : 'VirtualHost' }}</span>
            </div>
            <a-switch v-model:checked="item.connection.enabled" size="small" />
            <a-button size="small" @click="handleMcImportEditItem(item)">编辑</a-button>
          </div>
        </div>
      </div>
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
      </a-form>
    </a-modal>
  </a-drawer>
</template>

<script lang="ts">
import { defineComponent, reactive, ref, computed, watch, onMounted, onUnmounted, toRaw } from 'vue';
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
} from '@ant-design/icons-vue';
import { Connection, ConnectionColorGroup, MountTarget, PreloadStorage, PreloadNative, PreloadFuse, UpdaterResponse } from '../../electron/preload/types';
import { FormInstance, notification } from 'ant-design-vue';
import { defaultStorage, useConfigStore } from '../store/config';
import { defaultConnectionColorGroups, useSettingStore } from '../store/setting';
import StringUtil from '../common/stringUtil';
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
}

export default defineComponent({
  components: { PlusOutlined, ImportOutlined, DeleteOutlined, FormOutlined, FolderOpenOutlined, PlayCircleOutlined, CloseSquareOutlined, DownOutlined, RightOutlined, CloudServerOutlined, HddOutlined, CaretDownOutlined, CaretRightOutlined },
  props: {
    open: { type: Boolean, default: undefined },
    visible: { type: Boolean, default: false },
  },
  emits: ['update:open', 'mountChanged'],
  setup(props, { emit }) {
    const configStore = useConfigStore();
    const settingStore = useSettingStore();
    const drawerOpen = computed(() => props.open ?? props.visible);
    const activeTab = ref('bucket');
    const endpointProtocol = ref<string>('http');
    const flashUploadEnabled = ref<boolean>(settingStore.flashUploadEnabled ?? true);
    const flashUploadThresholdMB = ref<number>(settingStore.flashUploadThresholdMB ?? 50);
    const fuseBinValue = ref<string>(settingStore.fuseBin || '');
    const defaultCacheDirectoryValue = ref<string>(settingStore.defaultCacheDirectory || '');
    const defaultPageSizeValue = ref<number>(settingStore.defaultPageSize || 20);
    const defaultDownloadDirectoryValue = ref<string>(settingStore.defaultDownloadDirectory || '');
    const listLoadModeValue = ref<'pagination' | 'waterfall'>(settingStore.listLoadMode || 'waterfall');
    const closeBehaviorValue = ref<'hide' | 'exit'>(settingStore.closeBehavior === 'exit' ? 'exit' : 'hide');
    const confirmBeforeExitValue = ref<boolean>(settingStore.confirmBeforeExit !== false);
    const colorGroupIdValue = ref<string>(settingStore.connectionColorGroupId || defaultConnectionColorGroups[0].id);
    const mountStates = reactive<Record<string, boolean>>({});
    const windowsDrives = ref<string[]>([]);
    const bucketOptions = ref<string[]>([]);
    const bucketFetching = ref(false);
    const availableDrives = ref<string[]>([]);
    const collapsedConnections = ref<Set<string>>(new Set());

    const toggleConnection = (id: string) => {
      const newSet = new Set(collapsedConnections.value);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      collapsedConnections.value = newSet;
    };

    const tabs = [
      { key: 'bucket', label: '连接' },
      { key: 'transfer', label: '传输' },
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

    // 挂载 Modal
    const targetModalFormState = ref({ bucket: '', pathPrefix: '', mountPoint: '', cacheDirectory: '' });
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
    const handleFlashUploadEnabledChange = (enabled: boolean) => settingStore.setFlashUploadEnabled(enabled);
    const handleFlashUploadThresholdChange = (threshold: number) => settingStore.setFlashUploadThresholdMB(threshold);
    const handleSelectFuse = () => { const name = native.getLocalFilename(); if (name) fuseBinValue.value = name; };
    const handleSelectDefaultCacheDirectory = () => { const paths = native.getLocalSaveFolder(); if (paths?.length) { defaultCacheDirectoryValue.value = paths[0]; settingStore.setDefaultCacheDirectory(paths[0]); } };
    const handleSelectDefaultDownloadDirectory = () => { const paths = native.getLocalSaveFolder(); if (paths?.length) { defaultDownloadDirectoryValue.value = paths[0]; settingStore.setDefaultDownloadDirectory(paths[0]); } };
    const handleFuseBinChange = () => { settingStore.fuseBin = fuseBinValue.value; };
    const handleDefaultCacheDirectoryChange = () => { settingStore.setDefaultCacheDirectory(defaultCacheDirectoryValue.value); };
    const handleDefaultDownloadDirectoryChange = () => { settingStore.setDefaultDownloadDirectory(defaultDownloadDirectoryValue.value); };
    const handleDefaultPageSizeChange = (val: number) => { settingStore.setDefaultPageSize(val); };
    const handleListLoadModeChange = () => { settingStore.setListLoadMode(listLoadModeValue.value); };
    const handleCloseBehaviorChange = () => { settingStore.setCloseBehavior(closeBehaviorValue.value); };
    const handleConfirmBeforeExitChange = (enabled: boolean) => { settingStore.setConfirmBeforeExit(enabled); };

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
          const connectionId = ensureUniqueImportId(alias, usedIds);
          const connection: Connection = {
            id: connectionId,
            endpoint: endpoint.endpoint,
            accessKeyId: aliasConfig.accessKey,
            accessKeySecret: aliasConfig.secretKey,
            region: 'us-east-1',
            useSSL: endpoint.useSSL,
            pathStyle: String(aliasConfig.api || '').toLowerCase() === 's3v4',
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

      if (!configStore.activeConnectionId && selectedItems[0]?.connection.id) {
        configStore.setActiveConnection(selectedItems[0].connection.id);
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

    const handleEditConnection = (conn: Connection) => {
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
      connectionModalFormRef.value?.validateFields().then(() => {
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
        if (!configStore.activeConnectionId) {
          configStore.setActiveConnection(conn.id);
        }
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

    const handleDeleteConnection = (connectionId: string) => {
      configStore.removeConnection(connectionId);
      notification.success({ message: `已删除连接 ${connectionId}` });
    };

    // ── 挂载目标管理 ──
    const handleAddTarget = async (conn: Connection) => {
      targetModalFormState.value = {
        bucket: conn.bucket || '',
        pathPrefix: conn.pathPrefix || '',
        mountPoint: '',
        cacheDirectory: settingStore.defaultCacheDirectory || '',
      };
      targetModalState.connectionId = conn.id;
      targetModalState.lockedBucket = conn.bucket || '';
      targetModalState.editingTargetId = '';

      // 获取可用盘符
      if (isWindows) {
        try {
          const usedDrives = await fuse.driveList();
          const bucketViewDrives = configStore.mountTargets.map(t => t.mountPoint).filter(d => d);
          availableDrives.value = defaultDrives.filter(d => !usedDrives.includes(d) && !bucketViewDrives.includes(d));
          // 自动分配第一个可用盘符
          if (availableDrives.value.length > 0) {
            targetModalFormState.value.mountPoint = availableDrives.value[0];
          }
        } catch { availableDrives.value = defaultDrives; }
      }

      // 获取 bucket 列表
      if (!targetModalState.lockedBucket) {
        fetchBuckets(conn);
      }

      targetModalState.visible = true;
    };

    const handleEditTarget = async (conn: Connection, target: MountTarget) => {
      targetModalFormState.value = {
        bucket: target.bucket,
        pathPrefix: target.pathPrefix,
        mountPoint: target.mountPoint || '',
        cacheDirectory: target.cacheDirectory || '',
      };
      targetModalState.connectionId = conn.id;
      targetModalState.lockedBucket = conn.bucket || '';
      targetModalState.editingTargetId = target.id;

      if (isWindows) {
        try {
          const usedDrives = await fuse.driveList();
          const bucketViewDrives = configStore.mountTargets.map(t => t.mountPoint).filter(d => d && d !== target.mountPoint);
          availableDrives.value = defaultDrives.filter(d => !usedDrives.includes(d) && !bucketViewDrives.includes(d));
        } catch { availableDrives.value = defaultDrives; }
      }

      if (!targetModalState.lockedBucket) {
        fetchBuckets(conn);
      }

      targetModalState.visible = true;
    };

    const handleTargetModalOk = () => {
      const form = targetModalFormState.value;
      if (!form.bucket || !form.mountPoint) {
        notification.error({ message: "请填写 Bucket 和挂载路径" });
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
      const target: MountTarget = {
        id: `${targetModalState.connectionId}/${form.bucket}${form.pathPrefix ? '/' + form.pathPrefix : ''}`,
        connectionId: targetModalState.connectionId,
        bucket: form.bucket,
        pathPrefix: form.pathPrefix,
        mountPoint: form.mountPoint,
        cacheDirectory: form.cacheDirectory,
        enabled: existingTarget ? existingTarget.enabled : true,
      };
      configStore.addMountTarget(target);
      notification.success({ message: targetModalState.editingTargetId ? "编辑挂载成功" : "添加挂载成功", description: form.bucket });
      targetModalState.visible = false;
    };

    const handleDeleteTarget = (targetId: string) => {
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
      fuse.preMountCleanup(mountTarget).then(() => {
        return fuse.mount(_.cloneDeep(toRaw(conn)), mountTarget, settingStore.fuseBin || "");
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
      });
    };

    const handleSelectCacheDir = () => {
      const paths = native.getLocalSaveFolder();
      if (paths?.length) targetModalFormState.value.cacheDirectory = paths[0];
    };

    // ── 挂载状态检查 ──
    const handleCheckMounts = () => {
      for (const target of configStore.mountTargets) {
        if (target.mountPoint && target.mountPoint.length > 0) {
          fuse.checkMount(target.mountPoint).then((state) => { mountStates[target.id] = state; })
            .catch(() => { mountStates[target.id] = false; });
        } else {
          mountStates[target.id] = false;
        }
      }
    };

    const handleDriveList = () => {
      if (!isWindows) return;
      fuse.driveList().then((drives) => { windowsDrives.value = defaultDrives.filter(drive => !drives.includes(drive)); }).catch(() => {});
    };

    watch(drawerOpen, (val) => {
      if (val) {
        collapsedConnections.value = new Set(configStore.connections.map(conn => conn.id));
        handleDriveList();
        handleCheckMounts();
        flashUploadEnabled.value = settingStore.flashUploadEnabled ?? true;
        flashUploadThresholdMB.value = settingStore.flashUploadThresholdMB ?? 50;
        fuseBinValue.value = settingStore.fuseBin || '';
        defaultCacheDirectoryValue.value = settingStore.defaultCacheDirectory || '';
        defaultDownloadDirectoryValue.value = settingStore.defaultDownloadDirectory || '';
        defaultPageSizeValue.value = settingStore.defaultPageSize ?? 20;
        listLoadModeValue.value = settingStore.listLoadMode || 'waterfall';
        closeBehaviorValue.value = settingStore.closeBehavior === 'exit' ? 'exit' : 'hide';
        confirmBeforeExitValue.value = settingStore.confirmBeforeExit !== false;
        colorGroupIdValue.value = settingStore.connectionColorGroupId || defaultConnectionColorGroups[0].id;
      }
    }, { immediate: true });
    // bucket 清空时自动清空 pathPrefix
    watch(() => connectionModalFormState.value.bucket, (val) => {
      if (!val) connectionModalFormState.value.pathPrefix = '';
    });
    const intervalId = setInterval(handleCheckMounts, 5000);
    onMounted(() => {
      native.ipc('handler-updater', handleAboutUpdater);
    });
    onUnmounted(() => clearInterval(intervalId));

    return {
      configStore, activeTab, tabs, endpointProtocol, drawerOpen,
      appVersion, appPlatform, copyrightYear, buildInfo,
      updateChecking, updateDownloading, updateInstalling, updateProgress,
      updateAvailableVersion, updateDownloaded, updateStatusText,
      handleCheckUpdate, handleDownloadUpdate, handleInstallUpdate,
      flashUploadEnabled, flashUploadThresholdMB,
      fuseBinValue, defaultCacheDirectoryValue, defaultPageSizeValue, defaultDownloadDirectoryValue,
      listLoadModeValue, closeBehaviorValue, confirmBeforeExitValue, colorGroupIdValue,
      mountStates, isWindows, allBucketsCache, bucketFetching, availableDrives,
      connectionModalState, connectionModalFormState, connectionModalFormRef,
      connectionModalTitle, connectionIdDisabled,
      StringUtil, targetModalState, targetModalFormState,
      targetPathPrefixPlaceholder, targetPathPrefixWarning,
      existingGroupOptions, advancedConfigVisible, connectionTesting, handleTestConnection,
      handleClose, handleFlashUploadEnabledChange, handleFlashUploadThresholdChange,
      handleSelectFuse, handleSelectDefaultCacheDirectory, handleSelectDefaultDownloadDirectory,
      collapsedConnections, toggleConnection,
      handleFuseBinChange, handleDefaultCacheDirectoryChange, handleDefaultDownloadDirectoryChange, handleDefaultPageSizeChange,
      handleListLoadModeChange, handleCloseBehaviorChange, handleConfirmBeforeExitChange, connectionColorGroups, activeCustomColorGroup,
      normalizeHexColor, handleConnectionColorGroupChange, handleCopyColorGroup, syncActiveCustomColorGroup,
      handleAddColorToGroup, handleRemoveColorFromGroup, handleColorPickerInput, handleColorHexBlur, handleDeleteCustomColorGroup,
      filterBucketOption, handleBucketFocus, retryFetchBuckets, bucketListFailed, handleTargetBucketFocus, retryFetchBucketsTarget,
      mcImportVisible, mcImportText, mcImportItems, mcImportParseMessage, selectedMcImportCount,
      handleMcImport, handleMcImportFile, handleMcImportParse, handleMcImportSelectAll, handleMcImportCancel,
      handleMcImportEditItem,
      handleAddConnection, handleEditConnection, handleConnectionModalOk, handleConnectionModalCancel, handleDeleteConnection,
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
  .ant-drawer-content,
  .ant-drawer-wrapper-body {
    min-height: 0;
  }

  .ant-drawer-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
}

.drawer-content { padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 0; background: transparent; flex: 1; min-height: 0; overflow: auto; }
.drawer-content-bucket { padding-bottom: 0; overflow: hidden; }
.connection-list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 4px 0 8px; }
.drawer-footer-actions { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--ant-color-border-secondary); background: var(--ant-color-bg-container); flex-shrink: 0; .add-btn-row { flex: 1; } }

.connection-card {
  background: transparent; border: none; border-radius: 0; overflow: visible; margin-bottom: 0; box-shadow: none;
  &:not(:last-child) { border-bottom: 1px solid rgba(128, 128, 128, 0.2); padding-bottom: 6px; margin-bottom: 6px; }
  .connection-card-header {
    display: flex; align-items: center; justify-content: space-between; padding: 10px 4px; background: transparent; border-bottom: none; cursor: pointer; transition: background 0.2s, border-radius 0.2s;
    &:hover { background: var(--ant-color-fill-tertiary); border-radius: 6px; }
    .connection-card-info { display: flex; align-items: center; gap: 10px;
      .expand-icon { font-size: 10px; color: var(--ant-color-text-tertiary); transition: color 0.2s; display: flex; align-items: center; width: 12px; }
      .connection-icon { font-size: 16px; color: var(--ant-color-primary); }
      .connection-card-name { font-size: 14px; font-weight: 600; color: var(--ant-color-text); letter-spacing: 0.5px; &.connection-disabled { color: var(--ant-color-text-tertiary); } }
      .connection-card-endpoint { font-size: 11px; color: var(--ant-color-text-tertiary); margin-left: 6px; }
    }
    .connection-card-actions {
      display: flex; gap: 4px;
      .ant-btn {
        height: 24px; width: 24px; padding: 0; display: flex; align-items: center; justify-content: center; color: var(--ant-color-text-secondary);
        &:hover { color: var(--ant-color-text); background: var(--ant-color-fill-tertiary); }
        &.action-danger { color: #ef4444; &:hover { background: #fee2e2; color: #b91c1c; } }
      }
    }
  }
}
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
    border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; padding: 7px; background: var(--ant-color-bg-container); cursor: pointer; transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
    &:hover { border-color: var(--ant-color-text-quaternary); background: var(--ant-color-fill-tertiary); }
    &.color-group-card-active { border-color: var(--ant-color-primary); background: color-mix(in srgb, var(--ant-color-primary) 8%, var(--ant-color-bg-container)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ant-color-primary) 14%, transparent); }
  }
  .color-group-card-head {
    display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px;
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
    display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--ant-color-bg-layout); border: 1px solid var(--ant-color-border); border-radius: 6px; font-size: 13px; font-weight: 500; color: var(--ant-color-text-secondary); cursor: pointer; transition: all 0.2s; margin-bottom: 8px;
    &:hover { background: var(--ant-color-fill-tertiary); color: var(--ant-color-text); }
    .toggle-icon { font-size: 11px; color: var(--ant-color-text-tertiary); transition: transform 0.2s; }
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
}
.ant-popconfirm { .ant-popconfirm-buttons { .ant-btn-primary { background: #b91c1c; border-color: #b91c1c; &:hover { background: #dc2626; border-color: #dc2626; } } } }
</style>
