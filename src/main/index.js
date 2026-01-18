const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const tar = require('tar');
const AdmZip = require('adm-zip');

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
      webPort: 4096,
      nodejsExtracted: false,
      opencodeInstalled: false
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  // 兼容旧配置，添加默认端口
  if (!config.webPort) {
    config.webPort = 4096;
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
function installOpenCode() {
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
    
    const child = spawn(nodePath, [npmCliPath, 'install', '-g', 'opencode-ai', '--prefix', OPENCODE_PATH], {
      env
    });
    
    child.on('error', (err) => {
      reject(err);
    });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      mainWindow.webContents.send('install-progress', data.toString());
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
      mainWindow.webContents.send('install-progress', data.toString());
    });
    
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Installation failed with code ${code}\n${output}`));
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
function launchOpenCodeWeb(workDir, port = 4096) {
  const opencodePath = path.join(OPENCODE_PATH, process.platform === 'win32' ? 'opencode.cmd' : 'bin/opencode');
  const nodeBinPath = path.join(NODEJS_PATH, 'bin');
  
  if (process.platform === 'darwin') {
    // macOS: 使用临时脚本文件
    const tmpScript = path.join(app.getPath('temp'), `opencode-web-${Date.now()}.sh`);
    const scriptContent = `#!/bin/bash
cd "${workDir}"
export PATH="${nodeBinPath}:$PATH"
"${opencodePath}" web --port ${port} --hostname 127.0.0.1
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
    const command = `start "OpenCode Web" /MAX cmd /k "cd /d \"${workDir}\" && set PATH=${path.join(NODEJS_PATH)};%PATH% && \"${opencodePath}\" web --port ${port} --hostname 127.0.0.1"`;
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
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hiddenInset'
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // 开发模式打开 DevTools
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
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

ipcMain.handle('save-config', (event, config) => {
  saveConfig(config);
  return { success: true };
});

ipcMain.handle('check-nodejs', () => {
  const config = initConfig();
  // 更严格的检查：需要配置文件标记为 true 且关键文件存在
  const { nodePath } = getNodeExecutionPaths();
  const extracted = config.nodejsExtracted && fs.existsSync(nodePath);
  return {
    extracted: extracted,
    path: NODEJS_PATH
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

ipcMain.handle('check-opencode', () => {
  const config = initConfig();
  // 严格检查 OpenCode 是否安装：配置标记为 true 且可执行文件存在
  const opencodePath = path.join(OPENCODE_PATH, process.platform === 'win32' ? 'opencode.cmd' : 'bin/opencode');
  const installed = config.opencodeInstalled && fs.existsSync(opencodePath);
  return {
    installed: installed,
    path: OPENCODE_PATH
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

ipcMain.handle('launch-web', (event, { workDir, port }) => {
  try {
    launchOpenCodeWeb(workDir, port);
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
      webPort: 4096,
      nodejsExtracted: false,
      opencodeInstalled: false
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
