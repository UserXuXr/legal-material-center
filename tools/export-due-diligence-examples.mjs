import fs from "node:fs/promises";
import { dueDiligenceDemo } from "../online/shared/due-diligence.js";
import { exampleBusiness, exampleLedger } from "../online/business/examples.js";
const base = new URL("../online/public/examples/", import.meta.url);
await fs.mkdir(new URL("native-business/", base), { recursive: true });
await fs.writeFile(
  new URL("due-diligence-smoke.batch.json", base),
  JSON.stringify(await dueDiligenceDemo(), null, 2) + "\n",
);
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
  await fs.writeFile(
    new URL("native-business/" + kind + ".json", base),
    JSON.stringify(exampleBusiness(kind), null, 2) + "\n",
  );
for (const kind of ["contracts", "ip", "personnel", "leases", "subsidies", "projects"])
  await fs.writeFile(
    new URL("native-business/ledger-" + kind + ".json", base),
    JSON.stringify(exampleLedger(kind), null, 2) + "\n",
  );
