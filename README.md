# chengyu-pwa（成语接龙）

DaoBox 家族子应用，**学习类**成语游戏（5-10 岁儿童 + 全年龄）。

- 国内站：https://chengyu.daobox.net.cn
- 海外站：chengyu.daobox.app（worker 配置已备好，暂缓部署）
- 统一账号 / 时长体系：portal.js（游客 30 分钟/天、注册 60 分钟/天）

## 玩法

- **接龙闯关**：选一个以上一个成语尾字（或同音字）开头的成语，接得越长分越高，接到底有奖励分。
- **成语填空**：从四个字里选出成语缺的那个字。
- 内置 334 个常用成语，全部带拼音注音（pypinyin 预计算，见 scripts/build-data.py）。

## 结构

```
chengyu-pwa/
├── public/         # 前端（index/style/app/data/manifest/sw/icons）
├── worker/         # Cloudflare Worker（海外：纯静态 ASSETS 托管，暂缓部署）
├── server/         # 国内阿里云 Node 静态服务器（端口 8797）
├── scripts/        # 成语库生成脚本（build-data.py）
└── docs/handoff/   # 交接文档
```

## 部署

- 国内：`rsync -a --delete --exclude node_modules --exclude data --exclude .env public server root@47.108.83.209:/opt/chengyu-pwa/ && ssh root@47.108.83.209 'systemctl restart chengyu-pwa'`
- 海外（暂缓）：`wrangler deploy`
