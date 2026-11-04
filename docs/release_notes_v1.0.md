# 夜行录 · 打包说明 v1.0

- **打包人**：柯桥良（技术架构总监）
- **发布版本**：tag `stage3-frozen` = commit `9c01cfa12291ca598dd3e653935fdcc0711f6215`（打包内容经 `git archive stage3-frozen` 提取，**不取工作区**；HEAD 上的 QA 报告提交 `041dbff` 仅 docs，不进包逻辑）
- **交付形态**：本地游玩 / 分享压缩包，收包者起任意静态服务即可玩。**不上商店**，无平台审核流程。
- **产物**：`dist/yexinglu_v1.0.zip`（108 KB，39 文件，解压后 287 KB；`dist/` 不进版本库）

## 一、发布前检查（三态）

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 可运行：tag 内容冷启动无报错 | ✅ | 解压包起服务（port 8010），headless Chromium 390×844 冷启动：pageerror / console error **0 条**；职业选择 → 真实点击「入夜」进入战斗（`荒村 · 1/5`，HP 464/492） |
| 2 | 导出：包能生成、解压后能打开 | ✅ | `zip -qr` 生成 108 KB；`unzip` 至干净目录 → 顶层即 `index.html`（无多余目录嵌套）→ 起服务 HTTP 200 → 上表冷启动通过 |
| 3 | 资产：占位资产全部接线 | ✅ | 全程序化资产：画面 Canvas 2D 绘制、音效 WebAudio 合成；grep `.(png/jpg/webp/mp3/ogg/wav/ttf/woff/json)` 等扩展名引用在 index.html + src/ **零命中**——无任何外部文件依赖，包内自洽 |
| 4 | 合规：无外链 / 无追踪 / 无用户数据上传 | ✅ | grep `https?://` / `fetch(` / `XMLHttpRequest` / `WebSocket` / `sendBeacon`：src/ 与 index.html **零真实外链**（命中均为注释与提示文案）；存储仅 `localStorage`（storage.js 集中封装 + 损坏兜底 + 降级），无 sessionStorage / indexedDB / cookie |
| 5 | 说明：README 含运行 / 按键 / 已知未做项 | ⚠️ | README 含「怎么运行」与「手机玩法（五键）」；**「已知未做项」不在 README**（仅 design §11）——已用包内新增 `HOW_TO_PLAY.md` 补足（含运行 / 按键 / 玩法 / 已知未做项清单）。不阻断，记改进项：v1.1 把未做项并入 README |

**五项汇总：4 ✅ + 1 ⚠️ + 0 ❌，blocked=0、fail=0 → 准予交付。**

## 二、包内容清单（zip 顶层）

```
yexinglu_v1.0.zip
├── index.html          唯一入口
├── README.md           运行 / 按键 / 存档说明（源自 tag）
├── HOW_TO_PLAY.md      精简「怎么玩」（新增：运行 / 五键 / 玩法循环 / 已知未做项）
├── src/                全部源码（core 纯逻辑 / data 数值表 / render / ui / 桥接层，26 文件）
├── tools/serve.mjs     零依赖静态服务器（node ≥ 18）
└── docs/design_v1.md   数值唯一真源（可选件，随包带出）
```

**不含**：`tests/`（QA 不进产物）、`.git`、`.codebuddy`、`node_modules`（本工程零 npm 依赖，不存在）。

## 三、运行方式（收包者视角）

```bash
unzip yexinglu_v1.0.zip && cd yexinglu_v1.0   # 或解压到任意目录
node tools/serve.mjs 8000                     # 无 Node：python3 -m http.server 8000
# 浏览器 / 手机同网络访问 http://localhost:8000/（手机用 http://<电脑IP>:8000/）
```

**禁止 `file://` 直接双击打开**（ES Modules 跨源限制会被浏览器拦截，页面内有引导提示）。零构建、零依赖：有 Node 或 Python 任一即可，无需安装任何东西。

## 四、交付自验记录（解压包实测）

- 环境：解压 `yexinglu_v1.0.zip` 至干净目录 → `node tools/serve.mjs 8010` → headless Chromium 390×844（触摸）。
- 冷启动：0 pageerror / 0 console error；进战斗后 `#overlay` / `#banner` computed display 均 `none`（无遮罩残留）。
- 真实 tap 三键（失败即抛错，无 try/catch 吞）：
  - 闪避：耐力 `100 → 76` ✅
  - 技能：怒气 `34 → 9`（−25，表值）✅
  - 药瓶：瓶 `3 → 2`、HP `464/492 → 492/492` ✅
- 截图留证：`/tmp/qa/release_selftest.png`（会话临时目录，报告以实测数值为准）。

## 五、已知未做项（首版范围外，design §11）

商店/货币、虚拟摇杆、成就、排行榜、天赋树、背包/强化、每日任务、宠物、云存档、多语言。
另有两处 **P2 遗留**（QA 复签 v1.1 判定不阻断）：职业卡参考值 495/6% 与实际聚合值 492/7% 不一致；design §10.1/§4.4 文档数值勘误。均列入 v1.1 待办。
