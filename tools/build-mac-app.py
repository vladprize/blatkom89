#!/usr/bin/env python3
"""БЛАТКОМ ’89 for macOS, offline (v0.2.14): an app around the game's offline build.

Usage (after `node apps/web/build.mjs --mode=demo`):
  python3 tools/build-mac-app.py --electron electron-v33.2.1-darwin-arm64.zip --arch arm64 --out dist-mac
  (the zip is Electron's official macOS release from github.com/electron/electron/releases —
   check it against that release's SHASUMS256.txt)

Takes Electron's release (ad-hoc linker-signed, as Electron ships it), renames the app to
«BLATKOM 89.app», drops Electron's default app, puts tools/mac-app (main.js; package.json with the
game's version) and apps/web/dist-demo (the offline build with its assets and the soundtrack, without
the single-file copy) into Contents/Resources/app, sets the name, bundle id, version and icon
(tools/mac-app/icon.png) in Info.plist, and zips the app with its symlinks and permissions as
BLATKOM-89-mac-<arch>.zip. Not signed with an Apple Developer ID and not notarized: the player approves
the first launch (right-click → Open, or System Settings → Privacy & Security → Open Anyway). A .dmg
needs Apple's own tools (hdiutil), so the app ships as a zip — the same thing once unpacked.
"""
import argparse
import json
import plistlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
APP = 'BLATKOM 89.app'


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--electron', required=True, help="Electron's darwin release zip")
    ap.add_argument('--arch', required=True, choices=['arm64', 'x64'])
    ap.add_argument('--out', required=True)
    ap.add_argument('--keep', action='store_true', help='also leave the unpacked app in --out')
    a = ap.parse_args()
    game = ROOT / 'apps/web/dist-demo'
    if not (game / 'index.html').exists():
        sys.exit('build the offline client first: node apps/web/build.mjs --mode=demo')
    version = json.loads((ROOT / 'package.json').read_text())['version']
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        subprocess.run(['unzip', '-q', str(Path(a.electron).resolve()), '-d', str(tmp)], check=True)
        app = tmp / APP
        (tmp / 'Electron.app').rename(app)
        res = app / 'Contents/Resources'
        (res / 'default_app.asar').unlink(missing_ok=True)
        dst = res / 'app'
        dst.mkdir()
        shutil.copy2(ROOT / 'tools/mac-app/main.js', dst / 'main.js')
        pkg = json.loads((ROOT / 'tools/mac-app/package.json').read_text())
        pkg['version'] = version
        (dst / 'package.json').write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + '\n')
        shutil.copytree(game, dst / 'game', ignore=shutil.ignore_patterns('blatkom89-demo.html'))
        Image.open(ROOT / 'tools/mac-app/icon.png').save(res / 'blatkom.icns')
        plist = app / 'Contents/Info.plist'
        with open(plist, 'rb') as f:
            info = plistlib.load(f)
        info.update({
            'CFBundleName': 'BLATKOM 89',
            'CFBundleDisplayName': 'BLATKOM 89',
            'CFBundleIdentifier': 'com.blatkom89.offline',
            'CFBundleIconFile': 'blatkom.icns',
            'CFBundleShortVersionString': version,
            'CFBundleVersion': version,
            'NSHumanReadableCopyright': 'БЛАТКОМ ’89 — «Районные дела — серьёзные дела»',
            'LSApplicationCategoryType': 'public.app-category.action-games',
        })
        with open(plist, 'wb') as f:
            plistlib.dump(info, f)
        name = f'BLATKOM-89-mac-{a.arch}.zip'
        (out / name).unlink(missing_ok=True)
        # -y keeps the frameworks' symlinks as symlinks (Archive Utility restores them), permissions kept
        subprocess.run(['zip', '-qry', '-X', str(out / name), APP], cwd=tmp, check=True)
        if a.keep:
            target = out / f'{a.arch}' / APP
            shutil.rmtree(target, ignore_errors=True)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(app, target, symlinks=True)
        size = (out / name).stat().st_size / 1024 / 1024
        print(f'[mac] {out / name} ({size:.1f} MB, v{version}, {a.arch})')


if __name__ == '__main__':
    main()
