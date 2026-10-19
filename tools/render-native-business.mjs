#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { cleanBusiness, businessFile, formatsFor } from "../online/business/model.js";
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, v, i, all) => {
    if (v.startsWith("--")) pairs.push([v.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
try {
  if (!args.input || !args.output)
    throw Error(
      "用法：node tools/render-native-business.mjs --input 文书.json --output 输出目录 [--formats docx,xlsx,csv]",
    );
  const bytes = await fs.readFile(args.input);
  if (bytes.length > 5 * 1024 * 1024) throw Error("输入超过5MB");
  const document = cleanBusiness(JSON.parse(bytes.toString("utf8"))),
    formats = args.formats
      ? args.formats.split(",")
      : document.kind === "ledger"
        ? ["xlsx", "csv"]
        : ["docx"];
  if (
    !formats.length ||
    new Set(formats).size !== formats.length ||
    formats.some((f) => !formatsFor(document).includes(f))
  )
    throw Error("输出格式不匹配");
  const sha = (b) => createHash("sha256").update(b).digest("hex"),
    root = path.resolve(args.output),
    files = [];
  const stem = document.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 85) || "业务文书";
  const manifestPath = path.join(root, "authoring", "native_delivery_manifest.json");
  async function assertNoSymlink(target) {
    for (let p = target; p !== path.dirname(root); p = path.dirname(p)) {
      try {
        if ((await fs.lstat(p)).isSymbolicLink()) throw Error("输出路径不可包含符号链接");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
  }

  try {
    await assertNoSymlink(manifestPath);
    const old = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (
      old.schema_version !== "native-business-delivery/1" ||
      old.input_sha256 !== sha(bytes) ||
      old.artifacts.length !== formats.length
    )
      throw Error("已有不同输入或格式的结果，请另选输出目录");
    for (const artifact of old.artifacts) {
      if (
        !formats.includes(artifact.format) ||
        artifact.path !== path.join(root, "candidate", stem + "." + artifact.format) ||
        artifact.producer !== "native" ||
        artifact.origin !== null
      )
        throw Error("已有回收记录与本次约定不符");
      await assertNoSymlink(artifact.path);
      const actual = await fs.readFile(artifact.path);
      if (actual.length !== artifact.bytes || sha(actual) !== artifact.sha256)
        throw Error("已有结果哈希不一致，请检查文件");
    }
    console.log(JSON.stringify(old));
    process.exit(0);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const format of formats) {
    const blob = await businessFile(document, format),
      data = Buffer.from(await blob.arrayBuffer()),
      target = path.join(root, "candidate", stem + "." + format);
    files.push({ format, target, data });
  }
  const artifacts = files.map((f) => ({
    document_id: document.id,
    producer: "native",
    workbench_engine: null,
    origin: null,
    format: f.format,
    path: f.target,
    sha256: sha(f.data),
    bytes: f.data.length,
    template_id: "business-" + document.kind + "-v1",
    input_sha256: sha(bytes),
    method: "local-native-generator",
  }));
  const manifest = {
    schema_version: "native-business-delivery/1",
    status: "GENERATED",
    input: path.resolve(args.input),
    input_sha256: sha(bytes),
    business_documents: 1,
    artifacts,
    inspection: "NOT_PERFORMED",
  };
  const writes = [
    ...files.map((f) => [f.target, f.data]),
    [
      path.join(root, "authoring", "native_delivery_manifest.json"),
      Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
    ],
  ];
  // Resolve the user-selected root; reject symlinks below it and preserve existing versions.
  for (const [target, data] of writes) {
    await assertNoSymlink(target);
    try {
      const old = await fs.readFile(target);
      if (!old.equals(data)) throw Error("已有不同版本，请另选输出目录：" + target);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  for (const [target, data] of writes) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.writeFile(target, data, { flag: "wx" });
    } catch (e) {
      if (e.code !== "EEXIST" || !(await fs.readFile(target)).equals(data)) throw e;
    }
  }
  console.log(JSON.stringify(manifest));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
