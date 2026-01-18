// 全局状态
let config = null;
let currentWorkDir = '';

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
  
  // 恢复 Web 端口
  if (config.webPort) {
    document.getElementById('web-port').value = config.webPort;
  }
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
  const port = parseInt(document.getElementById('web-port').value) || 4096;
  
  // 保存端口配置
  config.webPort = port;
  await window.electronAPI.saveConfig(config);
  
  const result = await window.electronAPI.launchWeb({ workDir: currentWorkDir, port });
  if (result.success) {
    showNotification(`Web 服务已启动，端口: ${port}`, 'success');
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
