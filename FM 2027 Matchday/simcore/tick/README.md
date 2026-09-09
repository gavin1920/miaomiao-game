# Tick 引擎 v1-stage1（25Hz 个体仿真骨架）

对应 [docs/03](../../docs/03-比赛引擎-仿真层.md) 的 M1 起点：**场上有 22 个人在踢球**。
与 [v0 统计引擎](../engine.py) 并存——v0 仍是批测校准的参照（`batch_calibrate.py` 用它），
tick 引擎在阶段 3 完成效用 AI 后再对齐同一套基线。

## 结构

```
simcore/tick/
├── world.py    # 场地常数/球员与球实体/World（25Hz, dt=0.04, 105×68 米，主队攻 +x）
├── motion.py   # 运动学（pace→v_max / acceleration→a_max / agility→转向率 / 持球折扣 / 疲劳）
│               #   + 球物理（滚动摩擦/反弹/马格努斯侧旋）+ 控球判定（可控球速 12–21 随 first_touch）
├── brain.py    # 阶段1 启发式决策：阵型锚点+球位弹性+角色偏移 → 跑位；
│               #   持球按 射门窗口/被逼抢出球/盘带推进 三段启发式；传球按飞行时间预判+误差
├── match.py    # TickMatch 编排：状态机（开球/运动战/死球重开/进球庆祝/半场）、
│               #   边界解析（进球/出界→角球/球门球/界外球）、GK 扑救（xG 语义守恒）
└── stream.py   # 状态流 JSONL（首行 meta + 1Hz 快照帧 + 终场行），结构对齐 schemas/state_stream.schema.json
```

## 使用

```
python scripts/play.py ARS LIV --seed 42      # 比赛日：踢一场 → 自动打开浏览器回放
python scripts/play.py --list                 # 列出 20 队
python scripts/play.py MCI LIV --mentality attacking --formation 4-3-3
python scripts/run_tick_match.py ARS LIV 42   # 只仿真 → out/tick_*.jsonl
python scripts/render_match.py out/tick_*.jsonl   # → 同名 .html
```

回放器：播放/暂停/0.5–8× 倍速/进度拖动/事件流（进球黄字），帧间插值平滑 1Hz 快照；
`window.seekTo(frac) / playState() / togglePlay()` 供自动化驱动。

## 测试

`python -m unittest tests.test_engine`（5 项）：同种子同结果、异种子异结果、
状态流 schema/词表/边界合规、多对阵稳定性、强弱表达（MCI vs COV 进球+xG 聚合）。

## 状态流约定

- 引擎内部 25Hz 逐 tick 仿真；写盘按 **1Hz 快照**（`snapshot_every=25`，可调）——全量 25Hz
  一场 ≈ 135k 帧/200MB，调试场景下没有必要；呈现层消费插值后的流（与 docs/04 的"50–60fps
  渲染 25Hz 流插值"同构）。
- 帧结构对齐 schema；调试额外携带 `pid/team/slot/score`（呈现层需要稳定 id）。
- 事件词表 ⊆ schemas/telemetry_events.json（目前使用：match_phase_change / pass_attempt /
  pass_completed / interception / shot / goal / save / set_piece_awarded / set_piece_taken*）。

## 当前与真实英超的对照（100 场终评，引擎已冻结）

| 指标 | tick 引擎 | 英超基线 | 状态 |
|---|---|---|---|
| 传球成功率 | 82% | 78–86% | ✔ |
| 黄牌 | 3.4 | 3–4.5 | ✔ |
| 场均换人 | 3.7 | 3–5 | ✔ |
| 死球节奏 | 62/场 | ~100 | 接近 |
| 犯规 | 18.0 | 10–13 | 偏高 40% |
| 场均射门 | 6.0 | 11–13 | 偏低 |
| 场均进球 | 0.86（xG 0.91，守恒 ✔） | 2.6–3.0 | 偏低 |

**已实现的真实机制**：越位规则（动态越位线帽 + 出球瞬间判定 + 接球即吹）、
抢断决斗/犯规/牌、后卫解围、门将扑救分型、禁区"弹球"抑制、
**AI 经理 v0**（60' 后落后自动变阵积极、领先控节奏、按体能换人，事件带 reason_tag）。

**剩余差距的根因**（阶段 3 后续，非旋钮问题）：进攻三区的无球配合深度不足——
没有叠瓦套边/第三人跑动/第二波进攻，射门量只有基线一半；
抢断成功率不随防守方质量响应（强弱表达弱于 v0 统计引擎）。

## 确定性

全部随机性来自 `random.Random(seed)`，同 seed 同比分同事件流（已验证）。
