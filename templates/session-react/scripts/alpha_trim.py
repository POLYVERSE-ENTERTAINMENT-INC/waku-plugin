#!/usr/bin/env python3
"""alpha_trim: 把抠好图的 PNG 裁剪到主体（非透明像素）的边界框。

输入是本地路径或 http(s) URL，输出是裁剪后的图像文件。
500x500 画布中间一个 200x200 的主体，裁完就是 200x200。

用法:
  python3 alpha_trim.py <输入路径或URL> [-o 输出路径] [--padding N] [--threshold N]

  -o / --output     输出文件路径，默认 <输入名>_trimmed.png
  --padding N       边界框四周保留 N 像素留白（不超出原图范围），默认 0
  --threshold N     alpha 大于 N 才算主体像素（0-255），默认 0；
                    抠图边缘有半透明噪点时可设 8~16

输出: 打印一行 JSON，含 output 路径、原尺寸、裁剪后尺寸和边界框。
"""

import argparse
import io
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image


def load_image(src: str) -> Image.Image:
    if src.startswith(("http://", "https://")):
        req = urllib.request.Request(src, headers={"User-Agent": "alpha-trim/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return Image.open(io.BytesIO(resp.read()))
    return Image.open(src)


def trim(img: Image.Image, padding: int = 0, threshold: int = 0) -> tuple[Image.Image, tuple]:
    img = img.convert("RGBA")
    alpha = img.getchannel("A")
    if threshold > 0:
        alpha = alpha.point(lambda a: 255 if a > threshold else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("图像完全透明，没有可保留的主体像素")
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(img.width, right + padding)
    bottom = min(img.height, bottom + padding)
    return img.crop((left, top, right, bottom)), (left, top, right, bottom)


def main() -> None:
    parser = argparse.ArgumentParser(description="裁剪透明 PNG 到主体边界框")
    parser.add_argument("input", help="输入图像路径或 http(s) URL")
    parser.add_argument("-o", "--output", help="输出路径，默认 <输入名>_trimmed.png")
    parser.add_argument("--padding", type=int, default=0, help="边界框四周留白像素数")
    parser.add_argument("--threshold", type=int, default=0, help="alpha 阈值 (0-255)")
    args = parser.parse_args()

    img = load_image(args.input)
    original_size = img.size

    if args.output:
        out_path = Path(args.output)
    elif args.input.startswith(("http://", "https://")):
        stem = Path(args.input.split("?")[0]).stem or "image"
        out_path = Path(f"{stem}_trimmed.png")
    else:
        p = Path(args.input)
        out_path = p.with_name(f"{p.stem}_trimmed.png")

    try:
        trimmed, bbox = trim(img, padding=args.padding, threshold=args.threshold)
    except ValueError as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    trimmed.save(out_path, "PNG")

    print(json.dumps({
        "output": str(out_path),
        "original_size": list(original_size),
        "trimmed_size": list(trimmed.size),
        "bbox": list(bbox),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
