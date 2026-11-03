"""
Estrae dal TUO PDF di Friends Forever le illustrazioni usate dall'interfaccia del sistema.

    pip install pymupdf pillow
    python tools/extract-art.py "C:/percorso/Friends Forever.pdf"

Scrive le immagini (JPG ridimensionati) in assets/ff-art/. Quella cartella è ignorata da git ed
esclusa dallo zip: le illustrazioni sono di Jioke / Elisa Lo Porto e non vanno ridistribuite.
Gli xref sono quelli del PDF "[SINGLE PAGE]" della prima edizione; con un'altra edizione cambiano:
lancia con --list per vedere le immagini grandi di ogni pagina e adatta la mappa PAGINE.
"""
import sys
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image

# nome -> numero di pagina (1-based) dell'illustrazione a tutta pagina
PAGINE = {
    "cover": 1,
    "grunge": 2,
    "famiglia": 6,
    "carta": 12,
    "mani": 10,
    "maschera": 15,
    "crisi": 16,
    "ospedale": 19,
    "bullismo": 21,
    "folla": 23,
    "infanzia": 25,
    "solitudine": 27,
    "occhi": 29,
    "culla": 31,
    "porta": 33,
    "nonna": 34,
    "ombra": 37,
    "lutto": 39,
}


def biggest_image(page):
    best = None
    for im in page.get_images(full=True):
        xref, w, h = im[0], im[2], im[3]
        if w >= 1800:  # sfondo di carta a tutta pagina, non è un'illustrazione
            continue
        if best is None or w * h > best[1] * best[2]:
            best = (xref, w, h)
    return best


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pdf = fitz.open(sys.argv[1])
    if "--list" in sys.argv:
        for i, page in enumerate(pdf, 1):
            b = biggest_image(page)
            print(i, b)
        return
    out = Path(__file__).resolve().parent.parent / "assets" / "ff-art"
    out.mkdir(parents=True, exist_ok=True)
    for name, n in PAGINE.items():
        b = biggest_image(pdf[n - 1])
        if not b:
            print("nessuna immagine a pagina", n, name)
            continue
        pix = fitz.Pixmap(pdf, b[0])
        if pix.alpha or pix.colorspace.n > 3:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        im = Image.frombytes("RGB" if pix.n >= 3 else "L", (pix.width, pix.height), pix.samples).convert("RGB")
        im.thumbnail((1000, 1400))
        im.save(out / f"{name}.jpg", quality=80, optimize=True)
        print(name, "<-", f"pag. {n}", im.size)


if __name__ == "__main__":
    main()
