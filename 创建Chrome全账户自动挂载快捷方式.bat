@echo off
chcp 65001 >nul
title JobCruise - 创建 Chrome 全账户自动挂载快捷方式

echo ====================================================================
echo  JobCruise 求职自动化巡航助手 - 全账户免重新导入配置工具
echo ====================================================================
echo.
echo 正在检测 Google Chrome 安装路径并创建桌面快捷方式...
echo.

node "%~dp0create_shortcut.js"

echo.
pause
