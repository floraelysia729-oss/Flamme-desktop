# Flamme Desktop

本地知识库桌面应用：React + Tauri 前端，Python FastAPI 后端（自动 sidecar）。

> **隐私设计**：笔记始终留在本地 Vault，从不上传。后端仅用你提供的 API Key 转发请求到 LLM 供应商。

Obsidian 插件版请使用 [Flamme](https://github.com/floraelysia729-oss/Flamme)。

## 前置条件

- **Python** 3.10+
- **Node.js** 18+
- **Rust**（Tauri 构建，见 [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)）
- API Keys：至少需要 Chat LLM 和 Embedding 各一个

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/floraelysia729-oss/Flamme-desktop.git
cd Flamme-desktop
```

### 2. 安装并配置后端

```bash
cd flamme-backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -e .
cp .env.example .env
# 编辑 .env，填入 API Key
cd ..
```

### 3. 安装前端依赖

```bash
cd flamme-4
npm install
```

### 4. 开发模式

```bash
npm run tauri:dev
```

Tauri 会自动启动 Python 后端（默认端口 `8765`）。启动后访问 `http://localhost:8765` 可验证 API。

### 5. 构建安装包

```bash
npm run tauri:build
```

Windows 可创建桌面快捷方式（无 exe 或源码更新时会先构建）：

```bash
npm run create-shortcut
```

## 目录结构

| 目录 | 说明 |
|------|------|
| `flamme-4/` | React 19 + Tauri v2 桌面壳（编辑器、图谱、对话等） |
| `flamme-backend/` | Python FastAPI 后端（Agent、检索、图谱、摄入） |

## 环境变量

在 `flamme-backend/.env` 中配置，详见 `flamme-backend/.env.example`。

| 变量 | 用途 |
|------|------|
| `LLM_API_KEY` | Chat 模型 |
| `EMBED_API_KEY` | 向量嵌入 |
| `MINERU_API_TOKEN` | PDF/PPT 解析（可选） |

## 与 Obsidian 版的关系

桌面端与 [Flamme Obsidian 插件](https://github.com/floraelysia729-oss/Flamme) 共用同一套 API 设计。桌面端通过 Tauri 直接读写本地 Vault，不依赖 Obsidian。
