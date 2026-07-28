from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "verification-readme-v25"
OUTPUT = ROOT / "docs" / "readme"
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")

SCREENS = [
    ("desktop-verification.png", "home.png", "首页", "核心功能一目了然"),
    ("food-verification.png", "lookup.png", "热量快查", "按场景浏览离线食物目录"),
    ("workout-verification.png", "workout.png", "训练估算", "用训练参数估算消耗区间"),
    ("weekly-verification.png", "plan.png", "每周计划", "编辑饮食与训练并导出周报"),
    ("converter-verification.png", "converter.png", "单位换算", "kcal 与 kJ 双向换算"),
    ("compare-verification.png", "compare.png", "热量对比", "统一按每 100 克直观比较"),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold and FONT_BOLD.exists() else FONT_REGULAR
    return ImageFont.truetype(str(path), size)


def rounded_image(image: Image.Image, size: tuple[int, int], radius: int) -> Image.Image:
    fitted = image.convert("RGB").resize(size, Image.Resampling.LANCZOS)
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    fitted.putalpha(mask)
    return fitted


def paste_with_shadow(canvas: Image.Image, image: Image.Image, xy: tuple[int, int], blur: int = 22) -> None:
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_layer = Image.new("RGBA", image.size, (13, 77, 60, 95))
    shadow_layer.putalpha(image.getchannel("A").point(lambda value: value * 70 // 255))
    shadow.alpha_composite(shadow_layer, (xy[0] + 10, xy[1] + 18))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(image, xy)


def pill(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill: str, foreground: str) -> int:
    label_font = font(23, True)
    box = draw.textbbox((0, 0), text, font=label_font)
    width = box[2] - box[0] + 42
    draw.rounded_rectangle((xy[0], xy[1], xy[0] + width, xy[1] + 48), radius=24, fill=fill)
    draw.text((xy[0] + 21, xy[1] + 9), text, font=label_font, fill=foreground)
    return width


def create_intro(images: dict[str, Image.Image]) -> None:
    canvas = Image.new("RGBA", (1600, 900), "#F3FBF7")
    draw = ImageDraw.Draw(canvas)

    draw.rounded_rectangle((52, 48, 1548, 852), radius=54, fill="#EAF8F2", outline="#D3EDE3", width=2)
    draw.ellipse((1120, -240, 1700, 340), fill="#DDF6EA")
    draw.ellipse((-180, 650, 360, 1190), fill="#E1F4EF")

    draw.rounded_rectangle((118, 104, 366, 152), radius=24, fill="#D8F6E9")
    draw.text((142, 114), "v2.5  ·  OFFLINE FIRST", font=font(20, True), fill="#127457")
    draw.text((118, 218), "燃卡快查", font=font(72, True), fill="#103F35")
    draw.text((118, 308), "Calorie Compass", font=font(40, True), fill="#238966")
    draw.text((118, 386), "离线饮食查询、训练估算与每周计划工具", font=font(28), fill="#496F66")
    draw.text((118, 432), "把每一口和每一次训练，记录得更清楚。", font=font(28), fill="#496F66")

    x = 118
    y = 518
    for label, fill_color in [
        ("128 条离线食物记录", "#DDF5CF"),
        ("训练消耗区间", "#D8F1F6"),
        ("周计划与周报", "#E0F5ED"),
        ("中英文界面", "#F6EBD8"),
    ]:
        width = pill(draw, (x, y), label, fill_color, "#164F42")
        x += width + 14
        if x > 625:
            x = 118
            y += 64

    draw.text((118, 692), "React 19  ·  TypeScript  ·  Electron  ·  Windows x64", font=font(22), fill="#66867E")
    draw.text((118, 745), "开源小项目  /  本地优先  /  无需账号", font=font(24, True), fill="#174F42")

    back = rounded_image(images["lookup.png"], (278, 520), 32)
    main = rounded_image(images["home.png"], (320, 600), 38)
    front = rounded_image(images["plan.png"], (278, 520), 32)
    paste_with_shadow(canvas, back, (740, 190))
    paste_with_shadow(canvas, main, (948, 112))
    paste_with_shadow(canvas, front, (1224, 218))

    canvas.convert("RGB").save(OUTPUT / "intro.png", quality=94, optimize=True)


def create_demo(images: dict[str, Image.Image]) -> None:
    frames: list[Image.Image] = []
    for index, (_, filename, title, description) in enumerate(SCREENS, start=1):
        canvas = Image.new("RGB", (900, 720), "#F3FBF7")
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle((28, 28, 872, 692), radius=42, fill="#E8F7F1", outline="#CFEADF", width=2)
        draw.rounded_rectangle((70, 74, 182, 114), radius=20, fill="#CFF3E2")
        draw.text((91, 82), f"STEP {index}", font=font(18, True), fill="#18775A")
        draw.text((70, 160), title, font=font(52, True), fill="#103F35")
        draw.text((70, 232), description, font=font(24), fill="#52756D")
        draw.line((70, 302, 350, 302), fill="#B7DCCF", width=2)
        draw.text((70, 338), "燃卡快查 · Calorie Compass", font=font(20, True), fill="#238966")
        draw.text((70, 382), "离线使用", font=font(22), fill="#486D64")
        draw.text((70, 420), "数据保存在本机", font=font(22), fill="#486D64")
        draw.text((70, 458), "Windows 便携版", font=font(22), fill="#486D64")
        draw.text((70, 612), f"{index} / {len(SCREENS)}", font=font(20, True), fill="#7A9890")

        screen = rounded_image(images[filename], (338, 634), 34)
        layer = canvas.convert("RGBA")
        paste_with_shadow(layer, screen, (498, 44), blur=18)
        frames.append(layer.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))

    frames[0].save(
        OUTPUT / "demo.gif",
        save_all=True,
        append_images=frames[1:],
        duration=[1700] * len(frames),
        loop=0,
        optimize=True,
        disposal=2,
    )


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    images: dict[str, Image.Image] = {}
    for source_name, output_name, _, _ in SCREENS:
        source = Image.open(SOURCE / source_name).convert("RGB")
        source.save(OUTPUT / output_name, quality=92, optimize=True)
        images[output_name] = source

    create_intro(images)
    create_demo(images)
    print(f"Generated README assets in {OUTPUT}")


if __name__ == "__main__":
    main()
