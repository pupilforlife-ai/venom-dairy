// Synthetic PostgreSQL tests run against TEMP tables in a rollback transaction.
// --snapshot produces a private, local recovery artifact before installation.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const ref = (await fs.readFile(path.join(root, 'supabase/.temp/project-ref'), 'utf8')).trim();
if (ref !== 'pgvoixprzecvdrueaxgk') throw Error('Unexpected linked project; stopped.');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vejoy-butter-loss-'));
await fs.chmod(dir, 0o700);
const query = args => execFileSync('supabase', ['db', 'query', '--linked', ...args, '--output', 'json'], { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
if (process.argv.includes('--snapshot')) {
  const data = query([`select now() as captured_at,
    (select jsonb_agg(to_jsonb(s)) from public.app_state s where key in ('vejoy_productionRounds','vejoy_milkLots','vejoy_finishedStock')) as state,
    (select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('prepare_butter_pool_loss','record_butter_pool_loss','guard_butter_loss_state')) as existing_definitions`]);
  JSON.parse(data);
  const file = path.join(dir, 'recovery-snapshot.json');
  await fs.writeFile(file, data, { mode: 0o600 });
  console.log(JSON.stringify({ recoverySnapshot: file, private: true, liveRecordsChanged: false }));
} else {
  const migration = await fs.readFile(path.join(root, 'supabase/migrations/20261103150000_audited_butter_pool_losses.sql'), 'utf8');
  const tests = await fs.readFile(path.join(root, 'supabase/tests/butter_pool_losses.sql'), 'utf8');
  const sql = migration.replace(/commit;\s*$/, '') + tests.replace(/\bbegin;\s*/, '');
  if (!sql.trimEnd().endsWith('rollback;')) throw Error('Tests must end with rollback.');
  const file = path.join(dir, 'rollback-test.sql');
  await fs.writeFile(file, sql, { mode: 0o600 });
  const result = JSON.parse(query(['--file', file]));
  console.log(JSON.stringify({ ...result, testSql: file }));
}
