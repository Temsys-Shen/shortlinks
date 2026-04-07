# shortlinks-pages

基于React+TypeScript+React Router实现的短链接页面层，包含三个页面：

- `/`：创建短链接
- `/admin`：列表、修改、删除短链接
- `/:code`：短链解析并跳转到目标URL

## 运行

1. 启动worker开发服务

```bash
cd ../shortlinks-worker
npm install
npm run dev
```

2. 启动pages开发服务

```bash
cd ../shortlinks-pages
npm install
npm run dev
```

Vite已配置`/api`代理到`http://127.0.0.1:8787`。

## 页面行为

- 创建页提交`POST /api/shortlinks`，请求体为`{ url, code? }`
- 短链路由`/:code`会调用`GET /api/shortlinks/:code`后执行浏览器跳转
- 管理页拉取`GET /api/shortlinks?limit=100`第一页
- 管理页保存时调用`PUT /api/shortlinks/:code`，请求体为`{ newUrl?, newCode? }`
- 管理页删除时调用`DELETE /api/shortlinks/:code`
- 管理页会把`API Key`保存在`localStorage`键`shortlinks_admin_api_key`
