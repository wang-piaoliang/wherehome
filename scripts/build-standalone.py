# -*- coding: utf-8 -*-
"""把 App 打包成一个单文件 html：数据和物品小图全部内嵌，双击就能开，不需要服务器。

用途：发成 Artifact / 直接发给手机 / 存网盘离线看。
小图会压到 STANDALONE_PX，因为 base64 会让体积膨胀约 34%。
"""
import base64, io, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
DIST = os.path.join(ROOT, "dist")
STANDALONE_PX = 250
QUALITY = 60

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow：pip3 install Pillow")
    sys.exit(1)


def main():
    data = json.load(open(os.path.join(PUB, "items.json"), encoding="utf-8"))
    total = 0
    kept = []
    for it in data["items"]:
        p = os.path.join(PUB, it["img"]) if it.get("img") else None
        if p and os.path.exists(p):
            im = Image.open(p).convert("RGB")
            im.thumbnail((STANDALONE_PX, STANDALONE_PX), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=QUALITY, optimize=True)
            b = buf.getvalue()
            total += len(b)
            it = dict(it)
            it["img"] = "data:image/jpeg;base64," + base64.b64encode(b).decode("ascii")
        kept.append(it)

    payload = {"version": data.get("version", 1),
               "generated": data.get("generated", ""),
               "items": kept}

    html = open(os.path.join(PUB, "wherehome.html"), encoding="utf-8").read()
    inject = ('<script>window.__ITEMS__=' +
              json.dumps(payload, ensure_ascii=False, separators=(",", ":")) +
              ';</script>\n<script>')
    assert "\n<script>\n\"use strict\";" in html, "找不到主脚本的插入点"
    html = html.replace("\n<script>\n\"use strict\";", "\n" + inject + "\n\"use strict\";", 1)
    # 单文件版不需要 manifest / sw，去掉引用避免 404
    html = html.replace('<link rel="manifest" href="./manifest.webmanifest">', "")

    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "wherehome-standalone.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print("图片 %d 张，%.1f MB（base64 约 %.1f MB）" % (len(kept), total / 1e6, total * 1.34 / 1e6))
    print("产出 %s  %.1f MB" % (out, os.path.getsize(out) / 1e6))


if __name__ == "__main__":
    main()
