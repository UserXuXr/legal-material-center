import { loadPDFFont } from "./pdf.js";
const latinStack = {times:'"Times New Roman",Times,serif', helvetica:'Helvetica,Arial,sans-serif', courier:'"Courier New",Courier,monospace'};
export async function svgWithPairing(svg, pairing) {
  if (!pairing) return svg;
  const {loadChineseFont, toBase64, missingGlyphs, isCjk} = await import('./font-policy.js');
  const bytes = await loadChineseFont(pairing);
  const plain = svg.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  const sample = [...plain].filter(isCjk).join('');
  const missing = missingGlyphs(bytes, sample);
  if (missing.length) throw Error(`所选中文字体缺少这些字，已停止且未生成文件：${[...new Set(missing)].slice(0, 24).join(' ')}`);
  if (svg.includes('font-family:PairCJK')) return svg;
  const style = `<style>@font-face{font-family:PairCJK;src:url(data:font/ttf;base64,${toBase64(bytes)})}text,tspan{font-family:${latinStack[pairing.latin]},PairCJK!important}</style>`;
  return svg.replace(/(<svg\b[^>]*>)/, '$1' + style);
}
// SVG images cannot rely on the host browser having Chinese system fonts.
export async function rasterWithFont(
  page,
  { svg = page.svg, scale = 2, fontLoader = loadPDFFont, pairing } = {},
) {
  const {activePairing} = await import('./font-policy.js');
  const chosen = pairing === undefined ? activePairing() : pairing;
  const content = chosen ? await svgWithPairing(svg, chosen) : svg.replace(
    /(<svg[^>]*>)/,
    "$1<style>@font-face{font-family:MaterialRaster;src:url(data:font/ttf;base64," +
      (await fontLoader()) +
      ")}text{font-family:MaterialRaster,sans-serif!important}</style>",
  );
  const url = URL.createObjectURL(new Blob([content], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        reject(Error("中文页面图片生成超时"));
      }, 20000);
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(Error("中文页面图片生成失败"));
      };
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(page.width * scale);
    canvas.height = Math.round(page.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("当前浏览器无法生成图片");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
