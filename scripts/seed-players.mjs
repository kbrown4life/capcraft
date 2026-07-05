// scripts/seed-players.mjs — load players into the `players` table.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/seed-players.mjs [path-to-json]
//
// - Uses the SERVICE ROLE key (bypasses RLS). NEVER ship this key to the client
//   or commit it. Run this locally / in CI only.
// - Default input: src/data/players.seed.json
// - Each record: { full_name, positions?, nba_team?, jersey_number?,
//                   status?, external_id?, external_source? }
// - Records WITH external_id upsert on (external_source, external_id).
// - Records WITHOUT external_id are inserted only if no player with the same
//   name (case-insensitive) already exists, so re-runs don't duplicate.

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv[2] || resolve(here, '../src/data/players.seed.json');

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function normalize(record) {
  const { first, last } = splitName(record.full_name);
  return {
    full_name: record.full_name.trim(),
    first_name: record.first_name ?? first,
    last_name: record.last_name ?? last,
    positions: record.positions ?? [],
    nba_team: record.nba_team ?? null,
    jersey_number: record.jersey_number ?? null,
    status: record.status ?? 'active',
    external_id: record.external_id ?? null,
    external_source: record.external_source ?? null
  };
}

async function main() {
  const raw = await readFile(inputPath, 'utf8');
  const records = JSON.parse(raw).map(normalize);

  const withExternal = records.filter((r) => r.external_id);
  const withoutExternal = records.filter((r) => !r.external_id);

  let upserted = 0;
  let inserted = 0;
  let skipped = 0;

  // 1) Provider-linked records: upsert on (external_source, external_id).
  if (withExternal.length) {
    const { error } = await supabase
      .from('players')
      .upsert(withExternal, { onConflict: 'external_source,external_id' });
    if (error) throw error;
    upserted = withExternal.length;
  }

  // 2) Starter records (no provider id): insert only if the name is new.
  if (withoutExternal.length) {
    const { data: existing, error: readError } = await supabase
      .from('players')
      .select('full_name');
    if (readError) throw readError;
    const have = new Set((existing || []).map((r) => r.full_name.toLowerCase()));

    const toInsert = withoutExternal.filter((r) => !have.has(r.full_name.toLowerCase()));
    skipped = withoutExternal.length - toInsert.length;

    if (toInsert.length) {
      const { error } = await supabase.from('players').insert(toInsert);
      if (error) throw error;
      inserted = toInsert.length;
    }
  }

  console.log(`Seed complete. upserted=${upserted} inserted=${inserted} skipped(existing)=${skipped}`);
}

main().catch((err) => {
  console.error('Seed failed:', err.message || err);
  process.exit(1);
});
