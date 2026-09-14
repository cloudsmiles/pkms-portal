#!/usr/bin/env python3
"""从宝可梦大师 EX 榜单 xlsx 中逐张提取图片和可复核特征。"""

import csv
import hashlib
import json
import posixpath
import re
import shutil
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

from PIL import Image


# 头像框颜色即搭档宝可梦属性。2026-09 改版后头像为 256x256，色值为当期 653 张头像
# 顶部色带实测中位（框体平涂色，每属性单一色值，18 类完全分开）。
TYPE_FRAME_COLORS = [
    ((62, 172, 216), "水"),
    ((228, 76, 79), "火"),
    ((69, 146, 75), "草"),
    ((235, 133, 170), "妖精"),
    ((194, 158, 0), "电"),
    ((91, 90, 107), "恶"),
    ((80, 122, 241), "飞行"),
    ((156, 104, 151), "幽灵"),
    ((138, 133, 132), "一般"),
    ((66, 176, 184), "冰"),
    ((0, 133, 167), "龙"),
    ((227, 97, 147), "超能力"),
    ((131, 77, 161), "毒"),
    ((105, 116, 139), "钢"),
    ((141, 119, 98), "岩石"),
    ((154, 85, 51), "地面"),
    ((121, 148, 56), "虫"),
    ((212, 109, 50), "格斗"),
]

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
R_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def tag(name):
    return "{" + NS["m"] + "}" + name


def read_xml(zf, name):
    return ET.fromstring(zf.read(name))


def shared_strings(zf):
    root = read_xml(zf, "xl/sharedStrings.xml")
    return ["".join(x.text or "" for x in si.iter(tag("t"))) for si in root.findall("m:si", NS)]


def sheet_cells(zf, sheet_name, strings):
    root = read_xml(zf, f"xl/worksheets/{sheet_name}.xml")
    result = {}
    for cell in root.findall(".//m:c", NS):
        ref = cell.attrib.get("r")
        if not ref:
            continue
        value = cell.find("m:v", NS)
        if value is None:
            text = ""
        else:
            text = value.text or ""
            if cell.attrib.get("t") == "s":
                text = strings[int(text)]
        result[ref] = {
            "value": text,
            "style_id": int(cell.attrib.get("s", "0")),
        }
    return result


def parse_styles(zf):
    root = read_xml(zf, "xl/styles.xml")
    borders = []
    for border in root.find("m:borders", NS):
        sides = {}
        for side in ("left", "right", "top", "bottom"):
            node = border.find("m:" + side, NS)
            if node is None:
                sides[side] = {"style": "", "color": ""}
                continue
            color = node.find("m:color", NS)
            sides[side] = {
                "style": node.attrib.get("style", ""),
                "color": (color.attrib.get("rgb") or color.attrib.get("indexed") or color.attrib.get("theme") or "") if color is not None else "",
            }
        borders.append(sides)
    xfs = root.find("m:cellXfs", NS)
    style_to_border = [int(x.attrib.get("borderId", "0")) for x in xfs]
    return borders, style_to_border


def col_name(number):
    out = ""
    while number:
        number, rem = divmod(number - 1, 26)
        out = chr(65 + rem) + out
    return out


# 256 版式唯一干净的框体色带：顶边中央偏右（星标右缘之后、右上角角色/属性小圆标
# 之前）。旧 135 版式沿外框向内探測的取法在 256 上会吃到 EX 徽章/星标/叠放圆标。
FRAME_SAMPLE_BOX = (0.47, 0.055, 0.72, 0.086)
# 与最近属性中心的最大欧氏距离：实测 653 张全部距离 0（平涂框体即中心色），
# 26 留给渐变/非属性框（如聚光位金框）——判不出属性时交回 match 阶段走全候选池。
FRAME_MAX_DIST = 26.0


def frame_color_rgb(image):
    """从顶部中央色带取框体色：不透明像素取中位，再剔除抗锯齿/徽章边缘的离群点
    做二次中位。返回 RGB 或 None（采样不足）。"""
    rgba = image.convert("RGBA")
    width, height = rgba.size
    px = rgba.load()
    x0, y0, x1, y1 = (
        int(FRAME_SAMPLE_BOX[0] * width), int(FRAME_SAMPLE_BOX[1] * height),
        int(FRAME_SAMPLE_BOX[2] * width), int(FRAME_SAMPLE_BOX[3] * height),
    )
    samples = [px[x, y][:3] for y in range(y0, y1) for x in range(x0, x1) if px[x, y][3] >= 200]
    if len(samples) < 20:
        return None
    samples.sort()
    med = samples[len(samples) // 2]
    inliers = sorted(p for p in samples if max(abs(p[i] - med[i]) for i in range(3)) < 22)
    if len(inliers) < 20:
        return None
    return inliers[len(inliers) // 2]


def classify_type(rgb):
    if rgb is None:
        return "", ""
    nearest, dist2 = min(
        ((item, sum((a - b) ** 2 for a, b in zip(rgb, item[0]))) for item in TYPE_FRAME_COLORS),
        key=lambda pair: pair[1],
    )
    if dist2 ** 0.5 > FRAME_MAX_DIST:
        return "", ""
    return "#%02X%02X%02X" % rgb, nearest[1]


def region_vector(image, box, size=16):
    """按相对比例裁剪指定区域，白地合成透明区后压成固定向量。

    box=(x0, y0, x1, y1)，取图片宽高的相对比例。
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    crop = rgba.crop((int(width * box[0]), int(height * box[1]),
                      int(width * box[2]), int(height * box[3])))
    crop = crop.resize((size, size), Image.Resampling.LANCZOS)
    vector = []
    for r, g, b, a in crop.getdata():
        alpha = a / 255
        vector += [round((r * alpha + 255 * (1 - alpha)) / 255, 6),
                   round((g * alpha + 255 * (1 - alpha)) / 255, 6),
                   round((b * alpha + 255 * (1 - alpha)) / 255, 6)]
    return vector


# 人物头像在偏左的中部；搭档宝可梦在右下角六边形徽章里。
PERSON_BOX = (0.03, 0.2, 0.62, 0.82)
POKEMON_BOX = (0.5, 0.55, 1.0, 1.0)


def image_features(data):
    sha = hashlib.sha256(data).hexdigest()
    with Image.open(__import__("io").BytesIO(data)) as source:
        width, height = source.size
        frame_rgb = frame_color_rgb(source)
        edge_color, pokemon_type = classify_type(frame_rgb)
        person_region = region_vector(source, PERSON_BOX)
        pokemon_region = region_vector(source, POKEMON_BOX)
        image = source.convert("RGB")
        # 小尺寸固定向量便于后续直接做余弦/欧氏距离匹配，无需 numpy；32x32 保住框体与异色细节。
        small = image.resize((32, 32), Image.Resampling.LANCZOS)
        pixels = list(small.getdata())
        vector = [round(channel / 255, 6) for pixel in pixels for channel in pixel]
        gray = image.resize((9, 8), Image.Resampling.LANCZOS).convert("L")
        gp = list(gray.getdata())
        dhash = "".join("1" if gp[y * 9 + x] > gp[y * 9 + x + 1] else "0" for y in range(8) for x in range(8))
        ahash_image = image.resize((8, 8), Image.Resampling.LANCZOS).convert("L")
        ap = list(ahash_image.getdata())
        average = sum(ap) / len(ap)
        ahash = "".join("1" if p >= average else "0" for p in ap)
        edge = [pixels[x][0] + pixels[x][1] + pixels[x][2] for x in range(32)]
        edge += [pixels[31 * 32 + x][0] + pixels[31 * 32 + x][1] + pixels[31 * 32 + x][2] for x in range(32)]
        edge += [pixels[y * 32][0] + pixels[y * 32][1] + pixels[y * 32][2] for y in range(32)]
        edge += [pixels[y * 32 + 31][0] + pixels[y * 32 + 31][1] + pixels[y * 32 + 31][2] for y in range(32)]
        return {
            "sha256": sha,
            "width": width,
            "height": height,
            "边缘颜色": edge_color,
            "属性": pokemon_type,
            "ahash64": format(int(ahash, 2), "016x"),
            "dhash64": format(int(dhash, 2), "016x"),
            "rgb32x32": json.dumps(vector, separators=(",", ":")),
            "人物区域rgb16x16": json.dumps(person_region, separators=(",", ":")),
            "宝可梦区域rgb16x16": json.dumps(pokemon_region, separators=(",", ":")),
            "edge_rgb_sum": json.dumps(edge, separators=(",", ":")),
        }


def main():
    rank_dir = Path(__file__).resolve().parent
    source = Path(sys.argv[1] if len(sys.argv) > 1 else rank_dir / "榜单.xlsx")
    output = Path(sys.argv[2] if len(sys.argv) > 2 else rank_dir / "工作区")
    output.mkdir(parents=True, exist_ok=True)
    image_dir = output / "头像原图"
    # 每次重抽前清空：旧榜单遗留的不同尺寸/不同拍组头像会污染目录，匹配阶段只认
    # 本次 CSV 引用的文件，残留图只会造成误判与磁盘堆积。
    shutil.rmtree(image_dir, ignore_errors=True)
    image_dir.mkdir(parents=True)

    with ZipFile(source) as zf:
        strings = shared_strings(zf)
        borders, style_to_border = parse_styles(zf)
        rows = []
        # 用户指定只处理第一个工作表，避免把停更榜和隐藏模板混入结果。
        for sheet_number in (1,):
            sheet = f"sheet{sheet_number}"
            cells = sheet_cells(zf, sheet, strings)
            drawing = read_xml(zf, f"xl/drawings/drawing{sheet_number}.xml")
            rel_root = ET.fromstring(zf.read(f"xl/drawings/_rels/drawing{sheet_number}.xml.rels"))
            rels = {x.attrib["Id"]: x.attrib["Target"] for x in rel_root}
            for anchor in list(drawing):
                frm = anchor.find("xdr:from", NS)
                pic = anchor.find("xdr:pic", NS)
                if frm is None or pic is None:
                    continue
                row = int(frm.find("xdr:row", NS).text) + 1
                col = int(frm.find("xdr:col", NS).text) + 1
                cell_ref = f"{col_name(col)}{row}"
                blip = pic.find(".//a:blip", NS)
                relation = blip.attrib.get(R_ID + "embed")
                target = rels[relation]
                image_path = posixpath.normpath(posixpath.join("xl/drawings", target))
                data = zf.read(image_path)
                features = image_features(data)
                image_name = f"工作表{sheet_number}_{cell_ref}_{features['sha256'][:12]}.{target.rsplit('.', 1)[-1]}"
                (image_dir / image_name).write_bytes(data)

                cell = cells.get(cell_ref, {"value": "", "style_id": 0})
                style_id = cell["style_id"]
                border_id = style_to_border[style_id] if style_id < len(style_to_border) else 0
                border = borders[border_id] if border_id < len(borders) else {}
                features.update({
                    "工作表": sheet,
                    "工作表名称": {"sheet1": "宝大师节奏榜田鸡榜", "sheet2": "蛋糕推荐排行榜（停更）", "sheet3": "模板"}[sheet],
                    "锚点单元格": cell_ref,
                    "行": row,
                    "列": col,
                    "原始图片路径": image_path,
                    "导出图片": str(Path("头像原图") / image_name),
                    "单元格值": cell["value"],
                    "样式ID": style_id,
                    "边框ID": border_id,
                    "边框": json.dumps(border, ensure_ascii=False, separators=(",", ":")),
                    "大师标识候选": "待用标注样本确认",
                    "拍组名称": "",
                    "匹配置信度": "",
                })
                rows.append(features)

    fields = ["工作表", "工作表名称", "锚点单元格", "行", "列", "原始图片路径", "导出图片", "单元格值", "样式ID", "边框ID", "边框", "边缘颜色", "属性", "大师标识候选", "拍组名称", "匹配置信度", "sha256", "width", "height", "ahash64", "dhash64", "rgb32x32", "人物区域rgb16x16", "宝可梦区域rgb16x16", "edge_rgb_sum"]
    with (output / "拍组图片特征.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"提取完成：{len(rows)} 张图片，结果目录：{output}")


if __name__ == "__main__":
    main()
