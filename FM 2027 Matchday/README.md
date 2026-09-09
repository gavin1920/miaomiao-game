# FM 2027 Matchday

FM 的战术深度 × FIFA 的转播级画面 × 比 FIFA 更聪明的纯 AI 对抗。
玩家扮演英超球队经理，场上 22 人零操控、纯 AI 对抗的**比赛日游戏**。

## 🎮 可玩版（推荐入口）

**[game/](game/index.html) —— 双击 `game/index.html` 即可游玩**（离线单页网页游戏）：

- 德转参考身价的英超 20 队 337 人 + 固定预算组队 + 任选对手打一场
- 21 套阵型自由拖拽、30 个角色、16 项球队指令的完整战术板
- 战术驱动的分钟级比赛引擎（战场动画/解说人格/换人窗口/伤病/临场变阵/赛后时间轴与战术复盘）
- **v0.3「联赛之心」**：10 轮迷你赛季 或 42 周完整双循环（主客场+轮空周）、更衣室新闻墙、
  金靴榜、挖空恩怨系统、3 换人窗口、体能延续与轮换压力、Seed 公平对决、比赛日键位
- 质量校验：`node game/test/smoke.js`（91 项含战术敏感性批测）

## 设计文档

| 文档 | 内容 |
|---|---|
| [docs/00-项目总览与路线图.md](docs/00-项目总览与路线图.md) | 定位、范围、总体架构、技术选型、里程碑、风险 |
| [docs/01-球员属性系统.md](docs/01-球员属性系统.md) | 属性表（技术/精神/身体/门将/隐藏）、属性→引擎参数映射、CA/PA、数据 Schema |
| [docs/02-战术系统.md](docs/02-战术系统.md) | 阵型/心态/攻防指令/角色职责/定位球/临场调整、战术编译器 |
| [docs/03-比赛引擎-仿真层.md](docs/03-比赛引擎-仿真层.md) | 25Hz 确定性仿真、三层 AI、对抗/执行/决策模型、AI 经理、验证标准 |
| [docs/04-比赛引擎-视觉与呈现.md](docs/04-比赛引擎-视觉与呈现.md) | Unity 呈现、球-脚同步动画、转播导演、图文包装、音频、与 FM26/FIFA 差异清单 |
| [docs/05-游戏性叙事与UIUX-v0.3.md](docs/05-游戏性叙事与UIUX-v0.3.md) | v0.3「联赛之心」：完整赛季/客场赛制、伤病、换人窗口、恩怨、新闻引擎、金靴、解说人格、时间轴、Seed 对决、键位 |

## 数据、Schema 与校验

每份设计文档都有对应的机器可读数据/契约，改文档必须同步改数据：

| 位置 | 内容 | 对应文档 |
|---|---|---|
| [data/players/](data/players) + [clubs.csv](data/clubs.csv) | 英超 20 队一线队，一队一 CSV（63 列，0–100 存储） | 01 §十一 |
| [data/tactics/](data/tactics) | 阵型 10 套 / 角色 27 个 / 心态 7 档 / 指令 17 条 / 定位球预设 + 完整示例战术包 | 02 §十 |
| [schemas/](schemas) | SimParams（编译器输出）、State Stream（仿真→呈现）、遥测事件词表 22 个 | 03 §十五 |
| [data/calibration/](data/calibration) | 英超统计基线 + 6 条战术敏感性测试（M0/M1 验收机读目标） | 03 §十四 |
| [data/presentation/](data/presentation) | 转播导演状态机 / 动画变体映射 / 图文面板 / 音频规则 | 04 |

校验（改完数据跑这两个）：

```
python scripts/validate_data.py      # 球员/俱乐部
python scripts/validate_tactics.py   # 战术/Schema/校准/呈现配置 + 交叉引用
```

## 仿真核 v0（已可跑）

回合制确定性引擎（`simcore/`，Python 原型，见 [simcore/README.md](simcore/README.md)）：

```
python scripts/run_match.py ARS LIV 42     # 看一场：比分/射门/xG/控球/进球列表
python scripts/batch_calibrate.py          # 1000 场批测 → 对照英超基线（当前 8/8 达标）
python scripts/batch_calibrate.py --sens   # 战术敏感性用例（当前 3/3 通过）
```

**M1 · 25Hz tick 引擎（阶段1 跑通 + 质检通过）**——场上有 22 个人真的在跑动/传球/抢断/射门：

```
python scripts/play.py ARS LIV          # 比赛日入口：踢一场 → 自动打开浏览器回放
python scripts/play.py --list           # 20 队列表
python -m unittest tests.test_engine    # 引擎质检测试（5 项）
```

回放器支持播放/倍速/拖动进度/事件流（详见 [simcore/tick/README.md](simcore/tick/README.md)）。
射门结果为**出脚时按属性判定 + 物理演出**（xG 语义硬守恒）；批测偏差（射门/进球偏多，
根因=无越位规则）记录在 tick README，属阶段 3 结构项。

注意：`COV/HUL/IPS` 等 12 队为**占位合成阵容**（`scripts/gen_placeholder_squads.py` 生成，
T1–T4 分档），真实标定数据逐队就位后直接覆盖 `data/players/{id}.csv`。

## 核心原则（速记）

1. 仿真与呈现彻底分离（headless 确定性仿真核 + 可替换的呈现层）
2. 每个属性都映射到引擎参数，能在比赛里"看见"
3. 战术 = 可序列化参数包，比赛内热替换；玩家与 AI 经理共用同一接口
4. 足球先于画面：先用统计分布对齐真实英超，再上 3D
