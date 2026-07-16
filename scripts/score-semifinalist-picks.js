/**
 * score-semifinalist-picks.js
 * One-time script (GitHub Actions) to award 10 pts per correct semi-finalist pick.
 *
 * Confirmed semi-finalists: France, Spain, England, Argentina
 * Each user's `semifinalistPicks` array is read; 10 pts awarded per match.
 * Guard field `semifinalistPicksScored: true` prevents double-apply.
 *
 * Required env vars:
 *   FIREBASE_SERVICE_ACCOUNT  — Firebase service account JSON (as a string)
 */

'use strict';
const admin = require('firebase-admin');

const SEMI_FINALISTS = ['France', 'Spain', 'England', 'Argentina'];
const PTS_PER_PICK   = 10;
const GUARD_FIELD    = 'semifinalistPicksScored';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  console.log(`[${new Date().toISOString()}] Scoring semi-finalist picks…`);
  console.log(`Confirmed semi-finalists: ${SEMI_FINALISTS.join(', ')}`);

  const usersSnap = await db.collection('users').get();
  const batch     = db.batch();
  let awarded = 0, skipped = 0, noPickCount = 0;

  usersSnap.forEach(doc => {
    const data = doc.data();

    // Skip if already scored
    if (data[GUARD_FIELD]) { skipped++; return; }

    const picks = data.semifinalistPicks ?? [];
    if (!Array.isArray(picks) || picks.length === 0) { noPickCount++; return; }

    const correctPicks = picks.filter(p => SEMI_FINALISTS.includes(p));
    const pts          = correctPicks.length * PTS_PER_PICK;

    console.log(`  ${data.displayName || doc.id}: picks=[${picks.join(', ')}] → ${correctPicks.length} correct → +${pts} pts`);

    batch.update(doc.ref, {
      totalPoints:          (data.totalPoints || 0) + pts,
      semifinalistPickPts:  pts,
      [GUARD_FIELD]:        true,
    });
    awarded++;
  });

  if (awarded === 0) {
    console.log('Nothing to award (all already scored or no picks).');
    process.exit(0);
  }

  await batch.commit();
  console.log(`\nDone. Awarded points to ${awarded} user(s). Skipped ${skipped} already-scored, ${noPickCount} with no picks.`);
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
