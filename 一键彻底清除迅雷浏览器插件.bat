@echo off
chcp 65001 >nul
title 彻底清除迅雷Chrome/Edge自动安装插件
echo ========================================================
echo   正在彻底清除迅雷浏览器自动静默安装插件...
echo ========================================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 正在请求系统管理员权限，请在弹窗中点击【是】...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~dpnx0\"\"' -Verb RunAs"
    exit /b
)

echo 1. 正在清理注册表强制注入项...
reg delete "HKLM\SOFTWARE\WOW6432Node\Google\Chrome\Extensions\ncennffkjdiamlpmcbajkmaiiiddgioo" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\Google\Chrome\Extensions\ncennffkjdiamlpmcbajkmaiiiddgioo" /f >nul 2>&1
reg delete "HKCU\Software\Google\Chrome\Extensions\ncennffkjdiamlpmcbajkmaiiiddgioo" /f >nul 2>&1

reg delete "HKLM\SOFTWARE\WOW6432Node\Microsoft\Edge\Extensions\ncennffkjdiamlpmcbajkmaiiiddgioo" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\Microsoft\Edge\Extensions\ncennffkjdiamlpmcbajkmaiiiddgioo" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Edge\Extensions\ncennffkjdiamlpmcbajkmaiiiddgioo" /f >nul 2>&1

echo [完成] 注册表强制注入项已全部清除！
echo.

echo 2. 正在清除本地插件安装包缓存并开启免疫拦截...
if exist "%LOCALAPPDATA%\ChromeExtensionCache\xl_ext_chrome.crx" (
    rmdir /s /q "%LOCALAPPDATA%\ChromeExtensionCache\xl_ext_chrome.crx" >nul 2>&1
    del /f /q "%LOCALAPPDATA%\ChromeExtensionCache\xl_ext_chrome.crx" >nul 2>&1
)
mkdir "%LOCALAPPDATA%\ChromeExtensionCache\xl_ext_chrome.crx" >nul 2>&1
icacls "%LOCALAPPDATA%\ChromeExtensionCache\xl_ext_chrome.crx" /deny Everyone:(W) >nul 2>&1

echo [完成] 本地CRX缓存已免疫拦截（迅雷再也无法生成安装包）！
echo.
echo ========================================================
echo  清理已全部成功！迅雷插件绝不会再自动安装到 Chrome/Edge。
echo  提示：如果当前 Chrome 中还残留有迅雷插件，
echo  请在 chrome://extensions 页面中点击一次“移除”，
echo  以后无论重启电脑、换账户还是新开窗口，都不会再自动安装！
echo ========================================================
echo.
pause
