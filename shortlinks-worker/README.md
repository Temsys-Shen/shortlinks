# 短链接CRUD API

这是一个Cloudflare Workers API服务，数据存储在KV命名空间`shortlinks`。

你计划挂载到`s.museday.top/api`，本项目已兼容`/api`前缀。

## 权限规则

- 创建和查询不需要权限
- 更新和删除需要在请求头传`x-api-key`
- 密钥从环境变量`API_KEY`读取

## 数据结构

本项目使用两类KV键：

- 主记录键：`link:${code}`
- URL索引键：`url:${sha256(normalizedUrl)}`

主记录值是JSON对象：

```json
{
  "code": "demo",
  "url": "https://example.com",
  "createdAt": "2026-04-07T01:23:45.678Z",
  "updatedAt": "2026-04-07T01:23:45.678Z"
}
```

URL索引值是短码字符串，例如：

```txt
url:57f5...c2a1 -> demo
```

## 接口

基础路径为`/api`。

1. `POST /api/shortlinks`创建
2. `GET /api/shortlinks/:code`按短码查询
3. `GET /api/shortlinks?code=xxx`按查询参数查单条
4. `GET /api/shortlinks`列表查询第一页
5. `PUT /api/shortlinks/:code`更新，需要`x-api-key`
6. `DELETE /api/shortlinks/:code`删除，需要`x-api-key`
7. `GET /api/:code`短码302跳转到目标URL

如果worker绑定根路径`/*`，同一能力也可用`GET /:code`。

### 创建规则

- 请求体为`{ "url": "...", "code"?: "..." }`
- `url`必填，`code`选填
- 若`url`已存在，直接返回已存在记录
- 若`url`不存在且传入`code`已占用，返回409
- 若`url`不存在且未传`code`，自动生成6位字母数字短码，最多重试5次

### 更新规则

- 请求体为`{ "newUrl"?: "...", "newCode"?: "..." }`
- `newUrl`和`newCode`至少传一个
- 若目标`newUrl`已经被其他短码占用，直接复用该记录并删除当前短码
- 若目标`newCode`被其他记录占用，返回409
- 未传`newCode`时保持原短码

## 请求示例

创建

```bash
curl -X POST 'https://s.museday.top/api/shortlinks' \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/page","code":"abc123"}'
```

创建时省略`code`

```bash
curl -X POST 'https://s.museday.top/api/shortlinks' \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/page"}'
```

查询单条

```bash
curl 'https://s.museday.top/api/shortlinks/abc123'
```

列表查询

```bash
curl 'https://s.museday.top/api/shortlinks?limit=100'
```

更新

```bash
curl -X PUT 'https://s.museday.top/api/shortlinks/abc123' \
  -H 'content-type: application/json' \
  -H 'x-api-key: your-secret' \
  -d '{"newUrl":"https://example.com/new","newCode":"new-abc"}'
```

删除

```bash
curl -X DELETE 'https://s.museday.top/api/shortlinks/abc123' \
  -H 'x-api-key: your-secret'
```

短码跳转

```bash
curl -I 'https://s.museday.top/api/abc123'
```

## 一键初始化Wrangler配置

执行以下命令后，脚本会自动完成：

- 创建`shortlinks`KV命名空间和preview命名空间
- 如果命名空间已存在，会自动复用已存在ID
- 自动回填`wrangler.toml`中的`id`和`preview_id`
- 保持路由为`s.museday.top/api/*`
- 提示你输入`API_KEY`并自动写入`wrangler secret`

```bash
npm install
npm run cf:setup
```

## 本地调试与部署

```bash
npm install
npm run dev
npm run deploy
```
