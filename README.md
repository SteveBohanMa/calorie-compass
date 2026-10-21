<div align="center">

![燃卡快查 · Calorie Compass](docs/readme/intro.png)

# 燃卡快查 · Calorie Compass

**离线饮食查询、训练消耗估算与每周计划工具**  
把每一口和每一次训练，记录得更清楚。

[![version](https://img.shields.io/badge/version-v2.7-238966?style=flat-square)](package.json)
[![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![platform](https://img.shields.io/badge/platform-Windows%20x64-0078D4?style=flat-square&logo=windows11&logoColor=white)](#quick-start)
[![license](https://img.shields.io/badge/license-MIT-175C4B?style=flat-square)](LICENSE)

[🎬 查看 Demo](#demo) · [🖼️ 功能截图](#screenshots) · [✨ 功能一览](#features) · [🚀 快速开始](#quick-start) · [⚠️ 数据说明](#data-disclaimer)

</div>

---

<a id="data-disclaimer"></a>

## ⚠️ 营养数据免责声明

> [!WARNING]
> 内置的食物热量和营养成分来自 USDA FoodData Central 与日本食品标准成分表（八订）增补2023，其中一部分是按相近做法或简单配方推算的估算值（每条都标有可信等级 A/B/C）；份量和训练消耗也是估算。同一种食物的品种、做法和品牌不同，实际数值会有出入；具体产品请以包装标签为准。
>
> **请勿将本项目中的数据用于医疗诊断、疾病管理、专业营养方案、精确减重决策或其他需要高准确度的用途。** 实际饮食与训练决策应以食品标签、可信数据库以及医生或注册营养专业人士的建议为准。

当前版本为 **v2.7**。

v2.6 起遵循“不显示比显示错的好”。v2.7 完成第一批数据重建：目录里的 123 种食物全部换成可追溯的来源数据，并补回蛋白质、碳水、脂肪和纤维；关东煮扩充到 27 种。来源和核对方法见 [数据来源](#data-sources)。

---

<a id="demo"></a>

## 🎬 Demo · 动态演示

<div align="center">

![燃卡快查功能演示](docs/readme/demo.gif)

<sub>真实应用界面自动生成：主页 → 热量快查 → 训练估算 → 每周计划 → 单位换算 → 热量对比</sub>

</div>

---

<a id="screenshots"></a>

## 🖼️ 功能截图 · Screenshots

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/readme/home.png" alt="燃卡快查首页" width="100%" />
      <br /><strong>首页</strong><br />核心功能一目了然
    </td>
    <td align="center" width="33%">
      <img src="docs/readme/lookup.png" alt="食物热量快查" width="100%" />
      <br /><strong>热量快查</strong><br />按场景浏览离线食物目录
    </td>
    <td align="center" width="33%">
      <img src="docs/readme/workout.png" alt="训练消耗估算" width="100%" />
      <br /><strong>训练估算</strong><br />使用训练参数估算消耗区间
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <img src="docs/readme/plan.png" alt="每周饮食与训练计划" width="100%" />
      <br /><strong>每周计划与周报</strong><br />编辑计划并导出 PNG 周报
    </td>
    <td align="center" width="33%">
      <img src="docs/readme/converter.png" alt="热量单位换算" width="100%" />
      <br /><strong>单位换算</strong><br />kcal 与 kJ 双向换算
    </td>
    <td align="center" width="33%">
      <img src="docs/readme/compare.png" alt="食物热量对比" width="100%" />
      <br /><strong>热量对比</strong><br />统一按每 100 克直观比较
    </td>
  </tr>
</table>

---

<a id="features"></a>

## ✨ 功能一览 · Features

| 功能 | 说明 |
| --- | --- |
| 🔍 热量快查 | 按烹饪方式、便利店食品和营养来源浏览离线食物目录 |
| 🥗 营养详情 | 每 100 克与常见一份的热量、千焦、蛋白质、碳水、脂肪、纤维，以及来源、可信等级和注意事项 |
| ⚖️ 热量对比 | 将目录食物与自定义菜品统一到每 100 克进行可视化比较 |
| 📝 我的数据 | 添加、编辑和删除自定义菜品，并可导出 / 导入数据备份 |
| 🏋️ 训练估算 | 根据动作、体重、组数、次数、负重、时长、休息、RPE 与心率估算消耗区间 |
| 📅 每周计划 | 按天编辑饮食与训练计划，分别汇总摄入和训练消耗 |
| 📊 周报导出 | 生成包含七天计划和汇总数据的 PNG 周报 |
| 🔄 单位换算 | 支持 kcal 与 kJ 双向换算 |
| 🌏 双语界面 | 中文与英文界面一键切换 |
| 📴 本地优先 | 核心目录与图片随应用打包，无账号、无云端依赖 |

---

## 🌿 项目特点

- **离线可用**：核心食物目录、图片和计算逻辑随软件一起打包。
- **饮食与训练分开记录**：不使用“运动抵消饮食”的表达，也不自动计算热量缺口。
- **本地数据**：自定义菜品、对比选择和周计划保存在本机，重启和升级后保留，也可以导出成备份文件。
- **桌面便携版**：Electron 构建的 Windows x64 便携应用，无需安装。
- **可继续扩展**：React + TypeScript 代码结构，便于继续补充数据来源和功能。

## 🧰 技术栈

- React 19
- TypeScript 7
- Vite 8
- Electron 43
- Playwright
- Radix UI Icons

<a id="quick-start"></a>

## 🚀 快速开始

环境要求：Node.js 20 或更高版本、npm。

```bash
git clone https://github.com/SteveBohanMa/calorie-compass.git
cd calorie-compass
npm ci
npm run dev
```

启动桌面应用：

```bash
npm run desktop:run
```

构建 Windows x64 便携版：

```bash
npm run desktop:dist
```

构建产物将生成在 `release-v2.7/`。该目录不会提交到 Git 仓库，可执行文件应通过 GitHub Releases 发布。更多说明见 [README-EXE.md](README-EXE.md)。

## ✅ 检查与测试

```bash
npm test               # 运行时完整性、数据校验、Sites 与 Playwright 页面测试
npm run test:desktop   # 构建后启动 Electron：重启后数据保留、协议安全、启动无报错
```

也可以单独运行 `npm run check:runtime`、`npm run test:data`、`npm run test:sites`、`npm run test:runtime`。

首次运行 Playwright 测试前，需要安装对应浏览器：

```bash
npx playwright install chromium
```

README 展示素材可以通过真实 Electron 界面重新生成：

```bash
npm run build
npx electron . --verify-output=verification-readme-v25
python scripts/generate-readme-assets.py
```

## 📁 项目结构

```text
desktop/       Electron 主进程与预加载脚本
docs/readme/   README 的 Intro、Demo 与功能截图
public/        随应用打包的本地图片和静态资源
data-sources/  营养数据源清单、来源核对表与待补清单（原始文件不进 Git）
scripts/       数据、资源、构建与 README 素材脚本（营养数据流水线在 scripts/nutrition/）
src/           React 应用、目录数据与业务逻辑
tests/         Playwright 与 Sites 测试
worker/        静态站点路由 Worker
```

<a id="data-sources"></a>

## 🗺️ 数据来源

| 来源 | 用途 | 许可 |
| --- | --- | --- |
| [USDA FoodData Central](https://fdc.nal.usda.gov/)（SR Legacy、Foundation Foods） | 肉蛋鱼虾、主食、蔬果、坚果，以及同一食材的不同做法 | 公共领域（CC0） |
| [日本食品標準成分表（八訂）増補2023年](https://www.mext.go.jp/a_menu/syokuhinseibun/index.htm) | 关东煮食材，以及日本表有实测熟制值的条目 | 文部科学省允许自由使用，需注明出处 |

每条记录都写明来源数据库和条目编号（FDC ID 或食品番号）。可信等级：

- **A**：来源里直接有这种做法的熟制值；
- **B**：用相近做法近似，或用已核实的食材按简单配方推算；
- **C**：各家产品差别大（便利店饭团、便当、鱼糜制品等），只给典型值，以包装为准。

数据由脚本生成，不手抄数字：

```bash
fetch-nutrition-sources.cmd                    # Windows 双击，或 node scripts/fetch-nutrition-sources.mjs
python scripts/nutrition/build_catalog.py      # 按 scripts/nutrition/catalog_spec.py 生成 src/foods.json
npm run test:data                              # 结构、来源、营养素与热量一致性检查
```

`data-sources/source-values.json` 记录每个数值对应的来源条目和交叉核对结果；`data-sources/pending.csv` 是还在等数据的食物（等中国食物成分表，或等包装标签）。等数据的记录标记为 `"DataStatus": "pending"`，不会在应用中显示。

欢迎针对软件功能、界面、可访问性和工程实现提交 Issue 或 Pull Request。涉及营养数据的修改，请同时提供可核查的数据来源。

## 🔒 隐私

应用不要求注册账号。自定义菜品、对比选择和周计划保存在用户本机，项目本身不提供云端同步服务；需要换电脑时，可在“我的数据”中导出备份文件再导入。

## 📄 许可

项目代码采用 [MIT License](LICENSE)。仓库中的第三方字体、图标和图片仍分别受其原始许可约束；食物图片来源记录位于 `public/assets/food/ATTRIBUTION*.md`，新增关东煮条目的图标来自 Noto Emoji（Apache License 2.0）。

营养数据：USDA FoodData Central（公共领域）；日本食品標準成分表（八訂）増補2023年から引用（文部科学省）。

---

本项目按“现状”提供，不附带任何形式的准确性、适用性或特定用途保证。
