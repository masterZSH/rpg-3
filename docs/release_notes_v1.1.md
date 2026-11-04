# 夜行录 · 打包说明 v1.1

- **打包人**：柯桥良（技术架构总监）
- **发布版本**：tag `art-v1.1` = commit `9c9549e7cafa5ad2a57d15ab41c3aec5b23f68f9`（打包内容经 `git archive art-v1.1` 提取，不取工作区；HEAD `15a2619` 仅为 QA 报告 docs 提交）
- **质量依据**：QA 回归记录 v1.2（通过，零新缺陷；core 仅 A1/A2 事件负载补字段）
- **产物**：`dist/yexinglu_v1.1.zip`（128 KB，40 文件，解压后 351 KB；旧 `yexinglu_v1.0.zip` 保留并存）

## 一、发布前检查（三态）

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 可运行：tag 内容冷启动无报错 | ✅ | 解压包起服务（port 8020），headless Chromium 390×844 冷启动：pageerror / console error **0 条**；职业选择 → 真实点击「入夜」进战斗（`荒村 · 1/5`） |
| 2 | 导出：包能生成、解压后能打开 | ✅ | 128 KB 生成；解压至干净目录顶层即 `index.html`（无嵌套）→ HTTP 200 → 上项通过 |
| 3 | 资产：占位资产全部接线 | ✅ | 全程序化资产升级版：MONSTER_ART 造型表 + 三层视差离屏预渲染 + 39 枚内联 SVG（emoji 退役）；无任何外部文件引用（grep 扩展名引用零命中），包内自洽 |
| 4 | 合规：无外链 / 无追踪 / 无用户数据上传 | ✅ | index.html + src/ 全量 grep `https?://`：仅 SVG xmlns 声明 / data: URI / 提示文案，**零真实外链**；存储仅 localStorage（集中封装 + 降级） |
| 5 | 说明：README / HOW_TO_PLAY 含运行 / 按键 / 已知未做项 | ✅ | README 含运行与五键操作；包内 HOW_TO_PLAY.md 本轮已更新：**震屏开关位置（暂停面板「减少屏幕震动」）、画质档与强制降档 `?q=low|mid|high`、美术档已知未做稳项** |

**五项汇总：5 ✅ + 0 ⚠️ + 0 ❌，blocked=0、fail=0 → 准予交付。**（v1.0 的 ⚠️ 说明项本轮已补齐）

## 二、包内容清单（zip 顶层）

```
yexinglu_v1.1.zip
├── index.html          唯一入口
├── README.md           运行 / 按键 / 存档说明（源自 tag）
├── HOW_TO_PLAY.md      精简「怎么玩」（v1.1 更新：震屏开关 / 画质档 / ?q=low / 未做稳项）
├── src/                全部源码（含 render 层美术升级：造型表/视差/vfx、ui/icons.js）
├── tools/serve.mjs     零依赖静态服务器
└── docs/design_v1.md   数值唯一真源
```

**不含**：`tests/`、`.git`、`.codebuddy`、`node_modules`（零 npm 依赖）。

## 三、运行方式

```bash
unzip yexinglu_v1.1.zip && cd yexinglu_v1.1   # 或解压到任意目录
node tools/serve.mjs 8000                     # 无 Node：python3 -m http.server 8000
# 浏览器 / 手机同网络访问 http://localhost:8000/（手机用 http://<电脑IP>:8000/）
```

禁止 `file://` 双击打开（页面内有引导提示）。零构建、零依赖。

## 四、与 v1.0 的差异清单

| 项 | v1.0（9c01cfa） | v1.1（art-v1.1 / 9c9549e） |
|---|---|---|
| 美术 | 基础占位（夜色底 + 剪影） | MONSTER_ART 造型表、三层视差离屏预渲染、月亮/星点/雾带氛围层 |
| 图标 | emoji | **39 枚内联 SVG**（icons.js 新增，emoji 退役；icons.test.js 45 key 覆盖含负向） |
| HUD/界面 | 基础样式 | style.css/screens/hud 质感升级 |
| 特效 | 基础粒子 | vfx 全套（组模板 + 差异化参数）、慢镜（击杀 0.4× 45 tick）、暴击顿帧/朱砂印 |
| 性能 | 画质开关 | 降档开关全套（?q=low 或自动降档：视差/雾/尘埃/呼吸/残影/震屏/拖尾，粒子 120→40） |
| 舒适度 | — | 暂停面板新增「减少屏幕震动」总开关（默认关） |
| core | — | **仅两处事件负载补字段**（damage.slot、mechMiss/mechHit.color），零逻辑/数值改动 |
| 测试 | 54 | 60（+慢镜 3 + icons 3） |
| 包 | 108 KB / 39 文件 | 128 KB / 40 文件 |

## 五、交付自验记录（解压包实测）

- 冷启动 0 错误；职业选择页 10 枚 SVG、全文无 emoji。
- 战场三层采样亮度 sky 16.3 / 中景 33.3 / 地面 33.3（夜空与地景分层成立）；截图肉眼确认：月亮、星点、远山视差、雾带、纸人造型、SVG 按键图标。
- 真实 tap 三键（失败即抛错）：闪避耐力 `100→76`；技能怒气 `34→9`（**−25 精确**）；药瓶 `3→2` 瓶、HP 回满。elementFromPoint 两热区不命中遮罩。
- `?q=low` 会话 `body.lowq=true`，降档生效。
- 截图留证：`/tmp/qa/v11_classselect.png`、`/tmp/qa/v11_battle.png`（会话临时目录，报告以实测数值为准）。

## 六、已知未做项（沿用主程序自报清单 + QA v1.2 核实）

- 范围外（design §11）：商店/货币、虚拟摇杆、成就、排行榜、天赋树、背包/强化、每日任务、宠物、云存档、多语言。
- 美术档未做稳项（QA v1.2 逐条核实状态如实）：章二/三章色调未实机验证、部分技能特效为职业组模板、雾带偏淡、减少震屏开关的存档往返无单测。
- 历史 P2 遗留 ×2：职业卡参考值 495/6% vs 实际 492/7%；design §10.1/§4.4 文档数值勘误。
