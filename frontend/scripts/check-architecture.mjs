import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=process.cwd();
const metadata=JSON.parse(await fs.readFile('node_modules/dependency-cruiser/package.json','utf8'));
const binary=path.resolve('node_modules/dependency-cruiser',metadata.bin.depcruise);
function cruise(){const result=spawnSync(process.execPath,[binary,'--validate','.dependency-cruiser.cjs','--output-type','json','src'],{cwd:root,encoding:'utf8'});if(result.error)throw result.error;return {status:result.status,report:JSON.parse(result.stdout)};}
const valid=cruise();if(valid.status!==0 || valid.report.summary.violations.some(v=>v.rule.severity==='error')){console.error(JSON.stringify(valid.report.summary,null,2));process.exit(1);}
const probe=await fs.mkdtemp(path.resolve('src/modules/architecture-probe-'));
if(!probe.startsWith(path.join(root,'src','modules')+path.sep))throw new Error('Invalid fixture path');
const moduleName=path.basename(probe);
try {
 for(const layer of ['domain','application','infrastructure','presentation'])await fs.mkdir(path.join(probe,layer),{recursive:true});
 await fs.writeFile(path.join(probe,'application','identity-sdk.ts'),"import Keycloak from 'keycloak-js'; export const provider=Keycloak;\n");
 await fs.writeFile(path.join(probe,'infrastructure','foreign-adapter.ts'),"export { createHttpHealthAdapter } from '@/modules/home/infrastructure/http-health-adapter';\n");
 await fs.writeFile(path.join(probe,'presentation','forbidden.ts'),'export { value } from "../infrastructure/adapter";\n');
 await fs.writeFile(path.join(probe,'domain','framework.ts'),"import * as React from 'react'; export const value=React.version;\n");
 await fs.writeFile(path.join(probe,'infrastructure','adapter.ts'),'export const value=1;\n');
 await fs.writeFile(path.join(probe,'application','reexport.ts'),'export { value } from "@/modules/'+moduleName+'/infrastructure/adapter";\n');
 await fs.writeFile(path.join(probe,'domain','a.ts'),'import { b } from "./b"; export const a=()=>b();\n');
 await fs.writeFile(path.join(probe,'domain','b.ts'),'import { a } from "./a"; export const b=()=>a();\n');
 const negative=cruise();const names=new Set(negative.report.summary.violations.map(v=>v.rule.name));
 if(!names.has('no-other-context-adapters-'+moduleName))throw new Error('Foreign adapter escaped context boundary');
 for(const rule of ['domain-is-pure','application-no-adapters','presentation-no-adapters','no-cycles'])if(!names.has(rule))throw new Error('Negative check did not detect '+rule);
 if(!negative.report.summary.violations.some(v=>v.rule.name==='application-no-adapters' && v.from.endsWith('/identity-sdk.ts')))throw new Error('Identity SDK escaped application boundary');

 console.log('Architecture valid; negative framework, alias/reexport and cycle checks passed.');
} finally {await fs.rm(probe,{recursive:true,force:true});}
