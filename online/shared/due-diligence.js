import { editorRequest } from "./adapters.js";
import { exampleBusiness, exampleLedger } from "../business/examples.js";
import technology from "../certificates/technology-catalog.json";
export async function dueDiligenceDemo() {
  const docs = [];
  const add = async (engine, p) => docs.push(...(await editorRequest(engine, p)).documents);
  const { serviceTemplates, serviceExamples } =
      await import("../contracts/content/software-services.js"),
    { newDraft } = await import("../contracts/model.js");
  for (const t of serviceTemplates) {
    const d = newDraft(t);
    d.id = "dd-" + t.id;
    d.name = t.title;
    d.updatedAt = "2026-10-19T00:00:00.000Z";
    d.values = structuredClone(serviceExamples[t.id]);
    await add("contracts", d);
  }
  for (const kind of [
    "order",
    "statement-of-work",
    "delivery",
    "acceptance",
    "supplement",
    "reconciliation",
    "interview",
    "email",
    "minutes",
    "ip-statement",
    "policy",
  ])
    await add("business", exampleBusiness(kind));
  for (const kind of ["contracts", "ip", "personnel", "leases", "subsidies", "projects"])
    await add("business", exampleLedger(kind));
  const { newRecord } = await import("../modules/rights/lib/registry.ts"),
    { extensionExample } = await import("../modules/rights/lib/extensions.ts");
  for (const [kind, view] of [
    ["patent", "change"],
    ["patent", "grantNotice"],
    ["patent", "pledgeRegistration"],
    ["patent", "pledgeReleaseRequest"],
    ["patent", "pledgeCancellation"],
    ["trademark", "change"],
    ["software", "change"],
  ]) {
    const record = newRecord(kind);
    record.id = "dd-" + kind;
    record.fields = { ...record.fields, ...extensionExample(kind, view) };
    record.views = [view];
    await add("rights", { schema: 1, name: record.fields.title, records: [record] });
  }
  for (const t of technology) await add("certificates", structuredClone(t.example));
  return {
    schema_version: "material-batch/1",
    batch_id: "due-diligence-smoke",
    name: "尽调材料全类型制件验收（独立示例）",
    documents: docs,
  };
}
