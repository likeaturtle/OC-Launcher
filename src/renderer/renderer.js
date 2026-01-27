// 全局状态
let config = null;
let currentWorkDir = '';
let currentOpenCodeConfig = null;

// 主内容区滚动条显示控制
let scrollTimer = null;
const mainContent = document.querySelector('.main-content');

if (mainContent) {
  mainContent.addEventListener('scroll', () => {
    // 添加 scrolling 类，显示滚动条
    mainContent.classList.add('scrolling');
    
    // 清除之前的计时器
    if (scrollTimer) {
      clearTimeout(scrollTimer);
    }
    
    // 滚动停止 1 秒后隐藏滚动条
    scrollTimer = setTimeout(() => {
      mainContent.classList.remove('scrolling');
    }, 1000);
  });
}

// 页面切换
document.querySelectorAll('.nav-item').forEach(item => {
  const navItemContent = item.querySelector('.nav-item-content');
  const submenu = item.querySelector('.nav-submenu');
  
  // 点击导航项主体
  if (navItemContent) {
    navItemContent.addEventListener('click', (e) => {
      e.stopPropagation();
      const page = item.dataset.page;
      
      // 更新导航状态
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // 显示对应页面
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`).classList.add('active');
      
      // 清除所有子菜单激活状态
      document.querySelectorAll('.submenu-item').forEach(sub => sub.classList.remove('active'));
      
      // 如果有下拉菜单，切换展开/收起状态
      if (submenu) {
        // 关闭其他展开的菜单
        document.querySelectorAll('.nav-item.expanded').forEach(expandedItem => {
          if (expandedItem !== item) {
            expandedItem.classList.remove('expanded');
          }
        });
        
        // 切换当前菜单
        item.classList.toggle('expanded');
      }
  
      // 如果切换到模型管理页面，加载模型信息
      if (page === 'models') {
        loadModels();
      }
    });
  }
  
  // 点击子菜单项
  if (submenu) {
    const submenuItems = submenu.querySelectorAll('.submenu-item');
    submenuItems.forEach(submenuItem => {
      submenuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = submenuItem.dataset.target;
        
        // 更新子菜单激活状态
        document.querySelectorAll('.submenu-item').forEach(sub => sub.classList.remove('active'));
        submenuItem.classList.add('active');
        
        // 跳转到对应模块
        if (target) {
          setTimeout(() => {
            const targetElement = document.getElementById(target);
            if (targetElement) {
              // 滚动到目标元素，带偏移量避免被顶部遮罩遮挡
              const mainContent = document.querySelector('.main-content');
              const targetOffset = targetElement.offsetTop - 60;
              mainContent.scrollTo({
                top: targetOffset,
                behavior: 'smooth'
              });
            }
          }, 100);
        }
      });
    });
  }
});

// 底部图标点击事件 - 使用外部浏览器打开链接
document.querySelectorAll('.footer-link').forEach(link => {
  link.addEventListener('click', () => {
    const url = link.dataset.url;
    if (url) {
      window.electronAPI.openExternal(url);
    }
  });
  
  // 添加鼠标样式
  link.style.cursor = 'pointer';
});

// 初始化
async function initialize() {
  config = await window.electronAPI.getConfig();
  await updateStatus();
  
  // 更新版本号显示
  const version = await window.electronAPI.getAppVersion();
  document.getElementById('app-version').textContent = `版本号：v${version}`;
  
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
  window.electronAPI.onConfigChange(async () => {
    console.log('检测到 opencode.json 变化，正在刷新模型列表……');
    await loadModels(); // 内部会更新 currentOpenCodeConfig
    await loadZenModels(); // 现在可以确保使用更新后的 currentOpenCodeConfig
  });

  // 安装/卸载 OpenCode 日志监听
  window.electronAPI.onInstallProgress((data) => {
    // 添加到环境进度弹窗
    appendEnvProgressLog(data);
  });

  // 加载 OpenCode Zen 认证状态
  await loadZenAuthStatus();

  // 加载 OpenCode Zen 模型信息
  await loadZenModels();
}

// 全局变量存储所有 Zen 模型，用于搜索过滤
let allZenModels = [];

// 全局变量存储所有第三方模型，用于搜索过滤
let allThirdPartyModels = [];

// 加载 OpenCode Zen 模型信息
async function loadZenModels() {
  const tbody = document.getElementById('zen-model-list-body');
  
  // 保存当前内容，避免每次刷新配置都重新加载导致的闪烁感（如果是从配置文件变化触发的）
  const isInitialLoad = tbody.innerHTML.includes('正在加载模型信息');
  if (isInitialLoad) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #858585;"><i class="fas fa-spinner fa-spin"></i> 正在加载模型信息……</td></tr>';
  }
  
  try {
    const result = await window.electronAPI.getZenModels();
    
    if (result.success) {
      let models = [];
      if (Array.isArray(result.data)) {
        models = result.data;
      } else if (result.data && Array.isArray(result.data.models)) {
        models = result.data.models;
      } else if (result.data && Array.isArray(result.data.data)) {
        models = result.data.data;
      }

      allZenModels = models; // 保存到全局变量供搜索使用
      renderZenModels(models);
    } else {
      const errorMsg = result.error || '无法连接到模型服务，请检查网络设置';
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #f48771;">加载失败: ${errorMsg}</td></tr>`;
    }
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #f48771;">加载异常: ${error.message}</td></tr>`;
  }
}

// 渲染 Zen 模型列表（提取为独立函数以支持搜索过滤）
function renderZenModels(models) {
  const tbody = document.querySelector('#zen-model-list-container tbody');
  
  if (models.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #858585;">暂无可用模型</td></tr>';
    return;
  }
  
  const currentModel = currentOpenCodeConfig ? currentOpenCodeConfig.model : '';
  
  // 每行显示两个模型，将模型数组按两个一组分割
  const rows = [];
  for (let i = 0; i < models.length; i += 2) {
    const model1 = models[i];
    const model2 = models[i + 1];
    
    const modelId1 = model1.Id || model1.id || 'Unknown';
    const isDefault1 = currentModel === `opencode/${modelId1}`;
    
    let rowHtml = `
      <tr>
        <td>
          <input type="radio" name="default-model" class="zen-default-model-radio" 
            data-model="${modelId1}" ${isDefault1 ? 'checked' : ''} title="设为默认模型">
        </td>
        <td>${modelId1}</td>`;
    
    if (model2) {
      const modelId2 = model2.Id || model2.id || 'Unknown';
      const isDefault2 = currentModel === `opencode/${modelId2}`;
      rowHtml += `
        <td>
          <input type="radio" name="default-model" class="zen-default-model-radio" 
            data-model="${modelId2}" ${isDefault2 ? 'checked' : ''} title="设为默认模型">
        </td>
        <td>${modelId2}</td>`;
    } else {
      // 如果只有一个模型（奇数情况），填充空单元格
      rowHtml += `
        <td></td>
        <td></td>`;
    }
    
    rowHtml += `
      </tr>`;
    rows.push(rowHtml);
  }
  
  tbody.innerHTML = rows.join('');

  // 绑定单选框事件
  document.querySelectorAll('.zen-default-model-radio').forEach(radio => {
    radio.onchange = async (e) => {
      const mId = radio.dataset.model;
      await setDefaultModel('opencode', mId);
    };
  });
}

// 加载 OpenCode Zen 认证状态
let currentZenApiKey = '';
async function loadZenAuthStatus() {
  const result = await window.electronAPI.getOpenCodeAuth();
  const statusDiv = document.getElementById('zen-auth-status');
  const keyDisplayDiv = document.getElementById('zen-auth-key-display');
  const displaySpan = document.getElementById('zen-api-key-display');
  
  if (result.success && result.apiKey) {
    currentZenApiKey = result.apiKey;
    statusDiv.style.display = 'block';
    keyDisplayDiv.style.display = 'block';
    displaySpan.textContent = '******';
    displaySpan.dataset.visible = 'false';
    document.querySelector('#toggle-zen-key-btn i').className = 'fas fa-eye';
  } else {
    currentZenApiKey = '';
    statusDiv.style.display = 'none';
    keyDisplayDiv.style.display = 'none';
  }
}

// 切换 API Key 显示/隐藏
document.getElementById('toggle-zen-key-btn').addEventListener('click', () => {
  const displaySpan = document.getElementById('zen-api-key-display');
  const icon = document.querySelector('#toggle-zen-key-btn i');
  const isVisible = displaySpan.dataset.visible === 'true';
  
  if (isVisible) {
    displaySpan.textContent = '******';
    displaySpan.dataset.visible = 'false';
    icon.className = 'fas fa-eye';
  } else {
    displaySpan.textContent = currentZenApiKey;
    displaySpan.dataset.visible = 'true';
    icon.className = 'fas fa-eye-slash';
  }
});

// OpenCode Zen 模型搜索
document.getElementById('zen-model-search').addEventListener('input', (e) => {
  const keyword = e.target.value.trim().toLowerCase();
  
  if (!keyword) {
    // 清空搜索关键词时，显示所有模型
    renderZenModels(allZenModels);
    return;
  }
  
  // 过滤模型
  const filteredModels = allZenModels.filter(model => {
    const modelId = (model.Id || model.id || '').toLowerCase();
    return modelId.includes(keyword);
  });
  
  renderZenModels(filteredModels);
});

// 第三方模型搜索
document.getElementById('third-model-search').addEventListener('input', (e) => {
  const keyword = e.target.value.trim().toLowerCase();
  
  if (!keyword) {
    // 清空搜索关键词时，显示所有模型
    renderThirdPartyModels(allThirdPartyModels);
    return;
  }
  
  // 过滤模型（搜索 Provider ID、Provider 名称、模型 ID）
  const filteredModels = allThirdPartyModels.filter(model => {
    const providerId = (model.providerId || '').toLowerCase();
    const providerName = (model.providerName || '').toLowerCase();
    const modelId = (model.modelId || '').toLowerCase();
    return providerId.includes(keyword) || providerName.includes(keyword) || modelId.includes(keyword);
  });
  
  renderThirdPartyModels(filteredModels);
});

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
  
  // 检查 npm 状态
  const npmCheck = await window.electronAPI.checkNpm();
  const npmStatus = document.getElementById('npm-status');
  const npmItem = npmStatus.parentElement;
  
  if (npmCheck.extracted) {
    let statusText = npmCheck.version ? `${npmCheck.version}` : '';
    npmStatus.innerHTML = `<i class="fas fa-check-circle"></i> 已配置${statusText ? '（' + statusText + '）' : ''}`;
    npmStatus.style.color = '#4ec9b0';
    npmItem.dataset.tooltip = 'npm 包管理工具';
  } else {
    npmStatus.textContent = '未配置';
    npmStatus.style.color = '#858585';
    npmItem.dataset.tooltip = '';
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
  const npmRegItem = npmRegistry.parentElement;
  
  if (npmRegistryResult.success && npmRegistryResult.registry) {
    npmRegistry.textContent = npmRegistryResult.registry;
    npmRegistry.style.color = '#4ec9b0';
    npmRegItem.dataset.tooltip = '点击即可复制 npm 源地址';
    npmRegItem.onclick = () => copyToClipboard(npmRegistryResult.registry, 'npm 源地址');
    config.npmRegistry = npmRegistryResult.registry; // 同步更新本地 config
  } else {
    npmRegistry.textContent = '未配置';
    npmRegistry.style.color = '#858585';
    npmRegItem.dataset.tooltip = '';
    npmRegItem.onclick = null;
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
  
  // 显示进度弹窗
  showEnvProgressModal('解压 Node.js', 'Node.js 环境配置');
  
  btn.disabled = true;
  btn.textContent = '解压中……';
  
  const result = await window.electronAPI.extractNodejs();
  
  if (result.success) {
    config.nodejsExtracted = true;
    updateStatus();
    updateEnvProgressModal(true, 'Node.js 解压成功！');
  } else {
    updateEnvProgressModal(false, '解压失败: ' + result.error);
  }
  
  btn.disabled = false;
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
  
  // 显示进度弹窗
  showEnvProgressModal('配置 npm 源', 'npm 源配置');
  
  btn.disabled = true;
  btn.textContent = '配置中……';
  
  const result = await window.electronAPI.configureNpm(registry);
  
  if (result.success) {
    config.npmRegistry = registry;
    updateStatus();
    updateEnvProgressModal(true, 'npm 源配置成功！');
  } else {
    updateEnvProgressModal(false, '配置失败: ' + result.error);
  }
  
  btn.disabled = false;
  btn.textContent = '设置 npm 源';
});

// 安装 OpenCode
document.getElementById('install-opencode-btn').addEventListener('click', async () => {
  const btn = document.getElementById('install-opencode-btn');
  
  // 显示进度弹窗
  showEnvProgressModal('安装 OpenCode', 'OpenCode 安装');
  
  btn.disabled = true;
  btn.textContent = '安装中……';
  
  const result = await window.electronAPI.installOpenCode();
  
  if (result.success) {
    config.opencodeInstalled = true;
    updateStatus();
    updateLaunchButtons();
    updateEnvProgressModal(true, 'OpenCode 安装成功！');
  } else {
    updateEnvProgressModal(false, '安装失败: ' + result.error);
  }
  
  btn.disabled = false;
  btn.textContent = '安装 / 更新 OpenCode';
});

// 卸载 OpenCode
const uninstallBtn = document.getElementById('uninstall-opencode-btn');
if (uninstallBtn) {
  uninstallBtn.addEventListener('click', async () => {
    const confirmText = '确定要卸载当前已安装的 OpenCode 吗？';
    if (!confirm(confirmText)) {
      return;
    }

    // 显示进度弹窗
    showEnvProgressModal('卸载 OpenCode', 'OpenCode 卸载');

    uninstallBtn.disabled = true;
    uninstallBtn.textContent = '卸载中……';

    const result = await window.electronAPI.uninstallOpenCode();

    if (result.success) {
      config.opencodeInstalled = false;
      updateStatus();
      updateLaunchButtons();
      updateEnvProgressModal(true, 'OpenCode 卸载成功！');
    } else {
      updateEnvProgressModal(false, '卸载失败: ' + result.error);
    }

    uninstallBtn.disabled = false;
    uninstallBtn.textContent = '卸载 OpenCode';
  });
}

// 安装指定版本 OpenCode
const installVersionBtn = document.getElementById('install-opencode-version-btn');
const versionInput = document.getElementById('opencode-version-input');

if (installVersionBtn && versionInput) {
  // 按钮初始样式：根据输入内容决定是否“可用”
  function updateInstallVersionButtonState() {
    const hasVersion = !!versionInput.value.trim();
    if (hasVersion) {
      installVersionBtn.classList.remove('disabled');
    } else {
      installVersionBtn.classList.add('disabled');
    }
  }

  updateInstallVersionButtonState();

  // 输入内容变化时，动态更新按钮状态
  versionInput.addEventListener('input', () => {
    updateInstallVersionButtonState();
  });

  installVersionBtn.addEventListener('click', async (event) => {
    // 点击在输入框上时不触发安装，只是编辑内容
    if (event.target === versionInput) {
      return;
    }

    const version = versionInput.value.trim();

    // 没填版本号时，将焦点移到输入框
    if (!version) {
      versionInput.focus();
      return;
    }

    // 检查版本号格式：必须为 数字.数字.数字
    const versionPattern = /^\d+\.\d+\.\d+$/;
    if (!versionPattern.test(version)) {
      alert('版本号格式不正确，请输入类似 1.1.28 的版本号（数字.数字.数字）');
      versionInput.focus();
      return;
    }

    // 显示进度弹窗
    showEnvProgressModal(`安装 OpenCode ${version}`, 'OpenCode 安装');

    installVersionBtn.classList.add('disabled');
    installVersionBtn.querySelector('span').textContent = '安装中……';

    const result = await window.electronAPI.installOpenCodeVersion(version);

    if (result.success) {
      config.opencodeInstalled = true;
      updateStatus();
      updateLaunchButtons();
      updateEnvProgressModal(true, `OpenCode ${version} 安装成功！`);
    } else {
      updateEnvProgressModal(false, '安装失败: ' + result.error);
    }

    installVersionBtn.querySelector('span').textContent = '安装指定版本 OpenCode';
    updateInstallVersionButtonState();
  });
}

// 重置环境
document.getElementById('reset-env-btn').addEventListener('click', async () => {
  const confirmText = '此操作将清空所有环境数据，包括已安装的 Node.js 和 OpenCode，操作不可逆！\n\n确定要继续吗？';
  if (!confirm(confirmText)) {
    return;
  }
  
  const btn = document.getElementById('reset-env-btn');
  
  // 显示进度弹窗
  showEnvProgressModal('重置环境', '环境重置');
  
  btn.disabled = true;
  btn.textContent = '重置中……';
  
  const result = await window.electronAPI.resetEnvironment();
  
  if (result.success) {
    updateEnvProgressModal(true, '环境重置成功！页面将在 2 秒后重新加载……');
    
    // 重置本地配置状态
    config.nodejsExtracted = false;
    config.opencodeInstalled = false;
    config.npmRegistry = '';
    
    // 2秒后重新加载页面
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  } else {
    updateEnvProgressModal(false, '重置失败: ' + result.error);
  }
  
  btn.disabled = false;
  btn.textContent = '重置环境';
});

// 生成 OpenCode 默认配置
document.getElementById('generate-config-btn').addEventListener('click', async () => {
  const btn = document.getElementById('generate-config-btn');
  const status = document.getElementById('generate-config-status');
  
  btn.disabled = true;
  btn.textContent = '生成中……';
  status.className = 'step-status info';
  status.textContent = '正在生成默认配置文件……';
  
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
    status.textContent = '配置文件已存在，等待确认……';
    
    if (confirm(confirmText)) {
      // 用户确认覆盖，强制生成
      status.textContent = '正在覆盖配置文件……';
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

// 打开配置目录
document.getElementById('open-config-dir-btn').addEventListener('click', async () => {
  const result = await window.electronAPI.openConfigDirectory();
  if (result.success) {
    showNotification('已打开配置目录', 'success');
  } else {
    showNotification('打开失败: ' + result.error, 'error');
  }
});

// 生成鉴权文件
document.getElementById('generate-auth-btn').addEventListener('click', async () => {
  const btn = document.getElementById('generate-auth-btn');
  const status = document.getElementById('generate-auth-status');
  
  btn.disabled = true;
  btn.textContent = '生成中……';
  status.className = 'step-status info';
  status.textContent = '正在生成默认鉴权文件……';
  
  const result = await window.electronAPI.generateAuthFile();
  
  if (result.success) {
    status.className = 'step-status success';
    status.textContent = `✓ 鉴权文件已生成：${result.path}`;
    btn.disabled = false;
    btn.textContent = '生成默认鉴权文件';
  } else if (result.fileExists) {
    // 配置文件已存在，询问用户是否覆盖
    const confirmText = '鉴权文件已存在，继续操作将对已有鉴权文件进行覆盖，该操作不可撤销，是否继续？';
    status.className = 'step-status info';
    status.textContent = '鉴权文件已存在，等待确认……';
    
    if (confirm(confirmText)) {
      // 用户确认覆盖，强制生成
      status.textContent = '正在覆盖鉴权文件……';
      const forceResult = await window.electronAPI.generateAuthFile({ force: true });
      
      if (forceResult.success) {
        status.className = 'step-status success';
        status.textContent = `✓ 鉴权文件已生成：${forceResult.path}`;
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
    btn.textContent = '生成默认鉴权文件';
  } else {
    status.className = 'step-status error';
    status.textContent = '✗ 生成失败: ' + result.error;
    btn.disabled = false;
    btn.textContent = '生成默认鉴权文件';
  }
});

// 打开鉴权文件目录
document.getElementById('open-auth-dir-btn').addEventListener('click', async () => {
  const result = await window.electronAPI.openAuthDirectory();
  if (result.success) {
    showNotification('已打开配置文件目录', 'success');
  } else {
    showNotification('打开失败: ' + result.error, 'error');
  }
});

// 打开 Skills 全局主文件目录
document.getElementById('open-global-skills-dir-btn').addEventListener('click', async () => {
  const result = await window.electronAPI.openGlobalSkillsDirectory();
  if (result.success) {
    showNotification('已打开 Skills 全局主文件目录', 'success');
  } else {
    showNotification('打开失败: ' + result.error, 'error');
  }
});

// 打开 Skills for OpenCode 目录
document.getElementById('open-opencode-skills-dir-btn').addEventListener('click', async () => {
  const result = await window.electronAPI.openOpenCodeSkillsDirectory();
  if (result.success) {
    showNotification('已打开 Skills for OpenCode 目录', 'success');
  } else {
    showNotification('打开失败: ' + result.error, 'error');
  }
});

// 加载模型信息
async function loadModels() {
  const modelListBody = document.getElementById('model-list-body');
  if (!modelListBody) return;

  modelListBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #858585;">正在加载模型信息……</td></tr>';
  
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

      allThirdPartyModels = allModels; // 保存到全局变量供搜索使用
      renderThirdPartyModels(allModels);
    } else {
      modelListBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #858585;">暂无提供商信息</td></tr>';
    }
  } else {
    modelListBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f48771;">${result.error || '无法加载配置文件'}</td></tr>`;
  }
}

// 渲染第三方模型列表（提取为独立函数以支持搜索过滤）
function renderThirdPartyModels(models) {
  const modelListBody = document.getElementById('model-list-body');
  const result = { config: currentOpenCodeConfig };
  
  if (models.length === 0) {
    modelListBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #858585;">暂无模型信息</td></tr>';
    return;
  }
  
  modelListBody.innerHTML = '';
  models.forEach(model => {
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

// OpenCode Zen 认证管理
document.getElementById('save-zen-auth-btn').addEventListener('click', async () => {
  const apiKey = document.getElementById('zen-api-key').value.trim();
  
  if (!apiKey) {
    showNotification('请输入 API Key', 'error');
    return;
  }

  // 如果已存在 Key，进行二次确认
  if (currentZenApiKey) {
    const confirmed = await window.electronAPI.showConfirmDialog({
      title: '覆盖确认',
      message: '点击确认后将覆盖OpenCode Zen已有 API Key，请谨慎操作',
      detail: '此操作将更新本地 auth.json 配置文件。'
    });
    
    if (!confirmed) return;
  }

  const result = await window.electronAPI.saveOpenCodeAuth(apiKey);
  if (result.success) {
    showNotification('OpenCode Zen API Key 已保存', 'success');
    document.getElementById('zen-api-key').value = ''; // 清空输入框
    await loadZenAuthStatus(); // 刷新状态显示
  } else {
    showNotification('保存失败: ' + result.error, 'error');
  }
});

// 处理外部链接跳转
document.getElementById('open-zen-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.electronAPI.openExternal('https://opencode.ai/auth');
});

// 通知提示
function showNotification(message, type = 'info') {
  // 简单实现，可以用更好的通知库
  alert(message);
}

// 显示环境进度弹窗
function showEnvProgressModal(operation, title) {
  const modal = document.getElementById('env-progress-modal');
  const modalTitle = document.getElementById('env-modal-title');
  const modalStatus = document.getElementById('env-modal-status');
  const modalLog = document.getElementById('env-modal-log');
  const closeBtn = document.getElementById('close-env-modal');
  
  // 设置内容
  modalTitle.textContent = title || '操作进度';
  
  // 重置状态
  modalStatus.className = 'step-status info';
  modalStatus.textContent = `正在${operation}……`;
  modalLog.textContent = `>> 开始${operation}...\n\n`;
  modalLog.classList.add('active');
  
  // 禁用关闭按钮
  closeBtn.disabled = true;
  
  // 显示弹窗
  modal.style.display = 'flex';
}

// 更新环境进度弹窗状态
function updateEnvProgressModal(success, message) {
  const modalStatus = document.getElementById('env-modal-status');
  const modalLog = document.getElementById('env-modal-log');
  const closeBtn = document.getElementById('close-env-modal');
  
  if (success) {
    modalStatus.className = 'step-status success';
    modalStatus.textContent = `✓ ${message}`;
    if (modalLog) {
      modalLog.textContent += `\n>> 完成！`;
    }
  } else {
    modalStatus.className = 'step-status error';
    modalStatus.textContent = `✗ ${message}`;
  }
  
  // 启用关闭按钮
  closeBtn.disabled = false;
}

// 添加日志到环境进度弹窗
function appendEnvProgressLog(data) {
  const modalLog = document.getElementById('env-modal-log');
  if (!modalLog) return;
  
  // 移除 ANSI 颜色代码
  let cleanData = data
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\[\?[0-9]+[hl]/g, '')
    .replace(/\x1b\[[0-9]+[ABCD]/g, '')
    .replace(/\x1b\[2J/g, '')
    .replace(/\x1b\[H/g, '');
  
  // 过滤掉 ASCII 艺术字
  const lines = cleanData.split('\n');
  const filteredLines = lines.filter(line => {
    const boxChars = line.match(/[\u2500-\u257F\u2580-\u259F]/g);
    if (boxChars && boxChars.length > line.length * 0.3) {
      return false;
    }
    return true;
  });
  cleanData = filteredLines.join('\n');
  
  cleanData = cleanData.replace(/\r\n/g, '\n');
  
  // 处理单独的 \r（进度条场景）
  if (cleanData.includes('\r')) {
    const parts = cleanData.split('\r');
    cleanData = parts[parts.length - 1];
    
    if (parts.length > 1) {
      const logLines = modalLog.textContent.split('\n');
      if (logLines.length > 0 && logLines[logLines.length - 1] !== '') {
        logLines[logLines.length - 1] = cleanData;
        modalLog.textContent = logLines.join('\n');
      } else {
        modalLog.textContent += cleanData;
      }
      modalLog.scrollTop = modalLog.scrollHeight;
      return;
    }
  }
  
  if (cleanData.trim() === '') {
    return;
  }
  
  modalLog.textContent += cleanData;
  modalLog.scrollTop = modalLog.scrollHeight;
}

// 关闭环境进度弹窗
document.getElementById('close-env-modal')?.addEventListener('click', () => {
  const modal = document.getElementById('env-progress-modal');
  modal.style.display = 'none';
});
async function showSkillInstallModal(skillId, installType, installDir) {
  const modal = document.getElementById('skill-install-modal');
  const modalSkillName = document.getElementById('modal-skill-name');
  const modalInstallType = document.getElementById('modal-install-type');
  const modalInstallDir = document.getElementById('modal-install-dir');
  const openDirIcon = document.getElementById('open-install-dir-icon');
  const modalStatus = document.getElementById('modal-install-status');
  const modalLog = document.getElementById('modal-install-log');
  const closeBtn = document.getElementById('close-install-modal');
  
  // 设置内容
  modalSkillName.textContent = skillId;
  modalInstallType.textContent = installType;
  
  // 处理安装目录显示
  let actualDir = installDir;
  if (installType === '全局安装') {
    // 获取实际的全局安装目录
    const result = await window.electronAPI.getGlobalSkillDir();
    actualDir = result.path;
  }
  
  modalInstallDir.textContent = actualDir;
  
  // 显示/隐藏打开目录图标，并设置点击事件
  if (actualDir && actualDir !== '全局') {
    openDirIcon.style.display = 'inline';
    openDirIcon.onclick = async () => {
      await window.electronAPI.openDirectory(actualDir);
    };
  } else {
    openDirIcon.style.display = 'none';
  }
  
  // 重置状态
  modalStatus.className = 'step-status info';
  modalStatus.textContent = `正在安装 ${skillId}……`;
  modalLog.textContent = `>> 安装目录: ${actualDir}
>> Skill: ${skillId}
>> 安装类型: ${installType}
>> 开始安装...

`;
  modalLog.classList.add('active');
  
  // 禁用关闭按钮
  closeBtn.disabled = true;
  
  // 显示弹窗
  modal.style.display = 'flex';
}

// 关闭 Skill 安装进度弹窗
document.getElementById('close-install-modal')?.addEventListener('click', () => {
  const modal = document.getElementById('skill-install-modal');
  modal.style.display = 'none';
});

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', () => {
  initialize();
  setupTooltip();
  setupSkillsPage();
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

// Skills 页面功能初始化
function setupSkillsPage() {
  const skillInstallDir = document.getElementById('skill-install-dir');
  const selectSkillDirBtn = document.getElementById('select-skill-dir-btn');
  const skillInstallUrl = document.getElementById('skill-install-url');
  const installSkillBtn = document.getElementById('install-skill-btn');
  const skillInstallStatus = document.getElementById('skill-install-status');
  const skillInstallLog = document.getElementById('skill-install-log');
  const skillInstallSections = document.querySelectorAll('.skill-install-section');
  const globalInstallToggle = document.querySelector('.toggle-switch');

  // 设置全局安装 tooltip（根据操作系统）
  if (globalInstallToggle) {
    const platform = navigator.platform.toLowerCase();
    let globalInstallPath = '';
    
    if (platform.includes('mac')) {
      globalInstallPath = '~/.config/opencode/skills';
    } else if (platform.includes('win')) {
      globalInstallPath = '%USERPROFILE%\\.config\\opencode\\skills';
    } else {
      globalInstallPath = '~/.config/opencode/skills';
    }
    
    globalInstallToggle.setAttribute('data-tooltip', `全局安装位置：${globalInstallPath}`);
  }

  // 选择 Skills 安装目录
  selectSkillDirBtn.addEventListener('click', async () => {
    const result = await window.electronAPI.selectDirectory();
    if (result.success) {
      skillInstallDir.value = result.path;
    }
  });

  // 监听 Skill 安装进度
  let skillLogBuffer = ''; // 缓冲区，用于处理部分输出
  
  // 监听 Skill 安装进度
  window.electronAPI.onSkillInstallProgress((data) => {
    const modalLog = document.getElementById('modal-install-log');
    if (!modalLog) return;
    modalLog.classList.add('active');
    
    // 移除 ANSI 颜色代码和其他控制序列
    let cleanData = data
      .replace(/\x1b\[[0-9;]*m/g, '') // ANSI 颜色
      .replace(/\x1b\[\?[0-9]+[hl]/g, '') // 光标显示/隐藏
      .replace(/\x1b\[[0-9]+[ABCD]/g, '') // 光标移动
      .replace(/\x1b\[2J/g, '') // 清屏
      .replace(/\x1b\[H/g, ''); // 光标归位
    
    // 过滤掉 ASCII 艺术字（包含框线字符的行）
    const lines = cleanData.split('\n');
    const filteredLines = lines.filter(line => {
      // 如果一行主要由 Unicode 框线字符组成，则过滤掉
      const boxChars = line.match(/[\u2500-\u257F\u2580-\u259F]/g);
      if (boxChars && boxChars.length > line.length * 0.3) {
        return false; // 过滤掉这一行
      }
      return true;
    });
    cleanData = filteredLines.join('\n');
    
    // 将 \r\n 统一替换为 \n
    cleanData = cleanData.replace(/\r\n/g, '\n');
    
    // 处理单独的 \r（进度条场景）
    if (cleanData.includes('\r')) {
      // 如果包含 \r，按 \r 分割，只保留最后一部分
      const parts = cleanData.split('\r');
      cleanData = parts[parts.length - 1];
      
      // 如果有多个部分，说明需要替换当前行
      if (parts.length > 1) {
        const logLines = modalLog.textContent.split('\n');
        if (logLines.length > 0 && logLines[logLines.length - 1] !== '') {
          // 替换最后一行
          logLines[logLines.length - 1] = cleanData;
          modalLog.textContent = logLines.join('\n');
        } else {
          // 如果最后一行为空，直接追加
          modalLog.textContent += cleanData;
        }
        modalLog.scrollTop = modalLog.scrollHeight;
        return;
      }
    }
    
    // 过滤掉空行（多余的换行）
    if (cleanData.trim() === '') {
      return;
    }
    
    // 直接追加内容
    modalLog.textContent += cleanData;
    modalLog.scrollTop = modalLog.scrollHeight;
  });

  // 安装 Skill
  installSkillBtn.addEventListener('click', async () => {
    const installDir = skillInstallDir.value.trim();
    const installUrl = skillInstallUrl.value.trim();
    const isGlobalInstall = document.getElementById('skill-global-install').checked;

    // 如果不是全局安装，才检查安装目录
    if (!isGlobalInstall) {
      if (!installDir) {
        showNotification('请先指定 Skill 安装目录', 'error');
        skillInstallDir.focus();
        return;
      }
    }

    // 检查是否输入了安装地址
    if (!installUrl) {
      showNotification('请输入 Skill 安装地址', 'error');
      skillInstallUrl.focus();
      return;
    }

    // 显示弹窗
    await showSkillInstallModal(
      installUrl,
      isGlobalInstall ? '全局安装' : '项目安装',
      isGlobalInstall ? '全局' : installDir
    );

    // 执行安装
    const result = await window.electronAPI.installSkill(installDir, installUrl, isGlobalInstall);

    // 更新弹窗状态
    const modalStatus = document.getElementById('modal-install-status');
    const closeBtn = document.getElementById('close-install-modal');

    if (result.success) {
      modalStatus.className = 'step-status success';
      modalStatus.textContent = `✓ Skill 安装成功！`;
      const modalLog = document.getElementById('modal-install-log');
      if (modalLog) {
        modalLog.textContent += '\n>> 安装完成！';
      }
      skillInstallUrl.value = ''; // 清空输入框
    } else {
      modalStatus.className = 'step-status error';
      modalStatus.textContent = '✗ 安装失败: ' + result.error;
    }

    // 启用关闭按钮
    closeBtn.disabled = false;
  });

  // 检查 Skill 更新
  const checkSkillUpdateBtn = document.getElementById('check-skill-update-btn');
  checkSkillUpdateBtn.addEventListener('click', async () => {
    const installDir = skillInstallDir.value.trim();
    const isGlobalInstall = document.getElementById('skill-global-install').checked;

    // 如果不是全局安装，才检查安装目录
    if (!isGlobalInstall && !installDir) {
      showNotification('请先指定 Skill 安装目录', 'error');
      skillInstallDir.focus();
      return;
    }

    // 显示弹窗
    const modal = document.getElementById('skill-install-modal');
    const modalSkillName = document.getElementById('modal-skill-name');
    const modalInstallType = document.getElementById('modal-install-type');
    const modalInstallDir = document.getElementById('modal-install-dir');
    const openDirIcon = document.getElementById('open-install-dir-icon');
    const modalStatus = document.getElementById('modal-install-status');
    const modalLog = document.getElementById('modal-install-log');
    const closeBtn = document.getElementById('close-install-modal');
    
    // 设置内容
    modalSkillName.textContent = '检查更新';
    modalInstallType.textContent = isGlobalInstall ? '全局' : '项目';
    
    // 处理安装目录显示
    let actualDir = installDir || '全局';
    if (isGlobalInstall) {
      const result = await window.electronAPI.getGlobalSkillDir();
      actualDir = result.path;
    }
    
    modalInstallDir.textContent = actualDir;
    
    // 显示/隐藏打开目录图标
    if (actualDir && actualDir !== '全局') {
      openDirIcon.style.display = 'inline';
      openDirIcon.onclick = async () => {
        await window.electronAPI.openDirectory(actualDir);
      };
    } else {
      openDirIcon.style.display = 'none';
    }
    
    // 重置状态
    modalStatus.className = 'step-status info';
    modalStatus.textContent = '正在检查 Skill 更新……';
    modalLog.textContent = `>> 检查目录: ${actualDir}\n>> 执行: npx skills check\n\n`;
    modalLog.classList.add('active');
    
    // 禁用关闭按钮
    closeBtn.disabled = true;
    
    // 显示弹窗
    modal.style.display = 'flex';

    // 执行检查
    const result = await window.electronAPI.checkSkillUpdate(installDir);

    if (result.success) {
      modalStatus.className = 'step-status success';
      modalStatus.textContent = '✓ 检查完成！';
      if (modalLog) {
        modalLog.textContent += '\n>> 检查完成！';
      }
    } else {
      modalStatus.className = 'step-status error';
      modalStatus.textContent = '✗ 检查失败: ' + result.error;
    }

    // 启用关闭按钮
    closeBtn.disabled = false;
  });

  // 升级 Skill
  const upgradeSkillBtn = document.getElementById('upgrade-skill-btn');
  upgradeSkillBtn.addEventListener('click', async () => {
    const installDir = skillInstallDir.value.trim();
    const isGlobalInstall = document.getElementById('skill-global-install').checked;

    // 如果不是全局安装，才检查安装目录
    if (!isGlobalInstall && !installDir) {
      showNotification('请先指定 Skill 安装目录', 'error');
      skillInstallDir.focus();
      return;
    }

    // 显示弹窗
    const modal = document.getElementById('skill-install-modal');
    const modalSkillName = document.getElementById('modal-skill-name');
    const modalInstallType = document.getElementById('modal-install-type');
    const modalInstallDir = document.getElementById('modal-install-dir');
    const openDirIcon = document.getElementById('open-install-dir-icon');
    const modalStatus = document.getElementById('modal-install-status');
    const modalLog = document.getElementById('modal-install-log');
    const closeBtn = document.getElementById('close-install-modal');
    
    // 设置内容
    modalSkillName.textContent = '升级 Skill';
    modalInstallType.textContent = isGlobalInstall ? '全局' : '项目';
    
    // 处理安装目录显示
    let actualDir = installDir || '全局';
    if (isGlobalInstall) {
      const result = await window.electronAPI.getGlobalSkillDir();
      actualDir = result.path;
    }
    
    modalInstallDir.textContent = actualDir;
    
    // 显示/隐藏打开目录图标
    if (actualDir && actualDir !== '全局') {
      openDirIcon.style.display = 'inline';
      openDirIcon.onclick = async () => {
        await window.electronAPI.openDirectory(actualDir);
      };
    } else {
      openDirIcon.style.display = 'none';
    }
    
    // 重置状态
    modalStatus.className = 'step-status info';
    modalStatus.textContent = '正在升级 Skill……';
    modalLog.textContent = `>> 安装目录: ${actualDir}\n>> 执行: npx skills update\n\n`;
    modalLog.classList.add('active');
    
    // 禁用关闭按钮
    closeBtn.disabled = true;
    
    // 显示弹窗
    modal.style.display = 'flex';

    // 执行升级
    const result = await window.electronAPI.upgradeSkill(installDir);

    if (result.success) {
      modalStatus.className = 'step-status success';
      modalStatus.textContent = '✓ 升级完成！';
      if (modalLog) {
        modalLog.textContent += '\n>> 升级完成！';
      }
    } else {
      modalStatus.className = 'step-status error';
      modalStatus.textContent = '✗ 升级失败: ' + result.error;
    }

    // 启用关闭按钮
    closeBtn.disabled = false;
  });

  // 查询 Skill
  const searchSkillBtn = document.getElementById('search-skill-btn');
  const skillSearchInput = document.getElementById('skill-search-input');
  const skillSearchResults = document.getElementById('skill-search-results');
  const skillSearchResultsBody = document.getElementById('skill-search-results-body');
  const skillSearchStatus = document.getElementById('skill-search-status');

  searchSkillBtn.addEventListener('click', async () => {
    const searchKeyword = skillSearchInput.value.trim();

    if (!searchKeyword) {
      showNotification('请输入要查询的 skill 关键词', 'error');
      skillSearchInput.focus();
      return;
    }

    searchSkillBtn.disabled = true;
    searchSkillBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 查询中……';
    if (skillSearchStatus) {
      skillSearchStatus.className = 'step-status info';
      skillSearchStatus.textContent = `正在查询 skill "${searchKeyword}"……`;
    }
    
    // 显示加载中
    skillSearchResultsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #858585;"><i class="fas fa-spinner fa-spin"></i> 查询中……</td></tr>';

    const result = await window.electronAPI.searchSkill(searchKeyword);

    if (result.success) {
      if (skillSearchStatus) {
        skillSearchStatus.className = 'step-status success';
        skillSearchStatus.textContent = `✓ 查询完成！找到 ${result.skills ? result.skills.length : 0} 个结果`;
      }
      
      // 渲染查询结果
      if (result.skills && result.skills.length > 0) {
        skillSearchResultsBody.innerHTML = result.skills.map(skill => `
          <tr>
            <td style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 12px;">${skill.name || 'N/A'}</td>
            <td style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 12px;">${skill.version || 'N/A'}</td>
            <td style="font-size: 12px;"><a href="#" class="skill-url-link" data-url="${skill.description}" title="点击访问文档"><i class="fa-solid fa-up-right-from-square"></i></a></td>
            <td>
              <div class="action-buttons">
                <button class="btn-link btn-copy-skill" data-skill-name="${skill.name}" title="复制 Skill 所在库"><i class="fas fa-copy"></i></button>
                <button class="btn-link btn-install-project" data-skill="${skill.name}@${skill.version}" title="项目安装"><i class="fas fa-folder"></i></button>
                <button class="btn-link btn-install-global" data-skill="${skill.name}@${skill.version}" title="全局安装"><i class="fas fa-globe"></i></button>
              </div>
            </td>
          </tr>
        `).join('');
        
        // 绑定访问链接按钮事件
        document.querySelectorAll('.skill-url-link').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const url = link.dataset.url;
            if (url) {
              window.electronAPI.openExternal(url);
            }
          });
        });
        
        // 绑定复制按钮事件
        document.querySelectorAll('.btn-copy-skill').forEach(btn => {
          btn.addEventListener('click', () => {
            const skillName = btn.dataset.skillName;
            const originalIcon = btn.innerHTML;
            
            navigator.clipboard.writeText(skillName).then(() => {
              // 改变按钮图标为对勾
              btn.innerHTML = '<i class="fas fa-check"></i>';
              btn.style.color = '#4ec9b0';
              
              // 创建提示文字
              const tooltip = document.createElement('span');
              tooltip.className = 'copy-tooltip';
              tooltip.textContent = `已复制: ${skillName}`;
              
              // 计算按钮位置
              const rect = btn.getBoundingClientRect();
              tooltip.style.top = (rect.top - 35) + 'px';
              tooltip.style.left = (rect.left + rect.width / 2) + 'px';
              tooltip.style.transform = 'translateX(-50%)';
              
              document.body.appendChild(tooltip);
              
              // 1秒后恢复原状
              setTimeout(() => {
                btn.innerHTML = originalIcon;
                // 禁用过渡效果，直接恢复颜色
                btn.style.transition = 'none';
                btn.style.color = '';
                // 强制重排后恢复过渡效果
                btn.offsetHeight; // trigger reflow
                btn.style.transition = '';
                tooltip.remove();
              }, 1000);
            }).catch(err => {
              console.error('复制失败:', err);
              showNotification('复制失败', 'error');
            });
          });
        });
        
        // 绑定项目安装按钮事件
        document.querySelectorAll('.btn-install-project').forEach(btn => {
          btn.addEventListener('click', async () => {
            const skillId = btn.dataset.skill;
            const installDir = skillInstallDir.value.trim();
            
            if (!installDir) {
              showNotification('请先指定 Skill 安装目录', 'error');
              skillInstallDir.focus();
              return;
            }
            
            // 显示弹窗
            await showSkillInstallModal(skillId, '项目安装', installDir);
            
            // 执行安装
            const result = await window.electronAPI.installSkill(installDir, skillId, false);
            
            // 更新弹窗状态
            const modalStatus = document.getElementById('modal-install-status');
            const closeBtn = document.getElementById('close-install-modal');
            
            if (result.success) {
              modalStatus.className = 'step-status success';
              modalStatus.textContent = `✓ ${skillId} 安装成功！`;
              const modalLog = document.getElementById('modal-install-log');
              if (modalLog) {
                modalLog.textContent += '\n>> 安装成功！';
              }
            } else {
              modalStatus.className = 'step-status error';
              modalStatus.textContent = `✗ 安装失败: ${result.error}`;
            }
            
            // 启用关闭按钮
            closeBtn.disabled = false;
          });
        });
        
        // 绑定全局安装按钮事件
        document.querySelectorAll('.btn-install-global').forEach(btn => {
          btn.addEventListener('click', async () => {
            const skillId = btn.dataset.skill;
            
            // 显示弹窗
            await showSkillInstallModal(skillId, '全局安装', '全局');
            
            // 执行安装
            const result = await window.electronAPI.installSkill('', skillId, true);
            
            // 更新弹窗状态
            const modalStatus = document.getElementById('modal-install-status');
            const closeBtn = document.getElementById('close-install-modal');
            
            if (result.success) {
              modalStatus.className = 'step-status success';
              modalStatus.textContent = `✓ ${skillId} 全局安装成功！`;
              const modalLog = document.getElementById('modal-install-log');
              if (modalLog) {
                modalLog.textContent += '\n>> 安装成功！';
              }
            } else {
              modalStatus.className = 'step-status error';
              modalStatus.textContent = `✗ 安装失败: ${result.error}`;
            }
            
            // 启用关闭按钮
            closeBtn.disabled = false;
          });
        });
      } else {
        skillSearchResultsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #858585;">未找到匹配的 skill</td></tr>';
      }
    } else {
      if (skillSearchStatus) {
        skillSearchStatus.className = 'step-status error';
        skillSearchStatus.textContent = '✗ 查询失败: ' + result.error;
      }
      skillSearchResultsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #f48771;">查询失败: ${result.error}</td></tr>`;
    }

    searchSkillBtn.disabled = false;
    searchSkillBtn.innerHTML = '查询';
  });

  // 分析可用 Skill
  const analyzeSkillsBtn = document.getElementById('analyze-skills-btn');
  const skillAnalyzeResultsBody = document.getElementById('skill-analyze-results-body');
  const skillAnalyzeStatus = document.getElementById('skill-analyze-status');

  analyzeSkillsBtn.addEventListener('click', async () => {
    analyzeSkillsBtn.disabled = true;
    analyzeSkillsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 分析中……';
    if (skillAnalyzeStatus) {
      skillAnalyzeStatus.className = 'step-status info';
      skillAnalyzeStatus.textContent = '正在分析当前环境可用的 Skills……';
    }
    
    // 显示加载中
    skillAnalyzeResultsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #858585;"><i class="fas fa-spinner fa-spin"></i> 分析中……</td></tr>';

    const result = await window.electronAPI.analyzeSkills();

    if (result.success) {
      if (skillAnalyzeStatus) {
        skillAnalyzeStatus.className = 'step-status success';
        skillAnalyzeStatus.textContent = `✓ 分析完成！找到 ${result.skills ? result.skills.length : 0} 个可用 Skill`;
      }
      
      // 渲染分析结果
      if (result.skills && result.skills.length > 0) {
        skillAnalyzeResultsBody.innerHTML = result.skills.map(skill => `
          <tr>
            <td style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 12px;">${skill.name || 'N/A'}</td>
            <td style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 12px;">${skill.version || 'N/A'}</td>
            <td style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 11px;" title="${skill.path || 'N/A'}">${skill.path || 'N/A'}</td>
            <td>
              <div class="action-buttons">
                <button class="btn-link btn-copy-skill-path" data-skill-path="${skill.path}" title="复制路径"><i class="fas fa-copy"></i></button>
                <button class="btn-link btn-open-skill-dir" data-skill-path="${skill.path}" title="打开目录"><i class="fas fa-folder-open"></i></button>
              </div>
            </td>
          </tr>
        `).join('');
        
        // 绑定复制路径按钮事件
        document.querySelectorAll('.btn-copy-skill-path').forEach(btn => {
          btn.addEventListener('click', () => {
            const skillPath = btn.dataset.skillPath;
            const originalIcon = btn.innerHTML;
            
            navigator.clipboard.writeText(skillPath).then(() => {
              // 改变按钮图标为对勾
              btn.innerHTML = '<i class="fas fa-check"></i>';
              btn.style.color = '#4ec9b0';
              
              // 2秒后恢复
              setTimeout(() => {
                btn.innerHTML = originalIcon;
                btn.style.color = '';
              }, 2000);
            }).catch(err => {
              console.error('复制失败:', err);
              showNotification('复制失败', 'error');
            });
          });
        });
        
        // 绑定打开目录按钮事件
        document.querySelectorAll('.btn-open-skill-dir').forEach(btn => {
          btn.addEventListener('click', async () => {
            const skillPath = btn.dataset.skillPath;
            if (skillPath && skillPath !== 'N/A') {
              const result = await window.electronAPI.openDirectory(skillPath);
              if (result.success) {
                showNotification('已打开目录', 'success');
              } else {
                showNotification('打开目录失败: ' + result.error, 'error');
              }
            }
          });
        });
      } else {
        skillAnalyzeResultsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #858585;">未找到可用的 Skill</td></tr>';
      }
    } else {
      if (skillAnalyzeStatus) {
        skillAnalyzeStatus.className = 'step-status error';
        skillAnalyzeStatus.textContent = '✗ 分析失败: ' + result.error;
      }
      skillAnalyzeResultsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #f48771;">分析失败: ${result.error}</td></tr>`;
    }

    analyzeSkillsBtn.disabled = false;
    analyzeSkillsBtn.innerHTML = '分析可用 Skill';
  });

  // 支持拖拽目录到安装目录选择区域
  const skillInstallSection = skillInstallSections[0]; // 第一个 section 是目录选择

  skillInstallSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    skillInstallSection.classList.add('drag-over');
  });

  skillInstallSection.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = skillInstallSection.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      skillInstallSection.classList.remove('drag-over');
    }
  });

  skillInstallSection.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    skillInstallSection.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const path = files[0].path;
      
      requestAnimationFrame(() => {
        skillInstallDir.value = path;
      });
    }
  });

  // 全局监听 dragend 和 dragleave，确保拖拽结束时移除样式
  document.addEventListener('dragend', () => {
    skillInstallSection.classList.remove('drag-over');
  });

  document.addEventListener('drop', (e) => {
    if (!skillInstallSection.contains(e.target)) {
      skillInstallSection.classList.remove('drag-over');
    }
  });
}
