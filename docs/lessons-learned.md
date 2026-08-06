# HK Transit AI — Lessons Learned

本文档记录项目开发过程中遇到的重大技术难题、排查过程与最终方案。供后续接手开发者参考，避免重复踩坑。

---

## 目录

1. [API 数据层](#1-api-数据层)
2. [GitHub Pages 部署](#2-github-pages-部署)
3. [Web 兼容性](#3-web-兼容性)
4. [多模式路线规划](#4-多模式路线规划)
5. [性能优化](#5-性能优化)
6. [手机端适配](#6-手机端适配)
7. [开发流程](#7-开发流程)

---

## 1. API 数据层

### 1.1 KMB 方向参数格式 (422 Invalid direction)

**现象**：调用 `data.etabus.gov.hk` 的 `/route-stop/{route}/{direction}/{serviceType}` 返回 `422 Invalid direction`。

**排查**：以为方向参数是 `O`/`I`（API 响应数据里确实用 `O`/`I`），但 URL 路径里必须用**完整单词**。

**修复**：`O` → `outbound`，`I` → `inbound`。

```typescript
// ❌ 错误
/route-stop/1A/O/1

// ✅ 正确
/route-stop/1A/outbound/1
```

**遇到端点**：KMB `/route-stop/` 和 CTB `/route-stop/ctb/{route}/{dir}` 都适用。

**文件**：[src/services/kmbAPI.ts:73](src/services/kmbAPI.ts#L73)

---

### 1.2 Route 类型缺少 `bound` 字段

**现象**：搜索同一条路线号只显示一条结果，但实际有去程/回程两个方向。

**排查**：API 的 `/route/` 端点返回每个方向作为独立条目，但最初 `Route` 接口只含 `route`/`orig_en`/`dest_en`，**没有 `bound` 字段**。去重时按 `route` 去重，第二条方向就被丢弃了。

**修复**：给 `Route` 接口加上 `bound: 'O' | 'I'`；搜索去重改为按 `route + bound` 组合去重，两个方向各自显示为独立卡片。

**文件**：[src/services/kmbAPI.ts](src/services/kmbAPI.ts)

---

### 1.3 RouteStop 字段名不匹配：`dir` vs `bound`

**现象**：读取 `fetchAllRouteStops()` 批量数据时 TypeScript 报错 `Property 'bound' does not exist`。

**排查**：KMB 的**单路线** route-stop 端点返回字段叫 `dir`，但**全量** route-stop 端点返回字段叫 `bound` ——同一套 API 的两个端点用了不同的字段名。

**修复**：统一 `RouteStop` 类型为 `bound: 'O' | 'I'`，匹配全量端点。单路线调用方做 `dir → bound` 转换。

**文件**：[src/services/kmbAPI.ts](src/services/kmbAPI.ts) 的 `RouteStop` 接口

---

### 1.4 CTB / GMB 没有全量车站列表端点

**现象**：城巴和小巴的官方 API **不提供**一次下载全部车站列表的端点（KMB 有）。需要逐个路线/车站查询。

**修复**：编写构建时爬虫脚本 [`scripts/fetch-transit-data.js`](scripts/fetch-transit-data.js)，策略：

- **城巴**：`/route/ctb` → 获得路线列表 → 每条路线 `/route-stop/ctb/{route}/{dir}` → 收集车站 ID → 批量 `/stop/{id}`（并发 10）
- **小巴**：`/route` → 按区域分组 `/route/{region}/{code}` → 每条路线 `/route-stop/{route_id}/{type}` → 收集站名（坐标从 `/stop/{id}` 补）
- **MTR**：下载 CSV 文件 `opendata.mtr.com.hk/data/mtr_lines_and_stations.csv`，打包为 JSON
- 输出到 `src/data/{ctb,gmb,mtr_stations}.json`；**提交到 Git 仓库**

**注意**：小巴 API 有速率限制（请求过快返回 HTML 403），需控制并发度（≤10）。

---

### 1.5 站名含灯柱/代码编号（KCxxx、WT916）

**现象**：搜索结果和车站列表中显示 `香港眼科醫院 (KC382)`、`竹園邨總站 (WT916)`、`連德道興田邨外近燈柱 AA6591` 等不友好字符串。

**根因**：KMB 站名括号内是站牌编号，GMB 站名含灯柱编号。这些是基础设施编号，对乘客无用。

**修复**：写 `cleanStopName()` 函数，正则移除两类噪音：
- `(WT916)` / `（KC382）` — 括号内的字母+数字编号
- `AA6591` — 独立的灯柱编号

应用到**所有**显示站名的地方：搜索建议、路线结果、附近车站卡片、行程规划结果。

**文件**：[src/journey/graph/stopMerger.ts](src/journey/graph/stopMerger.ts) 的 `cleanStopName()`

---

## 2. GitHub Pages 部署

### 2.1 Jekyll 吞掉 `_expo` 目录（白屏）

**现象**：本地 `npx expo start --web` 正常运行，部署到 GitHub Pages 后**白屏**。

**排查过程**（耗时最长的问题，经历多轮排查）：

| 轮次 | 怀疑方向 | 实际？ |
|------|---------|--------|
| 1 | `@/` 路径别名 Metro 不认识 | 部分正确（Babel 插件修复），但不是根因 |
| 2 | `react-native-safe-area-context` 缺少 | Expo Router 需要它，修复后有帮助但不是根因 |
| 3 | Expo Router 的动态 `/_expo/loaders` 路径没加 base URL 前缀 | 需要手动 patch（post-build 脚本），但不是白屏根因 |
| 4 | `dist/` 目录里没有 `.nojekyll` 文件 | **根因** |

**根因**：GitHub Pages 默认用 **Jekyll** 引擎构建网站。Jekyll 有一条规则：**所有 `_` 开头的文件和目录会被静默忽略**。Expo 的 JS bundle 和所有资源都在 `_expo/` 目录下——整个目录被 Jekyll 删掉了。

**关键证据**：
```bash
# raw.githubusercontent.com（直读 git 内容）→ 文件存在
curl raw.githubusercontent.com/.../entry-xxx.js → 200

# github.io Pages URL → 文件不存在
curl rwang181-oss.github.io/HK-Transit-AI/_expo/... → 404
```

同一个文件，raw 能访问但 Pages 不能 → 唯一区别是 Pages 经过 Jekyll 构建。

**修复**：在发布目录根放一个空的 `.nojekyll` 文件。

```bash
touch dist/.nojekyll
```

**文件**：[scripts/post-build.js](scripts/post-build.js)

---

### 2.2 SPA 深层链接 404

**现象**：用户从结果页刷新浏览器，或直接打开 `/journey/result?fromLat=...` 链接，显示 404。

**根因**：GitHub Pages 是**纯静态文件托管**，没有服务器路由。所有路径都对应一个真实文件。`/journey/result` 不是磁盘上的文件 → 404。

**修复**：部署时 `cp index.html 404.html`。GitHub Pages 在遇到 404 时，如果 `404.html` 存在，会用它替代默认 404 页。浏览器收到完整 App 源码，Expo Router 接管路由后渲染正确页面。

```javascript
// scripts/post-build.js
const notFound = path.join(dist, '404.html');
fs.copyFileSync(indexHtml, notFound);
```

**遗留问题**：HTTP 状态码仍是 404（即使页面能正常渲染）。如果对 SEO 有要求，需要自定义域名配合 GitHub Actions 动态生成。

---

### 2.3 部署脚本在 Windows 上不能用

**现象**：`npm run build:web` 报错 `'EXPO_PUBLIC_BASE_PATH' is not recognized` 和 `sed: command not found`。

**根因**：初始 deploy 脚本用了 Unix 专属语法：
- `EXPO_PUBLIC_BASE_PATH=/HK-Transit-AI npx expo export` — Windows cmd 不支持内联环境变量
- `sed -i` — Windows 没有 sed
- `touch dist/.nojekyll` — Windows 没有 touch

**修复**：改用纯 Node.js 脚本 `scripts/post-build.js` 处理所有构建后步骤（路径 patch、.nojekyll、404.html），`app.json` 中 `experiments.baseUrl` 处理路径前缀。

---

### 2.4 部署命令中单引号在 Windows 报错

**现象**：`npx gh-pages -d dist -m 'deploy: web build'` 报 `too many arguments`。

**根因**：Windows cmd 把单引号当普通字符而非字符串引用符。

**修复**：在 `package.json` 中改为转义双引号 `-m \"deploy: web build\"`。

---

## 3. Web 兼容性

### 3.1 FlatList 在 Web 上崩溃

**现象**：`<FlatList>` 在 Web 上渲染时报错 `Encountered two children with the same key`，反复报错直到页面卡死。

**根因**：React Native Web 的 `FlatList`（底层用 `VirtualizedList`）需要**父容器有固定高度**才能计算虚拟化窗口。Web 布局中父容器高度往往是 `flex: 1`（由内容撑开），导致计算失败。

**修复**：所有 `FlatList` 替换为 `ScrollView + .map()`。列表最多 10-30 条数据，ScrollView 性能完全够。

```tsx
// ❌ Web 上崩溃
<FlatList data={items} renderItem={...} />

// ✅ Web 兼容
<ScrollView>
  {items.map(item => (...))}
</ScrollView>
```

**影响文件**：所有 5 个使用 FlatList 的页面（index, search, nearby, favorites, eta/[routeId]）。

---

### 3.2 `@/` 路径别名 Metro 不识别

**现象**：`import { COLORS } from '@/src/utils/constants'` 在 Metro 打包时报 `Unable to resolve`。

**根因**：`tsconfig.json` 的 `paths` 别名只对 TypeScript 编译器有效，**Metro bundler 不读 tsconfig**。

**修复**：安装 `babel-plugin-module-resolver`，在 `babel.config.js` 中配置：

```javascript
plugins: [
  ['babel-plugin-module-resolver', {
    root: ['./'],
    alias: { '@': '.' },
  }],
],
```

Jest 也需要配套的 `moduleNameMapper`：

```json
"moduleNameMapper": { "^@/(.*)$": "<rootDir>/$1" }
```

**文件**：[babel.config.js](babel.config.js)、[package.json](package.json)

---

### 3.3 expo-localization 在 Web 上可能抛异常

**现象**：部分 Web 环境下 `getLocales()` 抛异常，导致整个 App 白屏。

**修复**：用 `try/catch + require()` 包裹，fallback 到 `'en'`。

**文件**：[src/utils/i18n.ts](src/utils/i18n.ts)

---

## 4. 多模式路线规划

### 4.1 直达线路被漏掉（候选站交集不够）

**现象**：眼科医院 → 慈云山正康楼，203E 明明是直达却被漏掉。

**根因**：第一版算法是先找起终点最近各 3 个站 → 交集公共路线 → Dijkstra。正康楼在慈云山密集区，周边几十个站，**203E 的下车站在 3 个候选中被挤出**。

**修复**：完全重写直达搜索——不再用候选站交集，而是**从每个上车站沿每条路线逐站遍历**，凡离终点 1.2km 内的停靠站都算有效下车点。算法从 O(candidates²) 改为 O(boardingHubs × edgesOnRoutes)。

```typescript
// 核心逻辑：沿路线逐站走，找到离终点近的下车站
for (const bh of boardHubs) {
  for (const routeKey of hubRoutes.get(bh.id)) {
    let cur = bh.id, cum = 0;
    while (hasNextStop(cur)) {
      cum += edgeWeight;
      cur = nextStop;
      if (distanceToDestination(cur) <= 1200m) {
        // 找到了！这就是直达
      }
    }
  }
}
```

**文件**：[src/stores/journeyStore.ts](src/stores/journeyStore.ts) 的 `plan()` 方法

---

### 4.2 时间估算与 Google Maps 差距大

**现象**：App 显示的行程时间比 Google Maps 短很多。

**根因**：原始算法用 Haversine 直线距离 ÷ 平均速度 = 估算时间。实际路线是曲折的，真实距离比直线长。

**修复**：对所有估算加入**绕行系数（circuity）**：

| 模式 | 速度 | 绕行系数 | 说明 |
|------|------|---------|------|
| KMB / CTB | 20 km/h | ×1.45 | 巴士路线曲折 |
| GMB | 25 km/h | ×1.35 | 小巴路线较多直路 |
| MTR | 35 km/h | ×1.12 | 地铁路线较直 |

公式：`时间 = 直线距离(km) × 绕行系数 ÷ 速度(km/h) × 60 + 停车时间`

**文件**：[src/journey/graph/travelTime.ts](src/journey/graph/travelTime.ts)

---

### 4.3 等车时间估算

**现象**：用户需要在走路时间内判断能否赶上车。

**修复**：规划的 `plan()` 完成后，对每个方案**并行请求**公交实时 ETA API，获取第一站的下一班到站时间。`catchable = 走路时间 ≤ 下一班到站时间`。

**注意**：ETA 依赖外部 API（网络延迟），规划在后台跑，结果逐个返回。

---

## 5. 性能优化

### 5.1 网图构建 O(n²) 性能

**现象**：8,054 个枢纽站构建转移边时，双循环比较 3,200 万次，耗时数秒。

**修复**：空间网格索引（grid index）。将枢纽按地理坐标分到 0.005°（≈550m）网格中，转移边只在**同格和相邻格**之间比较：

```
优化前：8,054² / 2 ≈ 32,000,000 次比较
优化后：≈ 95,000 次比较（340 倍加速，73ms）
```

**文件**：[src/journey/graph/graphBuilder.ts](src/journey/graph/graphBuilder.ts)

---

### 5.2 首页 ETA 刷新串行化

**现象**：5 个收藏路线，ETA 逐个请求（`for...await`），总延迟 5×200ms ≈ 1 秒。

**修复**：`Promise.all()` 并行请求。

**文件**：[app/(tabs)/index.tsx](app/(tabs)/index.tsx)

---

### 5.3 搜索每次按键全量扫描

**现象**：行程搜索输入时，每次按键都全量扫描 8,000 个枢纽站。

**修复**：加 250ms 防抖（debounce）+ `useMemo` 缓存。

---

## 6. 手机端适配

### 6.1 键盘只显示数字（无法输入路线号字母）

**现象**：搜索框设置 `keyboardType="number-pad"`，手机弹出纯数字键盘，无法输入 `1A`、`203E` 等含字母路线号。

**修复**：去掉 `keyboardType`，加 `autoCapitalize="characters"`（自动大写）和 `autoCorrect={false}`（防止自动纠错）。

**文件**：[src/components/SearchBar.tsx](src/components/SearchBar.tsx)

---

### 6.2 简体中文搜索无结果

**现象**：用简体输入"九龙塘"搜不到"九龍塘站"。

**根因**：API 返回的站名是繁体中文，搜索只匹配繁体。

**修复**：
1. 所有数据源补齐 `name_sc`（简体中文）字段（KMB API 自带、CTB/GMB 爬虫收集）
2. 搜索算法改为三向匹配（en / tc / sc）

**文件**：[src/stores/journeyStore.ts](src/stores/journeyStore.ts) 的 `searchStops()`

---

## 7. 开发流程

### 7.1 Jest 配置

**测试框架**：Jest + `@react-native/jest-preset` + `jest-expo`

**关键配置**：

```json
{
  "jest": {
    "preset": "@react-native/jest-preset",
    "setupFiles": ["<rootDir>/node_modules/jest-expo/src/preset/setup.js"],
    "moduleNameMapper": { "^@/(.*)$": "<rootDir>/$1" },
    "transformIgnorePatterns": [
      "node_modules/(?!(expo|expo-router|@expo|expo-modules-core|...)/)"
    ]
  }
}
```

`transformIgnorePatterns` 必须包含所有 expo 相关模块，否则 Jest 不转译 ESM 语法。

### 7.2 测试设计原则

- API 测试用 `jest.fn()` mock `global.fetch`，不请求真实网络
- 时间相关测试用宽松断言（`toBeGreaterThanOrEqual`），避免毫秒级漂移
- 算法测试（stopMerger、travelTime、Dijkstra）用纯数据输入，确定性输出

### 7.3 部署命令

```bash
npm run deploy    # 构建 + 部署到 GitHub Pages
npm run test      # 运行所有测试
npx tsc --noEmit  # TypeScript 类型检查
```

---

## 技术决策速查表

| 决策 | 选型 | 原因 |
|------|------|------|
| 框架 | Expo SDK 57 | Web + iOS 一套代码 |
| 路由 | Expo Router | 深层链接 + PWA 可收藏 URL |
| 状态 | Zustand | 轻量 + persist 中间件 |
| 地图 | Leaflet (Web) | 免费、无 API Key |
| 地理编码 | Nominatim (OSM) | 免费、香港可用（不要加 countrycodes=hk） |
| 路径规划 | 自定义 Dijkstra | 需整合多模式 + 步行 + ETA |
| 部署 | GitHub Pages | 免费、CI 简单 |
| 测试 | Jest | React Native 标准 |

---

*最后更新：2026-08-05*
