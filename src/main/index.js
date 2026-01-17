const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const tar = require('tar');
const AdmZip = require('adm-zip');

let mainWindow;
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const NODEJS_PATH = path.join(app.getPath('userData'), 'nodejs');
const OPENCODE_PATH = path.join(app.getPath('userData'), 'opencode');

// 初始化配置
function initConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      npmRegistry: 'https://registry.npmmirror.com',
      workDir: '',
      nodejsExtracted: false,
      opencodeInstalled: false
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
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
    const ext = path.extname(packagePath);
    
    try {
      if (!fs.existsSync(NODEJS_PATH)) {
        fs.mkdirSync(NODEJS_PATH, { recursive: true });
      }
      
      if (ext === '.gz') {
        // 解压 tar.gz
        tar.x({
          file: packagePath,
          cwd: NODEJS_PATH,
          strip: 1 // 去掉顶层目录
        }).then(() => {
          resolve();
        }).catch(reject);
      } else if (ext === '.zip') {
        // 解压 zip
        const zip = new AdmZip(packagePath);
        zip.extractAllTo(NODEJS_PATH, true);
        
        // 移动文件到根目录
        const extractedDir = fs.readdirSync(NODEJS_PATH).find(f => f.startsWith('node-'));
        if (extractedDir) {
          const srcDir = path.join(NODEJS_PATH, extractedDir);
          const files = fs.readdirSync(srcDir);
          files.forEach(file => {
            fs.renameSync(
              path.join(srcDir, file),
              path.join(NODEJS_PATH, file)
            );
          });
          fs.rmdirSync(srcDir);
        }
        resolve();
      }
    } catch (error) {
      reject(error);
    }
  });
}

// 配置 npm 源
function configureNpmRegistry(registry) {
  return new Promise((resolve, reject) => {
    const npmPath = path.join(NODEJS_PATH, process.platform === 'win32' ? 'npm.cmd' : 'bin/npm');
    const child = spawn(npmPath, ['config', 'set', 'registry', registry], {
      env: { ...process.env, PREFIX: NODEJS_PATH }
    });
    
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm config failed with code ${code}`));
    });
  });
}

// 安装 OpenCode
function installOpenCode() {
  return new Promise((resolve, reject) => {
    const npmPath = path.join(NODEJS_PATH, process.platform === 'win32' ? 'npm.cmd' : 'bin/npm');
    const child = spawn(npmPath, ['install', '-g', 'opencode-ai', '--prefix', OPENCODE_PATH], {
      env: { ...process.env }
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
    
    const command = `osascript -e 'tell application "Terminal" to do script "${tmpScript}"'`;
    require('child_process').exec(command, (error) => {
      if (error) {
        console.error('启动 TUI 失败:', error);
      }
      // 延迟删除临时脚本
      setTimeout(() => {
        try { fs.unlinkSync(tmpScript); } catch (e) {}
      }, 5000);
    });
  } else if (process.platform === 'win32') {
    const command = `start cmd /k "cd /d "${workDir}" && set PATH=${path.join(NODEJS_PATH)};%PATH% && "${opencodePath}""`;
    require('child_process').exec(command, (error) => {
      if (error) {
        console.error('启动 TUI 失败:', error);
      }
    });
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
    
    const command = `osascript -e 'tell application "Terminal" to do script "${tmpScript}"'`;
    require('child_process').exec(command, (error) => {
      if (error) {
        console.error('启动 Web 失败:', error);
      }
      // 延迟删除临时脚本
      setTimeout(() => {
        try { fs.unlinkSync(tmpScript); } catch (e) {}
      }, 5000);
    });
    // OpenCode web 会自动打开浏览器，不需要手动打开
  } else if (process.platform === 'win32') {
    const command = `start cmd /k "cd /d \"${workDir}\" && set PATH=${path.join(NODEJS_PATH)};%PATH% && \"${opencodePath}\" web --port ${port} --hostname 127.0.0.1"`;
    require('child_process').exec(command, (error) => {
      if (error) {
        console.error('启动 Web 失败:', error);
      }
    });
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
  return {
    extracted: config.nodejsExtracted && fs.existsSync(NODEJS_PATH),
    path: NODEJS_PATH
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
      packagePath = path.join(process.resourcesPath, 'nodejs_package', packageName);
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
