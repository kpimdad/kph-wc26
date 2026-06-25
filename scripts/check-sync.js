/**
 * check-sync.js
 * Reads every completed match's predictions from Firestore and compares
 * the sum of pointsAwarded to each user's stored totalPoints.
 * Prints a report — does NOT write anything.
 *
 * Run via: node scripts/check-sync.js
 * Requires: FIREBASE_SERVICE_ACCOUNT env var
 */
'use strict';
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const MATCHES = require('./matches-index.json');

async function main() {
  console.log(`[${new Date().toISOString()}] Checking point sync…\n`);

  // Load all users
  const uSnap = await db.collection('users').get();
  const users = {};
  uSnap.forEach(d => {
    if (!d.data().isAdminAccount) users[d.id] = { ...d.data(), id: d.id };
  });
  console.log(`Users loaded: ${Object.keys(users).length}`);

  // Sum pointsAwarded per user across all completed matches
// Load completed match IDs from Firestore (matches-index.json has no status)
  const mSnap = await db.collection('matches').where('status', '==', 'completed').get();
  const completedIds = new Set();
  mSnap.forEach(d => completedIds.add(d.id));
  const completedMatches = MATCHES.filter(m => completedIds.has(m.matchId));
  console.log(`Completed matches in Firestore: ${completedMatches.length}`);
  const computed = {};   // uid → { pts, exact, correct }
  Object.keys(users).forEach(uid => { computed[uid] = { pts: 0, exact: 0, correct: 0 }; });

  for (const m of completedMatches) {
    const snap = await db.collection('predictions')
      .where('matchId', '==', m.matchId).get();
    snap.forEach(d => {
      const p = d.data();
      if (!computed[p.userId]) return;
      const pts = p.pointsAwarded ?? 0;
      computed[p.userId].pts += pts;
      if (pts === 13) computed[p.userId].exact++;
      else if (pts === 10) computed[p.userId].correct++;
    });
  }

  // Compare
  let outOfSync = 0;
  const rows = [];

  Object.entries(users).forEach(([uid, u]) => {
    const stored   = u.totalPoints || 0;
    const expected = computed[uid]?.pts ?? 0;
    const diff     = stored - expected;
    if (diff !== 0) {
      outOfSync++;
      rows.push({ nickname: u.nickname, stored, expected, diff,
        exact: computed[uid]?.exact ?? 0, correct: computed[uid]?.correct ?? 0 });
    }
  });

  if (rows.length === 0) {
    console.log('\n✅ All user totals are in sync. No issues found.');
  } else {
    console.log(`\n⚠️  ${outOfSync} user(s) out of sync:\n`);
    console.log('Nickname'.padEnd(20) + 'Stored'.padStart(8) + 'Expected'.padStart(10) + 'Diff'.padStart(8) + '  🎯Exact'.padStart(9) + '  ✅Correct'.padStart(11));
    console.log('─'.repeat(66));
    rows.sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff)).forEach(r => {
      const sign = r.diff > 0 ? '+' : '';
      console.log(
        r.nickname.padEnd(20) +
        String(r.stored).padStart(8) +
        String(r.expected).padStart(10) +
        `${sign}${r.diff}`.padStart(8) +
        String(r.exact).padStart(9) +
        String(r.correct).padStart(11)
      );
    });
  }

  // Also cross-check Yasir specifically if present
  const yasir = Object.values(users).find(u => u.nickname?.toLowerCase().includes('yasir'));
  if (yasir) {
    const c = computed[yasir.id] || {};
    console.log(`\n── Yasir detail ──`);
    console.log(`  Stored totalPoints : ${yasir.totalPoints}`);
    console.log(`  Computed from preds: ${c.pts} (🎯 ${c.exact} exact × 13 = ${c.exact*13}, ✅ ${c.correct} correct × 10 = ${c.correct*10})`);
    console.log(`  Diff               : ${(yasir.totalPoints||0) - (c.pts||0)}`);
  }

  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
