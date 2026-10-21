"""Regenerate ReAgent's icon and logo assets from the two source images.

    python3 generate.py source-icon.webp source-logo.webp <out-dir>

Writes mark.png (in-app badge) and logo-dark.png; icon.png / icon-mac.png / icon.ico
for packaging (build icon.icns from icon-mac.png with sips + iconutil). The light-theme
logo is logo-dark with its white letters inked indigo (see logo_light below). Copy
mark.png and the logos (as .webp) to public/reagent/, the icons to assets/reagent/.
"""
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter
src_icon, src_logo, out = sys.argv[1], sys.argv[2], sys.argv[3]

icon = Image.open(src_icon).convert('RGBA')
crop = icon.crop((131, 117, 1121, 1107)).resize((1024, 1024), Image.LANCZOS)
# Mask just outside the glowing frame: transparent corners, the frame stays crisp.
s = 1024 / 990
inset = round((162 - 131 - 6) * s)
radius = round(150 * s)
mask = Image.new('L', (4096, 4096), 0)
ImageDraw.Draw(mask).rounded_rectangle([inset * 4, inset * 4, (1024 - inset) * 4, (1024 - inset) * 4], radius * 4, fill=255)
mask = mask.resize((1024, 1024), Image.LANCZOS)
mark = crop.copy(); mark.putalpha(mask)
# Re-square on the mask's own bounds so the mark fills its box.
mark = mark.crop(mask.getbbox()).resize((1024, 1024), Image.LANCZOS)
mark.save(f'{out}/mark-1024.png')
mark.resize((256, 256), Image.LANCZOS).save(f'{out}/mark.png')
# macOS grid: 824px artwork centred on a 1024 canvas.
mac = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)); mac.alpha_composite(mark.resize((824, 824), Image.LANCZOS), (100, 100))
mac.save(f'{out}/icon-mac.png')
mark.save(f'{out}/icon.png')
mark.save(f'{out}/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

logo = Image.open(src_logo).convert('RGBA')
logo = logo.crop(logo.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
logo.save(f'{out}/logo-dark.png')
# Light theme: white letters go deep indigo, the purple glow keeps its hue. The mask is the
# darkest channel (white is bright in all three, the glow is not), blurred so WebP noise
# does not speckle the letters.
r, g, b, a = logo.split()
low = ImageChops.darker(ImageChops.darker(r, g), b).filter(ImageFilter.GaussianBlur(1.2))
white = low.point(lambda v: 0 if v <= 150 else 255 if v >= 225 else round((v - 150) * 255 / 75))
light = Image.composite(Image.new('RGBA', logo.size, (30, 27, 75, 255)), logo, white)
light.putalpha(a)
light.save(f'{out}/logo-light.png')
print('mark', mark.size, 'logo', logo.size)
