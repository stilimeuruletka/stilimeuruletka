from pathlib import Path

from PIL import Image


def trim_by_alpha_bbox(im: Image.Image, border: int = 6):
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    for x in range(w):
        for y in range(border):
            r, g, b, _a = px[x, y]
            px[x, y] = (r, g, b, 0)
            r, g, b, _a = px[x, h - 1 - y]
            px[x, h - 1 - y] = (r, g, b, 0)

    for y in range(h):
        for x in range(border):
            r, g, b, _a = px[x, y]
            px[x, y] = (r, g, b, 0)
            r, g, b, _a = px[w - 1 - x, y]
            px[w - 1 - x, y] = (r, g, b, 0)

    bbox = rgba.getchannel("A").getbbox()
    if not bbox:
        return rgba, None
    return rgba.crop(bbox), bbox


def main():
    paths = [
        "frontend/public/telegram-cloud-document-2-5364327192501197087 1.png",
        "frontend/public/telegram-cloud-document-2-5364327192501197088 1.png",
        "frontend/public/telegram-cloud-document-2-5364327192501197089 1.png",
        "frontend/public/telegram-cloud-document-2-5364327192501197090 1.png",
        "frontend/public/telegram-cloud-document-2-5364327192501197096 1.png",
    ]

    for p in paths:
        fp = Path(p)
        im = Image.open(fp)
        out, bbox = trim_by_alpha_bbox(im, border=6)
        out.save(fp, format="PNG", optimize=True)
        print(fp.name, "bbox", bbox, "->", out.size)


if __name__ == "__main__":
    main()
