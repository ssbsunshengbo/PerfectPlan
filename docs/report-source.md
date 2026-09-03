# PerfectPlan 竞品体验研究与优化路线

> 面向：PerfectPlan 产品与实现协作  
> 日期：2026-09-03  
> 范围：个人任务规划桌面应用的体验、视觉与产品形态；基于截至研究日可访问的官方产品文档、帮助中心和更新记录。  
> 不在范围：账号/云同步、团队协作、外部日历接入、习惯/番茄钟等新业务模块。

## 结论先行

PerfectPlan 下一阶段不该从“全应用换一套皮肤”开始，也不该继续增加大功能。最佳路线是以一条高频闭环为样板，先重做 **捕捉任务 → 查看/编辑详情 → 放入今天或时间块**，再把验证过的组件和信息层级扩展至其余页面。

推荐的产品形态是：

- **Things 式的安静任务管理**：页面有更多留白，任务标题优先；“哪天处理”和“几点做”是两个不同层次，避免用户把截止、计划日期、日历时间块混为一谈。
- **Sunsama / Akiflow 式的时间规划**：日历旁始终有可安排的任务清单；时长是拖入日历时的明确依据，冲突是提示而不是阻断。
- **Todoist 式的可扩展属性**：任务详情可在同一上下文编辑所有属性，但不把每一个属性做成重卡片或永久可见的表单。
- **Things / Akiflow 式的快速捕捉**：全局入口与输入指令并存；`#标签` 保留为 PerfectPlan 的简单约定，输入提示负责可发现性，不能扩展成难记的命令语言。
- **Sunsama / Akiflow 式的菜单栏**：它首先是“看一眼和立刻完成”的轻量工作台，只有必要时才打开相邻详情，不应偷偷唤起主窗口。

这条路线与 PerfectPlan 的离线个人工具定位一致：不靠同步、集成或复杂自动化制造价值，而靠更少的认知负担，让用户知道下一步该做什么。

## 1. 竞品证据与可迁移模式

### 1.1 任务详情：主体清晰，属性靠近但不抢眼

Todoist 的任务视图把标题、描述、子任务和评论置于主区域；项目、日期、优先级、标签、提醒等属性则在右侧逐项操作。它说明“一个任务内完成编辑”是合理的，但没有要求把所有字段平铺成一张长表单。[Todoist：任务视图](https://www.todoist.com/help/articles/use-the-task-view-to-manage-tasks-in-todoist-eDeRDO0C)

Sunsama 的添加任务窗口也采用底部属性操作和指令输入，而不是强迫用户先填写完整表单；需要立即深入编辑时才打开任务本身。[Sunsama：创建任务](https://help.sunsama.com/docs/usage-guides/tasks/creating-tasks/)

Things 在 2025 年的 Mac 更新中明确提到：提高窗口、任务、对话框和控件的圆角，并增加更放松的间距。这是成熟个人效率工具对“低压视觉密度”的明确选择，而非单纯装饰。[Things for Mac 更新记录](https://culturedcode.com/things/support/articles/1100684/)

**对 PerfectPlan 的判断**：当前详情页的根本问题不是“字段太多”，而是所有字段都以接近的视觉权重、相近的边框和相近的展开程度同时出现。应把它重构为：

1. 顶部：完成状态、可直接编辑的标题、项目路径和关闭/更多菜单；
2. 第一组“安排”：计划日期、具体时间、时长、截止日，以摘要行呈现，点击后局部展开；
3. 第二组“归属”：项目、标签、优先级，使用紧凑的彩色 token/选择控件；
4. 第三组“补充”：备注、子任务、重复、提醒，默认只显示已填写摘要或“添加”入口；
5. 保存优先采用就地保存/明确保存状态，危险操作放入更多菜单。

不建议直接复刻 Todoist 的右属性栏：PerfectPlan 目前的桌面窗口、单人任务密度和菜单栏便携版都更适合单列分组详情；右栏会在窄窗口和便携详情中再次制造拥挤。

### 1.2 快速捕捉：输入先行，属性渐进补充

Things 提供不离开当前应用的 Quick Entry，并允许在快速输入里直接归档到列表、添加标签；其目标是让记录一个念头后立刻回到原工作。[Things：Quick Entry](https://culturedcode.com/things/support/articles/2249437/)

Sunsama 在创建任务时使用 `@` 日期、`~` 时长、`#` 分类、`!` 优先级等指令，并配合选择界面；Akiflow 的命令栏同样支持特殊字符和自然语言，并可由全局快捷键打开。[Sunsama：创建任务指令](https://help.sunsama.com/docs/usage-guides/tasks/creating-tasks/)；[Akiflow：Command Bar](https://product.akiflow.com/help/articles/6483573-command-bar)

Todoist 的 Quick Add 允许用户选择要展示的动作、调整顺序，甚至选择是否默认显示描述；这表明快速录入不必固定成“最简”或“全字段”二选一。[Todoist：自定义 Quick Add](https://www.todoist.com/help/todoist/features/customize-quick-add-in-todoist-eqRRlZJNN)

**对 PerfectPlan 的判断**：`标题 + #标签` 是正确的第一步，且应保留 `# 标签` 和 `#标签` 两种中文输入习惯。下一步应补充键盘选择、清晰的已选 token 和小范围快捷属性（今天、明天、项目），但不在这一阶段引入任意自然语言解析或多符号 DSL。理由是 PerfectPlan 的核心承诺是“可预期、可离线”，而不是与云端 NLP 竞争。

### 1.3 时间语义与日历：任务、日期、时间块必须分开

Things 明确把 Today、Upcoming、Anytime、Someday 作为不同的行动状态；它也明确说明开始日期不是带时长的日历安排。这个区分减少了“我哪天处理”和“我几点做”的混乱。[Things：安排待办](https://culturedcode.com/things/support/articles/2803579/)；[Things：Today / Upcoming / Anytime / Someday](https://culturedcode.com/things/support/articles/4001304/)

Todoist 的周日历把全天任务置于顶部，把有日期、时间和时长的任务放入对应时间格；Upcoming 同时提供滚动式未来任务视图和拖拽改期。这验证了 PerfectPlan 已选的月/周/日与全天区/时间网格模型。[Todoist：时间块](https://www.todoist.com/help/articles/time-blocking-in-todoist-d6Pf1uTpc)；[Todoist：Upcoming](https://www.todoist.com/help/articles/plan-your-week-with-the-upcoming-view-OKOg1mR8)

TickTick 也把未安排任务置于 Arrange Tasks 区域，供用户拖入日历；其桌面端同时提供日、周、多日时间线，说明“任务池 + 日历”是成熟且高频的桌面规划形态。[TickTick：Time Blocking Guide](https://ticktick.com/resources/article/7310204890855243776/time-blocking-guide)

Sunsama 要求任务先有计划时长，再拖到日历；之后通过调整日历工作时段来调整时长。它的关键不是复杂自动排程，而是让预计时长和可见占用一致。[Sunsama：Timeboxing](https://help.sunsama.com/docs/usage-guides/timeboxing/)；[Sunsama：调整工作时段](https://help.sunsama.com/docs/usage-guides/timeboxing/timeboxing-how-to-timebox/)

**对 PerfectPlan 的判断**：

- 保留现有 `截止日`、`计划日期`、`具体开始时间 + 时长` 的三层模型，并用文案和视觉严格区分；这比统一成一个“日期”字段更可靠。
- 周/日历中继续保留未排期任务池，默认不隐藏；允许用户在宽屏时拖动宽度或暂时收起，不能把它永久塞进二级入口。
- 拖入空白格时以已有预计时长为准；没有时长则以 60 分钟创建，落点按 30 分钟对齐。拖动预览必须按完整时长显示，原位置半透明退让，不能用单格高亮冒充结果。
- 冲突不阻断，不挤压至看不见文字。采用并排可读卡片；当宽度不足时堆叠为“第一项 + N 项”，点击展开该时段的小列表。这个方案与 Akiflow 对同一时间任务自动成组为 Slot 的做法方向一致，但 PerfectPlan 暂不引入新的 Slot 数据模型。[Akiflow：Time Slots](https://product.akiflow.com/articles/3089241-time-slots)

### 1.4 今日与工作量：给决策辅助，不替用户做决定

Sunsama 的每日规划是一个明确流程：回看昨日、把任务加入今天、根据预计时长核对工作量、安排顺序和时间块。它在超载时给出延期或回到 backlog 的选择，而非静默替用户移动任务。[Sunsama：Daily Planning](https://help.sunsama.com/docs/usage-guides/daily-planning/)

Things 的 Today 与 Upcoming 则采取更轻量的模式：Today 只呈现当天希望开始的任务，Upcoming 的前七天分日展示，并可通过拖拽改期。[Things：日期列表](https://culturedcode.com/things/support/articles/4001304/)

**对 PerfectPlan 的判断**：保留目前“今日重点、计划、逾期、已完成”的数据能力，但把页面阅读顺序改为行动顺序：先显示“现在值得做什么”，再显示“今天还安排了什么”，最后才是逾期与完成记录。工作量提示应只在用户设置可用时段后出现，并给出“改到明天 / 继续保留”的明确选择；不做 Sunsama 式强制引导或自动滚动任务。

### 1.5 标签、项目、搜索：标签应是浏览入口，不只是编辑字段

Things 允许在列表顶部以标签过滤，并支持多标签组合；其说明中特别强调只显示当前列表实际使用的标签，避免筛选器本身制造噪音。[Things：使用标签](https://culturedcode.com/things/support/articles/2803581/)；[Things：优先级与标签](https://culturedcode.com/things/support/articles/3289315/)

Todoist 将项目、标签与筛选作为可独立访问的对象，筛选可按任务名、日期、项目、标签、优先级等组合；TickTick 也把标签、清单与筛选作为独立检索维度。[Todoist：筛选](https://www.todoist.com/help/articles/introduction-to-filters-V98wIH)；[TickTick：功能概览](https://www.ticktick.com/features)

**对 PerfectPlan 的判断**：任务行已开始展示彩色标签，下一步不要把筛选条扩成长期占据高度的“控件墙”。默认仅显示当前结果集实际用到的常用标签，其他筛选收进“筛选”按钮；选中后在页面标题下以一个可关闭的条件 token 明示范围。项目页则应优先回答“这个项目下一步做什么”，标签页优先回答“哪些任务同属这个语境”，而不是只提供管理表格。

### 1.6 菜单栏：低打扰的快速闭环，不是缩小主应用

Sunsama 的 macOS 菜单栏展示今日任务和即将到来的日历事件，并允许暂停、休息、参会、完成任务等高频动作；Windows/Linux 则退化为托盘菜单。[Sunsama：Menu Bar](https://help.sunsama.com/docs/usage-guides/menu-bar/)

Akiflow 的菜单栏同样首先展示当前/即将开始事项，并支持完成、打开日历和设置，任务颜色会和日历中的项目色保持一致。[Akiflow：Menu Bar](https://product.akiflow.com/help/articles/4927965-menu-bar)

**对 PerfectPlan 的判断**：用户提出的“详情在旁边打开、不唤起主窗口”是正确方向，也是与这两款产品相比可以做得更完整的点。便携版只承载：今天、添加、完成、改期、任务详情；不塞入项目管理、复杂筛选、日历整页。视觉上必须与主窗口共用同一套任务行、标签和按钮组件，且在 macOS 使用透明窗口时只保留圆角内容面板，避免系统窗口背景/阴影露出直角。

## 2. 不照搬的部分

| 竞品做法                                                | 为什么不直接采用                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| TickTick 的习惯、专注、统计、清单/看板/时间线等大量模块 | 会把离线个人计划的核心工作流稀释，也会显著增加导航和设置复杂度。                               |
| Todoist 的项目树、团队/成员/评论/附件能力               | PerfectPlan 当前定位是单人本地应用；这些能力会把详情页变得更像协作系统。                       |
| Sunsama 的外部日历/任务源整合和自动滚动                 | 依赖账号、联网和复杂权限，与当前 MVP 边界冲突。可学习它的决策辅助，不复制底层生态。            |
| Akiflow 的多符号命令语言与 Time Slot 新实体             | 对高阶用户很高效，但学习成本高。PerfectPlan 已选择 `#标签`，应先把一条语法做清楚。             |
| Things 的非时间块安排模型                               | PerfectPlan 已具备半小时日历与时长；应保留该差异化能力，但借鉴其“日期不等于时间块”的清晰表达。 |

## 3. 重新确定的实施路线

### 第 0 批：体验样板与设计系统（先做，不发布为孤立视觉改版）

**目标**：用任务详情与任务行作为样板，先确认视觉语言，再在其他页面复用。

- 定义排版、间距、层级、表面、圆角、阴影、动画和焦点状态的 token。
- 只产出必要的基础组件：按钮、图标按钮、输入、token/标签、选择器、日期/时间选择、浮层、确认/撤销反馈。
- 将任务行与详情页的草图/实现作为首个真实验收面；在真实任务数据与浅/深色、窄窗口中走查。

**验收**：普通容器不再靠厚边框和阴影分组；用户在任务详情中一眼看出标题、计划与补充信息的先后；所有新组件可在主窗口和便携版复用。

### 第 1 批：捕捉、任务详情与任务列表（第一个完整闭环）

**目标**：把最高频“写下 → 补充 → 完成/改期”的体验做轻。

- 快速添加默认只显示标题，支持 `#标签` 选择和可发现的项目/今天/明天快捷项；保留 Enter 连续创建。
- 实现上述三组式详情页，移除不必要的外框；日期、时间、时长形成一处安排体验。
- 重做任务行：标题最优先，时间、项目、彩色标签为紧凑且可点击的第二层；危险动作移入更多菜单。
- 完成、删除、保存、失败的反馈在任务附近可见，支持撤销。

**验收**：创建一项带标签、项目与计划时间的任务不需要长表单；打开详情不需要先滚动就可编辑最常用信息；任务行可以在不打开详情的情况下判断其归属和时间。

### 第 2 批：今日、收集箱、即将到来与标签/项目浏览

**目标**：让用户每日选择和整理任务时保持清晰，而不是面对多个相似列表。

- 收集箱突出捕捉与待整理；将复杂筛选收为一个入口，活跃标签就地展示。
- 今日按行动顺序呈现重点、已安排、待处理、逾期、已完成；可选轻量工作量提示。
- 即将到来突出所选日期、任务量与跨日期移动；默认以今天或首个有任务日作为焦点。
- 项目和标签改为“任务浏览入口 + 轻管理”，显示数量、下一项、进度和明确的筛选状态。

**验收**：用户两分钟内能完成三件任务的捕捉、选出今日重点、改期一项任务，并在项目或标签中重新找到它。

### 第 3 批：日历与时间块

**目标**：让日历真正服务于执行安排。

- 持续显示可安排任务池，可拖动调整宽度；月/周/日的头部、导航、筛选和“今天”统一。
- 完整时长拖拽预览、半小时对齐、原位退让、自动滚动；任务块内保留标题和时间。
- 优化完成态、全天态、截止态和冲突态；冲突块使用并排/堆叠展开，绝不把标题压没。
- 提供“安排到…”、撤销和键盘替代路径，与拖拽的结果完全等价。

**验收**：拖入位置、预览、最终时长一致；并发任务均可读可点；完成任务仍留在日历且不会干扰未完成任务扫描。

### 第 4 批：菜单栏便携工作台与全产品收尾

**目标**：让主窗口隐藏后依然能完成常见操作，并以跨平台质量完成产品化。

- 便携面板展示现在/接下来/今日任务，沿用任务行和标签视觉；支持新建、完成、改期和相邻详情。
- 主窗口与便携版共享交互组件和状态反馈；macOS 圆角/透明窗口使用原生窗口属性根治背景矩形问题。
- 完成浅/深主题、键盘、辅助功能、高 DPI、macOS/Windows 关闭与后台驻留的回归测试。

**验收**：不打开主窗口即可完成一项今日任务的创建、查看、改期和完成；每个窗口在目标系统上都没有视觉背景泄漏或不可点击控件。

## 4. 决策记录

| 决策             | 结论                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------- |
| 第一批从哪里开始 | 先做“任务详情 + 任务行 + 快速添加”的完整样板闭环，而不是单独全局换色。                   |
| `#` 的语义       | 固定为标签；输入时出现已有标签候选，选择后形成 token，保存时关联。暂不引入更多同级符号。 |
| 时间安排         | 计划日期与日历时间块保持不同字段/视觉；拖入默认使用预计时长，没有时长用 60 分钟。        |
| 完成任务         | 保留在当天/日历的已完成区域或完成态中，不从用户视线中突然消失。                          |
| 菜单栏           | 作为低打扰的便携工作台，不作为主窗口的缩小复制品。                                       |
| 不做什么         | 本轮不新增同步、外部日历、AI/NLP、番茄钟、习惯、团队协作。                               |

## 5. 研究限制与停止理由

本研究以官方帮助中心、产品功能页和更新记录为主要证据，因此能可靠描述产品公开能力与交互意图，但不能替代对每个版本、不同平台和付费层级的实际交互测试。涉及外部日历、同步、协作和付费限制的做法没有作为 PerfectPlan 的推荐前提。

检索在任务详情、快速输入、日历时间块、每日规划、标签筛选和菜单栏六项核心决策均获得多个一手来源，后续重复搜索预计不会改变上述离线个人工具的取舍，因此停止扩展检索。

## 来源台账

| 主题               | 来源                                                                                                                                                                                        | 发布者                 | 访问说明                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------- |
| 任务详情           | [Use the task view to manage tasks](https://www.todoist.com/help/articles/use-the-task-view-to-manage-tasks-in-todoist-eDeRDO0C)                                                            | Todoist                | 官方帮助中心；2026-08-14 更新页。 |
| 快速添加配置       | [Customize Quick Add](https://www.todoist.com/help/todoist/features/customize-quick-add-in-todoist-eqRRlZJNN)                                                                               | Todoist                | 官方帮助中心；2026-08-28 更新页。 |
| 日历/Upcoming      | [Time blocking](https://www.todoist.com/help/articles/time-blocking-in-todoist-d6Pf1uTpc)、[Upcoming](https://www.todoist.com/help/articles/plan-your-week-with-the-upcoming-view-OKOg1mR8) | Todoist                | 官方帮助中心；2026-08 更新页。    |
| 详情标签与快速查找 | [Using Tags](https://culturedcode.com/things/support/articles/2803581/)、[Quick Find](https://culturedcode.com/things/support/articles/2803584/)                                            | Cultured Code / Things | 官方支持文档。                    |
| 快速录入与时间语义 | [Quick Entry](https://culturedcode.com/things/support/articles/2249437/)、[Scheduling](https://culturedcode.com/things/support/articles/2803579/)                                           | Cultured Code / Things | 官方支持文档。                    |
| 视觉密度           | [Mac Release Notes](https://culturedcode.com/things/support/articles/1100684/)                                                                                                              | Cultured Code / Things | 官方更新记录。                    |
| 每日规划与时间块   | [Daily Planning](https://help.sunsama.com/docs/usage-guides/daily-planning/)、[Timeboxing](https://help.sunsama.com/docs/usage-guides/timeboxing/)                                          | Sunsama                | 官方用户手册。                    |
| 菜单栏             | [Menu Bar](https://help.sunsama.com/docs/usage-guides/menu-bar/)                                                                                                                            | Sunsama                | 官方用户手册。                    |
| 命令栏与菜单栏     | [Command Bar](https://product.akiflow.com/help/articles/6483573-command-bar)、[Menu Bar](https://product.akiflow.com/help/articles/4927965-menu-bar)                                        | Akiflow                | 官方帮助中心。                    |
| 时间块/冲突分组    | [Time Slots](https://product.akiflow.com/articles/3089241-time-slots)                                                                                                                       | Akiflow                | 官方帮助中心。                    |
| 任务池与日历       | [Time Blocking Guide](https://ticktick.com/resources/article/7310204890855243776/time-blocking-guide)                                                                                       | TickTick               | 官方资源页。                      |
| 标签/筛选能力      | [Features](https://www.ticktick.com/features)、[Changelog](https://ticktick.com/public/changelog/en.html)                                                                                   | TickTick               | 官方产品页与更新记录。            |
