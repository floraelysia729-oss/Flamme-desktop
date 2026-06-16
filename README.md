# Flamme Desktop

本地知识库桌面应用：React + Tauri 前端，Python FastAPI 后端（自动 sidecar）。

> **隐私设计**：笔记始终留在本地 Vault，从不上传。后端仅用你提供的 API Key 转发请求到 LLM 供应商。

Obsidian 插件版请使用 [Flamme](https://github.com/floraelysia729-oss/Flamme)。

---

## 普通用户：下载安装（无需终端）

1. 打开 [Releases](https://github.com/floraelysia729-oss/Flamme-desktop/releases)
2. 下载 `FLAMME_*-setup.exe` 或 `.msi`
3. 双击安装，从开始菜单打开 **FLAMME**
4. 首次启动会在 `%APPDATA%\com.llmwiki.flamme4\.env` 生成配置模板
5. 在应用 **设置** 中填入 API Key，或直接编辑上述 `.env`

> Windows 可能提示「未签名应用」——目前尚未做代码签名，选择仍要运行即可。

---

## 开发者：从源码构建

### 前置条件

- **Python** 3.10+
- **Node.js** 18+
- **Rust**（[Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)）
- API Keys：至少需要 Chat LLM 和 Embedding 各一个

### 1. 克隆

```bash
git clone https://github.com/floraelysia729-oss/Flamme-desktop.git
cd Flamme-desktop
```

### 2. 后端（开发模式）

```bash
cd flamme-backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -e .
cp .env.example .env             # 填入 API Key
cd ..
```

### 3. 前端

```bash
cd flamme-4
pnpm install
pnpm run setup:backend      # 首次：创建 Python 虚拟环境并安装后端
pnpm run tauri:dev          # 开发模式，自动起 Python sidecar
```

> 若曾用 `npm install` 装过依赖，请先删除 `node_modules` 再执行 `pnpm install`，避免混用两种包管理器。

### 4. 构建 Windows 安装包

```bash
cd flamme-4
pnpm run release:win         # PyInstaller 后端 + Tauri MSI/NSIS
```

产物目录：

- `flamme-4/src-tauri/target/release/bundle/nsis/*-setup.exe`
- `flamme-4/src-tauri/target/release/bundle/msi/*.msi`

发布 tag（触发 GitHub Actions）：`git tag desktop-v0.1.4 && git push origin desktop-v0.1.4`

### 5. 本地快捷方式（开发用）

```bash
pnpm run create-shortcut       # 指向 target/release/FLAMME.exe
```

---

## 目录结构

| 目录 | 说明 |
|------|------|
| `flamme-4/` | React 19 + Tauri v2 桌面壳 |
| `flamme-backend/` | Python FastAPI 后端 |

## 环境变量

| 场景 | 配置文件 |
|------|----------|
| 开发 | `flamme-backend/.env` |
| 已安装应用 | `%APPDATA%\com.llmwiki.flamme4\.env` |

详见 `flamme-backend/.env.example`。

## 与 Obsidian 版的关系

桌面端与 [Flamme Obsidian 插件](https://github.com/floraelysia729-oss/Flamme) 共用 API 设计。桌面端通过 Tauri 直接读写本地 Vault，不依赖 Obsidian。
