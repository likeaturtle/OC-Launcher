#!/bin/bash

# OpenCode Launcher 交互式打包脚本
# 用于在 macOS 上打包 macOS 和 Windows 所有架构

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

# 检查 Node.js 包是否存在
check_nodejs_packages() {
    local platform=$1
    local arch=$2
    local missing=0
    
    if [ "$platform" == "darwin" ]; then
        file="nodejs_package/node-v22.22.0-darwin-${arch}.tar.gz"
    else
        file="nodejs_package/node-v22.22.0-win-${arch}.zip"
    fi
    
    if [ ! -f "$file" ]; then
        print_warning "缺少 Node.js 包: $file"
        missing=1
    fi
    
    return $missing
}

# 显示主菜单
show_menu() {
    print_header "OpenCode Launcher 打包工具"
    echo ""
    echo "请选择打包目标:"
    echo ""
    echo "  macOS 平台:"
    echo "    1) macOS ARM64 (Apple Silicon)"
    echo "    2) macOS x64 (Intel)"
    echo "    3) macOS 全架构 (ARM64 + x64)"
    echo ""
    echo "  Windows 平台:"
    echo "    4) Windows x64"
    echo "    5) Windows x86 (32位)"
    echo "    6) Windows ARM64"
    echo "    7) Windows 全架构 (x64 + x86 + ARM64)"
    echo ""
    echo "  全平台:"
    echo "    8) 所有平台和架构"
    echo ""
    echo "    0) 退出"
    echo ""
}

# 询问版本号
prompt_version() {
    local current_version=$(node -p "require('./package.json').version")
    echo ""
    print_info "上一次版本号: $current_version"
    read -p "请输入新版本号 (直接回车保持不变): " new_version
    
    if [ ! -z "$new_version" ]; then
        print_info "更新版本号到: $new_version"
        npm version "$new_version" --no-git-tag-version > /dev/null
        print_success "版本号已更新为: $new_version"
    else
        print_info "保持版本号: $current_version"
    fi
}

# 确认打包
confirm_build() {
    local target=$1
    echo ""
    print_warning "即将打包: $target"
    read -p "确认继续? (y/n): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "取消打包"
        return 1
    fi
    return 0
}

# 执行打包
run_build() {
    local script=$1
    local name=$2
    local skip_clean_dist=$3  # 可选参数：是否跳过清理 dist
    
    print_header "开始打包: $name"
    
    # 清除已有的 dist 目录（除非明确跳过）
    if [ "$skip_clean_dist" != "true" ]; then
        if [ -d "dist" ]; then
            print_info "清除已有的 dist 目录..."
            rm -rf dist
            print_success "dist 目录已清除"
        fi
    fi
    
    print_info "清理用户数据..."
    npm run clean:userdata
    
    print_info "执行打包命令: npm run $script"
    
    # 记录开始时间
    start_time=$(date +%s)
    
    # 执行打包
    if npm run "$script"; then
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        print_success "打包完成! 耗时: ${duration}秒"
        print_info "输出目录: dist/"
        echo ""
        ls -lh dist/ | grep -E '\.(dmg|exe|zip)$' || true
        return 0
    else
        print_error "打包失败!"
        return 1
    fi
}

# 检查必要的依赖
check_dependencies() {
    print_info "检查依赖..."
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        print_error "未找到 npm，请先安装 Node.js"
        exit 1
    fi
    
    # 检查 node_modules
    if [ ! -d "node_modules" ]; then
        print_warning "未找到 node_modules，正在安装依赖..."
        npm install
    fi
    
    print_success "依赖检查完成"
}

# 检查 Node.js 包完整性
check_all_nodejs_packages() {
    local check_target=$1
    local missing=0
    
    print_info "检查 Node.js 包..."
    
    case $check_target in
        "mac-arm64")
            check_nodejs_packages "darwin" "arm64" || missing=1
            ;;
        "mac-x64")
            check_nodejs_packages "darwin" "x64" || missing=1
            ;;
        "mac-all")
            check_nodejs_packages "darwin" "arm64" || missing=1
            check_nodejs_packages "darwin" "x64" || missing=1
            ;;
        "win-x64")
            check_nodejs_packages "win" "x64" || missing=1
            ;;
        "win-x86")
            check_nodejs_packages "win" "x86" || missing=1
            ;;
        "win-arm64")
            check_nodejs_packages "win" "arm64" || missing=1
            ;;
        "win-all")
            check_nodejs_packages "win" "x64" || missing=1
            check_nodejs_packages "win" "x86" || missing=1
            check_nodejs_packages "win" "arm64" || missing=1
            ;;
        "all")
            check_nodejs_packages "darwin" "arm64" || missing=1
            check_nodejs_packages "darwin" "x64" || missing=1
            check_nodejs_packages "win" "x64" || missing=1
            check_nodejs_packages "win" "x86" || missing=1
            check_nodejs_packages "win" "arm64" || missing=1
            ;;
    esac
    
    if [ $missing -eq 1 ]; then
        print_warning "部分 Node.js 包缺失，但会继续打包"
        print_info "如需下载 Node.js 包，请访问: https://nodejs.org/dist/v22.22.0/"
        echo ""
        read -p "继续打包? (y/n): " continue_build
        if [ "$continue_build" != "y" ] && [ "$continue_build" != "Y" ]; then
            return 1
        fi
    else
        print_success "所有需要的 Node.js 包已就绪"
    fi
    
    return 0
}

# 主循环
main() {
    # 切换到脚本所在目录
    cd "$(dirname "$0")"
    
    # 检查依赖
    check_dependencies
    
    while true; do
        echo ""
        show_menu
        read -p "请输入选项 [0-8]: " choice
        
        case $choice in
            1)
                prompt_version
                if check_all_nodejs_packages "mac-arm64" && confirm_build "macOS ARM64"; then
                    run_build "dist:mac-arm64" "macOS ARM64"
                fi
                ;;
            2)
                prompt_version
                if check_all_nodejs_packages "mac-x64" && confirm_build "macOS x64"; then
                    run_build "dist:mac-x64" "macOS x64"
                fi
                ;;
            3)
                prompt_version
                if check_all_nodejs_packages "mac-all" && confirm_build "macOS 全架构"; then
                    run_build "dist:mac-all" "macOS 全架构"
                fi
                ;;
            4)
                prompt_version
                if check_all_nodejs_packages "win-x64" && confirm_build "Windows x64"; then
                    run_build "dist:win-x64" "Windows x64"
                fi
                ;;
            5)
                prompt_version
                if check_all_nodejs_packages "win-x86" && confirm_build "Windows x86"; then
                    run_build "dist:win-x86" "Windows x86"
                fi
                ;;
            6)
                prompt_version
                if check_all_nodejs_packages "win-arm64" && confirm_build "Windows ARM64"; then
                    run_build "dist:win-arm64" "Windows ARM64"
                fi
                ;;
            7)
                prompt_version
                if check_all_nodejs_packages "win-all" && confirm_build "Windows 全架构"; then
                    run_build "dist:win-all" "Windows 全架构"
                fi
                ;;
            8)
                prompt_version
                if check_all_nodejs_packages "all" && confirm_build "所有平台和架构"; then
                    print_header "开始全平台打包"
                    
                    # 先清理 dist 目录
                    if [ -d "dist" ]; then
                        print_info "清除已有的 dist 目录..."
                        rm -rf dist
                        print_success "dist 目录已清除"
                    fi
                    
                    print_info "1/2 打包 macOS 全架构..."
                    if run_build "dist:mac-all" "macOS 全架构" "true"; then
                        echo ""
                        print_info "2/2 打包 Windows 全架构..."
                        run_build "dist:win-all" "Windows 全架构" "true"
                    fi
                    
                    print_header "全平台打包完成"
                    print_info "所有产物已输出到 dist/ 目录："
                    echo ""
                    ls -lh dist/ | grep -E '\.(dmg|exe|zip)$' || true
                fi
                ;;
            0)
                print_info "退出打包工具"
                exit 0
                ;;
            *)
                print_error "无效的选项，请重新选择"
                ;;
        esac
        
        # 打包完成后暂停
        if [ "$choice" != "0" ] && [ "$choice" -ge 1 ] && [ "$choice" -le 8 ]; then
            echo ""
            read -p "按回车键继续..." dummy
        fi
    done
}

# 运行主程序
main
