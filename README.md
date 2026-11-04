# 夜行录 · 竖屏 Roguelite RPG（H5）

东方志怪题材、竖屏实时战斗 Roguelite。零构建、零 npm 依赖、零外链：原生 ES Modules + Canvas 2D + DOM HUD，30Hz 固定步长逻辑 + 渲染插值，种子 RNG（同种子同输入 → 同结果）。

## 怎么运行

**禁止 `file://` 直接双击打开**（ES Modules 跨源限制会被浏览器拦截）。用本地静态服务：

```bash
node tools/serve.mjs 8000        # 或：python3 -m http.server 8000
```

然后浏览器 / 手机（同网络）访问 `http://localhost:8000/`（手机用 `http://<电脑IP>:8000/`）。

手机玩法：竖屏，底部五键 —— 技能×3、闪避（固定侧向 110px 左右交替）、药瓶；技能按下即触发（带输入缓冲）；红色 Boss 预警必须闪避。

## 跑测试

```bash
node --test tests/*.test.js
```

（node v22 下 `--test` 需传 glob 文件列表，不能只给目录。）

## 目录

- `docs/` 设计案与规格（`design_v1.md` 数值唯一真源、`tech_baseline_v1.md` 技术基线、`art_direction_v1.md` 美术方向）
- `index.html` 唯一入口
- `src/core/` 纯逻辑（零浏览器 API、零墙钟、零 Math.random，可被 node --test 直接 import）
- `src/data/` 数值表（经 `core/tables.js` 查表，禁止硬编码兜底）
- `src/render/` 渲染层（canvas / 粒子池 / 战场 / DOM HUD，只读 state）
- `src/ui/` 界面层（职业选择 / 三选一 / 装备对比 / 技能 / 结算 / 暂停 / 样式）
- `src/main.js` 装配入口；`src/` 其余为桥接层（loop / input / storage / audio / perf）
- `tools/serve.mjs` 零依赖静态服务器
- `tests/` node --test 零依赖测试（不进产物）
- `dist/` 预留打包输出（不进版本库）

## 存档

localStorage 单键 `yxlu.save.v1`：JSON + 版本号逐级迁移 + FNV-1a checksum + 损坏兜底（转存 `.corrupt.*`、`.bak` 备份、失败开新档不静默清空）。战斗中不写盘，切后台 / 结算强制 flush。存档不可用时自动降级内存存档。
