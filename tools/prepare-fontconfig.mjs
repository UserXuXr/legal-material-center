#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  args = process.argv.slice(2),
  at = args.indexOf("--output"),
  target = path.resolve(at < 0 ? "work/qa-fonts/fonts.conf" : args[at + 1]);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
  );
const bundled = path.resolve(
  process.execPath,
  "../../../native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/Resources/fonts/truetype",
);
let extra = "";
try {
  if ((await fs.stat(bundled)).isDirectory()) extra = "<dir>" + esc(bundled) + "</dir>";
} catch {}
const xml =
  '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>' +
  esc(path.join(root, "online/public/fonts")) +
  "</dir>" +
  extra +
  "<cachedir>" +
  esc(path.join(path.dirname(target), "cache")) +
  "</cachedir>" +
  ["Source Han Serif CN", "Noto Sans CJK SC"]
    .map(
      (name) =>
        "<alias><family>" +
        name +
        "</family><prefer><family>Noto Sans SC</family></prefer></alias>",
    )
    .join("") +
  "</fontconfig>";
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.writeFile(target, xml);
console.log(target);
