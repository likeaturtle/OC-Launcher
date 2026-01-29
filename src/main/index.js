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
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('install-progress', `[解压] 开始解压: ${packagePath}\n`);
    }
    const ext = path.extname(packagePath);
    console.log('[解压] 文件扩展名:', ext);
    
    try {
      if (!fs.existsSync(NODEJS_PATH)) {
        fs.mkdirSync(NODEJS_PATH, { recursive: true });
        console.log('[解压] 创建目录:', NODEJS_PATH);
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('install-progress', `[解压] 创建目录: ${NODEJS_PATH}\n`);
        }
      }
      
      // 判断文件类型：优先根据扩展名，打包后无扩展名则根据平台判断
      const isZip = ext === '.zip' || (ext === '' && process.platform === 'win32');
      const isTarGz = ext === '.gz' || (ext === '' && process.platform === 'darwin');
      
      if (isTarGz) {
        // 解压 tar.gz
        console.log('[解压] 使用 tar 解压');
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('install-progress', '[解压] 使用 tar 格式解压...\n');
        }
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
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('install-progress', '[解压] 解压完成，配置文件权限...\n');
            mainWindow.webContents.send('install-progress', '[解压] Node.js 环境配置完成！\n');
          }
          resolve();
        }).catch(err => {
          console.error('[解压] tar 解压失败:', err);
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('install-progress', `[解压] 失败: ${err.message}\n`);
          }
          reject(err);
        });
      } else if (isZip) {
        // 解压 zip
        console.log('[解压] 使用 zip 解压');
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('install-progress', '[解压] 使用 zip 格式解压...\n');
        }
        const zip = new AdmZip(packagePath);
        zip.extractAllTo(NODEJS_PATH, true);
        
        // 移动文件到根目录（使用更安全的方式）
        const extractedDir = fs.readdirSync(NODEJS_PATH).find(f => f.startsWith('node-'));
        if (extractedDir) {
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('install-progress', '[解压] 整理文件结构...\n');
          }
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
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('install-progress', '[解压] Node.js 环境配置完成！\n');
        }
        resolve();
      } else {
        const error = new Error(`不支持的文件格式: ${ext}`);
        console.error('[解压] 错误:', error.message);
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('install-progress', `[解压] 错误: ${error.message}\n`);
        }
        reject(error);
      }
    } catch (error) {
      console.error('[解压] 异常:', error);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('install-progress', `[解压] 异常: ${error.message}\n`);
      }
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

// 创建独立的环境变量（不继承系统环境）
function createIsolatedEnv() {
  const { nodeBinPath } = getNodeExecutionPaths();
  
  // 最小化环境变量集合，不继承系统环境
  const env = {
    // 仅保留必要的系统路径变量
    HOME: os.homedir(),
    USERPROFILE: os.homedir(), // Windows
    TMPDIR: os.tmpdir(),
    TEMP: os.tmpdir(), // Windows
    TMP: os.tmpdir(), // Windows
    
    // 设置独立的 Node.js 和 npm 环境
    PREFIX: NODEJS_PATH,
    NPM_CONFIG_PREFIX: NODEJS_PATH,
    NPM_CONFIG_GLOBALCONFIG: path.join(NODEJS_PATH, 'etc', 'npmrc'),
    NPM_CONFIG_USERCONFIG: path.join(app.getPath('userData'), '.npmrc'),
    NODE_PATH: path.join(NODEJS_PATH, 'lib', 'node_modules'),
    
    // 使用新的 npm install 策略（替代已废弃的 global-style）
    NPM_CONFIG_INSTALL_STRATEGY: 'shallow',
    NPM_CONFIG_LEGACY_PEER_DEPS: 'false'
  };
  
  // 设置 PATH：项目 Node.js + 必要的系统路径
  if (process.platform === 'win32') {
    // Windows: 添加系统必要路径
    env.SYSTEMROOT = process.env.SYSTEMROOT || 'C:\\Windows';
    env.WINDIR = process.env.WINDIR || 'C:\\Windows';
    const systemPaths = [
      nodeBinPath,
      path.join(env.SYSTEMROOT, 'System32'),
      path.join(env.SYSTEMROOT, 'System32', 'WindowsPowerShell', 'v1.0')
    ];
    env.PATH = systemPaths.join(path.delimiter);
    env.Path = env.PATH;
  } else {
    // macOS/Linux: 添加必要的系统路径（用于 sh、git 等基本命令）
    const systemPaths = [
      nodeBinPath,
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin'
    ];
    env.PATH = systemPaths.join(path.delimiter);
  }
  
  return env;
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
    
    // 使用独立环境变量
    const env = createIsolatedEnv();
    
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

// 获取 npm 上 opencode-ai 的最新版本
function getLatestOpencodeVersion() {
  return new Promise((resolve, reject) => {
    const { nodePath, npmCliPath, nodeBinPath } = getNodeExecutionPaths();
    
    if (!fs.existsSync(nodePath)) {
      return resolve(null);
    }
    if (!fs.existsSync(npmCliPath)) {
      return resolve(null);
    }

    ensureNodejsPermissions();
    
    // 使用独立环境变量
    const env = createIsolatedEnv();
    
    const child = spawn(nodePath, [npmCliPath, 'view', 'opencode-ai', 'version'], { env });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      console.error('[版本检查] 获取最新版本失败:', err);
      resolve(null);
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        const version = stdout.trim();
        console.log('[版本检查] npm 最新版本:', version);
        resolve(version || null);
      } else {
        console.error('[版本检查] npm view 命令失败:', stderr);
        resolve(null);
      }
    });
  });
}

// 比较两个版本号，返回 1 表示 v1 > v2，返回 -1 表示 v1 < v2，返回 0 表示相等
function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  
  // 移除 'v' 前缀（如果存在）
  const cleanV1 = v1.replace(/^v/, '');
  const cleanV2 = v2.replace(/^v/, '');
  
  const parts1 = cleanV1.split('.').map(n => parseInt(n, 10));
  const parts2 = cleanV2.split('.').map(n => parseInt(n, 10));
  
  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  
  return 0;
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

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('install-progress', `[npm] 开始配置 npm 源: ${registry}\n`);
    }

    // 使用独立环境变量
    const env = createIsolatedEnv();
    
    // 直接使用 node 运行 npm-cli.js，绕过可能存在问题的 npm 脚本
    const child = spawn(nodePath, [npmCliPath, 'config', 'set', 'registry', registry], { env });
    
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('install-progress', data.toString());
      }
    });

    child.stdout.on('data', (data) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('install-progress', data.toString());
      }
    });

    child.on('error', (err) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('install-progress', `[npm] 错误: ${err.message}\n`);
      }
      reject(err);
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('install-progress', '[npm] npm 源配置完成！\n');
        }
        resolve();
      } else {
        const error = new Error(`npm config failed with code ${code}. ${stderr}`);
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('install-progress', `[npm] 配置失败: ${error.message}\n`);
        }
        reject(error);
      }
    });
  });
}

// 安装 OpenCode
function installOpenCode(version) {
  return new Promise((resolve, reject) => {
    ensureNodejsPermissions();
    const { nodePath, npmCliPath, nodeBinPath } = getNodeExecutionPaths();

    // 使用独立环境变量
    const env = createIsolatedEnv();
    
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

    // 使用独立环境变量
    const env = createIsolatedEnv();

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
    width: 1050,
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
      // 使用独立环境变量执行 node 命令
      const env = createIsolatedEnv();
      version = require('child_process').execSync(`"${nodePath}" -v`, { env }).toString().trim();
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

ipcMain.handle('check-npm', async () => {
  const config = initConfig();
  const { nodePath, nodeBinPath } = getNodeExecutionPaths();
  const extracted = config.nodejsExtracted && fs.existsSync(nodePath);
  
  let version = null;
  let npmPath = null;
  if (extracted) {
    try {
      npmPath = path.join(nodeBinPath, process.platform === 'win32' ? 'npm.cmd' : 'npm');
      if (fs.existsSync(npmPath)) {
        // 使用独立环境变量执行 npm 命令
        const env = createIsolatedEnv();
        version = require('child_process').execSync(`"${npmPath}" -v`, { env }).toString().trim();
      }
    } catch (e) {
      console.error('[npm] 获取版本号失败:', e);
    }
  }

  return {
    extracted: extracted && version !== null,
    version: version,
    path: npmPath
  };
});

ipcMain.handle('check-opencode', async () => {
  const config = initConfig();
  // 严格检查 OpenCode 是否安装:配置标记为 true 且可执行文件存在
  const opencodePath = path.join(OPENCODE_PATH, process.platform === 'win32' ? 'opencode.cmd' : 'bin/opencode');
  const installed = config.opencodeInstalled && fs.existsSync(opencodePath);
  
  let version = null;
  if (installed) {
    try {
      const { nodeBinPath } = getNodeExecutionPaths();
      const childProcess = require('child_process');
      // 使用独立环境变量
      const env = createIsolatedEnv();
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

ipcMain.handle('check-opencode-update', async () => {
  try {
    // 检查 OpenCode 是否已安装
    const opencodeCheck = await ipcMain.emit('check-opencode');
    const config = initConfig();
    const opencodePath = path.join(OPENCODE_PATH, process.platform === 'win32' ? 'opencode.cmd' : 'bin/opencode');
    const installed = config.opencodeInstalled && fs.existsSync(opencodePath);
    
    if (!installed) {
      return { 
        success: false, 
        error: 'OpenCode 未安装',
        hasUpdate: false 
      };
    }
    
    // 获取本地版本
    let localVersion = null;
    try {
      const { nodeBinPath } = getNodeExecutionPaths();
      const childProcess = require('child_process');
      // 使用独立环境变量
      const env = createIsolatedEnv();
      localVersion = childProcess.execSync(`"${opencodePath}" -v`, { env }).toString().trim();
    } catch (e) {
      console.error('[版本检查] 获取本地版本失败:', e);
      return { 
        success: false, 
        error: '获取本地版本失败',
        hasUpdate: false 
      };
    }
    
    // 获取最新版本
    const latestVersion = await getLatestOpencodeVersion();
    
    if (!latestVersion) {
      return { 
        success: false, 
        error: '获取最新版本失败',
        hasUpdate: false 
      };
    }
    
    // 比较版本
    const comparison = compareVersions(latestVersion, localVersion);
    const hasUpdate = comparison > 0;
    
    console.log('[版本检查] 本地版本:', localVersion, '最新版本:', latestVersion, '需要更新:', hasUpdate);
    
    return {
      success: true,
      hasUpdate: hasUpdate,
      localVersion: localVersion,
      latestVersion: latestVersion
    };
  } catch (error) {
    console.error('[版本检查] 检查更新失败:', error);
    return { 
      success: false, 
      error: error.message,
      hasUpdate: false 
    };
  }
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
    
    // 清空 OpenCode 配置目录
    const opencodeConfigDir = process.platform === 'win32'
      ? path.join(process.env.APPDATA, 'opencode')
      : path.join(os.homedir(), '.config', 'opencode');
    if (fs.existsSync(opencodeConfigDir)) {
      fs.rmSync(opencodeConfigDir, { recursive: true, force: true });
    }
    
    // 清空 OpenCode 数据目录
    const opencodeDataDir = process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA, 'opencode')
      : path.join(os.homedir(), '.local', 'share', 'opencode');
    if (fs.existsSync(opencodeDataDir)) {
      fs.rmSync(opencodeDataDir, { recursive: true, force: true });
    }
    
    // 清空 Skills 目录
    const skillsDir = process.platform === 'win32'
      ? path.join(process.env.USERPROFILE, '.agents', 'skills')
      : path.join(os.homedir(), '.agents', 'skills');
    if (fs.existsSync(skillsDir)) {
      fs.rmSync(skillsDir, { recursive: true, force: true });
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

ipcMain.handle('generate-auth-file', async (event, { force = false } = {}) => {
  try {
    const authDir = process.platform === 'win32'
      ? path.join(os.homedir(), '.local', 'share', 'opencode')
      : path.join(os.homedir(), '.local', 'share', 'opencode');
    const authPath = path.join(authDir, 'auth.json');
    
    // 检查文件是否已存在
    if (fs.existsSync(authPath) && !force) {
      return { 
        success: false, 
        fileExists: true,
        path: authPath 
      };
    }
    
    // 创建目录（如果不存在）
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    
    // 读取模板文件
    const templatePath = path.join(app.getAppPath(), 'auth.json.example');
    
    if (!fs.existsSync(templatePath)) {
      return {
        success: false,
        error: '鉴权模板文件不存在'
      };
    }
    
    // 读取并复制模板内容
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    fs.writeFileSync(authPath, templateContent, 'utf8');
    
    return { 
      success: true, 
      path: authPath 
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message 
    };
  }
});

ipcMain.handle('open-auth-directory', async () => {
  try {
    const authDir = process.platform === 'win32'
      ? path.join(os.homedir(), '.local', 'share', 'opencode')
      : path.join(os.homedir(), '.local', 'share', 'opencode');
    
    // 确保目录存在
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    
    // 使用 shell.openPath 打开目录
    await shell.openPath(authDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取全局 Skill 安装目录
ipcMain.handle('get-global-skill-dir', () => {
  const globalSkillDir = path.join(os.homedir(), '.config', 'opencode', 'skills');
  return { path: globalSkillDir };
});

// 打开 Skills 全局主文件目录 (~/.agents/skills)
ipcMain.handle('open-global-skills-directory', async () => {
  try {
    const globalSkillsDir = process.platform === 'win32'
      ? path.join(os.homedir(), '.agents', 'skills')
      : path.join(os.homedir(), '.agents', 'skills');
    
    // 检查目录是否存在,如果不存在则创建
    if (!fs.existsSync(globalSkillsDir)) {
      fs.mkdirSync(globalSkillsDir, { recursive: true });
    }
    
    // Windows 下使用 explorer 打开,更可靠
    if (process.platform === 'win32') {
      require('child_process').exec(`explorer "${globalSkillsDir}"`);
      return { success: true };
    }
    
    // macOS 和 Linux 使用 shell.openPath
    await shell.openPath(globalSkillsDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 打开 Skills for OpenCode 目录 (~/.config/opencode/skills)
ipcMain.handle('open-opencode-skills-directory', async () => {
  try {
    const opencodeSkillsDir = process.platform === 'win32'
      ? path.join(os.homedir(), '.config', 'opencode', 'skills')
      : path.join(os.homedir(), '.config', 'opencode', 'skills');
    
    // 检查目录是否存在,如果不存在则创建
    if (!fs.existsSync(opencodeSkillsDir)) {
      fs.mkdirSync(opencodeSkillsDir, { recursive: true });
    }
    
    // Windows 下使用 explorer 打开,更可靠
    if (process.platform === 'win32') {
      require('child_process').exec(`explorer "${opencodeSkillsDir}"`);
      return { success: true };
    }
    
    // macOS 和 Linux 使用 shell.openPath
    await shell.openPath(opencodeSkillsDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 打开指定目录
ipcMain.handle('open-directory', async (event, dirPath) => {
  try {
    // 检查目录是否存在，如果不存在则创建
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Windows 下使用 explorer 打开，更可靠
    if (process.platform === 'win32') {
      require('child_process').exec(`explorer "${dirPath}"`);
      return { success: true };
    }
    
    // macOS 和 Linux 使用 shell.openPath
    await shell.openPath(dirPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 安装 Skill
ipcMain.handle('install-skill', async (event, installDir, skillUrl, isGlobal = false) => {
  return new Promise((resolve, reject) => {
    // 只有非全局安装时才检查和创建目录
    if (!isGlobal && installDir) {
      if (!fs.existsSync(installDir)) {
        try {
          fs.mkdirSync(installDir, { recursive: true });
          console.log(`[Skill 安装] 已创建目录: ${installDir}`);
        } catch (err) {
          return resolve({ 
            success: false, 
            error: `无法创建目录: ${err.message}` 
          });
        }
      }
    }

    ensureNodejsPermissions();
    const { nodePath, nodeBinPath } = getNodeExecutionPaths();

    // 使用独立环境变量
    const env = createIsolatedEnv();
    
    // 获取 npx 路径
    const npxPath = process.platform === 'win32' 
      ? path.join(NODEJS_PATH, 'npx.cmd')
      : path.join(NODEJS_PATH, 'bin/npx');
    
    console.log(`[Skill 安装] 在目录 ${installDir || '全局'} 中安装 ${skillUrl}${isGlobal ? ' (全局)' : ''}`);
    
    // 解析 skillUrl，格式为 owner/repo@skill-name
    let repoName = skillUrl;
    let skillName = '';
    
    if (skillUrl.includes('@')) {
      const parts = skillUrl.split('@');
      repoName = parts[0]; // owner/repo
      skillName = parts[1]; // skill-name
    }
    
    // 构建命令: npx skills add owner/repo --skill skill-name -a opencode -y [-g]
    const args = ['skills', 'add', repoName];
    
    if (skillName) {
      args.push('--skill', skillName);
    }
    
    args.push('-a', 'opencode', '-y');
    
    if (isGlobal) {
      args.push('-g'); // 如果全局安装，添加 -g 参数
    }
    
    console.log(`[Skill 安装] 执行命令: npx ${args.join(' ')}`);
    
    // 全局安装时使用当前工作目录，否则使用指定的安装目录
    const workingDir = isGlobal ? process.cwd() : installDir;
    
    const child = spawn(npxPath, args, {
      cwd: workingDir,
      env,
      shell: process.platform === 'win32' // Windows 需要 shell
    });
    
    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('skill-install-progress', data.toString());
      }
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('skill-install-progress', data.toString());
      }
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, error: `安装失败 (退出码: ${code})\n${output}` });
      }
    });
  });
});

// 从分析列表安装 Skill
ipcMain.handle('install-skill-from-list', async (event, repoPath, skillName, isGlobal = false, installDir = null) => {
  return new Promise((resolve, reject) => {
    // 只有非全局安装时才检查和创建目录
    if (!isGlobal && installDir) {
      if (!fs.existsSync(installDir)) {
        try {
          fs.mkdirSync(installDir, { recursive: true });
          console.log(`[Skill 安装] 已创建目录: ${installDir}`);
        } catch (err) {
          return resolve({ 
            success: false, 
            error: `无法创建目录: ${err.message}` 
          });
        }
      }
    }

    ensureNodejsPermissions();
    const { nodePath, nodeBinPath } = getNodeExecutionPaths();

    // 使用独立环境变量
    const env = createIsolatedEnv();
    
    // 获取 npx 路径
    const npxPath = process.platform === 'win32' 
      ? path.join(NODEJS_PATH, 'npx.cmd')
      : path.join(NODEJS_PATH, 'bin/npx');
    
    console.log(`[Skill 安装] 安装 ${skillName} 从 ${repoPath}${isGlobal ? ' (全局)' : ` 到 ${installDir}`}`);
    
    // 构建命令: npx skills add repoPath --skill skillName -a opencode -y [-g]
    const args = ['skills', 'add', repoPath, '--skill', skillName, '-a', 'opencode', '-y'];
    
    if (isGlobal) {
      args.push('-g'); // 如果全局安装，添加 -g 参数
    }
    
    console.log(`[Skill 安装] 执行命令: npx ${args.join(' ')}`);
    
    // 全局安装时使用当前工作目录，否则使用指定的安装目录
    const workingDir = isGlobal ? process.cwd() : (installDir || process.cwd());
    
    const child = spawn(npxPath, args, {
      cwd: workingDir,
      env,
      shell: process.platform === 'win32' // Windows 需要 shell
    });
    
    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('skill-install-progress', data.toString());
      }
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('skill-install-progress', data.toString());
      }
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, error: `安装失败 (退出码: ${code})\n${output}` });
      }
    });
  });
});

// 检查 Skill 更新
ipcMain.handle('check-skill-update', async (event, installDir) => {
  return new Promise((resolve, reject) => {
    ensureNodejsPermissions();
    const { nodePath, nodeBinPath } = getNodeExecutionPaths();

    // 使用独立环境变量
    const env = createIsolatedEnv();
    
    const npxPath = process.platform === 'win32' 
      ? path.join(NODEJS_PATH, 'npx.cmd')
      : path.join(NODEJS_PATH, 'bin/npx');
    
    console.log(`[Skill 检查] 在目录 ${installDir} 中检查更新`);
    
    const child = spawn(npxPath, ['skills', 'check'], {
      cwd: installDir,
      env,
      shell: process.platform === 'win32'
    });
    
    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('skill-install-progress', data.toString());
      }
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('skill-install-progress', data.toString());
      }
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, error: `检查失败 (退出码: ${code})\n${output}` });
      }
    });
  });
});

// 升级 Skill
ipcMain.handle('upgrade-skill', async (event, installDir) => {
  return new Promise((resolve, reject) => {
    ensureNodejsPermissions();
    const { nodePath, nodeBinPath } = getNodeExecutionPaths();

    // 使用独立环境变量
    const env = createIsolatedEnv();
    
    const npxPath = process.platform === 'win32' 
      ? path.join(NODEJS_PATH, 'npx.cmd')
      : path.join(NODEJS_PATH, 'bin/npx');
    
    console.log(`[Skill 升级] 在目录 ${installDir} 中升级`);
    
    const child = spawn(npxPath, ['skills', 'update'], {
      cwd: installDir,
      env,
      shell: process.platform === 'win32'
    });
    
    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('skill-install-progress', data.toString());
      }
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('skill-install-progress', data.toString());
      }
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, error: `升级失败 (退出码: ${code})\n${output}` });
      }
    });
  });
});

// 查询 Skill
ipcMain.handle('search-skill', async (event, keyword) => {
  return new Promise((resolve, reject) => {
    ensureNodejsPermissions();
    const { nodePath, nodeBinPath } = getNodeExecutionPaths();

    // 使用独立环境变量
    const env = createIsolatedEnv();
    
    const npxPath = process.platform === 'win32' 
      ? path.join(NODEJS_PATH, 'npx.cmd')
      : path.join(NODEJS_PATH, 'bin/npx');
    
    console.log(`[Skill 查询] 查询关键词: ${keyword}`);
    
    const child = spawn(npxPath, ['skills', 'find', keyword], {
      env,
      shell: process.platform === 'win32'
    });
    
    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      console.log('[Skill 查询] 命令执行完成，退出码:', code);
      console.log('[Skill 查询] 原始输出:', output);
      console.log('[Skill 查询] 错误输出:', errorOutput);
      
      if (code === 0) {
        // 解析输出，提取 skill 信息
        try {
          const skills = parseSkillFindOutput(output);
          console.log('[Skill 查询] 解析结果:', JSON.stringify(skills, null, 2));
          resolve({ success: true, skills });
        } catch (parseError) {
          console.error('[Skill 查询] 解析失败:', parseError);
          resolve({ success: false, error: `解析结果失败: ${parseError.message}` });
        }
      } else {
        const errorMsg = errorOutput || output || '查询失败';
        resolve({ success: false, error: `查询失败 (退出码: ${code})\n${errorMsg}` });
      }
    });
  });
});

// 分析可用 Skill
ipcMain.handle('analyze-skills', async (event, repoPath) => {
  return new Promise((resolve, reject) => {
    ensureNodejsPermissions();
    const { nodePath, nodeBinPath } = getNodeExecutionPaths();

    // 使用独立环境变量
    const env = createIsolatedEnv();
    
    const npxPath = process.platform === 'win32' 
      ? path.join(NODEJS_PATH, 'npx.cmd')
      : path.join(NODEJS_PATH, 'bin/npx');
    
    // 根据是否有输入内容，构建不同的命令
    let command;
    let args;
    
    if (repoPath && repoPath.trim()) {
      // 有输入内容：执行 npx skills add <repoPath> --list
      console.log('[Skill 分析] 开始分析仓库:', repoPath);
      args = ['skills', 'add', repoPath.trim(), '--list'];
    } else {
      // 无输入内容：执行 npx skills list
      console.log('[Skill 分析] 开始分析可用 Skills');
      args = ['skills', 'list'];
    }
    
    const child = spawn(npxPath, args, {
      env,
      shell: process.platform === 'win32'
    });
    
    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      console.log('[Skill 分析] 命令执行完成，退出码:', code);
      console.log('[Skill 分析] 原始输出:', output);
      console.log('[Skill 分析] 错误输出:', errorOutput);
      
      if (code === 0) {
        // 解析输出，提取 skill 信息
        try {
          let skills;
          // 根据命令类型使用不同的解析函数
          if (repoPath && repoPath.trim()) {
            // npx skills add --list 的输出，使用新的解析函数
            skills = parseSkillAddListOutput(output);
          } else {
            // npx skills list 的输出，使用原有的解析函数
            skills = parseSkillListOutput(output);
          }
          console.log('[Skill 分析] 解析结果:', JSON.stringify(skills, null, 2));
          resolve({ success: true, skills });
        } catch (parseError) {
          console.error('[Skill 分析] 解析失败:', parseError);
          resolve({ success: false, error: `解析结果失败: ${parseError.message}` });
        }
      } else {
        const errorMsg = errorOutput || output || '分析失败';
        resolve({ success: false, error: `分析失败 (退出码: ${code})\n${errorMsg}` });
      }
    });
  });
});

// 解析 npx skills add --list 的输出
function parseSkillAddListOutput(output) {
  const skills = [];
  
  if (!output || output.trim().length === 0) {
    console.log('[解析 Add List] 输出为空');
    return skills;
  }
  
  console.log('[解析 Add List] 开始解析，输出长度:', output.length);
  
  // 移除 ANSI 转义码
  let cleanOutput = output.replace(/\x1B\[[0-9;]*m/g, '');
  
  // 查找 "Available Skills" 后的内容
  const availableSkillsMatch = cleanOutput.match(/Available Skills[\s\S]*/i);
  if (!availableSkillsMatch) {
    console.log('[解析 Add List] 未找到 "Available Skills" 标记');
    return skills;
  }
  
  // 提取 "Available Skills" 之后的内容
  const skillsContent = availableSkillsMatch[0];
  const lines = skillsContent.split('\n');
  
  console.log('[解析 Add List] 找到 Available Skills 后的内容，总行数:', lines.length);
  
  let currentSkillName = null;
  let currentDescriptionLines = [];
  
  for (let i = 1; i < lines.length; i++) {
    let line = lines[i];
    
    // 移除行首的装饰符（│、├、└、┌ 等）和多余空格
    line = line.replace(/^[│├└┌┐┤┴┬┼╔╗╚╝║═╠╣╦╩╬\s]+/, '').trim();
    
    // 跳过空行
    if (!line) {
      continue;
    }
    
    // 跳过 ASCII 艺术字
    if (line.includes('███') || line.match(/^[█╗╔╚═║╝╠╣╦╩╬\s]+$/)) {
      continue;
    }
    
    // 跳过提示行
    if (line.match(/^Use\s+--/i) || line.match(/^Source:/i) || line.match(/^Repository/i) || line.match(/^Found\s+\d+/i)) {
      console.log('[解析 Add List] 跳过提示行:', line);
      continue;
    }
    
    // 判断是 skill 名称还是描述内容
    // Skill 名称特征：
    // 1. 较短（通常 < 60 字符）
    // 2. 不包含句号
    // 3. 通常是 kebab-case 格式（如 vercel-composition-patterns）
    // 4. 不以大写字母开头（描述通常以大写字母开头）
    
    const looksLikeSkillName = (
      line.length < 60 &&
      !line.includes('.') &&
      !line.includes(',') &&
      line.match(/^[a-z][a-z0-9-]*$/) // kebab-case 格式
    );
    
    if (looksLikeSkillName) {
      // 如果已经有当前 skill，先保存它
      if (currentSkillName && currentDescriptionLines.length > 0) {
        skills.push({
          name: currentSkillName,
          description: currentDescriptionLines.join(' ').trim()
        });
        console.log('[解析 Add List] 保存 skill:', currentSkillName);
      }
      
      // 开始新的 skill
      currentSkillName = line;
      currentDescriptionLines = [];
      console.log('[解析 Add List] 识别到 skill 名称:', currentSkillName);
    } else if (currentSkillName) {
      // 这是描述的一部分
      currentDescriptionLines.push(line);
    } else {
      // 还没有遇到 skill 名称，跳过
      console.log('[解析 Add List] 跳过未识别的行:', line.substring(0, 50));
    }
  }
  
  // 处理最后一个 skill
  if (currentSkillName && currentDescriptionLines.length > 0) {
    skills.push({
      name: currentSkillName,
      description: currentDescriptionLines.join(' ').trim()
    });
    console.log('[解析 Add List] 保存最后一个 skill:', currentSkillName);
  }
  
  console.log('[解析 Add List] 最终解析出的 skills 数量:', skills.length);
  return skills;
}

// 解析 npx skills find 的输出
function parseSkillFindOutput(output) {
  const skills = [];
  
  if (!output || output.trim().length === 0) {
    console.log('[解析] 输出为空');
    return skills;
  }
  
  console.log('[解析] 开始解析，输出长度:', output.length);
  
  // 尝试方法 1: 解析 JSON 格式
  try {
    const parsed = JSON.parse(output.trim());
    if (Array.isArray(parsed)) {
      console.log('[解析] 成功解析为 JSON 数组');
      return parsed.map(skill => ({
        name: skill.name || skill.packageName || skill.package || 'Unknown',
        version: skill.version || skill.latestVersion || skill.latest || 'N/A',
        description: skill.description || skill.desc || skill.summary || ''
      }));
    }
  } catch (e) {
    console.log('[解析] JSON 解析失败，使用文本解析');
  }
  
  // 解析 npx skills find 的文本格式
  // 格式:
  // waynesutton/convexskills@convex realtime
  // └ https://skills.sh/waynesutton/convexskills/convex-realtime
  const lines = output.split('\n');
  console.log('[解析] 尝试文本解析，总行数:', lines.length);
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    
    // 移除 ANSI 转义码（颜色代码）
    line = line.replace(/\x1B\[[0-9;]*m/g, '');
    
    console.log(`[解析] 第 ${i} 行:`, line);
    
    // 跳过 ASCII 艺术字和装饰性字符
    if (line.match(/^[█╗╔╚═║╝╠╣╦╩╬\s]+$/) || line.includes('███')) {
      console.log('[解析] 跳过 ASCII 艺术字');
      continue;
    }
    
    // 跳过提示性文本
    if (line.match(/^Install with/i) || line.match(/^Usage:/i) || line.includes('<owner/repo@skill>')) {
      console.log('[解析] 跳过提示文本');
      continue;
    }
    
    // 跳过 URL 行（以 └ 或 ├ 开头）
    if (line.startsWith('└') || line.startsWith('├')) {
      console.log('[解析] 跳过 URL 行');
      continue;
    }
    
    // 匹配 GitHub shorthand@skill-part1 skill-part2... 格式
    // 例如: waynesutton/convexskills@convex realtime
    // 或: zhangyanxs/repo2skill@repo2skill
    // 或: 2025emma/vibe-coding-cn@timescaledb
    // 或: aj-geddes/useful-ai-prompts@real-time-features
    // GitHub shorthand 格式: owner/repo（可以包含数字、字母、连字符）
    // Skill 名称：@之后的所有内容（可以包含空格、连字符等）
    
    // 检查是否包含 @ 符号
    if (line.includes('@')) {
      console.log('[解析] 该行包含 @ 符号，尝试匹配');
      // 使用更简单的正则：匹配 任意字符/任意字符@任意内容
      const skillMatch = line.match(/^([^@\/]+\/[^@\/]+)@(.+)$/);
      if (skillMatch) {
        const githubShorthand = skillMatch[1].trim();  // 例如: zhangyanxs/repo2skill
        const skillNamePart = skillMatch[2].trim();  // 例如: repo2skill 或 convex realtime
        
        console.log('[解析] 匹配到 skill:', {
          githubShorthand,
          skillName: skillNamePart
        });
        
        // 检查下一行是否有 URL
        let skillUrl = '';
        if (i + 1 < lines.length) {
          let nextLine = lines[i + 1].trim();
          // 移除下一行的 ANSI 转义码
          nextLine = nextLine.replace(/\x1B\[[0-9;]*m/g, '');
          console.log('[解析] 检查下一行:', nextLine);
          if (nextLine.startsWith('└') || nextLine.startsWith('├')) {
            const urlMatch = nextLine.match(/https:\/\/[^\s]+/);
            if (urlMatch) {
              skillUrl = urlMatch[0];
              console.log('[解析] 提取到 URL:', skillUrl);
            }
          }
        }
        
        skills.push({
          name: githubShorthand,
          version: skillNamePart,  // 使用 skill 名称作为版本列
          description: skillUrl || `https://skills.sh/${githubShorthand}/${skillNamePart.replace(/\s+/g, '-')}`
        });
      } else {
        console.log('[解析] 包含 @ 但未匹配正则表达式');
      }
    } else {
      console.log('[解析] 未匹配该行（不包含 @）');
    }
  }
  
  console.log('[解析] 最终解析出的 skills 数量:', skills.length);
  return skills;
}

// 解析 npx skills list 的输出
function parseSkillListOutput(output) {
  const skills = [];
  
  if (!output || output.trim().length === 0) {
    console.log('[解析 List] 输出为空');
    return skills;
  }
  
  console.log('[解析 List] 开始解析，输出长度:', output.length);
  
  // 移除 ANSI 转义码
  let cleanOutput = output.replace(/\x1B\[[0-9;]*m/g, '');
  
  // 解析 npx skills list 的文本格式
  // 格式示例:
  // Skill Name          Version     Path
  // skill-name          1.0.0       /path/to/skill
  // 或者 JSON 格式
  
  // 尝试 JSON 解析
  try {
    const parsed = JSON.parse(cleanOutput.trim());
    if (Array.isArray(parsed)) {
      console.log('[解析 List] 成功解析为 JSON 数组');
      return parsed.map(skill => ({
        name: skill.name || skill.skillName || 'Unknown',
        version: skill.version || 'N/A',
        path: skill.path || skill.location || 'N/A'
      }));
    }
  } catch (e) {
    console.log('[解析 List] JSON 解析失败，使用文本解析');
  }
  
  // 文本解析
  const lines = cleanOutput.split('\n');
  console.log('[解析 List] 尝试文本解析，总行数:', lines.length);
  
  let inTableMode = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    
    console.log(`[解析 List] 第 ${i} 行:`, line);
    
    // 跳过 ASCII 艺术字和装饰性字符
    if (line.match(/^[█╗╔╚═║╝╠╣╦╩╬\s]+$/) || line.includes('███')) {
      console.log('[解析 List] 跳过 ASCII 艺术字');
      continue;
    }
    
    // 跳过表头
    if (line.match(/^(Skill|Name|Package)/i)) {
      console.log('[解析 List] 识别到表头');
      inTableMode = true;
      continue;
    }
    
    // 跳过分隔线
    if (line.match(/^[-=]+$/)) {
      console.log('[解析 List] 跳过分隔线');
      continue;
    }
    
    // 尝试解析数据行（空格分隔）
    if (inTableMode || i > 2) { // 假设表头在前几行
      // 分割多个空格
      const parts = line.split(/\s{2,}/);
      
      if (parts.length >= 3) {
        const skillName = parts[0].trim();
        const skillVersion = parts[1].trim();
        const skillPath = parts.slice(2).join(' ').trim();
        
        if (skillName && !skillName.match(/^(Skill|Name|Package)/i)) {
          console.log('[解析 List] 匹配到 skill:', {
            name: skillName,
            version: skillVersion,
            path: skillPath
          });
          
          skills.push({
            name: skillName,
            version: skillVersion,
            path: skillPath
          });
        }
      }
    }
  }
  
  console.log('[解析 List] 最终解析出的 skills 数量:', skills.length);
  return skills;
}
