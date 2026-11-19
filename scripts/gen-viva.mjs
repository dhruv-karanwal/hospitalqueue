// Generates docs/VIVA.md from the same content the Concepts page uses.
import { writeFileSync } from 'node:fs';
import { CONCEPTS } from '../frontend/src/lib/concepts.js';

let md = '# Viva questions and answers\n\nGenerated from `frontend/src/lib/concepts.js` by `node scripts/gen-viva.mjs`. The same content is on the Concepts and viva page.\n\n';
for (const c of CONCEPTS) {
  md += `## ${c.title}\n\n${c.summary}\n\n- **See it in:** ${c.where.map((w) => w.label).join(', ')}\n- **Code:** ${c.code.map((f) => `\`${f}\``).join(', ')}\n\n`;
  c.qa.forEach(([q, a], i) => { md += `**Q${i + 1}. ${q}**\n\n${a}\n\n`; });
}
writeFileSync(new URL('../docs/VIVA.md', import.meta.url), md);
console.log(`wrote docs/VIVA.md (${CONCEPTS.length} concepts)`);
