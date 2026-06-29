/**
 * wipe-matches.js
 * Deletes all prediction docs for specified matchIds and marks matches as skipped.
 * Run via GitHub Actions.
 *
 * Required env vars:
 *   FIREBASE_SERVICE_ACCOUNT  — Firebase service account JSON (as a string)
 *
 * Usage:
 *   WIPE_IDS=m074,m075        — delete predictions + mark as skipped
 *   RESET_IDS=m076             — delete predictions + reset to upcoming (clears any results)
 */

'use strict';
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const WIPE_IDS  = (process.env.WIPE_IDS  || '').split(',').map(s => s.trim()).filter(Boolean);
const RESET_IDS = (process.env.RESET_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALL_IDS   = [...new Set([...WIPE_IDS, ...RESET_IDS])];

if (ALL_IDS.length === 0) {
  console.error('No match IDs specified. Set WIPE_IDS and/or RESET_IDS env vars.');
  process.exit(1);
}

console.log('Matches to skip (no predictions, no display):', WIPE_IDS);
console.log('Matches to reset (clear predictions + results, back to upcoming):', RESET_IDS);

async function deletePredsForMatch(matchId) {
  const snap = await db.collection('predictions').where('matchId', '==', matchId).get();
  if (snap.empty) {
    console.log(`  ${matchId}: no predictions found`);
    return 0;
  }
  // Delete in batches of 500
  let deleted = 0;
  const chunks = [];
  snap.docs.forEach((d, i) => {
    if (i % 500 === 0) chunks.push([]);
    chunks[chunks.length - 1].push(d);
  });
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
  }
  console.log(`  ${matchId}: deleted ${deleted} prediction doc(s)`);
  return deleted;
}

async function main() {
  let totalDeleted = 0;

  // 1. Delete all predictions for affected matches
  for (const id of ALL_IDS) {
    totalDeleted += await deletePredsForMatch(id);
  }

  // 2. Mark WIPE_IDS as skipped in Firestore
  if (WIPE_IDS.length > 0) {
    const batch = db.batch();
    for (const id of WIPE_IDS) {
      batch.set(db.collection('matches').doc(id), { status: 'skipped' }, { merge: true });
      console.log(`  ${id}: marked as skipped`);
    }
    await batch.commit();
  }

  // 3. Reset RESET_IDS back to upcoming (clear results)
  if (RESET_IDS.length > 0) {
    const batch = db.batch();
    for (const id of RESET_IDS) {
      batch.set(db.collection('matches').doc(id), {
        status: 'upcoming',
        resultA: null,
        resultB: null,
        penaltyWinner: null,
        backupSent: false,
      }, { merge: true });
      console.log(`  ${id}: reset to upcoming`);
    }
    await batch.commit();
  }

  console.log(`\nDone. Total predictions deleted: ${totalDeleted}`);
  console.log('Skipped:', WIPE_IDS.join(', ') || 'none');
  console.log('Reset to upcoming:', RESET_IDS.join(', ') || 'none');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
