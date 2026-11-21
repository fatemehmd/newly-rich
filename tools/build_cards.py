#!/usr/bin/env python3
"""Compose exact editorial copy and original engravings on one shared master.

Pillow is used for font metrics and review thumbnails. SVG composes the actual
cards; librsvg renders their PNG exports. No generative tool rewrites the copy.
"""
import argparse
import base64
import hashlib
import html
import json
import os
from functools import lru_cache
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/consistent'
STYLE = json.loads((OUT / 'template/style.json').read_text())
CARDS = json.loads((ROOT / 'content/cards.json').read_text())
FONT_ROOT = Path(os.environ.get('NEWLY_RICH_FONT_DIR', '/System/Library/Fonts/Supplemental'))
FONTS = {
    'normal': FONT_ROOT / 'Times New Roman.ttf',
    'i': FONT_ROOT / 'Times New Roman Italic.ttf',
    'b': FONT_ROOT / 'Times New Roman Bold.ttf',
    'bi': FONT_ROOT / 'Times New Roman Bold Italic.ttf',
}


def plain(text):
    return re.sub(r'\[/?(?:red|i|b)\]', '', text)


def tokens(text, italic=False, bold=False, color=None):
    active = {'i': italic, 'b': bold, 'red': False}
    for part in re.split(r'(\[/?(?:red|i|b)\])', text):
        if re.fullmatch(r'\[/?(?:red|i|b)\]', part):
            active[part.strip('[]/')] = not part.startswith('[/')
        else:
            for word in re.findall(r'\s*\S+\s*', part):
                yield (word, active['i'], active['b'], STYLE['red'] if active['red'] else color or STYLE['ink'])


def font(size, italic=False, bold=False):
    return ImageFont.truetype(str(FONTS[('b' if bold else '') + ('i' if italic else '') or 'normal']), size)


def measure(word, size, italic=False, bold=False):
    return font(size, italic, bold).getlength(word)


def escape(text):
    return html.escape(str(text), quote=True)


@lru_cache(maxsize=None)
def asset_uri(path):
    return 'data:image/png;base64,' + base64.b64encode(Path(path).read_bytes()).decode('ascii')


class Card:
    def __init__(self, data):
        self.data = data
        self.parts = []
        self.texts = []
        self.boxes = []
        self.art_index = 0
        self.art_defs = {}

    def text(self, text, x, y, w, size='body', italic=False, bold=False,
             color=None, align='left', leading=None, tracking=None, bottom=866):
        px = STYLE.get(f'{size}_size', size)
        step = leading or px * STYLE['line_height']
        lines, current, width = [], [], 0
        for tok in tokens(text, italic, bold, color):
            tw = measure(tok[0], px, tok[1], tok[2])
            if current and width + tw > w:
                lines.append((current, width))
                current, width = [], 0
            current.append(tok)
            width += tw
        if current:
            lines.append((current, width))
        last = y + (len(lines) - 1) * step
        if last + px * .25 > bottom:
            raise ValueError(f'{self.data["id"]}: text overflows bottom at {last}: {plain(text)[:80]}')
        self.texts.append(plain(text))
        self.boxes.append({'text': plain(text), 'x': x, 'y': y - px, 'w': w, 'bottom': last + px * .25})
        for j, (line, line_w) in enumerate(lines):
            trimmed = measure(line[-1][0], px, line[-1][1], line[-1][2]) - measure(line[-1][0].rstrip(), px, line[-1][1], line[-1][2])
            line_w -= trimmed
            sx = x + ((w-line_w)/2 if align == 'center' else w-line_w if align == 'right' else 0)
            spans = ''.join(f'<tspan fill="{t[3]}" font-style="{"italic" if t[1] else "normal"}" font-weight="{"bold" if t[2] else "normal"}">{escape(t[0])}</tspan>' for t in line)
            spacing = f' letter-spacing="{tracking}"' if tracking else ''
            self.parts.append(f'<text x="{sx:.2f}" y="{y+j*step:.2f}" font-size="{px}" xml:space="preserve"{spacing}>{spans}</text>')
        return last + step

    def rule(self, x1, y1, x2, y2):
        self.parts.append(f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{STYLE["rule"]}" stroke-width="1.15"/>')

    def box(self, x, y, w, h):
        self.parts.append(f'<path d="M{x+20} {y} H{x+w-20} Q{x+w-5} {y+5} {x+w} {y+20} V{y+h-20} Q{x+w-5} {y+h-5} {x+w-20} {y+h} H{x+20} Q{x+5} {y+h-5} {x} {y+h-20} V{y+20} Q{x+5} {y+5} {x+20} {y} Z" fill="none" stroke="{STYLE["rule"]}" stroke-width="1.15"/>')

    def art(self, crop, x, y, w, h, source=None, clip=None):
        name = source or self.data['source']
        original = ROOT / 'assets/originals' / name
        with Image.open(original) as im:
            iw, ih = im.size
        cx, cy, cw, ch = crop
        if name not in self.art_defs:
            ident = f'original-{len(self.art_defs)}'
            self.art_defs[name] = (ident, f'<image id="{ident}" xlink:href="{asset_uri(original)}" width="{iw}" height="{ih}"/>')
        ident = self.art_defs[name][0]
        self.art_index += 1
        clip_id = f'art-clip-{self.art_index}'
        clip_shape = f'<path d="{clip}"/>' if clip else f'<rect x="{cx}" y="{cy}" width="{cw}" height="{ch}"/>'
        clip_def = f'<defs><clipPath id="{clip_id}">{clip_shape}</clipPath></defs>'
        clip_attr = f' clip-path="url(#{clip_id})"'
        # The original engraving is clipped declaratively in SVG. A shared
        # luminance-to-alpha filter removes its old paper and fixes the ink.
        self.parts.append(f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{cx} {cy} {cw} {ch}" preserveAspectRatio="xMidYMid meet" overflow="hidden">{clip_def}<g{clip_attr}><use xlink:href="#{ident}" filter="url(#engraving)"/></g></svg>')

    def element(self, el):
        el = dict(el)
        kind = el.pop('kind', 'text')
        if kind == 'text':
            self.text(**el)
        elif kind == 'art':
            self.art(**el)
        elif kind == 'box':
            self.box(**el)
        elif kind == 'rule':
            self.rule(**el)
        elif kind == 'check':
            self.parts.append(f'<rect x="{el["x"]}" y="{el["y"]}" width="25" height="25" fill="none" stroke="{STYLE["rule"]}" stroke-width="1.4"/>')
        else:
            raise ValueError(kind)

    def render(self):
        data = self.data
        if data.get('title'):
            self.text(data['title'], STYLE['margin'], STYLE['title_y'], 1450,
                      size='title', italic=True, leading=90, bottom=235)
        if data.get('number'):
            self.text(f'No. [red]{data["number"]}[/red]', 1380, STYLE['number_y'], 180, size=36, italic=True, align='right')
        if data.get('category'):
            self.text(data['category'], 110, 99, 600, size=26, bold=True, tracking=4)
        for element in data['elements']:
            self.element(element)
        content = ''.join(self.parts)
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1671" height="941" viewBox="0 0 1671 941">
<title>{escape(data.get('title') or data['id'])}</title>
<desc>Shared image-1 master, exact editorial copy, and preserved original engravings.</desc>
<defs>{''.join(item[1] for item in self.art_defs.values())}<filter id="engraving" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
<feColorMatrix type="matrix" values="0 0 0 0 0.1294 0 0 0 0 0.1098 0 0 0 0 0.0784 -0.2126 -0.7152 -0.0722 0 1"/>
<feComponentTransfer><feFuncA type="linear" slope="1.48" intercept="-0.16"/></feComponentTransfer>
</filter></defs>
<image xlink:href="{asset_uri(OUT / 'template/blank-card.png')}" width="1671" height="941"/>
<g font-family="{STYLE['font_family']}" fill="{STYLE['ink']}">{content}</g>
</svg>'''
        # The copy audit compares canonical JSON with actual text nodes. It
        # catches omitted, duplicated or changed words during composition.
        tree = ET.fromstring(svg)
        rendered = ' '.join(''.join(t.itertext()) for t in tree.iter('{http://www.w3.org/2000/svg}text'))
        canonical = ' '.join(self.texts)
        normalize = lambda s: re.sub(r'\s+', ' ', s).strip()
        if normalize(rendered) != normalize(canonical):
            raise ValueError(f'Copy mismatch in {data["id"]}')
        return svg


def review_sheet(cards):
    cw, ch = 557, 343
    sheet = Image.new('RGB', (cw*3, ch*((len(cards)+2)//3)), '#e8e2d5')
    draw = ImageDraw.Draw(sheet)
    for i, data in enumerate(cards):
        with Image.open(OUT / 'png' / f'{data["id"]}.png') as im:
            thumb = ImageOps.contain(im, (cw-12, ch-35))
            x, y = (i%3)*cw, (i//3)*ch
            sheet.paste(thumb, (x+6, y+5))
            draw.text((x+12, y+ch-23), data.get('title') or data['id'], fill=STYLE['ink'], font=font(15))
    sheet.save(OUT / 'contact-sheet.jpg', quality=94)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', help='Render one card by ID')
    args = parser.parse_args()
    if args.only and not any(c['id'] == args.only for c in CARDS):
        parser.error(f'Unknown card ID: {args.only}')
    if not shutil.which('rsvg-convert'):
        raise SystemExit('Install librsvg (rsvg-convert) to render the cards.')
    for path in FONTS.values():
        if not path.exists():
            raise SystemExit(f'Font missing: {path}. Set FONT_ROOT to the local Times New Roman directory.')
    for sub in ['editable', 'png']:
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    # Fontconfig's cache lives in the ignored workspace temporary directory.
    cache = ROOT / 'tmp/font-cache'
    cache.mkdir(parents=True, exist_ok=True)
    config = ROOT / 'tmp/fonts.conf'
    config.write_text(f'<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>{FONT_ROOT}</dir><cachedir>{cache}</cachedir></fontconfig>')
    env = dict(os.environ, FONTCONFIG_FILE=str(config))
    audit_path = OUT / 'copy-audit.json'
    prior_audit = json.loads(audit_path.read_text()) if args.only and audit_path.exists() else []
    audit = []
    for data in CARDS:
        if args.only and args.only != data['id']:
            continue
        card = Card(data)
        svg = card.render()
        svg_path = OUT / 'editable' / f'{data["id"]}.svg'
        svg_path.write_text(svg)
        png_path = OUT / 'png' / f'{data["id"]}.png'
        subprocess.run(['rsvg-convert', '--output', str(png_path), str(svg_path)], env=env, check=True)
        with Image.open(png_path) as im:
            if im.size != (1671, 941):
                raise ValueError(f'Wrong export dimensions: {im.size}')
            if im.mode == 'RGBA' and im.getextrema()[3] != (255, 255):
                raise ValueError(f'Unexpected transparency in {data["id"]}')
        audit.append({'id': data['id'], 'source': data['source'], 'original_sha256': hashlib.sha256((ROOT/'assets/originals'/data['source']).read_bytes()).hexdigest(), 'copy': card.texts, 'embedded_illustration_labels': data.get('embedded_illustration_labels', []), 'text_boxes': card.boxes})
        print(f'Rendered and verified {data["id"]}', flush=True)
    if audit:
        rendered_count = len(audit)
        merged_audit = {entry['id']: entry for entry in prior_audit}
        merged_audit.update({entry['id']: entry for entry in audit})
        audit = [merged_audit[c['id']] for c in CARDS if c['id'] in merged_audit]
        audit_path.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + '\n')
        (OUT / 'content.txt').write_text('\n\n'.join(f'=== {a["id"]} ===\n'+'\n\n'.join(a['copy']) for a in audit) + '\n')
        available = [c for c in CARDS if (OUT / 'png' / f'{c["id"]}.png').exists()]
        review_sheet(available)
        entries = []
        for data in CARDS:
            sid = data['id']
            entries.append(f'<figure><a href="png/{sid}.png"><img loading="lazy" src="png/{sid}.png" alt="{escape(data.get("title") or sid)}"></a><figcaption>{escape(data.get("title") or sid)} · <a href="editable/{sid}.svg">editable SVG</a> · <a href="png/{sid}.png" download>PNG</a></figcaption></figure>')
        (OUT/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newly Rich — Consistent Cards</title><style>body{margin:0;background:#e8e2d5;color:#211c14;font-family:Georgia,serif}main{max-width:1700px;margin:auto;padding:40px 24px}h1{font-style:italic;font-weight:400;font-size:42px;margin:0 0 12px}p{line-height:1.6}a{color:#a32821}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px}figure{margin:0}img{width:100%;height:auto;display:block}figcaption{padding:10px 4px;font-size:15px;line-height:1.5}@media(max-width:900px){section{grid-template-columns:1fr}}</style><main><h1>A Field Guide for the Newly Rich</h1><p>21 cards composed on one master from image 1. Original wording and printed numbering retained.<br><a href="template/blank-card.png">Blank master</a> · <a href="contact-sheet.jpg">Contact sheet</a> · <a href="content.txt">Complete copy</a></p><section>'+''.join(entries)+'</section></main></html>')
        print(f'Complete: {rendered_count} card(s) rendered; copy audit, review gallery and contact sheet refreshed.')


if __name__ == '__main__':
    main()
