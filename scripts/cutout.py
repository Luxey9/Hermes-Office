#!/usr/bin/env python3
"""
cutout.py — cut a single AI-generated furniture/object sprite out of its
plain-light background into a transparent PNG.

Workflow this supports (Hermes Office "unbaked furniture" pipeline):
  1. Generate each furniture piece individually with image gen on a
     plain white / very light background (prompt: "..., isolated single
     object, plain white background, no shadow, no floor").
  2. Run:  python3 cutout.py in.png out.png
  3. The script flood-fills the background outward from the image borders
     (so near-white highlights INSIDE the object are preserved), feathers
     the edge by ~1px, trims empty margins, and writes RGBA PNG.

Usage:
    python3 cutout.py input.jpg output.png [--tol 28] [--feather 1.2] [--pad 4]

--tol: color distance from the border-estimated background color (0-441).
--feather: edge softening radius in px.
--pad: transparent padding kept around the trimmed sprite in px.
"""

import argparse
import sys

import numpy as np
from PIL import Image, ImageFilter


def estimate_bg(img: np.ndarray) -> np.ndarray:
    h, w, _ = img.shape
    border = np.concatenate(
        [
            img[0, :, :],
            img[-1, :, :],
            img[:, 0, :],
            img[:, -1, :],
        ],
        axis=0,
    )
    return np.median(border, axis=0)


def flood_from_borders(bg_like: np.ndarray) -> np.ndarray:
    """Return mask of background pixels connected to the image border."""
    h, w = bg_like.shape
    filled = np.zeros_like(bg_like, dtype=bool)
    filled[0, :] = bg_like[0, :]
    filled[-1, :] = bg_like[-1, :]
    filled[:, 0] = bg_like[:, 0]
    filled[:, -1] = bg_like[:, -1]
    prev = np.zeros_like(filled)
    # dilate the border-connected region until stable, masked by bg_like
    while not np.array_equal(filled, prev):
        prev = filled.copy()
        up = np.zeros_like(filled); up[1:, :] = filled[:-1, :]
        dn = np.zeros_like(filled); dn[:-1, :] = filled[1:, :]
        lf = np.zeros_like(filled); lf[:, 1:] = filled[:, :-1]
        rt = np.zeros_like(filled); rt[:, :-1] = filled[:, 1:]
        filled = bg_like & (filled | up | dn | lf | rt)
    return filled


def cutout(src: str, dst: str, tol: float = 28.0, feather: float = 1.2, pad: int = 4):
    img = Image.open(src).convert("RGB")
    arr = np.asarray(img).astype(np.float32)

    bg = estimate_bg(arr)
    dist = np.sqrt(np.sum((arr - bg) ** 2, axis=2))
    bg_like = dist < tol

    border_connected = flood_from_borders(bg_like)

    alpha = np.where(border_connected, 0, 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha, mode="L")
    if feather > 0:
        alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(feather))

    rgba = img.convert("RGBA")
    rgba.putalpha(alpha_img)

    # trim to content
    bbox = alpha_img.point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        l, t, r, b = bbox
        l = max(0, l - pad); t = max(0, t - pad)
        r = min(img.width, r + pad); b = min(img.height, b + pad)
        rgba = rgba.crop((l, t, r, b))

    rgba.save(dst)
    opaque = (np.asarray(alpha_img) > 8).mean()
    print(f"wrote {dst} {rgba.size} — bg color ~{bg.astype(int).tolist()}, "
          f"opaque fraction {opaque:.1%}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("src")
    p.add_argument("dst")
    p.add_argument("--tol", type=float, default=28.0)
    p.add_argument("--feather", type=float, default=1.2)
    p.add_argument("--pad", type=int, default=4)
    a = p.parse_args()
    cutout(a.src, a.dst, a.tol, a.feather, a.pad)


if __name__ == "__main__":
    sys.exit(main())
