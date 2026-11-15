# 图标标准 · DSH 插件

让"设计一个图标"一次就符合三端规范：知识（skill）+ 精确数值（blueprint）+ 统一出图（render）+ 逐像素验收（audit）。

标准来源：`../pig/design/icon/README.md`（三端各存一份，内容一致），以及最近三次图标修正提交
`8a65aca` / `a1854e4` / `f3a8479`（Web）、`d9368f4` / `ae7da25`（Android）、`0fbf4f1`（Harmony）。

## 提供什么

| 能力 | 作用 |
| --- | --- |
| skill `icon-design-standard` | 品牌色、母版几何、三端尺寸与安全区、验收清单、11 条已踩过的坑 |
| tool `icon_blueprint` | 该端精确数值（画布 / 圆盘 / 星环 / 朱印位置 / 验收带宽）+ 合规 SVG 配方 |
| tool `icon_render` | 从 SVG 出全部尺寸 PNG；`scaffold: true` 先写入合规 SVG 源 |
| tool `icon_audit` | 逐像素 + 接线验收，失败项直接给出"该改成的数字" |
| prompt section | 一句常驻提醒：图标任务先加载技能、出图后必须 audit 全绿 |

## 为什么不会再犯同样的错

`icon_audit` 的失败项就是标准里那张"坑表"的反面，每条都带症状与做法：

- 资源自带圆角 / 透明四角 → 四角 alpha 检查
- 朱印贴边 → 朱印外沿（≤90%）与 maskable 最远点（≤80% 半径）检查
- 安卓按 108dp 画布设计 → 内容半径 ≤ 33dp 安全检查
- 鸿蒙只放大不缩位置 → 内容距四边 ≥10% 检查
- 删掉朱印 → 右下安全区朱砂像素密度 ≥0.5% 检查
- favicon 标签残留片段 → data URI 编码 + head 游离标签检查
- `assets/` 当静态目录 → manifest / 页面引用检查
- 启动底色不一致 → `start_window_background` / `ic_launcher_background` / 四角像素三方比对

## 安装

从 GitHub（public，无需凭据）：

```
plugin_manager { action: "install_bundle", target: "github:luminsw/qihuang-icon-standard" }
```

本机开发用本地目录：

```
plugin_manager { action: "install_bundle", target: "C:/Users/lumin/game/dsh-plugins/icon-standard" }
```

安装后插件行 id 为 `icon-standard`，可随时 `set_plugin` 停用。也可以直接装聚合包
[luminsw/dsh-plugins](https://github.com/luminsw/dsh-plugins)，一次装齐六个插件。

## 用法

```
icon_blueprint { platform: "android" }                     # 先看数值
icon_render    { platform: "android", scaffold: true }     # 写 SVG + 出五档 PNG
icon_audit     { platform: "android" }                     # 必须 ok=true
icon_audit     { }                                         # 自动探测工程里的三端
```

## 自测

```
node selftest.mjs
```

28 项断言：生成器产出的 SVG 落在各自带宽内、scaffold 后的工程能通过自己的审校、8 类缺陷都能被抓住、
三个真实仓库保持全绿、`apply()` 注册的工具 schema 能通过 harness 投影。

> 已知事故：初版把 `required: true` 写进了属性定义（JSON Schema 里 `required` 在属性上必须是数组），
> 工具注册时抛错拖垮了会话。E 段就是为这个失败模式补的回归断言。

## 维护

- 改品牌色 / 几何 / 尺寸带宽 → `lib/spec.js`
- 改 SVG 构图 → `lib/svg.js`（母版 1024 坐标，其余端由它换算）
- 改测量口径 → `lib/image.js`
- 改验收规则或接线检查 → `lib/audit.js`
- 改标准正文 → `assets/icon-design-standard.md`

改完先跑 `node selftest.mjs`，再去三个仓库跑 `icon_audit` 确认没有把既有资产判红。
