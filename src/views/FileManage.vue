<template>
  <div
    class="file-page"
    id="drop-area"
    :style="{ '--theme-color': activeConnectionColor }"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <!-- 拖拽覆盖层 -->
    <div v-if="dragOverState.active && !isInVirtualBucketList" class="drag-overlay">
      <div class="drag-overlay-content">
        <CloudUploadOutlined style="font-size: 48px; color: #1890ff" />
        <p>释放以上传文件到当前目录</p>
      </div>
    </div>

    <div class="app-layout">
      <!-- 左侧 Hotbar -->
      <div
        :class="['hotbar-sidebar', { 'collapsed': sidebarCollapsed }]"
        :style="{ '--sidebar-width': `${sidebarWidth}px` }"
      >
        <div class="hotbar-items">
          <div v-for="(groupConnections, groupName) in groupedConnections" :key="groupName" class="hotbar-group">
            <div class="hotbar-group-header" @click="toggleGroup(String(groupName))">
              <span class="group-name" v-if="!sidebarCollapsed">{{ groupName }}</span>
              <span class="group-icon" v-else>{{ generateIconText(String(groupName)) }}</span>
              <RightOutlined v-if="!sidebarCollapsed" :class="['group-arrow', { 'group-arrow-expanded': !collapsedGroups[String(groupName)] }]" />
            </div>
            <div v-show="!collapsedGroups[String(groupName)]" class="hotbar-group-list">
              <div
                v-for="conn in groupConnections"
                :key="conn.id"
                :class="['hotbar-item', { 'active': activeConnectionId === conn.id }]"
                :style="{ '--tab-color': getConnectionColor(conn.id) }"
                @click="handleHotbarClick(conn.id)"
                @contextmenu.prevent="handleHotbarContextMenu($event, conn)"
              >
                <a-tooltip :title="conn.id" placement="right">
                  <span class="hotbar-badge" :style="{ backgroundColor: getConnectionColor(conn.id), color: getConnectionTextColor(getConnectionColor(conn.id)), opacity: activeConnectionId === conn.id ? 1 : 0.6 }">
                    {{ generateIconText(conn.id) }}
                  </span>
                </a-tooltip>
                <span v-if="!sidebarCollapsed" class="hotbar-name">{{ conn.id }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar bottom settings and collapse -->
        <div class="sidebar-bottom-actions">
          <div class="sidebar-bottom-tools" :class="{ 'collapsed-tools': sidebarCollapsed }">
            <div class="sidebar-settings-wrapper" @mouseenter="configFabHover = true" @mouseleave="configFabHover = false">
              <div class="fab-menu" :class="{ 'fab-menu-visible': configFabHover }">
                <template v-for="target in activeMountTargets" :key="target.id">
                  <div class="fab-menu-item" @click="handleFabTargetToggle(target)">
                    <span class="fab-menu-label">{{ target.pathPrefix ? `${target.bucket}/${target.pathPrefix}` : target.bucket }}</span>
                    <span :class="['fab-dot', { 'fab-dot-on': mountStatusMap[target.id], 'fab-dot-loading': mountLoadingMap[target.id] }]"></span>
                  </div>
                </template>
                <div class="fab-menu-item" v-if="activeMountTargets.length === 0" @click="configDrawerVisible = true">
                  <span class="fab-menu-label">添加挂载</span>
                  <span class="fab-dot" style="background:#d1d5db"></span>
                </div>
                <div class="fab-menu-item" @click="handleFabDefaultToggle">
                  <span class="fab-menu-label">默认</span>
                  <span :class="['fab-dot', { 'fab-dot-on': configStore.defaultTargetId === activeConnectionId }]"></span>
                </div>
                <div class="fab-menu-item" @click="handleToggleFlashUpload">
                  <span class="fab-menu-label">闪传</span>
                  <span :class="['fab-dot', { 'fab-dot-on': settingStore.flashUploadEnabled }]"></span>
                </div>
                <div class="fab-menu-sep"></div>
                <div class="fab-menu-link" @click="configDrawerVisible = true"><SettingOutlined /> 配置</div>
                <div class="fab-menu-link" @click="auditModalVisible = true"><FileTextOutlined /> 日志</div>
                <div class="fab-bridge"></div>
              </div>

              <div class="sidebar-settings-btn" @click="configDrawerVisible = true">
                <SettingOutlined />
              </div>
            </div>

            <div class="sidebar-theme-btn" @click="toggleThemeMode">
              <BulbOutlined v-if="settingStore.themeMode === 'dark'" />
              <BulbFilled v-else />
            </div>
            <div class="sidebar-collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">
              <MenuFoldOutlined v-if="!sidebarCollapsed" />
              <MenuUnfoldOutlined v-else />
            </div>
          </div>
        </div>
        <div
          v-if="!sidebarCollapsed"
          class="sidebar-resize-handle"
          @mousedown.stop.prevent="handleSidebarResizeStart"
        ></div>
      </div>

      <main>
        <!-- 存储标签页 -->
        <div
          v-if="activeTabConnectionIds.length > 0"
          ref="storageTabsRef"
          class="storage-tabs"
          @wheel="handleStorageTabsWheel"
          @mousemove="handleStorageTabsMouseMove"
          @mouseleave="handleStorageTabsMouseLeave"
        >
          <div
            v-for="tabId in activeTabConnectionIds"
            :key="tabId"
            :class="['storage-tab', { 'tab-active': activeConnectionId === tabId }]"
            :style="{ '--tab-color': getConnectionColor(tabId) }"
            @click="handleTabChange(tabId)"
            @contextmenu.prevent.stop="handleTabContextMenu($event, tabId)"
          >
            <span class="tab-badge" :style="{ backgroundColor: getConnectionColor(tabId), color: getConnectionTextColor(getConnectionColor(tabId)), opacity: activeConnectionId === tabId ? 1 : 0.6 }">
              {{ generateIconText(tabId) }}
            </span>
            <a-tooltip :title="tabId" placement="bottom" :mouseEnterDelay="0.35">
              <span class="tab-name">{{ tabId }}</span>
            </a-tooltip>
            <close-outlined class="tab-close-icon" @click.stop="handleCloseTab(tabId)" />
          </div>
        </div>

        <a-empty v-if="connections.length === 0" class="welcome-empty">
          <template #description>
            <span class="welcome-title">欢迎使用 BucketView</span>
            <span class="welcome-desc">请先添加对象存储配置</span>
          </template>
          <a-button type="primary" size="large" @click="configDrawerVisible = true">
            <PlusOutlined /> 添加存储配置
          </a-button>
        </a-empty>

        <a-empty v-else-if="activeTabConnectionIds.length === 0" class="welcome-empty">
          <template #description>
            <span class="welcome-title">已连接</span>
            <span class="welcome-desc">请从左侧栏点击存储配置以打开标签页</span>
          </template>
        </a-empty>

        <template v-if="connections.length > 0 && activeTabConnectionIds.length > 0">
        <div class="file-panel">
          <div class="toolbar">
              <div class="toolbar-search">
                <a-input
                  v-model:value="tableState.searchKeyword"
                  placeholder="搜索文件名"
                  allow-clear
                >
                  <template #prefix><SearchOutlined style="color: #9ca3af" /></template>
                </a-input>
              </div>

              <div class="toolbar-actions">
                <a-button v-if="!isInVirtualBucketList" type="primary" class="upload-btn" @click="handleUpload">
                  <CloudUploadOutlined /> 上传
                </a-button>

                <a-button v-if="!isInVirtualBucketList" type="primary" class="download-btn" :disabled="!tableHasSelected" @click="handleStorageGetObjects()">
                  <DownloadOutlined /> 下载
                </a-button>

                <a-button class="icon-btn" v-if="currentBucketMountStatus === 'mounted'" @click="handleOpenLocalDirectory()" title="打开本地目录">
                  <template #icon><FolderOpenOutlined /></template>
                </a-button>

                <a-button class="icon-btn danger-btn" :disabled="!tableHasSelected" @click="handleStorageDeleteObjects()" title="删除">
                  <template #icon><DeleteOutlined /></template>
                </a-button>

                <a-button
                  :class="['icon-btn', 'flash-btn', { 'flash-btn-active': settingStore.flashUploadEnabled }]"
                  :title="settingStore.flashUploadEnabled ? `闪传已开启 (≥${settingStore.flashUploadThresholdMB || 50}MB)` : '闪传已关闭'"
                  @click="handleToggleFlashUpload"
                >
                  <ThunderboltOutlined />
                </a-button>
              </div>
            </div>

            <div class="breadcrumb-wrapper" @mouseenter="breadcrumbHovering = true" @mouseleave="breadcrumbHovering = false">
              <div class="breadcrumb-nav">
                <span class="breadcrumb-nav-btn breadcrumb-nav-btn-narrow" :class="{ disabled: !canGoBack }" @click="goBack"><ArrowLeftOutlined /></span>
                <span class="breadcrumb-nav-btn breadcrumb-nav-btn-narrow" :class="{ disabled: !canGoForward }" @click="goForward"><ArrowRightOutlined /></span>
                <span class="breadcrumb-nav-btn" @click="handleStorageListObjects('', false, true)" title="刷新"><ReloadOutlined :spin="tableState.refreshing" /></span>
              </div>
              <a-breadcrumb v-if="!breadcrumbEditing">
                <a-breadcrumb-item @click="handleBreadcrumbHome">
                  <a><HomeOutlined /> <template v-if="activeConnectionLabel">{{ activeConnectionLabel }}</template></a>
                </a-breadcrumb-item>
                <a-breadcrumb-item v-if="showVirtualBucketCrumb" @click="handleBreadcrumbVirtualBucket">
                  <a><FolderOutlined /> {{ activeBucket }}</a>
                </a-breadcrumb-item>
                <a-breadcrumb-item
                  v-for="(displayName, i) in breadcrumbVisibleNames"
                  @click="onClickBreadCrumb(tableState.breadcrumbDirectory[i], i)"
                  @mouseenter="breadcrumbExpandedIndex = i"
                  @mouseleave="breadcrumbExpandedIndex = -1"
                >
                  <a :title="tableState.breadcrumbDirectory[i]"><FolderOutlined v-if="displayName" /> {{ displayName }}</a>
                </a-breadcrumb-item>
              </a-breadcrumb>
              <!-- 行内路径编辑：完整路径输入 + 最近跳转历史 -->
              <div v-if="breadcrumbEditing" class="breadcrumb-inline-edit">
                <div class="breadcrumb-edit-shell">
                  <input
                    ref="breadcrumbEditInputRef"
                    v-model="breadcrumbEditValue"
                    class="breadcrumb-edit-input"
                    placeholder="输入路径后回车跳转"
                    @focus="pathHistoryVisible = true"
                    @keydown.enter="handleBreadcrumbEditSubmit"
                    @keydown.esc="breadcrumbEditing = false"
                    @blur="handleBreadcrumbEditBlur"
                  />
                  <div v-if="pathHistoryVisible && filteredPathHistorySuggestions.length > 0" class="breadcrumb-history-popup">
                    <div
                      v-for="path in filteredPathHistorySuggestions"
                      :key="path"
                      class="breadcrumb-history-item"
                      @mousedown.prevent="handlePathHistorySelect(path)"
                    >
                      <FolderOutlined />
                      <span class="breadcrumb-history-path">{{ path }}</span>
                      <button class="breadcrumb-history-delete" aria-label="删除历史" @mousedown.stop.prevent="removePathHistory(path)">
                        <CloseOutlined />
                      </button>
                    </div>
                  </div>
                </div>
                <span class="breadcrumb-edit-go" @mousedown.prevent="handleBreadcrumbEditSubmit">前往</span>
              </div>
              <span v-if="tableState.loading && !breadcrumbEditing" class="breadcrumb-spin" />
              <div v-if="breadcrumbHovering && !breadcrumbEditing" class="breadcrumb-actions">
                <span class="breadcrumb-action-btn" @click="handleBreadcrumbCopy" title="复制路径"><CopyOutlined /></span>
                <span class="breadcrumb-action-btn" @click="handleBreadcrumbEdit" title="编辑路径"><EditOutlined /></span>
              </div>
            </div>

            <div ref="tableWrapperRef" class="table-wrapper" @contextmenu="handleBlankAreaContextMenu">
              <a-spin :spinning="tableState.loading">
                <template #indicator>
                  <div class="content-custom-loader">
                    <div class="content-loader-ring"></div>
                    <div class="content-loader-ring"></div>
                    <div class="content-loader-ring"></div>
                    <div class="content-loader-text">Loading...</div>
                  </div>
                </template>
                <div class="table-content" :class="{ 'table-content-hidden': tableState.loading }">
                  <a-table
                    :columns="tableColumns"
                    :data-source="paginatedSource"
                    rowKey="objectName"
                    :pagination="false"
                    :locale="tableLocale"
                    :scroll="{ y: tableScrollHeight }"
                    :row-selection="{ selectedRowKeys: tableState.selectedRowKeys, onChange: handleFileTableRowSelection, onSelect: handleFileTableRowSelect }"
                    :customRow="(record: ObjectInfo) => customTableRow(record)"
                  >
                    <template #bodyCell="{ column, record }">
                      <template v-if="column.dataIndex === 'name'">
                        <a
                          v-if="record.type === 'directory'"
                          class="file-name file-name-directory"
                          @mouseenter="(e: MouseEvent) => handleNavPopupHover(record, e)"
                          @mouseleave="(e: MouseEvent) => handleNavPopupLeave(e)"
                        >
                          <FolderOutlined class="file-icon folder-icon" />
                          <span>{{ record.name }}</span>
                          <span
                            v-if="isInVirtualBucketList && bucketMountInfoMap[record.objectName]"
                            :class="['bucket-mount-tag', { 'bucket-mount-tag-mounted': bucketMountInfoMap[record.objectName].mounted, 'bucket-mount-tag-loading': bucketMountInfoMap[record.objectName].loading }]"
                            :title="bucketMountInfoMap[record.objectName].mounted ? `已挂载` : bucketMountInfoMap[record.objectName].loading ? '操作中' : `未挂载`"
                          >{{ bucketMountInfoMap[record.objectName].mountPoint }}</span>
                        </a>
                        <span v-else class="file-name">
                          <component :is="getFileIcon(record.name)" class="file-icon" />
                          <span>{{ record.name }}</span>
                        </span>
                      </template>
                      <template v-if="column.dataIndex === 'action'">
                        <span class="action-column">
                          <template v-if="record.type === 'directory'">
                            <CloudUploadOutlined v-if="!isInVirtualBucketList" style="margin-right: 8px" @click="handleUploadToDirectory(record)" title="上传到此目录" />
                            <DownloadOutlined v-if="!isInVirtualBucketList" style="margin-right: 8px" @click="handleStorageGetObject(record)" />
                          </template>
                          <template v-else>
                            <EyeOutlined style="margin-right: 8px" @click="handlePreviewObject(record)" />
                            <DownloadOutlined style="margin-right: 8px" @click="handleStorageGetObject(record)" />
                            <ShareAltOutlined style="margin-right: 8px" @click="handleStorageSignObject(record.objectName)" />
                          </template>
                          <DeleteOutlined @click="handleStorageDeleteObjects([record.objectName])" />
                        </span>
                      </template>
                    </template>
                  </a-table>
                </div>
              </a-spin>

              <div ref="customPaginationRef" class="custom-pagination">
                <div class="status-bar">
                  <span class="status-item"><FolderOutlined /> {{ directoryCount }} 个目录</span>
                  <span class="status-item"><FileOutlined /> {{ fileCount }} 个文件</span>
                  <span class="status-item" v-if="listLoadingMore">
                    <LoadingOutlined spin /> 继续加载中…
                    <template v-if="listLoadedPages > 0">（第 {{ listLoadedPages }} 批）</template>
                    <a class="status-cancel-load" @click.stop="cancelBackgroundListLoad">停止</a>
                  </span>
                  <span class="status-item" v-else-if="tableState.nextContinuationToken">还有更多对象可加载</span>
                  <span class="status-item" v-if="currentDirectoryTotalSize > 0"><DatabaseOutlined /> {{ formatDirectorySize }}</span>
                  <span class="status-item status-endpoint" v-if="activeConnectionEndpoint" :title="activeConnectionEndpoint">
                    <InfoCircleOutlined /> {{ activeConnectionEndpoint }}
                  </span>
                  <span class="status-item status-scope" v-if="activeConnectionScope" :title="activeConnectionScope">
                    <FolderOutlined /> {{ activeConnectionScope }}
                  </span>
                  <span class="status-item status-selected" v-if="tableHasSelected">
                    <CheckSquareOutlined /> 已选 {{ tableState.selectedRowKeys.length }}
                  </span>
                  <template v-if="!isInVirtualBucketList && currentBucketMountStatus !== 'none'">
                    <span class="status-item">
                      <span class="mount-indicator" :class="{ 'mounted': currentBucketMountStatus === 'mounted', 'mount-loading': currentBucketMountStatus === 'loading' }"></span>
                      {{ currentBucketMountStatus === 'loading' ? '操作中...' : currentBucketMountStatus === 'mounted' ? `已挂载 ${currentBucketMountPoint}` : '未挂载' }}
                    </span>
                    <span class="status-item vfs-sync-badge" v-if="currentBucketMountStatus === 'mounted' && vfsSyncState !== 'idle'"
                      :class="{ 'vfs-syncing': vfsSyncState === 'syncing', 'vfs-synced': vfsSyncState === 'synced', 'vfs-failed': vfsSyncState === 'failed' }">
                      <span class="vfs-sync-dot" :class="vfsSyncState"></span>
                      {{ vfsSyncState === 'syncing' ? '同步中' : vfsSyncState === 'synced' ? '已同步' : '同步异常' }}
                    </span>
                    <a-tooltip v-if="vfsSyncState === 'failed' && vfsFailedFiles.length > 0" placement="topRight">
                      <template #title>
                        <div class="vfs-failed-popup">
                          <div class="vfs-failed-title">同步异常文件</div>
                          <div v-for="f in vfsFailedFiles" class="vfs-failed-item">{{ f }}</div>
                        </div>
                      </template>
                      <span class="vfs-failed-trigger"><QuestionCircleOutlined /></span>
                    </a-tooltip>
                  </template>
                </div>
                <a-pagination
                  v-if="settingStore.listLoadMode !== 'waterfall'"
                  :total="filteredSourceLength"
                  v-model:current="paginationState.current"
                  v-model:pageSize="paginationState.pageSize"
                  :pageSizeOptions="['10', '20', '50', '100']"
                  show-less-items
                  show-size-changer
                  @change="handlePaginationChange"
                  @showSizeChange="handlePaginationSizeChange"
                />
              </div>
            </div>
          </div>

        <!-- 右键菜单 -->
        <div
          v-if="contextMenuState.visible"
          class="context-menu"
          :style="{ left: contextMenuState.x + 'px', top: contextMenuState.y + 'px' }"
        >
          <!-- 空白区域右键菜单 -->
          <template v-if="contextMenuState.isBlankArea">
            <div class="context-menu-item" @click="handleStorageListObjects('', false, true); hideContextMenu()">
              <ReloadOutlined /> 刷新
            </div>
            <div class="context-menu-item" v-if="tableHasSelected" @click="handleFileTableRowSelection([], []); hideContextMenu()">
              <CloseSquareOutlined /> 取消
            </div>
            <div class="context-menu-item" @click="handleSelectAll">
              <CheckSquareOutlined /> 全选
            </div>
            <div class="context-menu-item" v-if="tableHasSelected" @click="handleInvertSelection">
              <SwapOutlined style="transform: rotate(90deg)" /> 反选
            </div>
            <div class="context-menu-item" v-if="!isInVirtualBucketList" @click="handleUpload(); hideContextMenu()">
              <CloudUploadOutlined /> 上传
            </div>
            <div class="context-menu-item" v-if="tableHasSelected && !isInVirtualBucketList" @click="handleStorageGetObjects(); hideContextMenu()">
              <CloudDownloadOutlined /> 下载
            </div>
            <div class="context-menu-item" v-if="tableHasSelected" @click="handleStorageDeleteObjects(); hideContextMenu()">
              <DeleteOutlined /> 删除
            </div>
            <div class="context-menu-item" v-if="currentBucketMountStatus === 'mounted'" @click="handleOpenLocalDirectory(); hideContextMenu()">
              <FolderOpenOutlined /> 打开本地位置
            </div>
          </template>
          <!-- 文件/目录右键菜单 -->
          <template v-if="!contextMenuState.isBlankArea">
            <!-- 多选模式：仅显示批量操作 -->
            <template v-if="tableHasSelected && tableState.selectedRowKeys.length > 1">
              <div class="context-menu-item" @click="handleStorageListObjects('', false, true); hideContextMenu()">
                <ReloadOutlined /> 刷新
              </div>
              <div class="context-menu-item" @click="handleFileTableRowSelection([], []); hideContextMenu()">
                <CloseSquareOutlined /> 取消
              </div>
              <div class="context-menu-item" v-if="!isInVirtualBucketList" @click="handleStorageGetObjects(); hideContextMenu()">
                <CloudDownloadOutlined /> 下载
              </div>
              <div class="context-menu-item" @click="handleStorageDeleteObjects(); hideContextMenu()">
                <DeleteOutlined /> 删除
              </div>
            </template>
            <!-- 单选模式：显示完整操作 -->
            <template v-if="!tableHasSelected || tableState.selectedRowKeys.length <= 1">
              <div class="context-menu-item" @click="handleStorageListObjects('', false, true); hideContextMenu()">
                <ReloadOutlined /> 刷新
              </div>
              <div class="context-menu-item" v-if="tableHasSelected" @click="handleFileTableRowSelection([], []); hideContextMenu()">
                <CloseSquareOutlined /> 取消
              </div>
              <div class="context-menu-item" v-if="contextMenuState.target && contextMenuState.target.type !== 'directory'" @click="handlePreviewObject(contextMenuState.target); hideContextMenu()">
                <EyeOutlined /> 预览
              </div>
              <div class="context-menu-item" v-if="currentBucketMountStatus === 'mounted' && contextMenuState.target && contextMenuState.target.type !== 'directory'" @click="handleLocalPreview(contextMenuState.target); hideContextMenu()">
                <PlayCircleOutlined /> 本地打开
              </div>
              <div class="context-menu-item" v-if="contextMenuState.target && !(isInVirtualBucketList && contextMenuState.target.type === 'directory')" @click="handleStorageGetObject(contextMenuState.target); hideContextMenu()">
                <DownloadOutlined /> 下载
              </div>
              <div class="context-menu-item" v-if="contextMenuState.target && contextMenuState.target.type === 'directory'" @click="handleUploadToDirectory(contextMenuState.target); hideContextMenu()">
                <CloudUploadOutlined /> 上传到此目录
              </div>
              <div class="context-menu-item" v-if="contextMenuState.target && contextMenuState.target.type !== 'directory'" @click="handleStorageSignObject(contextMenuState.target.objectName); hideContextMenu()">
                <ShareAltOutlined /> 分享
              </div>
              <div class="context-menu-item" v-if="contextMenuState.target" @click="handleCopyObjectPath(contextMenuState.target); hideContextMenu()">
                <CopyOutlined /> 复制路径
              </div>
              <div class="context-menu-item" v-if="currentBucketMountStatus === 'mounted' && contextMenuState.target" @click="handleShowLocalFile(contextMenuState.target); hideContextMenu()">
                <FolderOpenOutlined /> 打开本地位置
              </div>
              <div class="context-menu-item" @click="handleStorageDeleteObjects(contextMenuState.target ? [contextMenuState.target.objectName] : []); hideContextMenu()">
                <DeleteOutlined /> 删除
              </div>
            </template>
          </template>
        </div>
      </template>

      <a-modal
        v-model:open="mkdirModalState.visible"
        title="创建目录"
        ok-text="确认"
        cancel-text="取消"
        @ok="handleStorageCreateDirectory"
        destroyOnClose
      >
        <a-form :model="mkdirModalState">
          <a-form-item
            name="directoryPath"
            lable="directory path"
            :rules="[
              {
                required: true,
                message: '不能为空',
              },
              domainPathValidationRule,
            ]"
          >
            <a-input v-model:value="mkdirModalState.directoryPath" v-focus />
          </a-form-item>
        </a-form>
      </a-modal>

      <teleport to="body">
        <div v-if="isPreviewShellVisible" class="preview-shell-mask" @mousedown.self="closePreviewShell">
          <section :class="previewShellClass" :style="previewShellStyle" @mousedown.stop>
            <header class="preview-shell-header" @mousedown.stop="handlePreviewDragStart" @dblclick.stop="togglePreviewMaximized">
              <div class="preview-modal-header-info">
                <span class="preview-modal-title">{{ previewShellTitle }}</span>
                <span v-if="previewShellSize" class="preview-modal-size">{{ previewShellSize }}</span>
                <span v-if="previewModalState.fileType === 'image' && galleryImages.length > 1" class="preview-modal-counter">{{ imageGalleryRef?.currentIndex + 1 }} / {{ galleryImages.length }}</span>
              </div>
              <div class="preview-modal-actions">
                <button class="preview-modal-action" :title="previewModalLayout.maximized ? '取消最大化' : '最大化'" @mousedown.stop @click.stop="togglePreviewMaximized">
                  <FullscreenExitOutlined v-if="previewModalLayout.maximized" />
                  <FullscreenOutlined v-else />
                </button>
                <button class="preview-modal-action" title="关闭" @mousedown.stop @click.stop="closePreviewShell">
                  <CloseOutlined />
                </button>
              </div>
            </header>
            <div class="preview-shell-body" :style="previewShellBodyStyle">
              <image-gallery
                v-if="previewModalState.fileType === 'image'"
                ref="imageGalleryRef"
                :images="galleryImages"
                :start-index="galleryStartIndex"
              />
              <div v-else-if="previewModalState.fileType === 'video'" class="video-preview">
                <video-player :src="previewModalState.previewFilePath" />
              </div>
              <div v-else-if="previewModalState.fileType === 'audio'" class="audio-preview">
                <div class="audio-icon"><CustomerServiceOutlined style="font-size: 48px; color: var(--preview-text-muted)" /></div>
                <audio controls :src="previewModalState.previewFilePath" class="audio-player" />
              </div>
              <div v-else-if="previewModalState.fileType === 'pdf'" class="pdf-preview">
                <pdf :src="previewModalState.previewFilePath" />
              </div>
              <model-viewer v-else-if="previewModalState.fileType === 'model'" :src="previewModalState.previewFilePath" />
              <div v-else-if="previewModalState.fileType === 'office'" :class="['office-preview', { 'office-presentation-mode': officePresentationMode }]">
                <div class="office-preview-toolbar" @mousedown.stop>
                  <a-tooltip title="回到顶部">
                    <button class="office-preview-action" @click.stop="scrollOfficePreview('top')">
                      <ArrowUpOutlined />
                    </button>
                  </a-tooltip>
                  <a-tooltip title="滚到底部">
                    <button class="office-preview-action" @click.stop="scrollOfficePreview('bottom')">
                      <ArrowDownOutlined />
                    </button>
                  </a-tooltip>
                  <a-tooltip v-if="['pptx', 'ppt'].includes(previewModalState.fileExtension.toLowerCase())" :title="officePresentationMode ? '退出放映' : '放映模式'">
                    <button :class="['office-preview-action', 'office-preview-action-primary', { active: officePresentationMode }]" @click.stop="toggleOfficePresentationMode">
                      <FullscreenExitOutlined v-if="officePresentationMode" />
                      <PlayCircleOutlined v-else />
                    </button>
                  </a-tooltip>
                </div>
                <div ref="officePreviewScrollRef" class="office-preview-scroll">
                  <vue-office-docx v-if="['docx', 'doc'].includes(previewModalState.fileExtension.toLowerCase())" :key="`docx-${officePreviewRenderKey}-${previewModalState.previewFilePath}`" :src="previewModalState.previewFilePath" />
                  <vue-office-excel v-else-if="['xlsx', 'xls', 'csv'].includes(previewModalState.fileExtension.toLowerCase())" :key="`excel-${officePreviewRenderKey}-${previewModalState.previewFilePath}`" :src="previewModalState.previewFilePath" :options="officePreviewExcelOptions" />
                  <vue-office-pptx v-else-if="['pptx', 'ppt'].includes(previewModalState.fileExtension.toLowerCase())" :key="`pptx-${officePreviewRenderKey}-${previewModalState.previewFilePath}`" :src="previewModalState.previewFilePath" :options="officePreviewPptOptions" />
                  <div v-else class="office-preview-empty">不支持的 Office 格式预览</div>
                </div>
              </div>
              <text-editor
                v-else-if="previewModalState.fileType === 'text'"
                ref="textEditorRef"
                :src="previewModalState.previewFilePath"
                :language="previewModalState.fileExtension"
                :editable="!previewModalState.chunked"
                :chunked="previewModalState.chunked"
                :fileSize="previewModalState.fileSize"
                :theme-mode="settingStore.themeMode"
                @save="handleTextSaveContent"
                @dirty-change="textEditorDirty = $event"
              />
            </div>
            <footer v-if="previewModalState.fileType === 'text'" class="preview-shell-footer">
              <template v-if="previewModalState.chunked">
                <span class="text-editor-header-hint chunk-progress-hint">
                  <a-spin v-if="textEditorRef?.chunkLoading" size="small" :indicator="null" style="font-size:10px" />
                  {{ textEditorRef?.partialInfo }}
                </span>
                <span v-if="textEditorDirty" class="text-editor-header-hint unsaved-hint">无法保存</span>
                <span v-if="textEditorRef?.loadLimitReached" class="text-editor-header-hint limit-hint">浏览上限</span>
                <button v-if="textEditorDirty || textEditorRef?.loadLimitReached" class="preview-footer-button" @click="handleStorageGetObject(previewModalState.objectInfo!); previewModalState.visible = false">
                  <DownloadOutlined /> 下载至本地
                </button>
              </template>
              <template v-else>
                <span class="text-editor-header-hint" :class="{ 'dirty': textEditorDirty }">
                  <span v-if="textEditorDirty" class="dirty-dot"></span>Ctrl+S 保存
                </span>
              </template>
            </footer>
            <span v-if="!previewModalLayout.maximized" class="preview-resize-handle" @mousedown.prevent.stop="handlePreviewResizeStart"></span>
          </section>
        </div>
      </teleport>

      <!-- 不支持预览 -->
      <a-modal
        :open="previewModalState.visible && previewModalState.fileType === ''"
        :footer="null"
        :width="400"
        destroyOnClose
        rootClassName="preview-modal-wrap"
        :class="['preview-modal']"
        :dialogStyle="{ top: 'calc(50vh - 120px)' }"
        @cancel="previewModalState.visible = false"
      >
        <div class="unsupported-preview">
          <FileUnknownOutlined style="font-size: 36px; color: #9ca3af" />
          <p>该文件格式暂不支持在线预览</p>
          <div class="unsupported-preview-actions">
            <a-button class="unsupported-download-btn" type="primary" size="small" @click="handleStorageGetObject(previewModalState.objectInfo as any); previewModalState.visible = false">
              <DownloadOutlined /> 下载至本地
            </a-button>
            <a-button v-if="currentBucketMountStatus === 'mounted'" size="small" @click="handleLocalPreview(previewModalState.objectInfo as any); previewModalState.visible = false">
              <FolderOpenOutlined /> 使用本地预览
            </a-button>
            <a-dropdown :trigger="['click']">
              <a-button size="small">
                打开为 <DownOutlined />
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item key="text" @click="forcePreviewAsText(previewModalState.objectInfo)">
                    <FileTextOutlined /> 文本
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </div>
      </a-modal>

      <TransferDrawer
        v-model:open="transferDrawerVisible"
        :ensure-record-context="ensureTransferRecordContext"
      />
      </main>
    </div>

    <!-- 导航 Popup 链（置于顶层，避免 overflow:hidden 裁剪） -->
    <template v-for="(popup, idx) in navPopupChain" :key="popup.prefix + idx">
      <div
        v-if="!popup.loading || navPopupLoadingVisible[idx]"
        class="nav-popup"
        :class="{ 'nav-popup-loading': popup.loading }"
        :style="[
          popup.bounceLeft ? { right: popup.rightOffset + 'px' } : { left: popup.x + 'px' },
          popup.bounceUp ? { bottom: popup.bottomOffset + 'px' } : { top: popup.y + 'px' },
        ]"
        @mouseenter="handleNavPopupEnter()"
        @mouseleave="handleNavPopupLeaveEvent()"
      >
        <div v-if="popup.loading" class="nav-popup-loading-indicator">
          <LoadingOutlined />
        </div>
        <div
          v-for="item in popup.items"
          :class="['nav-popup-item', { 'nav-popup-item-active': popup.activeItemObjectName === item.objectName }]"
          @mouseenter="handleNavPopupItemEnter(item, idx, $event)"
          @mouseleave="handleNavPopupItemLeave()"
          @mousemove="handleNavPopupItemMove($event)"
          @click="handleNavPopupClick(item)"
        >
          <FolderOutlined class="nav-popup-item-icon" />
          <span
            class="nav-popup-item-name"
            :title="item.name.length > popup.maxDisplayLen ? item.name : undefined"
          >{{ item.name.length > popup.maxDisplayLen ? item.name.slice(0, popup.maxDisplayLen) + '…' : item.name }}</span>
          <LeftOutlined v-if="item.hasSubDirs && popup.bounceLeft" class="nav-popup-item-arrow" />
          <RightOutlined v-if="item.hasSubDirs && !popup.bounceLeft" class="nav-popup-item-arrow" />
        </div>
      </div>
    </template>

    <!-- 左下角配置按钮已整合至侧边栏底部 -->

    <!-- 配置中心 Drawer -->
    <ConfigDrawer ref="configDrawerRef" v-model:open="configDrawerVisible" @mountChanged="refreshMountStatus" />

    <!-- 审计日志 -->
    <AuditLogModal v-model:open="auditModalVisible" />

    <!-- Active Tab Context Menu -->
    <div
      v-if="tabContextMenu.visible"
      class="context-menu"
      :style="{ top: `${tabContextMenu.y}px`, left: `${tabContextMenu.x}px` }"
    >
      <div class="context-menu-item" @click="handleTabMenuClose(); hideTabContextMenu()">
        <CloseOutlined /> 关闭
      </div>
      <div class="context-menu-item" v-if="canCloseTabLeft" @click="handleTabMenuCloseLeft(); hideTabContextMenu()">
        <LeftOutlined /> 关闭左侧
      </div>
      <div class="context-menu-item" v-if="canCloseTabRight" @click="handleTabMenuCloseRight(); hideTabContextMenu()">
        <RightOutlined /> 关闭右侧
      </div>
      <div class="context-menu-item" v-if="activeTabConnectionIds.length > 1" @click="handleTabMenuCloseOthers(); hideTabContextMenu()">
        <SwapOutlined /> 关闭其他
      </div>
      <div class="context-menu-item" @click="handleTabMenuCloseAll(); hideTabContextMenu()">
        <CloseSquareOutlined /> 关闭所有
      </div>
    </div>

    <!-- Sidebar Context Menu -->
    <div
      v-if="hotbarContextMenu.visible"
      class="context-menu"
      :style="{ top: `${hotbarContextMenu.y}px`, left: `${hotbarContextMenu.x}px` }"
    >
      <div class="context-menu-item" v-if="!activeTabConnectionIds.includes(hotbarContextMenu.conn?.id)" @click="handleHotbarClick(hotbarContextMenu.conn?.id); hideHotbarContextMenu()">
        <SwapOutlined /> 连接
      </div>
      <div class="context-menu-item" @click="handleHotbarMenuEdit(hotbarContextMenu.conn); hideHotbarContextMenu()">
        <EditOutlined /> 编辑
      </div>
      <div class="context-menu-item" @click="handleHotbarMenuGroup(hotbarContextMenu.conn); hideHotbarContextMenu()">
        <FolderOpenOutlined /> 设置分组
      </div>
      <div class="context-menu-item" @click="handleHotbarMenuMount(hotbarContextMenu.conn); hideHotbarContextMenu()" v-if="hasMounts(hotbarContextMenu.conn)">
        <LinkOutlined /> 挂载
      </div>
      <div class="context-menu-item" v-if="activeTabConnectionIds.includes(hotbarContextMenu.conn?.id)" @click="handleCloseTab(hotbarContextMenu.conn?.id); hideHotbarContextMenu()">
        <CloseOutlined /> 关闭连接
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent, reactive, computed, onMounted, onUnmounted, watch, ref, shallowRef, triggerRef, createVNode, nextTick, toRaw } from 'vue';
import { AutoComplete, Modal, TableColumnType, notification, theme } from 'ant-design-vue';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  DownOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
  ReloadOutlined,
  FolderAddOutlined,
  ExportOutlined,
  SwapOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  CopyOutlined,
  EditOutlined,
  FileOutlined,
  FolderOutlined,
  ExclamationCircleOutlined,
  HomeOutlined,
  SearchOutlined,
  ShareAltOutlined,
  InfoCircleOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileZipOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
  SoundOutlined,
  CodeOutlined,
  DatabaseOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ThunderboltOutlined,
  SettingOutlined,
  PlusOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  CheckSquareOutlined,
  CloseSquareOutlined,
  CustomerServiceOutlined,
  FileUnknownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  RightOutlined,
  LeftOutlined,
  LoadingOutlined,
  WarningOutlined,
  QuestionCircleOutlined,
  CloseOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BulbOutlined,
  BulbFilled,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons-vue';
import { domainPathValidationRule } from '../common/validationRule';
import {
  ObjectInfo,
  PreloadStorage,
  PreloadNative,
  PreloadFuse,
  PreloadPreviewWindow,
  PreviewDownloadRequest,
  PreviewFileType,
  PreviewTextSaveRequest,
  PreviewThemeTokens,
  PreviewWindowPayload,
  ListObjectsResponse,
  SignObjectResponse,
  Connection,
} from '../../electron/preload/types';
import StringUtil from '../common/stringUtil';
import { v4 as uuidv4 } from 'uuid';
import { defaultStorage, useConfigStore } from '../store/config';
import { sortObjectInfos } from '../common/object-list';
import { useSettingStore } from '../store/setting';
import { useTransferStore, TransferInfo } from '../store/transfer';
import { useAuditStore } from '../store/audit';
import _ from 'lodash';
import { getFileExtenstion, getFileType } from '../common/file';
import ImageGallery from './ImageGallery.vue';
import ConfigDrawer from './ConfigDrawer.vue';
import TransferDrawer from './TransferDrawer.vue';
import AuditLogModal from './AuditLogModal.vue';

const VideoPlayer = defineAsyncComponent(() => import('./VideoPlayer.vue'));
const pdf = defineAsyncComponent(() => import('./PdfViewer.vue'));
const TextEditor = defineAsyncComponent(() => import('./TextEditor.vue'));
const ModelViewer = defineAsyncComponent(() => import('./ModelViewer.vue'));
const VueOfficeDocx = defineAsyncComponent(() => import('./components/office/DocxPreview.vue'));
const VueOfficeExcel = defineAsyncComponent(() => import('./components/office/ExcelPreview.vue'));
const VueOfficePptx = defineAsyncComponent(() => import('./components/office/PptxPreview.vue'));

interface NavPopupCacheEntry {
  dirs: NavPopupItem[];
  timestamp: number;
}
const navPopupCache = new Map<string, NavPopupCacheEntry>();
const NAV_POPUP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

type Key = string | number;

export default defineComponent({
  components: {
    ReloadOutlined,
    FolderAddOutlined,
    ExportOutlined,
    SwapOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EyeOutlined,
    CopyOutlined,
    EditOutlined,
    ShareAltOutlined,
    FileOutlined,
    HomeOutlined,
    FolderOutlined,
    SearchOutlined,
    InfoCircleOutlined,
    FileImageOutlined,
    FilePdfOutlined,
    FileExcelOutlined,
    FileWordOutlined,
    FileZipOutlined,
    FileTextOutlined,
    VideoCameraOutlined,
    SoundOutlined,
    CodeOutlined,
    DatabaseOutlined,
    CheckCircleFilled,
    CloseCircleFilled,
    ThunderboltOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    DownOutlined,
    CloudUploadOutlined,
    CloudDownloadOutlined,
    SettingOutlined,
    PlusOutlined,
    FolderOpenOutlined,
    PlayCircleOutlined,
    CheckSquareOutlined,
    CloseSquareOutlined,
    CustomerServiceOutlined,
    FileUnknownOutlined,
    ArrowLeftOutlined,
    ArrowRightOutlined,
    RightOutlined,
    LeftOutlined,
    LoadingOutlined,
    WarningOutlined,
    QuestionCircleOutlined,
    CloseOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    BulbOutlined,
    BulbFilled,
    FullscreenOutlined,
    FullscreenExitOutlined,
    ConfigDrawer,
    TransferDrawer,
    AuditLogModal,
    VideoPlayer,
    TextEditor,
    ImageGallery,
    ModelViewer,
    pdf,
    VueOfficeDocx,
    VueOfficeExcel,
    VueOfficePptx,
  },
  directives: {
    focus: {
      mounted(el: HTMLElement) {
        el.focus();
      },
    },
  },
  setup() {
    const configStore = useConfigStore();
    const settingStore = useSettingStore();
    const { token: designToken } = theme.useToken();
    const transferStore = useTransferStore();
    const auditStore = useAuditStore();
    const storage = (window as any).storage as PreloadStorage;
    const native = (window as any).native as PreloadNative;
    const previewWindow = (window as any).previewWindow as PreloadPreviewWindow | undefined;
    const activeExternalPreviewId = ref('');
    let previewSequence = 0;
    let removePreviewSaveListener: (() => void) | undefined;
    let removePreviewDownloadListener: (() => void) | undefined;

    const auditModalVisible = ref(false);

    const connections = computed(() => configStore.enabledConnections);

    const groupedConnections = computed(() => {
      const groups: Record<string, typeof connections.value> = {};
      connections.value.forEach(conn => {
        const groupName = conn.group || '默认分组';
        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        groups[groupName].push(conn);
      });
      return groups;
    });

    const existingGroupOptions = computed(() => {
      const groups = new Set<string>();
      configStore.connections.forEach(conn => {
        if (conn.group) groups.add(conn.group);
      });
      return Array.from(groups).map(group => ({ value: group }));
    });

    const collapsedGroups = ref<Record<string, boolean>>({});
    const toggleGroup = (groupName: string) => {
      collapsedGroups.value[groupName] = !collapsedGroups.value[groupName];
    };

    const activeConnectionId = computed(() => configStore.activeConnectionId);

    const activeTabConnectionIds = computed(() => configStore.activeTabConnectionIds);
    const DEFAULT_SIDEBAR_WIDTH = 160;
    const MIN_SIDEBAR_WIDTH = 120;
    const MAX_SIDEBAR_WIDTH = 280;
    const sidebarCollapsed = ref(false);
    const sidebarWidth = ref(DEFAULT_SIDEBAR_WIDTH);
    let sidebarResizeStartX = 0;
    let sidebarResizeStartWidth = DEFAULT_SIDEBAR_WIDTH;

    const generateIconText = (name: string) => {
      if (!name) return '';
      const parts = name.split(/[-_\s]+/);
      if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    };

    const toggleThemeMode = () => {
      settingStore.setThemeMode(settingStore.themeMode === 'dark' ? 'light' : 'dark');
    };

    const handleHotbarClick = (connectionId?: string) => {
      if (!connectionId) return;
      configStore.openTab(connectionId);
    };

    const handleCloseTab = (connectionId?: string) => {
      if (!connectionId) return;
      configStore.closeTab(connectionId);
    };

    const tabContextMenu = reactive({
      visible: false,
      x: 0,
      y: 0,
      tabId: '',
    });

    const clampMenuPosition = (state: { x: number; y: number }, selector: string = '.context-menu') => {
      nextTick(() => {
        const menus = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
        const el = menus[menus.length - 1];
        if (!el) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const menuW = el.offsetWidth;
        const menuH = el.offsetHeight;
        let x = state.x;
        let y = state.y;
        if (x + menuW > vw - 4) x = vw - menuW - 4;
        if (y + menuH > vh - 4) y = vh - menuH - 4;
        if (x < 4) x = 4;
        if (y < 4) y = 4;
        state.x = x;
        state.y = y;
      });
    };

    const handleTabContextMenu = (e: MouseEvent, tabId: string) => {
      closeAllNavPopups();
      hideContextMenu();
      hideHotbarContextMenu();
      tabContextMenu.tabId = tabId;
      tabContextMenu.x = e.clientX;
      tabContextMenu.y = e.clientY;
      tabContextMenu.visible = true;
      clampMenuPosition(tabContextMenu);
    };

    const hideTabContextMenu = () => {
      tabContextMenu.visible = false;
      tabContextMenu.tabId = '';
    };

    const tabContextIndex = computed(() => activeTabConnectionIds.value.indexOf(tabContextMenu.tabId));
    const canCloseTabLeft = computed(() => tabContextIndex.value > 0);
    const canCloseTabRight = computed(() => tabContextIndex.value >= 0 && tabContextIndex.value < activeTabConnectionIds.value.length - 1);

    const replaceOpenTabs = (nextTabs: string[], preferredActiveId?: string, fallbackIndex: number = 0) => {
      configStore.activeTabConnectionIds = [...nextTabs];
      if (nextTabs.length === 0) {
        configStore.activeConnectionId = '';
        return;
      }
      if (preferredActiveId && nextTabs.includes(preferredActiveId)) {
        configStore.activeConnectionId = preferredActiveId;
        return;
      }
      if (nextTabs.includes(configStore.activeConnectionId)) return;
      const nextIndex = Math.min(Math.max(fallbackIndex, 0), nextTabs.length - 1);
      configStore.activeConnectionId = nextTabs[nextIndex];
    };

    const handleTabMenuClose = () => {
      const tabs = [...activeTabConnectionIds.value];
      const index = tabs.indexOf(tabContextMenu.tabId);
      if (index < 0) return;
      const nextTabs = tabs.filter(id => id !== tabContextMenu.tabId);
      replaceOpenTabs(nextTabs, nextTabs[index] || nextTabs[index - 1], index);
    };

    const handleTabMenuCloseLeft = () => {
      const index = tabContextIndex.value;
      if (index <= 0) return;
      const nextTabs = activeTabConnectionIds.value.slice(index);
      replaceOpenTabs(nextTabs, tabContextMenu.tabId, 0);
    };

    const handleTabMenuCloseRight = () => {
      const index = tabContextIndex.value;
      if (index < 0) return;
      const nextTabs = activeTabConnectionIds.value.slice(0, index + 1);
      replaceOpenTabs(nextTabs, tabContextMenu.tabId, index);
    };

    const handleTabMenuCloseOthers = () => {
      if (!tabContextMenu.tabId) return;
      replaceOpenTabs([tabContextMenu.tabId], tabContextMenu.tabId, 0);
    };

    const handleTabMenuCloseAll = () => {
      replaceOpenTabs([], '', 0);
    };

    const storageTabsRef = ref<HTMLElement | null>(null);
    let storageTabsPanFrame: number | null = null;
    let storageTabsTargetLeft = 0;

    const getStorageTabsMaxScroll = () => {
      const el = storageTabsRef.value;
      if (!el) return 0;
      return Math.max(0, el.scrollWidth - el.clientWidth);
    };

    const cancelStorageTabsPan = () => {
      if (storageTabsPanFrame !== null) {
        cancelAnimationFrame(storageTabsPanFrame);
        storageTabsPanFrame = null;
      }
    };

    const scheduleStorageTabsScroll = (targetLeft: number) => {
      const el = storageTabsRef.value;
      if (!el) return;
      const maxScroll = getStorageTabsMaxScroll();
      if (maxScroll <= 0) return;
      storageTabsTargetLeft = Math.min(maxScroll, Math.max(0, targetLeft));
      if (storageTabsPanFrame !== null) return;

      const step = () => {
        const currentEl = storageTabsRef.value;
        if (!currentEl) {
          storageTabsPanFrame = null;
          return;
        }
        const diff = storageTabsTargetLeft - currentEl.scrollLeft;
        if (Math.abs(diff) < 0.5) {
          currentEl.scrollLeft = storageTabsTargetLeft;
          storageTabsPanFrame = null;
          return;
        }
        currentEl.scrollLeft += diff * 0.22;
        storageTabsPanFrame = requestAnimationFrame(step);
      };

      storageTabsPanFrame = requestAnimationFrame(step);
    };

    const handleStorageTabsWheel = (e: WheelEvent) => {
      const el = storageTabsRef.value;
      if (!el || getStorageTabsMaxScroll() <= 0) return;
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      scheduleStorageTabsScroll(el.scrollLeft + delta);
    };

    const handleStorageTabsMouseMove = (e: MouseEvent) => {
      const el = storageTabsRef.value;
      const maxScroll = getStorageTabsMaxScroll();
      if (!el || maxScroll <= 0) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      scheduleStorageTabsScroll(maxScroll * ratio);
    };

    const handleStorageTabsMouseLeave = () => {
      cancelStorageTabsPan();
    };

    const clampSidebarWidth = (width: number) => Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

    const handleSidebarResizeMove = (e: MouseEvent) => {
      sidebarWidth.value = clampSidebarWidth(sidebarResizeStartWidth + e.clientX - sidebarResizeStartX);
      nextTick(calcTableScrollHeight);
    };

    const handleSidebarResizeEnd = () => {
      window.removeEventListener('mousemove', handleSidebarResizeMove);
      window.removeEventListener('mouseup', handleSidebarResizeEnd);
      document.body.classList.remove('sidebar-resizing');
      nextTick(calcTableScrollHeight);
    };

    const handleSidebarResizeStart = (e: MouseEvent) => {
      if (sidebarCollapsed.value) return;
      sidebarResizeStartX = e.clientX;
      sidebarResizeStartWidth = sidebarWidth.value;
      document.body.classList.add('sidebar-resizing');
      window.addEventListener('mousemove', handleSidebarResizeMove);
      window.addEventListener('mouseup', handleSidebarResizeEnd);
    };

    const activeConnection = computed(() => configStore.activeConnection);

    // 每个 tab 当前处于的 bucket（虚拟桶模式下动态切换）— 必须在 activeBucket 之前声明
    const activeBucketMap = reactive<Record<string, string>>({});

    const activeConnectionLabel = computed(() => {
      const conn = activeConnection.value;
      if (!conn) return '';
      // 固定模式（connection 指定了 bucket）：Home 显示 bucket/prefix
      if (conn.bucket) {
        const prefix = activePathPrefix.value;
        return prefix ? `${conn.bucket}/${prefix}` : conn.bucket;
      }
      // 虚拟桶模式：Home 不显示 bucket（bucket 在下一级面包屑中展示）
      return '';
    });
    const activeConnectionEndpoint = computed(() => {
      const conn = activeConnection.value;
      if (!conn?.endpoint) return '';
      return `${conn.useSSL ? 'https' : 'http'}://${conn.endpoint}`;
    });
    const activeConnectionScope = computed(() => {
      const bucket = activeBucket.value;
      if (!bucket) return '';
      const prefix = activePathPrefix.value;
      return prefix ? `${bucket}/${prefix}` : bucket;
    });

    // 虚拟桶模式下，是否在 Home 后显示 bucket 层级
    const showVirtualBucketCrumb = computed(() => {
      const conn = activeConnection.value;
      if (!conn) return false;
      return !conn.bucket && !!activeBucket.value;
    });

    // 是否处于虚拟桶列表视图（connection 无指定 bucket 且尚未进入任何桶）
    const isInVirtualBucketList = computed(() => {
      const conn = activeConnection.value;
      if (!conn) return false;
      return !conn.bucket && !activeBucket.value;
    });

    const tableWrapperRef = ref<HTMLElement | null>(null);
    const customPaginationRef = ref<HTMLElement | null>(null);
    const tableScrollHeight = ref(400);

    const calcTableScrollHeight = () => {
      const wrapper = tableWrapperRef.value;
      const pagination = customPaginationRef.value;
      if (!wrapper || !pagination) {
        tableScrollHeight.value = Math.max(windowHeight.value - 124, 200);
        return;
      }
      // 动态测量：table-wrapper 总高度 - pagination 高度 - antd 表头实际高度 - 其他边距
      const thead = wrapper.querySelector('.ant-table-thead') as HTMLElement;
      const theadHeight = thead ? thead.offsetHeight : 37;
      const available = wrapper.clientHeight - pagination.offsetHeight - theadHeight - 2;
      tableScrollHeight.value = Math.max(available, 200);
    };

    // 当前 tab 的活动 bucket（虚拟桶模式下用户双击桶后切换到此桶）
    const activeBucket = computed(() => {
      const conn = activeConnection.value;
      if (!conn) return '';
      // connection 指定了 bucket 则始终用该 bucket
      if (conn.bucket) return conn.bucket;
      // 否则从 activeBucketMap 取用户动态选择的 bucket
      return activeBucketMap[conn.id] || '';
    });

    // 当前 tab 的活动 pathPrefix：connection 指定且 bucket 也指定时使用 connection.pathPrefix
    const activePathPrefix = computed(() => {
      const conn = activeConnection.value;
      if (!conn) return '';
      // pathPrefix 只在 bucket 指定时生效
      if (!conn.bucket) return '';
      return conn.pathPrefix || '';
    });

    /** 同步存储上下文：只在 connection 凭据改变时重建 S3Client，否则只更新 bucket/prefix */
    const lastAppliedConnKey = ref('');
    const lastClickAnchor = ref<string | null>(null);
    const applyStorageContext = () => {
      const conn = activeConnection.value;
      if (!conn || !conn.id) return;
      // endpoint/accessKey 等凭据变化才重建 S3Client
      const connKey = `${conn.id}|${conn.endpoint}|${conn.accessKeyId}|${conn.accessKeySecret}|${conn.region}|${conn.useSSL}|${conn.pathStyle}`;
      if (connKey !== lastAppliedConnKey.value) {
        try {
          storage.changeConfig(defaultStorage, _.cloneDeep(toRaw(conn)));
          lastAppliedConnKey.value = connKey;
        } catch (e) {
          console.error('[STORAGE] applyStorageContext changeConfig failed:', e);
        }
      }
      try {
        storage.setTarget(defaultStorage, activeBucket.value, activePathPrefix.value);
      } catch (e) {
        console.error('[STORAGE] applyStorageContext setTarget failed:', e);
      }
    };

    // connection 或 bucket/pathPrefix 变化时自动同步存储上下文
    watch([activeConnection, activeBucket, activePathPrefix], () => {
      try { applyStorageContext(); } catch (e) { console.error('[STORAGE] watcher error:', e); }
      nextTick(calcTableScrollHeight);
    }, { immediate: true });

    // connection 的 bucket/pathPrefix 变化时刷新列表视图
    const activeBucketPrefixKey = computed(() => {
      const conn = activeConnection.value;
      if (!conn) return '';
      return `${conn.bucket || ''}|${conn.pathPrefix || ''}`;
    });
    let switchingTab = false;

    watch(activeBucketPrefixKey, () => {
      if (switchingTab) return;
      // bucket/prefix 变了，重置导航并刷新
      if (activeConnectionId.value) {
        activeBucketMap[activeConnectionId.value] = '';
        applyStorageContext();
        handleStorageListObjects('/', true);
      }
    });

    watch(activeConnectionId, (connectionId, oldConnectionId) => {
      if (!connectionId || connectionId === oldConnectionId) return;
      if (oldConnectionId) {
        saveNavHistory(oldConnectionId);
        bucketDirectoryMap[oldConnectionId] = tableState.currentDirectory || '/';
        bucketStateMap[oldConnectionId] = {
          tableSource: [...tableSource.value],
          currentDirectory: tableState.currentDirectory,
          searchDirectory: tableState.searchDirectory,
          breadcrumbDirectory: [...tableState.breadcrumbDirectory],
          searchKeyword: tableState.searchKeyword,
          nextContinuationToken: tableState.nextContinuationToken,
          paginationCurrent: paginationState.current,
        };
      }
      const conn = configStore.getConnectionById(connectionId);
      if (!conn) return;
      // 存储上下文由 applyStorageContext watcher 管理，此处不再手动调用

      const cached = bucketStateMap[connectionId];
      restoreNavHistory(connectionId);
      if (cached) {
        // 先恢复缓存状态，用户立即看到旧视图（无 loading）
        setTableSource([...(cached.tableSource || [])]);
        tableState.currentDirectory = cached.currentDirectory;
        tableState.searchDirectory = cached.searchDirectory;
        tableState.breadcrumbDirectory = [...cached.breadcrumbDirectory];
        tableState.searchKeyword = cached.searchKeyword;
        tableState.nextContinuationToken = cached.nextContinuationToken;
        paginationState.current = cached.paginationCurrent;
        tableState.selectedRowKeys = [];
        tableState.selectedRows = [];
        tableState.loading = false;
        // 后台静默刷新：确保切换回的视图与服务端一致（覆盖上传等异步变更）
        handleStorageListObjects(cached.currentDirectory, false, true);
      } else {
        const dir = bucketDirectoryMap[connectionId] || '/';
        paginationState.current = 1;
        handleStorageListObjects(dir, true);
      }
      nextTick(() => { switchingTab = false; });
    });

    // 当前连接启用的挂载目标
    const activeMountTargets = computed(() => {
      return configStore.enabledTargetsByConnectionId(activeConnectionId.value);
    });

    // 当前 bucket 对应的挂载目标（列表页当前所在桶）
    const currentBucketMountTarget = computed(() => {
      const bucket = activeBucket.value;
      if (!bucket) return undefined;
      return activeMountTargets.value.find(t => t.bucket === bucket);
    });

    const currentBucketMountStatus = computed(() => {
      const target = currentBucketMountTarget.value;
      if (!target) return 'none'; // 无挂载配置
      if (mountLoadingMap[target.id]) return 'loading';
      if (mountStatusMap[target.id]) return 'mounted';
      return 'unmounted';
    });

    const currentBucketMountPoint = computed(() => {
      const target = currentBucketMountTarget.value;
      if (!target) return '';
      return target.mountPoint || '';
    });

    // 虚拟桶列表模式：每个桶的挂载状态映射
    const bucketMountInfoMap = computed(() => {
      const map: Record<string, { configured: boolean; mounted: boolean; loading: boolean; mountPoint: string }> = {};
      for (const target of activeMountTargets.value) {
        map[target.bucket] = {
          configured: true,
          mounted: mountStatusMap[target.id],
          loading: mountLoadingMap[target.id],
          mountPoint: target.mountPoint || '',
        };
      }
      return map;
    });

    const mountStatusMap = reactive<Record<string, boolean>>({});
    const mountLoadingMap = reactive<Record<string, boolean>>({});
    const fuse = (window as any).fuse as PreloadFuse;

    // ── 防抖 VFS 缓存刷新（文件级精准 + 验证 + 重试） ──
    let vfsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    interface VfsChangeEntry {
      dir: string;
      forgetFiles: string[];   // 需要失效内容缓存的文件
      expectDeleted: string[]; // 期望从挂载目录消失的文件（验证用）
      expectAdded: string[];   // 期望在挂载目录出现的文件（验证用）
    }
    const vfsPendingChanges: VfsChangeEntry[] = [];
    const vfsSyncState = ref<'idle' | 'syncing' | 'synced' | 'failed'>('idle');
    const vfsFailedFiles = ref<string[]>([]);  // 同步失败的文件名列表

    const scheduleVfsRefresh = (dir: string, opts?: { forgetFiles?: string[]; expectDeleted?: string[]; expectAdded?: string[] }) => {
      const target = currentBucketMountTarget.value;
      if (!target || currentBucketMountStatus.value !== 'mounted') return;
      // 检查目录是否在 mount 的 pathPrefix 范围内
      if (!fuse.isWithinMountScope(dir, target.pathPrefix || '')) {
        console.log(`[VFS] skip: dir "${dir}" is outside mount scope "${target.pathPrefix}"`);
        return;
      }
      const forgetFiles = opts?.forgetFiles || [];
      const expectDeleted = opts?.expectDeleted || [];
      const expectAdded = opts?.expectAdded || [];
      // 合并同一目录的变更
      const existing = vfsPendingChanges.find(c => c.dir === dir);
      if (existing) {
        for (const f of forgetFiles) if (!existing.forgetFiles.includes(f)) existing.forgetFiles.push(f);
        for (const f of expectDeleted) if (!existing.expectDeleted.includes(f)) existing.expectDeleted.push(f);
        for (const f of expectAdded) if (!existing.expectAdded.includes(f)) existing.expectAdded.push(f);
      } else {
        vfsPendingChanges.push({ dir, forgetFiles, expectDeleted, expectAdded });
      }
      vfsSyncState.value = 'syncing';
      vfsFailedFiles.value = [];
      if (vfsRefreshTimer) clearTimeout(vfsRefreshTimer);
      vfsRefreshTimer = setTimeout(async () => {
        vfsRefreshTimer = null;
        const targetId = target.id;
        let allVerified = true;
        const failed: string[] = [];
        // 收集所有被删除文件的 basename（在清空 vfsPendingChanges 之前）
        const deletedBasenames = vfsPendingChanges
          .flatMap(c => c.expectDeleted)
          .map(f => f.includes('/') ? f.slice(f.lastIndexOf('/') + 1) : f)
          .filter(Boolean);
        for (const change of vfsPendingChanges) {
          const result = await fuse.vfsRefreshVerified(
            targetId, change.dir, change.forgetFiles, change.expectDeleted, change.expectAdded,
          );
          if (!result.verified) {
            allVerified = false;
            console.warn(`[VFS] refresh verified failed for dir="${change.dir}", retries=${result.retries}`);
            // 收集失败文件名
            if (result.stillPresent) failed.push(...result.stillPresent.map(f => `未删除: ${f}`));
            if (result.stillMissing) failed.push(...result.stillMissing.map(f => `未出现: ${f}`));
          }
        }
        vfsPendingChanges.length = 0;
        vfsSyncState.value = allVerified ? 'synced' : 'failed';
        vfsFailedFiles.value = failed;
        // synced 2秒后回到 idle；failed 持续显示直到下一次操作
        if (allVerified) {
          // 通知 Windows Explorer 刷新挂载目录视图 + 清理 exe 可能重新引入的 VFS 缓存
          const mountPoint = target.mountPoint;
          if (mountPoint && deletedBasenames.length > 0) {
            const conn = activeConnection.value;
            const vfsDir = tableState.currentDirectory;
            fuse.notifyExplorerRefresh(
              mountPoint, deletedBasenames,
              target.id, vfsDir,
              conn.id, target.bucket, target.pathPrefix || '',
              target.cacheDirectory || '',
            );
          }
          setTimeout(() => { if (vfsSyncState.value === 'synced') vfsSyncState.value = 'idle'; }, 2000);
        }
      }, 1200);
    };

    const refreshMountStatus = () => {
      for (const target of configStore.mountTargets) {
        if (target.mountPoint && target.mountPoint.length > 0) {
          fuse.checkMount(target.mountPoint).then((state: boolean) => {
            mountStatusMap[target.id] = state;
          }).catch(() => {
            mountStatusMap[target.id] = false;
          });
        } else {
          mountStatusMap[target.id] = false;
        }
      }
    };

    const currentDirectoryTotalSize = computed(() => {
      return filteredSource.value.reduce((sum, item) => sum + (item.size || 0), 0);
    });

    const directoryCount = computed(() => {
      return filteredSource.value.filter(item => item.type === 'directory').length;
    });

    const fileCount = computed(() => {
      return filteredSource.value.filter(item => item.type !== 'directory').length;
    });


    const formatDirectorySize = computed(() => {
      return StringUtil.formatFileSize(currentDirectoryTotalSize.value);
    });

    const resolveLocalPath = (objectName: string) => {
      if (!currentBucketMountPoint.value) return '';
      if (!objectName) return currentBucketMountPoint.value;
      return native.pathJoin(currentBucketMountPoint.value, objectName);
    };

    const handleShowLocalFile = (objInfo: ObjectInfo) => {
      const localPath = resolveLocalPath(objInfo.objectName);
      if (!localPath) return;
      if (objInfo.type === 'directory') {
        native.openLocalFolder(localPath);
        return;
      }
      native.showLocalFile(localPath);
    };

    const handleLocalPreview = (objInfo: ObjectInfo) => {
      const localPath = resolveLocalPath(objInfo.objectName);
      if (!localPath) return;
      if (objInfo.type === 'directory') {
        native.openLocalFolder(localPath);
        return;
      }
      const ext = getFileExtenstion(objInfo.objectName).toLowerCase();
      const executableExts = ['exe', 'msi', 'bat', 'cmd', 'ps1', 'vbs', 'com', 'scr'];
      if (executableExts.includes(ext)) {
        native.showLocalFile(localPath);
      } else {
        native.openLocalFolder(localPath);
      }
    };

    const handleOpenLocalDirectory = () => {
      if (!currentBucketMountPoint.value) return;
      const localPath = resolveLocalPath(tableState.currentDirectory);
      if (!localPath) return;
      native.openLocalFolder(localPath);
    };

    const connectionPalette = computed(() => {
      const colors = settingStore.activeConnectionColors || [];
      return colors.length > 0 ? colors : ['#2563eb'];
    });

    const getConnectionColor = (connectionId: string) => {
      const index = connections.value.findIndex(c => c.id === connectionId);
      const palette = connectionPalette.value;
      return palette[index >= 0 ? index % palette.length : 0];
    };

    const getConnectionTextColor = (color: string) => {
      const hex = String(color || '').replace('#', '');
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff';
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return luminance > 0.62 ? '#111827' : '#ffffff';
    };

    const activeConnectionColor = computed(() => {
      if (!activeConnectionId.value) return connectionPalette.value[0];
      return getConnectionColor(activeConnectionId.value);
    });

    const previewThemeTokens = computed<PreviewThemeTokens>(() => {
      const token = designToken.value;
      const asColor = (value: unknown, fallback: string) => typeof value === 'string' && value ? value : fallback;
      return {
        colorPrimary: asColor(activeConnectionColor.value, asColor(token.colorPrimary, '#1890ff')),
        colorBgBase: asColor(token.colorBgBase, settingStore.themeMode === 'dark' ? '#141414' : '#ffffff'),
        colorBgLayout: asColor(token.colorBgLayout, settingStore.themeMode === 'dark' ? '#000000' : '#f5f5f5'),
        colorBgContainer: asColor(token.colorBgContainer, settingStore.themeMode === 'dark' ? '#141414' : '#ffffff'),
        colorBgElevated: asColor(token.colorBgElevated, settingStore.themeMode === 'dark' ? '#1f1f1f' : '#ffffff'),
        colorBgSpotlight: asColor(token.colorBgSpotlight, settingStore.themeMode === 'dark' ? '#424242' : '#000000'),
        colorText: asColor(token.colorText, settingStore.themeMode === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.88)'),
        colorTextSecondary: asColor(token.colorTextSecondary, settingStore.themeMode === 'dark' ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)'),
        colorTextTertiary: asColor(token.colorTextTertiary, settingStore.themeMode === 'dark' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)'),
        colorBorder: asColor(token.colorBorder, settingStore.themeMode === 'dark' ? '#424242' : '#d9d9d9'),
        colorBorderSecondary: asColor(token.colorBorderSecondary, settingStore.themeMode === 'dark' ? '#303030' : '#f0f0f0'),
        colorFillSecondary: asColor(token.colorFillSecondary, settingStore.themeMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)'),
        colorFillTertiary: asColor(token.colorFillTertiary, settingStore.themeMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'),
      };
    });

    const getTabStyle = (connectionId: string) => {
      const color = getConnectionColor(connectionId);
      const isActive = activeConnectionId.value === connectionId;
      return {
        borderColor: isActive ? color : 'transparent',
        background: isActive ? `linear-gradient(135deg, ${color}18 0%, ${color}08 100%)` : '#fff',
        color: isActive ? color : '#595959',
        boxShadow: isActive ? `0 6px 14px ${color}22` : 'none',
      };
    };

    const getFileIconInfo = (filename: string) => {
      const ext = getFileExtenstion(filename).toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return { icon: FileImageOutlined, color: '#eb2f96' };
      if (['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv'].includes(ext)) return { icon: VideoCameraOutlined, color: '#722ed1' };
      if (['mp3', 'wav', 'aac', 'flac', 'ogg'].includes(ext)) return { icon: SoundOutlined, color: '#13c2c2' };
      if (ext === 'pdf') return { icon: FilePdfOutlined, color: '#f5222d' };
      if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: FileExcelOutlined, color: '#52c41a' };
      if (['doc', 'docx'].includes(ext)) return { icon: FileWordOutlined, color: '#2f54eb' };
      if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { icon: FileZipOutlined, color: '#fa8c16' };
      if (['txt', 'md', 'log'].includes(ext)) return { icon: FileTextOutlined, color: '#595959' };
      if (['js', 'ts', 'json', 'xml', 'html', 'css', 'less', 'vue', 'py', 'go', 'java'].includes(ext)) return { icon: CodeOutlined, color: '#1890ff' };
      if (['db', 'sqlite', 'sql'].includes(ext)) return { icon: DatabaseOutlined, color: '#faad14' };
      return { icon: FileOutlined, color: '#8c8c8c' };
    };

    const getFileIcon = (filename: string) => getFileIconInfo(filename).icon;

    const COMPACT_DIRECTORY_MAX_DEPTH = 16;
    const COMPACT_DIRECTORY_MAX_ITEMS = 80;

    const shouldCompactDirectories = () => {
      if (isInVirtualBucketList.value) return false;
      return !!activeBucket.value;
    };

    const compactSingleDirectoryChain = async (dir: ObjectInfo): Promise<ObjectInfo> => {
      let cursor = dir.objectName;
      const nameParts = [dir.name];
      const visited = new Set([cursor]);

      for (let depth = 0; depth < COMPACT_DIRECTORY_MAX_DEPTH; depth++) {
        const resp = await storage.listObjects(defaultStorage, cursor, '');
        if (!resp.success || resp.nextContinuationToken) break;

        const children = resp.objectInfos;
        if (children.length !== 1 || children[0].type !== 'directory') break;

        const nextDir = children[0];
        if (!nextDir.objectName || nextDir.objectName === cursor || visited.has(nextDir.objectName)) break;

        visited.add(nextDir.objectName);
        nameParts.push(nextDir.name);
        cursor = nextDir.objectName;
      }

      if (cursor === dir.objectName) return dir;
      return {
        ...dir,
        name: nameParts.join('/'),
        objectName: cursor,
        type: 'directory',
      };
    };

    const compactDirectoryChains = async (objectInfos: ObjectInfo[]) => {
      if (!shouldCompactDirectories()) return objectInfos;
      const directoryCount = objectInfos.filter(item => item.type === 'directory').length;
      if (directoryCount === 0 || directoryCount > COMPACT_DIRECTORY_MAX_ITEMS) return objectInfos;

      const compacted = await Promise.all(objectInfos.map(async item => {
        if (item.type !== 'directory') return item;
        try {
          return await compactSingleDirectoryChain(item);
        } catch {
          return item;
        }
      }));
      return compacted;
    };

    let listRequestId = 0;
    let listAbortController: AbortController | null = null;
    const listLoadingMore = ref(false);
    const listLoadedPages = ref(0);
    const bucketDirectoryMap: Record<string, string> = {};
    const bucketStateMap: Record<string, {
      tableSource: ObjectInfo[];
      currentDirectory: string;
      searchDirectory: string;
      breadcrumbDirectory: string[];
      searchKeyword: string;
      nextContinuationToken: string | null;
      paginationCurrent: number;
    }> = {};

    const switchToConnection = (connectionId: string) => {
      if (connectionId === activeConnectionId.value) return;
      switchingTab = true;
      configStore.setActiveConnection(connectionId);
    };

    const handleTabChange = (connectionId: string) => {
      switchToConnection(connectionId);
    };

    // 当连接列表变化时，确保 activeConnectionId 指向一个启用的连接
    watch(connections, (conns) => {
      if (conns.length === 0) return;
      if (!conns.some(c => c.id === activeConnectionId.value)) {
        switchToConnection(conns[0].id);
      }
    });

    const windowWidth = ref(window.innerWidth);
    const windowHeight = ref(window.innerHeight);
    let internalOfficePreviewResizeEvent = false;
    const handleResize = () => {
      windowWidth.value = window.innerWidth;
      windowHeight.value = window.innerHeight;
      clampPreviewLayout();
      if (!internalOfficePreviewResizeEvent) {
        queueOfficePreviewRelayout(false, 80);
      }
      nextTick(calcTableScrollHeight);
    };

    // 拖拽状态
    const dragOverState = reactive({ active: false });

    const handleDragEnter = (e: DragEvent) => {
      if (isInVirtualBucketList.value) return;
      e.preventDefault();
      e.stopPropagation();
      dragOverState.active = true;
    };

    const handleDragLeave = (e: DragEvent) => {
      if (isInVirtualBucketList.value) return;
      e.preventDefault();
      e.stopPropagation();
      const dropArea = document.getElementById('drop-area');
      if (dropArea && !dropArea.contains(e.relatedTarget as Node)) {
        dragOverState.active = false;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (isInVirtualBucketList.value) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
      if (isInVirtualBucketList.value) return;
      e.preventDefault();
      e.stopPropagation();
      dragOverState.active = false;

      const prefix = tableState.currentDirectory;
      const transferContext = createTransferContextSnapshot(prefix);
      if (!transferContext) return;
      const files = Array.from(e.dataTransfer?.files || []);
      const paths = files.map((file: File) => native.getPathForFile(file));
      if (paths.length === 0) return;

      const filenames = await native.getLocalPaths(paths, prefix);
      filenames.forEach((transferFile) => {
        uploadFile(transferContext, transferFile.prefix, transferFile.name, transferFile.size, transferFile.lastModified);
      });
    };

    // 右键菜单
    const contextMenuState = reactive<{
      visible: boolean;
      x: number;
      y: number;
      target: ObjectInfo | null;
      isBlankArea: boolean;
    }>({
      visible: false,
      x: 0,
      y: 0,
      target: null,
      isBlankArea: false,
    });

    const adjustContextMenuPosition = () => {
      clampMenuPosition(contextMenuState);
    };

    const handleContextMenu = (e: MouseEvent, record: ObjectInfo) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllNavPopups();
      hideTabContextMenu();
      hideHotbarContextMenu();

      // 右键单击：同步选中状态
      const key = record.objectName;
      const currentKeys = tableState.selectedRowKeys;
      if (!currentKeys.includes(key as any)) {
        // 右键的目标不在已选中列表中 → 取消之前的选中，选中当前项
        handleFileTableRowSelection([key] as any, [record]);
      }
      // 如果右键目标已在多选中 → 保持多选，弹出批量菜单

      contextMenuState.visible = true;
      contextMenuState.x = e.clientX;
      contextMenuState.y = e.clientY;
      contextMenuState.target = record;
      contextMenuState.isBlankArea = false;
      adjustContextMenuPosition();
    };

    const handleBlankAreaContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      closeAllNavPopups();
      hideTabContextMenu();
      hideHotbarContextMenu();
      contextMenuState.visible = true;
      contextMenuState.x = e.clientX;
      contextMenuState.y = e.clientY;
      contextMenuState.target = null;
      contextMenuState.isBlankArea = true;
      adjustContextMenuPosition();
    };

    const handleSelectAll = () => {
      const allKeys = paginatedSource.value.map(item => item.objectName);
      Object.assign(tableState, {
        selectedRowKeys: allKeys,
        selectedRows: [...paginatedSource.value],
      });
      hideContextMenu();
    };

    const handleInvertSelection = () => {
      const allKeys = paginatedSource.value.map(item => item.objectName);
      const invertedKeys = allKeys.filter(key => !tableState.selectedRowKeys.includes(key));
      const invertedRows = paginatedSource.value.filter(item => invertedKeys.includes(item.objectName));
      Object.assign(tableState, {
        selectedRowKeys: invertedKeys,
        selectedRows: invertedRows,
      });
      hideContextMenu();
    };

    const hideContextMenu = () => {
      contextMenuState.visible = false;
    };

    const handleClickOutside = () => {
      closeAllNavPopups();
      if (contextMenuState.visible) {
        contextMenuState.visible = false;
      }
      if (hotbarContextMenu.visible) {
        hideHotbarContextMenu();
      }
      if (tabContextMenu.visible) {
        hideTabContextMenu();
      }
    };

    let mountCheckTimer: ReturnType<typeof setInterval> | null = null;

    onMounted(async () => {
      // Load transfer records from SQLite (retry if queue DB is still opening).
      await transferStore.loadFromStorage();
      if (!transferStore.loaded) {
        for (let i = 0; i < 20 && !transferStore.loaded; i++) {
          await new Promise((r) => setTimeout(r, 250));
          await transferStore.loadFromStorage();
        }
      }

      window.addEventListener('resize', handleResize);
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('mouseup', handleMouseButton);
      window.addEventListener('keydown', handleGlobalKeydown);
      nextTick(calcTableScrollHeight);

      storage.on('upload', (data: any) => {
        handlerUploadCallback(data);
      });

      storage.on('download', (data: any) => {
        handlerDownloadCallback(data);
      });

      removePreviewSaveListener = previewWindow?.onSaveText((request: PreviewTextSaveRequest) => {
        if (!activeExternalPreviewId.value || request.previewId !== activeExternalPreviewId.value) return;
        void handleTextSave(request.content);
      });
      removePreviewDownloadListener = previewWindow?.onRequestDownload((request: PreviewDownloadRequest) => {
        if (!activeExternalPreviewId.value || request.previewId !== activeExternalPreviewId.value) return;
        const objectInfo = previewModalState.objectInfo;
        if (objectInfo) handleStorageGetObject(objectInfo);
      });

      refreshMountStatus();
      mountCheckTimer = setInterval(refreshMountStatus, 10000);
    });

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPreviewShellVisible.value) {
        e.preventDefault();
        closePreviewShell();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleStorageListObjects('', false, true);
      }
      if (e.key === 'F5') {
        e.preventDefault();
        handleStorageListObjects('', false, true);
      }
    };

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('mouseup', handleMouseButton);
      window.removeEventListener('keydown', handleGlobalKeydown);
      handleSidebarResizeEnd();
      handlePreviewDragEnd();
      handlePreviewResizeEnd();
      clearOfficePreviewRelayout();
      cancelStorageTabsPan();
      removePreviewSaveListener?.();
      removePreviewDownloadListener?.();
      if (mountCheckTimer) {
        clearInterval(mountCheckTimer);
        mountCheckTimer = null;
      }
      if (tableRefreshTimer) {
        clearTimeout(tableRefreshTimer);
        tableRefreshTimer = null;
      }
    });

    // 预览弹窗
    const previewModalState = reactive({
      visible: false,
      fileType: '',
      previewFilePath: '',
      fileExtension: '',
      objectName: '',
      objectInfo: null as ObjectInfo | null,
      context: null as TransferContextSnapshot | null,
      textSaveUid: '',
      chunked: false,
      fileSize: 0,
    });

    const PREVIEW_MIN_WIDTH = 640;
    const PREVIEW_MIN_HEIGHT = 360;
    const PREVIEW_MARGIN = 10;
    const PREVIEW_HEADER_HEIGHT = 38;
    const getPreviewBounds = () => {
      const maxWidth = Math.max(320, window.innerWidth - PREVIEW_MARGIN * 2);
      const maxHeight = Math.max(240, window.innerHeight - PREVIEW_MARGIN * 2);
      return {
        minWidth: Math.min(PREVIEW_MIN_WIDTH, maxWidth),
        minHeight: Math.min(PREVIEW_MIN_HEIGHT, maxHeight),
        maxWidth,
        maxHeight,
      };
    };
    const getDefaultPreviewSize = () => {
      const bounds = getPreviewBounds();
      return {
        width: Math.min(bounds.maxWidth, Math.max(bounds.minWidth, Math.min(1120, Math.round(window.innerWidth * 0.86)))),
        height: Math.min(bounds.maxHeight, Math.max(bounds.minHeight, Math.min(760, Math.round(window.innerHeight * 0.78)))),
      };
    };
    const defaultPreviewSize = getDefaultPreviewSize();
    const previewModalLayout = reactive({
      width: defaultPreviewSize.width,
      height: defaultPreviewSize.height,
      x: Math.max(PREVIEW_MARGIN, Math.round((window.innerWidth - defaultPreviewSize.width) / 2)),
      y: Math.max(PREVIEW_MARGIN, Math.round((window.innerHeight - defaultPreviewSize.height) / 2)),
      maximized: false,
    });
    let previewDragStartX = 0;
    let previewDragStartY = 0;
    let previewDragStartLeft = previewModalLayout.x;
    let previewDragStartTop = previewModalLayout.y;
    let previewResizeStartX = 0;
    let previewResizeStartY = 0;
    let previewResizeStartWidth = previewModalLayout.width;
    let previewResizeStartHeight = previewModalLayout.height;
    let previewResizeStartLeft = previewModalLayout.x;
    let previewResizeStartTop = previewModalLayout.y;
    let previewRestoreLayout: { x: number; y: number; width: number; height: number } | null = null;
    const officePreviewRenderKey = ref(0);
    let officePreviewRelayoutTimer: ReturnType<typeof setTimeout> | null = null;
    let officePreviewResizeRaf = 0;

    const emitOfficePreviewResize = () => {
      if (officePreviewResizeRaf) {
        window.cancelAnimationFrame(officePreviewResizeRaf);
      }
      officePreviewResizeRaf = window.requestAnimationFrame(() => {
        officePreviewResizeRaf = 0;
        internalOfficePreviewResizeEvent = true;
        window.dispatchEvent(new Event('resize'));
        window.setTimeout(() => {
          internalOfficePreviewResizeEvent = false;
        }, 0);
      });
    };

    const refreshOfficePreviewLayout = (remount = false) => {
      if (previewModalState.fileType !== 'office' || !previewModalState.visible) return;
      if (remount) {
        officePreviewRenderKey.value += 1;
      }
      nextTick(emitOfficePreviewResize);
    };

    const queueOfficePreviewRelayout = (remount = false, delay = 120) => {
      if (previewModalState.fileType !== 'office' || !previewModalState.visible) return;
      if (officePreviewRelayoutTimer) {
        clearTimeout(officePreviewRelayoutTimer);
      }
      officePreviewRelayoutTimer = setTimeout(() => {
        officePreviewRelayoutTimer = null;
        refreshOfficePreviewLayout(remount);
      }, delay);
    };

    const clearOfficePreviewRelayout = () => {
      if (officePreviewRelayoutTimer) {
        clearTimeout(officePreviewRelayoutTimer);
        officePreviewRelayoutTimer = null;
      }
      if (officePreviewResizeRaf) {
        window.cancelAnimationFrame(officePreviewResizeRaf);
        officePreviewResizeRaf = 0;
      }
    };

    const clampPreviewLayout = () => {
      const bounds = getPreviewBounds();
      previewModalLayout.width = Math.min(bounds.maxWidth, Math.max(bounds.minWidth, previewModalLayout.width));
      previewModalLayout.height = Math.min(bounds.maxHeight, Math.max(bounds.minHeight, previewModalLayout.height));
      const maxX = Math.max(PREVIEW_MARGIN, window.innerWidth - previewModalLayout.width - PREVIEW_MARGIN);
      const maxY = Math.max(PREVIEW_MARGIN, window.innerHeight - previewModalLayout.height - PREVIEW_MARGIN);
      previewModalLayout.x = Math.min(maxX, Math.max(PREVIEW_MARGIN, previewModalLayout.x));
      previewModalLayout.y = Math.min(maxY, Math.max(PREVIEW_MARGIN, previewModalLayout.y));
    };

    const centerPreviewLayout = () => {
      clampPreviewLayout();
      previewModalLayout.x = Math.max(PREVIEW_MARGIN, Math.round((window.innerWidth - previewModalLayout.width) / 2));
      previewModalLayout.y = Math.max(PREVIEW_MARGIN, Math.round((window.innerHeight - previewModalLayout.height) / 2));
      clampPreviewLayout();
    };

    const previewShellSupportedTypes = ['image', 'video', 'audio', 'pdf', 'model', 'office', 'text'];

    const isPreviewShellVisible = computed(() =>
      previewModalState.visible && previewShellSupportedTypes.includes(previewModalState.fileType)
    );

    const preparePreviewShellOpen = () => {
      if (!isPreviewShellVisible.value) {
        previewModalLayout.maximized = false;
        previewRestoreLayout = null;
        centerPreviewLayout();
        return;
      }
      clampPreviewLayout();
    };

    const previewShellStyle = computed(() => {
      if (previewModalLayout.maximized) {
        return {
          position: 'fixed' as const,
          inset: '0px',
          left: '0px',
          top: '0px',
          right: '0px',
          bottom: '0px',
          width: 'auto',
          height: 'auto',
          maxWidth: 'none',
          maxHeight: 'none',
          transform: 'none',
        };
      }
      return {
        position: 'fixed' as const,
        inset: 'auto',
        left: `${previewModalLayout.x}px`,
        top: `${previewModalLayout.y}px`,
        right: 'auto',
        bottom: 'auto',
        width: `${previewModalLayout.width}px`,
        height: `${previewModalLayout.height}px`,
        transform: 'none',
      };
    });

    const previewShellClass = computed(() => [
      'preview-shell',
      `preview-shell-${previewModalState.fileType || 'unknown'}`,
      { 'preview-shell-maximized': previewModalLayout.maximized },
    ]);

    const previewShellBodyStyle = computed(() => ({
      background: ['video', 'model'].includes(previewModalState.fileType)
        ? 'var(--preview-media-bg)'
        : 'var(--preview-bg)',
    }));

    const previewShellTitle = computed(() => {
      if (previewModalState.fileType === 'image') {
        return imageGalleryRef.value?.currentImage?.name || previewModalState.objectName;
      }
      return previewModalState.objectName;
    });

    const previewShellSize = computed(() => {
      const imageSize = imageGalleryRef.value?.currentImage?.size;
      const size = imageSize || previewModalState.objectInfo?.size;
      return size ? StringUtil.formatFileSize(size) : '';
    });

    const officePreviewPptOptions = computed(() => {
      const shellWidth = previewModalLayout.maximized ? windowWidth.value : previewModalLayout.width;
      const shellHeight = previewModalLayout.maximized ? windowHeight.value : previewModalLayout.height;
      return {
        width: Math.max(320, Math.round(shellWidth)),
        height: Math.max(220, Math.round(shellHeight - PREVIEW_HEADER_HEIGHT)),
      };
    });

    const officePreviewExcelOptions = computed(() => ({
      showContextmenu: true,
    }));

    const enterPreviewMaximized = () => {
      if (previewModalLayout.maximized) return;
      previewRestoreLayout = {
        x: previewModalLayout.x,
        y: previewModalLayout.y,
        width: previewModalLayout.width,
        height: previewModalLayout.height,
      };
      previewModalLayout.maximized = true;
      nextTick(() => queueOfficePreviewRelayout(true, 0));
    };

    const exitPreviewMaximized = () => {
      if (!previewModalLayout.maximized) return;
      previewModalLayout.maximized = false;
      if (previewRestoreLayout) {
        previewModalLayout.x = previewRestoreLayout.x;
        previewModalLayout.y = previewRestoreLayout.y;
        previewModalLayout.width = previewRestoreLayout.width;
        previewModalLayout.height = previewRestoreLayout.height;
        previewRestoreLayout = null;
        clampPreviewLayout();
      } else {
        centerPreviewLayout();
      }
      officePresentationMode.value = false;
      nextTick(() => queueOfficePreviewRelayout(true, 0));
    };

    const togglePreviewMaximized = () => {
      if (previewModalLayout.maximized) {
        exitPreviewMaximized();
      } else {
        enterPreviewMaximized();
      }
    };

    const handlePreviewDragMove = (e: MouseEvent) => {
      previewModalLayout.x = previewDragStartLeft + e.clientX - previewDragStartX;
      previewModalLayout.y = previewDragStartTop + e.clientY - previewDragStartY;
      clampPreviewLayout();
    };

    const handlePreviewDragEnd = () => {
      window.removeEventListener('mousemove', handlePreviewDragMove);
      window.removeEventListener('mouseup', handlePreviewDragEnd);
      document.body.classList.remove('preview-dragging');
    };

    const handlePreviewDragStart = (e: MouseEvent) => {
      if (previewModalLayout.maximized || e.button !== 0) return;
      previewDragStartX = e.clientX;
      previewDragStartY = e.clientY;
      previewDragStartLeft = previewModalLayout.x;
      previewDragStartTop = previewModalLayout.y;
      document.body.classList.add('preview-dragging');
      window.addEventListener('mousemove', handlePreviewDragMove);
      window.addEventListener('mouseup', handlePreviewDragEnd);
    };

    const handlePreviewResizeMove = (e: MouseEvent) => {
      const bounds = getPreviewBounds();
      previewModalLayout.width = Math.min(bounds.maxWidth, Math.max(bounds.minWidth, previewResizeStartWidth + e.clientX - previewResizeStartX));
      previewModalLayout.height = Math.min(bounds.maxHeight, Math.max(bounds.minHeight, previewResizeStartHeight + e.clientY - previewResizeStartY));
      previewModalLayout.x = previewResizeStartLeft;
      previewModalLayout.y = previewResizeStartTop;
      clampPreviewLayout();
      queueOfficePreviewRelayout(false, 80);
    };

    const handlePreviewResizeEnd = () => {
      window.removeEventListener('mousemove', handlePreviewResizeMove);
      window.removeEventListener('mouseup', handlePreviewResizeEnd);
      document.body.classList.remove('preview-resizing');
      queueOfficePreviewRelayout(true, 0);
    };

    const handlePreviewResizeStart = (e: MouseEvent) => {
      if (previewModalLayout.maximized) return;
      previewResizeStartX = e.clientX;
      previewResizeStartY = e.clientY;
      previewResizeStartWidth = previewModalLayout.width;
      previewResizeStartHeight = previewModalLayout.height;
      previewResizeStartLeft = previewModalLayout.x;
      previewResizeStartTop = previewModalLayout.y;
      document.body.classList.add('preview-resizing');
      window.addEventListener('mousemove', handlePreviewResizeMove);
      window.addEventListener('mouseup', handlePreviewResizeEnd);
    };

    const closePreviewShell = () => {
      if (previewModalState.fileType === 'text') {
        handleTextPreviewClose();
        return;
      }
      previewModalState.visible = false;
      officePresentationMode.value = false;
      clearOfficePreviewRelayout();
    };

    // 图片画廊
    const galleryImages = ref<{ name: string; url: string; size?: number }[]>([]);
    const galleryStartIndex = ref(0);
    const imageGalleryRef = ref();
    const textEditorRef = ref();
    const textEditorDirty = ref(false);
    const textSaving = ref(false);

    const openPreviewInIndependentWindow = async (): Promise<boolean> => {
      if (!previewWindow || !previewShellSupportedTypes.includes(previewModalState.fileType)) {
        activeExternalPreviewId.value = '';
        return false;
      }

      const previewId = `${Date.now()}-${++previewSequence}`;
      const payload: PreviewWindowPayload = {
        id: previewId,
        title: previewModalState.objectName || previewModalState.objectInfo?.name || '文件预览',
        size: previewModalState.objectInfo?.size,
        fileType: previewModalState.fileType as PreviewFileType,
        fileExtension: previewModalState.fileExtension,
        url: previewModalState.previewFilePath,
        theme: settingStore.themeMode === 'dark' ? 'dark' : 'light',
        themeTokens: { ...previewThemeTokens.value },
        // Vue 的 ref 数组是 Proxy，必须转成普通对象后才能通过 Electron IPC 结构化克隆。
        images: previewModalState.fileType === 'image'
          ? galleryImages.value.map(image => ({ name: image.name, url: image.url, size: image.size }))
          : undefined,
        imageStartIndex: previewModalState.fileType === 'image' ? galleryStartIndex.value : undefined,
        chunked: previewModalState.fileType === 'text' ? previewModalState.chunked : undefined,
        fileSize: previewModalState.fileType === 'text' ? previewModalState.fileSize : undefined,
        canSaveText: previewModalState.fileType === 'text' ? !previewModalState.chunked : undefined,
      };

      activeExternalPreviewId.value = previewId;
      try {
        const result = await previewWindow.open(payload);
        if (result.success) {
          previewModalState.visible = false;
          textEditorDirty.value = false;
          return true;
        }
        activeExternalPreviewId.value = '';
        notification['warning']({
          message: '独立预览窗口打开失败',
          description: result.error || '已切换回内嵌预览',
        });
      } catch (error) {
        activeExternalPreviewId.value = '';
        notification['warning']({
          message: '独立预览窗口打开失败',
          description: error instanceof Error ? error.message : String(error),
        });
      }
      return false;
    };

    const presentPreparedPreview = async () => {
      if (await openPreviewInIndependentWindow()) return;
      preparePreviewShellOpen();
      previewModalState.visible = true;
    };

    watch(
      () => [settingStore.themeMode, previewThemeTokens.value] as const,
      () => {
        previewWindow?.updateTheme({
          theme: settingStore.themeMode === 'dark' ? 'dark' : 'light',
          themeTokens: { ...previewThemeTokens.value },
        });
      },
      { deep: true },
    );
    const officePreviewScrollRef = ref<HTMLElement | null>(null);
    const officePresentationMode = ref(false);
    let tableRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scrollOfficePreview = (position: 'top' | 'bottom') => {
      const el = officePreviewScrollRef.value;
      if (!el) return;
      el.scrollTo({
        top: position === 'top' ? 0 : el.scrollHeight,
        behavior: 'smooth',
      });
    };

    const toggleOfficePresentationMode = () => {
      if (!officePresentationMode.value) {
        officePresentationMode.value = true;
        enterPreviewMaximized();
        return;
      }
      officePresentationMode.value = false;
      exitPreviewMaximized();
    };

    // 创建目录弹窗
    const mkdirModalState = reactive({
      visible: false,
      directoryPath: '',
    });

    // 传输列表
    const transferDrawerVisible = ref(false);

    // 分页器
    const paginationState = reactive<{
      current: number;
      pageSize: number;
    }>({ current: 1, pageSize: settingStore.defaultPageSize || 20 });

    // 文件列表
    // tableSource is shallow to avoid deep reactive overhead on large S3 listings.
    const tableSource = shallowRef<ObjectInfo[]>([]);
    const tableState = reactive<{
      loading: boolean;
      refreshing: boolean;
      currentDirectory: string;
      searchDirectory: string;
      searchKeyword: string;
      breadcrumbDirectory: string[];
      nextContinuationToken: string | null;
      selectedRowKeys: Key[];
      selectedRows: ObjectInfo[];
    }>({
      loading: false,
      refreshing: false,
      nextContinuationToken: '',
      currentDirectory: '',
      searchDirectory: '/',
      searchKeyword: '',
      breadcrumbDirectory: [],
      selectedRowKeys: [],
      selectedRows: [],
    });
    const setTableSource = (rows: ObjectInfo[]) => {
      tableSource.value = rows;
      triggerRef(tableSource);
    };

    interface TransferContextSnapshot {
      connectionId: string;
      connection: Connection;
      bucket: string;
      pathPrefix: string;
      sourceDirectory: string;
      connectionLabel: string;
    }

    const normalizeTransferPath = (value?: string) => StringUtil.trim(value || '', '/');

    const createTransferContextSnapshot = (sourceDirectory: string = tableState.currentDirectory): TransferContextSnapshot | null => {
      const conn = activeConnection.value;
      if (!conn?.id) return null;
      return {
        connectionId: conn.id,
        connection: _.cloneDeep(toRaw(conn)) as Connection,
        bucket: activeBucket.value || '',
        pathPrefix: activePathPrefix.value || '',
        sourceDirectory: normalizeTransferPath(sourceDirectory),
        connectionLabel: activeConnectionLabel.value || conn.id,
      };
    };

    const withTransferContext = (task: TransferInfo, context: TransferContextSnapshot): TransferInfo => ({
      ...task,
      connectionId: context.connectionId,
      connection: _.cloneDeep(context.connection),
      bucket: context.bucket,
      pathPrefix: context.pathPrefix,
      sourceDirectory: context.sourceDirectory,
      connectionLabel: context.connectionLabel,
    });

    const ensureTransferRecordContext = (task: TransferInfo): TransferInfo => {
      if (!task.connection && task.connectionId) {
        const conn = configStore.getConnectionById(task.connectionId);
        if (conn) task.connection = _.cloneDeep(toRaw(conn)) as Connection;
      }
      if (!task.connectionId && task.connection?.id) {
        task.connectionId = task.connection.id;
      }
      if (task.pathPrefix === undefined) {
        task.pathPrefix = '';
      }
      return task;
    };

    const isTransferForActiveContext = (event: any) => {
      if (!event?.connectionId || event.connectionId !== activeConnectionId.value) return false;
      return (event.bucket || '') === (activeBucket.value || '')
        && (event.pathPrefix || '') === (activePathPrefix.value || '');
    };

    // 导航历史（前进后退）— 按 connectionId 隔离，记录 bucket+path 上下文
    interface NavEntry { path: string; bucket: string }
    const navHistoryMap: Record<string, { entries: NavEntry[]; index: number }> = {};
    const navHistory = reactive<NavEntry[]>([]);
    const navIndex = ref(-1);

    const saveNavHistory = (connectionId: string) => {
      navHistoryMap[connectionId] = { entries: [...navHistory], index: navIndex.value };
    };
    const restoreNavHistory = (connectionId: string) => {
      const saved = navHistoryMap[connectionId];
      if (saved) {
        navHistory.splice(0, navHistory.length, ...saved.entries);
        navIndex.value = saved.index;
      } else {
        navHistory.splice(0, navHistory.length);
        navIndex.value = -1;
      }
    };

    const pushNav = (path: string, bucket?: string) => {
      const normalized = StringUtil.trim(path, '/') || '/';
      const entry: NavEntry = { path: normalized, bucket: bucket ?? activeBucket.value };
      if (navIndex.value >= 0
        && navHistory[navIndex.value].path === normalized
        && navHistory[navIndex.value].bucket === entry.bucket) return;
      navHistory.splice(navIndex.value + 1);
      navHistory.push(entry);
      navIndex.value = navHistory.length - 1;
    };

    const canGoBack = computed(() => navIndex.value > 0);
    const canGoForward = computed(() => navIndex.value < navHistory.length - 1);

    const goBack = () => {
      if (!canGoBack.value) return;
      navIndex.value--;
      const entry = navHistory[navIndex.value];
      navigateToEntry(entry);
    };
    const goForward = () => {
      if (!canGoForward.value) return;
      navIndex.value++;
      const entry = navHistory[navIndex.value];
      navigateToEntry(entry);
    };

    /** 根据导航历史条目切换 bucket 上下文并刷新列表 */
    const navigateToEntry = (entry: NavEntry) => {
      const conn = activeConnection.value;
      if (conn && !conn.bucket) {
        activeBucketMap[conn.id] = entry.bucket;
        applyStorageContext();
      }
      const path = entry.path === '/' ? '/' : entry.path;
      handleStorageListObjects(path);
    };

    const handleMouseButton = (e: MouseEvent) => {
      // 鼠标前进(back: button 4) / 后退(forward: button 3)
      if (e.button === 3) goBack();
      else if (e.button === 4) goForward();
    };

    // 行点击交互：利用原生click/dblclick事件
    const customTableRow = (record: ObjectInfo) => {
      return {
        onContextmenu: (e: MouseEvent) => handleContextMenu(e, record),
        onClick: (e: MouseEvent) => handleRowClick(e, record),
        onDblclick: (e: MouseEvent) => handleRowDblClick(e, record),
      };
    };

    // ── 导航 Popup 系统 ──
    interface NavPopupItem {
      name: string;
      objectName: string;
      hasSubDirs?: boolean;
    }
    interface NavPopup {
      prefix: string;
      items: NavPopupItem[];
      loading: boolean;
      maxDisplayLen: number;
      x: number;
      y: number;
      bounceLeft?: boolean;
      rightOffset?: number;
      bounceUp?: boolean;
      bottomOffset?: number;
      activeItemObjectName?: string;
      overrideBucket?: string;
    }
    const navPopupChain = reactive<NavPopup[]>([]);
    let navHoverTimer: ReturnType<typeof setTimeout> | null = null;
    let navCloseTimer: ReturnType<typeof setTimeout> | null = null;
    let navSiblingTimer: ReturnType<typeof setTimeout> | null = null;
    const NAV_FIRST_DELAY = 500;
    const NAV_CLOSE_DELAY = 300;
    const NAV_SIBLING_DELAY = 150;
    // 安全三角：鼠标从当前项向已展开子菜单移动时不触发兄弟项
    let safeTriangleOrigin: { x: number; y: number } | null = null;
    let safeTriangleSubmenuEdge: { top: number; bottom: number; x: number } | null = null;

    const clearNavTimers = () => {
      if (navHoverTimer) { clearTimeout(navHoverTimer); navHoverTimer = null; }
      if (navCloseTimer) { clearTimeout(navCloseTimer); navCloseTimer = null; }
      if (navSiblingTimer) { clearTimeout(navSiblingTimer); navSiblingTimer = null; }
      safeTriangleOrigin = null;
      safeTriangleSubmenuEdge = null;
    };

    const closeAllNavPopups = () => {
      clearNavTimers();
      if (navLoadingTimer) { clearTimeout(navLoadingTimer); navLoadingTimer = null; }
      navPopupChain.splice(0, navPopupChain.length);
      navPopupLoadingVisible.splice(0, navPopupLoadingVisible.length);
    };

    const closeNavPopupsAfter = (level: number) => {
      if (level < navPopupChain.length) {
        navPopupChain.splice(level);
      }
      if (level < navPopupLoadingVisible.length) {
        navPopupLoadingVisible.splice(level);
      }
    };

    const isInSafeTriangle = (mx: number, my: number): boolean => {
      if (!safeTriangleOrigin || !safeTriangleSubmenuEdge) return false;
      const { x: ox, y: oy } = safeTriangleOrigin;
      const { top: bt, bottom: bb, x: bx } = safeTriangleSubmenuEdge;
      // 三角形顶点：origin(ox,oy), submenu_edge_top(bx,bt), submenu_edge_bottom(bx,bb)
      const cross = (ax: number, ay: number, bx2: number, by2: number, px: number, py: number) =>
        (bx2 - ax) * (py - ay) - (by2 - ay) * (px - ax);
      const s1 = cross(ox, oy, bx, bt, mx, my);
      const s2 = cross(bx, bt, bx, bb, mx, my);
      const s3 = cross(bx, bb, ox, oy, mx, my);
      const hasNeg = (s1 < 0) || (s2 < 0) || (s3 < 0);
      const hasPos = (s1 > 0) || (s2 > 0) || (s3 > 0);
      return !(hasNeg && hasPos);
    };

    const handleNavPopupHover = (record: ObjectInfo, e: MouseEvent) => {
      clearNavTimers();
      // 虚拟桶列表模式：hover 在 bucket 行上时，临时切换到该 bucket 上下文
      if (isInVirtualBucketList.value) {
        const conn = activeConnection.value;
        if (conn && !conn.bucket && !activeBucket.value) {
          const bucketName = record.objectName;
          if (navPopupChain.length > 0 && navPopupChain[0]?.prefix === bucketName) return;
          const anchor = { x: e.clientX, y: e.clientY };
          if (navPopupChain.length > 0) {
            closeAllNavPopups();
            fetchNavPopup(bucketName, anchor, 0, undefined, bucketName);
          } else {
            navHoverTimer = setTimeout(() => {
              navHoverTimer = null;
              fetchNavPopup(bucketName, anchor, 0, undefined, bucketName);
            }, NAV_FIRST_DELAY);
          }
          return;
        }
      }
      if (navPopupChain.length > 0 && navPopupChain[0]?.prefix === record.objectName) return;
      const anchor = { x: e.clientX, y: e.clientY };
      if (navPopupChain.length > 0) {
        closeAllNavPopups();
        fetchNavPopup(record.objectName, anchor, 0);
      } else {
        navHoverTimer = setTimeout(() => {
          navHoverTimer = null;
          fetchNavPopup(record.objectName, anchor, 0);
        }, NAV_FIRST_DELAY);
      }
    };

    const handleNavPopupLeave = (e?: MouseEvent) => {
      if (navHoverTimer) { clearTimeout(navHoverTimer); navHoverTimer = null; }
      if (e && e.relatedTarget instanceof HTMLElement) {
        if ((e.relatedTarget as HTMLElement).closest('.nav-popup')) return;
      }
      if (navPopupChain.length > 0) {
        scheduleNavClose();
      }
    };

    const handleNavPopupItemEnter = (item: NavPopupItem, level: number, e: MouseEvent) => {
      if (navCloseTimer) { clearTimeout(navCloseTimer); navCloseTimer = null; }
      if (!item.hasSubDirs) return;
      // 安全三角检测：鼠标向已展开子菜单方向移动时不切换兄弟项
      if (isInSafeTriangle(e.clientX, e.clientY)) return;
      // 不在安全三角内，正常切换
      if (navSiblingTimer) { clearTimeout(navSiblingTimer); navSiblingTimer = null; }
      safeTriangleOrigin = { x: e.clientX, y: e.clientY };
      // 标记当前层级激活项
      if (navPopupChain[level]) {
        navPopupChain[level].activeItemObjectName = item.objectName;
      }
      closeNavPopupsAfter(level + 1);
      const el = (e.currentTarget as HTMLElement);
      const rect = el.getBoundingClientRect();
      const parentBounceLeft = level >= 0 && navPopupChain[level]?.bounceLeft;
      const parentOverrideBucket = navPopupChain[level]?.overrideBucket;
      fetchNavPopup(item.objectName, rect, level + 1, parentBounceLeft, parentOverrideBucket);
    };

    const handleNavPopupItemMove = (e: MouseEvent) => {
      // 鼠标移出安全三角区域时，清除三角数据，让下次mouseenter正常触发
      if (navSiblingTimer) { clearTimeout(navSiblingTimer); navSiblingTimer = null; }
      if (safeTriangleOrigin && !isInSafeTriangle(e.clientX, e.clientY)) {
        safeTriangleOrigin = null;
        safeTriangleSubmenuEdge = null;
      }
    };

    const handleNavPopupItemLeave = () => {
      // 离开弹窗项时不再立即关闭子菜单，安全三角机制会处理兄弟项切换
    };

    const handleNavPopupEnter = () => {
      if (navCloseTimer) { clearTimeout(navCloseTimer); navCloseTimer = null; }
      if (navSiblingTimer) { clearTimeout(navSiblingTimer); navSiblingTimer = null; }
    };

    const handleNavPopupLeaveEvent = () => {
      safeTriangleOrigin = null;
      safeTriangleSubmenuEdge = null;
      scheduleNavClose();
    };

    const scheduleNavClose = () => {
      if (navCloseTimer) clearTimeout(navCloseTimer);
      navCloseTimer = setTimeout(() => {
        navCloseTimer = null;
        closeAllNavPopups();
      }, NAV_CLOSE_DELAY);
    };

    const POPUP_MIN_WIDTH = 100;
    const POPUP_GAP = 4;
    const POPUP_MAX_HEIGHT = 320;
    const NAV_LOADING_DELAY = 500;
    const navPopupLoadingVisible = reactive<boolean[]>([]);
    let navLoadingTimer: ReturnType<typeof setTimeout> | null = null;

    const longestCommonPrefixLen = (names: string[]): number => {
      if (names.length < 2) return 0;
      let len = 0;
      while (len < names[0].length) {
        const ch = names[0][len];
        if (names.every(n => n[len] === ch)) len++;
        else break;
      }
      return len;
    };

    const fetchNavPopup = (prefix: string, anchor: DOMRect | { x: number; y: number }, level: number, forceBounceLeft?: boolean, overrideBucket?: string) => {
      const cleanPrefix = StringUtil.trim(prefix, '/');
      // 虚拟桶模式：popup 用 bucket 名做标识，但 list 时在 bucket 根目录（空前缀）
      const listPrefix = (overrideBucket && cleanPrefix === overrideBucket) ? '' : cleanPrefix;
      closeNavPopupsAfter(level);
      navPopupLoadingVisible.splice(level);
      if (navLoadingTimer) { clearTimeout(navLoadingTimer); navLoadingTimer = null; }
      const _currentConn = configStore.getConnectionById(activeConnectionId.value);
      if (_currentConn) {
        applyStorageContext();
      }
      // 虚拟桶模式：临时切换到 overrideBucket 进行 list，完成后恢复
      if (overrideBucket) {
        storage.setTarget(defaultStorage, overrideBucket, '');
      }
      const restoreTarget = () => {
        if (overrideBucket) {
          storage.setTarget(defaultStorage, activeBucket.value, activePathPrefix.value);
        }
      };
      // 定位计算：第一级跟随鼠标位置，子级贴靠父菜单项右侧
      const isMouseAnchor = 'x' in anchor && !('right' in anchor);
      let x: number, y: number, bounceLeft: boolean, rightOffset: number, bounceUp: boolean, bottomOffset: number;

      if (isMouseAnchor && level === 0) {
        const mx = (anchor as { x: number; y: number }).x;
        const my = (anchor as { x: number; y: number }).y;
        const rightSpace = window.innerWidth - mx;
        bounceLeft = rightSpace < POPUP_MIN_WIDTH + POPUP_GAP;
        x = bounceLeft ? 0 : mx + POPUP_GAP;
        rightOffset = bounceLeft ? window.innerWidth - mx + POPUP_GAP : 0;
        const bottomSpace = window.innerHeight - my;
        bounceUp = bottomSpace < POPUP_MAX_HEIGHT;
        y = bounceUp ? 0 : my;
        bottomOffset = bounceUp ? window.innerHeight - my : 0;
      } else {
        const rect = anchor as DOMRect;
        const rightSpace = window.innerWidth - rect.right;
        bounceLeft = forceBounceLeft || rightSpace < POPUP_MIN_WIDTH + POPUP_GAP;
        x = bounceLeft ? 0 : rect.right + POPUP_GAP;
        rightOffset = bounceLeft ? window.innerWidth - rect.left + POPUP_GAP : 0;
        const bottomSpace = window.innerHeight - rect.bottom;
        bounceUp = bottomSpace < POPUP_MAX_HEIGHT;
        y = bounceUp ? 0 : rect.top;
        bottomOffset = bounceUp ? window.innerHeight - rect.bottom : 0;
      }
      const popup: NavPopup = { prefix: cleanPrefix, items: [], loading: true, maxDisplayLen: Infinity, x, y, bounceLeft, rightOffset, bounceUp, bottomOffset, overrideBucket };
      navPopupChain.push(popup);
      navPopupLoadingVisible.push(false);

      // 延迟显示加载指示器，避免快速响应时的闪烁
      const loadingLevel = level;
      navLoadingTimer = setTimeout(() => {
        navLoadingTimer = null;
        if (navPopupChain[loadingLevel] && navPopupChain[loadingLevel].loading) {
          navPopupLoadingVisible[loadingLevel] = true;
        }
      }, NAV_LOADING_DELAY);

      const cacheKey = `${defaultStorage}::${overrideBucket || activeBucket.value}::${listPrefix}`;

      const processNavPopupDirs = (dirs: NavPopupItem[], level: number, cleanPrefix: string) => {
        if (dirs.length === 0) {
          closeNavPopupsAfter(level);
          return;
        }
        if (navPopupChain[level] && navPopupChain[level].prefix === cleanPrefix) {
          navPopupChain[level].items = dirs;
          const prefixLen = dirs.length > 1 ? longestCommonPrefixLen(dirs.map(d => d.name)) : 0;
          const TRUNCATE_THRESHOLD = 20;
          const MIN_DISTINCT_CHARS = 3;
          const names = dirs.map(d => d.name);
          const maxNameLen = names.reduce((max, n) => Math.max(max, n.length), 0);
          let displayLen: number | typeof Infinity = Infinity;
          if (maxNameLen > TRUNCATE_THRESHOLD && prefixLen < maxNameLen) {
            const perItemLen: number[] = names.map(n => {
              if (n.length <= prefixLen) return n.length;
              const conflicts = names.filter(o => o !== n && o.slice(0, prefixLen) === n.slice(0, prefixLen));
              if (conflicts.length === 0) return n.length;
              let minLen = prefixLen + 1;
              for (; minLen <= n.length; minLen++) {
                const mine = n.slice(0, minLen);
                if (conflicts.every(c => c.slice(0, minLen) !== mine)) break;
              }
              return Math.min(minLen + MIN_DISTINCT_CHARS - 1, n.length);
            });
            displayLen = Math.max(...perItemLen);
          }
          navPopupChain[level].maxDisplayLen = displayLen;
          navPopupChain[level].loading = false;
          if (navPopupLoadingVisible[level]) navPopupLoadingVisible[level] = false;
          if (navLoadingTimer) { clearTimeout(navLoadingTimer); navLoadingTimer = null; }
          const el = document.querySelector('.nav-popup:last-of-type');
          if (el && safeTriangleOrigin) {
            const subRect = el.getBoundingClientRect();
            safeTriangleSubmenuEdge = {
              top: subRect.top,
              bottom: subRect.bottom,
              x: navPopupChain[level].bounceLeft ? subRect.left : subRect.right,
            };
          }
        }
      };

      const cached = navPopupCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < NAV_POPUP_CACHE_TTL) {
        restoreTarget();
        processNavPopupDirs(cached.dirs, level, cleanPrefix);
        return;
      }

      storage.listObjects(defaultStorage, listPrefix, '').then((resp: ListObjectsResponse) => {
        restoreTarget();
        if (!resp.success) {
          closeNavPopupsAfter(level);
          return;
        }
        const dirs: NavPopupItem[] = [];
        resp.objectInfos.forEach(info => {
          if (info.type === 'directory') {
            dirs.push({ name: info.name, objectName: info.objectName, hasSubDirs: true });
          }
        });
        navPopupCache.set(cacheKey, { dirs, timestamp: Date.now() });
        processNavPopupDirs(dirs, level, cleanPrefix);
      }).catch(() => {
        restoreTarget();
        closeNavPopupsAfter(level);
      });
    };

    const handleNavPopupClick = (item: NavPopupItem) => {
      // 虚拟桶模式下，点击弹出项需要先切换到对应 bucket
      const overrideBucket = navPopupChain[0]?.overrideBucket;
      if (overrideBucket) {
        const conn = activeConnection.value;
        if (conn && !conn.bucket) {
          activeBucketMap[conn.id] = overrideBucket;
          applyStorageContext();
        }
      }
      closeAllNavPopups();
      handleStorageListObjects(item.objectName, true);
    };

    // 在 filteredSource 中选取 anchor 到 target 之间的所有 objectName
    const selectRangeKeys = (anchorKey: string, targetKey: string): string[] => {
      const source = filteredSource.value;
      const anchorIdx = source.findIndex(item => item.objectName === anchorKey);
      const targetIdx = source.findIndex(item => item.objectName === targetKey);
      if (anchorIdx === -1 || targetIdx === -1) return [];
      const start = Math.min(anchorIdx, targetIdx);
      const end = Math.max(anchorIdx, targetIdx);
      return source.slice(start, end + 1).map(item => item.objectName);
    };

    const applySelection = (keys: string[]) => {
      const rows = filteredSource.value.filter(item => keys.includes(item.objectName));
      Object.assign(tableState, {
        selectedRowKeys: keys as any,
        selectedRows: rows,
      });
    };

    let shiftHandled = false;

    const handleRowClick = (e: MouseEvent, record: ObjectInfo) => {
      const target = e.target as HTMLElement;
      const isCheckbox = target.closest('.ant-checkbox');
      const isActionColumn = target.closest('.action-column');

      // 复选框点击：不干预（由ant-table row-selection处理）
      if (isCheckbox) return;

      // 操作列点击：不干预选中
      if (isActionColumn) return;

      const key = record.objectName;

      // Shift + 单击：范围多选（从上次锚点到当前点击项）
      if (e.shiftKey && lastClickAnchor.value) {
        const rangeKeys = selectRangeKeys(lastClickAnchor.value, key);
        if (rangeKeys.length > 0) {
          const merged = [...new Set([...tableState.selectedRowKeys as string[], ...rangeKeys])];
          applySelection(merged);
        }
        return;
      }

      // Ctrl + 单击：toggle多选（文件夹也可被选中）
      if (e.ctrlKey || e.metaKey) {
        const currentKeys = [...tableState.selectedRowKeys] as string[];
        const idx = currentKeys.indexOf(key);
        if (idx >= 0) {
          currentKeys.splice(idx, 1);
        } else {
          currentKeys.push(key);
        }
        lastClickAnchor.value = key;
        applySelection(currentKeys);
        return;
      }

      // 单击（无修饰键）：toggle单选，更新锚点
      lastClickAnchor.value = key;
      const currentKeys = [...tableState.selectedRowKeys] as string[];
      if (currentKeys.length === 1 && currentKeys[0] === key) {
        applySelection([]);
      } else {
        applySelection([key]);
      }
    };

    const handleRowDblClick = (e: MouseEvent, record: ObjectInfo) => {
      closeAllNavPopups();
      if (record.type === 'directory') {
        // 虚拟桶目录层：connection 无指定 bucket，且尚未进入任何桶（activeBucket 为空）
        const conn = activeConnection.value;
        if (conn && !conn.bucket && !activeBucket.value) {
          activeBucketMap[conn.id] = record.objectName;
          applyStorageContext();
          handleStorageListObjects('/', true);
          return;
        }
        // 桶内目录导航：使用 record.objectName（完整相对路径）
        handleStorageListObjects(record.objectName, true);
      } else {
        handlePreviewObject(record);
      }
    };

    const filteredSource = computed(() => {
      const kw = tableState.searchKeyword.trim().toLowerCase();
      if (!kw) return tableSource.value;
      return tableSource.value.filter(item => item.name.toLowerCase().includes(kw));
    });
    const filteredSourceLength = computed(() => filteredSource.value.length);
    const tableLocale = computed(() => tableState.loading ? { emptyText: ' ' } : undefined);

    const listLoadMode = computed(() => settingStore.listLoadMode || 'waterfall');
    const waterfallLimit = ref(100);

    const paginatedSource = computed(() => {
      if (listLoadMode.value === 'waterfall') {
        return filteredSource.value.slice(0, waterfallLimit.value);
      }
      const start = (paginationState.current - 1) * paginationState.pageSize;
      const end = start + paginationState.pageSize;
      return filteredSource.value.slice(start, end);
    });

    watch(() => tableState.searchKeyword, () => {
      paginationState.current = 1;
      waterfallLimit.value = 100;
    });

    watch(() => filteredSource.value, (next, prev) => {
      // Only reset window when the dataset identity clearly changes (shrink / empty),
      // not when progressive list pages append more rows.
      const prevLen = Array.isArray(prev) ? prev.length : 0;
      const nextLen = Array.isArray(next) ? next.length : 0;
      if (nextLen === 0 || nextLen < prevLen) {
        waterfallLimit.value = 100;
      }
    });

    onMounted(() => {
      if (tableWrapperRef.value) {
        tableWrapperRef.value.addEventListener('scroll', (e: Event) => {
          const target = e.target as HTMLElement;
          if (target && target.classList && target.classList.contains('ant-table-body')) {
            if (target.scrollTop + target.clientHeight >= target.scrollHeight - 50) {
              if (listLoadMode.value === 'waterfall' && waterfallLimit.value < filteredSource.value.length) {
                waterfallLimit.value += 100;
              }
            }
          }
        }, true);
      }
    });

    const tableHasSelected = computed(() => tableState.selectedRowKeys.length > 0);
    const configDrawerVisible = ref(false);
    const configFabHover = ref(false);

    const activeConfigEnabled = computed(() => {
      const conn = activeConnection.value;
      return !!conn;
    });

    const handleFabTargetToggle = (target: MountTarget) => {
      const conn = activeConnection.value;
      if (!conn) return;
      const targetId = target.id;
      if (mountLoadingMap[targetId]) return;
      const mountTarget = _.cloneDeep(toRaw(target));
      const rawConn = _.cloneDeep(toRaw(conn));
      if (!mountTarget.cacheDirectory || mountTarget.cacheDirectory.trim().length === 0) {
        mountTarget.cacheDirectory = settingStore.defaultCacheDirectory || '';
      }
      mountLoadingMap[targetId] = true;
      const label = target.pathPrefix ? `${target.bucket}/${target.pathPrefix}` : target.bucket;
      if (mountStatusMap[targetId]) {
        auditStore.log('unmount', label, { description: `卸载 ${target.mountPoint}` });
        fuse.umount(rawConn, mountTarget).then((resp) => {
          if (resp.success) { notification.success({ message: `${label} 卸载成功` }); }
          else { console.error('[MOUNT] 卸载失败:', resp.desc); notification.error({ message: `${label} 卸载失败`, description: resp.desc }); }
          refreshMountStatus();
        }).catch((err) => { console.error('[MOUNT] 卸载异常:', err); }).finally(() => { mountLoadingMap[targetId] = false; });
      } else {
        if (!mountTarget.mountPoint) {
          mountLoadingMap[targetId] = false;
          return;
        }
        auditStore.log('mount', label, { description: `挂载 ${target.mountPoint}` });
        native.ensureRclone(settingStore.fuseBin || '').then((ensure) => {
          if (!ensure.success || !ensure.path) {
            throw new Error(ensure.message || '挂载程序不可用，请在系统设置中指定 rclone 路径');
          }
          if (settingStore.fuseBin !== ensure.path) {
            settingStore.fuseBin = ensure.path;
          }
          if (ensure.source === 'downloaded') {
            notification.info({ message: '已自动下载挂载程序', description: '首次挂载会下载 rclone，完成后继续挂载' });
          }
          return fuse.mount(rawConn, mountTarget, ensure.path);
        }).then((resp) => {
          if (resp.success) {
            notification.success({ message: `${label} 挂载成功` });
            // 挂载成功：刷新当前目录（无需验证特定文件）
            scheduleVfsRefresh(tableState.currentDirectory, {});
          }
          else { console.error('[MOUNT] 挂载失败:', resp.desc); notification.error({ message: `${label} 挂载失败`, description: resp.desc }); }
          refreshMountStatus();
        }).catch((err) => {
          console.error('[MOUNT] 挂载异常:', err);
          notification.error({ message: `${label} 挂载失败`, description: err?.message || String(err) });
        }).finally(() => { mountLoadingMap[targetId] = false; });
      }
    };

    const handleFabDefaultToggle = () => {
      if (activeConnectionId.value) {
        const label = activeConnectionLabel.value;
        auditStore.log('config_update', label, { description: `设为默认存储桶` });
        configStore.setDefaultTarget(activeConnectionId.value);
        notification.success({ message: `${label} 已设为默认` });
      }
    };

    const handleFabEnableToggle = () => {
      // 无操作：连接本身没有 enabled 字段，由挂载目标的 enabled 控制
    };

    const handleToggleFlashUpload = () => {
      settingStore.flashUploadEnabled = !settingStore.flashUploadEnabled;
    };

    const tableColumns: TableColumnType<ObjectInfo>[] = [
      {
        title: '文件名',
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
      },
      {
        title: '文件大小',
        dataIndex: 'size',
        key: 'size',
        width: 120,
        ellipsis: false,
        customRender: (opt: any) => {
          const size = opt.record.size;
          return size ? StringUtil.formatFileSize(size) : '-';
        },
      },
      {
        title: '更新时间',
        dataIndex: 'lastModified',
        key: 'lastModified',
        width: 180,
        ellipsis: false,
        customRender: (opt: any) => {
          const date = opt.record.lastModified;
          return date ? StringUtil.formatDate(date) : '-';
        },
      },
      {
        title: '操作',
        dataIndex: 'action',
        key: 'action',
        width: 150,
      },
    ];
    const handleFileTableRowSelect = (record: ObjectInfo, _selected: boolean, _selectedRows: ObjectInfo[], nativeEvent: Event) => {
      const e = nativeEvent as MouseEvent;
      if (e.shiftKey && lastClickAnchor.value) {
        shiftHandled = true;
        const rangeKeys = selectRangeKeys(lastClickAnchor.value, record.objectName);
        if (rangeKeys.length > 0) {
          const merged = [...new Set([...tableState.selectedRowKeys as string[], ...rangeKeys])];
          applySelection(merged);
        }
      } else {
        lastClickAnchor.value = record.objectName;
      }
    };

    const handleFileTableRowSelection = (selectedRowKeys: Key[], selectedRows: ObjectInfo[]) => {
      if (shiftHandled) {
        shiftHandled = false;
        return;
      }
      Object.assign(tableState, {
        selectedRowKeys,
        selectedRows,
      });
    };

    const BREADCRUMB_DEFAULT_TRUNCATE = 6;
    const BREADCRUMB_MAX_TRUNCATE = 12;

    const breadcrumbDisplayNames = computed(() => {
      const dirs = tableState.breadcrumbDirectory;
      if (dirs.length === 0) return [];
      // 当前目录下的同级目录名
      const siblingNames = tableSource.value
        .filter(o => o.type === 'directory')
        .map(o => o.name);
      const prefixLen = siblingNames.length > 1 ? longestCommonPrefixLen(siblingNames) : 0;
      const minTrunc = prefixLen > 0
        ? Math.min(prefixLen + 1, BREADCRUMB_MAX_TRUNCATE)
        : BREADCRUMB_DEFAULT_TRUNCATE;
      return dirs.map((name, idx) => {
        // 最后一级（当前目录）不截断
        if (idx === dirs.length - 1) return name;
        if (name.length <= minTrunc) return name;
        // 截断后需与其它面包屑层级可区分
        let truncLen = minTrunc;
        for (let j = 0; j < dirs.length; j++) {
          if (j === idx || j === dirs.length - 1) continue;
          const other = dirs[j];
          if (other.length > truncLen) {
            const cp = longestCommonPrefixLen([name, other]);
            if (cp >= truncLen) {
              truncLen = Math.min(cp + 1, BREADCRUMB_MAX_TRUNCATE);
            }
          }
        }
        if (name.length <= truncLen) return name;
        return name.substring(0, truncLen) + '…';
      });
    });

    const breadcrumbVisibleNames = computed(() => {
      const truncated = breadcrumbDisplayNames.value;
      const dirs = tableState.breadcrumbDirectory;
      return truncated.map((name, i) => {
        if (breadcrumbExpandedIndex.value === i && name !== dirs[i]) return dirs[i];
        return name;
      });
    });

    const onClickBreadCrumb = (v: string, i: number) => {
      if (i == tableState.breadcrumbDirectory.length - 1) return;
      const prefix = tableState.breadcrumbDirectory.splice(0, i + 1).join('/');
      handleStorageListObjects(prefix, true);
    };

    const handleBreadcrumbHome = () => {
      const conn = activeConnection.value;
      if (conn && !conn.bucket && activeBucket.value) {
        // 虚拟桶模式：Home 回到桶列表视图
        activeBucketMap[conn.id] = '';
        applyStorageContext();
      }
      handleStorageListObjects('/', true);
    };

    // 虚拟桶模式下点击 bucket 层级：回到该桶根目录
    const handleBreadcrumbVirtualBucket = () => {
      handleStorageListObjects('/', true);
    };

    // ── 面包屑末端：复制 & 编辑路径 ──
    const breadcrumbEditing = ref(false);
    const breadcrumbEditValue = ref('');
    const breadcrumbEditInputRef = ref<any>(null);
    const breadcrumbHovering = ref(false);
    const breadcrumbExpandedIndex = ref(-1);
    const pathHistoryVisible = ref(false);
    const pathHistorySuggestions = ref<string[]>([]);
    const PATH_HISTORY_LIMIT = 30;

    const getBreadcrumbFullPath = (): string => {
      const bucket = activeBucket.value;
      const prefix = activePathPrefix.value;
      const dir = tableState.searchDirectory;
      const parts: string[] = [];
      if (bucket) parts.push(bucket);
      if (prefix) parts.push(prefix);
      if (dir && dir !== '/') parts.push(dir.replace(/^\/+/, '').replace(/\/+$/, ''));
      return parts.join('/');
    };

    const normalizeInputPath = (path: string) => path
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');

    const pathStartsWith = (parts: string[], prefixParts: string[]) =>
      prefixParts.length > 0 && prefixParts.every((part, index) => parts[index] === part);

    const getPathHistoryKey = (bucket: string) => {
      const connId = activeConnectionId.value || 'default';
      return `bucketview:path-history:v1:${encodeURIComponent(connId)}:${encodeURIComponent(bucket || '__buckets__')}`;
    };

    const readPathHistory = (bucket: string) => {
      try {
        const raw = localStorage.getItem(getPathHistoryKey(bucket));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
      } catch {
        return [];
      }
    };

    const refreshPathHistorySuggestions = (bucket: string = activeBucket.value || activeConnection.value?.bucket || '') => {
      pathHistorySuggestions.value = bucket ? readPathHistory(bucket) : [];
    };

    const getCurrentPathHistoryBucket = () => activeBucket.value || activeConnection.value?.bucket || '';

    const makePathHistoryDisplay = (bucket: string, path: string) => {
      const conn = activeConnection.value;
      const parts: string[] = [];
      if (bucket) parts.push(bucket);
      if (conn?.bucket && conn.pathPrefix) {
        parts.push(...normalizeInputPath(conn.pathPrefix).split('/').filter(Boolean));
      }
      const normalizedPath = normalizeInputPath(path === '/' ? '' : path);
      if (normalizedPath) parts.push(...normalizedPath.split('/'));
      return parts.join('/');
    };

    const addPathHistory = (bucket: string, path: string, displayPath?: string) => {
      if (!bucket) return;
      const normalized = normalizeInputPath(displayPath || makePathHistoryDisplay(bucket, path));
      if (!normalized) return;
      const existing = readPathHistory(bucket);
      const next = [normalized, ...existing.filter(item => item !== normalized)].slice(0, PATH_HISTORY_LIMIT);
      try {
        localStorage.setItem(getPathHistoryKey(bucket), JSON.stringify(next));
      } catch {}
      if (bucket === (activeBucket.value || activeConnection.value?.bucket || '')) {
        pathHistorySuggestions.value = next;
      }
    };

    const removePathHistory = (path: string) => {
      const bucket = getCurrentPathHistoryBucket();
      if (!bucket) return;
      const normalized = normalizeInputPath(path);
      const next = readPathHistory(bucket).filter(item => normalizeInputPath(item) !== normalized);
      try {
        localStorage.setItem(getPathHistoryKey(bucket), JSON.stringify(next));
      } catch {}
      pathHistorySuggestions.value = next;
      pathHistoryVisible.value = next.length > 0;
    };

    const filteredPathHistorySuggestions = computed(() => {
      const query = normalizeInputPath(breadcrumbEditValue.value).toLowerCase();
      return pathHistorySuggestions.value
        .filter(path => !query || path.toLowerCase().includes(query))
        .slice(0, 8);
    });

    watch([activeConnectionId, activeBucket], () => {
      refreshPathHistorySuggestions();
    }, { immediate: true });

    const resolveBreadcrumbInputPath = (value: string) => {
      const conn = activeConnection.value;
      if (!conn) return null;
      const raw = value.trim().replace(/\\/g, '/');
      const normalized = normalizeInputPath(raw);
      if (!normalized) {
        return {
          bucket: conn.bucket || '',
          path: '/',
          displayPath: conn.bucket ? makePathHistoryDisplay(conn.bucket, '/') : '',
        };
      }

      let parts = normalized.split('/').filter(Boolean);
      if (conn.bucket) {
        if (parts[0] === conn.bucket) parts = parts.slice(1);
        const prefixParts = normalizeInputPath(conn.pathPrefix || '').split('/').filter(Boolean);
        if (pathStartsWith(parts, prefixParts)) {
          parts = parts.slice(prefixParts.length);
        }
        const path = parts.join('/') || '/';
        return { bucket: conn.bucket, path, displayPath: makePathHistoryDisplay(conn.bucket, path) };
      }

      const currentBucket = activeBucket.value;
      if (!currentBucket || raw.startsWith('/')) {
        const bucket = parts[0] || '';
        const path = parts.slice(1).join('/') || '/';
        return { bucket, path, displayPath: makePathHistoryDisplay(bucket, path) };
      }

      if (parts[0] === currentBucket) {
        const path = parts.slice(1).join('/') || '/';
        return { bucket: currentBucket, path, displayPath: makePathHistoryDisplay(currentBucket, path) };
      }

      const path = parts.join('/') || '/';
      return { bucket: currentBucket, path, displayPath: makePathHistoryDisplay(currentBucket, path) };
    };

    const handleBreadcrumbCopy = () => {
      const path = getBreadcrumbFullPath();
      if (!path) return;
      native.writeClipboard(path);
      notification.success({ message: '路径已复制' });
    };

    const handleCopyObjectPath = (target: ObjectInfo) => {
      native.writeClipboard(target.objectName);
      notification.success({ message: '路径已复制', description: target.objectName });
    };

    const handleBreadcrumbEdit = () => {
      breadcrumbEditValue.value = getBreadcrumbFullPath();
      refreshPathHistorySuggestions();
      pathHistoryVisible.value = true;
      breadcrumbEditing.value = true;
      nextTick(() => {
        breadcrumbEditInputRef.value?.focus();
        breadcrumbEditInputRef.value?.select?.();
      });
    };

    const handleBreadcrumbEditSubmit = () => {
      const resolved = resolveBreadcrumbInputPath(breadcrumbEditValue.value);
      breadcrumbEditing.value = false;
      pathHistoryVisible.value = false;
      if (!resolved) return;
      const conn = activeConnection.value;
      if (conn && !conn.bucket && activeBucketMap[conn.id] !== resolved.bucket) {
        activeBucketMap[conn.id] = resolved.bucket;
        applyStorageContext();
      }
      addPathHistory(resolved.bucket, resolved.path, resolved.displayPath);
      handleStorageListObjects(resolved.path, true);
    };

    const handlePathHistorySelect = (path: string) => {
      breadcrumbEditValue.value = path;
      pathHistoryVisible.value = false;
      handleBreadcrumbEditSubmit();
    };

    const handleBreadcrumbEditBlur = () => {
      // 延迟关闭，避免 mousedown 触发 submit 后 blur 又关闭导致 submit 逻辑被跳过
      setTimeout(() => {
        breadcrumbEditing.value = false;
        pathHistoryVisible.value = false;
      }, 100);
    };

    const cancelBackgroundListLoad = () => {
      try { listAbortController?.abort(); } catch {}
      listRequestId += 1;
      listLoadingMore.value = false;
      tableState.refreshing = false;
      tableState.nextContinuationToken = null;
    };

    const handleStorageListObjects = (
      searchDirectory: string = '',
      trackNav: boolean = false,
      silent: boolean = false,
    ) => {
      // 非静默的列表刷新都关闭 hover popup（静默刷新不关闭，避免周期刷新误杀）
      if (!silent) closeAllNavPopups();
      // 不再每次 listObjects 都调用 changeConfig/setTarget，
      // 存储上下文由 applyStorageContext 统一管理
      const requestId = ++listRequestId;
      try { listAbortController?.abort(); } catch {}
      listAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const abortSignal = listAbortController?.signal;
      if (!silent) {
        handleFileTableRowSelection([], []);
        lastClickAnchor.value = null;
        tableState.searchKeyword = '';
        tableState.loading = true;
      } else {
        tableState.refreshing = true;
      }
      if (typeof searchDirectory === 'string' && searchDirectory.length > 0) {
        tableState.searchDirectory = searchDirectory;
      }

      tableState.currentDirectory = StringUtil.trim(tableState.searchDirectory, '/');
      if (trackNav) pushNav(tableState.currentDirectory);
      const bcRaw = StringUtil.trim(tableState.currentDirectory, '/').split('/');
      tableState.breadcrumbDirectory = bcRaw.filter(s => s.length > 0);
      if (!silent) {
        setTableSource([]);
        tableState.nextContinuationToken = '';
        listLoadedPages.value = 0;
        listLoadingMore.value = false;
      }

      // Progressive list loading:
      // 1) first page paints ASAP
      // 2) remaining pages continue in background
      // 3) switching directory bumps listRequestId and cancels stale pages
      // 4) silent refresh rebuilds into a fresh buffer (never append onto old rows)
      const buffer: ObjectInfo[] = [];
      const seenObjectNames = new Set<string>();
      let pages = 0;
      let firstPaintDone = false;

      const persistBucketState = (token: string | null) => {
        bucketStateMap[activeConnectionId.value] = {
          tableSource: [...tableSource.value],
          currentDirectory: tableState.currentDirectory,
          searchDirectory: tableState.searchDirectory,
          breadcrumbDirectory: [...tableState.breadcrumbDirectory],
          searchKeyword: tableState.searchKeyword,
          nextContinuationToken: token,
          paginationCurrent: paginationState.current,
        };
      };

      const applyListResult = async (source: ObjectInfo[], token: string | null, opts?: { final?: boolean; error?: boolean }) => {
        // Safety net: unique by objectName before sort/compact/paint.
        const deduped: ObjectInfo[] = [];
        const seen = new Set<string>();
        for (const item of source) {
          const key = item.objectName || item.name;
          if (!key || seen.has(key)) continue;
          seen.add(key);
          deduped.push(item);
        }
        sortObjectInfos(deduped);
        const compactedSource = await compactDirectoryChains(deduped);
        if (requestId !== listRequestId) return;
        sortObjectInfos(compactedSource);
        setTableSource([...compactedSource]);
        tableState.nextContinuationToken = token;
        listLoadedPages.value = pages;
        if (!silent) tableState.loading = false;
        // Keep a light "loading more" indicator while background pages continue.
        listLoadingMore.value = !opts?.final && !!token;
        if (opts?.final || !token) {
          tableState.refreshing = false;
          listLoadingMore.value = false;
        }
        persistBucketState(token);
      };

      const appendPageObjects = (objectInfos: ObjectInfo[]) => {
        for (const objectInfo of objectInfos) {
          const key = objectInfo.objectName || objectInfo.name;
          if (!key || seenObjectNames.has(key)) continue;
          if (
            tableState.currentDirectory == objectInfo.objectName.split('/').slice(0, -1).join('/') ||
            objectInfo.type == 'directory'
          ) {
            seenObjectNames.add(key);
            buffer.push(objectInfo);
          }
        }
      };

      const fetchPage = (token: string | null) => {
        if (requestId !== listRequestId) return;
        storage
          .listObjects(defaultStorage, tableState.currentDirectory, token, abortSignal ? { abortSignal } : undefined)
          .then(async (resp: ListObjectsResponse) => {
            if (requestId !== listRequestId) return;
            if (!resp.success) {
              if (resp.desc === 'aborted' || abortSignal?.aborted) return;
              if (!silent || !firstPaintDone) {
                notification.error({ message: '加载失败', description: resp.desc });
              }
              await applyListResult(buffer, null, { final: true, error: true });
              return;
            }

            pages += 1;
            appendPageObjects(resp.objectInfos || []);

            const nextToken = resp.nextContinuationToken || null;
            // Paint first page immediately; then every 2 pages, and always on the final page.
            // Avoid applying twice on the last page (previous code had a trailing final apply).
            const shouldPaint = !firstPaintDone || !nextToken || pages % 2 === 0;
            if (shouldPaint) {
              firstPaintDone = true;
              await applyListResult(buffer, nextToken, { final: !nextToken });
            } else {
              tableState.nextContinuationToken = nextToken;
              listLoadedPages.value = pages;
              listLoadingMore.value = !!nextToken;
            }

            if (nextToken) {
              // Yield to UI thread between S3 pages.
              setTimeout(() => {
                if (requestId === listRequestId) fetchPage(nextToken);
              }, 0);
            }
          })
          .catch(async (error) => {
            if (requestId !== listRequestId) return;
            const msg = error instanceof Error ? error.message : String(error || '');
            if (abortSignal?.aborted || /abort/i.test(msg)) return;
            console.warn('[listObjects] page failed:', error);
            await applyListResult(buffer, null, { final: true, error: true });
          });
      };

      fetchPage('');
    };

    const handleStorageCreateDirectory = () => {
      if (mkdirModalState.directoryPath.length > 0) {
        storage
          .createDirectory(defaultStorage, `${tableState.currentDirectory}/${mkdirModalState.directoryPath}`)
          .then((resp) => {
            if (!resp.success) {
              notification['error']({
                message: `创建目录失败`,
                description: resp.desc,
              });
            }
          })
          .finally(() => {
            mkdirModalState.visible = false;
            // 验证新目录出现在挂载文件夹
            scheduleVfsRefresh(tableState.currentDirectory, { expectAdded: [mkdirModalState.directoryPath] });
            handleStorageListObjects('', false, true);
          });
      }
    };

    const handleStorageDeleteObjects = (objectNames: string[] = []) => {
      if (objectNames.length == 0 || (objectNames.length == 1 && !objectNames[0])) {
        objectNames = [];
        for (let index = 0; tableState.selectedRowKeys.length > index; index++) {
          objectNames[index] = tableState.selectedRowKeys[index]?.toString();
        }
      }

      if (objectNames.length == 0) return;

      // 构建删除确认内容：数量摘要 + 文件列表
      const maxShow = 5;
      const displayNames = objectNames.slice(0, maxShow).map(n => n.split('/').pop() || n);
      const listVNodes = displayNames.map(n =>
        createVNode('div', { style: 'padding:1px 0;font-size:11px;line-height:15px;color:#6b7280' }, n)
      );
      if (objectNames.length > maxShow) {
        listVNodes.push(
          createVNode('div', { style: 'padding:1px 0;font-size:11px;line-height:15px;color:#9ca3af' }, `…等 ${objectNames.length} 个对象`)
        );
      }

      Modal.confirm({
        title: `确认删除 ${objectNames.length} 个对象吗？`,
        icon: createVNode(ExclamationCircleOutlined),
        content: createVNode('div', null, listVNodes),
        okText: '删除',
        cancelText: '取消',
        onOk: () => {
          storage.deleteObject(defaultStorage, objectNames).then((resp) => {
            handleFileTableRowSelection([], []);
            if (resp.success) {
              const prefix = tableState.currentDirectory;
              if (prefix == tableState.currentDirectory) {
                objectNames.forEach((objectName) => {
                  {
                    const next = tableSource.value.filter((objInfo) => objInfo.objectName != objectName);
                    setTableSource(next);
                  }
                });
              }
              // 精准 VFS 刷新：失效被删文件缓存 + 验证删除结果
              scheduleVfsRefresh(tableState.currentDirectory, { forgetFiles: objectNames, expectDeleted: objectNames });
              notification['success']({
                message: `删除成功`,
                description: `已删除 ${objectNames.length} 个对象`,
              });
              auditStore.log('delete', activeConnectionLabel.value, { objectName: objectNames.join(', '), description: `删除 ${objectNames.length} 个对象` });
            } else {
              notification['error']({
                message: `删除失败`,
                description: `${objectNames}: ${resp.desc}`,
              });
            }
          });
        },
      });
    };

    const handleStorageSignObject = (objectName: string) => {
      auditStore.log('copy', activeConnectionLabel.value, { objectName, description: '复制链接' });
      storage.signObject(defaultStorage, objectName).then((resp: SignObjectResponse) => {
        if (resp.success) {
          native.writeClipboard(resp.url);
          notification['success']({
            message: `签名成功`,
            description: '已复制到剪切板',
          });
          return;
        }
        notification['error']({
          message: `签名失败`,
          description: resp.desc,
        });
      });
    };

    // Coalesce high-frequency transfer progress events to one UI write per frame.
    const pendingTransferProgress = new Map<string, any>();
    let transferProgressRaf = 0;
    const flushTransferProgressPatches = () => {
      transferProgressRaf = 0;
      pendingTransferProgress.forEach((patch, uid) => {
        const current = transferStore.queue[uid];
        if (!current) return;
        if (current.status === 'success' || current.status === 'error' || current.status === 'cancel') return;
        Object.assign(current, patch);
      });
      pendingTransferProgress.clear();
    };
    const applyTransferProgressPatch = (uid: string, patch: Record<string, any>) => {
      const prev = pendingTransferProgress.get(uid) || {};
      pendingTransferProgress.set(uid, { ...prev, ...patch });
      if (!transferProgressRaf) {
        transferProgressRaf = (typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(flushTransferProgressPatches)
          : setTimeout(flushTransferProgressPatches, 16) as unknown as number);
      }
    };

    const handlerUploadCallback = (event: any) => {
      const { uid, prefix } = event;
      const tmpTransferInfo = transferStore.queue[uid];
      if (!tmpTransferInfo) return;
      if (
        tmpTransferInfo.status == 'success' ||
        tmpTransferInfo.status == 'error' ||
        tmpTransferInfo.status == 'cancel'
      )
        return;

      switch (event.status) {
        case 'success':
          pendingTransferProgress.delete(uid);
          // 当前目录或其子路径下的上传完成都应刷新列表
          const cleanPrefix = StringUtil.trim(prefix || '', '/');
          const currentDir = tableState.currentDirectory;
          const transferEvent = { ...tmpTransferInfo, ...event };
          if (isTransferForActiveContext(transferEvent) && (cleanPrefix === currentDir || cleanPrefix.startsWith(currentDir ? currentDir + '/' : ''))) {
            if (tableRefreshTimer) clearTimeout(tableRefreshTimer);
            tableRefreshTimer = setTimeout(() => {
              handleStorageListObjects(currentDir, false, true);
              tableRefreshTimer = null;
            }, 1500);
            // 上传完成：失效旧文件缓存 + 验证新文件出现在挂载目录
            const uploadedName = event.objectName || event.name || '';
            scheduleVfsRefresh(cleanPrefix, { forgetFiles: uploadedName ? [uploadedName] : [], expectAdded: uploadedName ? [uploadedName] : [] });
          } else if (transferEvent.connectionId) {
            delete bucketStateMap[transferEvent.connectionId];
          }

          Object.assign(transferStore.queue[uid], {
            status: 'success',
            percentage: 100,
            completedAt: Date.now(),
          });

          if (uid === previewModalState.textSaveUid) {
            notification['success']({
              message: `保存成功`,
              description: event.name || event.objectName,
            });
            previewModalState.textSaveUid = '';
          }

          break;
        case 'error':
          pendingTransferProgress.delete(uid);
          Object.assign(transferStore.queue[uid], {
            status: 'error',
            errorDesc: event.desc || '未知错误',
            percentage: 100,
            completedAt: Date.now(),
          });

          notification['error']({
            message: `上传失败`,
            description: event.desc,
          });
          break;
        case 'running':
          applyTransferProgressPatch(uid, {
            status: 'running',
            percentage: event.percentage,
            speed: event.speed,
            remaining: event.remaining,
            consumedBytes: event.consumedBytes,
            totalBytes: event.totalBytes,
          });
          break;
      }
    };

    const uploadFile = async (transferContext: TransferContextSnapshot, prefix: string, filename: string, filesize: number, fileMtime: number) => {
      const uid = uuidv4();
      const objectName = StringUtil.trim(`${prefix}/${native.pathBasename(filename)}`, '/');
      const name = native.pathBasename(filename);

      auditStore.log('upload', transferContext.connectionLabel, { objectName, description: name });

      const t = withTransferContext({
        type: 'upload',
        uid: uid,
        localPath: filename,
        prefix: prefix,
        objectName: objectName,
        name: name,
        status: 'waiting',
        totalBytes: filesize,
        createdAt: Date.now(),
      }, transferContext);

      // Flash upload check
      const threshold = (settingStore.flashUploadThresholdMB ?? 50) * 1024 * 1024;
      if (settingStore.flashUploadEnabled && filesize >= threshold && isTransferForActiveContext(t)) {
        try {
          const resp = await storage.headObject(defaultStorage, objectName);
          if (resp.exists && resp.size === filesize) {
            // 本地文件修改时间 ≤ 远端修改时间 → 文件未变更，跳过上传（容差1s）
            const remoteMtime = resp.lastModified ? resp.lastModified.getTime() : 0;
            if (fileMtime <= remoteMtime + 1000) {
              t.status = 'skipped';
              t.totalBytes = resp.size;
              t.percentage = '100';
              t.completedAt = Date.now();
              transferStore.setRecord(uid, t);
              return;
            }
          }
        } catch {
          // headObject failed → proceed with normal upload
        }
      }

      transferStore.setRecord(uid, t);
      storage.putObject(defaultStorage, t);
    };


    const handleUpload = async () => {
      const prefix = tableState.currentDirectory;
      const transferContext = createTransferContextSnapshot(prefix);
      if (!transferContext) return;
      const filenames = await native.getLocalFiles(prefix);
      if (!filenames || filenames.length == 0) return;
      filenames.forEach((transferFile) => {
        uploadFile(transferContext, transferFile.prefix, transferFile.name, transferFile.size, transferFile.lastModified);
      });
    };

    const handleUploadToDirectory = async (record: ObjectInfo) => {
      const conn = activeConnection.value;
      // 虚拟桶模式：右键点击桶目录时，需要先切换到该桶
      const isVirtualBucketDir = conn && !conn.bucket && !activeBucket.value && record.type === 'directory';
      if (isVirtualBucketDir) {
        activeBucketMap[conn.id] = record.objectName;
        applyStorageContext();
      }
      // 虚拟桶列表中的桶条目：objectName 就是桶名，上传到桶根目录所以 prefix 为空
      const prefix = isVirtualBucketDir ? '' : StringUtil.trim(record.objectName, '/');
      const transferContext = createTransferContextSnapshot(prefix);
      if (!transferContext) return;
      const filenames = await native.getLocalFiles(prefix);
      if (!filenames || filenames.length == 0) return;
      filenames.forEach((transferFile) => {
        uploadFile(transferContext, StringUtil.trim(transferFile.prefix, '/'), transferFile.name, transferFile.size, transferFile.lastModified);
      });
    };

    const loadTextPreview = (objInfo: ObjectInfo) => {
      const TEXT_THRESHOLD = 2 * 1024 * 1024;
      Promise.all([
        storage.headObject(defaultStorage, objInfo.objectName),
        storage.signObject(defaultStorage, objInfo.objectName),
      ]).then(([headResp, signResp]) => {
        if (!signResp.success) {
          notification['error']({ message: `签名失败`, description: signResp.desc });
          return;
        }
        previewModalState.previewFilePath = signResp.url;
        const size = headResp.exists ? (headResp.size || 0) : 0;
        if (size > TEXT_THRESHOLD) {
          previewModalState.chunked = true;
          previewModalState.fileSize = size;
        }
        void presentPreparedPreview();
      });
    };

    const forcePreviewAsText = (objInfo: any) => {
      if (!objInfo) return;
      previewModalState.visible = false;
      previewModalState.fileType = 'text';
      loadTextPreview(objInfo);
    };

    const handlePreviewObject = (objInfo: ObjectInfo) => {
      const ext = getFileExtenstion(objInfo.objectName);
      const fileType = getFileType(ext);

      previewModalState.objectName = objInfo.name;
      previewModalState.objectInfo = objInfo;
      previewModalState.context = createTransferContextSnapshot(tableState.currentDirectory);
      previewModalState.fileExtension = ext || '';
      previewModalState.fileType = fileType;
      previewModalState.chunked = false;
      previewModalState.fileSize = 0;
      officePresentationMode.value = false;

      if (fileType === 'image') {
        const imageObjects = tableSource.value.filter(
          item => item.type !== 'directory' && getFileType(getFileExtenstion(item.objectName) || '') === 'image'
        );
        const idx = imageObjects.findIndex(item => item.objectName === objInfo.objectName);
        galleryStartIndex.value = idx >= 0 ? idx : 0;

        Promise.all(imageObjects.map(item => storage.signObject(defaultStorage, item.objectName)))
          .then((results) => {
            const signedImages = results.map((result, index) => ({
              objectName: imageObjects[index].objectName,
              name: imageObjects[index].name,
              url: result.success ? result.url : '',
              size: imageObjects[index].size,
            })).filter(item => item.url);
            const selectedIndex = signedImages.findIndex(item => item.objectName === objInfo.objectName);
            galleryStartIndex.value = selectedIndex >= 0 ? selectedIndex : 0;
            galleryImages.value = signedImages.map(({ name, url, size }) => ({ name, url, size }));
            previewModalState.previewFilePath = galleryImages.value[galleryStartIndex.value]?.url || '';
            if (!previewModalState.previewFilePath) {
              notification['error']({ message: '图片预览失败', description: '未能获取可用的图片访问地址' });
              return;
            }
            void presentPreparedPreview();
          });
        return;
      }

      // 文本文件
      if (fileType === 'text') {
        loadTextPreview(objInfo);
        return;
      }

      storage.signObject(defaultStorage, objInfo.objectName).then((resp: SignObjectResponse) => {
        if (resp.success) {
          previewModalState.previewFilePath = resp.url;
          void presentPreparedPreview();
          return;
        }
        notification['error']({
          message: `签名失败`,
          description: resp.desc,
        });
      });
    };

    const handleTextPreviewClose = () => {
      if (textEditorDirty.value) {
        Modal.confirm({
          title: '未保存的修改',
          content: '文件已修改但未保存，确定要关闭吗？',
          okText: '关闭',
          cancelText: '继续编辑',
          onOk: () => {
            textEditorDirty.value = false;
            previewModalState.visible = false;
          },
        });
      } else {
        previewModalState.visible = false;
      }
    };

    const handleTextSaveContent = (content: string) => {
      handleTextSave(content);
    };

    const handleTextSave = async (content?: string) => {
      if (!textEditorRef.value && typeof content !== 'string') return;
      const text = typeof content === 'string' ? content : textEditorRef.value?.getCurrentContent?.();
      if (typeof text !== 'string') return;

      textSaving.value = true;
      try {
        const objectName = previewModalState.objectInfo?.objectName;
        if (!objectName) return;

        const filename = native.pathBasename(objectName);
        const tmpPath = native.writeTempFile(filename, text);

        const transferContext = previewModalState.context || createTransferContextSnapshot(tableState.currentDirectory);
        if (!transferContext) return;

        const uid = uuidv4();
        previewModalState.textSaveUid = uid;
        const t = withTransferContext({
          type: 'upload',
          uid,
          localPath: tmpPath,
          prefix: transferContext.sourceDirectory,
          objectName,
          name: filename,
          status: 'waiting',
          totalBytes: text.length,
          createdAt: Date.now(),
        }, transferContext);
        transferStore.setRecord(uid, t);
        storage.putObject(defaultStorage, t);

        textEditorRef.value?.markSaved?.();
        textEditorDirty.value = false;
        auditStore.log('upload', transferContext.connectionLabel, { objectName, description: '在线编辑保存' });
      } catch (err: any) {
        notification['error']({ message: '保存失败', description: err.message || String(err) });
      } finally {
        textSaving.value = false;
      }
    };

    const handlerDownloadCallback = (event: any) => {
      const uid = event.uid;
      const tmpTransferInfo = transferStore.queue[uid];
      if (!tmpTransferInfo) return;
      // Ignore all events for cancelled, success, or error transfers
      if (
        tmpTransferInfo.status == 'success' ||
        tmpTransferInfo.status == 'error' ||
        tmpTransferInfo.status == 'cancel'
      )
        return;
      switch (event.status) {
        case 'success':
          pendingTransferProgress.delete(uid);
          Object.assign(transferStore.queue[uid], {
            status: 'success',
            percentage: 100,
            completedAt: Date.now(),
          });
          break;
        case 'error':
          pendingTransferProgress.delete(uid);
          Object.assign(transferStore.queue[uid], {
            status: 'error',
            errorDesc: event.desc || '未知错误',
            completedAt: Date.now(),
          });
          notification['error']({
            message: `下载失败`,
            description: event.name,
          });
          break;
        case 'running':
          // Only update progress if consumedBytes is monotonically increasing
          // This prevents stale events from old download instances
          if (tmpTransferInfo.consumedBytes != undefined && event.consumedBytes < tmpTransferInfo.consumedBytes) {
            return;
          }
          applyTransferProgressPatch(uid, {
            status: 'running',
            percentage: event.percentage,
            speed: event.speed,
            remaining: event.remaining,
            consumedBytes: event.consumedBytes,
            totalBytes: event.totalBytes,
          });
          break;
      }
    };

    const handleStorageGetObject = (objInfo: ObjectInfo, saveFolders: string[] = []) => {
      if (!objInfo.objectName) {
        notification['error']({
          message: `下载对象失败`,
          description: `${objInfo.name}: 未知的文件对象`,
        });
        return;
      }

      const transferContext = createTransferContextSnapshot(tableState.currentDirectory);
      if (!transferContext) return;
      auditStore.log('download', transferContext.connectionLabel, { objectName: objInfo.objectName, description: objInfo.name });

      if (saveFolders.length == 0) {
        const defaultDir = settingStore.defaultDownloadDirectory;
        if (defaultDir) {
          saveFolders = [defaultDir];
        } else {
          saveFolders = native.getLocalSaveFolder();
          if (!saveFolders || saveFolders.length == 0) {
            return;
          }
        }
      }
      const uid = uuidv4();
      const rawLocalPath = `${saveFolders[0]}/${objInfo.name}`;
      // If file already exists locally, compute a non-conflicting path
      // with "(n)" inserted before the LAST extension dot
      const localPath = native.resolveUniquePath(rawLocalPath);
      const downloadTask = withTransferContext({
        type: 'download',
        uid: uid,
        localPath: localPath,
        prefix: tableState.currentDirectory,
        objectName: objInfo.objectName,
        name: objInfo.name,
        status: 'waiting',
        totalBytes: objInfo.size,
        createdAt: Date.now(),
      }, transferContext);
      transferStore.setRecord(uid, downloadTask);
      storage.getObject(defaultStorage, downloadTask);

      notification['success']({
        message: localPath !== rawLocalPath ? `添加下载任务（本地已有同名文件，已重命名）` : `添加下载任务`,
        description: objInfo.objectName,
      });
    };

    const handleStorageGetObjects = () => {
      if (tableState.selectedRowKeys.length == 0) return;

      const defaultDir = settingStore.defaultDownloadDirectory;
      const saveFolders = defaultDir ? [defaultDir] : native.getLocalSaveFolder();
      if (!saveFolders || saveFolders.length == 0) {
        return;
      }
      tableState.selectedRows.forEach((objInfo) => {
        if (objInfo.type != 'directory') handleStorageGetObject(objInfo, saveFolders);
      });

      Object.assign(tableState, {
        selectedRowKeys: [],
      });
    };

    const handlePaginationChange = (pageNumber: number) => {
      paginationState.current = pageNumber;
      handleFileTableRowSelection([], []);
    };

    const handlePaginationSizeChange = (_current: number, size: number) => {
      paginationState.pageSize = size;
      paginationState.current = 1;
      handleFileTableRowSelection([], []);
    };

    // 初始化加载
    try {
      const initActiveConn = configStore.getConnectionById(activeConnectionId.value);
      if (activeConnectionId.value && initActiveConn) {
        handleStorageListObjects('/', true);
      } else if (connections.value.length > 0) {
        const firstConn = connections.value[0];
        configStore.setActiveConnection(firstConn.id);
        handleStorageListObjects('/', true);
      }
    } catch (e) {
      console.error('[FileManage] init error:', e);
    }

    const configDrawerRef = ref<any>(null);

    // Sidebar Context Menu State
    const hotbarContextMenu = reactive({
      visible: false,
      x: 0,
      y: 0,
      conn: null as Connection | null,
    });

    const handleHotbarContextMenu = (e: MouseEvent, conn: Connection) => {
      hideContextMenu();
      hideTabContextMenu();
      hotbarContextMenu.conn = conn;
      hotbarContextMenu.x = e.clientX;
      hotbarContextMenu.y = e.clientY;
      hotbarContextMenu.visible = true;
      clampMenuPosition(hotbarContextMenu);
    };

    const hideHotbarContextMenu = () => {
      hotbarContextMenu.visible = false;
      hotbarContextMenu.conn = null;
    };

    const handleHotbarMenuEdit = (conn: Connection | null) => {
      if (!conn) return;
      configDrawerVisible.value = true;
      nextTick(() => {
        if (configDrawerRef.value && configDrawerRef.value.handleEditConnection) {
          configDrawerRef.value.handleEditConnection(conn);
        }
      });
    };

    const handleHotbarMenuGroup = (conn: Connection | null) => {
      if (!conn) return;
      const currentGroup = conn.group || '';
      let inputGroup = currentGroup;
      Modal.confirm({
        title: '设置分组',
        content: () => createVNode('div', { style: 'margin-top: 16px' }, [
          createVNode(AutoComplete, {
            value: inputGroup,
            options: existingGroupOptions.value,
            placeholder: '默认分组',
            size: 'small',
            allowClear: true,
            style: { width: '100%' },
            filterOption: (input: string, option: any) => String(option?.value || '').toLowerCase().includes(String(input || '').toLowerCase()),
            'onUpdate:value': (value: string) => { inputGroup = value || ''; },
          })
        ]),
        onOk() {
          const index = configStore.connections.findIndex(c => c.id === conn.id);
          if (index >= 0) {
            configStore.connections[index].group = inputGroup.trim();
          }
        }
      });
    };

    const hasMounts = (conn: Connection | null) => {
      if (!conn) return false;
      return configStore.mountTargets.some(t => t.connectionId === conn.id);
    };

    const handleHotbarMenuMount = (conn: Connection | null) => {
      if (!conn) return;
      const targets = configStore.mountTargets.filter(t => t.connectionId === conn.id);
      if (targets.length === 0) return;
      if (configDrawerRef.value && configDrawerRef.value.handleMount) {
        targets.forEach(t => {
          configDrawerRef.value.handleMount(conn, t);
        });
      }
    };

    return {
      configDrawerRef,
      hotbarContextMenu,
      handleHotbarContextMenu,
      hideHotbarContextMenu,
      handleHotbarMenuEdit,
      handleHotbarMenuGroup,
      handleHotbarMenuMount,
      hasMounts,
      configStore,
      connections,
      groupedConnections,
      collapsedGroups,
      toggleGroup,
      generateIconText,
      toggleThemeMode,
      activeConnectionId,
      activeConnection,
      activeConnectionLabel,
      activeConnectionEndpoint,
      activeConnectionScope,
      activeTabConnectionIds,
      tabContextMenu,
      handleTabContextMenu,
      hideTabContextMenu,
      canCloseTabLeft,
      canCloseTabRight,
      handleTabMenuClose,
      handleTabMenuCloseLeft,
      handleTabMenuCloseRight,
      handleTabMenuCloseOthers,
      handleTabMenuCloseAll,
      storageTabsRef,
      handleStorageTabsWheel,
      handleStorageTabsMouseMove,
      handleStorageTabsMouseLeave,
      sidebarCollapsed,
      sidebarWidth,
      handleSidebarResizeStart,
      handleHotbarClick,
      handleCloseTab,
      showVirtualBucketCrumb,
      isInVirtualBucketList,
      tableScrollHeight,
      tableWrapperRef,
      customPaginationRef,
      activeBucket,
      activePathPrefix,
      activeMountTargets,
      currentBucketMountStatus,
      currentBucketMountTarget,
      currentBucketMountPoint,
      bucketMountInfoMap,
      mountStatusMap,
      mountLoadingMap,
      scheduleVfsRefresh,
      vfsSyncState,
      vfsFailedFiles,
      currentDirectoryTotalSize,
      directoryCount,
      fileCount,
      formatDirectorySize,
      handleShowLocalFile,
      handleLocalPreview,
      handleOpenLocalDirectory,
      activeConnectionColor,
      getConnectionColor,
      getConnectionTextColor,
      getTabStyle,
      getFileIcon,
      handleTabChange,
      windowHeight,
      dragOverState,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      contextMenuState,
      handleContextMenu,
      handleBlankAreaContextMenu,
      handleSelectAll,
      handleInvertSelection,
      hideContextMenu,
      customTableRow,
      navPopupChain,
      navPopupLoadingVisible,
      handleNavPopupHover,
      handleNavPopupLeave,
      handleNavPopupItemEnter,
      handleNavPopupItemLeave,
      handleNavPopupItemMove,
      handleNavPopupEnter,
      handleNavPopupLeaveEvent,
      handleNavPopupClick,
      canGoBack,
      canGoForward,
      goBack,
      goForward,
      tableState,
      tableColumns,
      tableLocale,
      tableHasSelected,
      filteredSourceLength,
      handleFileTableRowSelect,
      handleFileTableRowSelection,
                                                                                          configDrawerVisible,
      configFabHover,
            activeConfigEnabled,
      handleFabTargetToggle,
      handleFabDefaultToggle,
      handleFabEnableToggle,
      handleToggleFlashUpload,
      settingStore,
      auditStore,
      auditModalVisible,
      transferStore,
      previewModalState,
      previewModalLayout,
      isPreviewShellVisible,
      previewShellClass,
      previewShellStyle,
      previewShellBodyStyle,
      previewShellTitle,
      previewShellSize,
      togglePreviewMaximized,
      handlePreviewDragStart,
      handlePreviewResizeStart,
      closePreviewShell,
      galleryImages,
      galleryStartIndex,
      imageGalleryRef,
      StringUtil,
      textEditorRef,
      textEditorDirty,
      textSaving,
      officePreviewScrollRef,
      officePresentationMode,
      officePreviewRenderKey,
      officePreviewExcelOptions,
      officePreviewPptOptions,
      scrollOfficePreview,
      toggleOfficePresentationMode,
      handleTextPreviewClose,
      handleTextSave,
      handleTextSaveContent,
      mkdirModalState,
      transferDrawerVisible,
      ensureTransferRecordContext,
      domainPathValidationRule,
      onClickBreadCrumb,
      handleBreadcrumbHome,
      handleBreadcrumbVirtualBucket,
      breadcrumbEditing,
      breadcrumbHovering,
      breadcrumbEditValue,
      breadcrumbEditInputRef,
      pathHistoryVisible,
      filteredPathHistorySuggestions,
      getBreadcrumbFullPath,
      handleBreadcrumbCopy,
      handleCopyObjectPath,
      handleBreadcrumbEdit,
      handleBreadcrumbEditSubmit,
      handleBreadcrumbEditBlur,
      handlePathHistorySelect,
      removePathHistory,
      breadcrumbDisplayNames,
      breadcrumbVisibleNames,
      breadcrumbExpandedIndex,
      filteredSource,
      paginatedSource,
      handleUpload,
      handleUploadToDirectory,
      handleStorageListObjects,
      handleStorageCreateDirectory,
      handleStorageDeleteObjects,
      handleStorageSignObject,
      handlePreviewObject,
      forcePreviewAsText,
      handleStorageGetObject,
      handleStorageGetObjects,
                                                paginationState,
      listLoadingMore,
      cancelBackgroundListLoad,
      listLoadedPages,
      handlePaginationChange,
      handlePaginationSizeChange,
    };
  },
});
</script>

<style lang="less">
.file-page {
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  background: var(--ant-color-fill-tertiary);
  overflow: hidden;

  .app-layout {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-height: 0;
    width: 100vw;
  }

  .hotbar-sidebar {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width, 160px);
    background: transparent;
    transition: width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    z-index: 10;
    flex-shrink: 0;
    position: relative;

    &.collapsed {
      width: 56px;

      .hotbar-item {
        justify-content: center;
        padding: 12px 0;
      }
    }

    .hotbar-items {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 16px 0;
      display: flex;
      flex-direction: column;
      gap: 16px;

      &::-webkit-scrollbar {
        width: 4px;
      }
      &::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 4px;
      }
    }

    .hotbar-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .hotbar-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 16px;
      color: var(--ant-color-text-secondary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      transition: color 0.2s;

      &:hover {
        color: var(--ant-color-text-secondary);
      }

      .group-name {
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .group-icon {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: var(--ant-color-text-tertiary);
        padding: 4px 0;
        margin: 4px 0 8px 0;
        font-weight: 700;
        letter-spacing: 1px;
        position: relative;

        &::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 15%;
          width: 70%;
          height: 1px;
          background: var(--ant-color-border);
        }
      }

      .group-arrow {
        font-size: 10px;
        transition: transform 0.2s;

        &.group-arrow-expanded {
          transform: rotate(90deg);
        }
      }
    }

    .hotbar-group-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .hotbar-item {
      display: flex;
      align-items: center;
      padding: 10px 16px;
      cursor: pointer;
      color: var(--ant-color-text-secondary);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      margin: 0 8px;
      border-radius: 8px;

      &:hover {
        background: var(--ant-color-fill-secondary);
        color: var(--ant-color-text);
      }

      &.active {
        background: var(--ant-color-fill-quaternary);
        color: var(--ant-color-text);

        &::before {
          content: '';
          position: absolute;
          left: -8px;
          top: 10%;
          height: 80%;
          width: 3px;
          border-radius: 0 4px 4px 0;
          background: var(--tab-color, #4f46e5);
          box-shadow: 1px 0 6px var(--tab-color, #4f46e5);
        }
      }

      .hotbar-badge {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-size: 11px;
        letter-spacing: 0.5px;
        font-weight: 600;
        flex-shrink: 0;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .hotbar-name {
        margin-left: 12px;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .sidebar-bottom-actions {
      display: flex;
      flex-direction: column;

      .sidebar-bottom-tools {
        display: flex;
        align-items: center;
        height: 36px;

        .sidebar-settings-wrapper {
          flex: 1;
          height: 100%;
          position: relative;

          .sidebar-settings-btn {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--ant-color-text-secondary);
            cursor: pointer;
            transition: all 0.2s;
            font-size: 16px;

            &:hover {
              color: var(--ant-color-primary);
              background: rgba(24, 144, 255, 0.08);
            }
          }

          .fab-menu {
            position: absolute;
            bottom: 100%;
            left: 0;
            margin-bottom: 8px;
            width: 140px;
            background: #ffffff;
            border: 1px solid var(--ant-color-border);
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            backdrop-filter: none;
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.15s ease, transform 0.15s ease;
            pointer-events: none;
            padding: 6px 0;
            z-index: 100;

            .dark-theme & {
              background: #1f1f1f;
            }

            &.fab-menu-visible {
              opacity: 1;
              transform: translateY(0);
              pointer-events: auto;
              transition: opacity 0.15s ease 0.25s, transform 0.15s ease 0.25s;
            }

            .fab-menu-item {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 8px 12px;
              font-size: 13px;
              color: var(--ant-color-text-secondary);
              cursor: pointer;
              transition: background 0.1s;

              &:hover {
                background: var(--ant-color-fill-secondary);
                color: var(--ant-color-text);
              }

              .fab-menu-label {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 90px;
              }

              .fab-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #cbd5e1;
                transition: background 0.15s;

                &.fab-dot-on {
                  background: #22c55e;
                }

                &.fab-dot-loading {
                  background: #f59e0b;
                  animation: dot-pulse 1s ease-in-out infinite;
                }
              }
            }

            .fab-menu-sep {
              height: 1px;
              background: var(--ant-color-border-secondary);
              margin: 6px 0;
            }

            .fab-menu-link {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 8px 12px;
              font-size: 13px;
              color: var(--ant-color-text-tertiary);
              cursor: pointer;
              transition: color 0.1s, background 0.1s;

              &:hover {
                background: var(--ant-color-fill-secondary);
                color: var(--ant-color-text);
              }

              .anticon {
                font-size: 14px;
              }
            }

            .fab-bridge {
              position: absolute;
              bottom: -8px;
              left: 0;
              width: 100%;
              height: 8px;
              background: transparent;
            }
          }
        }

        .sidebar-theme-btn, .sidebar-collapse-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--ant-color-text-secondary);
          cursor: pointer;
          transition: all 0.2s;
          font-size: 16px;
          &:hover {
            color: var(--ant-color-primary);
            background: rgba(24, 144, 255, 0.08);
          }
        }

        &.collapsed-tools {
          flex-direction: column;
          height: 144px;
          .sidebar-settings-wrapper, .sidebar-theme-btn, .sidebar-collapse-btn {
            width: 100%;
          }
          .sidebar-settings-wrapper {
            .fab-menu {
              bottom: 10px;
              left: 100%;
              margin-bottom: 0;
              margin-left: 8px;
              transform: translateX(-10px);
              &.fab-menu-visible {
                transform: translateX(0);
              }
            }
            .fab-bridge {
              left: -8px;
              bottom: 0;
              width: 8px;
              height: 100%;
            }
          }
        }
      }
    }

    .sidebar-resize-handle {
      position: absolute;
      top: 0;
      right: -3px;
      width: 6px;
      height: 100%;
      cursor: col-resize;
      z-index: 20;

      &::after {
        content: '';
        position: absolute;
        top: 12px;
        bottom: 12px;
        left: 2px;
        width: 2px;
        border-radius: 2px;
        background: transparent;
        transition: background 0.15s;
      }

      &:hover::after {
        background: var(--ant-color-border);
      }
    }
  }

  main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    min-width: 0;
    background: var(--ant-color-bg-container);
    margin: 12px 12px 12px 0;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
    border: 1px solid var(--ant-color-border-secondary);
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .drag-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    background: rgba(24, 144, 255, 0.08);
    border: 2px dashed var(--ant-color-primary);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;

    .drag-overlay-content {
      text-align: center;
      color: var(--ant-color-primary);
      font-size: 16px;
      font-weight: 500;

      p {
        margin-top: 12px;
      }
    }
  }

  .storage-tabs {
    display: flex;
    gap: 2px;
    margin-bottom: 0;
    padding: 0 12px;
    background: transparent;
    border-bottom: 1px solid var(--ant-color-border);
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;

    &::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }

    .storage-tab {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 7px 6px 8px;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      transition: color 0.15s, background 0.15s, border-color 0.15s;
      white-space: nowrap;
      flex: 0 0 auto;
      min-width: 92px;
      max-width: none;

      .tab-name {
        flex: 0 0 auto;
        min-width: auto;
        overflow: visible;
        text-overflow: clip;
      }

      font-size: 12px;
      font-weight: 600;
      color: var(--ant-color-text-tertiary);
      background: transparent;
      margin-bottom: -1px;

      &:hover {
        color: var(--ant-color-text-secondary);
        background: rgba(0, 0, 0, 0.03);
      }

      .tab-badge {
        width: 18px;
        height: 18px;
        border-radius: 5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-size: 9px;
        font-weight: 700;
        line-height: 1;
        flex-shrink: 0;
        background: var(--ant-color-text-quaternary);
        opacity: 0.6;
      }

      .tab-name {
        font-weight: 600;
      }

      .tab-close-icon {
        font-size: 10px;
        color: var(--ant-color-text-tertiary);
        margin-left: auto;
        width: 16px;
        height: 16px;
        padding: 2px;
        border-radius: 4px;
        transition: all 0.15s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;

        &:hover {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }
      }

      .tab-mount-hint {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--ant-color-text-quaternary);
        flex-shrink: 0;
        opacity: 0.5;
        margin-left: 2px;

        &.mounted {
          background: #22c55e;
          opacity: 1;
        }

        &.mount-loading {
          background: #f59e0b;
          opacity: 1;
          animation: dot-pulse 1s ease-in-out infinite;
        }
      }

      &.tab-active {
        color: var(--ant-color-text);
        border-bottom-color: var(--tab-color, #4f46e5);
        background: var(--active-tab-bg, linear-gradient(to bottom, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.04)));

        .tab-badge {
          background: var(--tab-color, #4f46e5);
          opacity: 1;
          box-shadow: 0 2px 6px fade(#4f46e5, 35%);
        }

        .tab-name {
          color: var(--ant-color-text);
        }

        .tab-mount-hint {
          opacity: 0.8;

          &.mounted {
            opacity: 1;
          }
        }
      }
    }
  }

  .dark-theme & {
    .storage-tabs .storage-tab.tab-active {
      --active-tab-bg: linear-gradient(to bottom, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
    }
  }

  .file-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: transparent;
    overflow: hidden;
  }

  .table-content {
    transition: opacity 0.2s ease;
  }

  .table-content-hidden {
    opacity: 0;
    pointer-events: none;
  }

  // a-spin 包裹 table-content，需要保持 flex 结构
  .ant-spin-nested-loading,
  .ant-spin-nested-loading > .ant-spin-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    background: var(--ant-color-bg-layout);
    border-bottom: 1px solid var(--ant-color-border-secondary);

    .toolbar-search {
      flex: 1 1 auto;
      min-width: 0;

      .ant-input-affix-wrapper {
        width: 100%;
        padding: 0 8px;
        height: 28px;
        border-color: var(--ant-color-border);
        background: var(--ant-color-bg-container);
        font-size: 13px;

        &:focus,
        &:hover {
          border-color: var(--theme-color, var(--ant-color-text-secondary));
          box-shadow: 0 0 0 2px rgba(100, 116, 139, 0.1);
        }

        .ant-input {
          font-size: 13px;
        }
      }
    }

    .toolbar-actions {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
      white-space: nowrap;

      .ant-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--ant-color-border);
        background: var(--ant-color-bg-container);
        color: var(--ant-color-text-secondary);
        border-radius: 5px;
        font-size: 12px;
        transition: all 0.15s;
        box-shadow: none;

        &:hover {
          border-color: var(--ant-color-text-quaternary);
          color: var(--ant-color-text);
          background: var(--ant-color-bg-layout);
        }

        &:active {
          transform: scale(0.97);
        }

        &.icon-btn {
          width: 28px;
          padding: 0;
        }

        &.ant-btn-primary,
        &.upload-btn,
        &.download-btn {
          background: var(--theme-color, #4f46e5);
          border-color: var(--theme-color, #4f46e5);
          color: var(--ant-color-bg-container);

          &:hover:not(:disabled) {
            filter: brightness(0.92);
          }

          &:disabled {
            background: var(--ant-color-border);
            border-color: var(--ant-color-border);
            color: var(--ant-color-text-tertiary);
            opacity: 1;
          }
        }

        &.danger-btn:not(:disabled) {
          color: #b91c1c;

          &:hover {
            border-color: #fca5a5;
            background: #fef2f2;
            color: #dc2626;
          }
        }

        &.flash-btn {
          color: #92400e;

          &:hover {
            border-color: #fcd34d;
            background: #fffbeb;
            color: #b45309;
          }

          &.flash-btn-active {
            background: #fffbeb;
            border-color: #fcd34d;
            color: #b45309;
          }
        }

        &:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      }
    }

    .upload-btn {
      font-weight: 500;
    }
  }

  .breadcrumb-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    background: var(--ant-color-bg-container);
    border-bottom: 1px solid var(--ant-color-border-secondary);

    .breadcrumb-nav {
      display: flex;
      gap: 2px;
    }

    .breadcrumb-nav-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 28px;
      height: 22px;
      padding: 0 6px;
      border-radius: 3px;
      background: var(--ant-color-bg-layout);
      cursor: pointer;
      color: var(--ant-color-text-secondary);
      font-size: 12px;
      transition: background 0.15s, color 0.15s;

      &.breadcrumb-nav-btn-narrow {
        min-width: 22px;
        padding: 0 4px;
      }

      &:hover:not(.disabled) {
        background: var(--ant-color-fill-tertiary);
        color: var(--theme-color, var(--ant-color-text));
      }

      &.disabled {
        color: var(--ant-color-text-quaternary);
        cursor: default;
      }
    }

    .breadcrumb-spin {
      width: 10px;
      height: 10px;
      border: 1.5px solid var(--ant-color-border);
      border-top-color: var(--ant-color-text-tertiary);
      border-radius: 50%;
      animation: breadcrumb-spin 0.6s linear infinite;
      flex-shrink: 0;
    }

    @keyframes breadcrumb-spin {
      to { transform: rotate(360deg); }
    }

    .ant-breadcrumb {
      font-size: 12px;

      a {
        color: var(--ant-color-text-secondary);
        transition: color 0.15s;

        &:hover {
          color: var(--theme-color, var(--ant-color-text));
        }
      }

      > span:last-child a {
        color: var(--ant-color-text);
        font-weight: 500;
      }

      .ant-breadcrumb-separator {
        color: var(--ant-color-text-quaternary);
      }

      .ant-breadcrumb-link {
        color: var(--ant-color-text-secondary);
      }
    }

    .breadcrumb-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      margin-left: 6px;
      opacity: 0;
      transition: opacity 0.15s;
    }

    &:hover .breadcrumb-actions {
      opacity: 1;
    }

    .breadcrumb-action-btn {
      cursor: pointer;
      color: var(--ant-color-text-tertiary);
      transition: color 0.15s;
      font-size: 13px;
      line-height: 1;

      &:hover {
        color: var(--theme-color, var(--ant-color-text));
      }
    }

    .breadcrumb-inline-edit {
      display: flex;
      align-items: center;
      gap: 2px;
      font-size: 12px;
      flex: 1;
      min-width: 0;
    }

    .breadcrumb-edit-prefix {
      color: var(--ant-color-text-secondary);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .breadcrumb-edit-shell {
      position: relative;
      flex: 1;
      min-width: 0;
    }

    .breadcrumb-edit-input {
      border: none;
      outline: none;
      background: transparent;
      font-size: 12px;
      color: var(--ant-color-text);
      width: 100%;
      min-width: 40px;
      padding: 0 2px;
      border-bottom: 1px solid var(--ant-color-text-quaternary);

      &:focus {
        border-bottom-color: var(--theme-color, var(--ant-color-text));
      }

      &::placeholder {
        color: var(--ant-color-text-tertiary);
      }
    }

    .breadcrumb-history-popup {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      width: min(520px, 100%);
      max-height: 220px;
      overflow-y: auto;
      padding: 4px;
      border-radius: 4px;
      border: 1px solid #d9dee7;
      background: #ffffff;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
      z-index: 1300;

      .dark-theme & {
        border-color: #30343b;
        background: #1f2329;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
      }
    }

    .breadcrumb-history-item {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 26px;
      padding: 0 8px;
      border-radius: 3px;
      color: var(--ant-color-text-secondary);
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;

      .breadcrumb-history-path {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .breadcrumb-history-delete {
        width: 18px;
        height: 18px;
        padding: 0;
        border: 0;
        border-radius: 3px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--ant-color-text-quaternary);
        background: transparent;
        cursor: pointer;
        flex: 0 0 auto;
        opacity: 0.65;

        &:hover {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
          opacity: 1;
        }
      }

      &:hover {
        color: var(--ant-color-text);
        background: #eef5ff;

        .dark-theme & {
          background: #2a3442;
        }
      }
    }

    .breadcrumb-edit-go {
      cursor: pointer;
      color: var(--ant-color-text-secondary);
      font-size: 11px;
      padding: 0 4px;
      flex-shrink: 0;
      border-radius: 3px;
      transition: color 0.15s, background 0.15s;

      &:hover {
        color: var(--theme-color, var(--ant-color-text));
        background: var(--ant-color-fill-tertiary);
      }
    }
  }

  .table-wrapper {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--ant-color-bg-container);
    overflow: hidden;

    /* Exquisite custom loading animation for content list */
    .content-custom-loader {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 0;

      position: relative;
      width: 80px;
      height: 80px;
      margin: 0 auto;

      .content-loader-ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 3px solid transparent;

        &:nth-child(1) {
          border-top-color: #1890ff;
          animation: spin-ring1 1.5s linear infinite;
        }
        &:nth-child(2) {
          border-right-color: #52c41a;
          animation: spin-ring2 1.8s linear infinite;
        }
        &:nth-child(3) {
          border-bottom-color: #722ed1;
          animation: spin-ring3 2.1s linear infinite;
        }
      }

      .content-loader-text {
        position: absolute;
        bottom: -32px;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 2px;
        color: var(--ant-color-text-secondary);
      }
    }

    @keyframes spin-ring1 {
      to { transform: rotate(360deg); }
    }
    @keyframes spin-ring2 {
      to { transform: rotate(-360deg); }
    }
    @keyframes spin-ring3 {
      to { transform: rotate(360deg); }
    }

    // a-spin 包裹 table-content 在 table-wrapper 内部
    > .ant-spin-nested-loading,
    > .ant-spin-nested-loading > .ant-spin-container {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    > .ant-spin-nested-loading > div > .ant-spin {
      inset: 0;
      max-height: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    > .ant-spin-nested-loading > div > .ant-spin .ant-spin-dot {
      position: static;
      width: auto;
      height: auto;
      margin: 0;
      transform: none;
    }

    .ant-table-wrapper {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .blank-area {
      display: none;
    }

    .ant-table {
      background: var(--ant-color-bg-container);

      .ant-table-thead > tr > th {
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        background: var(--ant-color-bg-layout);
        border-bottom: 1px solid var(--ant-color-border);
        color: var(--ant-color-text-secondary);
      }

      .ant-table-tbody > tr > td {
        padding: 6px 12px;
        font-size: 12px;
        line-height: 20px;
        border-bottom: 1px solid var(--ant-color-fill-tertiary);
      }

      .ant-table-tbody > tr:hover > td {
        background: var(--ant-color-bg-layout);
      }

      .ant-table-tbody > tr.ant-table-row-selected > td {
        background: #eff6ff;
        border-bottom-color: #dbeafe;
        .dark-theme & {
          background: rgba(255, 255, 255, 0.08);
          border-bottom-color: rgba(255, 255, 255, 0.12);
        }
      }

      .ant-table-row:hover .file-name {
        color: var(--theme-color, #4f46e5);
      }
    }
  }

  .action-column {
    display: inline-flex;
    align-items: center;
  }

  .file-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    color: var(--ant-color-text);

    .file-icon {
      font-size: 14px;
      flex-shrink: 0;
      color: var(--ant-color-text-secondary);
    }

    &.file-name-directory {
      font-weight: 500;
      color: var(--ant-color-text);

      .file-icon {
        color: var(--theme-color, var(--ant-color-text-secondary));
      }

      .bucket-mount-tag {
        font-size: 10px;
        line-height: 1;
        padding: 1px 4px;
        border-radius: 3px;
        background: #fff7ed;
        color: #d97706;
        border: 1px solid #fde68a;
        margin-left: 6px;
        flex-shrink: 0;

        &.bucket-mount-tag-mounted {
          background: #f0fdf4;
          color: #16a34a;
          border-color: #bbf7d0;
        }

        &.bucket-mount-tag-loading {
          background: #fffbeb;
          color: #d97706;
          border-color: #fde68a;
          animation: tag-pulse 1s ease-in-out infinite;
        }
      }
    }
  }



  .welcome-empty {
    margin-top: 80px;

    .welcome-title {
      display: block;
      font-size: 20px;
      font-weight: 600;
      color: #262626;
      margin-bottom: 4px;
    }

    .welcome-desc {
      display: block;
      font-size: 14px;
      color: #8c8c8c;
    }
  }

}

  .nav-popup {
    position: fixed;
    z-index: 1000;
    min-width: 100px;
    max-width: 360px;
    max-height: 320px;
    overflow-y: auto;
    background: #ffffff;
    border: 1px solid var(--ant-color-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    padding: 4px 0;
    opacity: 1;

    .dark-theme & {
      background: #1f1f1f;
    }

    &.nav-popup-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      min-width: 48px;
    }

    .nav-popup-loading-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      font-size: 14px;
      color: var(--ant-color-text-tertiary);

      .anticon {
        font-size: 14px;
        animation: nav-loading-spin 0.8s linear infinite;
      }
    }

    @keyframes nav-loading-spin {
      to { transform: rotate(360deg); }
    }

    .nav-popup-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.88);
      transition: background 0.1s;

      .dark-theme & {
        color: rgba(255, 255, 255, 0.85);
      }

      &:hover {
        background: #f5f5f5;
        .dark-theme & {
          background: #333333;
        }
      }

      &.nav-popup-item-active {
        background: #e6f4ff;
        color: rgba(0, 0, 0, 0.88);
        .dark-theme & {
          background: #112a45;
          color: rgba(255, 255, 255, 0.85);
        }

        .nav-popup-item-icon {
          color: var(--theme-color, #1890ff);
        }

        .nav-popup-item-arrow {
          color: var(--theme-color, #1890ff);
        }
      }
    }

    .nav-popup-item-icon {
      font-size: 13px;
      color: rgba(0, 0, 0, 0.45);
      .dark-theme & {
        color: rgba(255, 255, 255, 0.45);
      }
      flex-shrink: 0;
    }

    .nav-popup-item-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nav-popup-item-arrow {
      font-size: 10px;
      color: var(--ant-color-text-tertiary);
      flex-shrink: 0;
    }
  }

  .context-menu {
    position: fixed;
    z-index: 1000;
    background: #ffffff;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    min-width: 140px;
    padding: 4px 0;

    .dark-theme & {
      background: #1f1f1f;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    }

    .context-menu-item {
      padding: 6px 16px;
      cursor: pointer;
      font-size: 13px;
      color: rgba(0, 0, 0, 0.88);
      display: flex;
      align-items: center;
      gap: 8px;

      &:hover {
        background-color: #f5f5f5;
        color: rgba(0, 0, 0, 0.88);
      }

      &.context-menu-disabled {
        color: rgba(0, 0, 0, 0.25);
        cursor: not-allowed;

        &:hover {
          background-color: transparent;
        }
      }
    }

    .dark-theme & .context-menu-item {
      color: rgba(255, 255, 255, 0.85);

      &:hover {
        background-color: #333333;
        color: #ffffff;
      }

      &.context-menu-disabled {
        color: rgba(255, 255, 255, 0.3);

        &:hover {
          background-color: transparent;
        }
      }
    }
  }

.ant-divider {
  margin: 12px 0;
}

.red-dot {
  display: inline-block;
  position: relative;
}

.red-dot > i {
  background: #ff436a;
  border-radius: 7px;
  color: var(--ant-color-bg-container);
  font-weight: 500;
  position: absolute;
  padding: 0 4px;
  height: 14px;
  line-height: 14px;
  font-size: 12px;
  left: 22px;
  top: 6px;
  z-index: 2;
}


.custom-pagination {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  align-self: stretch;
  width: 100%;
  box-sizing: border-box;
  margin: 0 !important;
  padding: 6px 12px;
  border-top: 1px solid var(--ant-color-border-secondary);
  background: transparent;
  border-radius: 0 0 12px 12px;

  .status-bar {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: var(--ant-color-text-secondary);
    min-width: 0;

    .status-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;

      .anticon {
        font-size: 12px;
        color: var(--ant-color-text-tertiary);
      }
    }

    .status-path {
      color: var(--ant-color-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 300px;
    }

    .status-endpoint {
      max-width: 260px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--ant-color-text-tertiary);
    }

    .status-selected {
      color: #4f46e5;
      font-weight: 600;

      .anticon {
        color: #4f46e5;
      }
    }

    .mount-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--ant-color-text-quaternary);

      &.mounted {
        background: #22c55e;
      }

      &.mount-loading {
        background: #f59e0b;
        animation: dot-pulse 1s ease-in-out infinite;
      }
    }

    .vfs-sync-badge {
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 4px;

      .vfs-sync-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: inline-block;

        &.syncing {
          background: #f59e0b;
          animation: vfs-breathing 1.5s ease-in-out infinite;
        }

        &.synced {
          background: #22c55e;
          animation: vfs-flash 0.6s ease-out;
        }

        &.failed {
          background: #ef4444;
          animation: vfs-breathing-red 1.5s ease-in-out infinite;
        }
      }

      &.vfs-syncing { color: #f59e0b; }
      &.vfs-synced { color: #22c55e; }
      &.vfs-failed { color: #ef4444; }
    }

    .vfs-failed-trigger {
      color: #ef4444;
      cursor: pointer;
      font-size: 12px;
      margin-left: 2px;
    }
  }

  .vfs-failed-popup {
    .vfs-failed-title {
      font-weight: 600;
      margin-bottom: 4px;
      color: #ef4444;
    }

    .vfs-failed-item {
      font-size: 12px;
      color: var(--ant-color-text-tertiary);
      line-height: 18px;
    }
  }

  .ant-pagination {
    font-size: 12px;

    .ant-pagination-item,
    .ant-pagination-prev,
    .ant-pagination-next {
      min-width: 24px;
      height: 24px;
      line-height: 22px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--ant-color-text-secondary);
      margin-right: 2px;
      font-size: 12px;

      a {
        color: var(--ant-color-text-secondary);
        padding: 0 6px;
      }

      &:hover {
        background: var(--ant-color-fill-tertiary);

        a {
          color: var(--ant-color-text);
        }
      }
    }

    .ant-pagination-item-active {
      background: var(--ant-color-bg-container);
      border-color: var(--ant-color-border);
      font-weight: 600;

      a {
        color: var(--theme-color, var(--ant-color-text));
      }
    }

    .ant-pagination-jump-prev .ant-pagination-item-link-icon,
    .ant-pagination-jump-next .ant-pagination-item-link-icon {
      color: var(--ant-color-text-tertiary);
    }

    .ant-pagination-options {
      .ant-select {
        font-size: 12px;

        .ant-select-selector {
          height: 24px !important;
          min-height: 24px !important;
          padding: 0 4px !important;
          border-color: var(--ant-color-border) !important;
        }

        .ant-select-selection-item {
          line-height: 22px !important;
          font-size: 12px;
        }

        .ant-select-arrow {
          inset-inline-end: 4px;
        }
      }
    }
  }
}

.preview-modal-header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  flex: 1;
}

.preview-modal-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--preview-text, #172033);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-shell-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(4px);
  contain: layout paint;
}

.preview-shell {
  --preview-bg: #ffffff;
  --preview-bg-soft: #f8fafc;
  --preview-border: #dbe3ef;
  --preview-text: #172033;
  --preview-text-secondary: #5d6675;
  --preview-text-muted: #8791a1;
  --preview-hover: #edf3fb;
  --preview-media-bg: #111827;
  --preview-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);

  position: fixed;
  z-index: 1;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 640px;
  min-height: 360px;
  max-width: calc(100vw - 20px);
  max-height: calc(100vh - 20px);
  overflow: hidden;
  border: 1px solid var(--preview-border);
  border-radius: 8px;
  background: var(--preview-bg);
  color: var(--preview-text);
  box-shadow: var(--preview-shadow);
}

.preview-shell-maximized {
  position: fixed !important;
  inset: 0 !important;
  left: 0 !important;
  top: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: auto !important;
  height: auto !important;
  min-width: 0;
  min-height: 0;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  transform: none !important;
  border-radius: 0;
  border: 0;
}

.preview-shell-header {
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 7px 0 14px;
  border-bottom: 1px solid var(--preview-border);
  background: var(--preview-bg-soft);
  cursor: grab;
  user-select: none;
}

.preview-dragging .preview-shell-header {
  cursor: grabbing;
}

.preview-shell-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--preview-bg);
}

.preview-shell-footer {
  min-height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid var(--preview-border);
  background: var(--preview-bg-soft);
}

.preview-footer-button {
  height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--preview-border);
  border-radius: 4px;
  padding: 0 8px;
  background: var(--preview-bg);
  color: var(--preview-text-secondary);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    border-color: var(--ant-color-primary);
    color: var(--ant-color-primary);
  }
}

.preview-modal-size {
  font-size: 11px;
  color: var(--preview-text-muted);
  white-space: nowrap;
}

.preview-modal-counter {
  font-size: 11px;
  color: var(--preview-text-secondary);
  background: var(--preview-hover);
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.preview-modal-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding-right: 28px;
}

.preview-modal-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.preview-modal-action {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 4px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--preview-text-secondary);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--preview-hover);
    color: var(--preview-text);
  }
}

.preview-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  z-index: 5;

  &::after {
    content: '';
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 8px;
    height: 8px;
    border-right: 2px solid var(--preview-text-muted);
    border-bottom: 2px solid var(--preview-text-muted);
    opacity: 0.75;
  }
}

:root[data-theme='dark'] .preview-shell {
  --preview-bg: #161a20;
  --preview-bg-soft: #1c2129;
  --preview-border: #2b333f;
  --preview-text: #edf2f7;
  --preview-text-secondary: #aab4c2;
  --preview-text-muted: #727d8c;
  --preview-hover: #27303b;
  --preview-media-bg: #080b10;
  --preview-shadow: 0 22px 54px rgba(0, 0, 0, 0.46);
}

:root[data-theme='dark'] .preview-shell-mask {
  background: rgba(0, 0, 0, 0.5);
}

.preview-modal-wrap {
  .ant-modal {
    max-width: none;
  }

  .ant-modal-content {
    border-radius: 4px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  }

  .ant-modal-header {
    padding: 6px 16px;
    border-bottom: 1px solid #f0f0f0;
  }

  .ant-modal-close {
    width: 32px;
    height: 32px;
    top: 50%;
    transform: translateY(-50%);
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;

    .ant-modal-close-x {
      width: 32px;
      height: 32px;
      line-height: 32px;
      font-size: 14px;
    }
  }

  .ant-modal-body {
    padding: 0;
  }
}

body.preview-dragging,
body.preview-dragging * {
  cursor: grabbing !important;
  user-select: none;
}

body.preview-resizing,
body.preview-resizing * {
  cursor: nwse-resize !important;
  user-select: none;
}

.preview-modal-footer-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.text-editor-header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;

  .text-editor-filename {
    font-weight: 500;
    color: var(--ant-color-text);
  }

  .text-editor-header-hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--ant-color-text-tertiary);
    font-size: 10px;
    padding: 1px 5px;
    background: var(--ant-color-fill-tertiary);
    border-radius: 3px;

    .dirty-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #22c55e;
      flex-shrink: 0;
    }

    &.dirty {
      color: var(--ant-color-text-secondary);
    }

    &.unsaved-hint {
      color: #dc2626;
      background: #fef2f2;
    }

    &.limit-hint {
      color: #d97706;
      background: #fffbeb;
    }

    &.chunk-progress-hint {
      color: var(--ant-color-text-tertiary);
      background: transparent;
      padding: 1px 4px;
      font-size: 10px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    &.download-hint {
      color: var(--ant-color-text-secondary);
      background: var(--ant-color-border);
      cursor: pointer;

      &:hover {
        color: var(--ant-color-text);
        background: var(--ant-color-text-quaternary);
      }
    }
  }
}

.video-preview {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
  background: #000;

  > * {
    width: 100%;
    height: 100%;
  }
}

.audio-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 0;

  .audio-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: var(--ant-color-fill-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .audio-player {
    width: 100%;
    max-width: 600px;
  }
}

.pdf-preview {
  height: 100%;
  overflow: hidden;
  width: 100%;

  > * {
    max-width: 100%;
    height: 100%;
  }

  canvas {
    max-width: 100%;
    height: auto !important;
  }
}

.unsupported-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;

  p {
    margin: 0;
    color: var(--ant-color-text-secondary);
    font-size: 13px;
  }

  .unsupported-preview-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .unsupported-download-btn {
    background: var(--ant-color-primary, #1677ff);
    border-color: var(--ant-color-primary, #1677ff);
    color: #fff;

    &:hover,
    &:focus {
      background: var(--ant-color-primary-hover, #4096ff);
      border-color: var(--ant-color-primary-hover, #4096ff);
      color: #fff;
    }

    &:active {
      background: var(--ant-color-primary-active, #0958d9);
      border-color: var(--ant-color-primary-active, #0958d9);
      color: #fff;
    }
  }
}

.office-preview {
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
  background-color: var(--preview-bg-soft, #f8fafc);

  .office-preview-toolbar {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 12;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px;
    border: 1px solid rgba(148, 163, 184, 0.32);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
    backdrop-filter: blur(12px);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-4px);
    transition: opacity 0.16s ease, transform 0.16s ease;
  }

  &:hover .office-preview-toolbar,
  &:focus-within .office-preview-toolbar {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .office-preview-action {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    color: var(--preview-text-secondary, #5d6675);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;

    &:hover {
      background: rgba(15, 23, 42, 0.08);
      color: var(--preview-text, #172033);
    }

    &:active {
      transform: translateY(1px);
    }
  }

  .office-preview-action-primary.active,
  .office-preview-action-primary:hover {
    background: var(--ant-color-primary, #1677ff);
    color: #fff;
  }

  .office-preview-scroll {
    width: 100%;
    height: 100%;
    overflow: auto;
    background: var(--preview-bg, #fff);
  }

  .office-preview-scroll > div,
  .vue-office-docx,
  .vue-office-docx-main,
  .vue-office-excel,
  .vue-office-excel-main,
  .vue-office-pptx,
  .vue-office-pptx-main {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
  }

  .vue-office-docx {
    overflow: auto;
  }

  .vue-office-docx .docx-wrapper {
    min-height: 100%;
    padding: 18px;
    background: var(--preview-bg-soft, #f8fafc);
  }

  .vue-office-excel {
    overflow: hidden;
  }

  .vue-office-pptx-main {
    overflow: auto;
  }

  &.office-presentation-mode {
    background: var(--ant-color-bg-spotlight, #111827);

    .office-preview-toolbar {
      border-color: rgba(255, 255, 255, 0.18);
      background: rgba(17, 24, 39, 0.74);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.34);
    }

    .office-preview-scroll {
      background: var(--ant-color-bg-spotlight, #111827);
    }
  }
}

:root[data-theme='dark'] .office-preview {
  .office-preview-toolbar {
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(28, 33, 41, 0.84);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.36);
  }

  .office-preview-action {
    color: var(--preview-text-secondary, #aab4c2);

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--preview-text, #edf2f7);
    }
  }

  .vue-office-docx .docx-wrapper {
    background: var(--preview-bg-soft, #1c2129);
  }
}

body.sidebar-resizing {
  cursor: col-resize;
  user-select: none;

  .hotbar-sidebar {
    transition: none !important;
  }

  .sidebar-resize-handle::after {
    background: var(--ant-color-primary) !important;
  }
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes vfs-breathing {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

@keyframes vfs-flash {
  0% { opacity: 0.3; transform: scale(0.5); }
  50% { opacity: 1; transform: scale(1.3); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes vfs-breathing-red {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

@keyframes tag-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

// Monaco search widget hover flickering fix
.text-editor-wrapper {
  :deep(.monaco-editor .monaco-hover) {
    pointer-events: none;
  }
}

.nav-popup::-webkit-scrollbar,
.ant-table-body::-webkit-scrollbar,
.ant-table-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.nav-popup::-webkit-scrollbar-thumb,
.ant-table-body::-webkit-scrollbar-thumb,
.ant-table-content::-webkit-scrollbar-thumb {
  background: rgba(144, 147, 153, 0.3);
  border-radius: 4px;
}

.nav-popup::-webkit-scrollbar-thumb:hover,
.ant-table-body::-webkit-scrollbar-thumb:hover,
.ant-table-content::-webkit-scrollbar-thumb:hover {
  background: rgba(144, 147, 153, 0.5);
}

.nav-popup::-webkit-scrollbar-track,
.ant-table-body::-webkit-scrollbar-track,
.ant-table-content::-webkit-scrollbar-track {
  background: transparent;
}

.status-cancel-load {
  margin-left: 8px;
  color: var(--ant-color-primary);
  cursor: pointer;
}
.status-cancel-load:hover {
  text-decoration: underline;
}
</style>
