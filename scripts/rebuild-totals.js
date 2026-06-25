/**
 * rebuild-totals.js
 * Recomputes every user's totalPoints, exactScores, correctResults,
 * and predictionsSubmitted from raw prediction docs in Firestore.
 * Uses Admin SDK — bypasses security rules.
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT env var
 */
'use strict';
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const MATCHES = require('./matches-index.json');

async function main() {
  console.log(`[${new Date().toISOString()}] Rebuilding user totals…\n`);

  // Load all real users
  const uSnap = await db.collection('users').get();
  const users = {};
  uSnap.forEach(d => {
    if (!d.data().isAdminAccount) {
      users[d.id] = { pts: 0, exact: 0, correct: 0, played: 0 };
    }
  });
  console.log(`Users: ${Object.keys(users).length}`);

  // Sum per-match predictions
  const completedMatches = MATCHES.filter(m => m.status === 'completed');
  console.log(`Completed matches: ${completedMatches.length}`);

  for (const m of completedMatches) {
    const snap = await db.collection('predictions')
      .where('matchId', '==', m.matchId).get();
    snap.forEach(d => {
      const p = d.data();
      if (!users[p.userId]) return;
      const pts = p.pointsAwarded ?? 0;
      users[p.userId].pts    += pts;
      users[p.userId].played += 1;
      if (pts === 13) users[p.userId].exact++;
      else if (pts === 10) users[p.userId].correct++;
    });
  }

  // Batch-write updates
  const batch = db.batch();
  let count = 0;
  Object.entries(users).forEach(([uid, c]) => {
    batch.update(db.collection('users').doc(uid), {
      totalPoints:          c.pts,
      exactScores:          c.exact,
      correctResults:       c.correct,
      predictionsSubmitted: c.played,
    });
    count++;
  });
  await batch.commit();

  // Print summary
  console.log(`\nUpdated ${count} user(s):\n`);
  console.log('Nickname'.padEnd(20) + 'Points'.padStart(8) + '  🎯'.padStart(6) + '  ✅'.padStart(6) + '  MP'.padStart(6));
  console.log('─'.repeat(46));

  // Re-fetch to print final state
  const final = await db.collection('users').get();
  const rows = [];
  final.forEach(d => {
    if (!d.data().isAdminAccount) rows.push(d.data());
  });
  rows.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
  rows.forEach(u => {
    console.log(
      (u.nickname || u.id).padEnd(20) +
      String(u.totalPoints || 0).padStart(8) +
      String(u.exactScores || 0).padStart(6) +
      String(u.correctResults || 0).padStart(6) +
      String(u.predictionsSubmitted || 0).padStart(6)
    );
  });

  console.log('\n✅ Done.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
