/**
 * migrate-r32-preds.js — remaps R32 prediction docs after fixture correction.
 * Uses whereIn (max 10 per query) to fetch all affected docs in 2 reads.
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const REMAP = {
  m074: 'm075', m075: 'm076', m076: 'm074',
  m077: 'm078', m078: 'm077',
  m081: 'm082', m082: 'm081',
  m083: 'm084', m084: 'm083',
  m086: 'm087', m087: 'm088', m088: 'm086',
};
const OLD_IDS = Object.keys(REMAP); // 12 ids

async function main() {
  console.log('Fetching affected predictions (2 whereIn queries)…');

  const toMigrate = [];

  // whereIn supports max 10 values — split into two batches
  const batches = [OLD_IDS.slice(0, 10), OLD_IDS.slice(10)];
  for (const ids of batches) {
    if (!ids.length) continue;
    const snap = await db.collection('predictions')
      .where('matchId', 'in', ids).get();
    snap.forEach(doc => {
      const data = doc.data();
      const newMatchId = REMAP[data.matchId];
      if (!newMatchId) return;
      toMigrate.push({
        oldRef: doc.ref,
        newRef: db.collection('predictions').doc(`${data.userId}_${newMatchId}`),
        newMatchId,
        data,
      });
    });
  }

  if (toMigrate.length === 0) {
    console.log('No predictions to migrate.');
    process.exit(0);
  }

  // Group by old matchId for logging
  const counts = {};
  toMigrate.forEach(({ data, newMatchId }) => {
    const k = `${data.matchId}→${newMatchId}`;
    counts[k] = (counts[k] || 0) + 1;
  });
  Object.entries(counts).forEach(([k, n]) => console.log(`  ${k}: ${n}`));
  console.log(`Total: ${toMigrate.length} predictions`);

  // Write new docs + delete old docs in one batch (max 500 ops per batch)
  const CHUNK = 200; // 200 pairs = 400 ops, well under limit
  for (let i = 0; i < toMigrate.length; i += CHUNK) {
    const chunk = toMigrate.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const { oldRef, newRef, newMatchId, data } of chunk) {
      batch.set(newRef, { ...data, matchId: newMatchId });
      batch.delete(oldRef);
    }
    await batch.commit();
    console.log(`Committed chunk ${Math.floor(i / CHUNK) + 1} (${chunk.length} pairs)`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
