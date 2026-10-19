import fs from 'node:fs/promises';
import {batchInputSchema} from '../online/shared/adapters.js';
await fs.writeFile(new URL('../online/public/reference-workbench-v1.schema.json',import.meta.url),JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',...batchInputSchema},null,2)+'\n');
