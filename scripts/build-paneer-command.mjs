// Ship the exact same tested domain functions to the authenticated Edge handler.
import {build} from 'esbuild';
await build({entryPoints:['src/traceability/server/commands.ts'],bundle:true,format:'esm',platform:'neutral',target:'es2022',outfile:'supabase/functions/_shared/paneerCommands.js',minify:false,treeShaking:true});
