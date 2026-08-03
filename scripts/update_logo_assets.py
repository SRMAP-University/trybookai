from PIL import Image
from pathlib import Path
import json

root = Path(r"c:\Users\adasg\OneDrive\Documents\bookai")
src = Image.open(root / "public" / "LOGO.png").convert("RGBA")
w, h = src.size
sp = src.load()

PURPLE = (99, 91, 255, 255)
NAVY = (10, 37, 64)


def extract_light_mark() -> Image.Image:
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cp = canvas.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = sp[x, y]
            lum = (r + g + b) / 3
            if lum < 22:
                continue
            t = min(1.0, max(0.0, (lum - 35) / 45))
            val = int(210 + 45 * t)
            cp[x, y] = (val, val, min(255, val + 6), 255)
    bbox = canvas.getbbox()
    return canvas.crop(bbox) if bbox else canvas


def extract_dark_mark() -> Image.Image:
    """Solid black mark for light UI (white app bars / screens)."""
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cp = canvas.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = sp[x, y]
            if a < 40:
                continue
            lum = (r + g + b) / 3
            # Source glyph is ~charcoal (#30) on transparent/black.
            if lum < 20 or lum > 70:
                continue
            # Soft edge falloff from alpha + distance from core tone.
            tone = 1.0 - min(1.0, abs(lum - 48) / 30)
            alpha = int(min(255, (a / 255.0) * (180 + 75 * tone)))
            if alpha < 12:
                continue
            cp[x, y] = (0, 0, 0, alpha)
    bbox = canvas.getbbox()
    return canvas.crop(bbox) if bbox else canvas


def fit(mark: Image.Image, size: int, bg, pad_ratio=0.12) -> Image.Image:
    out = Image.new("RGBA", (size, size), bg)
    pad = int(size * pad_ratio)
    target = size - pad * 2
    mw, mh = mark.size
    scale = min(target / mw, target / mh)
    nw, nh = max(1, int(mw * scale)), max(1, int(mh * scale))
    layer = mark.resize((nw, nh), Image.Resampling.LANCZOS)
    out.paste(layer, ((size - nw) // 2, (size - nh) // 2), layer)
    return out


light = extract_light_mark()
dark = extract_dark_mark()

assets = root / "mobile" / "assets" / "images"
assets.mkdir(parents=True, exist_ok=True)

fit(dark, 512, (0, 0, 0, 0), 0.06).save(assets / "logo.png", "PNG")
fit(dark, 512, (0, 0, 0, 0), 0.06).save(root / "public" / "logo-mark.png", "PNG")
fit(light, 1024, PURPLE, 0.14).save(assets / "icon.png", "PNG")
fit(light, 512, PURPLE, 0.14).save(assets / "splash-icon.png", "PNG")
fit(light, 192, PURPLE, 0.14).save(assets / "favicon.png", "PNG")
fit(light, 192, PURPLE, 0.14).save(root / "public" / "icon-192.png", "PNG")
fit(light, 1024, (0, 0, 0, 0), 0.18).save(
    assets / "android-icon-foreground.png", "PNG"
)
Image.new("RGBA", (1024, 1024), PURPLE).save(
    assets / "android-icon-background.png", "PNG"
)

mipmaps = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
res = root / "mobile" / "android" / "app" / "src" / "main" / "res"
for folder, size in mipmaps.items():
    out = res / folder / "ic_launcher.png"
    fit(light, size, PURPLE, 0.14).convert("RGB").save(out, "PNG")
    print("wrote", out)

ios_dir = root / "mobile" / "ios" / "Runner" / "Assets.xcassets" / "AppIcon.appiconset"
contents = {"images": [], "info": {"version": 1, "author": "xcode"}}
ios_sizes = [
    ("iphone", 20, 2),
    ("iphone", 20, 3),
    ("iphone", 29, 2),
    ("iphone", 29, 3),
    ("iphone", 40, 2),
    ("iphone", 40, 3),
    ("iphone", 60, 2),
    ("iphone", 60, 3),
    ("ipad", 20, 1),
    ("ipad", 20, 2),
    ("ipad", 29, 1),
    ("ipad", 29, 2),
    ("ipad", 40, 1),
    ("ipad", 40, 2),
    ("ipad", 76, 1),
    ("ipad", 76, 2),
    ("ipad", 83.5, 2),
    ("ios-marketing", 1024, 1),
]
if ios_dir.exists():
    for idiom, pt, scale in ios_sizes:
        px = int(pt * scale)
        fname = (
            "Icon-App-1024x1024@1x.png"
            if idiom == "ios-marketing"
            else f"Icon-App-{pt}x{pt}@{scale}x.png"
        )
        img = fit(light, px, PURPLE, 0.14)
        path = ios_dir / fname
        if idiom == "ios-marketing":
            img.convert("RGB").save(path, "PNG")
        else:
            img.save(path, "PNG")
        contents["images"].append(
            {
                "size": f"{pt}x{pt}" if pt != 83.5 else "83.5x83.5",
                "idiom": idiom,
                "filename": fname,
                "scale": f"{scale}x",
            }
        )
    (ios_dir / "Contents.json").write_text(
        json.dumps(contents, indent=2), encoding="utf-8"
    )
    print("wrote iOS icons")

print("done")
