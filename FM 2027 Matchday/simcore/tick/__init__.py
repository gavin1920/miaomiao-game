"""M1 · 25Hz tick 引擎：世界状态、运动学、决策启发式（阶段1）、状态流。

与 v0（simcore/engine.py 统计引擎）并存：v0 仍是批测校准的参照实现；
本包按 schemas/state_stream.schema.json 逐 tick 产出状态流（调试降采样 5Hz 写盘）。
确定性：所有随机性来自单一 random.Random(seed)。
"""
