import io
import os
from typing import List, Optional
from dataclasses import dataclass
from matplotlib.patches import PathPatch
from matplotlib.path import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


@dataclass
class FindingData:
    finding_type: str
    tooth_number: Optional[str] = None
    notes: Optional[str] = None


FINDING_COLORS = {
    "Caries": "#c0392b", "Decay": "#c0392b", "Missing": "#555555",
    "Root Stump": "#8B4513", "Filled": "#2980b9", "Crown": "#d4a017",
    "Bridge": "#8e44ad", "Implant": "#7f8c8d", "Mobility": "#e67e22",
    "Calculus": "#f39c12", "Stains": "#a0522d", "Fracture": "#e74c3c",
    "Attrition": "#bdc3c7", "Abrasion": "#d5dbdb", "Erosion": "#f2d7d5",
    "Impaction": "#6c3483", "RCT Done": "#27ae60", "RCT Required": "#1abc9c",
    "Pocket": "#ff5733", "Tenderness": "#ff1493", "Periapical Lesion": "#800000",
    "Healthy": "#27ae60", "Other": "#95a5a6",
}

FINDING_PRIORITY = {
    "Missing": 100, "Implant": 95, "Root Stump": 90, "Impaction": 85,
    "Fracture": 80, "Bridge": 75, "Crown": 70, "RCT Done": 65,
    "Caries": 60, "Decay": 60, "RCT Required": 55, "Periapical Lesion": 50,
    "Pocket": 45, "Mobility": 40, "Tenderness": 35, "Filled": 30,
    "Calculus": 20, "Attrition": 15, "Abrasion": 15, "Erosion": 15,
    "Stains": 10, "Other": 5, "Healthy": 0,
}

ADULT_TEETH = [
    (18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28),
    (48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38),
]

PRIMARY_TEETH = [
    (55, 54, 53, 52, 51, 61, 62, 63, 64, 65),
    (85, 84, 83, 82, 81, 71, 72, 73, 74, 75),
]


def _tooth_path(is_molar: bool, is_upper: bool) -> List:
    """Return matplotlib Path vertices and codes for a tooth shape."""
    if is_molar:
        verts = [
            (6, 4), (6, 0), (12, 0), (32, 0), (38, 0), (38, 4),
            (36, 28), (36, 32), (32, 32), (28, 32), (28, 44),
            (28, 48), (24, 48), (20, 48), (20, 44), (20, 36),
            (18, 36), (18, 44), (18, 48), (14, 48), (10, 48),
            (10, 44), (10, 32), (8, 32), (4, 32), (4, 28), (6, 4),
        ]
    else:
        verts = [
            (6, 4), (6, 0), (12, 0), (32, 0), (38, 0), (38, 4),
            (36, 28), (36, 32), (32, 32), (28, 32), (28, 44),
            (28, 48), (22, 48), (16, 48), (16, 44), (16, 32),
            (12, 32), (8, 32), (4, 32), (4, 28), (6, 4),
        ]
    codes = [Path.MOVETO] + [Path.LINETO] * (len(verts) - 2) + [Path.CLOSEPOLY]
    return verts, codes


def _get_primary_finding(findings: List[FindingData], tooth_key: str) -> Optional[FindingData]:
    tf = [f for f in findings if f.tooth_number == tooth_key]
    if not tf:
        return None
    tf.sort(key=lambda f: FINDING_PRIORITY.get(f.finding_type, 0), reverse=True)
    return tf[0]


def render_odontogram(
    findings: List[FindingData],
    use_primary: bool = False,
    dpi: int = 150,
) -> bytes:
    """Render an odontogram SVG/PNG and return PNG bytes."""
    teeth = PRIMARY_TEETH if use_primary else ADULT_TEETH
    n_teeth = len(teeth[0])
    is_primary = use_primary

    tooth_w = 1.0
    tooth_h = 1.4
    gap = 0.08
    mid_gap = 0.3
    arch_gap = 0.5

    arch_w = n_teeth * (tooth_w + gap) + mid_gap
    fig_w = arch_w + 1.5
    fig_h = tooth_h * 2 + arch_gap + 1.5

    fig, ax = plt.subplots(figsize=(fig_w, fig_h), facecolor="white")
    ax.set_xlim(0, fig_w)
    ax.set_ylim(0, fig_h)
    ax.axis("off")

    def draw_arch(teeth_row, y_base, is_upper):
        mid = len(teeth_row) // 2
        for i, t_num in enumerate(teeth_row):
            if i < mid:
                x = 0.5 + i * (tooth_w + gap)
            else:
                x = 0.5 + i * (tooth_w + gap) + mid_gap
            y = y_base

            is_molar = t_num % 10 in (6, 7, 8, 5)
            verts, codes = _tooth_path(is_molar, is_upper)
            scaled_verts = [(vx / 40 * tooth_w + x, (1 - vy / 52) * tooth_h + y) for vx, vy in verts]
            path = Path(scaled_verts, codes)

            tooth_key = str(t_num)
            pf = _get_primary_finding(findings, tooth_key)
            color = FINDING_COLORS.get(pf.finding_type, "#f0f0f0") if pf else "#f0f0f0"
            is_missing = any(f.finding_type == "Missing" and f.tooth_number == tooth_key for f in findings)
            if is_missing:
                color = "#555555"

            patch = PathPatch(path, facecolor=color, edgecolor="#333" if is_missing else "#bbb", linewidth=1.5, joinstyle="round")
            ax.add_patch(patch)

            # Tooth label
            label_size = 6 if is_primary else 7
            ax.text(
                x + tooth_w / 2, y + tooth_h * (0.7 if is_upper else 0.3),
                str(t_num),
                ha="center", va="center",
                fontsize=label_size, fontweight="bold",
                color="white" if (pf or is_missing) else "#555",
            )

            # Missing cross
            if is_missing:
                ax.plot([x + 0.1, x + tooth_w - 0.1], [y + 0.1, y + tooth_h - 0.1], color="white", linewidth=2)
                ax.plot([x + tooth_w - 0.1, x + 0.1], [y + 0.1, y + tooth_h - 0.1], color="white", linewidth=2)

            # Crown indicator
            crown_f = [f for f in findings if f.tooth_number == tooth_key and f.finding_type == "Crown"]
            if crown_f and not is_missing:
                crown_y = y + tooth_h * 0.92
                ax.plot([x + 0.05, x + tooth_w - 0.05], [crown_y, crown_y], color="#d4a017", linewidth=3)

            # RCT indicator
            rct_f = [f for f in findings if f.tooth_number == tooth_key and f.finding_type == "RCT Done"]
            if rct_f and not is_missing:
                cx, cy = x + tooth_w / 2, y + tooth_h * (0.4 if is_upper else 0.6)
                ax.add_patch(plt.Circle((cx, cy), 0.08, color="white", zorder=3))

            # Mobility arrow
            mob_f = [f for f in findings if f.tooth_number == tooth_key and f.finding_type == "Mobility"]
            if mob_f and not is_missing:
                arrow_y = y + tooth_h * 0.95 if is_upper else y + tooth_h * 0.05
                ax.plot(x + 0.1, arrow_y, marker="v" if is_upper else "^", color="#e67e22", markersize=5)

            # Fracture warning
            frac_f = [f for f in findings if f.tooth_number == tooth_key and f.finding_type == "Fracture"]
            if frac_f and not is_missing:
                ax.plot(x + tooth_w - 0.1, y + tooth_h * 0.1, marker="D", color="#e74c3c", markersize=5)

    # Draw upper arch
    draw_arch(teeth[0], fig_h - 1.6, is_upper=True)
    # Draw lower arch
    draw_arch(teeth[1], 0.2, is_upper=False)

    # Arch labels
    mid_x = fig_w / 2
    ax.text(mid_x, fig_h - 0.1, "Upper Arch", ha="center", fontsize=8, color="#888", style="italic")
    ax.text(mid_x, fig_h - 1.5 - tooth_h - 0.05, "Lower Arch", ha="center", fontsize=8, color="#888", style="italic")

    # Legend
    legend_y = 0.02
    legend_items = [
        ("Caries", "#c0392b"), ("Missing", "#555"), ("Filling", "#2980b9"),
        ("Crown", "#d4a017"), ("RCT", "#27ae60"), ("Mobility", "#e67e22"),
        ("Calculus", "#f39c12"), ("Fracture", "#e74c3c"), ("Healthy", "#27ae60"),
    ]
    lx = 0.5
    for label, lcolor in legend_items:
        ax.add_patch(plt.Rectangle((lx, legend_y), 0.12, 0.08, facecolor=lcolor, edgecolor="none"))
        ax.text(lx + 0.15, legend_y + 0.04, label, fontsize=5, va="center")
        lx += 0.6

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight", pad_inches=0.2)
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()
