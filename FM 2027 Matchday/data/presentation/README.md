# 呈现层配置目录（v0.1）

对应 [../docs/04-比赛引擎-视觉与呈现.md](../docs/04-比赛引擎-视觉与呈现.md)。观感 = 画面 × 镜头语言 × 图文包装 × 音频——后三样全部由本目录的配置驱动，呈现层代码只是执行器。

## 文件结构

```
data/presentation/
├── camera_director.json  # 转播导演状态机：12 状态、触发条件、防眩晕规则（min dwell 8s、硬切+2帧黑场）
├── animation_map.json    # 动作/事件 → 动画变体池：属性调制（finishing/flair/... 可视化）、门将扑救分型、个体差异层
├── graphics_panels.json  # 图文包装面板：比分条/弹图/数据条 + 半场·全场图版序列（xG/射门图/传球网络/热图/换人时间线）
├── audio_rules.json      # 音频：紧张度模型 → 人群分层、触球声分型、定位球氛围
└── README.md
```

## 事件契约（单一来源）

- 所有配置里引用的**遥测事件 id** 只能出自 [../schemas/telemetry_events.json](../schemas/telemetry_events.json)（22 个）——转播导演、图文包装、音频与仿真遥测同源，不各造一套事件名。
- 动作 enum 与状态流结构见 [../schemas/state_stream.schema.json](../schemas/state_stream.schema.json)（animation_map 的 action 键与其一致）。
- 动画变体的属性调制键必须是 [../README.md](../README.md) 数据约定里的球员属性列名或 traits 词表成员。

## 设计要点

- 转播导演是**状态机而非脚本**：每个状态声明 `enter/exit/priority/min_dwell_s`，事件流驱动跳转；玩家可锁定单机位（tactical_lock）绕过导演。
- 图文包装零额外数据管线：面板数据 = 遥测事件的直接聚合（xG 曲线就是 shot.xg 的累计）。
- AI 经理的 `manager_decision.reason_tag` 同时是字幕与解说素材——"决策可解释"是呈现层的一等公民。

## 校验

```
python scripts/validate_tactics.py
```

检查：JSON 合法、状态机 id 唯一、min_dwell_s ≥ 8（goal_live/goal_replay 等显式豁免除外）、面板/音效引用的事件 id ⊆ 遥测词表。
