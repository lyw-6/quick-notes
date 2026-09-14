import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'icon.ico')
SIZE = 256
BG = (45, 96, 150, 255)

img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=54, fill=BG)

font_path = None
for p in ['C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf']:
    if os.path.exists(p):
        font_path = p
        break

ch = '备'
if font_path:
    f = ImageFont.truetype(font_path, 148)
    bbox = d.textbbox((0, 0), ch, font=f)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((SIZE - w) / 2 - bbox[0], (SIZE - h) / 2 - bbox[1] - 4), ch, font=f, fill=(255, 255, 255, 255))
else:
    d.ellipse([70, 70, 186, 186], fill=(255, 255, 255, 255))

img.save(OUT, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print('icon written:', OUT, os.path.getsize(OUT), 'bytes')
