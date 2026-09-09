# 数据目录（v0.3）

## 版本与基准

- **数据版本**：v0.3（多源融合值）
- **班底基准**：**2026-27 赛季英超 20 队一线队，时点 2026-09-06（2026 夏窗关闭后）**。2025-26 赛季降级：West Ham / Burnley / Wolves；升班马：Coventry City / Hull City / Ipswich Town。
- 名单来源：每队经 2-4 个独立来源交叉验证（俱乐部官方名单 / premierleague.com / ESPN / Wikipedia / Transfermarkt），并用转会新闻核对了 2026 夏窗主要进出。

### 属性数值来源（v0.3 起为多源融合值）

| 层 | 来源 | 说明 |
|---|---|---|
| 先验 v0.2 | 人工合成标定 | 基于 FM 标定逻辑的估计值，原版保留在 `data/archive/players_v0.2_synthetic/` |
| 主源 | **EA FC26**（`data/raw/eafc26_players.csv`，18k 人） | sofifa 抓取的官方评分快照（2025-09，能力反映 2025 夏窗后状态） |
| 待接入 | FM24 全量导出（474k 人）、Transfermarkt-datasets | 放入 `data/raw/` 后重跑 `scripts/integrate_sources.py` 即可 |

**融合方法**（`scripts/integrate_sources.py`）：

1. **实体匹配**：姓名 token 级匹配（变音转写 ø/ß/ı/đ、别名词典 Ollie/Oliver、首字母缩写、模糊相似度）+ 年龄窗口校验（差 0/1/2 年）。匹配率 **421/422**（唯一未匹配：Mfuni，EA 库无此人，保留先验值）。
2. **属性融合**：有外部值的属性 `new = 0.6×EA + 0.4×先验`（60/40 抑制 EA 高分通胀）；EA 无对应项（bravery/concentration/decisions/determination/flair/leadership/teamwork、定位球 3 项）保留先验。
3. **元数据**：身高/体重/惯用脚直接采用 EA 实测值；逆足精度由 weak_foot 星级派生。
4. **门将行**：只融合 handling/kicking/reflexes/command_of_area；出球（first_touch/passing）保留先验（EA 场上短传对门将出球无参考性）。
5. 逐人匹配状态与覆盖数见 `data/integration_report.csv`。

**已知问题**：EA 快照早 1 年（2025-09），转会球员能力未反映 2026-27 状态；EA 对精神属性评分偏保守（Van Dijk vision 92→79 这类下移是锚点差异，M0 用 StatsBomb 真实数据重校准）。匹配过程顺带修正了 v0.2 的 15 处年龄错误与 2 处人名错误（Bijol、Affengruber）。

**刷新流程**：下载新数据集放入 `data/raw/` → `integrate_sources.py --dry-run` 查匹配率 → 实跑 → `validate_data.py`。发布版整体替换为化名；**EA/FM 评分仅限内部开发参照，不得随产品分发**。

## 文件结构

```
data/
├── clubs.csv            # 20 队：id, name, short, primary, secondary
├── players/{id}.csv     # 一队一文件，UTF-8，63 列，列头固定
├── tactics/             # 战术预设库（阵型/角色/心态/指令/定位球 + 示例战术包）→ tactics/README.md
├── calibration/         # 统计基线与战术敏感性测试（M0/M1 验收目标）→ calibration/README.md
├── presentation/        # 呈现层配置（转播导演/动画/图文/音频）→ presentation/README.md
└── README.md
```

> 接口契约在仓库根的 [../schemas/](../schemas/)：SimParams（战术编译器输出）/ State Stream（仿真→呈现）/ 遥测事件词表。

## 列定义（63 列，顺序固定）

| 组 | 列 |
|---|---|
| 元信息（9） | id, name, club, age, height_cm, weight_kg, foot_l, foot_r, positions |
| 技术（11） | crossing, dribbling, finishing, first_touch, free_kicks, heading, long_shots, marking, passing, tackling, technique |
| 定位球（3） | corners, long_throws, penalties |
| 精神（14） | aggression, anticipation, bravery, composure, concentration, decisions, determination, flair, leadership, off_the_ball, positioning, teamwork, vision, work_rate |
| 身体（8） | acceleration, agility, balance, jumping, natural_fitness, pace, stamina, strength |
| 门将（12） | aerial_reach, command_of_area, communication, eccentricity, gk_first_touch, handling, kicking, one_on_ones, punching, reflexes, rushing_out, throwing |
| 隐藏（5） | consistency, important_matches, injury_proneness, versatility, dirtiness |
| 特性（1） | traits |

- 所有属性列：**0–100 整数**，空 = 不适用/未标定。UI 显示折算 `clamp(round(v/5),1,20)`。
- 门将行：填门将 12 列 + 精神/身体/隐藏全列；技术列只填 `first_touch, passing`（出球用），其余留空。**v0.2 已知缺口：门将行的 aggression/anticipation 暂缺**（建库管线缺陷，修复时源数据已无此二值，刷新时补齐）。
- 非门将行：门将 12 列全部留空。
- `eccentricity`、`injury_proneness`、`dirtiness`、`punching`、`rushing_out` 为**倾向/负向**参数：越高越极端（eccentricity 越低越稳）。

## 记法约定

- **positions**：`GK DR DL DC WBR WBL DM MR ML MC AMR AML AMC ST`，逗号分隔多位置；`*`=自然、`+`=熟练、无记号=生疏。如 `ST*,AMC+`。
- **foot_l / foot_r**：左右脚 0–100；≥85 视为该脚顺足。
- **traits**（`|` 分隔，0–3 个）：喜欢远射 / 爱盘带过人 / 喜欢直塞身后 / 回做型 / 喜欢抢点近门柱 / 高举高打 / 喜欢利用速度 / 拉边型前腰 / 喜欢内切 / 贴地传中 / 犯规战术型 / 大力手抛球

## 标定分档（0-100 语义）

| 分档 | 语义 | 典型 |
|---|---|---|
| 95–100 | 世界级峰值（该属性（接近）全球最佳） | Salah pace, Van Dijk positioning, Rodri decisions |
| 85–94 | 顶级/英超最佳阵容级 | Haaland finishing 97 |
| 75–84 | 稳定主力 | 大部分首发核心属性 |
| 65–74 | 轮换/英超合格 | 替补主属性 |
| 55–64 | 边缘/年轻 | 潜力股当前值 |
| <55 | 短板属性 | 每人总有几项 |

隐藏属性惯例：consistency 80+ 场场稳定 / 60–79 正常波动 / <55 神经刀；important_matches 75+ 大场面先生；injury_proneness ≥70 玻璃人（Reece James 类）。

## 校验

```
python scripts/validate_data.py      # 球员/俱乐部
python scripts/validate_tactics.py   # 战术/Schema/校准/呈现配置 + 交叉引用
```

检查（validate_data）：文件表头与 63 列一致、取值 0–100、位置/后缀合法、门将列完整性、traits 词表、每队人数汇总。
