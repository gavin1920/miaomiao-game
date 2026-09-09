# 仿真核 v0（回合制原型）

M0 交付：**headless 确定性仿真核** + 战术编译器 + 批测校准。对应 [docs/03](../docs/03-比赛引擎-仿真层.md)；
统计验收目标在 [data/calibration](../data/calibration/)。**v0 是统计模型**（分钟级回合制），
验证"属性→强度→分布"的链路；25Hz 个体仿真（运动模型/对抗/决策）按同一接口在 M1 移植 C#。

## 结构

```
simcore/
├── data.py       # 加载器：clubs/players/战术预设库/示例包/校准基线（属性 0-100 → [0,1]）
├── tactics.py    # 战术编译器：战术包 → SimParams → 五维强度(att/def/mid/press/line)
│                 #   + auto_pick_lineup（无显式包时按 位置契合×总评 贪心选首发）
├── engine.py     # MatchEngine：分钟循环（中控争夺→机会→xG→终结）+ TUNING 校准旋钮
└── team.py       # club id → 引擎队伍字典（ARS 用示例包，其余自动生成默认包）
```

## 模型（v0）

- **中控争夺**：每分钟按双方 `mid × 心态修正` 的 logistic 平方决定控球方。
- **机会创造**：`λ = chance_base × (att×心态攻 / def×心态守)^1.35`；防守方高线（≥42m）且
  进攻方有速度前锋 → 追加被打身后（counter 型）机会。
- **机会类型**：open_play/box_move/counter/set_piece/long_shot 权重制，xG 有类型乘数
  （set_piece 1.35×、long_shot 0.30×），战术开关（counter、tackling）调制分布。
- **终结**：采样 xG → 射正 → 条件转化 `xg/射正占比 × finishing/composure × (1−GK reflexes)`。
  **xG 语义守恒：ΣxG ≈ 期望进球**（遥测口径与真实 xG 对齐）。
- **伴随事件**：传球（成功率 = 基准 + 短传偏向 − 对手逼抢）、角球、犯规/黄牌（tackling/aggression）、
  反抢夺回（counter_press）。事件命名对齐 schemas/telemetry_events.json 词表。
- **确定性**：`random.Random(seed)`，同 seed 同比分；批量 seed 流水固定可复现。

## 使用

```
python scripts/run_match.py ARS LIV 42        # 单场（可选 seed）
python scripts/batch_calibrate.py             # 1000 场 → 对照 epl_baseline.csv，8 项指标判定
python scripts/batch_calibrate.py --sens      # 3 条战术敏感性用例（改参→分布显著移动）
```

当前状态（1000 场）：**8/8 指标入区间**；敏感性 3/3 通过。

## 校准旋钮（engine.TUNING）

所有统计口径常数集中在 `engine.TUNING`（chance_base / xg_mean / 射正占比 / 犯规基数等），
调参只动这里；批测即回归测试——**改任何引擎逻辑后重跑 batch_calibrate，8 项必须保持绿**。

## v1 迁移注意

- 接口保持：SimParams 进（schemas/simparams.schema.json）、状态流+遥测出
  （schemas/state_stream.schema.json + telemetry_events.json）。v0 的 `_summary`/
  `events` 将被逐 tick 状态流替换，事件 id 不变。
- 强度合成（tactics.py 的角色/职责/熟悉度加权）可直接复用为 v1 的决策先验。
- TUNING 的统计常数在 v1 变成分布目标（由校准反推物理参数），不要硬编码进仿真逻辑。
