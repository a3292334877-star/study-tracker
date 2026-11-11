# -*- coding: utf-8 -*-
"""兼容入口（v1.20 起）：图标统一由 _tools/make_icons.py 从
icon-design/gen/qwen-notebook.png 生成 PWA + Android 传统 mipmap + 自适应前景。
保留本文件名只为兼容旧命令，实际直接转调 make_icons.py。"""
import os, runpy
HERE = os.path.dirname(os.path.abspath(__file__))
runpy.run_path(os.path.join(HERE, "make_icons.py"), run_name="__main__")
