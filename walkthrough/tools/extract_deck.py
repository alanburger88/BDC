#!/usr/bin/env python3
"""Extract slide images and speaker notes from the presentation deck.

Creation-time tool: the walkthrough ships the extracted images and notes, not
the .pptx. Run it again only when the deck changes.

    python3 walkthrough/tools/extract_deck.py DECK.pptx [--pdf DECK.pdf]

The slides are rendered through PDF (LibreOffice, or a PDF you supply with
--pdf), then saved as WebP at the deck's native picture width (1376 px), a
smaller 800 px copy for narrow screens and a 320 px thumbnail for the contents
list. Speaker notes are copied verbatim into src/content/deck.json.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.dom import minidom

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SLIDES_DIR = ROOT / 'src' / 'assets' / 'slides'
DECK_JSON = ROOT / 'src' / 'content' / 'deck.json'
SIZES = {'': 1376, '-800': 800, '-thumb': 320}

A = 'http://schemas.openxmlformats.org/drawingml/2006/main'


def slide_order(z):
    """Slide part names in presentation order (from presentation.xml + rels)."""
    pres = minidom.parseString(z.read('ppt/presentation.xml'))
    rels = minidom.parseString(z.read('ppt/_rels/presentation.xml.rels'))
    target = {r.getAttribute('Id'): r.getAttribute('Target') for r in rels.getElementsByTagName('Relationship')}
    ids = [el.getAttribute('r:id') for el in pres.getElementsByTagName('p:sldId')]
    return ['ppt/' + target[i].lstrip('/').replace('ppt/', '') for i in ids]


def notes_for(z, slide_part):
    rels_part = slide_part.replace('slides/', 'slides/_rels/') + '.rels'
    if rels_part not in z.namelist():
        return ''
    rels = minidom.parseString(z.read(rels_part))
    for r in rels.getElementsByTagName('Relationship'):
        if r.getAttribute('Type').endswith('/notesSlide'):
            part = 'ppt/' + r.getAttribute('Target').replace('../', '')
            doc = minidom.parseString(z.read(part))
            paras = []
            for sp in doc.getElementsByTagName('p:sp'):
                ph = sp.getElementsByTagName('p:ph')
                if ph and ph[0].getAttribute('type') not in ('body', ''):
                    continue  # skip slide image / number placeholders
                for p in sp.getElementsByTagNameNS(A, 'p') or sp.getElementsByTagName('a:p'):
                    text = ''.join(t.firstChild.data if t.firstChild else '' for t in p.getElementsByTagName('a:t'))
                    if text.strip():
                        paras.append(text.strip())
            return '\n'.join(paras)
    return ''


def render_pdf(deck, out_dir, soffice):
    cmd = soffice + ['--headless', '--convert-to', 'pdf', '--outdir', str(out_dir), str(deck)]
    subprocess.run(cmd, check=True, timeout=600, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pdf = out_dir / (deck.stem + '.pdf')
    if not pdf.exists():
        sys.exit('PDF conversion failed')
    return pdf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('deck', type=Path)
    ap.add_argument('--pdf', type=Path, help='use an existing PDF render of the deck')
    ap.add_argument('--soffice', default='soffice', help='LibreOffice command (may include a wrapper, e.g. "python3 soffice.py")')
    args = ap.parse_args()

    with zipfile.ZipFile(args.deck) as z:
        parts = slide_order(z)
        notes = [notes_for(z, p) for p in parts]
        pres = minidom.parseString(z.read('ppt/presentation.xml'))
        size = pres.getElementsByTagName('p:sldSz')[0]
        ratio = int(size.getAttribute('cx')) / int(size.getAttribute('cy'))

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        pdf = args.pdf or render_pdf(args.deck, tmp, args.soffice.split())
        subprocess.run(['pdftoppm', '-png', '-scale-to-x', str(SIZES['']), '-scale-to-y', '-1', str(pdf), str(tmp / 'p')], check=True, timeout=600)
        pages = sorted(tmp.glob('p-*.png'), key=lambda p: int(re.search(r'-(\d+)\.png$', p.name).group(1)))
        if len(pages) != len(parts):
            sys.exit(f'{len(pages)} rendered pages for {len(parts)} slides')
        if SLIDES_DIR.exists():
            shutil.rmtree(SLIDES_DIR)
        SLIDES_DIR.mkdir(parents=True)
        for i, page in enumerate(pages, 1):
            im = Image.open(page).convert('RGB')
            # pdftoppm rounds the page height up to a partial last row, which it leaves
            # near-white: a light hairline under dark slides. Keep whole rows only.
            whole = int(im.width / ratio)
            if im.height > whole:
                im = im.crop((0, 0, im.width, whole))
            for suffix, width in SIZES.items():
                out = im if im.width == width else im.resize((width, round(width * im.height / im.width)), Image.LANCZOS)
                out.save(SLIDES_DIR / f'slide-{i:02d}{suffix}.webp', 'WEBP', quality=86 if suffix != '-thumb' else 80, method=6)

    deck = {
        'source': args.deck.name,
        'ratio': round(ratio, 4),
        'slides': [{'n': i, 'notes': n} for i, n in enumerate(notes, 1)],
    }
    DECK_JSON.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(parts)} slides, ratio {ratio:.4f}; notes and images written')


if __name__ == '__main__':
    main()
