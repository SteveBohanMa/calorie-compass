from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
CASES = [
    (
        Path(r"C:\Users\mabha\AppData\Local\Temp\codex-clipboard-4e530670-5e46-4914-8c18-113fb25bb4bf.png"),
        ROOT / "verification-v24-final" / "weekly-verification.png",
        ROOT / "design-qa-weekly.png",
        "v2.3 reference",
        "v2.4 editable weekly plan",
    ),
    (
        Path(r"C:\Users\mabha\AppData\Local\Temp\codex-clipboard-e306381a-cdb4-429f-bd0f-0fe22f824960.png"),
        ROOT / "verification-v24-release" / "nutrition-verification.png",
        ROOT / "design-qa-nutrition.png",
        "v2.3 reference",
        "v2.4 primary nutrition",
    ),
]

for source_path, implementation_path, output_path, source_label, implementation_label in CASES:
    source = Image.open(source_path).convert("RGB")
    implementation = Image.open(implementation_path).convert("RGB")
    target_height = 1292
    source = source.resize((round(source.width * target_height / source.height), target_height), Image.Resampling.LANCZOS)
    implementation = implementation.resize((round(implementation.width * target_height / implementation.height), target_height), Image.Resampling.LANCZOS)
    header = 54
    gap = 18
    canvas = Image.new("RGB", (source.width + implementation.width + gap, target_height + header), "white")
    canvas.paste(source, (0, header))
    canvas.paste(implementation, (source.width + gap, header))
    draw = ImageDraw.Draw(canvas)
    draw.text((16, 18), source_label, fill="#173f35")
    draw.text((source.width + gap + 16, 18), implementation_label, fill="#173f35")
    canvas.save(output_path, quality=95)
