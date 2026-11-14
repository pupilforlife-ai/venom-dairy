import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/preview/**/*.test.ts', 'src/traceability/**/*.test.ts'], environment: 'node' } });
