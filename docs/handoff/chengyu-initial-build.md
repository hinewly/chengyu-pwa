# 成语接龙（chengyu-pwa）初始开发 交接

- last_updated: 2026-10-26 01:40
- status: active
- version: v0.1.0

## 任务目标

DaoBox 家族新子应用（用户 2026-10-26 拍板方案 A）：**学习类「成语接龙」**，面向 5-10 岁儿童 + 全年龄，国内优先上线，海外暂缓。

## 当前状态

✅ 本地开发 + 浏览器 E2E 全部通过，待国内部署（rsync + systemd 8797 + Caddy + DNS）。

## 最近完成

- 游戏本体：两种玩法——**接龙闯关**（尾字/同音字开头四选一，接到底 +30 奖励）+ **成语填空**（缺字四选一，答错反馈完整成语+拼音）
- 成语库：334 个常用成语、134 个首字（scripts/build-data.py 用 pypinyin 预计算拼音生成 public/data.js）
- 同音字接龙：尾字无字可接时按拼音音节匹配（如 样→扬眉吐气、柱→中流砥柱 实测通过）
- 计分：接龙 +10/题、填空 +5/题，每连击 5 题额外 +20，答错不扣分连击清零；bestChain/bestBlank 本机保存
- 家族接入：DB_HOME 双域名适配、portal.js data-app="chengyu"、daobox:timeexceeded 超时锁、联系邮箱运行时拼接、顶栏版本号+刷新按钮
- PWA：manifest + SW（dbcy-v1）+ 红底金框「成」字图标（PIL 生成）
- worker：纯静态 ASSETS 托管 + wrangler.toml（chengyu.daobox.app 备用，未部署）
- server：node-server.mjs 端口 8797（2048 8795 / xiaoxiaole 8796 之后）
- 本地 E2E：接龙连答 3 题（+10×3）、答错连击清零、接到底分支、填空答对/答错反馈、换一题、模式切换、最高分 localStorage 持久化全部通过
- 修复：`.hidden` 写在 `.modal-mask` 前被覆盖导致时长弹窗常显 → 改为 `.modal-mask.hidden` 专属规则

## 待办

- [ ] 国内部署：rsync 至 /opt/chengyu-pwa + systemd（端口 8797）+ Caddy
- [ ] DNS：A 记录 chengyu → 47.108.83.209
- [ ] 线上 E2E + daobox-home 学习区入口（跨项目，用户确认后执行）
- [ ] 手机实测 + 海外部署（暂缓）

## 重要决策

- 目录名 chengyu-pwa、data-app="chengyu"、端口 8797
- 学习类定位（是否进 CHECKIN_APPS 打卡名单待用户确认后定）
- 干扰项保证首字和首音节都与尾字不同（明显不接），正确项优先选"接上后还能继续接"的成语保持链条长
- 填空只隐藏第 2~4 字（保留首字方便联想），答错反馈给完整成语+全拼（学习价值）

## 注意事项

- 成语库改动走 scripts/build-data.py（pypinyin 已 pip install --user），勿手改 public/data.js
- SW 缓存键 dbcy-v1；改前端资源记得同步升 ?v= 和 SW CACHE
- 本地测试 portal.js 会因该浏览器当日游客时长耗尽弹锁，属正常；stub portal.js（window.DaoBox={timeExceeded:false}）即可测玩法
- Playwright 改 CSS 后必须注销 SW + 清 caches，否则 SW 缓存旧资源

## 相关文件

- public/{index.html,style.css,app.js,data.js,manifest.json,service-worker.js,icons/}
- scripts/build-data.py · server/node-server.mjs · worker/{src/index.js,wrangler.toml}
