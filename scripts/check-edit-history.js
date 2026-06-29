/**
 * check-edit-history.js
 * Prints full prediction + edit history for a given player + match.
 * Usage: NICKNAME="..." MATCH_ID="..." node scripts/check-edit-history.js
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const TARGET_NICKNAME = process.env.NICKNAME || '';
const TARGET_MATCH    = process.env.MATCH_ID  || '';  // e.g. m074

function fmt(ts) {
  if (!ts) return '—';
  if (ts.toDate) return ts.toDate().toISOString().replace('T',' ').slice(0,19) + ' UTC';
  return String(ts);
}

async function main() {
  // 1. Find user by nickname
  const uSnap = await db.collection('users').get();
  let userId = null, nickname = null;
  uSnap.forEach(d => {
    if (d.data().nickname === TARGET_NICKNAME) { userId = d.id; nickname = d.data().nickname; }
  });
  if (!userId) { console.log(`User not found: "${TARGET_NICKNAME}"`); process.exit(1); }
  console.log(`User: ${nickname} (${userId})\n`);

  // 2. Look for prediction — check both old and new matchId in case migration hasn't run
  const matchIds = [TARGET_MATCH];
  // If checking m074 (Brazil vs Japan), also check m076 (old matchId before migration)
  const ALSO_CHECK = { m074: 'm076', m075: 'm074', m076: 'm075', m077: 'm078', m078: 'm077',
                       m081: 'm082', m082: 'm081', m083: 'm084', m084: 'm083',
                       m086: 'm088', m087: 'm086', m088: 'm087' };
  if (ALSO_CHECK[TARGET_MATCH]) matchIds.push(ALSO_CHECK[TARGET_MATCH]);

  let pred = null;
  for (const mid of matchIds) {
    const ref = db.collection('predictions').doc(`${userId}_${mid}`);
    const snap = await ref.get();
    if (snap.exists) { pred = { id: snap.id, ...snap.data() }; break; }
  }

  if (!pred) {
    console.log(`No prediction found for match ${TARGET_MATCH} (also checked ${matchIds.slice(1).join(', ')})`);
    process.exit(0);
  }

  // 3. Print prediction details
  console.log('═══════════════════════════════════════════');
  console.log(`Doc ID      : ${pred.id}`);
  console.log(`Match ID    : ${pred.matchId}`);
  console.log(`Final Pick  : ${pred.predictedA} – ${pred.predictedB}${pred.penaltyPick ? ` (🏆 pens: ${pred.penaltyPick})` : ''}`);
  console.log(`Submitted   : ${fmt(pred.submittedAt)}`);
  console.log(`Last Updated: ${fmt(pred.updatedAt)}`);
  console.log(`Last-Minute : ${pred.lastMinute ? '🔥 YES' : 'No'}`);
  console.log(`Points Award: ${pred.pointsAwarded ?? 'not scored yet'}`);
  console.log('═══════════════════════════════════════════');

  const history = pred.editHistory || [];
  if (history.length === 0) {
    console.log('\nEdit History: none (prediction was never changed after first save)');
  } else {
    console.log(`\nEdit History (${history.length} change${history.length > 1 ? 's' : ''}):`);
    history.forEach((e, i) => {
      console.log(`\n  [${i+1}] ${e.changedAt}`);
      console.log(`      ${e.fromA}–${e.fromB}  →  ${e.toA}–${e.toB}`);
      if (e.fromPenaltyPick !== undefined) console.log(`      Pen pick: ${e.fromPenaltyPick||'none'} → ${e.toPenaltyPick||'none'}`);
      console.log(`      Match status at time: ${e.matchStatus || '—'}`);
      console.log(`      Last-minute window:   ${e.lastMinute ? 'YES 🔥' : 'No'}`);
    });
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
