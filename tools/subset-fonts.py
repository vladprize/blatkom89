#!/usr/bin/env python3
"""Subsets the OFL/Apache Google Fonts used by the UI to Latin + Cyrillic and writes WOFF files.

Sources (github.com/google/fonts): ofl/oswald, ofl/ptsansnarrow, ofl/caveat, apache/permanentmarker.
Licences are copied next to the output. Requires fontTools: pip install fonttools
"""
import shutil
import sys
from pathlib import Path
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '/home/claude/vendor-src/gfonts')
OUT = ROOT / 'apps/web/public/assets/fonts'
UNICODES = 'U+0020-007E,U+00A0-00BB,U+00AB,U+00B0,U+00B7,U+0401,U+0410-044F,U+0451,U+2013-2014,U+2018-201E,U+2026,U+2116,U+2190-2193,U+2212'
FONTS = {
    'oswald.woff': ('ofl/oswald/Oswald[wght].ttf', UNICODES),
    'ptsansnarrow-regular.woff': ('ofl/ptsansnarrow/PT_Sans-Narrow-Web-Regular.ttf', UNICODES),
    'ptsansnarrow-bold.woff': ('ofl/ptsansnarrow/PT_Sans-Narrow-Web-Bold.ttf', UNICODES),
    'caveat.woff': ('ofl/caveat/Caveat[wght].ttf', UNICODES),
    'permanentmarker.woff': ('apache/permanentmarker/PermanentMarker-Regular.ttf', 'U+0020-007E,U+2019'),
}

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for out, (src, uni) in FONTS.items():
        opts = subset.Options()
        opts.flavor = 'woff'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        font = subset.load_font(str(SRC / src), opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=subset.parse_unicodes(uni))
        sub.subset(font)
        subset.save_font(font, str(OUT / out), opts)
        print(out, (OUT / out).stat().st_size)
    for lic in ['ofl/oswald/OFL.txt', 'ofl/caveat/OFL.txt', 'ofl/ptsansnarrow/OFL.txt', 'apache/permanentmarker/LICENSE.txt']:
        p = SRC / lic
        if p.exists():
            shutil.copy(p, OUT / (lic.split('/')[1] + '-' + p.name))

if __name__ == '__main__':
    main()
