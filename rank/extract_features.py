#!/usr/bin/env python3
"""从宝可梦大师 EX 榜单 xlsx 中逐张提取图片和可复核特征。"""

import csv
import hashlib
import json
import posixpath
import re
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

from PIL import Image


# 头像框颜色即搭档宝可梦属性；色值为本表 603 张 135x135 头像右上角框体采样的聚类中心。
TYPE_FRAME_COLORS = [
    ((85, 184, 226), "水"),
    ((69, 158, 78), "草"),
    ((189, 52, 55), "火"),
    ((220, 180, 10), "电"),
    ((237, 155, 184), "妖精"),
    ((160, 115, 155), "幽灵"),
    ((74, 71, 89), "恶"),
    ((73, 113, 221), "飞行"),
    ((148, 201, 203), "冰"),
    ((150, 148, 147), "一般"),
    ((18, 132, 161), "龙"),
    ((195, 75, 120), "超能力"),
    ((127, 136, 156), "钢"),
    ((120, 74, 145), "毒"),
    ((133, 114, 95), "岩石"),
    ((151, 89, 57), "地面"),
    ((213, 119, 65), "格斗"),
    ((156, 181, 88), "虫"),
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


def frame_color_rgb(image):
    """从原图右上角框体取色：上边框直段(星星右侧) + 右边框上段(属性徽章上方)。

    取色在原图分辨率进行，缩到十几像素后 4~5px 的属性框会被彻底平均掉，
    这也是之前 16x16 向量里读不出框色的原因。
    """
    rgba = image.convert("RGBA")
    px = rgba.load()
    width, height = rgba.size
    samples = []

    def band(start_x, start_y, dx, dy):
        x, y = start_x, start_y
        for _ in range(25):
            if 0 <= x < width and 0 <= y < height and px[x, y][3] >= 200:
                break
            x += dx
            y += dy
        got = []
        for _ in range(6):
            if 0 <= x < width and 0 <= y < height:
                r, g, b, a = px[x, y]
                if a >= 200:
                    got.append((r, g, b))
            x += dx
            y += dy
        # 跳过最外侧 1~2px 半透明描边，取里面 4px 实色框体。
        return got[1:5] if len(got) >= 5 else got

    for x in range(68, min(119, width), 4):
        samples += band(x, 0, 0, 1)
    for y in range(12, min(30, height), 3):
        samples += band(width - 1, y, -1, 0)
    if len(samples) < 15:
        return None
    samples.sort()
    return samples[len(samples) // 2]


def classify_type(rgb):
    if rgb is None:
        return "", ""
    nearest = min(
        TYPE_FRAME_COLORS,
        key=lambda item: sum((a - b) ** 2 for a, b in zip(rgb, item[0])),
    )
    hex_value = "#%02X%02X%02X" % rgb
    return hex_value, nearest[1]


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
    image_dir.mkdir(exist_ok=True)

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
