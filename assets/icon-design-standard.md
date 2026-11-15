# 岐黄万里 · 图标设计标准（三端）

设计、修改、审校任何图标资源前读这一份。目标是**一次就过**：按下面的数值作图，不需要返工。

配套工具：

| 工具 | 用途 |
| --- | --- |
| `icon_blueprint` | 取该端的精确几何数值 + 可直接落盘的合规 SVG |
| `icon_render` | 从 SVG 出全部尺寸 PNG（不要手改 PNG） |
| `icon_audit` | 逐像素验收；提交前必须全绿 |

---

## 1. 品牌资产（三端共用，不可改）

| 色 | 值 | 用途 |
| --- | --- | --- |
| 墨绿 | `#1d2a24` | 图标底色、启动页底色 |
| 深林 | `#2f4a3b` | 前景山形 |
| 宣纸 | `#f3e8d2` | 圆盘底色 |
| 朱砂 | `#a8332a` | 红日、脉线、「岐」印 |
| 赭金 | `#c99a3a` | 星环、脉线高光 |

背景渐变（满版）：`#2b4435` → `#1d2a24`（55%）→ `#131c17`。
圆盘渐变：`#f6ead2` → `#efe1c7`（72%）→ `#e5d3b3`。

构图元素：宣纸圆盘（主视觉，居中）、朱砂红日、层叠远山、近山、金色脉线、药苗、朱砂「岐」印、金色细环 + 12 星点。

硬性要求：

- 不拉伸、不改色、不换字形；朱印文字固定为「岐」
- 前景层只放徽记、必须透明；背景层必须满版、必须不透明
- **资源本身不带圆角、不带外阴影、不带描边外壳**——圆角与遮罩一律交给系统生成（Web 的 favicon 与 `any` 图标是唯一例外）
- 朱印不可删除（favicon 除外），且必须完整落在安全区内

---

## 2. 母版几何（1024 坐标系，所有端都由它换算）

| 元素 | 数值 | 占比 |
| --- | --- | --- |
| 画布 / 中心 | 1024 / 512 | — |
| 宣纸圆盘 | `cx=512 cy=512 r=306`（直径 612） | 59.77% |
| 金色星环 | `r=368` | 71.88% |
| 星点 | 半径 350，12 个，间隔 30°，起点 -90° | 350/368 |
| 朱印 | `translate(688 688)`，150×150，`rx=9` | 外沿 838 = 81.84% |
| 朱印对角半径 | √2×326 ≈ 461.0 | 90.04% 半画布 |

换算到各端（**先缩放，再按安全区检查**）：

| 端 | 画布 | 圆盘直径 | 缩放 / 定位 |
| --- | --- | --- | --- |
| Web any / 鸿蒙 app_icon、startIcon | 1024 | 612 | 1:1 |
| Web maskable | 1024 | 538.6（52.6%） | 整体 `scale(.88)` |
| 鸿蒙前景层 | 1024 | 660（64.45%） | 整体 `scale(1.07843)` |
| 安卓前景层 | 108dp | 46.4dp | 场景组 `scale(.075817)`，圆盘 `r=23.2`，环 `r=27.9`，朱印 `translate(65.5 65.5) scale(.076)` |

鸿蒙前景层放大时，**朱印外沿固定在 838 不动**：`translate(838-150×k)`，`k=1.07843` → `translate(676.24)`。只放大、不外移，才不会顶出 10% 边距。

---

## 3. 三端规格

### HarmonyOS

| 文件 | 尺寸 | 要求 |
| --- | --- | --- |
| `AppScope/resources/base/media/app_icon.png` | 1024² | 满版、直角、无透明像素 |
| `entry/src/main/resources/base/media/foreground.png` | 1024² | 透明底，仅徽记，居中 |
| `entry/src/main/resources/base/media/background.png` | 1024² | 满版不透明，墨绿渐变 |
| `entry/src/main/resources/base/media/startIcon.png` | 1024² | 满版，底板 `#1d2a24` |

- 圆盘直径 60%–64%（当前 64.45%），朱印外角距四边 ≥10%，星环 ≤ 画布 90%
- 启动页底色 = `start_window_background` = `#1d2a24`，与 `startIcon` 底板同色
- 接线：`module.json5` 的 `abilities[].icon = $media:layered_image`、`startWindowIcon = $media:startIcon`、`startWindowBackground = $color:start_window_background`；`layered_image.json` 指向 `$media:background` + `$media:foreground`；`app.json5` 的 `icon = $media:app_icon`

### Android

| 目录 | 像素 |
| --- | --- |
| `mipmap-mdpi` | 108 |
| `mipmap-hdpi` | 162 |
| `mipmap-xhdpi` | 216 |
| `mipmap-xxhdpi` | 324 |
| `mipmap-xxxhdpi` | 432 |

- 画布 108dp；中心 72dp 为系统遮罩可见区，中心 66dp（半径 33dp）为安全圆
- **所有可见内容半径 ≤ 33dp**（含朱印最远点）；不要按 108dp 占比设计
- 主体按可见区换算：圆盘 46.4dp（64.5% 可见区）、星环 55.8dp（77.5%）、朱印边长 11.4dp
- 前景层透明，背景层 `@color/ic_launcher_background` = `#1D2A24` 且不透明
- `minSdk 26` 只需 `mipmap-anydpi-v26/ic_launcher.xml` 与 `ic_launcher_round.xml`，不留旧版单层 PNG
- `windowBackground` / `windowSplashScreenBackground` 与图标底色同为 `#1D2A24`

### Web 与 PWA

| 文件 | 尺寸 | 要求 |
| --- | --- | --- |
| `index.html` 内嵌 favicon | —— | 简化 SVG，完整闭合，无朱印 |
| `public/favicon-32.png` | 32² | PNG 回退，允许透明四角 |
| `public/apple-touch-icon.png` | 180² | 满版不透明（iOS 自动加圆角） |
| `public/icon-192.png` | 192² | 满版不透明 |
| `public/icon-512.png` | 512² | 满版不透明 |
| `public/maskable-512.png` | 512² | 主体在中心 80% 圆内 |
| `public/site.webmanifest` | —— | 名称、主题色、背景色、图标声明 |

- favicon 的 `<link>` 必须完整闭合；**data URI 用 base64 或百分号编码**，href 里不得残留裸 `<` `>` `#`，否则浏览器提前结束标签，页面顶部会多出一个「岐」字
- iOS 不识别 SVG favicon：必须给 180² `apple-touch-icon`，且不得有透明像素
- 普通图标（any）满版不透明；`maskable-512` 主体全部落在中心 80% 直径（半径 40%）内
- **图标放 `public/`**，Vite 才会复制进 `dist/`；`assets/` 不进构建产物，直接外链必 404
- `theme-color` 宣纸 `#e9dfc9`（页面与 manifest 一致）；manifest `background_color` 墨绿 `#1d2a24`
- PNG 一律由渲染脚本从 `assets/*.svg` 生成，不手改

---

## 4. 标准工作流

1. `icon_blueprint { platform }`：拿该端数值与合规 SVG；新项目让 `icon_render { platform, scaffold: true }` 一次写入源文件与全部 PNG
2. 只改 SVG 源（`assets/logo-*.svg` 或 `design/icon/*.svg`），**不直接改 PNG**
3. `icon_render { platform }` 重出全部尺寸
4. `icon_audit { platform }`：必须 `ok=true`；有 `fail` 就按提示改数值再来
5. 构建产物（`npm run build` / HAP / APK），确认打包内的图标数量与尺寸
6. 在圆形、圆角方形遮罩下目视确认朱印与圆盘完整无裁切

`icon_audit` 的度量口径：圆盘直径用 360 条射线的中位数（朱印、山形遮挡不影响）；朱印用朱砂像素的最远点与外沿；金环用赭金像素的最远点；前景层的内容半径与四边距用 alpha 掩膜。

---

## 5. 验收清单

- [ ] 尺寸符合对应平台规范，五档密度齐全
- [ ] 前景透明、背景不透明，四角 alpha 正确
- [ ] 资源无自带圆角、无阴影（Web favicon / any 例外）
- [ ] 圆盘居中且直径在带宽内
- [ ] 朱印存在、完整落在安全区
- [ ] 金环与星点未越界
- [ ] 启动页底色与图标底色一致
- [ ] SVG 源与渲染脚本已入库
- [ ] favicon 标签完整闭合，无残留片段
- [ ] `apple-touch-icon` 满版不透明
- [ ] manifest 声明 192/512/maskable，`theme_color` 与页面一致
- [ ] 图标位于 `public/`，构建后进 `dist/`
- [ ] `icon_audit` 全绿，构建通过

---

## 6. 已踩过的坑

| 问题 | 后果 | 正确做法 |
| --- | --- | --- |
| 鸿蒙用 288/144 小图 | 上架不合规、高分屏发虚 | 一律 1024² |
| `app_icon` 自带圆角与透明四角 | 系统二次遮罩出现黑角/缝隙 | 满版直角、背景不透明 |
| 朱印贴右下角 | 圆形遮罩下被裁 | 收进安全圆（安卓 33dp、鸿蒙距边 ≥10%、maskable 80%） |
| 启动图标与启动窗口不同色 | 启动页出现色块边界 | 两处统一 `#1d2a24` |
| 只提交 PNG 不留源文件 | 无法复现、无法批量改尺寸 | SVG + 渲染脚本一起入库 |
| 前景内容按画布满铺 | 遮罩后边缘元素丢失 | 按安全区设计，主体约画布 60% |
| 安卓按 108dp 占比设计 | 真机可见区只有 72dp，边缘局促 | 按 72dp 可见区换算，圆盘 46.4dp |
| favicon 标签后残留 SVG 片段 | HTML 无效，页面顶部多出「岐」字 | 标签单行闭合；data URI 用 base64/百分号编码 |
| 把 `assets/` 当静态目录 | 构建后图标 404 | 放 `public/` |
| 透明四角用于 apple-touch / any | iOS、Android 主屏出现黑角 | 满版不透明 |
| 主徽记直接当 maskable | 朱印被圆形遮罩裁掉 | 用 maskable 版本，整体缩到 80% 圆内 |
| 鸿蒙前景层只放大不缩朱印 | 朱印顶出 10% 边距 | 朱印外沿固定在 838，`translate(838-150k)` |

---

## 7. 何时不需要这么严格

- favicon：可带圆角、允许透明四角、可去掉朱印，保证 16–64px 可读即可
- 商店图、宣传图、文档页眉：用 `logo-wordmark*`，不受图标安全区约束
- 一旦素材会被系统加遮罩（启动器、PWA、通知栏），就必须回到上面的规格
