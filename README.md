# shortlinks

一个可公开发布的短链接项目，包含CloudflareWorkers后端和React前端管理页面。

## 仓库结构

- `shortlinks-worker`：短链接API与跳转服务
- `shortlinks-pages`：创建与管理页面

## 功能概览

- 创建短链接，支持 `code`选填自动生成
- 相同 `url`自动复用已有短链接
- 管理页支持列表、修改、删除
- 短码访问支持302跳转

## 本地开发

### 1.初始化worker配置

```bash
cd shortlinks-worker
npm install
npm run cf:setup
```

脚本会自动创建或复用KV命名空间，并写入 `wrangler.toml`和 `API_KEY`密钥。

### 2.启动worker

```bash
cd shortlinks-worker
npm run dev
```

### 3.启动pages

```bash
cd shortlinks-pages
npm install
npm run dev
```

默认通过Vite代理把 `/api`转发到本地worker。

## 生产部署

```bash
cd shortlinks-worker
npm run deploy
```

当前路由配置为 `s.museday.top/api/*`。
