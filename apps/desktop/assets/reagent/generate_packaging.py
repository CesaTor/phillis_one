"""Regenerate ReAgent's installer artwork: the DMG window, the DMG volume icon and the MSIX logo set.

    python3 generate_packaging.py          # from anywhere; paths are relative to this file

Reads  assets/reagent/icon.png (the mark, see generate.py) and public/reagent/logo-dark.webp.
Writes packaging/reagent/dmg-background.tiff   769x457 @72 dpi + 1538x914 @144 dpi, one multi-resolution TIFF
       packaging/reagent/dmg-volume.icns       the mounted disk's icon (a drive carrying the mark)
       assets/reagent/appx/*.png               the exact file set of assets/appx (same names and sizes)

The DMG window keeps the geometry of upstream's background (apps/desktop/electron-builder.config.cjs
`dmg.contents`: app icon centred on x=253,y=238, the Applications link on x=512,y=235, 96 px icons), so the
arrow sits between the two icon slots. Only Pillow is needed (pip install pillow); output is deterministic.
"""
from pathlib import Path

from PIL import Image, ImageCms, ImageDraw, ImageFilter, TiffImagePlugin

HERE = Path(__file__).resolve().parent
DESKTOP = HERE.parent.parent
MARK = Image.open(HERE / 'icon.png').convert('RGBA')
LOGO = Image.open(DESKTOP / 'public/reagent/logo-dark.webp').convert('RGBA')

BG = (6, 5, 14)  # #06050e
ACCENT = (150, 104, 255)  # the mark's violet
ACCENT_LIGHT = (214, 196, 255)

# DMG window: one @1x design in points, rendered at 1x and 2x.
W, H = 769, 457
APP_X, APP_Y, LINK_X, LINK_Y = 253, 238, 512, 235
CENTER_X = (APP_X + LINK_X) / 2


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def background(scale):
    w, h, s = W * scale, H * scale, scale
    base = Image.new('RGB', (w, h), BG)

    # Soft violet glow behind the logo and a fainter one behind the arrow.
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse([(CENTER_X - 210) * s, (62 - 90) * s, (CENTER_X + 210) * s, (62 + 90) * s], fill=(*ACCENT, 70))
    draw.ellipse([(CENTER_X - 150) * s, (236 - 70) * s, (CENTER_X + 150) * s, (236 + 70) * s], fill=(*ACCENT, 26))
    glow = glow.filter(ImageFilter.GaussianBlur(60 * s))
    canvas = base.convert('RGBA')
    canvas.alpha_composite(glow)

    # The wordmark, transparent artwork, centred in the upper band.
    logo_w = 300 * s
    logo = LOGO.resize((logo_w, round(LOGO.height * logo_w / LOGO.width)), Image.LANCZOS)
    canvas.alpha_composite(logo, (round(CENTER_X * s - logo_w / 2), round(62 * s - logo.height / 2)))

    # The arrow, drawn 4x and downsampled so it stays crisp at both densities.
    ss = 4
    arrow = Image.new('RGBA', (w * ss, h * ss), (0, 0, 0, 0))
    ad = ImageDraw.Draw(arrow)
    y = ((APP_Y + LINK_Y) / 2) * s * ss
    x0, x1 = (APP_X + 78) * s * ss, (LINK_X - 78) * s * ss
    thick, head = 5 * s * ss, 22 * s * ss
    steps = 64
    for i in range(steps):  # the shaft fades from violet to near-white towards the head
        a, b = x0 + (x1 - head * 0.6 - x0) * i / steps, x0 + (x1 - head * 0.6 - x0) * (i + 1) / steps
        ad.rectangle([a, y - thick / 2, b + 1, y + thick / 2], fill=(*lerp(ACCENT, ACCENT_LIGHT, i / steps), 255))
    ad.rounded_rectangle([x0 - thick / 2, y - thick / 2, x0 + thick / 2, y + thick / 2], thick / 2, fill=(*ACCENT, 255))
    ad.polygon([(x1, y), (x1 - head, y - head * 0.62), (x1 - head, y + head * 0.62)], fill=(*ACCENT_LIGHT, 255))
    halo = arrow.filter(ImageFilter.GaussianBlur(10 * s * ss))
    canvas.alpha_composite(halo.resize((w, h), Image.LANCZOS))
    canvas.alpha_composite(arrow.resize((w, h), Image.LANCZOS))

    return canvas.convert('RGB')


def write_dmg_background(path):
    """A two-directory TIFF. Pillow stamps one dpi on every frame of a save_all, and Finder picks the
    retina frame by its 144 dpi, so each directory is written with its own resolution."""
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    with TiffImagePlugin.AppendingTiffWriter(str(path), True) as tiff:
        for scale in (1, 2):
            frame = background(scale)
            frame.encoderinfo = {'dpi': (72 * scale, 72 * scale), 'icc_profile': srgb, 'compression': 'tiff_lzw'}
            frame.encoderconfig = ()
            TiffImagePlugin._save(frame, tiff, str(path))
            if scale == 1:
                tiff.newFrame()
    tiff.isFirst = True  # Pillow's writer would finalize again from __del__ and seek its closed file


def drive(size=1024):
    """The volume icon: a drive body in the product's near-black, the mark on its face, a base bar and a LED."""
    k = 4
    s = size * k
    sc = s / 1024
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    left, right, top, bottom = 152 * sc, 872 * sc, 73 * sc, 951 * sc
    d.rounded_rectangle([left, top, right, bottom], 70 * sc, fill=(*BG, 255))
    # Vertical body gradient, clipped to the drive silhouette.
    body = Image.new('RGBA', (s, s))
    bd = ImageDraw.Draw(body)
    for row in range(round(top), round(bottom)):
        t = (row - top) / (bottom - top)
        bd.line([(0, row), (s, row)], fill=(*lerp((30, 24, 56), (8, 6, 18), t), 255))
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([left, top, right, bottom], 70 * sc, fill=255)
    img.paste(body, (0, 0), mask)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([left, top, right, bottom], 70 * sc, outline=(*ACCENT, 255), width=round(7 * sc))
    # The mark.
    mark = MARK.resize((round(540 * sc),) * 2, Image.LANCZOS)
    img.alpha_composite(mark, (round(512 * sc - mark.width / 2), round(459 * sc - mark.height / 2)))
    # Base bar and LED.
    d.rounded_rectangle([left, 845 * sc, right, bottom], 54 * sc, fill=(*lerp((60, 46, 112), (24, 18, 48), 0.6), 255),
                        outline=(*ACCENT, 255), width=round(7 * sc))
    r = 20 * sc
    d.ellipse([792 * sc - r, 898 * sc - r, 792 * sc + r, 898 * sc + r], fill=(*ACCENT_LIGHT, 255))
    return img.resize((size, size), Image.LANCZOS)


def write_volume_icon(path):
    master = drive(1024)
    # Pillow resizes the sizes it is not handed with a cheaper filter; give it each one, downsampled well.
    frames = [master.resize((n, n), Image.LANCZOS) for n in (32, 64, 128, 256, 512)]
    master.save(path, format='ICNS', append_images=frames)


def scaled(n, factor):
    return int(n * factor + 0.5)


def appx_files():
    """name -> (size, kind) for exactly the set assets/appx ships: base, 4 scales, 14 target sizes x 3 forms."""
    files = {}
    scales = [(None, 1), ('scale-125', 1.25), ('scale-150', 1.5), ('scale-200', 2), ('scale-400', 4)]
    for base, w, h in (('Square44x44Logo', 44, 44), ('Square150x150Logo', 150, 150), ('StoreLogo', 50, 50), ('Wide310x150Logo', 310, 150)):
        for qualifier, f in scales:
            files[f'{base}{"." + qualifier if qualifier else ""}.png'] = ((scaled(w, f), scaled(h, f)), 'wide' if w != h else 'square')
    for target in (16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256):
        for form in ('', '_altform-unplated', '_altform-lightunplated'):
            files[f'Square44x44Logo.targetsize-{target}{form}.png'] = ((target, target), 'square')
    return files


def write_appx(out):
    out.mkdir(parents=True, exist_ok=True)
    for name, ((w, h), kind) in appx_files().items():
        if kind == 'square':
            img = MARK.resize((w, h), Image.LANCZOS)
        else:  # wide tile: the mark at two thirds of the height, centred, as upstream's tile does
            side = scaled(h, 2 / 3)
            img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            img.alpha_composite(MARK.resize((side, side), Image.LANCZOS), ((w - side) // 2, (h - side) // 2))
        img.save(out / name, optimize=True)


if __name__ == '__main__':
    packaging = DESKTOP / 'packaging/reagent'
    packaging.mkdir(parents=True, exist_ok=True)
    write_dmg_background(packaging / 'dmg-background.tiff')
    write_volume_icon(packaging / 'dmg-volume.icns')
    write_appx(HERE / 'appx')
    print('wrote', packaging, 'and', HERE / 'appx')
