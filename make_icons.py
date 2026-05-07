"""Generate Tauri app icons using Pillow."""
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Installing Pillow..."); os.system(f"{sys.executable} -m pip install pillow -q")
    from PIL import Image, ImageDraw, ImageFont

ICONS_DIR = os.path.join(os.path.dirname(__file__), "desktop", "src-tauri", "icons")
os.makedirs(ICONS_DIR, exist_ok=True)

BG      = (30, 27, 75)       # deep navy
ACCENT  = (99, 102, 241)     # brand-indigo
TEXT    = (255, 255, 255)

def make_icon(size: int) -> Image.Image:
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad  = max(2, size // 12)
    r    = size // 5
    # Background rounded rectangle
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=BG)
    # Inner accent bar (bottom strip)
    bar_h = max(4, size // 8)
    draw.rounded_rectangle(
        [pad, size - pad - bar_h, size - pad, size - pad],
        radius=r // 2,
        fill=ACCENT,
    )
    # "FP" text
    font_size = max(8, size // 3)
    font = None
    for name in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            font = ImageFont.truetype(name, font_size)
            break
        except Exception:
            pass
    if font is None:
        font = ImageFont.load_default()
    text = "FP"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1] - bar_h // 2
    draw.text((x, y), text, fill=TEXT, font=font)
    return img

print(f"Generating icons in {ICONS_DIR} ...")

icons = {s: make_icon(s) for s in [16, 24, 32, 48, 64, 128, 256]}

icons[32].save(os.path.join(ICONS_DIR, "32x32.png"))
icons[128].save(os.path.join(ICONS_DIR, "128x128.png"))
icons[256].save(os.path.join(ICONS_DIR, "128x128@2x.png"))

# Windows ICO (multi-resolution)
ico_img = icons[256].copy()
ico_img.save(
    os.path.join(ICONS_DIR, "icon.ico"),
    format="ICO",
    sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)],
    append_images=[icons[s] for s in [16,24,32,48,64,128]],
)

# macOS ICNS placeholder (just a renamed PNG)
icons[128].save(os.path.join(ICONS_DIR, "icon.icns"))

print("Icons created:")
for f in os.listdir(ICONS_DIR):
    print(f"  {f}")
