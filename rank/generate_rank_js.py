#!/usr/bin/env python3
"""从榜单 xlsx 的等级徽章 + 拍组匹配结果，生成「拍组名 → 等级数值」扁平 JS 表。

等级是一条 1~14 的梯子。四个球级（新手/精灵球/超级球/高级球）每个内部再分 1<2<3 三档，
球级之间「高级球1」高于「超级球3」（即 (球级,子级) 按字典序升序）；大师球、冠军级无子级：
  新手1/2/3=1/2/3，精灵球1/2/3=4/5/6，超级球1/2/3=7/8/9，高级球1/2/3=10/11/12，
  大师球=13，冠军=14。

每一行的等级由两处图片共同决定（都按图像内容比对模板，不写死表格位置/文件名）：
- 列 B 的大徽章 → 球级（`等级徽章参考/`，缩 32×32 比像素差）；
- 列 D 紧邻的小数字图标 → 子级 1/2/3（`子级参考/`，同源资源）。大师球/冠军级没有这枚数字。
徽章锚在某一行，它下方直到下一个徽章之前的所有拍组头像都属于该等级（carry-forward）。

用系统 python3 即可（依赖 PIL）。管线顺序：先 `npm run build`（生成 ../dist/data.js 属性真值），
再 `extract_features.py` → `match_pairs.py`（需 torch 环境）生成 `工作区/拍组匹配结果.csv`，最后跑本脚本。
"""

import csv
import io
import posixpath
import re
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

from PIL import Image

NS = {
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
R_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
RANK_DIR = Path(__file__).resolve().parent
BADGE_TMPL_DIR = RANK_DIR / "等级徽章参考"
SUB_TMPL_DIR = RANK_DIR / "子级参考"
# 线性等级值 1~15：四个球级各占 3 档（base+子级 1/2/3），大师球/冠军级无子级；
# 自由者（彩色渐变徽章）为最高 15。
TIER_BASE = {"新手级": 0, "精灵球级": 3, "超级球级": 6, "高级球级": 9}
TOP_VALUE = {"大师球级": 13, "冠军级": 14, "自由者级": 15}
BADGE_MATCH_TH = 28.0  # 32×32 上平均每通道像素差（0~255）；同徽章 <10，非徽章 >38。
SUB_MATCH_TH = 40.0    # 子级数字同样比对；同源资源实测最佳差 0、次选 ≥20。
_TIER_NAMES = ["新手", "精灵球", "超级球", "高级球"]


def rank_label(value):
    """1~15 → 中文短标签，用于打印分布。"""
    if value == 15:
        return "自由者"
    if value == 14:
        return "冠军"
    if value == 13:
        return "大师球"
    return f"{_TIER_NAMES[(value - 1) // 3]}{(value - 1) % 3 + 1}"


def _white_rgb(data):
    with Image.open(io.BytesIO(data)) as im:
        rgba = im.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    bg.alpha_composite(rgba)
    return bg.convert("RGB")


def _thumb(data, size=32):
    """归一化到白底 32×32，返回 RGB 原始字节（逐字节即逐通道 0~255）。"""
    return _white_rgb(data).resize((size, size), Image.LANCZOS).tobytes()


def _closest(th, templates):
    """返回 (键, 最小平均像素差)。"""
    best, best_diff = None, 1e9
    for key, tt in templates:
        d = sum(abs(a - b) for a, b in zip(th, tt)) / len(th)
        if d < best_diff:
            best, best_diff = key, d
    return best, best_diff


def load_badge_templates():
    """等级徽章模板：文件名=等级名，存归一化后的 32×32 像素。"""
    valid = set(TIER_BASE) | set(TOP_VALUE)
    return [(p.stem, _thumb(p.read_bytes()))
            for p in sorted(BADGE_TMPL_DIR.glob("*.png")) if p.stem in valid]


def load_sub_templates():
    """子级数字模板：文件名=1/2/3，存归一化后的 32×32 像素。"""
    tmpls = []
    for p in sorted(SUB_TMPL_DIR.glob("*.png")):
        if p.stem in ("1", "2", "3"):
            tmpls.append((int(p.stem), _thumb(p.read_bytes())))
    return tmpls


def match_badge(data, templates):
    """返回与模板最接近的等级名；差距过大则 None（不是等级徽章，如分节横幅）。"""
    tier, diff = _closest(_thumb(data), templates)
    return (tier if diff < BADGE_MATCH_TH else None), diff


def match_sub(data, templates):
    """返回与 1/2/3 模板最接近的子级整数；差距过大则 None。"""
    digit, diff = _closest(_thumb(data), templates)
    return (digit if diff < SUB_MATCH_TH else None), diff


def col_rank_rows(xlsx, badge_templates, sub_templates):
    """解析工作表 1 绘图，返回 [(行号, 等级值 1~14)]。

    列 B 大徽章定球级、列 D 小数字定子级（大师球/冠军级无小数字）。一次性扫绘图收集两处，
    再组合成等级值。"""
    with ZipFile(xlsx) as zf:
        drawing = ET.fromstring(zf.read("xl/drawings/drawing1.xml"))
        rel_root = ET.fromstring(zf.read("xl/drawings/_rels/drawing1.xml.rels"))
        rels = {x.attrib["Id"]: x.attrib["Target"] for x in rel_root}
        badge_img, sub_img = {}, {}
        for anchor in list(drawing):
            frm = anchor.find("xdr:from", NS)
            pic = anchor.find("xdr:pic", NS)
            if frm is None or pic is None:
                continue
            row = int(frm.find("xdr:row", NS).text) + 1
            col = int(frm.find("xdr:col", NS).text) + 1
            rid = pic.find(".//a:blip", NS).attrib.get(R_ID + "embed")
            data = zf.read(posixpath.normpath(posixpath.join("xl/drawings", rels[rid])))
            with Image.open(io.BytesIO(data)) as im:
                w, h = im.size
            if col == 2 and w >= 100:        # 列 B：等级徽章大图
                badge_img[row] = data
            elif col == 4 and w <= 60 and h <= 60:  # 列 D：子级 1/2/3 小数字
                sub_img[row] = data

        # 子级：行 → 1/2/3。
        subs = {}
        for row, data in sub_img.items():
            digit, diff = match_sub(data, sub_templates)
            if digit is not None:
                subs[row] = digit
            else:
                print(f"  警告：列D第{row}行小数字未识别为 1/2/3（最小像素差 {diff:.1f}）")

        ranks = []
        for row in sorted(badge_img):
            tier, diff = match_badge(badge_img[row], badge_templates)
            if tier is None:
                print(f"  警告：列B第{row}行大图未匹配到任何等级徽章（最小像素差 {diff:.1f}）")
                continue
            if tier in TOP_VALUE:
                ranks.append((row, TOP_VALUE[tier]))
                continue
            sub = subs.get(row)
            if sub is None:
                print(f"  警告：{tier} 第{row}行缺少列D子级数字，无法定档，跳过该徽章")
                continue
            ranks.append((row, TIER_BASE[tier] + sub))
        return ranks


def main():
    rank_dir = Path(__file__).resolve().parent
    xlsx = Path(sys.argv[1] if len(sys.argv) > 1 else rank_dir / "榜单.xlsx")
    feature_dir = Path(sys.argv[2] if len(sys.argv) > 2 else rank_dir / "工作区")
    output = Path(sys.argv[3] if len(sys.argv) > 3 else rank_dir / "data.js")

    badge_templates = load_badge_templates()
    sub_templates = load_sub_templates()
    rank_rows = col_rank_rows(xlsx, badge_templates, sub_templates)
    print("识别到等级（行→等级值）：", "，".join(f"{r}={rank_label(v)}({v})" for r, v in rank_rows))

    def rank_for(row):
        """carry-forward：取该行之前（含）最近一个徽章的等级值。"""
        value = None
        for br, bv in rank_rows:
            if br <= row:
                value = bv
            else:
                break
        return value

    # 拍组匹配结果：只取参与匹配（非黑名单）且已匹配到名字的行。
    pair_rank = {}
    skipped_no_rank = []
    with (feature_dir / "拍组匹配结果.csv").open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r.get("无需匹配") == "是":
                continue
            name = (r.get("最佳拍组名称") or "").strip()
            if not name:
                continue
            m = re.match(r"([A-Z]+)(\d+)", r["锚点单元格"])
            value = rank_for(int(m.group(2)))
            if value is None:
                skipped_no_rank.append(r["锚点单元格"])
                continue
            # 同名拍组（理论上一一对应，不会重复）以较高等级为准。
            if name not in pair_rank or value > pair_rank[name]:
                pair_rank[name] = value

    # 按等级值（高→低）、名字排序输出。
    items = sorted(pair_rank.items(), key=lambda kv: (-kv[1], kv[0]))
    lines = [
        "// 宝可梦大师EX 田鸡榜 —— 拍组等级表（拍组名 → 等级数值 1~15）",
        "// 等级梯子：新手1/2/3=1/2/3，精灵球1/2/3=4/5/6，超级球1/2/3=7/8/9，",
        "//   高级球1/2/3=10/11/12，大师球=13，冠军=14，自由者=15（彩色渐变，最高）；值越大越强。",
        "// 由榜单列B球级徽章 + 列D子级数字定位行区间、结合图片匹配到的拍组名自动生成。",
        "export const 拍组等级 = {",
    ]
    for name, value in items:
        lines.append(f"  {json_quote(name)}: {value},")
    lines.append("};")
    lines.append("")
    output.write_text("\n".join(lines), encoding="utf-8")

    from collections import Counter
    dist = Counter(pair_rank.values())
    print(f"\n共 {len(items)} 个拍组，按等级分布：")
    for value in range(15, 0, -1):
        if dist.get(value):
            print(f"  {rank_label(value)}({value}): {dist[value]}")
    if skipped_no_rank:
        print("未分到等级（首个徽章之前）：", skipped_no_rank)
    print(f"\n已写出：{output}")


def json_quote(s):
    """JS 对象键用双引号，转义反斜杠/双引号。"""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


if __name__ == "__main__":
    main()
