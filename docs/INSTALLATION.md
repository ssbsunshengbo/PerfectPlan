# 安装、数据与手动备份

## 下载来源

请只从 [PerfectPlan 的 GitHub Releases](https://github.com/ssbsunshengbo/PerfectPlan/releases) 下载官方安装包。不要从第三方网盘、转载站或不明链接下载安装文件。

PerfectPlan 当前面向 macOS 与 Windows 桌面系统。它不需要账号，也不需要联网即可使用主要功能。

## macOS 安装

1. 在 Releases 页面下载最新的 `.dmg` 文件。
2. 双击打开 `.dmg`，将 PerfectPlan 拖到 `Applications`（应用程序）文件夹。
3. 从“应用程序”打开 PerfectPlan。

在正式 Apple 签名与公证完成前，macOS 可能提示应用来自“未识别开发者”。请先确认文件确实来自本仓库的 Releases 页面；如需继续，可在 Finder 中按住 Control 点击应用并选择“打开”，或在“系统设置 → 隐私与安全性”中选择允许。不要对来源不明的文件执行这些操作。

## Windows 安装

1. 在 Releases 页面下载最新的 Windows `.exe` 安装程序。
2. 双击安装程序，按引导完成安装。
3. 从开始菜单或桌面快捷方式打开 PerfectPlan。

在正式 Windows Authenticode 签名配置完成前，SmartScreen 可能显示“未知发布者”提示。请仅在确认安装程序来自官方 Releases 页面后再继续；不确定时请停止安装并在 GitHub Issues 中询问。

## 升级与卸载

- 安装新版本前，先完全退出 PerfectPlan。新版本会保留同一台设备上的本地数据。
- 卸载应用通常不会自动删除应用数据；如需彻底移除，请在确认已备份后，再删除下面列出的数据库文件夹。
- 当前没有云同步。不同设备上的数据彼此独立，升级也不会把数据发送到网络。

## 数据保存位置

PerfectPlan 将数据保存在本地 SQLite 数据库 `perfectplan.db` 中：

| 系统    | 默认位置                                                                       |
| ------- | ------------------------------------------------------------------------------ |
| macOS   | `~/Library/Application Support/com.perfectplan.desktop/perfectplan.db`         |
| Windows | `C:\Users\<你的用户名>\AppData\Roaming\com.perfectplan.desktop\perfectplan.db` |

路径中可能还存在 SQLite 的临时日志文件。备份或恢复时务必先完全退出 PerfectPlan，避免复制到写入中的数据库。

## 手动备份与恢复

自动备份、JSON 导入导出和 CSV 导出尚未实现。当前请按以下方式手动保护数据：

### 备份

1. 完全退出 PerfectPlan。
2. 找到上表中的 `perfectplan.db`。
3. 将该文件复制到你自己信任的位置，例如加密磁盘、个人备份盘或受保护的云盘目录。
4. 用日期命名副本，例如 `perfectplan-2026-09-02.db`。

### 恢复

恢复会覆盖当前本地数据。操作前请先备份现有的 `perfectplan.db`。

1. 完全退出 PerfectPlan。
2. 将要恢复的备份副本重命名为 `perfectplan.db`。
3. 用该文件替换默认位置的同名文件。
4. 重新打开 PerfectPlan，确认任务数量和内容正确。

若恢复后应用无法启动，请保留数据库副本并在 GitHub Issues 中报告操作系统、应用版本和错误信息；不要公开上传包含个人任务内容的数据库文件。
