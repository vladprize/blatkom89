/** Registers bundled fonts relative to the page (works at the domain root and under sub-paths). */
const FONTS: Array<[string, string, FontFaceDescriptors]> = [
  ['Oswald', 'assets/fonts/oswald.woff', { weight: '200 700' }],
  ['PT Sans Narrow', 'assets/fonts/ptsansnarrow-regular.woff', { weight: '400' }],
  ['PT Sans Narrow', 'assets/fonts/ptsansnarrow-bold.woff', { weight: '700' }],
  ['Caveat', 'assets/fonts/caveat.woff', { weight: '400 700' }],
  ['Permanent Marker', 'assets/fonts/permanentmarker.woff', {}],
];

export async function loadFonts(timeoutMs = 3000): Promise<void> {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  const base = new URL('.', document.baseURI).href;
  const loads = FONTS.map(async ([family, path, desc]) => {
    try {
      const f = new FontFace(family, `url(${base}${path}) format('woff')`, { display: 'swap', ...desc });
      document.fonts.add(f);
      await f.load();
    } catch {
      /* fall back to system fonts */
    }
  });
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, timeoutMs))]);
}
