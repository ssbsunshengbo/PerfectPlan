# Changelog

All notable changes to PerfectPlan are documented in this file.

The project follows [Semantic Versioning](https://semver.org/) and keeps unreleased changes in the section below until a GitHub Release is prepared.

## [Unreleased]

## [0.2.0] - 2026-09-21

### Added

- 倒数日页面：以离线主题卡片记录假期、纪念日和重要日期，自动显示剩余或已过去天数。
- macOS 菜单栏便携面板：可快速查看、创建、完成和查看当天任务，无需唤起主窗口。
- 日历任务池与半小时级时间块安排；任务可拖入时间格、调整时长，并拖回任务池取消排期。

### Changed

- 重构桌面界面的视觉语言、详情页、输入控件、下拉菜单、标签与项目展示，降低表单噪音并提高信息可读性。
- 任务、子任务和日历已完成事项均保留在原位置，以完成态呈现而非直接隐藏。
- 主导航收敛为任务、日历、项目和倒数日；移除回收站、改期、今日、即将到来与独立标签页面。
- 任务删除现在为确认后的永久删除；任务列表采用更紧凑的一行元信息布局。

### Fixed

- 修复中文搜索输入、日历拖放、时间块时长预览、周/日网格对齐和任务池自动滚动等交互问题。
- 修复任务栏面板的圆角窗口、交互失效与相邻详情打开问题。

## [0.1.0] - 2026-09-02

### Added

- Local-first task management with projects, tags, notes, priorities, subtasks, search, and a recycle bin.
- Today, upcoming, daily planning, rescheduling, and common recurring-task rules.
- Month, week, and day calendar views with drag scheduling, estimated duration, overload and conflict hints.
- Local reminders and an in-app reminder center with complete, snooze, and open-task actions.
- Keyboard navigation, dialog focus management, visible focus styles, and reduced-motion support.
- GitHub Actions checks and macOS/Windows build verification.

[Unreleased]: https://github.com/ssbsunshengbo/PerfectPlan/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ssbsunshengbo/PerfectPlan/releases/tag/v0.2.0
[0.1.0]: https://github.com/ssbsunshengbo/PerfectPlan/releases/tag/v0.1.0
