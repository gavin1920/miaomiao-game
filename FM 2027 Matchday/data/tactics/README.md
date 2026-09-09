# 战术数据目录（v0.1）

对应 [../docs/02-战术系统.md](../docs/02-战术系统.md)。战术 = 可序列化参数包，比赛内可热替换；玩家界面与 AI 经理共用同一格式。

## 文件结构

```
data/tactics/
├── formations.json    # 10 套预设阵型：每套 11 槽位（pos/x/y/默认职责）
├── roles.json         # 27 个角色（行为包）：锚点偏移/有球权重/无球跑位/防守职责/属性适配
├── mentality.json     # 心态 7 档预设：防线高度/逼抢触发线/向前风险/决策时间窗/宽度/逼抢强度
├── instructions.json  # 有球 7 条 + 无球 10 条指令：档位 → 编译目标
├── set_pieces.json    # 定位球预设目录：角球/任意球/界外球/点球（攻防两侧）
├── examples/
│   └── ARS_4231_high_press.json   # 完整示例战术包（真实球员阵容）
└── README.md
```

## 坐标约定（formations.json）

- 锚点为**「平衡」心态下的基准位**；心态/指令/角色在其上做偏移（编译器合成）。
- `x`：纵深，0 = 本方球门线 → 1 = 对方球门线（105m 场）。
- `y`：横向，-1 = 球队进攻方向左路 → +1 = 右路。
- 职责码：`de` 防守 / `su` 策应 / `at` 进攻。

## 词表约定（roles.json `vocab`）

- `on_ball`（11 键）/ `off_ball`（10 键）为**封闭词表**，新增行为必须先扩词表再使用。
- 角色适配度评分 `attrs`：键必须与 [data/README.md](../data/README.md) 的球员属性列名一致（编译器据此提示"这个人不适合踢节拍器"）。

## 战术包 Schema（草）

```jsonc
{
  "id": "…", "club": "ARS", "name": "…",
  "formation": "4-2-3-1",            // formations.json 里的 id
  "mentality": "attacking",          // mentality.json 里的 preset id
  "instructions": { "in": {…7 条…}, "out": {…10 条…} },   // instructions.json 的档位 id
  "roles": { "槽位id": "角色id:职责" },                    // 11 项，覆盖阵型全部槽位
  "lineup": { "槽位id": "球员id" },                        // 与 data/players/{club}.csv 对应
  "set_pieces": { "corner_atk": "…", …, "penalties_order": ["球员id", …] },
  "player_overrides": [],            // 个体指令（盯人/留后/拉宽），死球生效
  "notes": "…"
}
```

编译目标（SimParams 权威字段契约）见 [../schemas/simparams.schema.json](../schemas/simparams.schema.json)；运行时结构见 docs/02 §八。

## 生产方式

- v1：**预设库组合**而非自由编辑（拖拽阵型编辑器放 v2）——阵型 10 选 1 + 角色/职责指派 + 指令勾选 + 定位球预设，覆盖 90% 需求。
- AI 经理与玩家共用本目录的战术包格式与编译器（docs/00 原则 3）。

## 校验

```
python scripts/validate_tactics.py
```

检查：阵型 11 槽位/坐标范围/位置合法、角色词表封闭、心态档位完整、指令档位与文档一致、示例战术包（阵容存在性、角色-槽位-球员位置兼容、职责合法性）、呈现层事件引用 ⊆ 遥测词表。
