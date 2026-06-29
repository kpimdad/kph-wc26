/**
 * show-all-edits.js
 * Scans all prediction docs and prints every one that has an editHistory.
 * Groups by user, sorted by most recent edit.
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

function fmt(ts) {
  if (!ts) return '—';
  if (ts.toDate) return ts.toDate().toISOString().replace('T',' ').slice(0,19) + ' UTC';
  return String(ts);
}

async function main() {
  // Load user nicknames and match names in one pass each
  const [uSnap, mSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('matches').get(),
  ]);
  const userMap  = {};  uSnap.forEach(d => { userMap[d.id]  = d.data().nickname || d.id; });
  const matchMap = {};  mSnap.forEach(d => { matchMap[d.id] = `${d.data().teamA} vs ${d.data().teamB}`; });

  // Scan all predictions for editHistory using whereIn on all matchIds that need checking
  // Simpler: just get all predictions (only 15 users × ~88 matches = ~1320 docs max)
  const pSnap = await db.collection('predictions').get();

  const withEdits = [];
  pSnap.forEach(d => {
    const p = d.data();
    if (p.editHistory && p.editHistory.length > 0) {
      withEdits.push({ ...p, docId: d.id });
    }
  });

  if (withEdits.length === 0) {
    console.log('No predictions with edit history found.');
    process.exit(0);
  }

  // Sort by most recent edit timestamp
  withEdits.sort((a, b) => {
    const aLast = a.editHistory[a.editHistory.length - 1]?.changedAt || '';
    const bLast = b.editHistory[b.editHistory.length - 1]?.changedAt || '';
    return bLast.localeCompare(aLast);
  });

  console.log(`Found ${withEdits.length} prediction(s) with edit history:\n`);
  console.log('═'.repeat(60));

  for (const p of withEdits) {
    const nick  = userMap[p.userId]  || p.userId;
    const match = matchMap[p.matchId] || p.matchId;
    console.log(`\n👤 ${nick}  |  ${match} (${p.matchId})`);
    console.log(`   Final pick : ${p.predictedA}–${p.predictedB}${p.penaltyPick ? ` 🏆 ${p.penaltyPick}` : ''}`);
    console.log(`   Submitted  : ${fmt(p.submittedAt)}`);
    console.log(`   Last edit  : ${fmt(p.updatedAt)}`);
    console.log(`   ${p.editHistory.length} edit(s):`);
    p.editHistory.forEach((e, i) => {
      const lm = e.lastMinute ? ' 🔥 LAST MINUTE' : '';
      console.log(`     [${i+1}] ${e.changedAt}  ${e.fromA}–${e.fromB} → ${e.toA}–${e.toB}  (match: ${e.matchStatus||'?'})${lm}`);
    });
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\nTotal: ${withEdits.length} edited prediction(s) across ${new Set(withEdits.map(p=>p.userId)).size} player(s).`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
