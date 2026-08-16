# 「在哪儿」仓库规则

## 每次任务先做这三件事

1. 读 `WHEREHOME_PROJECT_CONTEXT.md`，再动代码。
2. 跑 `git status --short` 和 `git log -5 --oneline`，避免覆盖用户自己的改动。
3. 改完跑 `npm test`。

## 唯一事实来源

- 产品本体是 `public/wherehome.html` —— 一个移动优先的单文件 PWA，样式和脚本都内联在里面。
- 物品数据是 `public/items.json`（`{version, generated, items[]}`），物品小图在 `public/items/`，文件名与物品 id 一一对应。
- 数据由家里现状照片经识别流水线生成，**不要手写 items.json**；要重新生成见下面「数据流水线」。
- 用户在 App 里的改名/改位置/新增/删除只存在浏览器 `localStorage` 的 `wherehome_edits_v1`，以补丁形式叠加在 items.json 之上。原始数据永远不被修改。
- 可选云同步是独立的 Cloudflare Worker + D1（`api/`），用 `wrangler deploy` 单独部署，`npm run publish:pages` 不管它。没配置同步时 App 要能完全正常工作，永远不要让同步变成硬依赖。
- PWA 元信息和离线行为在 `public/manifest.webmanifest` 和 `public/sw.js`。
- `public/index.html` 只做一件事：跳转到 `wherehome.html`。

## 数据结构

items.json 里每条：

| 字段 | 含义 |
|---|---|
| `id` | 稳定 id。识别产出的是 `IMG_8666_01` 这种（照片名_序号）；用户新增的是 `u` 开头 |
| `name` | 物品名称，模型识别，允许用户改 |
| `cat` | 一级分类，取值必须在 App 里的 `CATS` 列表内 |
| `room` | 房间，取值必须在 `ROOMS` 列表内 |
| `where` | 具体位置（哪个柜子/哪一层） |
| `qty` | 数量，自由文本 |
| `scene` | 照片级的场景描述。**只用于详情展示，绝不能进搜索检索字段** —— 否则同一张照片里的每件东西都会命中同一个词 |
| `conf` | 识别置信度 high/medium/low，low 在界面上标「存疑」 |
| `photo` | 来源照片 |
| `img` | 小图相对路径 |
| `on` | 是否进搜索库。家具本体和固定设备是 `false`，数据留着但不展示 |

## 数据流水线

原始照片在上一级目录 `../`（IMG_8666–8694.heic）。重新生成物品库的步骤记录在
`WHEREHOME_PROJECT_CONTEXT.md` 的「数据是怎么来的」一节。关键约束：

- **裁图一律用 PIL，不要用 `sips --cropOffset`** —— 左偏移为 0 时它会静默忽略偏移改成居中裁剪，导致坐标全错。这个坑踩过一次，浪费了几个小时。
- 让模型定位物品时，用**带编号的网格**（象限图上叠 6×6 的 A1–F6），让它回答「在哪几格」，不要让它输出归一化坐标。
- 每个识别 agent 只给 1 张照片、最多 5 张图（全景 + 4 象限）。给多了会在输出结果前撑爆上下文。
- 长时间跑批前先确认机器不会休眠，否则 agent 会大面积 stall 重试。

## 发布

- 用 `github` remote。`main` 放源码，`gh-pages` 放 `public/` 的内容。
- 改完之后：更新 `WHEREHOME_PROJECT_CONTEXT.md` → 提交 → 跑 `npm run publish:pages`，同一个任务里做完，不要攒着。
- `publish:pages` 会：`git diff --check` → `npm test` → 推 main → 把 `public/` 树叠一个提交推到 gh-pages → 调 GitHub API 触发重建。
- 仓库名通过 `WHEREHOME_REPO` 环境变量覆盖，默认 `wang-piaoliang/wherehome`。

## 产品与质量约束

- iPhone 优先。任何移动宽度下都不能出现横向滚动。
- 底部四个 tab 的顺序固定：`搜索`、`房间`、`新增`、`设置`，`搜索` 是默认视图。
- 物品小图有 1000+ 张，`sw.js` 里必须保持「外壳和 items.json 走网络优先、小图走缓存优先」的策略；改了 App 外壳要同时升 `CACHE_NAME` 的版本号，并更新对应测试断言。
- 搜索的检索字段是 `name / cat / room / where / qty / note`。**不要加 `scene`。**
- 深浅色两套都要能看。`prefers-color-scheme` 和 `data-theme` 都要生效。
- 用户的改动是他们的劳动成果，任何改动都不能让 `wherehome_edits_v1` 失效或被清空。改了它的结构必须做迁移。
