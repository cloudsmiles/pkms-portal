#!/usr/bin/env python3
"""rank 管線在「新版 256 頭像格式」上的回歸測試。

夾具：rank/测试头像/（21 張自當期榜單抽出的 256 頭像 + manifest.json 標註框色／
星級／EX 徽章／勳章預期）。256 是 2026-09 遊戲改版後的頭像尺寸，舊版管線的固定
像素座標（135 版式）在新格式上全數失效，這些測試鎖定新版幾何。

用帶 torch 的 venv 跑（match_pairs 依賴 torch）：
  /Users/winniehe/project/match/.venv/bin/python rank/test_rank_pipeline.py
"""

import csv
import json
import unittest
from pathlib import Path

from PIL import Image

import extract_features as ef
import match_pairs as mp

RANK_DIR = Path(__file__).resolve().parent
PORTAL_ICONS = RANK_DIR.parent / "sync-grid" / "icons"
FIX_DIR = RANK_DIR / "测试头像"
MANIFEST = json.loads((FIX_DIR / "manifest.json").read_text(encoding="utf-8"))


def fixture(name):
    return Image.open(FIX_DIR / f"{name}.png")


def open_rgb(im):
    rgba = im.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    bg.alpha_composite(rgba)
    return bg.convert("RGB")


class FrameColorTests(unittest.TestCase):
    """框色＝搭檔寶可夢屬性真值。256 頂部色帶用相對區間取中位數。"""

    def test_eighteen_types_classified_on_256_fixtures(self):
        for cell, expected in MANIFEST["frames"].items():
            with fixture(cell) as im:
                rgb = ef.frame_color_rgb(im)
            self.assertIsNotNone(rgb, f"{cell} 應取得到框色")
            _hex, label = ef.classify_type(rgb)
            self.assertEqual(label, expected, f"{cell} 框色屬性")

    def test_s2t_covers_every_extractor_label(self):
        labels = {label for _center, label in ef.TYPE_FRAME_COLORS}
        self.assertEqual(set(mp.S2T), labels)


class AvatarShapeTests(unittest.TestCase):
    def test_is_avatar_accepts_square_avatar_sizes(self):
        for size in (128, 135, 240, 256):
            self.assertTrue(mp.is_avatar_row({"width": str(size), "height": str(size)}), size)

    def test_is_avatar_rejects_badges_digits_banners_rectangles(self):
        for w, h in ((170, 170), (32, 32), (1024, 1024), (2048, 2048), (256, 128), ("", "")):
            self.assertFalse(mp.is_avatar_row({"width": w, "height": h}), (w, h))


class StarAndExTests(unittest.TestCase):
    def test_three_star_slots_on_new_layout(self):
        for cell, expected in MANIFEST["three_star"].items():
            with fixture(cell) as im:
                self.assertEqual(mp.is_three_star(open_rgb(im)), expected, cell)

    def test_ex_and_five_star_not_three_star(self):
        for cell in MANIFEST["three_star_neg"]:
            with fixture(cell) as im:
                self.assertFalse(mp.is_three_star(open_rgb(im)), cell)

    def test_ex_badge_presence(self):
        for cell, expected in MANIFEST["ex_badge"].items():
            with fixture(cell) as im:
                self.assertEqual(mp.has_ex_badge(open_rgb(im)), expected, cell)


class MedalTests(unittest.TestCase):
    """左下勳章貼紙：金章（星紫緞帶／圓紅緞帶）與灰章都要識別；黃色衣物／空框不可誤判。"""

    def test_medal_templates_committed(self):
        templates = sorted(mp.MEDAL_TMPL_DIR.glob("*.png"))
        self.assertGreaterEqual(len(templates), 5, "至少需金章 2 款＋灰章模板")

    def test_medal_detection_256(self):
        templates = mp.load_medal_templates()
        for cell, expected in MANIFEST["medal"].items():
            with fixture(cell) as im:
                self.assertEqual(mp.has_medal(open_rgb(im), templates), expected, cell)


class ProtagonistTemplateTests(unittest.TestCase):
    """256 新格式需有新主角模板；偵測改用對任一模板的最大餘弦（見 match_pairs.PROTO_COS）。"""

    def test_256_proto_templates_committed(self):
        # 256 模板只需男女綠帽主角各一（H80/I78）；覆蓋性由 ProtagonistDetectionTests
        # 對「不在模板集內」的 L71 仍能命中來保證，不靠堆模板數量。
        sizes = []
        for p in mp.PROTO_TMPL_DIR.glob("*.png"):
            with Image.open(p) as im:
                sizes.append(im.size)
        self.assertGreaterEqual(sum(1 for s in sizes if s == (256, 256)), 2)
        self.assertGreaterEqual(len(sizes), 10)

    def test_threshold_locked_to_validated_gap(self):
        # 全量實測：綠帽主角 0.964~1.0、戴帽有名角色最高 0.843，0.93 落於斷層中點。
        self.assertAlmostEqual(mp.PROTO_COS, 0.93, places=2)


class ProtagonistDetectionTests(unittest.TestCase):
    """戴 P 帽的【玩家主角】要抓出；同樣戴帽的【有名角色】不可誤抓。

    曾因把榜單查詢圖直接存成模板（自比＝1.0），小智（紅帽皮卡丘 G36）等 4 張被誤判
    主角而跳過匹配。L71 刻意不放入模板集，是「非自身比對」的正向保險。
    需 ResNet（本測試本來就要求 torch venv），模型只載一次。
    """

    POS = ["L71", "H80"]
    NEG = ["G36", "F52", "Q63", "H100"]

    @classmethod
    def setUpClass(cls):
        cls.model = mp.build_model("cpu")
        paths = [FIX_DIR / f"{c}.png" for c in cls.POS + cls.NEG]
        scores = mp.proto_scores(cls.model, "cpu", paths).tolist()
        cls.scores = dict(zip(cls.POS + cls.NEG, scores))

    def test_green_cap_protagonists_flagged(self):
        for cell in self.POS:
            self.assertGreaterEqual(self.scores[cell], mp.PROTO_COS,
                                    f"{cell} 為玩家主角，分數 {self.scores[cell]:.3f}")

    def test_named_cap_characters_not_flagged(self):
        for cell in self.NEG:
            self.assertLess(self.scores[cell], mp.PROTO_COS,
                            f"{cell} 是戴帽有名角色，不應判為主角，分數 {self.scores[cell]:.3f}")

    def test_gap_between_positive_and_negative(self):
        pos_min = min(self.scores[c] for c in self.POS)
        neg_max = max(self.scores[c] for c in self.NEG)
        self.assertGreater(pos_min, neg_max,
                           f"主角最低 {pos_min:.3f} 未高於有名角色最高 {neg_max:.3f}，門檻無斷層")


class HeroPairMatchTests(unittest.TestCase):
    """玩家主角查詢不進黑名單，而要對到 data.js 的「主角&Ｘ」拍組。

    主角拍組沒有 ★6ex 人物立繪，圖庫裡是僅含寶可夢的一般圖示，故走寶可夢＋勳章通道。
    L71＝爆肌蚊（蟲，有金章）、H80＝火稚雞（火，無章，同時是三星）。
    """

    EXPECT = {"L71": "主角&爆肌蚊", "H80": "主角&火稚雞"}

    @classmethod
    def setUpClass(cls):
        cls.hero = mp.hero_candidates(PORTAL_ICONS)
        cls.model = mp.build_model("cpu")
        cls.hp, cls.hm = mp.hero_embeddings(cls.model, "cpu", cls.hero)
        cls.templates = mp.load_medal_templates()

    def test_eleven_hero_pairs_available(self):
        names = {n for _p, n, _a in self.hero}
        self.assertGreaterEqual(len(names), 11)
        for want in self.EXPECT.values():
            self.assertIn(want, names)

    def test_hero_queries_match_correct_partner(self):
        for cell, want in self.EXPECT.items():
            q = FIX_DIR / f"{cell}.png"
            q_type = mp.S2T[MANIFEST["frames"][cell]]
            q_poke = mp.embed(self.model, [q], "cpu", mp.POKE_CROP)[0]
            q_medal = mp.embed(self.model, [q], "cpu", mp.RANK_MEDAL_CROP)[0]
            has = mp.has_medal(open_rgb(fixture(cell)), self.templates)
            ranked = mp.hero_ranking(q_poke, q_medal, has, q_type, self.hero, self.hp, self.hm)
            best_j, best_f, _, _ = ranked[0]
            got = self.hero[best_j][1]
            self.assertEqual(got, want, f"{cell} 應匹配 {want}，實得 {got} ({best_f:.3f})")


if __name__ == "__main__":
    unittest.main(verbosity=2)
