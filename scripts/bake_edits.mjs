#!/usr/bin/env node
// Merges an exported route-editor edits file (localStorage overlay JSON,
// from the "Export edits" button in dist/route-editor.html) permanently into
// dist/data/*.geojson, so the edits become part of the committed dataset
// instead of staying stuck in one browser's localStorage.
//
// Reuses editor-model.mjs's real applyEdits() - the exact same merge logic
// the running app already trusts - rather than reimplementing it here, so
// baked output can never drift from what the browser actually shows.
//
// Usage:
//   node scripts/bake_edits.mjs path/to/accesspath-network-edits.json
//
// Safe to run on a clean checkout; back up dist/data/ first if unsure.
import {readFileSync, writeFileSync} from 'fs';
import {fileURLToPath} from 'url';
import path from 'path';
import {applyEdits, validateEdits} from '../dist/editor-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editsPath = process.argv[2];
if (!editsPath) {
  console.error('Usage: node scripts/bake_edits.mjs <exported-edits.json>');
  process.exit(1);
}

const edits = validateEdits(JSON.parse(readFileSync(editsPath, 'utf8')));
const dataDir = path.join(root, 'dist', 'data');
const read = name => JSON.parse(readFileSync(path.join(dataDir, name), 'utf8'));
const write = (name, value) => writeFileSync(path.join(dataDir, name), JSON.stringify(value, null, 2) + '\n');

const source = {
  buildings: read('buildings.geojson'),
  entrances: read('entrances.geojson'),
  paths: read('paths.geojson'),
  pois: read('pois.geojson'),
  metadata: read('metadata.json'),
  status: read('status-records.json'),
  studentRoutes: (() => { try { return read('student-routes.json'); } catch { return undefined; } })(),
};

const merged = applyEdits(source, edits);

// applyEdits() also materializes each screenshot leg as a runtime-only
// TRACE-* path edge so the editor can select/drag it like any other
// segment. That's derived from student-routes.json on every load - baking
// it into paths.geojson would duplicate it next time the app runs.
merged.paths.features = merged.paths.features.filter(f => !f.properties.segment_id.startsWith('TRACE-'));

write('paths.geojson', merged.paths);
write('entrances.geojson', merged.entrances);
if (merged.studentRoutes) write('student-routes.json', merged.studentRoutes);

const counts = [
  ['paths', Object.keys(edits.paths).length],
  ['entrances', Object.keys(edits.entrances).length],
  ['screenshot legs', Object.keys(edits.studentLegs).length],
  ['moved nodes', Object.keys(edits.nodes).length],
];
console.log('Baked edits into dist/data/*.geojson:');
for (const [label, n] of counts) if (n) console.log(`  ${n} ${label} changed`);
console.log('Re-run the test suite and reload the app to verify before committing.');
