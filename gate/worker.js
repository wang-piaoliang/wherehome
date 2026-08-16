// 「在哪儿」的访问门。
//
// 静态资源（App 本体、items.json、1054 张物品小图）由 Workers Static Assets 托管，
// 但每个请求都先经过这个 Worker：没有有效 cookie 就只给一个登录页，密码对了才放行。
//
// 为什么不用 Cloudflare Access：Access 的 Self-hosted 应用要从账号下的域名里选主机名，
// 而这个账号一个域名都没有，*.pages.dev 不属于用户，选不了。
//
// 密码和签名密钥都是 Worker secret：
//   wrangler secret put APP_PASSWORD
//   wrangler secret put COOKIE_SECRET

const COOKIE = "wh_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}

// 定长比较，避免按字符提前返回泄露信息
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function makeToken(secret) {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return exp + "." + (await sign(exp, secret));
}

async function validToken(token, secret) {
  if (!token) return false;
  const i = token.lastIndexOf(".");
  if (i < 1) return false;
  const exp = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await sign(exp, secret));
}

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function loginPage(msg) {
  const note = msg ? '<p class="err">' + msg + "</p>" : "";
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#2C5B6D">
<title>在哪儿</title>
<style>
:root{--bg:#F2F1ED;--surface:#fff;--ink:#1E2328;--muted:#6C737A;--line:#DFDDD7;--accent:#2C5B6D}
@media(prefers-color-scheme:dark){:root{--bg:#141719;--surface:#1C2023;--ink:#E9E7E2;--muted:#959B9F;--line:#2D3235;--accent:#79ADBF}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
font-family:"PingFang SC","Hiragino Sans GB",-apple-system,BlinkMacSystemFont,sans-serif;padding:24px}
.card{width:100%;max-width:330px;background:var(--surface);border:1px solid var(--line);
border-radius:16px;padding:28px 24px;box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 30px -18px rgba(0,0,0,.3)}
h1{font-size:21px;margin:0 0 4px;font-weight:650}
p.sub{margin:0 0 20px;font-size:13.5px;color:var(--muted)}
p.err{margin:0 0 14px;font-size:13px;color:#A2563A;background:#F3E5E0;padding:8px 11px;border-radius:8px}
@media(prefers-color-scheme:dark){p.err{color:#D08A68;background:#2E2320}}
input{width:100%;padding:12px 14px;font-size:16px;border:1px solid var(--line);border-radius:10px;
background:var(--bg);color:var(--ink);margin-bottom:12px}
button{width:100%;padding:12px;font-size:15px;font-weight:600;border:0;border-radius:10px;
background:var(--accent);color:#fff;cursor:pointer}
</style></head>
<body><form class="card" method="POST" action="/__login">
<h1>在哪儿</h1>
<p class="sub">家里的东西放在哪儿</p>
${note}
<input type="password" name="p" placeholder="密码" autocomplete="current-password" autofocus required>
<button type="submit">进入</button>
</form></body></html>`;
}

function htmlResponse(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.APP_PASSWORD || !env.COOKIE_SECRET) {
      return htmlResponse("<h1>未配置</h1><p>缺少 APP_PASSWORD 或 COOKIE_SECRET。</p>", 500);
    }

    // 登录
    if (url.pathname === "/__login") {
      if (request.method !== "POST") return Response.redirect(url.origin + "/", 302);
      const form = await request.formData();
      const pw = String(form.get("p") || "");
      if (!safeEqual(pw, env.APP_PASSWORD)) {
        // 慢一点，降低暴力尝试速率
        await new Promise(r => setTimeout(r, 900));
        return htmlResponse(loginPage("密码不对"), 401);
      }
      const token = await makeToken(env.COOKIE_SECRET);
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/wherehome.html",
          "Set-Cookie": `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/__logout") {
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/",
          "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }

    // 门禁
    const ok = await validToken(readCookie(request, COOKIE), env.COOKIE_SECRET);
    if (!ok) {
      // 没登录时，任何路径都只回登录页，不暴露站点结构
      return htmlResponse(loginPage(""), url.pathname === "/" ? 200 : 401);
    }

    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    out.headers.set("Referrer-Policy", "no-referrer");
    return out;
  },
};
