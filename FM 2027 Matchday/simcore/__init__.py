"""FM 2027 Matchday — 仿真核 v0（回合制粗粒度原型）。

M0 目标：headless 可批量、确定性（固定种子）、统计分布对齐 data/calibration/epl_baseline.csv。
25Hz 个体仿真在 M1 按同一接口（SimParams → 状态流/遥测）移植 C#。
"""

__version__ = "0.1.0"
