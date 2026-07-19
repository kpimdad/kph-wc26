/**
 * score-bracket-picks.js
 * One-time script (GitHub Actions) to award bracket pick points.
 *
 * Point values (as shown in the app UI):
 *   🏆 Champion correct:   +50 pts  → Spain
 *   🥈 Finalist correct:   +25 pts  → Argentina
 *   ⚽ Golden Boot correct: +40 pts  → Kylian Mbappé
 *   🌟 POT correct:        +35 pts  → Rodri
 *
 * Guard field `bracketPicksScored: true` prevents double-apply.
 *
 * Required env vars:
 *   FIREBASE_SERVICE_ACCOUNT — Firebase service account JSON (as a string)
 */

'use strict';
const admin = require('firebase-admin');

// ── Results ───────────────────────────────────────────────
const CHAMPION    = 'Spain';
const FINALIST    = 'Argentina';
const GOLDEN_BOOT = 'mbappe';   // normalised — matches "Mbappé", "Mbappe", "Kylian Mbappe" etc.
const POT         = 'rodri';    // normalised — matches "Rodri", "Rodrigo Hernandez" etc.

const PTS_CHAMPION    = 50;
const PTS_FINALIST    = 25;
const PTS_GOLDEN_BOOT = 40;
const PTS_POT         = 35;

const GUARD_FIELD = 'bracketPicksScored';

// Normalise a string for fuzzy matching (lowercase, strip accents + non-alpha)
function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip diacritics
    .replace(/[^a-z0-9]/g, '');
}

function matchesPick(userPick, target) {
  const u = norm(userPick);
  const t = norm(target);
  return u.includes(t) || t.includes(u);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  console.log(`[${new Date().toISOString()}] Scoring bracket picks…`);
  console.log(`Champion: ${CHAMPION} (+${PTS_CHAMPION}) | Finalist: ${FINALIST} (+${PTS_FINALIST})`);
  console.log(`Golden Boot: ${GOLDEN_BOOT} (+${PTS_GOLDEN_BOOT}) | POT: ${POT} (+${PTS_POT})`);

  const usersSnap = await db.collection('users').get();
  const batch = db.batch();
  let awarded = 0, skipped = 0;

  usersSnap.forEach(doc => {
    const data = doc.data();

    if (data[GUARD_FIELD]) { skipped++; return; }

    let pts = 0;
    const breakdown = [];

    if (data.championPick === CHAMPION) {
      pts += PTS_CHAMPION;
      breakdown.push(`🏆 Champion +${PTS_CHAMPION}`);
    }
    if (data.finalistPick === FINALIST) {
      pts += PTS_FINALIST;
      breakdown.push(`🥈 Finalist +${PTS_FINALIST}`);
    }
    if (data.goldenBootPick && matchesPick(data.goldenBootPick, GOLDEN_BOOT)) {
      pts += PTS_GOLDEN_BOOT;
      breakdown.push(`⚽ Golden Boot +${PTS_GOLDEN_BOOT}`);
    }
    if (data.potPick && matchesPick(data.potPick, POT)) {
      pts += PTS_POT;
      breakdown.push(`🌟 POT +${PTS_POT}`);
    }

    console.log(`  ${data.displayName || data.nickname || doc.id}: [${breakdown.join(', ') || 'none'}] → +${pts} pts`);
    console.log(`    champion="${data.championPick}" finalist="${data.finalistPick}" boot="${data.goldenBootPick}" pot="${data.potPick}"`);

    batch.update(doc.ref, {
      totalPoints:      (data.totalPoints || 0) + pts,
      bracketPickPts:   pts,
      [GUARD_FIELD]:    true,
    });
    awarded++;
  });

  if (awarded === 0) {
    console.log('Nothing to award.');
    process.exit(0);
  }

  await batch.commit();
  console.log(`\nDone. Processed ${awarded} user(s), skipped ${skipped} already-scored.`);
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
