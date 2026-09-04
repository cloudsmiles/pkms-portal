#!/usr/bin/env python3
"""用 ResNet50 深度特征把榜单头像匹配到带名称的 ★6ex 图库。

三信号 + 一一对应：
1. 属性粗筛——data.js 里每个拍组的 attributes 即同步招属性，与榜单头像框色（提取阶段
   已判定，等于右上角属性徽章颜色）一致；候选只保留同属性，属性本身由真值给出，不靠像素猜。
2. 深度特征精排——ResNet50 倒数第二层特征 + 余弦相似度，融合人物（脸+发梢+肩衣，
   主身份；查询/图库用各自布局的裁框，上沿压到星/EX 徽章之下）、搭档宝可梦（右下，
   分同属性撞脸）、左下勋章（大师/阿爾套裝等的金 M 徽章）三个区域。查询没有金勋章时
   勋章通道只有噪声，自动丢弃、权重并入人物/宝可梦两项。
3. 一一对应指派——榜单里每个拍组只出现一次，按【置信度优先】贪心锁定：每轮让冠亚差
   最大（最确定）的查询先占走最佳候选并从其余池剔除；模糊查询排最后、只取剩余候选，
   既避免一对多，也避免不确定的选择提前占用图片、挤掉真正属于它的高置信查询。
   候选只取 data.js 里有属性真值的 ★6ex（重导副本/低进化孤儿一律不参与比较）。

需在装了 torch/torchvision 的环境运行（portal 无 venv，借用 match 项目的）：
/Users/winniehe/project/match/.venv/bin/python match_pairs.py
前置：先 `npm run build`（产出 ../dist/data.js 属性真值）并跑过 extract_features.py。
"""

import csv
import json
import os
import sys
from pathlib import Path

from PIL import Image

import torch
import torch.nn.functional as F
from torchvision import transforms
from torchvision.models import resnet50, ResNet50_Weights

RANK_DIR = Path(__file__).resolve().parent
PORTAL_DIR = RANK_DIR.parent
# 属性真值来自 build 产物 dist/data.js（跑本脚本前先在 portal 根目录 `npm run build` 一次）。
DATA_JS = PORTAL_DIR / "dist" / "data.js"
# 中间产物（特征 CSV、导出头像、图库深度特征缓存）都落在 rank/工作区/。
WORK_DIR = RANK_DIR / "工作区"
# 人物区域（相对坐标），两种版式各一：上沿压到星星/彩虹 EX 徽章【之下】。顶部那一排金星和
# 彩虹 EX 每张图都一样（属于通用 UI，不是身份），留着会稀释人脸特征，还会跟候选立绘里同位
# 置的金色元素假匹配（例如鸭舌帽上的金色帽徽会被金星误加成）。框内保留脸、四周发梢/发帘、
# 肩背衣着这些真正区分训练家的部分；右侧仍切掉属性徽章/宝可梦前景。带框缩略图（榜单）上沿
# 更低（卡内角色更小、UI 占比更大），满铺立绘（图库）略高。
RANK_PERSON_CROP = (0.10, 0.33, 0.66, 0.88)
GAL_PERSON_CROP = (0.10, 0.30, 0.74, 0.94)
# 搭档宝可梦区域：榜单头像里是右下六边形徽章，图库立绘里宝可梦铺在右下前景；两种版式
# 用同一相对框都能框住宝可梦本体（已可视化校准）。
POKE_CROP = (0.58, 0.58, 1.0, 1.0)
# 左下勋章（大师/阿爾套裝等的金 M 徽章）。两种版式里勋章位置不同：带框缩略图压在左下角，
# 满铺立绘在左缘偏下；分别用各自相对框裁（已按网格可视化校准）。
RANK_MEDAL_CROP = (0.0, 0.66, 0.28, 1.0)
GAL_MEDAL_CROP = (0.0, 0.42, 0.30, 0.84)
# 融合权重：人物脸是主身份，宝可梦区分同属性撞脸，勋章用于认大师/套裝拍组。
W_PERSON, W_POKE, W_MEDAL = 0.5, 0.3, 0.2
# 勋章不是每张都有：约 1/6 的拍组（普通 6EX）左下没有金 M 勋章，这时勋章通道只采到背景/
# 宝可梦边缘，余弦是纯噪声、会把正确候选压下去（实测 F42/F108 都被勋章分坑错）。按勋章区
# 【金色像素占比】判断查询有没有勋章：有则三项融合，没有则丢弃勋章、权重在人/宝两项间归一。
# 金色占比实测：有勋章 ≥0.10、无勋章 ≈0（75 分位仅 0.018），阈值 0.08 间隔干净。
MEDAL_GOLD_TH = 0.08
# 人物特征输入分辨率：源图仅 128/135px，裁紧面部后提到 256 让脸部占更多像素、身份更准。
EMBED_RES = 256
# 黑名单：图库（★6ex）里没有对应、根本不该参与匹配的榜单头像。全部靠【像素/特征自动判】，
# 不写死表格单元格——表格行列每次会变。
# (1) 主人公（玩家自创角色）：icons 目录不含主角。判别特征是那顶带 P 标志的鸭舌帽——
#     `主人公参考/` 里放几张主角头像模板（游戏素材，与表格无关），裁帽子区域取特征质心；
#     榜单头像帽子区域与质心余弦≥PROTO_COS 即判为主人公。实测主角 0.91~0.96、无帽的命名主角
#     （如優莉/赤紅）仅 0.78~0.85，间隔干净；男女主/换装变体都在内。
# (2) 三星拍组：左上星级只有上排 3 颗金星、下排是暗色空星剪影；图库全是 ★6ex，无对应。
PROTO_TMPL_DIR = Path(__file__).resolve().parent / "主人公参考"
PROTO_CAP_CROP = (0.18, 0.13, 0.82, 0.52)  # 鸭舌帽区域（帽檐+P 标志），放大裁头顶
PROTO_COS = 0.90

# 提取脚本里框色用简体标签，data.js attributes 用繁体。
S2T = {
    "水": "水", "草": "草", "火": "火", "电": "電", "妖精": "妖精", "幽灵": "幽靈",
    "恶": "惡", "飞行": "飛行", "冰": "冰", "一般": "一般", "龙": "龍", "超能力": "超能力",
    "钢": "鋼", "毒": "毒", "岩石": "岩石", "地面": "地面", "格斗": "格鬥", "虫": "蟲",
}

def _make_transform(res):
    return transforms.Compose([
        transforms.Resize((res, res)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def load_ex_truth():
    """从 build 产物 dist/data.js 读两份映射（都以 ★6ex 图标文件名作键）：
      ex2attr：图标文件名 → 该拍组的同步招属性集合（属性硬过滤真值）；
      ex2name：图标文件名 → data.js 里的权威拍组名 pair.name。
    拍组标识一律用 ex2name（data.js 自己的名字），不要用图标文件名 stem——图标文件名常用
    全角括号/全角数字、变体标签也可能与站点 pair.name 不同（如（冠軍）vs(2026週年慶)），
    直接拿文件名当键会和站点对不上；pair.name 是 build 合并时用的同一标识，保证一一对应。"""
    raw = DATA_JS.read_text(encoding="utf-8")
    data, _ = json.JSONDecoder().raw_decode(raw, raw.index("{"))
    ex2attr, ex2name = {}, {}
    for p in data["pairs"]:
        if not p.get("exImage"):
            continue
        base = os.path.basename(p["exImage"])
        ex2attr[base] = set(p["attributes"])
        ex2name[base] = p["name"]
    return ex2attr, ex2name


def build_model(device):
    model = torch.nn.Sequential(*list(resnet50(weights=ResNet50_Weights.DEFAULT).children())[:-1])
    model.eval().to(device)
    return model


def open_rgb(path):
    with Image.open(path) as im:
        rgba = im.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    bg.alpha_composite(rgba)
    return bg.convert("RGB")


def crop_roi(im, box):
    w, h = im.size
    x0, y0, x1, y1 = box
    return im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))


def _is_gold(r, g, b):
    return r > 190 and 150 < g < 235 and b < 140 and r - b > 70 and g - b > 45


def _is_dark(r, g, b):
    return r < 90 and g < 90 and b < 90


def is_three_star(im):
    """三星拍组：左上星级区下排两颗（y≈0.225）是空的暗色星剪影、无金星填充；6 星 EX 的
    下排两颗都是金星。实测 603 张里三星下槽暗像素 36~38、金≤11，6 星下槽全是强金，间隔干净。"""
    w, h = im.size
    px = im.load()

    def slot(cx, cy, half=6):
        goldn = darkn = 0
        for dy in range(-half, half + 1):
            for dx in range(-half, half + 1):
                x, y = int(cx * w) + dx, int(cy * h) + dy
                if 0 <= x < w and 0 <= y < h:
                    r, g, b = px[x, y][:3]
                    if _is_gold(r, g, b):
                        goldn += 1
                    elif _is_dark(r, g, b):
                        darkn += 1
        return goldn, darkn

    bot = [slot(cx, 0.225) for cx in (0.075, 0.16)]
    return all(g <= 20 for g, _ in bot) and any(d > 30 for _, d in bot)


def has_ex_badge(im):
    """EX 徽章是彩虹渐变（蓝紫青黄绿橙多色高饱和），位于星星右侧。关键是【色相种类多】而非彩
    色像素多——无 EX 的 5 星该区域也有金星+框色（黄+绿，彩色像素多但只有 2 种色相）。统计徽章
    区内出现的鲜艳色相桶数：6EX 有 4+ 种（实测 4~6），无 EX 的 3 星/5 星只有 0~2 种。"""
    w, h = im.size
    px = im.load()
    x0, y0, x1, y1 = int(0.36 * w), int(0.14 * h), int(0.62 * w), int(0.34 * h)
    buckets = [0] * 6  # 黄/橙/绿/青/蓝/紫
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y][:3]
            if max(r, g, b) - min(r, g, b) < 55:  # 低饱和灰/肤色/白不算
                continue
            if r > 180 and g > 150 and b < 130:
                buckets[0] += 1
            elif r > 200 and 90 < g < 180 and b < 100:
                buckets[1] += 1
            elif g > 130 and r < 170 and b < 160 and g - r > 20:
                buckets[2] += 1
            elif g > 150 and b > 150 and r < 130:
                buckets[3] += 1
            elif b > 160 and r < 150 and b - g > 15:
                buckets[4] += 1
            elif r > 130 and b > 170 and g < 130:
                buckets[5] += 1
    return sum(1 for v in buckets if v >= 8) >= 4


def medal_gold_frac(im, box):
    """勋章区内金色像素占比（降采样步长 2）。金 M 勋章占比 ≥0.10，无勋章区域 ≈0。"""
    w, h = im.size
    x0, y0, x1, y1 = box
    x0, y0, x1, y1 = int(w * x0), int(h * y0), int(w * x1), int(h * y1)
    px = im.load()
    gold = tot = 0
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            r, g, b = px[x, y][:3]
            tot += 1
            if _is_gold(r, g, b):
                gold += 1
    return gold / tot if tot else 0.0


@torch.no_grad()
def embed(model, paths, device, box, res=EMBED_RES, batch=32):
    tf = _make_transform(res)
    out = []
    for start in range(0, len(paths), batch):
        tensors = torch.stack([tf(crop_roi(open_rgb(p), box)) for p in paths[start:start + batch]])
        feat = model(tensors.to(device)).flatten(1)
        out.append(F.normalize(feat, dim=1).cpu())
    return torch.cat(out) if out else torch.empty(0)


def candidate_embeddings(model, device, paths, cache_path):
    """图库静态、量大，缓存人物/宝可梦/勋章三套特征（按文件名清单+分辨率+裁框版本失效）。"""
    names = [p.name for p in paths]
    # 裁框/逻辑变了要 bump，让旧缓存（用旧人物裁框算的 person）失效重算。
    cache_ver = 2
    if cache_path.exists():
        cached = torch.load(cache_path, map_location="cpu")
        if (cached.get("names") == names and cached.get("res") == EMBED_RES
                and cached.get("ver") == cache_ver
                and all(k in cached for k in ("person", "poke", "medal"))):
            return cached["person"], cached["poke"], cached["medal"]
    person = embed(model, paths, device, GAL_PERSON_CROP)
    poke = embed(model, paths, device, POKE_CROP)
    medal = embed(model, paths, device, GAL_MEDAL_CROP)
    torch.save({"names": names, "res": EMBED_RES, "ver": cache_ver,
                "person": person, "poke": poke, "medal": medal}, cache_path)
    return person, poke, medal


def main():
    feature_dir = Path(sys.argv[1] if len(sys.argv) > 1 else WORK_DIR)
    icon_dir = Path(sys.argv[2] if len(sys.argv) > 2 else PORTAL_DIR / "sync-grid" / "icons")
    output = Path(sys.argv[3] if len(sys.argv) > 3 else feature_dir / "拍组匹配结果.csv")
    cache_path = feature_dir / "候选图库深度特征.pt"

    ex2attr, ex2name = load_ex_truth()
    # 候选只保留 data.js 里有属性真值的拍组：①★6exrole_* 换装变体（榜单头像不含爱心徽章）；
    # ②data.js 未引用的孤儿图标（重导副本如「阪木」、同人物低进化阶段如「阿馴&波加曼」）都不参与
    # 比较——孤儿没有属性真值，当通配会跨属性误配（水属阿馴配进虫/超能力池）。
    candidates = sorted(p for p in icon_dir.glob("★6ex*")
                        if "role" not in p.name.lower() and p.name in ex2attr)

    # 查询 = 方形拍组头像。榜单里大部分是 135×135 缩略图，但高规格拍组（冠军/大师/周年等
    # 聚光位）会被贴成 128×128 或 240×240 的大/小瓷砖——它们同样是要匹配上榜的拍组，不能按
    # 尺寸丢了。列 B 等级徽章是 160~2048、列 D 子级数字是 24~38、分节横幅 C2 是 1024，均不在
    # {128,135,240} 白名单内，靠尺寸即可与头像分开（不写死表格位置）。
    def is_avatar(r):
        try:
            w, h = int(r["width"]), int(r["height"])
        except (TypeError, ValueError):
            return False
        return w == h and w in (128, 135, 240)

    with (feature_dir / "拍组图片特征.csv").open(encoding="utf-8-sig", newline="") as f:
        queries = [r for r in csv.DictReader(f) if is_avatar(r)]
    # 非 135 聚光位（128/240）：彩虹/大师框不带属性色，且小/大瓷砖框色采样不稳（实测 240 多误判
    # 成岩石、128 红框在格斗/火之间、橄榄框在岩石/虫之间误判），属性硬过滤会把正确候选挡在池外
    # （H9 炎帝因红框误判格斗进不了火池、F12 遠古巨蜓因误判岩石进不了虫池而漏配）。这类查询改全
    # 候选池比深度特征（人脸是主身份），并【一律人工复核】兜底，避免错配。
    query_spotlight = {qi for qi, r in enumerate(queries) if r["width"] != "135"}
    query_paths = [feature_dir / r["导出图片"] for r in queries]

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = build_model(device)
    print(f"设备：{device}；候选 {len(candidates)}，查询 {len(queries)}，正在提取深度特征…")
    cand_person, cand_poke, cand_medal = candidate_embeddings(model, device, candidates, cache_path)
    query_person = embed(model, query_paths, device, RANK_PERSON_CROP)
    query_poke = embed(model, query_paths, device, POKE_CROP)
    query_medal = embed(model, query_paths, device, RANK_MEDAL_CROP)
    # 查询有无金 M 勋章：没有就不融勋章通道（纯噪声），权重在人/宝两项间归一。
    query_has_medal = [
        medal_gold_frac(open_rgb(p), RANK_MEDAL_CROP) >= MEDAL_GOLD_TH for p in query_paths
    ]
    w_person2 = W_PERSON / (W_PERSON + W_POKE)
    w_poke2 = W_POKE / (W_PERSON + W_POKE)

    # 黑名单（全部按图像自动判，不写死表格单元格——表格每次会变）：
    #  主人公：`主人公参考/` 模板头像的【帽子区域】特征质心；榜单头像帽子区余弦≥PROTO_COS 即命中
    #         （戴 P 标志鸭舌帽的玩家自创角色；无帽的命名主角如優莉/赤紅分很低）。
    #  三星：下排星槽是暗色空星剪影。两类图库（★6ex）都无对应，不参与匹配、不占候选。
    tmpl_paths = sorted(PROTO_TMPL_DIR.glob("*.png"))
    tmpl_cap = embed(model, tmpl_paths, device, PROTO_CAP_CROP)
    cap_cent = F.normalize(tmpl_cap.mean(0, keepdim=True), dim=1)
    query_cap = embed(model, query_paths, device, PROTO_CAP_CROP)
    proto_cos = (query_cap @ cap_cent.T).squeeze(1)
    proto = {qi for qi in range(len(queries)) if float(proto_cos[qi]) >= PROTO_COS}
    # 无 EX 徽章 = 非 6EX（图库全是 6EX 立绘）：含 3 星（下排星槽暗色空剪影）和 5 星无 EX。
    # 按“宁可不出匹配也不要错配”，一律拉黑、不占候选。
    no_ex = {qi for qi, p in enumerate(query_paths) if not has_ex_badge(open_rgb(p))}
    star3 = {qi for qi in no_ex if is_three_star(open_rgb(query_paths[qi]))}

    def _reason(qi):
        if qi in proto:
            return "主人公"
        if qi in star3:
            return "三星拍组"
        return "非EX(五星)"

    blacklist = {qi: _reason(qi) for qi in proto | no_ex}
    active = [qi for qi in range(len(queries)) if qi not in blacklist]
    print(f"黑名单 {len(blacklist)} 张不匹配（主人公 {len(proto)}、非EX {len(no_ex - proto)}），"
          f"参与匹配 {len(active)} 张。")

    # 每个参与匹配的查询，在其同属性候选池内算三套余弦并融合，得到按融合分降序的候选排名。
    rankings = [None] * len(queries)
    for qi in active:
        q_type = S2T.get(queries[qi].get("属性", ""), "")
        if qi in query_spotlight:
            # 聚光位框色不可靠：全候选池比深度特征（身份仍由人脸/宝可梦决定），强制复核。
            pool = torch.arange(len(candidates), dtype=torch.long)
        else:
            # 严格同属性池：候选都在 data.js 有属性真值，框色=搭档属性，不再留通配。
            pool = torch.tensor([
                ci for ci, p in enumerate(candidates) if q_type in ex2attr[p.name]
            ], dtype=torch.long)
        person_sim = query_person[qi] @ cand_person[pool].T
        poke_sim = query_poke[qi] @ cand_poke[pool].T
        medal_sim = query_medal[qi] @ cand_medal[pool].T
        if query_has_medal[qi]:
            fused = W_PERSON * person_sim + W_POKE * poke_sim + W_MEDAL * medal_sim
            msim_disp = medal_sim
        else:
            # 无勋章：丢掉纯噪声的勋章通道，人/宝权重归一（0.625/0.375）。
            fused = w_person2 * person_sim + w_poke2 * poke_sim
            msim_disp = torch.zeros_like(fused)
        order = torch.argsort(fused, descending=True)
        rankings[qi] = [
            (int(pool[int(j)]), float(fused[int(j)]),
             float(person_sim[int(j)]), float(poke_sim[int(j)]), float(msim_disp[int(j)]))
            for j in order
        ]

    # 一一对应贪心指派（只在 active 查询上），按“置信度优先”：每轮挑出在剩余候选里
    # 【冠亚差最大】（最确定）的查询先锁定其最佳候选；模糊查询排最后，只从别人挑剩的候选里
    # 取，避免一个不确定的选择提前占用某张图、把真正属于它的高置信查询挤掉。
    def first_unused(qi, start):
        k = start
        rk = rankings[qi]
        while k < len(rk) and rk[k][0] in used:
            k += 1
        return k

    assigned = [None] * len(queries)
    used = set()
    for _ in active:
        pick_qi, pick_key, pick_best = None, None, None
        for qi in active:
            if assigned[qi] is not None:
                continue
            k1 = first_unused(qi, 0)
            if k1 >= len(rankings[qi]):
                continue
            best = rankings[qi][k1]
            k2 = first_unused(qi, k1 + 1)
            runner_fused = rankings[qi][k2][1] if k2 < len(rankings[qi]) else best[1] - 1.0
            # 主序是冠亚差（确定度），次序用融合分兜底。
            key = (best[1] - runner_fused, best[1])
            if pick_key is None or key > pick_key:
                pick_key, pick_qi, pick_best = key, qi, best
        if pick_qi is None:
            break
        assigned[pick_qi] = pick_best
        used.add(pick_best[0])

    rows = []
    for qi, row in enumerate(queries):
        # 黑名单行：不匹配、不占候选，只标注原因，沉底展示。
        if qi in blacklist:
            reason = blacklist[qi]
            for rank in range(1, 4):
                for suffix in ("", "分数", "人物分", "宝可梦分", "勋章分"):
                    row[f"候选{rank}{suffix}"] = ""
            row["最佳拍组名称"] = f"（{reason}·图库无对应）"
            row["冠亚差"] = row["匹配置信度"] = ""
            row["是否需复核"] = "否"
            row["无需匹配"] = "是"
            row["黑名单原因"] = reason
            row["改派"] = ""
            rows.append(row)
            continue
        if assigned[qi] is None:
            continue
        best_ci, best_fused, bp, bk, bm = assigned[qi]
        own = rankings[qi]
        # 置信度看【全池】冠亚差（该查询自己眼里第 1、2 名的差距，不受一一占用影响）；
        # 若锁定的不是它的全池首选（被更高置信查询先占走），标记「改派」转人工复核。
        top_ci, top_fused = own[0][0], own[0][1]
        runner_fused = own[1][1] if len(own) > 1 else top_fused - 1.0
        margin = top_fused - runner_fused
        reassigned = best_ci != top_ci
        # 展示前三候选：指派结果居首，其余取全池融合分最高者作参照。
        shown, seen = [(best_ci, best_fused, bp, bk, bm)], {best_ci}
        for entry in own:
            if len(shown) >= 3:
                break
            if entry[0] not in seen:
                shown.append(entry)
                seen.add(entry[0])
        for rank, (ci, fsim, psim, ksim, msim) in enumerate(shown, 1):
            row[f"候选{rank}"] = candidates[ci].name
            row[f"候选{rank}分数"] = f"{fsim:.4f}"
            row[f"候选{rank}人物分"] = f"{psim:.4f}"
            row[f"候选{rank}宝可梦分"] = f"{ksim:.4f}"
            row[f"候选{rank}勋章分"] = f"{msim:.4f}"
        best_path = candidates[best_ci]
        # 等级表以 data.js 的权威拍组名 pair.name 为键（build 合并用同一标识）；图标文件名只是它的 exImage。
        row["最佳拍组名称"] = ex2name.get(best_path.name) or (
            best_path.stem.split("_", 1)[1] if "_" in best_path.stem else best_path.stem)
        row["冠亚差"] = f"{margin:.4f}"
        row["匹配置信度"] = f"{max(0.0, min(1.0, margin / 0.08)):.4f}"
        # 融合分过低、全池冠亚差过小、首选被占而改派、或 240 聚光位（框色不可靠/全池匹配），
        # 都转人工复核。
        row["是否需复核"] = "是" if (best_fused < 0.72 or margin < 0.015
                                  or reassigned or qi in query_spotlight) else "否"
        row["无需匹配"] = "否"
        row["黑名单原因"] = ""
        row["改派"] = "是" if reassigned else "否"
        rows.append(row)

    # 排序：需复核的 active 行在前（置信度升序），其余 active 行居中，黑名单行沉底。
    def _sort_key(r):
        if r["无需匹配"] == "是":
            return (2, 0.0, r["锚点单元格"])
        conf = float(r["匹配置信度"]) if r["匹配置信度"] else 1.0
        return (0 if r["是否需复核"] == "是" else 1, conf, r["锚点单元格"])

    rows.sort(key=_sort_key)
    fields = list(rows[0]) if rows else []
    with output.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    review = sum(1 for r in rows if r["是否需复核"] == "是")
    skipped = sum(1 for r in rows if r["无需匹配"] == "是")
    print(f"匹配完成：{len(rows)} 张主图（参与匹配 {len(rows) - skipped}、黑名单 {skipped}），"
          f"候选图库 {len(candidates)} 张，需复核 {review} 张，结果：{output}")


if __name__ == "__main__":
    main()
