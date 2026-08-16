import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const url = p => new URL(p, import.meta.url);

async function html() {
  return readFile(url("../public/wherehome.html"), "utf8");
}
async function data() {
  return JSON.parse(await readFile(url("../public/items.json"), "utf8"));
}

test("应用页面包含所有关键节点", async () => {
  const h = await html();
  for (const id of ["q", "grid", "rows", "roomList", "sheet", "scrim", "toast", "stats"]) {
    assert.ok(h.includes('id="' + id + '"'), "缺少 #" + id);
  }
  assert.ok(h.includes('href="./manifest.webmanifest"'), "没有引用 manifest");
  assert.ok(h.includes('navigator.serviceWorker.register("./sw.js")'), "没有注册 service worker");
  assert.ok(h.includes('data-view="search"'), "缺少底部导航");
});

test("内联脚本能被解析（语法错误会在这里暴露）", async () => {
  const h = await html();
  const src = h.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(src, "页面必须有内联脚本");
  assert.doesNotThrow(() => new vm.Script(src), "内联脚本存在语法错误");
});

test("items.json 结构正确且 id 唯一", async () => {
  const j = await data();
  assert.equal(typeof j.version, "number");
  assert.ok(Array.isArray(j.items) && j.items.length > 0, "items 必须是非空数组");
  const seen = new Set();
  for (const it of j.items) {
    for (const k of ["id", "name", "cat", "room", "where", "img", "on"]) {
      assert.ok(k in it, "条目 " + it.id + " 缺字段 " + k);
    }
    assert.ok(it.name.trim().length > 0, "条目 " + it.id + " 名称为空");
    assert.ok(!seen.has(it.id), "id 重复：" + it.id);
    seen.add(it.id);
  }
});

test("每条物品的小图都存在", async () => {
  const j = await data();
  const missing = [];
  for (const it of j.items) {
    if (!it.img) continue;
    if (!existsSync(new URL("../public/" + it.img, import.meta.url))) missing.push(it.img);
  }
  assert.equal(missing.length, 0, "缺图 " + missing.length + " 张，例如 " + missing.slice(0, 3).join(", "));
});

test("可搜索物品的房间与分类都在允许范围内", async () => {
  const j = await data();
  const ROOMS = new Set(["玄关", "厨房", "北阳台", "洗漱区", "卫生间", "客餐厅", "主卧", "次卧", "南阳台"]);
  const CATS = new Set(["衣物鞋包", "床品家纺", "洗漱护肤", "美发小电", "药品医疗", "厨房食材",
    "厨房器具", "家电小电", "清洁洗晾", "数码办公", "文件书籍", "手作爱好", "摆件纪念",
    "收纳容器", "耗材囤货", "包装废弃", "家具大件"]);
  for (const it of j.items.filter(x => x.on)) {
    assert.ok(ROOMS.has(it.room), "未知房间 " + it.room + "（" + it.id + "）");
    assert.ok(CATS.has(it.cat), "未知分类 " + it.cat + "（" + it.id + "）");
  }
});

test("service worker 缓存了应用外壳与数据", async () => {
  const sw = await readFile(url("../public/sw.js"), "utf8");
  assert.match(sw, /CACHE_NAME\s*=\s*"wherehome-pwa-v\d+"/, "缓存名要带版本号");
  for (const asset of ["./wherehome.html", "./items.json", "./manifest.webmanifest"]) {
    assert.ok(sw.includes('"' + asset + '"'), "APP_SHELL 缺少 " + asset);
  }
});

test("manifest 指向应用入口", async () => {
  const m = JSON.parse(await readFile(url("../public/manifest.webmanifest"), "utf8"));
  assert.equal(m.start_url, "./wherehome.html");
  assert.ok(m.icons.length >= 2);
  await access(url("../public/icon-512.png"));
});
