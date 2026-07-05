import io
from typing import List, Optional, Tuple
from dataclasses import dataclass
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.path import Path
import matplotlib.patches as mpatches
import numpy as np


@dataclass
class FindingData:
    finding_type: str
    tooth_number: Optional[str] = None
    surface: Optional[str] = None
    severity: Optional[str] = None
    notes: Optional[str] = None


FINDING_CONFIG = {
    "Healthy Enamel":      {"color": "#ffffff",     "edge": "#b0a898", "priority": 0,  "badge": "H"},
    "Caries – Enamel":     {"color": "#d4a574",     "edge": "#8B4513", "priority": 5,  "badge": "CE"},
    "Caries – Dentin":     {"color": "#c4885c",     "edge": "#A0522D", "priority": 6,  "badge": "CD"},
    "Caries – Pulp":       {"color": "#b35959",     "edge": "#800000", "priority": 7,  "badge": "CP"},
    "Filling – Amalgam":   {"color": "#a0a0a0",     "edge": "#808080", "priority": 4,  "badge": "Am"},
    "Filling – Composite": {"color": "#f0d9b5",     "edge": "#c4a265", "priority": 4,  "badge": "Co"},
    "Filling – Gold":      {"color": "#f0c040",     "edge": "#DAA520", "priority": 4,  "badge": "Gd"},
    "Root Canal Treated":  {"color": "#d4a0e0",     "edge": "#7B2D8E", "priority": 9,  "badge": "RC"},
    "Crown – Porcelain":   {"color": "#e8e0d8",     "edge": "#c4b8a8", "priority": 8,  "badge": "C"},
    "Crown – Metal":       {"color": "#B0B0B0",     "edge": "#808080", "priority": 8,  "badge": "C"},
    "Crown – PFM":         {"color": "#d0c8c0",     "edge": "#a89880", "priority": 8,  "badge": "C"},
    "Bridge Pontic":       {"color": "#c8b8a0",     "edge": "#a08868", "priority": 8,  "badge": "BP"},
    "Bridge Abutment":     {"color": "#b0a090",     "edge": "#887868", "priority": 8,  "badge": "BA"},
    "Missing":             {"color": "#e0e0e0",     "edge": "#999999", "priority": 15, "badge": "M"},
    "Implant":             {"color": "#a0c8f0",     "edge": "#4A90D9", "priority": 14, "badge": "I"},
    "Root Stump":          {"color": "#c4a882",     "edge": "#8B7355", "priority": 13, "badge": "RS"},
    "Fracture":            {"color": "#ff8888",     "edge": "#FF4444", "priority": 10, "badge": "F"},
    "Attrition":           {"color": "#e8dcc8",     "edge": "#c4b498", "priority": 3,  "badge": "A"},
    "Abrasion":            {"color": "#d8c8b0",     "edge": "#b8a488", "priority": 3,  "badge": "Ab"},
    "Erosion":             {"color": "#c8d8e0",     "edge": "#90a8b8", "priority": 3,  "badge": "Er"},
    "Mobility Grade I":    {"color": "#ffffff",     "edge": "#FFA500", "priority": 2,  "badge": "M1"},
    "Mobility Grade II":   {"color": "#ffffff",     "edge": "#FF6600", "priority": 2,  "badge": "M2"},
    "Mobility Grade III":  {"color": "#ffffff",     "edge": "#FF0000", "priority": 2,  "badge": "M3"},
    "Calculus":            {"color": "#e8d090",     "edge": "#C49A3C", "priority": 2,  "badge": "Ca"},
    "Gingivitis":          {"color": "#ffffff",     "edge": "#e04040", "priority": 1,  "badge": "G"},
    "Periodontitis":       {"color": "#ffffff",     "edge": "#8B0000", "priority": 1,  "badge": "P"},
    "Periapical Lesion":   {"color": "#ffb0d0",     "edge": "#FF69B4", "priority": 11, "badge": "PL"},
    "Fluorosis":           {"color": "#f5e6d0",     "edge": "#d4bfa0", "priority": 3,  "badge": "Fl"},
    "Hypoplasia":          {"color": "#e8dcc8",     "edge": "#c4b498", "priority": 3,  "badge": "Hy"},
}

ADULT_TEETH = [
    (18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28),
    (48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38),
]

PRIMARY_TEETH = [
    (55, 54, 53, 52, 51, 61, 62, 63, 64, 65),
    (85, 84, 83, 82, 81, 71, 72, 73, 74, 75),
]


def _tooth_verts(tooth_num: int) -> Tuple[np.ndarray, np.ndarray]:
    """Generate anatomically accurate tooth vertices in normalized space."""
    digit = tooth_num % 10
    jaw_prefix = tooth_num // 10
    is_mirror = jaw_prefix in (2, 3, 6, 7)
    is_primary = jaw_prefix >= 5

    if is_primary:
        if digit <= 3:
            cw, ch, nw, rl, roots = 0.55, 0.32, 0.36, 0.36, 1
        else:
            cw, ch, nw, rl, roots = 0.60, 0.30, 0.40, 0.32, 2
    elif digit == 1:
        cw, ch, nw, rl, roots = 0.72, 0.38, 0.44, 0.46, 1
    elif digit == 2:
        cw, ch, nw, rl, roots = 0.64, 0.36, 0.42, 0.44, 1
    elif digit == 3:
        cw, ch, nw, rl, roots = 0.64, 0.44, 0.42, 0.50, 1
    elif digit in (4, 5):
        cw, ch, nw, rl, roots = 0.66, 0.36, 0.38, 0.44, 1
    elif digit in (6, 7):
        cw, ch, nw, rl, roots = (0.76, 0.38, 0.48, 0.42, 2) if digit == 6 else (0.70, 0.36, 0.46, 0.40, 2)
    else:
        cw, ch, nw, rl, roots = 0.62, 0.32, 0.40, 0.36, 2

    def w(x):
        return 1.0 - x if is_mirror else x

    ox = (1.0 - cw) / 2
    neck_y = ch
    end_y = ch + rl
    mid = 0.5
    verts = []

    # Root tip(s)
    if roots == 2:
        sp = ch + rl * 0.55
        verts.extend([
            (w(ox + 0.06), end_y), (w(ox + 0.04), end_y - 0.02),
            (w(ox + 0.06), sp + 0.04), (w(ox + 0.10), sp),
            (w(1 - ox - 0.10), sp), (w(1 - ox - 0.06), sp + 0.04),
            (w(1 - ox - 0.04), end_y - 0.02), (w(1 - ox - 0.06), end_y),
        ])
    else:
        verts.extend([
            (w(mid), end_y), (w(ox + 0.06), end_y - 0.04),
            (w(ox + 0.10), neck_y + rl * 0.55), (w(ox + 0.02), neck_y + rl * 0.25),
        ])

    verts.append((w(ox - 0.02), neck_y + 0.04))
    verts.append((w(ox), neck_y))

    digit = tooth_num % 10
    is_canine = digit == 3 and not is_primary
    is_molar_like = digit in (6, 7, 8) or (is_primary and digit >= 4)

    if is_canine:
        verts.extend([
            (w(ox + 0.04), neck_y - ch * 0.50),
            (w(ox + 0.10), neck_y - ch * 0.75),
            (w(mid - 0.04), 0.03), (w(mid), 0.0),
            (w(mid + 0.04), 0.03),
            (w(1 - ox - 0.10), neck_y - ch * 0.75),
            (w(1 - ox - 0.04), neck_y - ch * 0.50),
        ])
    elif is_molar_like:
        verts.extend([
            (w(ox + 0.04), neck_y - ch * 0.25),
            (w(ox + 0.18), 0.04), (w(ox + 0.30), 0.02),
            (w(mid), 0.02), (w(1 - ox - 0.30), 0.02),
            (w(1 - ox - 0.18), 0.04),
            (w(1 - ox - 0.04), neck_y - ch * 0.25),
        ])
    else:
        verts.extend([
            (w(ox + 0.04), neck_y - ch * 0.30),
            (w(ox + 0.15), 0.04),
            (w(mid - 0.08), 0.02), (w(mid + 0.08), 0.02),
            (w(1 - ox - 0.15), 0.04),
            (w(1 - ox - 0.04), neck_y - ch * 0.30),
        ])

    verts.append((w(1 - ox), neck_y))
    verts.append((w(1 - ox + 0.02), neck_y + 0.04))

    if roots == 2:
        verts.extend([
            (w(1 - ox - 0.10), sp), (w(1 - ox - 0.06), sp - 0.02),
        ])
    else:
        verts.extend([
            (w(1 - ox - 0.02), neck_y + rl * 0.25),
            (w(1 - ox - 0.10), neck_y + rl * 0.55),
            (w(1 - ox - 0.06), end_y - 0.04),
            (w(mid), end_y),
        ])

    codes = [Path.MOVETO] + [Path.CURVE4] * (len(verts) - 2) + [Path.CLOSEPOLY]
    return np.array(verts), np.array(codes)


def _get_primary_finding(findings: List[FindingData], key: str) -> Optional[FindingData]:
    match = [f for f in findings if f.tooth_number == key]
    if not match:
        return None
    match.sort(key=lambda f: FINDING_CONFIG.get(f.finding_type, {}).get("priority", 0), reverse=True)
    return match[0]


def _has_type(findings: List[FindingData], key: str, ftype: str) -> bool:
    return any(f.tooth_number == key and f.finding_type == ftype for f in findings)


def _has_base(findings: List[FindingData], key: str, base: str) -> bool:
    return any(f.tooth_number == key and f.finding_type.startswith(base) for f in findings)


def render_odontogram(
    findings: List[FindingData],
    use_primary: bool = False,
    dpi: int = 200,
) -> bytes:
    teeth = PRIMARY_TEETH if use_primary else ADULT_TEETH
    n = len(teeth[0])

    tw = 0.85
    th = 1.2
    gap = 0.04
    mg = 0.2
    ag = 0.4
    aw = n * (tw + gap) + mg
    fw = aw + 1.4
    fh = th * 2 + ag + 1.8

    fig, ax = plt.subplots(figsize=(fw, fh), facecolor="white")
    ax.set_xlim(0, fw)
    ax.set_ylim(0, fh)
    ax.axis("off")

    def draw_arch(row, yb, is_upper):
        mid = len(row) // 2
        for i, tn in enumerate(row):
            x = 0.5 + i * (tw + gap) + (mg if i >= mid else 0)
            y = yb
            key = str(tn)
            pf = _get_primary_finding(findings, key)
            verts, codes = _tooth_verts(tn)
            scaled = np.column_stack([verts[:, 0] * tw + x, verts[:, 1] * th + y])
            path = Path(scaled, codes)

            fc = pf and FINDING_CONFIG.get(pf.finding_type, {}).get("color", "#f0f0f0") or "#f0f0f0"
            ec = pf and FINDING_CONFIG.get(pf.finding_type, {}).get("edge", "#b0a898") or "#b0a898"

            is_missing = _has_type(findings, key, "Missing")
            if is_missing:
                fc = "#e0e0e0"
                ec = "#ccc"

            if _has_type(findings, key, "Root Stump"):
                fc = "#c4a882"
                ec = "#8B7355"
            elif _has_type(findings, key, "Implant"):
                fc = "#d0e4f0"
                ec = "#4A90D9"

            opacity = 0.45 if is_missing else 1.0

            ax.add_patch(mpatches.PathPatch(path, facecolor=fc, edgecolor=ec, linewidth=1.2, alpha=opacity, joinstyle="round"))

            # Shadow
            sv = scaled.copy()
            sv[:, 0] += 0.03
            sv[:, 1] -= 0.03
            ax.add_patch(mpatches.PathPatch(Path(sv, codes), facecolor="black", alpha=0.05, linewidth=0))

            # Missing: dashed overlay
            if is_missing:
                ax.add_patch(mpatches.PathPatch(path, facecolor="none", edgecolor="#999", linewidth=1.5, linestyle="dashed", alpha=0.5))

            # RCT
            if _has_type(findings, key, "Root Canal Treated") and not is_missing:
                cx, cy = x + tw / 2, y + th * 0.55
                ax.plot([cx - 0.06, cx - 0.03], [cy, cy + th * 0.3], color="#7B2D8E", linewidth=1.2)
                ax.plot([cx + 0.06, cx + 0.03], [cy, cy + th * 0.3], color="#7B2D8E", linewidth=1.2)

            # Fracture
            if _has_type(findings, key, "Fracture") and not is_missing:
                fx = x + tw * (0.35 if tn in (11, 21, 31, 41) else 0.55)
                ax.plot([fx, fx], [y + th * 0.05, y + th * 0.7], color="#FF4444", linewidth=1.2, linestyle="dashed")

            # Calculus
            if _has_type(findings, key, "Calculus") and not is_missing:
                ax.plot([x + 0.1, x + tw - 0.1], [y + th * 0.62, y + th * 0.62], color="#C49A3C", linewidth=2.5, alpha=0.6)

            # Gingivitis
            if _has_type(findings, key, "Gingivitis") and not is_missing:
                ax.add_patch(mpatches.Arc((x + tw / 2, y + th * 0.63), tw * 0.6, th * 0.1, angle=0, theta1=0, theta2=180, color="#e04040", linewidth=1.5, alpha=0.5))

            # Periodontitis
            if _has_type(findings, key, "Periodontitis") and not is_missing:
                py = y + th * 0.66
                ax.plot([x + 0.06, x + 0.12], [py, py - 0.04], color="#8B0000", linewidth=1)
                ax.plot([x + tw - 0.06, x + tw - 0.12], [py, py - 0.04], color="#8B0000", linewidth=1)

            # Periapical
            if _has_type(findings, key, "Periapical Lesion") and not is_missing:
                ax.add_patch(plt.Circle((x + tw / 2, y + th * 0.88), 0.05, fill=False, color="#FF69B4", linewidth=1.5, alpha=0.6))

            # Caries indicators
            if _has_base(findings, key, "Caries") and not is_missing:
                ax.plot(x + tw * 0.35, y + th * 0.35, "o", color="#8B4513", markersize=3, alpha=0.7)

            # Mobility
            if _has_base(findings, key, "Mobility") and not is_missing:
                my = y + (th * 0.92 if is_upper else th * 0.08)
                ax.plot(x + tw - 0.08, my, marker="v" if is_upper else "^", color="#FF6600", markersize=4)

            # Implant
            if _has_type(findings, key, "Implant") and not is_missing:
                cx, cy = x + tw / 2, y + th * 0.35
                for dy in [0.06, 0.12, 0.18]:
                    ax.plot([cx - 0.07, cx + 0.07], [cy + dy, cy + dy], color="#4A90D9", linewidth=1.2)
                ax.plot([cx, cx], [cy, y + th * 0.05], color="#4A90D9", linewidth=1.2)

            # Wear
            if any(_has_type(findings, key, t) for t in ("Attrition", "Abrasion", "Erosion")) and not is_missing:
                ax.plot(x + tw / 2, y + th * 0.04, marker="_", color="#c4b498", markersize=6, markeredgewidth=1.5)

            # Crown
            if _has_base(findings, key, "Crown") and not is_missing and not _has_type(findings, key, "Root Stump"):
                cx, cy = x + tw / 2, y + th * 0.85
                cv = np.array([
                    (x + 0.04, cy - th * 0.10), (x + 0.06, cy - th * 0.80),
                    (x + tw - 0.06, cy - th * 0.80), (x + tw - 0.04, cy - th * 0.10),
                ])
                cp = Path(cv, [Path.MOVETO, Path.CURVE4, Path.CURVE4, Path.CURVE4])
                ax.add_patch(mpatches.PathPatch(cp, facecolor="none", edgecolor="#b0a898", linewidth=1.0, linestyle="dashed"))

            # Tooth label
            ls = 5 if use_primary else 6
            ny = y + th * 0.88 if is_upper else y + th * 0.08
            ax.text(x + tw / 2, ny, str(tn), ha="center", va="center", fontsize=ls, fontweight="bold", color="#888", alpha=opacity)

    # Draw arches
    draw_arch(teeth[0], fh - 1.4, is_upper=True)
    draw_arch(teeth[1], 0.15, is_upper=False)

    # Labels
    mx = fw / 2
    ax.text(mx, fh - 0.04, "Maxillary (Upper) Arch", ha="center", fontsize=7, color="#999", style="italic")
    ax.text(mx, fh - 1.4 - th - 0.08, "Mandibular (Lower) Arch", ha="center", fontsize=7, color="#999", style="italic")

    # ── Legend ──
    used = set()
    for f in findings:
        if f.finding_type in FINDING_CONFIG and FINDING_CONFIG[f.finding_type]["priority"] > 0:
            used.add(f.finding_type)
    if not used:
        used = {"Caries – Enamel", "Missing", "Filling – Amalgam", "Root Canal Treated", "Calculus", "Fracture"}

    ly = 0.02
    lx = 0.3
    ax.text(lx, ly + 0.15, "Legend:", fontsize=5, va="center", fontweight="bold", color="#666")

    for ft in sorted(used, key=lambda t: FINDING_CONFIG.get(t, {}).get("priority", 0), reverse=True):
        cfg = FINDING_CONFIG.get(ft)
        if not cfg:
            continue
        label = ft.replace(" – ", ": ")
        ax.add_patch(mpatches.Rectangle((lx, ly), 0.07, 0.05, facecolor=cfg["color"], edgecolor=cfg["edge"], linewidth=0.5))
        ax.text(lx + 0.1, ly + 0.025, label, fontsize=4.2, va="center", color="#555")
        lx += max(len(label) * 0.04 + 0.18, 0.45)
        if lx > fw - 0.6:
            lx = 0.3
            ly -= 0.09

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight", pad_inches=0.15, facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()
