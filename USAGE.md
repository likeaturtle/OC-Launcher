# 使用指南

## 首次运行设置

### 第一步：环境准备

1. 启动 OpenCode Launcher
2. 点击左侧菜单 **"环境设置"**
3. 按照以下步骤操作：

#### 1. 解压 Node.js 环境

- 点击 **"解压 Node.js"** 按钮
- 应用会根据您的操作系统自动选择对应的 Node.js 版本
- 等待解压完成（约需 1-2 分钟）
- 看到 "✓ Node.js 解压成功！" 后进入下一步

#### 2. 配置 npm 源

- 默认已填入淘宝镜像源：`https://registry.npmmirror.com`
- 如需使用其他源，可以：
  - 点击 **"官方源"** 按钮快速切换到 npm 官方源
  - 或手动输入自定义 npm 源地址
- 点击 **"设置 npm 源"** 按钮
- 看到 "✓ npm 源配置成功！" 后进入下一步

#### 3. 安装 OpenCode

- 点击 **"安装 OpenCode"** 按钮
- 安装过程会显示详细日志（约需 3-5 分钟，视网络速度而定）
- 看到 "✓ OpenCode 安装成功！" 后，环境设置完成

### 第二步：日常使用

1. 回到 **"首页"**
2. 点击 **"选择目录"** 选择您的项目工作目录
3. 选择启动方式：
   - **启动 TUI**：在系统终端中打开 OpenCode 命令行界面
   - **启动 Web**：启动 Web 服务并在浏览器中打开（默认端口 4096）

## 功能说明

### 主要功能

- **独立环境**：Node.js 和 OpenCode 完全独立安装，不影响系统环境
- **npm 源配置**：支持淘宝源、官方源或自定义源
- **TUI 模式**：传统终端界面，功能最完整
- **Web 模式**：浏览器访问，更适合远程使用

### 预留功能（待开发）

以下页面已预留接口，将在后续版本中实现：

- **配置管理**：可视化编辑 OpenCode 配置文件
- **MCP 服务器**：管理 Model Context Protocol 服务器
- **Skills 配置**：配置和管理 OpenCode 技能扩展

## 技术细节

### 环境隔离

- Node.js 安装位置：`~/Library/Application Support/opencode-launcher/nodejs/`（macOS）
- OpenCode 安装位置：`~/Library/Application Support/opencode-launcher/opencode/`
- 配置文件位置：`~/Library/Application Support/opencode-launcher/config.json`

### 支持的系统

- macOS (ARM64 / x64)
- Windows (ARM64 / x64 / x86)
- Linux（待添加 Node.js 包）

## 常见问题

### Q: 安装 OpenCode 失败怎么办？

A: 请检查：
1. Node.js 是否已成功解压
2. npm 源是否配置正确（建议使用淘宝源）
3. 网络连接是否正常
4. 查看安装日志中的错误信息

### Q: 启动 TUI 后没有反应？

A: TUI 会在系统终端中打开，请检查：
1. 是否已选择工作目录
2. 终端窗口是否被其他窗口遮挡

### Q: Web 模式无法访问？

A: 请检查：
1. 端口 4096 是否被占用（可在设置中更改端口）
2. 等待 3-5 秒后再访问浏览器
3. 检查终端中是否有错误信息

### Q: 如何更新 OpenCode？

A: 在终端中运行：
```bash
~/Library/Application\ Support/opencode-launcher/nodejs/bin/npm update -g opencode-ai --prefix ~/Library/Application\ Support/opencode-launcher/opencode
```

## 开发者信息

### 构建应用

```bash
# 开发模式
npm run dev

# 构建测试
npm run build

# 打包发布
npm run dist
```

### 项目结构

```
src/
├── main/
│   ├── index.js    # 主进程：处理系统操作
│   └── preload.js  # 预加载：安全桥接
└── renderer/
    ├── index.html  # 界面结构
    ├── styles.css  # 界面样式
    └── renderer.js # 界面逻辑
```

## 许可证

MIT License
