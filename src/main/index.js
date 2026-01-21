const { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const tar = require('tar');
const AdmZip = require('adm-zip');

let configWatcher = null;

// 开发环境启用热重载
if (!app.isPackaged) {
  require('electron-reload')(path.join(__dirname, '..'), {
    electron: path.join(__dirname, '../../node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit',
    // 监听 src 目录下的所有文件
    watched: [
      path.join(__dirname, '..', '**', '*.js'),
      path.join(__dirname, '..', '**', '*.html'),
      path.join(__dirname, '..', '**', '*.css')
    ]
  });
}

let mainWindow;

// 区分开发和生产环境的 userData 路径
if (!app.isPackaged) {
  // 开发环境：使用 opencode-launcher-dev
  app.setPath('userData', path.join(app.getPath('appData'), 'opencode-launcher-dev'));
}
// 生产环境使用默认的 opencode-launcher

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const NODEJS_PATH = path.join(app.getPath('userData'), 'nodejs');
const OPENCODE_PATH = path.join(app.getPath('userData'), 'opencode');

// 初始化配置
function initConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      npmRegistry: '',
      workDir: '',
      nodejsExtracted: false,
      opencodeInstalled: false
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  
  if (!config.modelMetadata) {
    config.modelMetadata = {};
  }
  return config;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// 获取系统对应的 Node.js 包
function getNodePackageName() {
  const platform = os.platform();
  const arch = os.arch();
  
  if (platform === 'darwin') {
    if (arch === 'arm64') return 'node-v22.22.0-darwin-arm64.tar.gz';
    return 'node-v22.22.0-darwin-x64.tar.gz';
  } else if (platform === 'win32') {
    if (arch === 'arm64') return 'node-v22.22.0-win-arm64.zip';
    if (arch === 'x64') return 'node-v22.22.0-win-x64.zip';
    return 'node-v22.22.0-win-x86.zip';
  }
  return null;
}

// 解压 Node.js
async function extractNodejs(packagePath) {
  return new Promise((resolve, reject) => {
    console.log('[解压] 开始解压:', packagePath);
    const ext = path.extname(packagePath);
    console.log('[解压] 文件扩展名:', ext);
    
    try {
      if (!fs.existsSync(NODEJS_PATH)) {
        fs.mkdirSync(NODEJS_PATH, { recursive: true });
        console.log('[解压] 创建目录:', NODEJS_PATH);
      }
      
      // 判断文件类型：优先根据扩展名，打包后无扩展名则根据平台判断
      const isZip = ext === '.zip' || (ext === '' && process.platform === 'win32');
      const isTarGz = ext === '.gz' || (ext === '' && process.platform === 'darwin');
      
      if (isTarGz) {
        // 解压 tar.gz
        console.log('[解压] 使用 tar 解压');
        tar.x({
          file: packagePath,
          cwd: NODEJS_PATH,
          strip: 1 // 去掉顶层目录
        }).then(() => {
          // 确保 bin 目录下的文件有执行权限 (macOS/Linux)
          if (process.platform !== 'win32') {
            const binPath = path.join(NODEJS_PATH, 'bin');
            if (fs.existsSync(binPath)) {
              const files = fs.readdirSync(binPath);
              files.forEach(file => {
                try {
                  fs.chmodSync(path.join(binPath, file), '755');
                } catch (e) {
                  console.error(`[解压] 赋予权限失败: ${file}`, e);
                }
              });
            }
          }
          console.log('[解压] tar 解压完成');
          resolve();
        }).catch(err => {
          console.error('[解压] tar 解压失败:', err);
          reject(err);
        });
      } else if (isZip) {
        // 解压 zip
        console.log('[解压] 使用 zip 解压');
        const zip = new AdmZip(packagePath);
        zip.extractAllTo(NODEJS_PATH, true);
        
        // 移动文件到根目录（使用更安全的方式）
        const extractedDir = fs.readdirSync(NODEJS_PATH).find(f => f.startsWith('node-'));
        if (extractedDir) {
          const srcDir = path.join(NODEJS_PATH, extractedDir);
          const files = fs.readdirSync(srcDir);
          
          // 递归复制文件（避免 Windows rename 权限问题）
          function copyRecursive(src, dest) {
            const stats = fs.statSync(src);
            if (stats.isDirectory()) {
              if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
              }
              const entries = fs.readdirSync(src);
              for (const entry of entries) {
                copyRecursive(path.join(src, entry), path.join(dest, entry));
              }
            } else {
              fs.copyFileSync(src, dest);
            }
          }
          
          files.forEach(file => {
            copyRecursive(
              path.join(srcDir, file),
              path.join(NODEJS_PATH, file)
            );
          });
          
          // 删除临时目录（使用递归删除）
          fs.rmSync(srcDir, { recursive: true, force: true });
        }
        console.log('[解压] zip 解压完成');
        resolve();
      } else {
        const error = new Error(`不支持的文件格式: ${ext}`);
        console.error('[解压] 错误:', error.message);
        reject(error);
      }
    } catch (error) {
      console.error('[解压] 异常:', error);
      reject(error);
    }
  });
}

// 获取独立 Node.js 的执行路径
function getNodeExecutionPaths() {
  const nodePath = path.join(NODEJS_PATH, process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const npmCliPath = process.platform === 'win32' 
    ? path.join(NODEJS_PATH, 'node_modules/npm/bin/npm-cli.js')
    : path.join(NODEJS_PATH, 'lib/node_modules/npm/bin/npm-cli.js');
  const nodeBinPath = process.platform === 'win32' ? NODEJS_PATH : path.join(NODEJS_PATH, 'bin');
  
  return { nodePath, npmCliPath, nodeBinPath };
}

// 确保 Node.js 相关文件有执行权限
function ensureNodejsPermissions() {
  if (process.platform === 'win32') return;
  
  const { nodeBinPath } = getNodeExecutionPaths();
  if (fs.existsSync(nodeBinPath)) {
    const files = fs.readdirSync(nodeBinPath);
    files.forEach(file => {
      try {
        const filePath = path.join(nodeBinPath, file);
        const stats = fs.statSync(filePath);
        if (!(stats.mode & 0o111)) {
          fs.chmodSync(filePath, '755');
          console.log(`[权限] 修复权限: ${file}`);
        }
      } catch (e) {
        console.error(`[权限] 修复权限失败: ${file}`, e);
      }
    });
  }
}

// 获取当前 npm 源配置
function getNpmRegistry() {
  return new Promise((resolve, reject) => {
    const { nodePath, npmCliPath, nodeBinPath } = getNodeExecutionPaths();
    
    if (!fs.existsSync(nodePath)) {
      return resolve(null);
    }
    if (!fs.existsSync(npmCliPath)) {
      return resolve(null);
    }

    ensureNodejsPermissions();
    
    // 设置环境变量
    const env = { ...process.env, PREFIX: NODEJS_PATH };
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    const currentPath = env[pathKey] || env.PATH || env.Path || '';
    env[pathKey] = `${nodeBinPath}${path.delimiter}${currentPath}`;
    env.PATH = env[pathKey];
    env.Path = env[pathKey];
    
    const child = spawn(nodePath, [npmCliPath, 'config', 'get', 'registry'], { env });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      resolve(null);
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        const registry = stdout.trim();
        resolve(registry || null);
      } else {
        resolve(null);
      }
    });
  });
}

// 配置 npm 源
function configureNpmRegistry(registry) {
  return new Promise((resolve, reject) => {
    ensureNodejsPermissions();
    const { nodePath, npmCliPath, nodeBinPath } = getNodeExecutionPaths();
    
    if (!fs.existsSync(nodePath)) {
      return reject(new Error(`找不到 Node.js 执行文件: ${nodePath}`));
    }
    if (!fs.existsSync(npmCliPath)) {
      return reject(new Error(`找不到 npm-cli.js: ${npmCliPath}`));
    }

    // 设置环境变量
    const env = { ...process.env, PREFIX: NODEJS_PATH };
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    const currentPath = env[pathKey] || env.PATH || env.Path || '';
    env[pathKey] = `${nodeBinPath}${path.delimiter}${currentPath}`;
    // 确保 PATH 和 Path 同时存在（兼容性）
    env.PATH = env[pathKey];
    env.Path = env[pathKey];
    
    // 直接使用 node 运行 npm-cli.js，绕过可能存在问题的 npm 脚本
    const child = spawn(nodePath, [npmCliPath, 'config', 'set', 'registry', registry], { env });
    
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });
    
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm config failed with code ${code}. ${stderr}`));
    });
  });
}

// 安装 OpenCode
function installOpenCode(version) {
  return new Promise((resolve, reject) => {
    ensureNodejsPermissions();
    const { nodePath, npmCliPath, nodeBinPath } = getNodeExecutionPaths();

    // 设置环境变量
    const env = { ...process.env };
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    const currentPath = env[pathKey] || env.PATH || env.Path || '';
    env[pathKey] = `${nodeBinPath}${path.delimiter}${currentPath}`;
    env.PATH = env[pathKey];
    env.Path = env[pathKey];
    
    const packageName = version ? `opencode-ai@${version}` : 'opencode-ai';
    const child = spawn(nodePath, [npmCliPath, 'install', '-g', packageName, '--prefix', OPENCODE_PATH], {
      env
    });
    
    child.on('error', (err) => {
      reject(err);
    });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('install-progress', data.toString());
      }
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('install-progress', data.toString());
      }
    });
    
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Installation failed with code ${code}\n${output}`));
    });
  });
}

// 卸载 OpenCode
function uninstallOpenCode() {
  return new Promise((resolve, reject) => {
    ensureNodejsPermissions();
    const { nodePath, npmCliPath, nodeBinPath } = getNodeExecutionPaths();

    const env = { ...process.env };
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    const currentPath = env[pathKey] || env.PATH || env.Path || '';
    env[pathKey] = `${nodeBinPath}${path.delimiter}${currentPath}`;
    env.PATH = env[pathKey];
    env.Path = env[pathKey];

    const child = spawn(nodePath, [npmCliPath, 'uninstall', '-g', 'opencode-ai', '--prefix', OPENCODE_PATH], {
      env
    });

    child.on('error', (err) => {
      reject(err);
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('install-progress', data.toString());
      }
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('install-progress', data.toString());
      }
    });

    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Uninstall failed with code ${code}\n${output}`));
    });
  });
}

// 启动 OpenCode TUI
function launchOpenCodeTUI(workDir) {
  const opencodePath = path.join(OPENCODE_PATH, process.platform === 'win32' ? 'opencode.cmd' : 'bin/opencode');
  const nodeBinPath = path.join(NODEJS_PATH, 'bin');
  
  // 使用系统终端打开
  if (process.platform === 'darwin') {
    // macOS: 使用临时脚本文件避免引号问题
    const tmpScript = path.join(app.getPath('temp'), `opencode-tui-${Date.now()}.sh`);
    const scriptContent = `#!/bin/bash
cd "${workDir}"
export PATH="${nodeBinPath}:$PATH"
"${opencodePath}"
`;
    fs.writeFileSync(tmpScript, scriptContent, { mode: 0o755 });
    
    const command = `osascript -e 'tell application "Terminal" to do script "${tmpScript}"' -e 'tell application "Terminal" to activate'`;
    require('child_process').exec(command, (error) => {
      if (error) {
        console.error('启动 TUI 失败:', error);
      }
      // 延迟删除临时脚本
      setTimeout(() => {
        try { fs.unlinkSync(tmpScript); } catch (e) {}
      }, 5000);
    });
    
    // 将启动器窗口最小化
    setTimeout(() => {
      if (mainWindow) mainWindow.minimize();
    }, 500);
  } else if (process.platform === 'win32') {
    // Windows: 使用 start 命令，/MAX 参数最大化窗口
    const command = `start "OpenCode TUI" /MAX cmd /k "cd /d "${workDir}" && set PATH=${path.join(NODEJS_PATH)};%PATH% && "${opencodePath}""`;
    require('child_process').exec(command, (error) => {
      if (error) {
        console.error('启动 TUI 失败:', error);
      }
    });
    
    // 将启动器窗口最小化
    setTimeout(() => {
      if (mainWindow) mainWindow.minimize();
    }, 500);
  }
}

// 启动 OpenCode Web
function launchOpenCodeWeb(workDir) {
  const opencodePath = path.join(OPENCODE_PATH, process.platform === 'win32' ? 'opencode.cmd' : 'bin/opencode');
  const nodeBinPath = path.join(NODEJS_PATH, 'bin');
  
  if (process.platform === 'darwin') {
    // macOS: 使用临时脚本文件
    const tmpScript = path.join(app.getPath('temp'), `opencode-web-${Date.now()}.sh`);
    const scriptContent = `#!/bin/bash
cd "${workDir}"
export PATH="${nodeBinPath}:$PATH"
"${opencodePath}" web
`;
    fs.writeFileSync(tmpScript, scriptContent, { mode: 0o755 });
    
    const command = `osascript -e 'tell application "Terminal" to do script "${tmpScript}"' -e 'tell application "Terminal" to activate'`;
    require('child_process').exec(command, (error) => {
      if (error) {
        console.error('启动 Web 失败:', error);
      }
      // 延迟删除临时脚本
      setTimeout(() => {
        try { fs.unlinkSync(tmpScript); } catch (e) {}
      }, 5000);
    });
    
    // 将启动器窗口最小化
    setTimeout(() => {
      if (mainWindow) mainWindow.minimize();
    }, 500);
    // OpenCode web 会自动打开浏览器，不需要手动打开
  } else if (process.platform === 'win32') {
    // Windows: 使用 start 命令，/MAX 参数最大化窗口
    const command = `start "OpenCode Web" /MAX cmd /k "cd /d \"${workDir}\" && set PATH=${path.join(NODEJS_PATH)};%PATH% && \"${opencodePath}\" web"`;
    require('child_process').exec(command, (error) => {
      if (error) {
        console.error('启动 Web 失败:', error);
      }
    });
    
    // 将启动器窗口最小化
    setTimeout(() => {
      if (mainWindow) mainWindow.minimize();
    }, 500);
    // OpenCode web 会自动打开浏览器，不需要手动打开
  }
}

function createWindow() {
  const windowOptions = {
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hiddenInset'
  };

  // 仅在 Windows 上显式设置窗口图标，macOS 会自动使用应用图标
  if (process.platform === 'win32') {
    windowOptions.icon = path.join(__dirname, '../icon/icon.ico');
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // 开发模式打开 DevTools
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // 监控 opencode.json 文件变化
  setupConfigWatcher();
}

function setupConfigWatcher() {
  const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  const configDir = path.dirname(configPath);

  if (configWatcher) {
    configWatcher.close();
  }

  // 如果目录不存在，先创建它，否则无法监控
  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true });
    } catch (e) {
      console.error('无法创建配置目录:', e);
      return;
    }
  }

  // 监控目录以便捕捉文件的创建、删除和修改
  let debounceTimer;
  configWatcher = fs.watch(configDir, (eventType, filename) => {
    if (filename === 'opencode.json') {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (mainWindow) {
          mainWindow.webContents.send('opencode-config-changed');
        }
      }, 500); // 500ms 防抖
    }
  });

  console.log('已启动 opencode.json 监控');
}

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 处理
ipcMain.handle('get-config', () => {
  return initConfig();
});

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('save-config', (event, config) => {
  saveConfig(config);
  return { success: true };
});

ipcMain.handle('check-nodejs', async () => {
  const config = initConfig();
  // 更严格的检查：需要配置文件标记为 true 且关键文件存在
  const { nodePath } = getNodeExecutionPaths();
  const extracted = config.nodejsExtracted && fs.existsSync(nodePath);
  
  let version = null;
  if (extracted) {
    try {
      version = require('child_process').execSync(`"${nodePath}" -v`).toString().trim();
    } catch (e) {
      console.error('[Node.js] 获取版本号失败:', e);
    }
  }

  return {
    extracted: extracted,
    path: NODEJS_PATH,
    version: version
  };
});

ipcMain.handle('get-npm-registry', async () => {
  try {
    const registry = await getNpmRegistry();
    return { success: true, registry };
  } catch (error) {
    return { success: false, registry: null };
  }
});

ipcMain.handle('check-opencode', async () => {
  const config = initConfig();
  // 严格检查 OpenCode 是否安装：配置标记为 true 且可执行文件存在
  const opencodePath = path.join(OPENCODE_PATH, process.platform === 'win32' ? 'opencode.cmd' : 'bin/opencode');
  const installed = config.opencodeInstalled && fs.existsSync(opencodePath);
  
  let version = null;
  if (installed) {
    try {
      const { nodeBinPath } = getNodeExecutionPaths();
      const childProcess = require('child_process');
      const env = { ...process.env };
      const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
      const currentPath = env[pathKey] || env.PATH || env.Path || '';
      env[pathKey] = `${nodeBinPath}${path.delimiter}${currentPath}`;
      env.PATH = env[pathKey];
      env.Path = env[pathKey];
      // 直接执行 opencode，可同时兼容二进制和 JS 版本
      version = childProcess.execSync(`"${opencodePath}" -v`, { env }).toString().trim();
    } catch (e) {
      console.error('[OpenCode] 获取版本号失败:', e);
    }
  }

  return {
    installed: installed,
    path: OPENCODE_PATH,
    version: version
  };
});

ipcMain.handle('extract-nodejs', async () => {
  try {
    const packageName = getNodePackageName();
    if (!packageName) {
      throw new Error('不支持的操作系统');
    }
    
    // 从资源目录或打包后的位置获取
    let packagePath;
    if (app.isPackaged) {
      // 打包后，nodejs_package 直接是压缩包文件，不是目录
      packagePath = path.join(process.resourcesPath, 'nodejs_package');
    } else {
      packagePath = path.join(__dirname, '../../nodejs_package', packageName);
    }
    
    if (!fs.existsSync(packagePath)) {
      throw new Error(`Node.js 包不存在: ${packagePath}`);
    }
    
    await extractNodejs(packagePath);
    
    const config = initConfig();
    config.nodejsExtracted = true;
    saveConfig(config);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('configure-npm', async (event, registry) => {
  try {
    await configureNpmRegistry(registry);
    const config = initConfig();
    config.npmRegistry = registry;
    saveConfig(config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-opencode', async () => {
  try {
    await installOpenCode();
    const config = initConfig();
    config.opencodeInstalled = true;
    saveConfig(config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-opencode-version', async (event, version) => {
  try {
    await installOpenCode(version);
    const config = initConfig();
    config.opencodeInstalled = true;
    saveConfig(config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('uninstall-opencode', async () => {
  try {
    await uninstallOpenCode();
    const config = initConfig();
    config.opencodeInstalled = false;
    saveConfig(config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

ipcMain.handle('launch-tui', (event, workDir) => {
  try {
    launchOpenCodeTUI(workDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('launch-web', (event, { workDir }) => {
  try {
    launchOpenCodeWeb(workDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('reset-environment', async () => {
  try {
    // 清空 Node.js 目录
    if (fs.existsSync(NODEJS_PATH)) {
      fs.rmSync(NODEJS_PATH, { recursive: true, force: true });
    }
    
    // 清空 OpenCode 目录
    if (fs.existsSync(OPENCODE_PATH)) {
      fs.rmSync(OPENCODE_PATH, { recursive: true, force: true });
    }
    
    // 重置配置文件
    const defaultConfig = {
      npmRegistry: '',
      workDir: '',
      nodejsExtracted: false,
      opencodeInstalled: false,
      modelMetadata: {}
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-opencode-config', async (event, { force = false } = {}) => {
  try {
    const opencodeConfigDir = path.join(os.homedir(), '.config', 'opencode');
    const opencodeConfigPath = path.join(opencodeConfigDir, 'opencode.json');
    
    // 检查配置文件是否已存在
    if (fs.existsSync(opencodeConfigPath) && !force) {
      return { 
        success: false, 
        fileExists: true,
        path: opencodeConfigPath 
      };
    }
    
    // 创建 .config/opencode 目录（如果不存在）
    if (!fs.existsSync(opencodeConfigDir)) {
      fs.mkdirSync(opencodeConfigDir, { recursive: true });
    }
    
    // 读取模板文件
    const templatePath = path.join(app.getAppPath(), 'opencode.json.example');
    
    if (!fs.existsSync(templatePath)) {
      return {
        success: false,
        error: '配置模板文件不存在'
      };
    }
    
    // 读取并复制模板内容
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    fs.writeFileSync(opencodeConfigPath, templateContent, 'utf8');
    
    return { 
      success: true, 
      path: opencodeConfigPath 
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message 
    };
  }
});

ipcMain.handle('get-opencode-config', async () => {
  try {
    const opencodeConfigPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
    if (fs.existsSync(opencodeConfigPath)) {
      const content = fs.readFileSync(opencodeConfigPath, 'utf8');
      return { success: true, config: JSON.parse(content) };
    }
    return { success: false, error: '配置文件不存在' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-opencode-config', async (event, config) => {
  try {
    const opencodeConfigPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
    fs.writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-opencode-auth', async (event, apiKey) => {
  try {
    const authPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
    const authDir = path.dirname(authPath);

    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    let authConfig = {};
    if (fs.existsSync(authPath)) {
      try {
        const content = fs.readFileSync(authPath, 'utf8');
        authConfig = JSON.parse(content);
      } catch (e) {
        console.error('解析 auth.json 失败:', e);
      }
    }

    authConfig.opencode = {
      type: 'api',
      key: apiKey
    };

    fs.writeFileSync(authPath, JSON.stringify(authConfig, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-opencode-auth', async () => {
  try {
    const authPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
    if (fs.existsSync(authPath)) {
      const content = fs.readFileSync(authPath, 'utf8');
      const authConfig = JSON.parse(content);
      if (authConfig.opencode && authConfig.opencode.key) {
        return { success: true, apiKey: authConfig.opencode.key };
      }
    }
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-confirm-dialog', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['确认', '取消'],
    defaultId: 0,
    cancelId: 1,
    title: options.title || '确认',
    message: options.message,
    detail: options.detail || ''
  });
  return result.response === 0;
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-zen-models', async () => {
  try {
    console.log('[API] 正在获取 OpenCode Zen 模型列表……');
    
    // 检查 fetch 是否可用
    if (typeof fetch !== 'function') {
      throw new Error('当前环境不支持 fetch，请升级应用或检查配置');
    }

    const response = await fetch('https://opencode.ai/zen/v1/models', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      // 增加超时控制
      signal: AbortSignal.timeout(10000) 
    });
    
    if (!response.ok) {
      throw new Error(`网络请求失败 (HTTP ${response.status})`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('服务器返回了无效的数据格式');
    }

    const data = await response.json();
    console.log('[API] 模型列表获取成功:', Array.isArray(data) ? `${data.length} 个模型` : '格式非数组');
    
    return { success: true, data };
  } catch (error) {
    console.error('[API] 获取模型列表异常:', error);
    let errorMsg = '网络连接失败或服务器响应异常';
    
    if (error.name === 'TimeoutError') {
      errorMsg = '请求超时，请检查您的网络连接';
    } else if (error.message) {
      errorMsg = error.message;
    }
    
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('open-config-directory', async () => {
  try {
    const configDir = path.join(os.homedir(), '.config', 'opencode');
    
    // 确保目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // 使用 shell.openPath 打开目录
    await shell.openPath(configDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
