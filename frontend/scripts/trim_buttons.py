from pathlib import Path

from PIL import Image, ImageOps


def trim_image(path: Path) -> Path:
  img = Image.open(path).convert("RGBA")
  alpha = img.split()[-1]
  bbox = alpha.getbbox()
  if bbox is None:
    rgb = img.convert("RGB")
    L = ImageOps.grayscale(rgb)
    mask = L.point(lambda p: 255 if p > 5 else 0, mode="L")
    bbox = mask.getbbox() or (0, 0, img.size[0], img.size[1])
  cropped = img.crop(bbox)
  out = path.with_name(f"{path.stem}-trim.png")
  cropped.save(out, format="PNG", optimize=True)
  print(path.name, "->", out.name, "size", cropped.size)
  return out


def main() -> None:
  root = Path(__file__).resolve().parents[1] / "public"
  files = ["другоекнопка.png", "сомнгкнопка.png", "пригласить.PNG"]
  for name in files:
    src = root / name
    if not src.exists():
      print("skip, no file:", src)
      continue
    trim_image(src)


if __name__ == "__main__":
  main()
