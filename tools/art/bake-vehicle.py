#!/usr/bin/env python3
"""Bake a vehicle's panel paintings into heading atlases for the elevated street camera.

    python tools/art/bake-vehicle.py volta suv            # ids from tools/art/fleet-bake.json
    python tools/art/bake-vehicle.py ambulance --out /tmp/check

Requires Pillow, NumPy and OpenCV. Each id in fleet-bake.json names one of three models:

  hull     Orthographic side, top, front and rear paintings plus their spec.json (real size in
           metres, pixel bounds of each panel). The body is the solid that all three
           silhouettes agree on; every visible point takes its colour from the painting that
           faces the same way. This is the pipeline for new vehicles, boats and carriages.
  profile  The ambulance: a hand-measured body profile with the side, front and rear views of
           its four-view sheet stretched over it.
  sheet    A painted turn sheet (the ridden motorbike), registered and resampled.

An atlas is 8 x 8 cells of 64 headings, clockwise from east, in the game's projection:
screen x = east, screen y = 0.78 * south - height.
"""
import argparse
import json
import math
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TILT = 0.78
HEADINGS = 64
INK = np.array([0x33, 0x25, 0x2B], np.float32) / 255
cv2.setNumThreads(1)


# ---------------------------------------------------------------- profile model (ambulance)
def bake_profile(cfg, out):
    """The original ambulance bake, with its measurements moved into the config."""
    sheet = Image.open(ROOT / cfg["sheet"]).convert("RGBA")
    cell = cfg["cell"]
    side, front, rear = [
        np.asarray(sheet.crop((x, y, x + cell, y + cell))) for x, y in cfg["views"]
    ]
    profile = [tuple(p) for p in cfg["profile"]]
    side_uv = [tuple(p) for p in cfg["sideUv"]]
    widths = cfg["widths"]
    roof = side.copy()
    # The roof's blue glass belongs to the separate raised beacons.
    for x in cfg["roofPatch"]["at"]:
        y0, y1, half, sx0, sx1 = (cfg["roofPatch"][k] for k in ("top", "bottom", "half", "from", "to"))
        roof[y0:y1, x - half : x + half] = roof[y0:y1, sx0:sx1]
    S = cfg["frame"]
    scale, cx, cy = cfg["scale"], cfg["cx"], cfg["cy"]
    anchor_uv, anchor = tuple(cfg["anchorUv"]), cfg["anchor"]

    def render(angle, damage):
        c, s = math.cos(angle), math.sin(angle)
        dest = np.zeros((S, S, 4), np.uint8)

        def proj(u, v, z):
            if damage:
                nose = max(0, u - 6)
                u -= damage * nose * 0.48
                v += damage * nose * 0.29
                z -= damage * (max(0, z - 4) * 0.55 + max(0, v) * 0.08)
            return [cx + scale * (u * c - v * s), cy + scale * ((u * s + v * c) * TILT - z)]

        def tri(tex, uv, xyz):
            uv = np.float32(uv)
            points = np.float32([proj(*p) for p in xyz])
            if abs(cv2.contourArea(points)) < 0.04:
                return
            x, y, w, h = cv2.boundingRect(points)
            x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, S), min(y + h, S)
            if x0 >= x1 or y0 >= y1:
                return
            pts = points - [x0, y0]
            m = cv2.getAffineTransform(uv, pts.astype("float32"))
            patch = cv2.warpAffine(tex, m, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR)
            mask = np.zeros((y1 - y0, x1 - x0), np.uint8)
            cv2.fillConvexPoly(mask, np.int32(np.round(pts * 16)), 255, shift=4)
            target = dest[y0:y1, x0:x1]
            use = (mask > 0) & (patch[:, :, 3] > 40)
            target[use] = patch[use]

        def quad(tex, uv, pts):
            for ii in [(0, 1, 2), (0, 2, 3)]:
                tri(tex, [uv[i] for i in ii], [pts[i] for i in ii])

        def strip(i, j, tex, uv):
            u, z = profile[i]
            q, h = profile[j]
            points = [(u, -widths[i], z), (u, widths[i], z), (q, widths[j], h), (q, -widths[j], h)]
            # The elevated camera can still see the bonnet from behind the side-on angle.
            # Cull each outward-wound panel after projection, including the damage deformation.
            if cv2.contourArea(np.float32([proj(*p) for p in points]), oriented=True) < 0:
                quad(tex, uv, points)

        flank = 1 if c >= 0 else -1
        # Cutout side contains distinct door outlines, star, stripe and wheel arches.
        # Fan around an interior anchor to preserve the silhouette of the sloping bonnet.
        for i in range(len(profile)):
            j = (i + 1) % len(profile)
            u, z = profile[i]
            q, h = profile[j]
            tri(
                side,
                [anchor_uv, side_uv[i], side_uv[j]],
                [(anchor[0], anchor[1] * flank, anchor[2]), (u, widths[i] * flank, z), (q, widths[j] * flank, h)],
            )
        # Keep the profile winding from the rear sill over the roof to the front sill.
        for i, j, t, b in cfg["frontStrips"]:
            x0, x1 = cfg["frontSpan"]
            strip(i, j, front, [(x0, t), (x1, t), (x1, b), (x0, b)])
        for i, j, b, t in cfg["rearStrips"]:
            x0, x1 = cfg["rearSpan"]
            strip(i, j, rear, [(x0, b), (x1, b), (x1, t), (x0, t)])
        i, j = cfg["roofStrip"]["between"]
        strip(i, j, roof, [tuple(p) for p in cfg["roofStrip"]["uv"]])
        for axle, centre in cfg["wheels"]:
            face = cfg["wheelFace"] * flank
            quad(
                side,
                [(centre - 18, 149), (centre + 18, 149), (centre + 18, 189), (centre - 18, 189)],
                [(axle - 2.1, face, 4.4), (axle + 2.1, face, 4.4), (axle + 2.1, face, -0.1), (axle - 2.1, face, -0.1)],
            )
        # Two blue beacons stand above the roof with the painted specular highlight intact.
        beacons = cfg["beacons"]
        for u in beacons["at"] if damage < 1 else beacons["at"][:1]:
            x, y = proj(u, 0, beacons["height"])
            x, y = int(x) - 5, int(y) - 5
            bx0, by0, bx1, by1 = beacons["source"]
            light = cv2.resize(side[by0:by1, bx0:bx1], (11, 12), interpolation=cv2.INTER_AREA)
            mask = np.zeros((12, 11), np.uint8)
            cv2.ellipse(mask, (5, 6), (5, 6), 0, 0, 360, 255, -1)
            patch = dest[y : y + 12, x : x + 11]
            use = (light[:, :, 3] > 64) & (mask > 0)
            patch[use] = light[use]
        if damage:

            def panel(points, color):
                cv2.fillPoly(dest, [np.int32([proj(*pt) for pt in points])], color, lineType=cv2.LINE_AA)

            if s > 0:
                panel(cfg["damage"]["screen"], tuple(cfg["damage"]["screenColor"]))
            if damage == 1:
                for points, color in cfg["damage"]["wreck"]:
                    panel(points, tuple(color))
            mask = dest[:, :, 3] > 0
            dest[:, :, :3][mask] = (dest[:, :, :3][mask] * (1 - damage * 0.17)).astype("uint8")
        return Image.fromarray(dest)

    written = {}
    for state, st in cfg["states"].items():
        size = st["size"]
        atlas = Image.new("RGBA", (size * 8, size * 8))
        for frame in range(HEADINGS):
            pose = render(frame * math.tau / HEADINGS, st["damage"]).resize((size, size), Image.Resampling.LANCZOS)
            atlas.paste(pose, (size * (frame % 8), size * (frame // 8)))
        path = out / f"{st['file']}.webp"
        atlas.save(path, quality=cfg.get("quality", 90), method=cfg.get("method", 3))
        written[state] = path
    return written


# ---------------------------------------------------------------- hull model
UP = 4  # panels are enlarged before measuring, so outlines and distances are smooth
PAD = 24


def premultiplied(image):
    a = np.asarray(image.convert("RGBA")).astype(np.float32) / 255
    a[:, :, :3] *= a[:, :, 3:4]
    return a


def enlarge(a, w, h):
    return cv2.resize(a, (w, h), interpolation=cv2.INTER_CUBIC)


def signed_distance(mask):
    """Positive inside the silhouette, in pixels, on a canvas padded by PAD."""
    m = np.pad(mask.astype(np.uint8), PAD)
    inside = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    outside = cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)
    return cv2.GaussianBlur(inside - outside, (0, 0), 1.2).astype(np.float32)


def bilinear(a, x, y):
    h, w = a.shape[:2]
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0 = x.astype(np.int32)
    y0 = y.astype(np.int32)
    fx = (x - x0)[..., None] if a.ndim == 3 else x - x0
    fy = (y - y0)[..., None] if a.ndim == 3 else y - y0
    top = a[y0, x0] * (1 - fx) + a[y0, x0 + 1] * fx
    bottom = a[y0 + 1, x0] * (1 - fx) + a[y0 + 1, x0 + 1] * fx
    return top * (1 - fy) + bottom * fy


class Hull:
    """A vehicle as the solid shared by its side, plan and end silhouettes."""

    def __init__(self, source, cfg):
        spec = json.loads((source / "spec.json").read_text())
        self.cfg = cfg
        self.L, self.W, self.H = spec["length_m"], spec["width_m"], spec["height_m"]
        self.m = spec["pxPerMetre"] * UP  # enlarged pixels per metre
        self.k = cfg.get("unitsPerMetre", 4.76)
        self.waterline = spec.get("waterline_m", 0) if cfg.get("afloat") else 0
        files = {**{n: n for n in ("side", "top", "front", "rear")}, **cfg.get("panels", {})}
        size = {"side": (self.L, self.H), "top": (self.L, self.W), "front": (self.W, self.H), "rear": (self.W, self.H)}
        self.tex = {}
        for name, file in files.items():
            x0, y0, x1, y1 = spec["panels"][file if file in spec["panels"] else name]
            image = premultiplied(Image.open(source / f"{file}.png").crop((x0, y0, x1, y1)))
            w, h = round(size[name][0] * self.m), round(size[name][1] * self.m)
            self.tex[name] = np.clip(enlarge(image, w, h), 0, 1)
        # Both ends are indexed by v increasing to the right, like the plan's rows.
        self.tex["front"] = self.tex["front"][:, ::-1].copy()
        solid = {n: self.tex[n][:, :, 3] > 0.5 for n in self.tex}
        for name, boxes in cfg.get("trim", {}).items():
            # A silhouette may carry something that is not part of the body (a raised bed).
            for u0, z0, u1, z1 in boxes:
                self.box(solid[name], name, u0, z0, u1, z1, False)
        self.sd_side = signed_distance(solid["side"])
        self.sd_top = signed_distance(solid["top"])
        # The cross-section is the nose's forward of `split` and the tail's behind it.
        self.split = cfg.get("split")
        if self.split is None:
            self.sd_front = self.sd_rear = signed_distance(solid["front"] | solid["rear"])
        else:
            self.sd_front = signed_distance(solid["front"])
            self.sd_rear = signed_distance(solid["rear"])
        self.wells = cfg.get("wells", [])

    def box(self, mask, name, a0, b0, a1, b1, value):
        h, w = mask.shape
        if name == "side":
            x0, x1 = (a0 + self.L / 2) * self.m, (a1 + self.L / 2) * self.m
        else:
            x0, x1 = (a0 + self.W / 2) * self.m, (a1 + self.W / 2) * self.m
        y0, y1 = (self.H - b1) * self.m, (self.H - b0) * self.m
        mask[max(0, round(y0)) : min(h, round(y1)), max(0, round(x0)) : min(w, round(x1))] = value

    # Body coordinates in metres: u toward the nose, v toward the right-hand side, z up.
    def px_side(self, u, z):
        return (u + self.L / 2) * self.m + PAD, (self.H - z) * self.m + PAD

    def px_top(self, u, v):
        return (u + self.L / 2) * self.m + PAD, (v + self.W / 2) * self.m + PAD

    def px_end(self, v, z):
        return (v + self.W / 2) * self.m + PAD, (self.H - z) * self.m + PAD

    def distances(self, u, v, z):
        z = z + self.waterline
        ds = bilinear(self.sd_side, *self.px_side(u, z))
        dt = bilinear(self.sd_top, *self.px_top(u, v))
        if self.split is None:
            de = bilinear(self.sd_front, *self.px_end(v, z))
        else:
            de = np.where(u > self.split, bilinear(self.sd_front, *self.px_end(v, z)), bilinear(self.sd_rear, *self.px_end(v, z)))
        d = np.stack([ds, dt, de]) / self.m
        # An open load bed or cockpit: nothing above its floor inside walls of even thickness.
        for u0, u1, wall, floor in self.wells:
            inside = np.minimum(np.minimum(u - u0, u1 - u), dt / self.m - wall)
            well = -np.minimum(inside, z - floor)
            d = np.concatenate([d, well[None]])
        return d

    def colour(self, name, a, b):
        tex = self.tex[name]
        if name == "side":
            x, y = self.px_side(a, b)
        elif name == "top":
            x, y = self.px_top(a, b)
        else:
            x, y = self.px_end(a, b)
        return bilinear(tex, x - PAD - 0.5, y - PAD - 0.5)


def crush(hull, damage, u, v, z):
    """Undo the crash deformation: where on the intact body does this point come from?"""
    if not damage:
        return u, v, z
    c = hull.cfg.get("crush", {})
    half = hull.L / 2
    u0 = half * c.get("from", 0.42)
    squeeze = damage * c.get("squeeze", 0.42)
    u = np.where(u > u0, u0 + (u - u0) / (1 - squeeze), u)
    nose = np.maximum(0, u - u0)
    reach = np.clip(nose / (half - u0), 0, 1)
    v = v - damage * nose * c.get("twist", 0.16)
    sag = damage * np.maximum(0, v) * c.get("lean", 0.06)
    z0 = hull.H * c.get("belt", 0.42)
    fold = damage * c.get("collapse", 0.34) * (c.get("cabin", 0.35) + (1 - c.get("cabin", 0.35)) * reach)
    lifted = (z + sag - fold * z0) / (1 - fold)
    z = np.where(lifted > z0, lifted, z + sag)
    return u, v, z


def render_hull(hull, angle, damage, frame, scale, cx, cy, ss=3, lean=0.0):
    """One heading at `scale` pixels per world unit; returns premultiplied RGBA float."""
    c, s = math.cos(angle), math.sin(angle)
    n = frame * ss
    k = hull.k
    X, Y = np.meshgrid(np.arange(n, dtype=np.float32), np.arange(n, dtype=np.float32))
    x = ((X + 0.5) / ss - cx) / scale / k  # metres east of the body centre
    q = ((Y + 0.5) / ss - cy) / scale / k  # screen metres below it
    top = hull.H - hull.waterline
    reach = math.hypot(hull.L / 2, max(hull.W / 2, hull.H if lean else 0)) + 0.2
    far = np.maximum(q / TILT, -reach)
    D = np.minimum((top + q) / TILT, reach).astype(np.float32)
    alive = D > far
    hit = np.zeros_like(alive)

    def body(D, x=x, q=q):
        u = x * c + D * s
        v = -x * s + D * c
        z = TILT * D - q
        if lean:
            # A banked two-wheeler rolls about its tyre line.
            cl, sl = math.cos(lean), math.sin(lean)
            v, z = v * cl - z * sl, v * sl + z * cl
        return crush(hull, damage, u, v, z)

    relax = 0.55 if damage else 0.9
    stride = math.hypot(1, TILT)
    # A ray that grazes a rim creeps along it, so allow plenty of short steps.
    for _ in range(420):
        idx = np.nonzero(alive & ~hit)
        if not len(idx[0]):
            break
        d = hull.distances(*body(D[idx], x[idx], q[idx])).min(axis=0)
        inside = d > -0.006
        hit[idx[0][inside], idx[1][inside]] = True
        step = np.maximum(-d, 0.014) * relax / stride
        D[idx] = np.where(inside, D[idx], D[idx] - step)
        alive[idx] = D[idx] > far[idx]
    out = np.zeros((n, n, 4), np.float32)
    idx = np.nonzero(hit)
    if len(idx[0]):
        u, v, z = body(D[idx], x[idx], q[idx])
        d = hull.distances(u, v, z)
        which = d[:3].argmin(axis=0) if d.shape[0] == 3 else d.argmin(axis=0)
        e = 0.02
        zw = z + hull.waterline
        # The surface normal comes from whichever silhouette the point lies on.
        g = lambda f, a, b, da, db: f(a + da, b + db) - f(a - da, b - db)
        side_d = lambda a, b: bilinear(hull.sd_side, *hull.px_side(a, b))
        top_d = lambda a, b: bilinear(hull.sd_top, *hull.px_top(a, b))
        end_sd = hull.sd_front if hull.split is None else None
        if end_sd is None:
            end_d = lambda a, b: np.where(u > hull.split, bilinear(hull.sd_front, *hull.px_end(a, b)), bilinear(hull.sd_rear, *hull.px_end(a, b)))
        else:
            end_d = lambda a, b: bilinear(end_sd, *hull.px_end(a, b))
        nu = np.zeros_like(u)
        nv = np.zeros_like(u)
        nz = np.zeros_like(u)
        m0, m1, m2 = which == 0, which == 1, which == 2
        nu = np.where(m0, -g(side_d, u, zw, e, 0), nu)
        nz = np.where(m0, -g(side_d, u, zw, 0, e), nz)
        nu = np.where(m1, -g(top_d, u, v, e, 0), nu)
        nv = np.where(m1, -g(top_d, u, v, 0, e), nv)
        nv = np.where(m2, -g(end_d, v, zw, e, 0), nv)
        nz = np.where(m2, -g(end_d, v, zw, 0, e), nz)
        # Inside an open well: its floor looks up, its walls face inward.
        inner = np.zeros(u.shape, bool)
        inner_u = u.copy()
        if d.shape[0] > 3:
            well = which >= 3
            nz = np.where(well, 1, nz)
            nu = np.where(well, 0, nu)
            nv = np.where(well, 0, nv)
            for w, (u0, u1, thick, floor) in enumerate(hull.wells):
                wall = (which == 3 + w) & (zw - floor > 0.03)
                along_u = np.minimum(u - u0, u1 - u) <= d[1] - thick
                nz = np.where(wall, 0, nz)
                nu = np.where(wall & along_u, 1, nu)
                nv = np.where(wall & ~along_u, 1, nv)
                # Every inner wall is the same sheet steel as the flank beside it.
                inner |= wall
                inner_u = np.where(wall & along_u, (u0 + u1) / 2 + v * 0.6, inner_u)
        length = np.sqrt(nu * nu + nv * nv + nz * nz) + 1e-6
        nu, nv, nz = nu / length, nv / length, nz / length
        bias = hull.cfg.get("topBias", 1.0)
        w_top = np.maximum(nz, 0) * bias
        w_side = np.abs(nv)
        w_end = np.abs(nu) * hull.cfg.get("endBias", 1.0)
        nose = nu > 0
        samples = {
            "top": hull.colour("top", u, v),
            "side": hull.colour("side", u, zw),
            "front": hull.colour("front", v, zw),
            "rear": hull.colour("rear", v, zw),
        }
        weights = {"top": w_top, "side": w_side, "front": np.where(nose, w_end, 0), "rear": np.where(nose, 0, w_end)}
        # A painting only counts where it has paint; the best-facing one wins.
        best = np.full(u.shape, -1.0, np.float32)
        rgba = np.zeros(u.shape + (4,), np.float32)
        for name in ("side", "top", "front", "rear"):
            score = np.where(samples[name][:, 3] > 0.6, weights[name] + 0.02, -1)
            take = score > best
            best = np.where(take, score, best)
            rgba[take] = samples[name][take]
        if inner.any():
            steel = hull.colour("side", inner_u, zw)
            rgba[inner] = steel[inner] * np.array([0.72, 0.72, 0.72, 1], np.float32)
            best = np.where(inner, 1, best)
        missing = best < 0
        if missing.any():
            for name in ("side", "top", "front", "rear"):
                take = missing & (samples[name][:, 3] > rgba[:, 3])
                rgba[take] = samples[name][take]
        alpha = np.maximum(rgba[:, 3:4], 1e-3)
        rgb = np.clip(rgba[:, :3] / alpha, 0, 1)
        shade = hull.cfg.get("shade", 0.0)
        if shade:
            # A little form light: faces turned from the camera and undersides sink back.
            rgb = rgb * (1 - shade * np.clip(-nz, 0, 1))[:, None]
        out[idx[0], idx[1], :3] = rgb
        out[idx[0], idx[1], 3] = 1
    mask = out[:, :, 3] > 0
    # Ink the outline the way the street paintings do, where the paint itself is not dark.
    weight = hull.cfg.get("ink", 0.55)
    if weight:
        r = max(1, round(ss * 0.5))
        core = cv2.erode(mask.astype(np.uint8), np.ones((2 * r + 1, 2 * r + 1), np.uint8)) > 0
        rim = mask & ~core
        out[rim, :3] = out[rim, :3] * (1 - weight) + INK * weight
    if hull.waterline and hull.cfg.get("wash", True):
        # A pale line of broken water where the hull meets the surface.
        D0 = q / TILT
        u, v = x * c + D0 * s, -x * s + D0 * c
        d = hull.distances(u, v, np.zeros_like(u)).min(axis=0)
        ring = np.clip(1 - np.abs(d + 0.07) / 0.09, 0, 1) * (~mask) * 0.55
        wash = np.array([0.78, 0.9, 0.93], np.float32)
        out[:, :, :3] += wash * ring[:, :, None] * (1 - out[:, :, 3:4])
        out[:, :, 3] += ring * (1 - out[:, :, 3])
    return cv2.resize(out, (frame, frame), interpolation=cv2.INTER_AREA)


# ---------------------------------------------------------------- damage painted on the panels
def lcg(seed):
    state = seed & 0xFFFFFFFF

    def rand():
        nonlocal state
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        return state / 4294967296

    return rand


def glass_mask(rgb):
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    return (b > r * 1.08) & (b > g * 1.25) & (b > 0.16)


def lamp_mask(rgb):
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    return (r > 0.86) & (g > 0.62) & (b < g)


def damaged(hull, damage, seed=7):
    """A copy of the hull with scrapes, dents, cracked glass and, for a wreck, a burnt nose."""
    if not damage:
        return hull
    worn = Hull.__new__(Hull)
    worn.__dict__.update(hull.__dict__)
    worn.tex = {n: t.copy() for n, t in hull.tex.items()}
    rand = lcg(seed)
    wreck = damage >= 1
    half = hull.L / 2
    u0 = half * hull.cfg.get("crush", {}).get("from", 0.42)
    for name, tex in worn.tex.items():
        h, w = tex.shape[:2]
        alpha = tex[:, :, 3:4]
        rgb = np.clip(tex[:, :, :3] / np.maximum(alpha, 1e-3), 0, 1)
        lengthwise = name in ("side", "top")
        if lengthwise:
            u = (np.arange(w, dtype=np.float32) / hull.m - half)[None, :].repeat(h, 0)
            reach = np.clip((u - u0) / (half - u0), 0, 1)
        else:
            reach = np.full((h, w), 1.0 if name == "front" else 0.0, np.float32)
        glass = glass_mask(rgb)
        lamps = lamp_mask(rgb)
        layer = np.zeros((h, w, 4), np.uint8)
        px = UP  # one source pixel, in enlarged pixels
        strokes = int((14 if wreck else 7) * (1.0 if lengthwise else 0.5) * max(1, w / (5 * hull.m)))
        for _ in range(strokes):
            # Scrapes gather toward the nose.
            x = (1 - rand() ** 2) * w if name != "rear" else rand() * w
            if name == "front":
                x = rand() * w
            y = rand() * h
            run = (0.25 + rand() * 0.8) * hull.m * (1.3 if wreck else 1)
            a = (rand() - 0.5) * 0.7 + (0 if lengthwise else 1.2)
            pts = [(x, y)]
            for _ in range(4):
                a += (rand() - 0.5) * 0.9
                x, y = x + math.cos(a) * run / 4, y + math.sin(a) * run / 4
                pts.append((x, y))
            tone = (0x51, 0x44, 0x48, 150) if rand() < 0.7 else (0xC9, 0xB8, 0xA4, 120)
            cv2.polylines(layer, [np.int32(np.float32(pts) * 8)], False, tone, max(1, round(px * (0.5 + rand() * 0.6))), cv2.LINE_AA, 3)
        dents = int((7 if wreck else 3) * max(1, w / (5 * hull.m)))
        for _ in range(dents):
            x = (1 - rand() ** 2.4) * w if lengthwise else rand() * w
            y = rand() * h
            rx, ry = (0.18 + rand() * 0.3) * hull.m, (0.1 + rand() * 0.2) * hull.m
            cv2.ellipse(layer, (int(x), int(y)), (int(rx), int(ry)), rand() * 180, 0, 360, (0x3A, 0x2E, 0x36, 70 if wreck else 46), -1, cv2.LINE_AA)
        lay = layer.astype(np.float32) / 255
        rgb = rgb * (1 - lay[:, :, 3:4]) + lay[:, :, :3] * lay[:, :, 3:4]
        # Glass: starred on a dented car, gone on a wreck, with a few shards left in the frame.
        cracks = np.zeros((h, w), np.uint8)
        ys, xs = np.nonzero(glass & (reach > 0.02 if lengthwise else reach >= 0))
        if len(xs) and (name != "rear" or wreck):
            stars = 3 if wreck else 2
            for _ in range(stars):
                i = int(rand() * len(xs))
                ox, oy = int(xs[i]), int(ys[i])
                for _ in range(7):
                    a = rand() * math.tau
                    r = (0.12 + rand() * 0.42) * hull.m
                    mid = (ox + math.cos(a + 0.3) * r * 0.5, oy + math.sin(a + 0.3) * r * 0.5)
                    cv2.polylines(cracks, [np.int32([(ox, oy), mid, (ox + math.cos(a) * r, oy + math.sin(a) * r)])], False, 255, max(1, round(px * 0.45)), cv2.LINE_AA)
        crack = (cracks.astype(np.float32) / 255)[:, :, None] * glass[:, :, None]
        if wreck:
            noise = cv2.resize(np.array([[rand() for _ in range(max(2, w // int(px * 2)))] for _ in range(max(2, h // int(px * 2)))], np.float32), (w, h), interpolation=cv2.INTER_NEAREST)
            gone = glass & (noise > 0.28)
            rgb[gone] = np.array([0x21, 0x1D, 0x29], np.float32) / 255
            rgb = rgb * (1 - crack * 0.5) + np.array([0xBE, 0xDC, 0xE3], np.float32) / 255 * crack * 0.5
            rgb[lamps] = np.array([0x4A, 0x40, 0x46], np.float32) / 255
            # Soot and scorched paint deepen toward the crushed end.
            rgb *= (1 - 0.17) * (1 - 0.34 * reach[:, :, None])
            grey = rgb.mean(axis=2, keepdims=True)
            rgb = rgb * 0.8 + grey * 0.2
        else:
            rgb = rgb * (1 - crack * 0.75) + np.array([0xBE, 0xDC, 0xE3], np.float32) / 255 * crack * 0.75
            # One headlamp is out and the nose has lost its shine.
            if name == "front":
                rgb[lamps & (np.arange(w)[None, :] < w / 2)] = np.array([0x5A, 0x4C, 0x52], np.float32) / 255
            rgb *= 1 - 0.07 - 0.1 * reach[:, :, None]
        if wreck and name == "top" and hull.cfg.get("bonnet", True):
            # The bonnet has burst: a dark engine bay with a torn, pale edge.
            centre = ((u0 + (half - u0) * 0.55 + half) * hull.m, h / 2)
            ring = []
            for i in range(11):
                a = i / 11 * math.tau
                r = 0.62 + rand() * 0.5
                ring.append((centre[0] + math.cos(a) * r * (half - u0) * 0.42 * hull.m, centre[1] + math.sin(a) * r * h * 0.3))
            hole = np.zeros((h, w), np.uint8)
            cv2.fillPoly(hole, [np.int32(ring)], 255, cv2.LINE_AA)
            edge = cv2.dilate(hole, np.ones((3, 3), np.uint8), iterations=max(1, round(px * 0.6))) - hole
            hole_f = (hole.astype(np.float32) / 255)[:, :, None]
            edge_f = (edge.astype(np.float32) / 255)[:, :, None] * 0.7
            rgb = rgb * (1 - hole_f) + np.array([0x1E, 0x18, 0x22], np.float32) / 255 * hole_f
            # What is left of the engine: a block and a few ribs catching the street light.
            block = np.zeros((h, w), np.uint8)
            bw, bh = (half - u0) * 0.2 * hull.m, h * 0.13
            cv2.rectangle(block, (int(centre[0] - bw), int(centre[1] - bh)), (int(centre[0] + bw), int(centre[1] + bh)), 110, -1)
            for i in range(4):
                x = int(centre[0] - bw + (i + 0.5) * bw / 2)
                cv2.line(block, (x, int(centre[1] - bh)), (x, int(centre[1] + bh)), 255, max(1, round(px * 0.4)), cv2.LINE_AA)
            block_f = (block.astype(np.float32) / 255)[:, :, None] * hole_f
            rgb = rgb * (1 - block_f * 0.8) + np.array([0x71, 0x60, 0x5C], np.float32) / 255 * block_f * 0.8
            rgb = rgb * (1 - edge_f) + np.array([0xB6, 0xA0, 0x9A], np.float32) / 255 * edge_f
        tex[:, :, :3] = np.clip(rgb, 0, 1) * alpha
    return worn


_hull = {}


def _frame(task):
    source, cfg, state, st, frame = task
    key = (str(source), state)
    if key not in _hull:
        base = Hull(Path(source), {**cfg, **st.get("with", {})})
        _hull.clear()
        _hull[key] = damaged(base, st.get("damage", 0))
    hull = _hull[key]
    image = render_hull(hull, frame * math.tau / HEADINGS, st.get("damage", 0), cfg["frame"], cfg["scale"], cfg["cx"], cfg["cy"], cfg.get("supersample", 3), st.get("lean", 0))
    size = st.get("size", cfg["frame"])
    if size != cfg["frame"]:
        image = cv2.resize(image, (size, size), interpolation=cv2.INTER_AREA)
    return frame, image


def save_atlas(frames, size, path, quality, columns=8):
    rows = math.ceil((max(frames) + 1) / columns)
    atlas = np.zeros((size * rows, size * columns, 4), np.float32)
    for frame, image in frames.items():
        y, x = size * (frame // columns), size * (frame % columns)
        atlas[y : y + size, x : x + size] = image
    alpha = atlas[:, :, 3:4]
    rgb = np.where(alpha > 1e-3, atlas[:, :, :3] / np.maximum(alpha, 1e-3), 0)
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)], axis=2)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8)).save(path, quality=quality, method=6)


def bake_hull(cfg, out, pool):
    source = (ROOT / cfg["source"]).resolve() if not Path(cfg["source"]).is_absolute() else Path(cfg["source"])
    written = {}
    for state, st in cfg["states"].items():
        tasks = [(str(source), cfg, state, st, frame) for frame in cfg.get("only") or range(HEADINGS)]
        frames = dict(pool.imap_unordered(_frame, tasks, chunksize=4))
        path = out / f"{st['file']}.webp"
        save_atlas(frames, st.get("size", cfg["frame"]), path, cfg.get("quality", 84))
        written[state] = path
    return written


# ---------------------------------------------------------------- painted turn sheet
def bake_sheet(cfg, out):
    """Register a painted direction sheet on the ground point and resample it."""
    source = Path(cfg["source"]) if Path(cfg["source"]).is_absolute() else ROOT / cfg["source"]
    spec = json.loads((source / "spec.json").read_text())["direction_sheet"]
    sheet = premultiplied(Image.open(source / cfg["sheet"]))
    cw, ch = spec["cell_px"]
    px, py = spec["ground_pivot_px"]
    count = spec["columns"] * spec["rows"]
    size, zoom = cfg["frame"], cfg["zoom"]
    written = {}
    for state, st in cfg["states"].items():
        frames = {}
        for i in range(count):
            cell = sheet[ch * (i // spec["columns"]) :, cw * (i % spec["columns"]) :][:ch, :cw]
            # Scale about the tyre contact point onto the frame's ground centre.
            m = np.float32([[zoom, 0, cfg["cx"] - px * zoom], [0, zoom, cfg["cy"] - py * zoom]])
            image = cv2.warpAffine(cell, m, (size, size), flags=cv2.INTER_AREA)
            if st.get("recolour"):
                image = recolour(image, **st["recolour"])
            frames[i] = image
        path = out / f"{st['file']}.webp"
        save_atlas(frames, size, path, cfg.get("quality", 88), spec["columns"])
        written[state] = path
    return written


def recolour(image, hue, into, saturation=1.0, value=1.0, spread=14):
    """Move one family of hues (the rider's suit and the tank) to another colour."""
    alpha = np.maximum(image[:, :, 3:4], 1e-3)
    rgb = np.clip(image[:, :, :3] / alpha, 0, 1)
    hsv = cv2.cvtColor(rgb.astype(np.float32), cv2.COLOR_RGB2HSV)
    distance = np.abs(((hsv[:, :, 0] - hue + 180) % 360) - 180)
    amount = np.clip(1.5 - distance / spread, 0, 1) * np.clip(hsv[:, :, 1] * 4 - 0.6, 0, 1)
    hsv[:, :, 0] = (hsv[:, :, 0] + amount * (into - hue)) % 360
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * (1 + amount * (saturation - 1)), 0, 1)
    hsv[:, :, 2] = np.clip(hsv[:, :, 2] * (1 + amount * (value - 1)), 0, 1)
    out = image.copy()
    out[:, :, :3] = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB) * image[:, :, 3:4]
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("ids", nargs="+")
    parser.add_argument("--config", default=str(Path(__file__).with_name("fleet-bake.json")))
    parser.add_argument("--out", help="write here instead of the configured folder")
    parser.add_argument("--states", help="comma-separated subset of states")
    parser.add_argument("--frames", help="preview: bake only these headings (0-63), comma-separated")
    parser.add_argument("--jobs", type=int, default=6)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    with Pool(args.jobs) as pool:
        for vehicle in args.ids:
            cfg = {**config.get("defaults", {}), **config["vehicles"][vehicle]}
            if args.frames:
                cfg["only"] = [int(f) for f in args.frames.split(",")]
            if args.states:
                cfg["states"] = {k: v for k, v in cfg["states"].items() if k in args.states.split(",")}
            out = Path(args.out) if args.out else (Path(cfg["out"]) if Path(cfg["out"]).is_absolute() else ROOT / cfg["out"])
            out.mkdir(parents=True, exist_ok=True)
            if cfg["model"] == "profile":
                written = bake_profile(cfg, out)
            elif cfg["model"] == "sheet":
                written = bake_sheet(cfg, out)
            else:
                written = bake_hull(cfg, out, pool)
            for state, path in written.items():
                print(f"{vehicle} {state}: {path} ({path.stat().st_size // 1024} KB)")
            if cfg.get("marker"):
                # Written last: the other teams take it as the sign the atlases are complete.
                frame = cfg["frame"]
                body = round((cfg.get("lengthMetres") or 0) * cfg.get("unitsPerMetre", 4.76) * cfg["scale"])
                info = {
                    "id": vehicle,
                    "frame": frame,
                    "headings": HEADINGS,
                    "columns": 8,
                    "bodyLengthPx": body,
                    "pxPerWorldUnit": cfg["scale"],
                    "unitsPerMetre": cfg.get("unitsPerMetre", 4.76),
                    "origin": [cfg["cx"], cfg["cy"]],
                    "tilt": TILT,
                    "firstHeading": "east, clockwise",
                    "states": {state: path.name for state, path in written.items()},
                    **cfg.get("info", {}),
                }
                (out / f"{vehicle}.json").write_text(json.dumps(info, indent=2) + "\n")


if __name__ == "__main__":
    main()
