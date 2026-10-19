export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
  );
export function wrap(s, width, size) {
  const out = [];
  for (const para of String(s ?? "").split("\n")) {
    let line = "",
      used = 0;
    for (const ch of para) {
      const n = /[ -~]/.test(ch) ? size * 0.55 : size;
      if (used + n > width && line) {
        out.push(line);
        line = "";
        used = 0;
      }
      line += ch;
      used += n;
    }
    out.push(line);
  }
  return out;
}
export class LetterPages {
  constructor(
    title,
    {
      subtitle = "",
      number = "",
      color = "#273e4a",
      footer = "合成案例材料 · 不用于真实登记",
    } = {},
  ) {
    Object.assign(this, { title, subtitle, number, color, footer, pages: [], body: "", y: 0 });
    this.start();
  }
  text(x, y, s, size = 18, color = "#182126", anchor = "start") {
    return (
      '<text x="' +
      x +
      '" y="' +
      y +
      '" font-size="' +
      size +
      '" fill="' +
      color +
      '" text-anchor="' +
      anchor +
      '">' +
      esc(s) +
      "</text>"
    );
  }
  start() {
    this.body =
      '<rect width="794" height="1123" fill="#fff"/><path d="M54 72H740" stroke="' +
      this.color +
      '" stroke-width="2"/>';
    this.body += this.text(397, 55, this.subtitle || "业务文书", 18, this.color, "middle");
    this.y = 120;
    for (const line of wrap(this.title, 670, 26)) {
      this.body += this.text(397, this.y, line, 26, "#111", "middle");
      this.y += 38;
    }
    if (this.number) {
      this.body += this.text(64, this.y + 12, this.number, 15);
      this.y += 38;
    }
    this.y += 12;
  }
  next() {
    this.pages.push(this.body);
    this.start();
  }
  ensure(h) {
    if (this.y + h > 970) this.next();
  }
  paragraph(s, size = 18) {
    for (const line of wrap(s, 666, size)) {
      this.ensure(size * 1.7);
      this.body += this.text(64, this.y + size, line, size);
      this.y += size * 1.65;
    }
    this.y += 12;
  }
  heading(s) {
    this.ensure(95);
    this.body += this.text(64, this.y + 22, s, 20, this.color);
    this.y += 42;
  }
  pair(label, value) {
    this.ensure(80);
    this.body += this.text(64, this.y + 20, label, 17, "#53616a");
    this.y += 30;
    this.paragraph(value || "未载明");
  }
  table(headers, rows, widths) {
    const sum = widths.reduce((a, b) => a + b, 0),
      ws = widths.map((w) => (w / sum) * 666);
    const draw = (row, head, offset = 0, count) => {
      const lines = row.map((s, i) => wrap(s, ws[i] - 18, 16)),
        n = count ?? Math.max(...lines.map((l) => l.length)),
        h = n * 25 + 16;
      let x = 64;
      row.forEach((_, i) => {
        this.body +=
          '<rect x="' +
          x +
          '" y="' +
          this.y +
          '" width="' +
          ws[i] +
          '" height="' +
          h +
          '" fill="' +
          (head ? "#edf1f0" : "#fff") +
          '" stroke="#a9b5b8"/>';
        lines[i]
          .slice(offset, offset + n)
          .forEach((s, j) => (this.body += this.text(x + 8, this.y + 25 + j * 25, s, 16)));
        x += ws[i];
      });
      this.y += h;
    };
    this.ensure(110);
    draw(headers, true);
    for (const row of rows) {
      const max = Math.max(...row.map((s, i) => wrap(s, ws[i] - 18, 16).length));
      let offset = 0;
      while (offset < max) {
        if (this.y + 66 > 970) {
          this.next();
          draw(headers, true);
        }
        const n = Math.max(1, Math.min(max - offset, Math.floor((970 - this.y - 16) / 25)));
        draw(row, false, offset, n);
        offset += n;
      }
    }
    this.y += 16;
  }
  sign(issuer, date) {
    this.ensure(120);
    this.y = Math.max(this.y, 820);
    this.body +=
      this.text(722, this.y + 26, issuer, 17, "#263d44", "end") +
      this.text(722, this.y + 62, date, 17, "#263d44", "end") +
      this.text(722, this.y + 90, "样本签章", 16, "#a44949", "end");
    this.y += 116;
  }
  finish() {
    this.pages.push(this.body);
    return this.pages.map((s, i) => ({
      svg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123"><g font-family="Noto Sans CJK SC, PingFang SC, sans-serif">' +
        s +
        this.text(397, 1047, this.footer, 13, "#8a8f89", "middle") +
        this.text(725, 1074, i + 1 + " / " + this.pages.length, 12, "#8a8f89", "end") +
        "</g></svg>",
      width: 794,
      height: 1123,
      page: i + 1,
    }));
  }
}
