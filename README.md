# Sync Grid 数据入口

这是一个独立的静态网站项目。`sync-grid` 是 Git 子模块，构建时会复制到 `dist/`，并注入 portal 自己维护的详情页样式。

## 两个命令

所有命令都在 `portal` 目录执行：

```bash
# 1. 构建部署：使用当前代码生成 dist
npm run build

# 2. 更新部署：拉取 portal、更新 Sync-Grid 子模块，再生成 dist
npm run update
```

服务器上的 Nginx 根目录应指向：

```text
/www/custom-website/dist
```

更新服务器：

```bash
cd /www/custom-website
npm run update
systemctl reload nginx
```

首次部署：

```bash
git clone git@github.com:cloudsmiles/pkms-portal.git /www/custom-website
cd /www/custom-website
git submodule update --init --recursive
npm run build
```

`dist/` 是构建产物，不提交到 Git；`data.js` 会生成在 `dist/data.js`。

如果需要使用其他本地数据源：

```bash
SYNC_GRID_DIR=/path/to/Sync-Grid npm run build
```

## 测试

```bash
npm test
```
