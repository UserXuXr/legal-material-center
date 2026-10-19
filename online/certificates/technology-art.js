const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
  );
export function technologyArt(template) {
  const [w, h] = template.page_mm,
    pt = 72 / 25.4,
    color =
      template.kind === "high_tech_enterprise"
        ? "#9c8647"
        : template.kind === "spca"
          ? "#286778"
          : "#477d88";
  const text = (x, y, s, size = 10, anchor = "start") =>
    '<text x="' +
    x * pt +
    '" y="' +
    y * pt +
    '" font-size="' +
    size +
    '" fill="#26353d" text-anchor="' +
    anchor +
    '">' +
    esc(s) +
    "</text>";
  let art =
    '<rect width="' +
    w * pt +
    '" height="' +
    h * pt +
    '" fill="#fffefa"/><rect x="' +
    14 * pt +
    '" y="' +
    13 * pt +
    '" width="' +
    (w - 28) * pt +
    '" height="' +
    (h - 26) * pt +
    '" stroke="' +
    color +
    '" stroke-width="1.8" fill="none"/><rect x="' +
    17 * pt +
    '" y="' +
    16 * pt +
    '" width="' +
    (w - 34) * pt +
    '" height="' +
    (h - 32) * pt +
    '" stroke="' +
    color +
    '" stroke-width=".5" fill="none"/>';
  art += text(
    w / 2,
    34,
    template.art_heading,
    template.kind === "high_tech_enterprise" ? 25 : 20,
    "middle",
  );
  if (template.art_subtitle) art += text(w / 2, 47, template.art_subtitle, 13, "middle");
  for (const field of template.fields) {
    const element = template.elements.find((e) => e.key === field.key);
    art += text(26, element.y + 2, field.label, 9.5);
  }
  art += text(w / 2, h - 22, "合成案例材料 · 不用于真实认证或备案", 9, "middle");
  art += text(w - 26, h - 36, "样本签章", 13, "end");
  return art;
}
