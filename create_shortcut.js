const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const extPath = __dirname;
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
];

let chromePath = chromeCandidates.find(p => p && fs.existsSync(p));

if (!chromePath) {
  console.error('❌ 未在系统中检测到 Google Chrome 安装路径，请确认是否已安装 Chrome！');
  process.exit(1);
}

const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Chrome (求职巡航全账户通用).lnk'
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = '${chromePath.replace(/'/g, "''")}'
$shortcut.Arguments = '--load-extension="${extPath.replace(/"/g, '`"')}"'
$shortcut.IconLocation = '${chromePath.replace(/'/g, "''")},0'
$shortcut.Description = 'Google Chrome - 自动挂载求职巡航插件（所有账户通用）'
$shortcut.WorkingDirectory = '${path.dirname(chromePath).replace(/'/g, "''")}'
$shortcut.Save()
Write-Host "SHORTCUT_SUCCESS"
`;

const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

try {
  const res = execSync(`powershell.exe -NoProfile -EncodedCommand ${encoded}`, { encoding: 'utf8' });
  if (res.includes('SHORTCUT_SUCCESS')) {
    console.log('====================================================================');
    console.log('✅ Chrome 桌面快捷方式已成功创建！');
    console.log('📌 快捷方式名称: Chrome (求职巡航全账户通用).lnk');
    console.log('🎯 挂载插件路径:', extPath);
    console.log('💡 使用说明: 今后双击桌面的 [Chrome (求职巡航全账户通用)] 打开浏览器，');
    console.log('   无论切换或登录哪一个 Chrome 账户，均会自动挂载该求职巡航插件，免重复导入！');
    console.log('====================================================================');
  }
} catch (err) {
  console.error('创建快捷方式失败:', err.message);
}
