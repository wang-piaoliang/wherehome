// 把物品库打包成一个加密文件，可以安全地放进公开仓库。
//
// 为什么不是「JSON 里内嵌 base64 图片」：那样体积要涨 34%，而且客户端得把
// 十几 MB 的字符串堆在 JS 内存里，手机浏览器扛不住。这里改成二进制容器，
// 图片按原始字节拼接，客户端解密后按偏移切成 Blob——Blob 由浏览器管理，
// 通常落在磁盘而不是 JS 堆上。
//
// 文件格式：
//   "WHE2"        4 字节  magic
//   iterations    4 字节  大端 uint32，PBKDF2 轮数
//   salt         16 字节
//   iv           12 字节
//   ciphertext   剩余     AES-256-GCM，末尾 16 字节是 auth tag
//
// 明文（解密后）：
//   metaLen       4 字节  大端 uint32
//   metaJSON      metaLen 字节  {version, generated, items:[{..., off, len}]}
//   blob          剩余     所有图片的原始 JPEG 字节，按 off/len 切片
//
// 用法：node scripts/build-encrypted.mjs '你的口令'
//
// ⚠️ 密文是公开的，别人可以下载后离线暴力破解，所以口令必须够长。
//    脚本强制 12 位以上，实际建议用四个词拼成的长口令。

import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUB = path.join(ROOT, "public");
const ITERATIONS = 600000; // OWASP 对 PBKDF2-SHA256 的建议值
const OUT = path.join(PUB, "data.enc");

const password = process.argv[2];
if (!password) {
  console.error("用法：node scripts/build-encrypted.mjs '你的口令'");
  process.exit(1);
}
if (password.length < 12) {
  console.error(`口令太短（${password.length} 位）。密文是公开的，必须 12 位以上。`);
  process.exit(1);
}

// 优先用 items_sm/（300px，给加密包用），没有就退回 items/
const SMALL = path.join(PUB, "items_sm");
const useSmall = existsSync(SMALL);

const meta = JSON.parse(readFileSync(path.join(PUB, "items.json"), "utf8"));
const chunks = [];
let off = 0;
let missing = 0;

const items = meta.items.map((it) => {
  const rel = it.img || "";
  const file = rel ? path.join(useSmall ? SMALL : PUB, useSmall ? path.basename(rel) : rel) : "";
  if (!file || !existsSync(file)) {
    missing++;
    return { ...it, img: "", off: 0, len: 0 };
  }
  const bytes = readFileSync(file);
  chunks.push(bytes);
  const entry = { ...it, off, len: bytes.length };
  delete entry.img; // 客户端按 off/len 自己造 Blob URL
  off += bytes.length;
  return entry;
});

const metaJSON = Buffer.from(
  JSON.stringify({ version: meta.version, generated: meta.generated, items }),
  "utf8"
);
const metaLen = Buffer.alloc(4);
metaLen.writeUInt32BE(metaJSON.length, 0);
const plain = Buffer.concat([metaLen, metaJSON, ...chunks]);

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(Buffer.from(password, "utf8"), salt, ITERATIONS, 32, "sha256");
const cipher = createCipheriv("aes-256-gcm", key, iv);
const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

const iterBuf = Buffer.alloc(4);
iterBuf.writeUInt32BE(ITERATIONS, 0);
const out = Buffer.concat([Buffer.from("WHE2", "ascii"), iterBuf, salt, iv, body]);
writeFileSync(OUT, out);

const mb = (n) => (n / 1e6).toFixed(2) + " MB";
console.log(`物品 ${items.length} 条，图片 ${chunks.length} 张（${useSmall ? "300px" : "原尺寸"}）${missing ? `，缺图 ${missing}` : ""}`);
console.log(`元数据 ${(metaJSON.length / 1e3).toFixed(0)} KB + 图片 ${mb(off)} = 明文 ${mb(plain.length)}`);
console.log(`密文 ${mb(out.length)} → ${OUT}`);
console.log(`PBKDF2-SHA256 ${ITERATIONS.toLocaleString()} 轮 + AES-256-GCM`);
