// 全局状态
let config = null;
let currentWorkDir = '';
let currentOpenCodeConfig = null;

// 页面切换
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');
    
    // 显示对应页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');

    // 如果切换到配置页面，加载模型信息
    if (page === 'config') {
      loadModels();
    }
  });
});

// 初始化
async function initialize() {
  config = await window.electronAPI.getConfig();
  await updateStatus();
  
  // 更新版本号显示
  const version = await window.electronAPI.getAppVersion();
  document.getElementById('app-version').textContent = `App Version: v${version}`;
  
  // 恢复工作目录
  if (config.workDir) {
    currentWorkDir = config.workDir;
    document.getElementById('work-dir').value = currentWorkDir;
    updateLaunchButtons();
  }
  
  // 恢复 npm 源输入框（如果有配置）
  if (config.npmRegistry) {
    document.getElementById('npm-registry-input').value = config.npmRegistry;
  }
  
  // 监听 opencode.json 变化
  window.electronAPI.onConfigChange(() => {
    console.log('检测到 opencode.json 变化，正在刷新模型列表...');
    loadModels();
  });
}

// 更新状态显示
async function updateStatus() {
  const nodejsCheck = await window.electronAPI.checkNodejs();
  
  const nodejsStatus = document.getElementById('nodejs-status');
  const nodejsItem = nodejsStatus.parentElement;
  
  if (nodejsCheck.extracted) {
    let statusText = nodejsCheck.version ? `${nodejsCheck.version}` : '';
    nodejsStatus.innerHTML = `<i class="fas fa-check-circle"></i> 已配置${statusText ? '（' + statusText + '）' : ''}`;
    nodejsStatus.style.color = '#4ec9b0';
    nodejsItem.dataset.tooltip = '点击即可复制 Node.js 安装地址';
    nodejsItem.onclick = () => copyToClipboard(nodejsCheck.path, 'Node.js 安装位置');
  } else {
    nodejsStatus.textContent = '未配置';
    nodejsStatus.style.color = '#858585';
    nodejsItem.dataset.tooltip = '';
    nodejsItem.onclick = null;
  }
  
  // 使用新的 checkOpenCode API
  const opencodeCheck = await window.electronAPI.checkOpenCode();
  const opencodeStatus = document.getElementById('opencode-status');
  const opencodeItem = opencodeStatus.parentElement;
  
  if (opencodeCheck.installed) {
    let statusText = opencodeCheck.version ? `${opencodeCheck.version}` : '';
    opencodeStatus.innerHTML = `<i class="fas fa-check-circle"></i> 已安装${statusText ? '（' + statusText + '）' : ''}`;
    opencodeStatus.style.color = '#4ec9b0';
    opencodeItem.dataset.tooltip = '点击即可复制 OpenCode 安装地址';
    opencodeItem.onclick = () => copyToClipboard(opencodeCheck.path, 'OpenCode 安装位置');
    config.opencodeInstalled = true; // 同步更新本地 config
  } else {
    opencodeStatus.textContent = '未安装';
    opencodeStatus.style.color = '#858585';
    opencodeItem.dataset.tooltip = '';
    opencodeItem.onclick = null;
    config.opencodeInstalled = false; // 同步更新本地 config
  }
  
  // 获取实际的 npm 源配置
  const npmRegistryResult = await window.electronAPI.getNpmRegistry();
  const npmRegistry = document.getElementById('npm-registry');
  const npmItem = npmRegistry.parentElement;
  
  if (npmRegistryResult.success && npmRegistryResult.registry) {
    npmRegistry.textContent = npmRegistryResult.registry;
    npmRegistry.style.color = '#4ec9b0';
    npmItem.dataset.tooltip = '点击即可复制 npm 源地址';
    npmItem.onclick = () => copyToClipboard(npmRegistryResult.registry, 'npm 源地址');
    config.npmRegistry = npmRegistryResult.registry; // 同步更新本地 config
  } else {
    npmRegistry.textContent = '未配置';
    npmRegistry.style.color = '#858585';
    npmItem.dataset.tooltip = '';
    npmItem.onclick = null;
    config.npmRegistry = ''; // 清空本地 config
  }
}

// 复制到剪贴板
function copyToClipboard(text, label) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showNotification(`${label}已复制到剪贴板`, 'success');
  }).catch(err => {
    console.error('复制失败:', err);
  });
}

// 选择工作目录
document.getElementById('select-dir-btn').addEventListener('click', async () => {
  const result = await window.electronAPI.selectDirectory();
  if (result.success) {
    currentWorkDir = result.path;
    document.getElementById('work-dir').value = currentWorkDir;
    config.workDir = currentWorkDir;
    await window.electronAPI.saveConfig(config);
    updateLaunchButtons();
  }
});

// 工作目录输入框变化监听
const workDirInput = document.getElementById('work-dir');
workDirInput.addEventListener('input', async (e) => {
  const inputPath = e.target.value.trim();
  if (inputPath) {
    currentWorkDir = inputPath;
    config.workDir = currentWorkDir;
    await window.electronAPI.saveConfig(config);
    updateLaunchButtons();
  }
});

// 支持拖拽目录到工作目录选择区域（扩大拖拽区域）
const workDirSection = document.querySelector('.work-dir-section');

workDirSection.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  workDirSection.classList.add('drag-over');
});

workDirSection.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  // 检查是否真正离开了区域（不是移动到子元素）
  const rect = workDirSection.getBoundingClientRect();
  const x = e.clientX;
  const y = e.clientY;
  
  if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
    workDirSection.classList.remove('drag-over');
  }
});

workDirSection.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  // 立即移除拖拽样式，避免卡顿感
  workDirSection.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    // 获取第一个拖拽的文件/目录的路径
    const path = files[0].path;
    
    // 使用 requestAnimationFrame 确保 UI 更新在下一帧执行
    requestAnimationFrame(() => {
      currentWorkDir = path;
      workDirInput.value = currentWorkDir;
      
      // 完全非阻塞的后台保存
      window.electronAPI.saveConfig({ ...config, workDir: currentWorkDir }).then(() => {
        config.workDir = currentWorkDir;
        updateLaunchButtons();
      });
    });
  }
});

// 全局监听 dragend 和 dragleave，确保拖拽结束时移除样式
document.addEventListener('dragend', () => {
  workDirSection.classList.remove('drag-over');
});

document.addEventListener('drop', (e) => {
  // 如果在区域外释放，也要移除样式
  if (!workDirSection.contains(e.target)) {
    workDirSection.classList.remove('drag-over');
  }
});

// 更新启动按钮状态
function updateLaunchButtons() {
  const canLaunch = config.opencodeInstalled && currentWorkDir;
  document.getElementById('launch-tui-btn').disabled = !canLaunch;
  document.getElementById('launch-web-btn').disabled = !canLaunch;
}

// 启动 TUI
document.getElementById('launch-tui-btn').addEventListener('click', async () => {
  const result = await window.electronAPI.launchTUI(currentWorkDir);
  if (result.success) {
    showNotification('TUI 已在终端中启动', 'success');
  } else {
    showNotification('启动失败: ' + result.error, 'error');
  }
});

// 启动 Web
document.getElementById('launch-web-btn').addEventListener('click', async () => {
  const result = await window.electronAPI.launchWeb({ workDir: currentWorkDir });
  if (result.success) {
    showNotification('Web 服务已启动', 'success');
  } else {
    showNotification('启动失败: ' + result.error, 'error');
  }
});

// 解压 Node.js
document.getElementById('extract-nodejs-btn').addEventListener('click', async () => {
  const btn = document.getElementById('extract-nodejs-btn');
  const status = document.getElementById('nodejs-extract-status');
  
  btn.disabled = true;
  btn.textContent = '解压中...';
  status.className = 'step-status info';
  status.textContent = '正在解压 Node.js 运行时...';
  
  const result = await window.electronAPI.extractNodejs();
  
  if (result.success) {
    status.className = 'step-status success';
    status.textContent = '✓ Node.js 解压成功！';
    config.nodejsExtracted = true;
    updateStatus();
  } else {
    status.className = 'step-status error';
    status.textContent = '✗ 解压失败: ' + result.error;
    btn.disabled = false;
  }
  
  btn.textContent = '解压 Node.js';
});

// 快速设置 npm 源
document.querySelectorAll('.preset-registries .btn-link').forEach(btn => {
  btn.addEventListener('click', () => {
    const registry = btn.dataset.registry;
    document.getElementById('npm-registry-input').value = registry;
  });
});

// 配置 npm 源
document.getElementById('configure-npm-btn').addEventListener('click', async () => {
  const registry = document.getElementById('npm-registry-input').value.trim();
  if (!registry) {
    showNotification('请输入 npm 源地址', 'error');
    return;
  }
  
  const btn = document.getElementById('configure-npm-btn');
  const status = document.getElementById('npm-config-status');
  
  btn.disabled = true;
  btn.textContent = '配置中...';
  status.className = 'step-status info';
  status.textContent = '正在配置 npm 源...';
  
  const result = await window.electronAPI.configureNpm(registry);
  
  if (result.success) {
    status.className = 'step-status success';
    status.textContent = '✓ npm 源配置成功！';
    config.npmRegistry = registry;
    updateStatus();
  } else {
    status.className = 'step-status error';
    status.textContent = '✗ 配置失败: ' + result.error;
  }
  
  btn.disabled = false;
  btn.textContent = '设置 npm 源';
});

// 安装 OpenCode
document.getElementById('install-opencode-btn').addEventListener('click', async () => {
  const btn = document.getElementById('install-opencode-btn');
  const status = document.getElementById('opencode-install-status');
  const logDiv = document.getElementById('install-log');
  
  btn.disabled = true;
  btn.textContent = '安装中...';
  status.className = 'step-status info';
  status.textContent = '正在安装 OpenCode，请稍候...';
  logDiv.classList.add('active');
  logDiv.textContent = '';
  
  // 监听安装进度
  window.electronAPI.onInstallProgress((data) => {
    logDiv.textContent += data;
    logDiv.scrollTop = logDiv.scrollHeight;
  });
  
  const result = await window.electronAPI.installOpenCode();
  
  if (result.success) {
    status.className = 'step-status success';
    status.textContent = '✓ OpenCode 安装成功！';
    config.opencodeInstalled = true;
    updateStatus();
    updateLaunchButtons();
  } else {
    status.className = 'step-status error';
    status.textContent = '✗ 安装失败: ' + result.error;
    btn.disabled = false;
  }
  
  btn.textContent = '安装 OpenCode';
});

// 重置环境
document.getElementById('reset-env-btn').addEventListener('click', async () => {
  const confirmText = '此操作将清空所有环境数据，包括已安装的 Node.js 和 OpenCode，操作不可逆！\n\n确定要继续吗？';
  if (!confirm(confirmText)) {
    return;
  }
  
  const btn = document.getElementById('reset-env-btn');
  const status = document.getElementById('reset-env-status');
  
  btn.disabled = true;
  btn.textContent = '重置中...';
  status.className = 'step-status info';
  status.textContent = '正在清空用户数据目录...';
  
  const result = await window.electronAPI.resetEnvironment();
  
  if (result.success) {
    status.className = 'step-status success';
    status.textContent = '✓ 环境重置成功！页面将在 2 秒后重新加载...';
    
    // 重置本地配置状态
    config.nodejsExtracted = false;
    config.opencodeInstalled = false;
    config.npmRegistry = '';
    
    // 清空状态显示
    document.getElementById('nodejs-extract-status').textContent = '';
    document.getElementById('npm-config-status').textContent = '';
    document.getElementById('opencode-install-status').textContent = '';
    document.getElementById('install-log').textContent = '';
    
    // 2秒后重新加载页面
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  } else {
    status.className = 'step-status error';
    status.textContent = '✗ 重置失败: ' + result.error;
    btn.disabled = false;
  }
  
  btn.textContent = '重置环境';
});

// 生成 OpenCode 默认配置
document.getElementById('generate-config-btn').addEventListener('click', async () => {
  const btn = document.getElementById('generate-config-btn');
  const status = document.getElementById('generate-config-status');
  
  btn.disabled = true;
  btn.textContent = '生成中...';
  status.className = 'step-status info';
  status.textContent = '正在生成默认配置文件...';
  
  const result = await window.electronAPI.generateOpenCodeConfig();
  
  if (result.success) {
    status.className = 'step-status success';
    status.textContent = `✓ 配置文件已生成：${result.path}`;
    btn.disabled = false;
    btn.textContent = '生成默认配置';
  } else if (result.fileExists) {
    // 配置文件已存在，询问用户是否覆盖
    const confirmText = '配置文件已存在，继续操作将对已有配置文件进行覆盖，该操作不可撤销，是否继续？';
    status.className = 'step-status info';
    status.textContent = '配置文件已存在，等待确认...';
    
    if (confirm(confirmText)) {
      // 用户确认覆盖，强制生成
      status.textContent = '正在覆盖配置文件...';
      const forceResult = await window.electronAPI.generateOpenCodeConfig({ force: true });
      
      if (forceResult.success) {
        status.className = 'step-status success';
        status.textContent = `✓ 配置文件已生成：${forceResult.path}`;
      } else {
        status.className = 'step-status error';
        status.textContent = '✗ 生成失败: ' + forceResult.error;
      }
    } else {
      // 用户取消操作
      status.className = 'step-status';
      status.textContent = '';
    }
    
    btn.disabled = false;
    btn.textContent = '生成默认配置';
  } else {
    status.className = 'step-status error';
    status.textContent = '✗ 生成失败: ' + result.error;
    btn.disabled = false;
    btn.textContent = '生成默认配置';
  }
});

// 加载模型信息
async function loadModels() {
  const modelListBody = document.getElementById('model-list-body');
  if (!modelListBody) return;

  modelListBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #858585;">正在加载模型信息...</td></tr>';
  
  const result = await window.electronAPI.getOpenCodeConfig();
  
  if (result.success && result.config) {
    currentOpenCodeConfig = result.config;
    updateProviderDatalist();

    if (result.config.provider) {
      modelListBody.innerHTML = '';
      const providers = result.config.provider;
      
      const allModels = [];
      for (const providerId in providers) {
        const provider = providers[providerId];
        const providerName = provider.name || ''; // 模型命名
        
        if (provider.models) {
          for (const modelId in provider.models) {
            const metadataKey = `${providerId}:${modelId}`;
            allModels.push({
              providerId,
              providerName,
              modelId,
              addedAt: (config.modelMetadata && config.modelMetadata[metadataKey]) || 0
            });
          }
        }
      }
      
      // 排序逻辑：按 _addedAt 从大到小排列（后添加的在前）
      allModels.sort((a, b) => {
        const timeA = a.addedAt || 0;
        const timeB = b.addedAt || 0;
        return timeB - timeA;
      });

      allModels.forEach(model => {
        const isDefault = result.config.model === `${model.providerId}/${model.modelId}`;
        const row = document.createElement('tr');
        row.innerHTML = `
          <td style="text-align: center;">
            <input type="radio" name="default-model" class="default-model-radio" 
              data-provider="${model.providerId}" data-model="${model.modelId}" 
              ${isDefault ? 'checked' : ''} title="设为默认模型">
          </td>
          <td>${model.providerId}</td>
          <td>${model.providerName}</td>
          <td>${model.modelId}</td>
          <td>
            <div class="action-buttons">
              <button class="btn-link btn-edit" data-provider="${model.providerId}" data-model="${model.modelId}" title="修改模型"><i class="fas fa-edit"></i></button>
              <button class="btn-link btn-delete" data-provider="${model.providerId}" data-model="${model.modelId}" title="删除模型"><i class="fas fa-trash-alt"></i></button>
            </div>
          </td>
        `;
        modelListBody.appendChild(row);
      });
      
      if (allModels.length === 0) {
        modelListBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #858585;">暂无模型信息</td></tr>';
      } else {
        // 绑定单选框事件
        document.querySelectorAll('.default-model-radio').forEach(radio => {
          radio.onchange = async (e) => {
            const pId = radio.dataset.provider;
            const mId = radio.dataset.model;
            await setDefaultModel(pId, mId);
          };
        });

        // 绑定编辑按钮事件
        document.querySelectorAll('.btn-edit').forEach(btn => {
          btn.onclick = (e) => {
            const pId = btn.dataset.provider;
            const mId = btn.dataset.model;
            openEditModal(pId, mId);
          };
        });

        // 绑定删除按钮事件
        document.querySelectorAll('.btn-delete').forEach(btn => {
          btn.onclick = async (e) => {
            const pId = btn.dataset.provider;
            const mId = btn.dataset.model;
            if (confirm(`确定要删除模型 ${mId} 吗？`)) {
              await deleteModel(pId, mId);
            }
          };
        });
      }
    } else {
      modelListBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #858585;">暂无提供商信息</td></tr>';
    }
  } else {
    modelListBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f48771;">${result.error || '无法加载配置文件'}</td></tr>`;
  }
}

// 更新 Provider 自动完成列表
function updateProviderDatalist() {
  const datalist = document.getElementById('provider-datalist');
  if (!datalist || !currentOpenCodeConfig || !currentOpenCodeConfig.provider) return;

  datalist.innerHTML = '';
  Object.keys(currentOpenCodeConfig.provider).forEach(providerId => {
    const option = document.createElement('option');
    option.value = providerId;
    datalist.appendChild(option);
  });
}

// 监听 Provider ID 输入，实现自动填充
document.getElementById('new-provider-id').addEventListener('input', (e) => {
  const providerId = e.target.value.trim();
  if (!currentOpenCodeConfig || !currentOpenCodeConfig.provider) return;

  const provider = currentOpenCodeConfig.provider[providerId];
  const aliasInput = document.getElementById('new-model-alias');
  const urlInput = document.getElementById('new-base-url');
  const keyInput = document.getElementById('new-api-key');

  if (provider) {
    // 自动填充
    aliasInput.value = provider.name || '';
    urlInput.value = (provider.options && provider.options.baseURL) || '';
    keyInput.value = (provider.options && provider.options.apiKey) || '';
    
    // 禁用已有 Provider 的字段
    aliasInput.disabled = true;
    urlInput.disabled = true;
    keyInput.disabled = true;
  } else {
    // 不匹配时恢复可编辑
    aliasInput.disabled = false;
    urlInput.disabled = false;
    keyInput.disabled = false;
  }
});

// 添加模型按钮逻辑
document.getElementById('add-model-btn').addEventListener('click', async () => {
  const providerId = document.getElementById('new-provider-id').value.trim();
  const modelAlias = document.getElementById('new-model-alias').value.trim();
  const modelName = document.getElementById('new-model-name').value.trim();
  const baseUrl = document.getElementById('new-base-url').value.trim();
  const apiKey = document.getElementById('new-api-key').value.trim();

  if (!providerId || !modelAlias || !modelName || !baseUrl || !apiKey) {
    showNotification('请填齐所有必填字段', 'error');
    return;
  }

  // 构建新配置 (opencode.json)
  const opencodeConfig = JSON.parse(JSON.stringify(currentOpenCodeConfig || {}));
  if (!opencodeConfig.provider) opencodeConfig.provider = {};
  
  if (!opencodeConfig.provider[providerId]) {
    opencodeConfig.provider[providerId] = {
      npm: "@ai-sdk/openai-compatible",
      name: modelAlias,
      options: {
        baseURL: baseUrl,
        apiKey: apiKey
      },
      models: {}
    };
  }
  
  // 添加模型
  if (!opencodeConfig.provider[providerId].models) opencodeConfig.provider[providerId].models = {};
  opencodeConfig.provider[providerId].models[modelName] = {
    name: modelName
  };

  // 保存元数据到 launcher 配置（不写入 opencode.json）
  const timestamp = Date.now();
  if (!config.modelMetadata) config.modelMetadata = {};
  config.modelMetadata[`${providerId}:${modelName}`] = timestamp;
  await window.electronAPI.saveConfig(config);

  const result = await window.electronAPI.saveOpenCodeConfig(opencodeConfig);
  if (result.success) {
    showNotification('模型添加成功！', 'success');
    // 清空输入框（保留 Provider ID, 命名, URL, Key 以便连续添加模型）
    document.getElementById('new-model-name').value = '';
    loadModels(); // 重新加载
  } else {
    showNotification('保存失败: ' + result.error, 'error');
  }
});

// 清空新增模型输入框
document.getElementById('clear-model-btn').addEventListener('click', () => {
  const providerInput = document.getElementById('new-provider-id');
  const aliasInput = document.getElementById('new-model-alias');
  const modelNameInput = document.getElementById('new-model-name');
  const urlInput = document.getElementById('new-base-url');
  const keyInput = document.getElementById('new-api-key');

  providerInput.value = '';
  aliasInput.value = '';
  modelNameInput.value = '';
  urlInput.value = '';
  keyInput.value = '';

  // 恢复可编辑状态
  aliasInput.disabled = false;
  urlInput.disabled = false;
  keyInput.disabled = false;
});

// 设置默认模型
async function setDefaultModel(providerId, modelId) {
  if (!currentOpenCodeConfig) return;

  const opencodeConfig = JSON.parse(JSON.stringify(currentOpenCodeConfig));
  opencodeConfig.model = `${providerId}/${modelId}`;

  const result = await window.electronAPI.saveOpenCodeConfig(opencodeConfig);
  if (result.success) {
    showNotification('默认模型已更新', 'success');
    // 注意：loadModels 会由文件变更监听自动触发
  } else {
    showNotification('更新默认模型失败: ' + result.error, 'error');
  }
}

// 删除模型逻辑
async function deleteModel(providerId, modelId) {
  if (!currentOpenCodeConfig || !currentOpenCodeConfig.provider) return;

  const opencodeConfig = JSON.parse(JSON.stringify(currentOpenCodeConfig));
  const provider = opencodeConfig.provider[providerId];

  if (provider && provider.models && provider.models[modelId]) {
    delete provider.models[modelId];

    // 清理元数据
    if (config.modelMetadata) {
      delete config.modelMetadata[`${providerId}:${modelId}`];
      await window.electronAPI.saveConfig(config);
    }

    // 如果该 Provider 下没有模型了，自动删除该 Provider 块
    if (Object.keys(provider.models).length === 0) {
      delete opencodeConfig.provider[providerId];
    }

    const result = await window.electronAPI.saveOpenCodeConfig(opencodeConfig);
    if (result.success) {
      showNotification('模型已删除', 'success');
      loadModels(); // 重新加载
    } else {
      showNotification('删除失败: ' + result.error, 'error');
    }
  }
}

// 弹窗控制逻辑
const editModal = document.getElementById('edit-modal');
const closeModalBtn = document.getElementById('close-modal');
const cancelEditBtn = document.getElementById('cancel-edit');
const saveEditBtn = document.getElementById('save-edit');

function openEditModal(providerId, modelId) {
  if (!currentOpenCodeConfig || !currentOpenCodeConfig.provider) return;

  const provider = currentOpenCodeConfig.provider[providerId];
  if (!provider) return;

  // 填充数据
  document.getElementById('edit-old-provider-id').value = providerId;
  document.getElementById('edit-old-model-name').value = modelId;
  
  document.getElementById('edit-provider-id').value = providerId;
  document.getElementById('edit-model-alias').value = provider.name || '';
  document.getElementById('edit-model-name').value = modelId;
  document.getElementById('edit-base-url').value = (provider.options && provider.options.baseURL) || '';
  document.getElementById('edit-api-key').value = (provider.options && provider.options.apiKey) || '';

  editModal.classList.add('active');
}

function closeEditModal() {
  editModal.classList.remove('active');
}

closeModalBtn.onclick = closeEditModal;
cancelEditBtn.onclick = closeEditModal;

// 点击遮罩层关闭
editModal.onclick = (e) => {
  if (e.target === editModal) closeEditModal();
};

saveEditBtn.onclick = async () => {
  const oldProviderId = document.getElementById('edit-old-provider-id').value;
  const oldModelName = document.getElementById('edit-old-model-name').value;
  
  const newProviderId = document.getElementById('edit-provider-id').value.trim();
  const newModelAlias = document.getElementById('edit-model-alias').value.trim();
  const newModelName = document.getElementById('edit-model-name').value.trim();
  const newBaseUrl = document.getElementById('edit-base-url').value.trim();
  const newApiKey = document.getElementById('edit-api-key').value.trim();

  if (!newProviderId || !newModelAlias || !newModelName || !newBaseUrl || !newApiKey) {
    showNotification('请填齐所有必填字段', 'error');
    return;
  }

  const opencodeConfig = JSON.parse(JSON.stringify(currentOpenCodeConfig));
  
  // 处理逻辑：
  // 1. 如果 Provider ID 变了，或者 Model Name 变了，我们需要先删除旧的，再创建新的
  
  // 如果 Provider ID 没变
  if (oldProviderId === newProviderId) {
    const provider = opencodeConfig.provider[oldProviderId];
    provider.name = newModelAlias;
    provider.options.baseURL = newBaseUrl;
    provider.options.apiKey = newApiKey;
    
    // 如果模型名称变了
    if (oldModelName !== newModelName) {
      delete provider.models[oldModelName];
      provider.models[newModelName] = { 
        name: newModelName
      };

      // 更新元数据
      if (config.modelMetadata) {
        const oldTimestamp = config.modelMetadata[`${oldProviderId}:${oldModelName}`];
        delete config.modelMetadata[`${oldProviderId}:${oldModelName}`];
        config.modelMetadata[`${oldProviderId}:${newModelName}`] = oldTimestamp || Date.now();
      }
    }
  } else {
    // Provider ID 变了，相当于迁移到新 Provider
    // 获取旧模型的时间戳
    const timestamp = (config.modelMetadata && config.modelMetadata[`${oldProviderId}:${oldModelName}`]) || Date.now();

    // 删除旧 Provider 下的模型
    delete opencodeConfig.provider[oldProviderId].models[oldModelName];
    
    // 清理旧元数据
    if (config.modelMetadata) {
      delete config.modelMetadata[`${oldProviderId}:${oldModelName}`];
    }

    // 如果旧 Provider 空了，删除它
    if (Object.keys(opencodeConfig.provider[oldProviderId].models).length === 0) {
      delete opencodeConfig.provider[oldProviderId];
    }
    
    // 在新 Provider 下创建
    if (!opencodeConfig.provider[newProviderId]) {
      opencodeConfig.provider[newProviderId] = {
        npm: "@ai-sdk/openai-compatible",
        name: newModelAlias,
        options: { baseURL: newBaseUrl, apiKey: newApiKey },
        models: {}
      };
    }
    opencodeConfig.provider[newProviderId].models[newModelName] = { 
      name: newModelName
    };

    // 保存新元数据
    if (!config.modelMetadata) config.modelMetadata = {};
    config.modelMetadata[`${newProviderId}:${newModelName}`] = timestamp;
  }

  // 保存 launcher 配置
  await window.electronAPI.saveConfig(config);

  const result = await window.electronAPI.saveOpenCodeConfig(opencodeConfig);
  if (result.success) {
    showNotification('模型修改成功！', 'success');
    closeEditModal();
    loadModels();
  } else {
    showNotification('保存失败: ' + result.error, 'error');
  }
};

// 智能解析弹窗控制
const parseModal = document.getElementById('parse-modal');
const openParseModalBtn = document.getElementById('open-parse-modal-btn');
const closeParseModalBtn = document.getElementById('close-parse-modal');
const cancelParseBtn = document.getElementById('cancel-parse');
const confirmParseBtn = document.getElementById('confirm-parse');
const parseCodeInput = document.getElementById('parse-code-input');

function openParseModal() {
  parseCodeInput.value = '';
  parseModal.classList.add('active');
}

function closeParseModal() {
  parseModal.classList.remove('active');
}

openParseModalBtn.onclick = openParseModal;
closeParseModalBtn.onclick = closeParseModal;
cancelParseBtn.onclick = closeParseModal;

parseModal.onclick = (e) => {
  if (e.target === parseModal) closeParseModal();
};

confirmParseBtn.onclick = () => {
  const code = parseCodeInput.value;
  if (!code.trim()) {
    showNotification('请先粘贴示例代码', 'error');
    return;
  }

  const result = parseModelCode(code);
  
  if (result.baseUrl || result.modelName) {
    if (result.baseUrl) {
      document.getElementById('new-base-url').value = result.baseUrl;
    }
    if (result.modelName) {
      document.getElementById('new-model-name').value = result.modelName;
    }
    showNotification('解析成功！已自动填充', 'success');
    closeParseModal();
  } else {
    showNotification('未能识别到 Base URL 或模型名称，请检查代码格式', 'error');
  }
};

function parseModelCode(code) {
  const result = { baseUrl: '', modelName: '' };
  
  // 匹配模式：支持多种编程语言的赋值方式 (base_url: "...", base_url = "...", 等)
  const baseUrlRegex = /(?:base_url|baseURL|api_base|endpoint)["']?\s*[:=]\s*["']([^"']+)["']/i;
  const modelRegex = /(?:model|model_name|deployment_id|engine)["']?\s*[:=]\s*["']([^"']+)["']/i;
  
  const baseUrlMatch = code.match(baseUrlRegex);
  const modelMatch = code.match(modelRegex);
  
  if (baseUrlMatch) result.baseUrl = baseUrlMatch[1];
  if (modelMatch) result.modelName = modelMatch[1];
  
  return result;
}

// 通知提示
function showNotification(message, type = 'info') {
  // 简单实现，可以用更好的通知库
  alert(message);
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', () => {
  initialize();
  setupTooltip();
});

// 设置全局 Tooltip 跟随鼠标
function setupTooltip() {
  const tooltip = document.getElementById('custom-tooltip');
  
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target && target.dataset.tooltip) {
      tooltip.textContent = target.dataset.tooltip;
      tooltip.classList.add('active');
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (tooltip.classList.contains('active')) {
      // 偏移 15px 避免遮挡鼠标
      tooltip.style.left = (e.clientX + 15) + 'px';
      tooltip.style.top = (e.clientY + 15) + 'px';
    }
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
      tooltip.classList.remove('active');
    }
  });
}
