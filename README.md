<h1 style="text-align: center; margin-bottom: 20px;">OpenCode Launcher</h1>
<p align="center">
  <strong>基于 Electron 的 OpenCode AI 独立环境管理器</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-28.0-blue" alt="Electron">
  <img src="https://img.shields.io/badge/Node.js-22.22.0-green" alt="Node.js">
  <img src="https://img.shields.io/badge/Version-0.1.2-orange" alt="Version">
  <img src="https://img.shields.io/badge/License-AGPL%20v3-blue" alt="License">
</p>

## 🔍 快速了解
欢迎使用 DeepWiki 了解本项目，点击[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/likeaturtle/OC-Launcher)
深入探索！


## 📖 项目简介 

OpenCode Launcher 是一个为 [OpenCode](https://opencode.ai/) 打造的独立启动器，提供**完全隔离**的 Node.js 环境管理、图形化配置界面和一键启动功能。它解决了 OpenCode 需要手动配置 Node.js 环境、npm 源设置繁琐、命令行操作复杂等痛点。

### 🎯 项目定位

- **桌面应用程序**：基于 Electron 框架构建的跨平台桌面应用
- **环境管理器**：为 OpenCode AI 提供独立、隔离的运行环境
- **启动器**：图形化界面一键启动 TUI/Web 模式
- **配置中心**：（预留）可视化管理 OpenCode 配置、MCP 服务器和 Skills

### ✨ 核心创新点

#### 1. **完全隔离的独立环境**
- 内置 Node.js 22.22.0 独立运行时（支持 5 种系统架构）
- 不依赖系统全局 Node.js，不污染系统环境
- 所有环境数据存储在用户数据目录，开发/生产环境隔离
- 卸载应用即可清理所有相关文件

#### 2. **智能平台适配**
- 自动检测操作系统和 CPU 架构（macOS ARM64/x64, Windows ARM64/x64/x86）
- 自动选择对应的 Node.js 包并解压
- 自动配置执行权限（Unix 系统）
- 无需用户关心底层技术细节

#### 3. **图形化配置流程**
- 深色主题 UI，符合 OpenCode 设计风格
- 3 步完成环境设置：解压 Node.js → 配置 npm 源 → 安装 OpenCode
- 实时显示安装进度和日志
- 状态可视化（环境状态、安装状态、npm 源）

#### 4. **多模式启动**
- **TUI 模式**：在系统终端中启动传统命令行界面，功能最完整
- **Web 模式**：启动 Web 服务，支持浏览器访问（默认端口 4096，可自定义）
- 自动最小化启动器窗口，不干扰工作流
- 自动配置环境变量和工作目录

#### 5. **国内优化**
- 内置多个国内镜像源（阿里、腾讯、华为）
- 支持一键切换官方源或自定义源
- 大幅提升国内用户安装速度
- 默认使用阿里镜像源：https://registry.npmmirror.com

#### 6. **可扩展架构**
- 预留配置管理、MCP 服务器、Skills 配置页面
- 采用 Electron IPC 通信，主进程和渲染进程分离
- 安全沙箱设计（contextIsolation + preload script）

## 🚀 功能特性

### ✅ 已实现功能

- **独立 Node.js 环境**
  - 自动检测系统架构并解压对应 Node.js 版本
  - 完全隔离，不污染全局环境
  - 存储路径：`~/Library/Application Support/opencode-launcher/nodejs/`（macOS）

- **npm 源管理**
  - 内置多个国内镜像源：阿里源、腾讯源、华为源
  - 支持一键切换官方源或自定义源
  - 仅修改独立环境配置，不影响系统全局 npm

- **OpenCode 安装**
  - 一键安装 opencode-ai 到独立环境
  - 实时显示安装进度和详细日志
  - 安装路径：`~/Library/Application Support/opencode-launcher/opencode/`

- **环境重置功能**
  - 一键清空用户数据目录（Node.js、OpenCode、配置文件）
  - 安全确认机制，防止误操作
  - 重置后需重新配置环境

- **工作目录管理**
  - 可视化选择项目工作目录
  - 支持手动输入路径和拖拽上传
  - 自动保存并恢复上次选择的目录

- **双模式启动**
  - **TUI 模式**：在系统终端打开 OpenCode 命令行界面
  - **Web 模式**：启动 Web 服务并在浏览器访问
  - Web 端口号可自定义配置（默认 4096）
  - 自动配置 PATH 环境变量
  - 启动后自动最小化启动器窗口

- **状态监控**
  - 实时显示 Node.js 环境状态
  - 实时显示 OpenCode 安装状态
  - 实时显示当前 npm 源配置
  - 应用版本号显示

- **跨平台打包**
  - 支持 macOS（ARM64、x64）
  - 支持 Windows（ARM64、x64、x86）
  - 预留 Linux 支持
  - 多架构打包脚本
  - 交互式打包工具（`build-interactive.sh`）

### 🚧 预留功能（待开发）

- **OpenCode 配置管理**：可视化编辑 `~/.opencode/config.json`
- **MCP 服务器管理**：添加/删除 MCP 服务器，OAuth 认证
- **Skills 配置**：安装/卸载 Skills，配置参数

# 🎬 快速开始

### 用户使用（首次运行）

1. **下载并安装**
   - 从 Releases 下载对应平台的安装包
   - macOS: 双击 `.dmg` 文件，拖拽到 Applications
   - Windows: 运行 `.exe` 安装程序

2. **环境设置**（首次运行约 5-10 分钟）
   - 启动应用，点击左侧 **"环境设置"**
   - 点击 **"解压 Node.js"**（1-2 分钟）
   - 点击 **"设置 npm 源"**（几秒钟）
   - 点击 **"安装 OpenCode"**（3-5 分钟）

3. **日常使用**
   - 回到首页，选择工作目录
   - 点击 **"启动 TUI"** 或 **"启动 Web"**
   - 开始使用 OpenCode AI

### 开发模式

```bash
# 克隆项目
git clone <repository-url>
cd OC-Launcher

# 安装依赖
npm install

# 启动开发模式（开发环境使用独立数据目录）
npm run dev

# 开发环境数据目录：
# macOS: ~/Library/Application Support/opencode-launcher-dev
# Windows: %APPDATA%/opencode-launcher-dev
```

## 📦 打包方法

### 方式一：交互式打包（推荐）

使用交互式脚本进行打包，支持版本号管理、依赖检查和多平台打包：

```bash
# 给脚本添加执行权限（首次使用）
chmod +x build-interactive.sh

# 运行交互式打包工具
./build-interactive.sh
```

**交互式打包特性：**
- 打包前提示输入或更新版本号（使用 `npm version` 更新 package.json）
- 自动检查 Node.js 包完整性
- 支持单架构或全架构打包
- 自动清理用户数据目录
- 显示打包进度和耗时
- 支持 macOS 和 Windows 所有架构

### 方式二：命令行打包

直接使用 npm scripts 进行打包：

### 准备工作

**重要**：打包前需要准备 Node.js 独立包（约 30-50MB/个）

1. 下载 Node.js 22.22.0 独立包：
   - macOS ARM64: [node-v22.22.0-darwin-arm64.tar.gz](https://nodejs.org/dist/v22.22.0/)
   - macOS x64: [node-v22.22.0-darwin-x64.tar.gz](https://nodejs.org/dist/v22.22.0/)
   - Windows ARM64: [node-v22.22.0-win-arm64.zip](https://nodejs.org/dist/v22.22.0/)
   - Windows x64: [node-v22.22.0-win-x64.zip](https://nodejs.org/dist/v22.22.0/)
   - Windows x86: [node-v22.22.0-win-x86.zip](https://nodejs.org/dist/v22.22.0/)

2. 将下载的包放到项目根目录的 `nodejs_package/` 文件夹中

### macOS 打包

在 macOS 系统上打包：

```bash
# 安装依赖（首次）
npm install

# 打包当前系统架构（自动检测）
npm run dist

# 指定架构打包
npm run dist:mac-arm64  # Apple Silicon (M1/M2/M3)
npm run dist:mac-x64    # Intel

# 打包所有架构（arm64 + x64）
npm run dist:mac-all

# 输出文件：dist/OpenCode Launcher-0.1.0-macos-arm64.dmg（Apple Silicon）
#         或 dist/OpenCode Launcher-0.1.0-macos-x64.dmg（Intel）
```

**注意：**
- macOS 打包会自动选择对应架构的 Node.js（arm64 或 x64）
- 使用 `dist:mac-arm64` 或 `dist:mac-x64` 可明确指定目标架构
- 打包前会自动清理生产环境配置，确保打包后的应用是全新状态
- 开发环境配置（`opencode-launcher-dev`）不受影响
- 未签名的应用首次运行需在系统偏好设置中允许

#### Windows 打包

在 Windows 系统上打包：

```bash
# 安装依赖（首次）
npm install

# 打包当前系统架构（自动检测）
npm run dist

# 指定架构打包
npm run dist:win-x64    # 64位 Windows
npm run dist:win-x86    # 32位 Windows
npm run dist:win-arm64  # ARM64 Windows

# 打包所有架构（x64 + x86 + arm64）
npm run dist:win-all

# 输出文件：
# - 安装版：dist/OpenCode Launcher Setup 0.1.0.exe
# - 便携版：dist/OpenCode Launcher-0.1.0-windows-x64.zip
```

**注意：**
- Windows 打包会根据系统架构选择对应的 Node.js（x64、x86 或 arm64）
- 使用 `dist:win-*` 命令可明确指定目标架构
- 打包前需手动清理：`%APPDATA%\opencode-launcher`（如需要）
- **每次打包会生成两个版本**：
  - **安装版（Setup.exe）**：需要安装到系统，写入注册表，有卸载程序
  - **便携版（.zip）**：解压后直接运行，无需安装，适合 U 盘携带或临时使用

### 跨平台打包

#### macOS 上打包 Windows 应用

Electron Builder 支持在 macOS 上直接打包 Windows 应用，无需额外配置：

```bash
# 打包 Windows x64 版本（64位 Windows）
npm run dist:win-x64

# 打包 Windows x86 版本（32位 Windows）
npm run dist:win-x86

# 打包 Windows ARM64 版本
npm run dist:win-arm64

# 打包所有 Windows 架构
npm run dist:win-all

# 输出文件：
# - 安装版：dist/OpenCode Launcher Setup 0.1.0.exe
# - 便携版：dist/OpenCode Launcher-0.1.0-windows-x64.zip
```

**前置准备：**
- 确保 `nodejs_package/` 目录下有对应的 Windows Node.js 包
- 例如打包 x64 版本需要：`node-v22.22.0-win-x64.zip`

**注意：**
- 不需要安装 Wine 或其他额外工具
- Electron Builder 会自动处理跨平台打包
- 生成的安装包可以直接在 Windows 系统上运行

#### Windows 上打包 macOS 应用（不推荐）

理论上可以在 Windows 打包 macOS 应用，但需要额外配置且不保证成功：

```bash
npm run dist -- --mac
```

建议在目标平台上进行打包以获得最佳兼容性。

## 📚 使用说明

### 首次运行设置

#### 第一步：环境准备

1. 启动 OpenCode Launcher
2. 点击左侧菜单 **"环境设置"**
3. 按照以下步骤操作：

**① 解压 Node.js 环境**
- 点击 **"解压 Node.js"** 按钮
- 应用会根据您的操作系统自动选择对应的 Node.js 版本
- 等待解压完成（约 1-2 分钟）
- 看到 "✓ Node.js 解压成功！" 后进入下一步

**② 配置 npm 源**
- 默认已填入阿里镜像源：`https://registry.npmmirror.com`
- 可选操作：
  - 点击预设按钮快速切换：**阿里源**、**腾讯源**、**华为源**、**官方源**
  - 或手动输入自定义 npm 源地址
- 点击 **"设置 npm 源"** 按钮
- 看到 "✓ npm 源配置成功！" 后进入下一步

**③ 安装 OpenCode**
- 点击 **"安装 OpenCode"** 按钮
- 安装过程会显示详细日志（约 3-5 分钟，视网络速度而定）
- 看到 "✓ OpenCode 安装成功！" 后，环境设置完成

#### 第二步：日常使用

1. 回到 **"首页"**
2. 点击 **"选择目录"** 选择您的项目工作目录
3. 选择启动方式：
   - **启动 TUI**：在系统终端中打开 OpenCode 命令行界面（推荐）
   - **启动 Web**：启动 Web 服务并在浏览器中打开（默认端口 4096，可自定义）

### 功能说明

#### 主要功能

- **独立环境**：Node.js 和 OpenCode 完全独立安装，不影响系统环境
- **npm 源配置**：支持阿里源、腾讯源、华为源、官方源或自定义源
- **环境重置**：一键清空用户数据目录，重置所有配置
- **TUI 模式**：传统终端界面，功能最完整，适合命令行用户
- **Web 模式**：浏览器访问，端口号可自定义，适合远程使用或不熟悉命令行的用户
- **工作目录持久化**：自动记住上次选择的工作目录
- **状态监控**：实时显示环境配置状态和应用版本号

### 常见问题

**Q: 安装 OpenCode 失败怎么办？**

A: 请检查：
1. Node.js 是否已成功解压（首页状态显示"已配置 ✓"）
2. npm 源是否配置正确（建议使用阿里源、腾讯源或华为源）
3. 网络连接是否正常
4. 查看安装日志中的错误信息

**Q: 启动 TUI 后没有反应？**

A: TUI 会在系统终端中打开，请检查：
1. 是否已选择工作目录
2. 终端窗口是否被其他窗口遮挡
3. macOS 用户检查是否授权终端权限

**Q: Web 模式无法访问？**

A: 请检查：
1. 端口是否被占用（可在"通用设置"页面更改端口号）
2. 等待 3-5 秒后再访问浏览器
3. 查看终端中是否有错误信息
4. 确认防火墙没有阻止连接

**Q: 如何更新 OpenCode？**

A: 在终端中运行：
```bash
# macOS
~/Library/Application\ Support/opencode-launcher/nodejs/bin/npm update -g opencode-ai --prefix ~/Library/Application\ Support/opencode-launcher/opencode

# Windows
%APPDATA%\opencode-launcher\nodejs\npm update -g opencode-ai --prefix %APPDATA%\opencode-launcher\opencode
```

**Q: 如何完全卸载？**

A: 
1. 删除应用程序
2. 删除用户数据目录：
   - macOS: `~/Library/Application Support/opencode-launcher`
   - Windows: `%APPDATA%\opencode-launcher`

**Q: 升级到新版本后会保留之前的配置吗？**

A: 会的。新旧版本共享同一个用户数据目录，包括：
- Node.js 环境（无需重新解压）
- OpenCode 安装（无需重新安装）
- npm 源配置
- 工作目录设置

如需全新安装，请先删除用户数据目录后再运行新版本。

**Q: 如何完全重置环境？**

A: 有两种方式：

**方式一：使用应用内功能（推荐）**
1. 打开应用，进入 **"运行环境"** 页面
2. 滚动到底部的 **"重置环境"** 区域
3. 点击 **"重置环境"** 按钮
4. 在弹出的确认对话框中点击确认
5. 重启应用后将显示为全新状态

**方式二：手动删除数据目录**
```bash
# macOS
rm -rf ~/Library/Application\ Support/opencode-launcher

# Windows（在命令提示符中）
rmdir /s /q %APPDATA%\opencode-launcher
```

重新启动应用后会显示为全新状态，需要重新配置环境。

## 🛠️ 技术栈

### 核心框架
- **Electron 28.0**：跨平台桌面应用框架
- **Node.js 22.22.0**：独立 JavaScript 运行时
- **OpenCode AI**：AI 编程助手核心

### 依赖库
- **tar**：解压 `.tar.gz` 格式的 Node.js 包（macOS）
- **adm-zip**：解压 `.zip` 格式的 Node.js 包（Windows）
- **electron-builder**：应用打包工具

### 架构设计
- **主进程**（[index.js](file:///Users/fujd/Desktop/OC-Launcher/src/main/index.js)）
  - 系统操作：文件 I/O、进程管理、环境配置
  - Node.js 解压和权限管理
  - npm 源配置和 OpenCode 安装
  - TUI/Web 启动逻辑
  
- **预加载脚本**（[preload.js](file:///Users/fujd/Desktop/OC-Launcher/src/main/preload.js)）
  - 安全桥接：contextBridge 暴露 API
  - IPC 通信封装
  
- **渲染进程**（[renderer.js](file:///Users/fujd/Desktop/OC-Launcher/src/renderer/renderer.js)）
  - UI 交互逻辑
  - 页面切换和状态管理
  - 安装进度实时显示

### 安全机制
- **contextIsolation**：隔离渲染进程和 Node.js 环境
- **preload script**：安全暴露有限的 API
- **nodeIntegration: false**：禁用渲染进程直接访问 Node.js

## 📁 项目结构

```
OC-Launcher/
├── src/
│   ├── main/                    # 主进程（系统层）
│   │   ├── index.js             # 主进程入口，核心业务逻辑
│   │   └── preload.js           # 预加载脚本，安全桥接
│   └── renderer/                # 渲染进程（UI 层）
│       ├── index.html           # 主界面 HTML
│       ├── styles.css           # OpenCode 风格样式
│       └── renderer.js          # UI 交互逻辑
├── nodejs_package/              # Node.js 独立包（需自行下载）
│   ├── node-v22.22.0-darwin-arm64.tar.gz
│   ├── node-v22.22.0-darwin-x64.tar.gz
│   ├── node-v22.22.0-win-arm64.zip
│   ├── node-v22.22.0-win-x64.zip
│   └── node-v22.22.0-win-x86.zip
├── dist/                        # 打包输出目录（自动生成）
├── build-interactive.sh         # 交互式打包脚本
├── package.json                 # 项目配置和打包设置
└── README.md                    # 项目说明文档（本文档）
```

### 运行时目录结构

```
# macOS 用户数据目录
~/Library/Application Support/opencode-launcher/
├── config.json          # 配置文件（npm 源、工作目录等）
├── nodejs/              # 独立 Node.js 环境
│   ├── bin/
│   │   ├── node         # Node.js 可执行文件
│   │   └── npm          # npm 命令
│   └── lib/
└── opencode/            # OpenCode 安装目录
    └── bin/
        └── opencode     # OpenCode 可执行文件

# 开发环境使用独立目录
~/Library/Application Support/opencode-launcher-dev/
```

## 🎯 核心价值

1. **零污染**：完全独立的运行环境，不影响系统全局配置
2. **开箱即用**：无需手动配置 Node.js 和 npm，图形化向导
3. **傻瓜式操作**：3 步完成环境设置，一键启动
4. **多启动方式**：支持 TUI 和 Web 两种模式，Web 端口可自定义
5. **国内优化**：内置多个国内镜像源（阿里、腾讯、华为），安装速度快
6. **环境管理**：支持一键重置环境，方便故障排查
7. **跨平台支持**：支持 macOS/Windows，5 种系统架构
8. **可扩展性**：预留配置管理界面，支持未来功能扩展
9. **开发友好**：交互式打包工具，版本号管理，开发/生产环境隔离

## 📝 开发规范

### 代码风格
- 使用 ES6+ 语法
- 使用 async/await 处理异步操作
- 遵循 Electron 安全最佳实践

### 提交规范
- feat: 新功能
- fix: 修复 bug
- docs: 文档更新
- style: 代码格式调整
- refactor: 代码重构
- test: 测试相关
- chore: 构建/工具链相关

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

GNU AGPL v3 License - 详见 [LICENSE](LICENSE) 文件

本项目采用 GNU Affero General Public License v3.0 开源协议，这意味着：
- ✅ 可以自由使用、修改和分发
- ✅ 必须开源修改后的代码
- ✅ 通过网络提供服务时也必须开源（AGPL 特性）
- ✅ 必须保留原作者版权声明

## 🙏 致谢

- [OpenCode](https://opencode.ai/) - 强大的 AI 编程助手
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Node.js](https://nodejs.org/) - JavaScript 运行时

---

<p align="center">Made with ❤️ for OpenCode Community</p>
