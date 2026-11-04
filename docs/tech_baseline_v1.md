# H5 移动端技术基线 v1

| 项 | 值 |
| --- | --- |
| 版本 | v1（基线，冻结后变更走版本 +1） |
| 修订标注 | 取代：初版 §5.7；依据 design_v1.md §3.1（位移全自动，仅闪避可控） |
| 日期 | 2026-11-03 |
| 作者 | 柯桥良 · 技术架构总监 |
| 适用 | H5 手机浏览器 RPG，实时战斗（非回合制），职业 / 装备 / 技能体系 |
| 边界 | 本文档**只定技术侧**。职业、技能、装备、怪物的**数值终值**以创意总监 `docs/design_v1.md` 为唯一真源，本文不写任何数值、不写任何设计内容，只约定数据文件的**形状、字段、单位与接入方式**（第 8 节）。 |
| 环境已验证 | `node v22.13.1`（`node:test` 可用）、`Python 3.11.1`（`http.server` 可用）、`python3 -m http.server` 起服务实测 `HTTP 200` |

> 读者约定：本文所有条目均为**已定结论**，不是备选方案。凡有取舍，均给「结论 + 一句理由」。主程序按本文实现即可，不需要再做选型。

---

## 0. 决策摘要（一页速览）

| # | 议题 | 结论 |
| --- | --- | --- |
| 1 | 引擎 / 框架 / 构建 | **全部不引入**。原生 ES Modules + Canvas 2D + 原生 DOM/CSS，零构建、零 npm 依赖、零外链 |
| 2 | 渲染 | **混合**：战场/实体/粒子/飘字走**单张 Canvas 2D**；HUD/菜单/背包/技能按钮走 **DOM + CSS** |
| 3 | 主循环 | **固定步长 30Hz 逻辑 + 渲染插值**；`visibilitychange` 暂停、delta 钳位 250ms、每帧最多补 5 步、超出丢弃，**恢复不追帧** |
| 4 | 分层 | `src/core/` 纯逻辑（零浏览器 API、可 `node` headless 跑）；`src/render/`、`src/ui/` 只读 state |
| 5 | 测试 | `node --test tests/`，零依赖；确定性 = 固定种子 + 手动推进 tick |
| 6 | 输入 | **单手点击**：仅技能 ×3 / 闪避 / 药瓶的离散意图；Pointer Events `pointerdown` 即入队，`pointerId` 跟踪多点同时点击，无方向向量、无连续手势 |
| 7 | 帧预算 | 16.67ms：逻辑 ≤4 / 渲染 ≤8 / 其他 ≤1 / **GC 目标 0**（零分配）/ 余量 ≥3.67 |
| 8 | 降级 | 按帧耗时采样自动降档，**逻辑 tick 恒 30Hz 不随画质变** |
| 9 | 存档 | `localStorage` 单键 + `v` 版本号 + 逐级迁移 + 损坏隔离；**战斗中不写** |
| 10 | 数据 | 数值表外置为 `src/data/*.js` ESM 对象，逻辑层**零硬编码**，只经 `core/tables.js` 查表 |

---

## 1. 技术选型结论

### 1.1 结论
**不引入任何引擎 / 框架 / 构建工具 / npm 依赖。** 运行时 = 浏览器原生 ES Modules + Canvas 2D + 原生 DOM/CSS。产物即源码，`dist/` 只是原样拷贝。

**引擎中立声明**：本平台是 H5，按 Web 技术栈给结论，**不预设 Unity / Godot / UE**。未来若要上引擎属于需用户确认的新范围，本基线不覆盖、不预留适配层。

### 1.2 实时战斗是否要换方案：不换，给强理由
理由：**本作同屏实体上限 60、2D 表现、单场景**，Canvas 2D + 30Hz 固定步长逻辑足以承载实时战斗的碰撞、冷却、弹道与 AI；换引擎/框架的代价是包体增大、引入构建链、iOS WebGL 上下文丢失与驱动兼容坑、GPU 持续满载发热，以及国内网络下下载运行时的不确定性——代价远大于收益。实时战斗的风险在**循环与状态管理**（第 3 节），不在渲染算力，靠引擎解决不了。

### 1.3 零构建时源码如何组织
- 唯一入口 `index.html`（仓库根），仅一行脚本：`<script type="module" src="./src/main.js"></script>`。
- 模块间一律 `import ... from './core/combat.js'`：**相对路径 + 显式 `.js` 后缀**，不用裸模块名（因此**不需要 import maps**）、不用 JSX / TS / SASS、不写需要编译的语法。
- CSS 手写原生，直接 `<link rel="stylesheet" href="./src/ui/style.css">` 或内联在 `index.html`。
- **源码一律用 `.js`，并在仓库根放一个极简 `package.json`：**
  ```json
  { "type": "module", "private": true }
  ```
  它不是「装依赖」、不是构建工具，**没有任何 `dependencies`**；作用只是让 `node` 与浏览器对 `.js` 都按 ESM 解析，使 `node --test` 能直接 `import` 同一份 `src/core/*.js`。
  > 坑：若改用 `.mjs` 后缀，Python `http.server` 的 MIME 表可能不认 `.mjs` 而返回 `text/plain`，浏览器会拒绝执行 module script。所以**必须 `.js` + `type:module`**，不要 `.mjs` 源码。
- `dist/` 生成 = 纯拷贝，无编译 / 压缩 / 打包环节，避免「产物与源码不一致」：
  ```bash
  mkdir -p dist && cp -r index.html src assets dist/   # 无 assets/ 时省略该项
  ```
  `dist/` 不进版本库（已在 `.gitignore`）；`tools/`、`tests/` 同样不进产物。
- 可选：把上述拷贝写成 `tools/build.mjs`（零依赖、不进产物）。**不写也完全可交付**。

### 1.4 ES Modules 在 `file://` 下的限制与解决办法
**限制**：浏览器对 `file://` 的 module script 强制同源检查，origin 为 `null`，Chrome / Edge / Safari 会报 `Cross origin requests are only supported for protocol schemes: http, https...` 或直接静默失败；相对路径 `import`、`fetch()` JSON 全部失败。此外 `localStorage` 在 `file://` 下各浏览器行为不一致（iOS Safari 可能抛错或隔离），`AudioContext` 亦受限。

**结论：`file://` 双击打开一律不支持，必须走 http 静态服务器，开发、真机、交付都一样。**

已验证命令（本机实测 `HTTP 200`）：
```bash
python3 -m http.server 8080 --directory /workspace     # 已验证，默认监听 0.0.0.0
```
推荐另备一份零依赖 node 静态服务器 `tools/serve.mjs`（`node:http` + `node:fs`，约 20 行，bind `0.0.0.0`，响应 `.js` 为 `text/javascript`）：
```bash
node tools/serve.mjs 8080
```
理由：`python3 -m http.server` 是**单线程**且 HTTP/1.1 连接数有限，零构建下模块数一多会有模块瀑布（见第 10 节坑 14）；node 版支持并发，开发体验更稳。二者任选其一即可，**不得**用 `npx serve` / `vite` / 任何需联网下载的运行时。

兜底：`index.html` 最前面加一段内联脚本，若 `location.protocol === 'file:'` 就渲染「请用本地静态服务器打开」提示，避免用户看到纯白屏。
```html
<script>
  if (location.protocol === 'file:') {
    document.write('<div style="padding:24px;font:16px/1.6 system-ui">请通过 http 静态服务器打开（如 <code>python3 -m http.server 8080</code>），file:// 下 ES Modules 无法加载。</div>');
  }
</script>
```

---

## 2. 渲染方案

### 2.1 结论：混合渲染
- **战场层 → 单张 Canvas 2D**（背景、地图、玩家、怪物、弹道、粒子、伤害飘字、实体头顶血条）。
- **界面层 → DOM + CSS**（顶部状态条、技能栏、职业选择、背包/装备、暂停、设置、Toast、横屏提示、异常兜底）。

理由：实时战斗每帧要重绘几十个移动实体，用 DOM 改样式会触发大量 layout/paint；而 HUD 是低频更新、需要中文排版与 44px 热区，DOM 更省事且可读。**只用一张 canvas，不搞多层 canvas 叠加**（减少合成层与显存）。不用 WebGL（低端安卓上下文丢失 / 驱动兼容坑，收益不足以抵消）。

### 2.2 职责划清（硬边界）

| 层 | 允许 | 禁止 |
| --- | --- | --- |
| `src/render/canvas.js`、`worldRenderer.js`、`particles.js`、`hud.js` | 读 `state` 与 `prevX/prevY` + `alpha`，绘制、更新 textContent | **禁止**调用战斗结算、禁止写 `state`、禁止挂输入监听、禁止读 `Date.now()/Math.random()` |
| `src/ui/*`、`src/input.js` | 捕获 pointer 事件，产出 `InputState`（闪避 / 技能 / 药瓶的离散意图 + tick 时间戳） | 禁止直接改 `state`、禁止每帧写内联样式 |
| `src/core/*` | 计算、产出新 `state` 与事件队列 | 禁止出现 `document / window / canvas / performance / Math.random / Date` 任一标识符 |

补充：`hud.js` **只在数值变化时才写 DOM**（缓存上次值对比），且用 `textContent` 不改布局属性；血条用 `transform: scaleX()` 不用 `width`。

### 2.3 层叠顺序（z-index 明确值）
```
z 0   #stage        position:fixed; inset:0; overflow:hidden; background:#0b0d14
z 10  <canvas id="game">   绝对定位铺满；pointer-events:none
z 20  #hud          pointer-events:none 容器；内部可点子元素单独 pointer-events:auto
z 30  #overlay      模态：职业选择 / 背包 / 装备 / 暂停（全屏遮罩）
z 40  #toast / #guide      提示、引导
z 45  #orientation  横屏提示（最高优先之一，强制盖住一切）
z 50  #fatal        异常兜底层
```
**关键**：canvas 不接收 pointer 事件，所有输入在 `#stage` 上做**事件委托**，否则 HUD 按钮会被画布吞掉或反之。

### 2.4 Canvas 具体约定
- 每帧 `ctx.clearRect` 全清（场景小，**不做脏矩形**，避免过度设计）。
- 只在初始化/resize 时 `ctx.setTransform(dpr,0,0,dpr,0,0)` 一次，之后所有绘制坐标一律用 **CSS 像素**。
- 静态背景 / 图块预渲染到**离屏 canvas 缓存**（`OffscreenCanvas` 可用则用，不支持退回普通 canvas），每帧 `drawImage` 一次；resize 时重建缓存。
- `ctx.imageSmoothingEnabled = false`（像素风素材）；若后续改写实素材统一改 `true`。

---

## 3. 主循环与帧预算（实时战斗核心）

### 3.1 结论
**固定步长逻辑 + 渲染插值；逻辑 tick = 30Hz（`STEP_MS = 1000/30 ≈ 33.333ms`），渲染跟随 rAF（60fps 目标）。**

理由：30Hz 足以表达普攻节奏、冷却、碰撞与 AI，且比 60Hz 逻辑省一半 CPU/电量；视觉顺滑由插值补齐。**所有时间量以整数 tick 为单位**（冷却、前摇、DOT、buff 时长），绝不用墙钟毫秒 —— 这是确定性、可测试、且后台回来不会出事的前提。

> **重要实现结论（贯穿第 4、6 节）**：`core` 层对外是「确定性纯函数」语义（同输入同输出、不读全局可变状态、无外部副作用），但内部采用「传入**归属性可变 state**、原地更新并返回同一引用」的实现，**禁止每 tick 深拷贝 / 展开整棵状态树**（`{...state}`、`structuredClone(state)` 一律禁止）。理由：实时战斗每 tick 克隆整棵状态树会制造大量短命对象，直接把 minor GC 打爆。可测试性不受影响：测试里先 `structuredClone` 一份快照再比较即可。渲染插值所需的旧值由每个实体自带 `prevX/prevY` 字段，在 `step()` 开头保存，**不需要两份完整 state**。

### 3.2 rAF + 累加器关键骨架（伪代码）
```js
// src/loop.js
const STEP_MS   = 1000 / 30;   // 逻辑固定步长
const MAX_FRAME_MS = 250;      // 单帧 delta 钳位：切后台/长卡顿上限
const MAX_STEPS = 5;           // 单帧最多补的逻辑步数
let acc = 0, last = 0, tick = 0, running = false, rafId = 0;

function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (!running) { last = now; return; }          // 暂停：不累积时间

  let delta = now - last; last = now;
  if (delta > MAX_FRAME_MS) delta = MAX_FRAME_MS;  // ← 防「后台回来瞬移」
  acc += delta;

  let steps = 0;
  while (acc >= STEP_MS && steps < MAX_STEPS) {
    input.drainTo(state);                 // 消费本 tick 输入意图（不直接改 world）
    step(state, tick++);                  // core 纯逻辑：原地更新，确定性
    acc -= STEP_MS; steps++;
  }
  if (steps === MAX_STEPS) acc = 0;      // ← 丢弃积压，防死亡螺旋

  const alpha = acc / STEP_MS;           // 0..1，仅用于渲染插值
  render(state, alpha);                  // 只读；绝不把 alpha 传进逻辑
}

function pause()  { running = false; cancelAnimationFrame(rafId); acc = 0; input.clearAll(); audio.suspend(); }
function resume() { last = performance.now(); acc = 0; running = true;
                    rafId = requestAnimationFrame(frame); }
```
插值：`render` 内对可移动实体用 `x = lerp(e.prevX, e.x, alpha)`；**新生成 / 已销毁实体不插值**，直接用当前值。`alpha` 是渲染层局部变量，**不得进入 `core`**。

### 3.3 掉帧 / 后台切回补偿策略（防止怪物瞬移或秒杀）
结论：**一律不「追帧」补算真实经过的时间**。切后台 10 分钟回来，不补 18000 个 tick。四重保险：

1. `document.visibilitychange`（hidden）、`pagehide`、Page Lifecycle `freeze`（iOS 更常触发 `pagehide`）→ 立即 `pause()`：停 rAF、清空全部输入、`AudioContext.suspend()`、**同步 `flush()` 写一次存档**。
2. 恢复时 `last = performance.now(); acc = 0;`（第 3.2 节），即使 rAF 回调带回来一个巨大 `now - last`，也被 `MAX_FRAME_MS = 250` 钳住。
3. `MAX_STEPS = 5` + 超出 `acc = 0`：单帧最多结算 5 个 tick（≈167ms 游戏时间），杜绝低端机长卡顿后一次性巨量结算把玩家秒了。
4. 逻辑内全部按 tick 计数，不读 `Date.now()/performance.now()`：DOT / buff / 冷却不会因墙钟跳变而「一次性结清」。

**恢复交互结论**：切回前台**停在暂停面板，玩家点「继续」才恢复运行**（不自动开打）。理由：最直观，且彻底避免回来瞬间被围殴。这与 3.2 的 `resume()` 由 UI 触发而非 `visibilitychange` 直接调用保持一致。

### 3.4 帧预算分配（60fps = 16.67ms）

| 项 | 预算 | 说明 |
| --- | --- | --- |
| 逻辑 `step` | **≤ 4 ms** | 30Hz → 平均每个渲染帧 0.5 次 step |
| 渲染（canvas + HUD） | **≤ 8 ms** | 含全清、离屏背景、实体、粒子、飘字、HUD 文本更新 |
| 输入 / 音频 / 其他 | **≤ 1 ms** | 事件队列消费、音源触发 |
| **GC** | **目标 0 ms** | **不是留时间给 GC 跑，而是不产生垃圾**：见下 |
| 余量 / 浏览器合成 | **≥ 3.67 ms** | 留给系统合成、GPU 排队、调度抖动 |

**GC 的明确结论**：不设「GC 占 X ms」，而设可测指标 **steady state 每帧堆分配 < 1 KB**，把 minor GC 压到几乎不发生。手段：`step()` 内不 `new`、不建临时数组 / 对象 / 闭包、不拼字符串、不用 `Array.prototype.filter/map` 产生新数组；实体 / 子弹 / 粒子 / 事件对象全部对象池 + `active` 标记（用标记代替 `splice`）；字符串（伤害数字）用预分配画布或数字图集绘制。

降级时目标帧率改为 30fps（33.3ms 预算），但**逻辑 tick 恒 30Hz 不变**（第 6 节）。

---

## 4. 目录骨架与测试策略

### 4.1 目录树（文件名 + 职责 + 层标记）
标记：**P** = 纯逻辑（零浏览器 API，可 `node` headless 跑）/ **R** = 渲染或 UI（只读 state）/ **B** = 桥接、入口、含浏览器 API / **D** = 数据。

```
/workspace
├── index.html                     # 唯一入口；module script → ./src/main.js；含 file:// 提示
├── package.json                   # {"type":"module","private":true}，无 dependencies（见 1.3）
├── README.md
├── docs/
│   ├── design_v1.md               # 创意总监：数值终值表（唯一真源，本文不写内容）
│   └── tech_baseline_v1.md        # 本文档
├── assets/                        # 本地图片 / 音频 / 字体，禁止任何外链
│   ├── img/  audio/  fonts/
├── src/
│   ├── main.js                    # [B] 装配：初始化 tables → storage → canvas → input → loop；生命周期
│   ├── loop.js                    # [B] rAF + 累加器 + alpha + pause/resume（第 3.2 节）
│   ├── input.js                   # [R] #stage 事件委托 → InputState；单手点击离散意图、多点同时点击
│   ├── storage.js                 # [B] localStorage 读写、schema 迁移、损坏兜底、节流 flush
│   ├── audio.js                   # [B] WebAudio（本地文件）、静音、后台 suspend
│   ├── perf.js                    # [B] 帧耗时采样、低端检测、画质档位、URL ?q= 覆盖
│   │
│   ├── core/                      # ==== 纯逻辑层：零 DOM / 零 Canvas / 零浏览器 API ====
│   │   ├── state.js               # [P] state 形状定义、createInitialState、事件队列(damage/death/loot)
│   │   ├── rng.js                 # [P] 可播种 PRNG（mulberry32），状态是 state 的一部分、可序列化
│   │   ├── tables.js              # [P] 唯一读表入口：getClass/getSkill/getEquipment/getMonster/
│   │   │                         #     getDropTable/balance + 启动校验；core 只 import 它
│   │   ├── formulas.js            # [P] 伤害/暴击/减伤/属性聚合等纯函数，参数全部来自 tables
│   │   ├── combat.js              # [P] step(state, tick)：前摇/冷却/命中/弹道/AI/结算，确定性
│   │   ├── loot.js                # [P] 掉落判定：(rngState, dropTable) => 结果 + 新 rngState
│   │   ├── progression.js         # [P] 职业/等级/装备/技能装配与属性聚合（纯函数）
│   │   └── time.js                # [P] tick ↔ 秒换算、冷却计时，全部整数 tick
│   │
│   ├── data/                      # ==== 数据外置：design_v1.md 的机器可读镜像（第 8 节）====
│   │   ├── classes.js             # [D] 职业表
│   │   ├── skills.js              # [D] 技能表
│   │   ├── equipment.js           # [D] 装备表
│   │   ├── monsters.js            # [D] 怪物表
│   │   ├── drops.js               # [D] 掉落表
│   │   └── balance.js             # [D] 全局曲线 / 公式系数 / 常量
│   │
│   ├── render/
│   │   ├── canvas.js              # [R] canvas 初始化、DPR、setTransform、resize、离屏缓存
│   │   ├── worldRenderer.js       # [R] 实体/背景/飘字，签名 (state, alpha)，只读 + lerp(prevX,x)
│   │   ├── particles.js           # [R] 预分配对象池粒子
│   │   └── hud.js                 # [R] DOM HUD，仅数值变化时更新
│   └── ui/
│       ├── screens.js             # [R] 职业选择 / 背包 / 装备 / 暂停 / 设置
│       ├── orientation.js         # [R] 横屏提示、桌面预览手机框
│       └── style.css              # [R] 全部样式、安全区、热区、touch-action
├── tests/                         # 不进产物
│   ├── helpers.js                 # stepN(state, inputs, n)、makeState()、假表 fixture
│   ├── formulas.test.js
│   ├── combat.test.js
│   ├── loot.test.js
│   ├── determinism.test.js
│   └── data.test.js               # 表引用完整性校验（给设计表落地的自检）
└── tools/                         # 不进产物
    ├── serve.mjs                  # 零依赖静态服务器（node:http）
    └── build.mjs                  # 可选：纯拷贝到 dist/
```

### 4.2 核心原则（不可协商）
1. **纯逻辑与渲染分离**：`src/core/` 下任何文件不得 `import` 或出现 `document / window / canvas / ctx / performance / Date / Math.random / localStorage` 任一标识符。可用一条不装依赖的自检脚本 / `Grep` 规则做检查。
2. **战斗结算、数值、掉落、随机**必须全部是 `core/` 下的确定性纯逻辑，能用 `node` 直接 `import` 跑 headless 测试。
3. **渲染层只读 state**；唯一能改变 state 的是 `core` 的 `step()` 与 `input.drainTo()` 注入的输入意图。渲染层不产出 gameplay 结果。
4. `core` 只 `import './tables.js'`，**不直接 import `data/*` 具体文件**：换数据文件不动逻辑。

### 4.3 tests/ 策略（不装依赖）
- 命令：`node --test tests/`（node v22.13.1 已验证 `node:test` 可用）；单文件 `node --test tests/combat.test.js`。
- 断言用 `node:assert/strict`；**不装** jest / vitest / sinon。
- 直接 `import { step } from '../src/core/combat.js'`，靠根 `package.json` 的 `type:module` 让浏览器与 node 同源解析（第 1.3 节）。
- 测试不启动 DOM、不启 rAF、不 `setTimeout`、不真实等待时间。

### 4.4 如何对实时战斗做确定性测试
1. **固定随机种子**：`createRng(0x12345678)`；RNG 状态存进 `state.rng`，`step()` 返回后状态随之推进；**全项目禁用 `Math.random()`**。`storage` 也存 seed（第 7 节），支持续跑 / 回放。
2. **手动推进 tick**：`for (let i = 0; i < N; i++) step(state, i)`，提供 `stepN(state, inputs, n)` 辅助；完全不依赖 rAF 与墙钟。
3. **输入也确定性**：预录 `InputFrame[]`（每 tick 的离散意图 `{type:'skill'|'dodge'|'potion', slot?, tick}`），由 `drainTo()` 注入；不使用真实事件。
4. **断言方式**：
   - 同种子 + 同输入序列 → 两次运行的关键 state 快照 `assert.deepStrictEqual`（或自写 `hashState()` 比哈希）；
   - 具体机制断言：第 N tick 应触发某技能、第 M tick 怪物死亡、DOT 逐 tick 结算值序列固定；
   - 掉落用大样本固定种子统计，落在阈值内（不是精确等值，但阈值本身固定）；
   - 快照测试：把关键字段序列化成字符串比对，防止无意改动结算顺序。
5. **必测的边界**：大 delta 钳位（模拟切后台）、`MAX_STEPS` 丢弃积压、`alpha` 不进入逻辑、装备/技能装配后属性聚合、存档迁移 v1→v2→v3。
6. `tests/data.test.js` 遍历所有表：id 唯一、外键引用存在、字段类型正确、数值有限且非负、`cdTicks >= 0`、`weight >= 0` —— **这是创意总监数值表落地后的接入自检**。

---

## 5. 移动端适配清单

### 5.1 viewport 与 meta（可直接复制）
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0b0d14">
<meta name="color-scheme" content="dark">
<meta name="format-detection" content="telephone=no">
```
`viewport-fit=cover` 是安全区生效前提；`maximum-scale=1` + `user-scalable=no` 禁缩放，**但 iOS 10+ 会忽略 `user-scalable`**，靠 `touch-action:none` + `gesturestart` 兜底（5.6）。

### 5.2 竖屏锁定与桌面预览
- **结论：不强行锁屏**（Web 无法可靠锁定；`screen.orientation.lock()` 需全屏且 iOS Safari 不支持），改为 **竖屏优先 + 横屏提示遮罩**。
- 检测：`matchMedia('(orientation: landscape)')` 或 `innerWidth > innerHeight` → 显示 `#orientation` 全屏提示「请竖屏游玩」，遮住一切。
- 渐进增强：安卓 Chrome 且已全屏时可 `try { await screen.orientation.lock('portrait') } catch {}` 静默尝试，**失败不报错、不依赖它**。
- **桌面预览**：仅作开发/演示，不是交付目标。`@media (min-width: 900px)` 下给 `#stage` 加 `.device-frame`，居中一个竖屏比例容器（宽 `min(100vw, 100vh * 9 / 19.5)`），四周留深色背景；鼠标 / 键盘映射为输入（数字键 → 技能 ×3 / 药瓶，空格或方向键 → 闪避；**键盘同样不提供方向操控**）。
- `orientationchange` 后尺寸更新在 iOS 有滞后：用两次 `requestAnimationFrame` 再量，或监听 `visualViewport.resize`（5.4）。

### 5.3 安全区 `env(safe-area-inset-*)`
```css
:root {
  --sat: env(safe-area-inset-top, 0px);    --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);   --sar: env(safe-area-inset-right, 0px);
}
#hud { padding: calc(var(--sat) + 8px) calc(var(--sar) + 8px)
                 calc(var(--sab) + 8px) calc(var(--sal) + 8px); }
.skill-bar { padding-bottom: calc(var(--sab) + 8px); }  /* 避开 Home Indicator */
```
结论：**canvas 可画到屏幕边（背景出血），但所有可交互 UI 必须落在安全区内**；横屏时也按左右 `sal/sar` 避让刘海。

### 5.4 DPR 适配
```js
const dpr = Math.min(window.devicePixelRatio || 1, 2);   // 结论：封顶 2
const cssW = stage.clientWidth, cssH = stage.clientHeight;
canvas.width  = Math.round(cssW * dpr);
canvas.height = Math.round(cssH * dpr);
canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // 之后一律 CSS 像素坐标
ctx.imageSmoothingEnabled = false;
```
封顶 2 的理由：3x 屏像素量是 2x 的 2.25 倍，实时战斗下发热/掉帧收益不值；低端档降到 1（第 6 节）。
`resize` / `orientationchange` / **`visualViewport.resize`**（移动端地址栏收起会改视口高度，最易漏）时重算并重建离屏缓存；`visualViewport` 不支持时退回 `window.resize`。

### 5.5 热区 ≥ 44px
所有可点元素 `min-width:44px; min-height:44px; box-sizing:border-box`；**战斗技能按钮实际做 ≥ 56px、间距 ≥ 8px**（拇指高速操作）。视觉小图标靠 `padding` 撑开热区，**不要缩小元素本身**。

### 5.6 300ms 延迟、touch / click、禁双击缩放
- **结论：统一用 Pointer Events（`pointerdown/pointerup/pointercancel`）**，战斗输入**不用 `click`**，也不写 touchstart+touchend 双套。理由：一套覆盖触摸/鼠标/笔，配合 `touch-action:none` 后无 300ms 延迟，iOS Safari 13+ / 安卓 Chrome 全支持；本作只有点击，**不监听 `pointermove` 做连续输入**。
- ```css
  #stage { touch-action: none; -webkit-tap-highlight-color: transparent;
           -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
  ```
- 关键战斗键在 **`pointerdown` 即响应**（不等 `pointerup`、不等冷却），降低体感延迟；普通 UI 按钮用 `pointerup` + 点击判定阈值（区分点击与误触，误触规则以 `design_v1.md` §3.6 为准）。
- 禁双击缩放兜底：`document.addEventListener('gesturestart', e => e.preventDefault())`（iOS）；`dblclick` 上 `preventDefault()`。**注意区分**：只拦「双指手势」与「非交互区双击」，**绝不能把技能连点当双击禁掉**（连点必须保留，见 5.7）。

### 5.7 单手点击输入模型

依据 `design_v1.md` §3.1：**玩家位移是系统行为（自动寻敌、自动接敌），玩家可控位移只有「闪避」一个操作，且闪避为固定侧向左右交替、不带方向参数**。结论：本作**只有点击，没有方向输入** —— 输入层不接受任何方向向量、连续位置采样或手势轨迹，也不做持续按压类操作；`core` 不接收方向参数，玩家位置由 `combat.step()` 自动裁决。

- **控件布局**：右下弧线 = **技能键 ×3**；**闪避键**、**药瓶键** 同侧就近排布（具体布局按设计案）。**左下区改为非交互战场信息区**（战斗信息 / 目标信息展示），`pointer-events:none`，**不放置任何控件、不产生输入意图**。玩家输入只有三类：技能 ×3、闪避、药瓶。
- **`InputState` 结构（结论：只有离散意图 + tick 时间戳，无方向向量字段）**：
  ```js
  InputState = {
    // 每条意图自带产生时的 tick，供 core 做输入缓冲与去重
    intents: [
      { type:'skill',  slot: 0|1|2, tick },
      { type:'dodge',  tick },
      { type:'potion', tick }
    ],
    pressed: Map<pointerId, controlId>   // 仅用于按下态高亮与 cancel 清理，不参与结算
  };
  ```
  闪避意图**不带方向与距离**：侧向左右交替由 `core` 按设计案裁决，输入层只上报「闪避」这一离散事实。
- **按下即触发 + 输入缓冲（结论：输入与结算解耦）**：所有战斗键在 **`pointerdown` 立即 push 一条意图**（不等 `pointerup`、不等冷却），**不节流、不 debounce、不合并**；每个逻辑 tick 由 `combat.step()` 消费 `intents`，按冷却 / 前摇裁决「释放 / 缓冲 / 丢弃」。**连点与误触的具体判定规则以 `design_v1.md` §3.6 为准，由 `core` 实现**；输入层只保真上报，不判定、不吞键。缓冲队列上限 3，防止狂点堆积导致延迟释放。
- **多点触控的真实需求**：是「**同时点闪避与技能**」（或技能与药瓶），不是「方向操控 + 技能」。用 `e.pointerId` 独立跟踪 `Map<pointerId, controlId>`，允许多个控件同时处于按下态、各自独立产生意图；只处理第一个触点是常见翻车点。
- **`pointercancel` / 生命周期清理**：`pointercancel`（来电、系统手势、切后台）必须清掉对应 `pointerId` 的按下态并恢复按钮视觉；`pause()` 清空 `intents` 与 `pressed`。未清理 → 技能键卡在按下态（视觉常亮、后续点击被吞）、闪避键吞掉输入。

### 5.8 禁止橡皮筋滚动
```css
html, body { margin:0; height:100%; overflow:hidden; position:fixed; inset:0;
             overscroll-behavior:none; }
```
iOS 兜底（只在 `#stage` 内拦截，可滚动容器放行）：
```js
stage.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
```
背包等需要滚动的列表单独 `overscroll-behavior: contain; touch-action: pan-y;` 放行。**优先 `touch-action:none`，touchmove 只作兜底**。

### 5.9 中文字号下限
正文 **≥ 14px**，战斗关键数字 / 技能名 **≥ 16px**，标题 ≥ 20px；**禁止 < 12px**，行高 ≥ 1.5。理由：中文笔画密度高，小字号在 DPR 缩放后易糊。字号用 `px`/`rem`，**不用 `vw` 缩放文字**（小屏会看不清）。
字体栈全部本地系统字体，不下载：
```css
font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei",
             "Noto Sans CJK SC", sans-serif;
```
若确需自定义字体，只能放 `assets/fonts/*.woff2` 本地 `@font-face`（禁止 CDN）。

### 5.10 切后台 `visibilitychange` 与横屏提示
- hidden / `pagehide` / `freeze` → `pause()`（停 rAF、清输入、音频 suspend、同步 flush 存档）。
- visible → **不自动恢复**，停在暂停面板等玩家点「继续」；点击后 `last = performance.now(); acc = 0; running = true`。
- 横屏提示见 5.2；`#orientation` 在 z45，强制盖住一切。

---

## 6. 性能预算

| 指标 | 结论值 |
| --- | --- |
| 首屏可交互 | **≤ 2 s**（中端安卓 / 本地或局域网静态服务） |
| 首屏资源总量 | **≤ 500 KB**（不含音频；音频懒加载 / 按需） |
| 关键路径请求数 | **≤ 8**（ESM 模块总数 **≤ 20**，理由见坑 14） |
| 单帧预算 | **16.67 ms**（60fps）；低端档 30fps = 33.3ms |
| ├ 逻辑 / 渲染 / 其他 | ≤ 4 / ≤ 8 / ≤ 1 ms |
| ├ GC | **0 ms 目标**，可测指标 = 每帧分配 **< 1 KB** |
| └ 余量 | ≥ 3.67 ms |
| 同屏实体上限 | **≤ 60**（玩家+怪物+子弹+掉落+特效载体）；超限时按最远/最旧剔除，生成处做硬上限检查 |
| DOM 节点上限 | **≤ 150**（常驻 HUD/UI）；背包列表**分页每页 ≤ 20 项**，不做无限 DOM，不进 DOM 的用 canvas 画 |
| 内存上限 | JS heap **≤ 60 MB**，整页 **≤ 120 MB**；离屏 canvas / 纹理累计 **≤ 16 MB** |
| 粒子上限 | **同屏 120**，预分配对象池 120 个复用；低端档 40；粒子只做视觉，不参与碰撞/结算 |
| 目标帧率 | 60fps，稳态允许 30fps；**逻辑 tick 恒 30Hz，绝不随画质档变化** |

**动画结论**：DOM 动画一律优先 `transform` / `opacity` + `transition`（走合成层，不触发 layout/paint）；HUD 血条用 `transform:scaleX()`；`will-change:transform` 仅限 ≤ 5 个常驻动画元素，避免合成层爆炸。**Canvas 内实体运动不用 CSS 动画**，由插值每帧绘制。

**对象池结论**：粒子、伤害飘字、子弹、事件对象一律预分配 + `active` 标记复用，禁止运行时 `new`；实体数组用标记代替 `splice`（`splice` 产生垃圾）。`state` 原地更新，禁止每 tick 深拷贝（第 3.1 节）。

**低端安卓降级开关**
- 检测（**组合判定，不用 UA 黑名单**）：
  1. 启动后前 120 帧采样帧耗时：`avgFrameMs > 24` 或 `帧耗时 > 33ms 的占比 > 20%` → 判低端；
  2. 初始先验：`navigator.hardwareConcurrency <= 4`、`navigator.deviceMemory <= 4`（存在才用）；
  3. `devicePixelRatio > 2` 且大屏 → 更倾向降档；
  4. 提供 `?q=low|mid|high` 与设置页手动覆盖，写入存档，方便测试与用户自救。
- 降级项（明确清单）：DPR 上限 `2 → 1.5 → 1`；粒子 `120 → 40 → 0`；同屏实体 `60 → 30`；目标帧率 `60 → 30`；关闭阴影/描边/发光/闪光/屏幕震动与全屏半透明叠加；背景静态化；音源并发数减半。**逻辑 tick 保持 30Hz 不变**（降画质不降结算频率，否则手感与结果与测试不一致）。
- 连续 2 个采样窗口超标才降档、只降不自动升（避免抖动），手动可升。

**实时战斗的发热与耗电**
- 不追求持续满帧：无敌人 / 暂停时渲染降到 30fps 或跳帧（逻辑仍 30Hz）。
- 禁止 `setInterval` 高频轮询、禁止每帧 `console.log`、禁止每帧读 `getBoundingClientRect/offsetWidth`（强制同步布局）。
- 音频：少量短音效 + 复用 `AudioBuffer`；**首次用户交互后才 `AudioContext.resume()`**（自动播放策略），后台 suspend；静音默认开可让用户关。
- **不使用 Wake Lock 屏幕常亮**（耗电 + 兼容性），如需引入需用户确认。
- 避免大面积 `box-shadow` / `filter:blur` / 全屏半透明叠加，移动端合成代价极高。

---

## 7. 存档方案

### 7.1 结论与结构
`localStorage` **单键 + JSON + 同步写 + 版本号**。不存战斗瞬时状态，事件驱动节流写。

```js
const SAVE_KEY = 'yxlu.save.v1';   // 键名固定，版本靠内部 v 字段，不换键
const CURRENT_V = 3;
{
  v: 3,                         // schema version，整数，唯一迁移依据
  savedAt: 1710000000000,       // 仅展示/排序，不参与任何逻辑
  seed: 123456789,              // RNG 状态，支持确定性续跑 / 回放
  player:    { classId, level, exp, hp, mp, gold, statPoints, unlockedSkillIds: [] },
  equipment: { weapon: itemId|null, armor: ..., accessory: ... },
  inventory: [ { id, itemId, count } ],          // 数组而非对象，省空间
  progress:  { stage, room, kills, playTimeTicks },
  settings:  { quality:'auto'|'low'|'mid'|'high', muted:bool, showDamage:bool },
  checksum:  1234567            // FNV-1a(规范化 JSON)，只防意外损坏，不做防作弊
}
```
**明确约定：不存怪物位置、子弹、buff 剩余 tick、粒子等战斗瞬时状态。** 理由：写入成本高、易与运行态不一致、读取后无法可靠复原。结论：**战斗中断即回到战斗开始前的检查点（房间入口）**。存档只存 `id`（装备/技能/物品），名称一律从 `data/*` 按 id 取 —— 顺便杜绝把存档字符串 `innerHTML` 造成的 XSS。

### 7.2 schema version 与迁移
- `const migrations = { 1: v1 => v2, 2: v2 => v3, ... }`；读取后 `while (s.v < CURRENT_V) s = migrations[s.v](s);`，**逐级迁移不跳级**。
- 每个迁移补默认值、不改语义；**新增 / 修改字段一律 `CURRENT_V + 1`，禁止就地改结构不升版本**。
- 迁移前把原始字符串备份到 `SAVE_KEY + '.bak'`，失败可回滚。
- `s.v > CURRENT_V`（来自更新版本）→ **不覆盖、不迁移**，提示「存档来自更新版本」并只读保留，避免旧代码写坏新档。

### 7.3 损坏兜底（三层）
1. `JSON.parse` 包 `try/catch`；
2. 结构校验：`v` 为整数、必填对象/数组存在、数值 `Number.isFinite` 且非负（防 `NaN/Infinity` / 巨值）、id 为字符串；
3. `checksum` 比对（FNV-1a，对规范化后的 JSON 字符串计算）。
- 损坏结论：**不静默清空** → 把原文移到 `SAVE_KEY + '.corrupt.<ts>'` 保留，优先尝试 `.bak` 恢复，都失败才用 `createInitialSave()` 开新档并弹 UI 提示「存档损坏，已重置」。
- `localStorage` 不可用（隐私模式 / iOS 无痕 / `file://`）或 `QuotaExceededError`：捕获 `setItem` 异常 → **降级为内存存档 + UI 提示「当前环境无法保存进度」，不崩溃**。

### 7.4 写入频率（实时战斗红线）
**结论：绝不每帧写、绝不每 tick 写。** `localStorage` 是同步阻塞主线程，一次写 5~20ms 会直接掉帧。

- 事件驱动 + 节流：`markDirty()` 置脏标记，最低写入间隔 **5 s**，在非战斗安全点合并写。
- 触发点：战斗结束、拾取 / 装备变更、升级、进入新房间、设置变更、`visibilitychange` hidden、`pagehide`。
- `flush()` 在 hidden / `pagehide` 时**立即同步写一次**（同步 API 在 pagehide 里可靠）。
- 战斗中不写（上述两个生命周期事件除外）。

---

## 8. 数据驱动约定（与 `design_v1.md` 的接入口）

### 8.1 结论
**数值表以 ES Module 外置在 `src/data/*.js`，用 `export default` 导出对象字面量；不用 `.json`、不内嵌、不硬编码。**

理由：`import` 同步、随模块图一起加载，无需 `fetch` / 异步初始化 / JSON 解析失败处理；任何静态服务器都可靠；能被 `node` 直接 `import` 做测试；能被 JSDoc 提示。`file://` 下 fetch JSON 会失败（第 1.4 节），JSON 还需多一次请求与异步启动流程 —— 零构建下 JS 模块更省。

**预留给创意总监的桥**：`docs/design_v1.md` 是**数值真源**，`src/data/*.js` 是其**机器可读镜像**。两种落地方式均可、不改变运行时形态：① 按 8.2 的形状直接录入；② 若设计侧产出 JSON，在 `tools/` 放一个零依赖生成脚本转成 `export default {...}`（转换属 tools 职责，**不进产物**）。运行时**只读 JS 模块**这一条不变。两边不一致时以 design 为准重新同步，**不在逻辑层写「兜底数值」掩盖差异**。

### 8.2 接口形状（只定字段与单位，不给任何数值、不定条目数）
> 下列 `id` 均为占位示例；**具体条目、名称、数量、数值全部由 `design_v1.md` 决定**，本文不预设职业/技能/装备/怪物的种类与内容。

```js
// src/data/classes.js —— 键 = classId，条目数由设计文档决定
export default {
  /* [classId]: { id, name, desc, icon,
       baseStats:{ hp, mp, atk, def, spd, crit, critDmg },
       growthPerLevel:{ ...同上字段 },
       startSkillIds:[skillId], startEquipment:{ slot: itemId } } */
};

// src/data/skills.js
export default {
  /* [skillId]: { id, name, icon, sfx,
       cdTicks, castTicks, costMp, rangePx,
       shape:'single'|'cone'|'aoe', targetType:'enemy'|'self'|'point',
       power, coeff, element,
       effects:[{ type:'damage'|'heal'|'buff'|'dot', ... }] } */
};

// src/data/equipment.js
export default {
  /* [itemId]: { id, name, icon, slot:'weapon'|'armor'|'accessory',
       rarity, reqLevel, price, statMods:{...} } */
};

// src/data/monsters.js
export default {
  /* [monsterId]: { id, name, sprite, baseStats:{...},
       ai:'chase'|'kite'|'stationary', attackSkillId,
       aggroRangePx, moveSpeedPxPerTick, dropTableId } */
};

// src/data/drops.js —— weight 为整数权重，由 core/loot.js 消费
export default {
  /* [dropTableId]: [ { itemId, weight, minCount, maxCount } ] */
};

// src/data/balance.js —— 全局曲线 / 公式系数 / 常量
export const balance = { /* 全部系数，形状随设计文档对齐 */ };
```
**单位约定（写进表头注释，防换算错）**：所有**时间一律整数 tick**（30Hz，`cdTicks/castTicks/durationTicks`），设计文档若用「秒」由 `core/time.js` 统一换算；所有**距离 / 速度一律 CSS 像素**（`rangePx` / `moveSpeedPxPerTick`），与 DPR 解耦；概率用 0~1 小数或整数权重，全表统一。

### 8.3 逻辑层零硬编码（硬约束）
- `src/core/*` 内**禁止出现任何数值字面量**（除 `0` / `1` / 索引 / 结构常数）；所有系数、阈值、概率、时长、距离、成长值来自 `tables.js` 或 `balance.js`。
- **`core/tables.js` 是唯一读表入口**：`getClass/getSkill/getEquipment/getMonster/getDropTable/balance`。`core` 只 import 它，不 import `data/*` 具体文件 → 换数据文件不动逻辑。
- 启动时 `tables.js` 做一次**校验**：id 唯一、外键引用完整、字段类型正确、数值有限且非负、`cdTicks >= 0`、`weight >= 0`。dev 抛错、prod 用安全默认值并在 `#fatal` 上报，避免设计表笔误导致运行时 `NaN` 静默扩散。
- 表**只读冻结**（`Object.freeze` 或约定不修改）；运行时状态（当前 hp、冷却剩余、buff 层数）放 `state`，**绝不写回表**。
- 接入自检：`node --test tests/data.test.js` 遍历表检查引用完整性（4.4 第 6 条）。设计表刚落地时先跑它，是最快的联调闸口。

---

## 9. 可运行与可验证

### 9.1 本地起服务（已验证）
```bash
# 方式 A（推荐：零依赖、支持并发）
node tools/serve.mjs 8080
# 方式 B（已实测 HTTP 200；注意其为单线程，模块多会慢）
python3 -m http.server 8080 --directory /workspace
```
打开 `http://localhost:8080/`（桌面预览自动套手机框）。

### 9.2 同局域网真机打开
```bash
hostname -I | awk '{print $1}'     # Linux 查局域网 IP
ipconfig getifaddr en0             # macOS 查局域网 IP
```
手机连**同一 Wi-Fi**，浏览器打开 `http://<局域网IP>:8080/`。要点：
- 服务必须监听 **`0.0.0.0`**（`python3 -m http.server` 默认即是；`tools/serve.mjs` 也要 bind `0.0.0.0`）；电脑防火墙放行 8080 入站；避免访客网络 / AP 隔离。
- **http 是非安全上下文**：`localStorage` 在 http 局域网可用（不是 `file://`），但 `serviceWorker` / Wake Lock 等不可用 —— 本基线**不依赖**它们（第 6 节），故不强制 https。
- 至少测 **iOS Safari + 安卓 Chrome** 各一台；真机调试用 `chrome://inspect`（安卓 USB）/ Safari 远程调试（mac）。
- **不得 `file://` 双击打开；不得依赖任何 CDN / 联网下载的字体、图片、音频**（全部本地或内联）。

### 9.3 跑测试
```bash
node --test tests/                  # 全量，零依赖
node --test tests/combat.test.js    # 单文件
node --test tests/data.test.js      # 设计表落地后的接入自检
```
`node v22.13.1` 已验证 `node:test` 可用；根 `package.json` 只有 `{"type":"module","private":true}`，**无 dependencies**。

### 9.4 交付验收清单
```
[ ] 手机浏览器直接打开即玩（http 静态服务，无需构建）
[ ] 可选职业；自动接敌 + 闪避 + 技能连按（多点同时）生效
[ ] 装备 / 技能体系影响结算，且数值全部来自 src/data/*.js
[ ] 切后台回来停在暂停面板，不瞬移、不秒杀
[ ] 横屏提示、安全区、热区、桌面预览手机框正常
[ ] node --test tests/ 全绿
[ ] DevTools Network 全部请求指向本机 / 局域网，零外网请求
[ ] dist/ = index.html + src/ + assets/ 原样拷贝，可独立部署
```

---

## 10. 已知风险与坑（H5 手机端实时战斗最易翻车）

| # | 风险 | 现象 | 规避 |
| --- | --- | --- | --- |
| 1 | rAF 后台暂停后大 delta 追帧 | 切回前台怪物瞬移、玩家被秒 | `visibilitychange`/`pagehide` 暂停、delta 钳位 250ms、`MAX_STEPS=5`、丢弃积压；恢复停在暂停面板（3.3） |
| 2 | 用 `Date.now()` 驱动冷却 / DOT | 后台回来一次性结清巨额伤害 | 全部按整数 tick 计时，逻辑不读墙钟（3.1） |
| 3 | `file://` 打开 | ESM / fetch / localStorage 全失败，白屏 | 强制 http 静态服务；`index.html` 加 `file:` 提示（1.4） |
| 4 | 每 tick 深拷贝 state / 大量临时对象 | minor GC 卡顿、掉帧 | 原地更新 + 对象池 + `prevX/prevY` 插值，分配 <1KB/帧（3.1、6） |
| 5 | 用 `click` / 输入与结算耦合 | 300ms 延迟、技能连点丢按 | Pointer Events + `pointerdown` 入队 + 每 tick 消费，UI 不节流（5.6、5.7） |
| 6 | 未处理 `pointercancel` | 来电/切后台后技能键卡在按下态、闪避键吞掉输入 | cancel 清对应 `pointerId` 的按下态并恢复按钮视觉；`pause()` 清 `intents` 与 `pressed`（5.7） |
| 7 | iOS 橡皮筋 / 双击缩放 / 地址栏收起 | 画布整体偏移、尺寸错乱、误缩放 | `position:fixed; overflow:hidden; touch-action:none` + `gesturestart` 拦截 + `visualViewport.resize` 重算（5.4、5.6、5.8） |
| 8 | 只处理第一个触点 | 同时点闪避与技能时只响应一个 | `pointerId` 独立跟踪、各控件独立产生意图（5.7） |
| 9 | 每帧写 localStorage | 同步阻塞主线程、掉帧甚至卡死 | 事件驱动 + 5s 节流 + 战斗中不写 + hidden/pagehide 同步 flush（7.4） |
| 10 | 低端安卓 WebGL 上下文丢失 / 高 DPR 过热降频 | 黑屏、发热、帧率雪崩 | 只用 Canvas 2D、DPR 封顶 2 可降 1、自动降档、逻辑 tick 恒定（2.1、6） |
| 11 | 中文字体 / 大图走 CDN | 国内网络失败、首屏白屏 | 系统字体栈 + 本地内联资源 + 首屏 ≤500KB + 音频懒加载（5.9、6） |
| 12 | 音频自动播放被拦截 | 无声、AudioContext 报错 | 首次交互后 resume，后台 suspend，静音默认开（6） |
| 13 | 设计表笔误（NaN / 悬空 id / 负冷却） | 战斗静默异常、数值失控 | `tables.js` 启动校验 + `tests/data.test.js` 引用完整性 + 逻辑层零硬编码（8.3） |
| 14 | 无构建导致 ESM 模块瀑布 | 首屏慢（`python http.server` 单线程 + HTTP/1.1 连接数有限） | 模块总数 ≤20、开发用 `tools/serve.mjs` 并发、必要时用入口聚合 import（1.4、6） |
| 15 | 设计表与代码数值漂移 | 实测结果与策划不符 | design 为真源、data 为镜像、测试做一致性检查（8.1） |
| 16 | 插值 `alpha` 混入逻辑 / 渲染层写 state | 结果不可复现、确定性测试失效 | 渲染只读、`alpha` 仅用于 `lerp`、`core` 不 import `render`（2.2、3.2） |
| 17 | 依赖 `screen.orientation.lock` 锁竖屏 | iOS 无效、白等或抛错 | 不依赖锁屏，用横屏提示遮罩；lock 仅渐进增强且 try/catch 静默（5.2） |
| 18 | iOS 低电量模式 / 后台冻结把 rAF 降到 1fps | 帧率骤降、误判卡顿 | 靠 visibility 暂停 + 帧耗时采样降级，不假设恒定 60fps（3.3、6） |
| 19 | `will-change` / 大面积阴影模糊 | 合成层爆炸、发热掉帧 | `will-change` ≤5 元素、禁全屏 `filter`、动画只用 transform/opacity（6） |
| 20 | 改存档结构不升 `v` | 老玩家读档崩溃 | 版本 +1 + 逐级迁移 + `.bak` 备份 + 损坏隔离（7.2、7.3） |
| 21 | `.mjs` 源码被服务器返回错误 MIME | module script 被浏览器拒绝执行 | 源码一律 `.js` + 根 `package.json` 的 `type:module`（1.3） |

---

## 附录：不可协商的红线（给主程序）

1. **零构建 / 零 npm 依赖 / 零外链**：不装依赖、不引构建工具；字体、图片、音频全部本地或内联；源码即产物（`dist/` 只是拷贝）；**禁止 `file://` 打开，必须 http 静态服务器**。
2. **纯逻辑与渲染分离 + 确定性**：`src/core/` 不得出现 `document / window / canvas / performance / Date / Math.random / localStorage`；逻辑恒 **30Hz tick** + 种子 RNG，渲染只读 state；切后台暂停且恢复不追帧；**禁止每帧深拷贝 state、禁止每帧写存档**。
3. **数值表驱动、逻辑层零硬编码**：所有数值只在 `src/data/*.js`，`core` 只经 `core/tables.js` 查表；`docs/design_v1.md` 是数值真源，`data/*` 是其机器可读镜像，不在逻辑里写兜底数值。
