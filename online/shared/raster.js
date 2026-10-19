import { loadPDFFont } from "./pdf.js";
// SVG images cannot rely on the host browser having Chinese system fonts.
export async function rasterWithFont(
  page,
  { svg = page.svg, scale = 2, fontLoader = loadPDFFont } = {},
) {
  const font = await fontLoader();
  const content = svg.replace(
    /(<svg[^>]*>)/,
    "$1<style>@font-face{font-family:MaterialRaster;src:url(data:font/ttf;base64," +
      font +
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
