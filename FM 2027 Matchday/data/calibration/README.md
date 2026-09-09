# 校准数据目录（v0.1）

对应 [../docs/03-比赛引擎-仿真层.md](../docs/03-比赛引擎-仿真层.md) §十四。M0/M1 阶段"足球先于画面"的验收就是**跑批对照这两份机读目标**。

## 文件

| 文件 | 内容 | 消费方式 |
|---|---|---|
| [epl_baseline.csv](epl_baseline.csv) | 真实英超统计分布基线（进球/射门/xG 量级/传球成功率/角球/犯规/黄牌/控球-排名相关） | 批量 ≥1000 场（固定种子流水），每项指标落入 min–max 区间即通过 |
| [tactics_sensitivity.csv](tactics_sensitivity.csv) | 6 条战术敏感性测试（docs/03 §十四 的机读版） | 每条：改一个 SimParams 参数（setup_a vs setup_b）→ 批测 500 场 → 指定 metric 分布必须按 expected_direction 显著移动（≥min_effect） |

## 约定

- `setup_a / setup_b` 里只写被修改的 SimParams 字段（字段名见 [../schemas/simparams.schema.json](../schemas/simparams.schema.json)），其余参数取默认战术包。
- `metric` 用遥测事件名/字段表达（词表见 [../schemas/telemetry_events.json](../schemas/telemetry_events.json)），保证测试脚本直接消费仿真旁路输出。
- 这就是"AI 比 FIFA 聪明"的可量化定义：**战术输入与涌现结果之间有真实、多样、互克的因果链**（docs/00 原则 5）。
