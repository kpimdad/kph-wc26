/**
 * fetch-results.js
 * Runs via GitHub Actions (server-side, no CORS).
 * Fetches finished WC 2026 matches from football-data.org,
 * scores predictions, and updates Firestore.
 *
 * Required env vars:
 *   FOOTBALL_API_KEY          — football-data.org token
 *   FIREBASE_SERVICE_ACCOUNT  — Firebase service account JSON (as a string)
 */

'use strict';
const https = require('https');
const admin = require('firebase-admin');

// ── Load MATCHES index (matchId + kickoffUTC + teams) ─────────────────────────
const MATCHES = require('./matches-index.json');
console.log('Fixtures loaded:', MATCHES.length);

// ── Firebase Admin ────────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Scoring (mirror of app.js) ────────────────────────────────────────────────
function calculatePoints(pA, pB, rA, rB) {
  if (pA === rA && pB === rB) return 13;
  const predWin = pA > pB ? 1 : pA < pB ? -1 : 0;
  const realWin = rA > rB ? 1 : rA < rB ? -1 : 0;
  return predWin === realWin ? 10 : 0;
}

// ── Fetch from football-data.org ──────────────────────────────────────────────
function fetchAPI(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.football-data.org',
      path,
      headers: { 'X-Auth-Token': process.env.FOOTBALL_API_KEY }
    };
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`API error ${res.statusCode}: ${data}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

// ── Normalise team name for fuzzy matching ────────────────────────────────────
function norm(s) { return (s || '').toLowerCase().replace(/[^a-z]/g, ''); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[${new Date().toISOString()}] Starting WC result sync…`);

  // Only fetch yesterday + today to minimise Firestore quota usage
  const dateFrom = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dateTo   = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  console.log(`Fetching finished results: ${dateFrom} – ${dateTo}`);

  let data;
  try {
    data = await fetchAPI(`/v4/competitions/WC/matches?status=FINISHED&dateFrom=${dateFrom}&dateTo=${dateTo}`);
  } catch (e) {
    console.error('API fetch failed:', e.message);
    process.exit(1);
  }

  const finished = (data.matches || []).filter(m => m.status === 'FINISHED');
  console.log(`Found ${finished.length} finished match(es) from API`);
  if (finished.length === 0) { process.exit(0); }

  // ── Match API results to our local fixtures ───────────────────────────────
  const toProcess = [];
  for (const apiMatch of finished) {
    const rA = apiMatch.score?.fullTime?.home;
    const rB = apiMatch.score?.fullTime?.away;
    if (rA == null || rB == null) continue;

    const apiTime = new Date(apiMatch.utcDate).getTime();
    const apiHome = norm(apiMatch.homeTeam?.name);
    const apiAway = norm(apiMatch.awayTeam?.name);

    let ourMatch = MATCHES.find(
      m => Math.abs(new Date(m.kickoffUTC).getTime() - apiTime) < 10 * 60 * 1000
    );
    if (!ourMatch) {
      ourMatch = MATCHES.find(m =>
        (norm(m.teamA) === apiHome && norm(m.teamB) === apiAway) ||
        (norm(m.teamA) === apiAway && norm(m.teamB) === apiHome)
      );
      if (ourMatch) console.log(`  ℹ Matched by team name: ${ourMatch.teamA} vs ${ourMatch.teamB}`);
    }
    if (!ourMatch) {
      console.log(`  ⚠ No local match: ${apiMatch.homeTeam?.name} vs ${apiMatch.awayTeam?.name} @ ${apiMatch.utcDate}`);
      continue;
    }
    toProcess.push({ ourMatch, rA, rB });
  }

  if (toProcess.length === 0) {
    console.log('No matches to process.');
    process.exit(0);
  }

  // ── Batch-read all match docs in one round-trip ───────────────────────────
  const matchRefs = toProcess.map(({ ourMatch }) => db.collection('matches').doc(ourMatch.matchId));
  const matchDocs = await db.getAll(...matchRefs);

  // ── For each match: score predictions and accumulate user deltas ──────────
  // Defer all user reads until we know every affected user ID.
  const allUserDeltas = {};   // uid → cumulative delta across all matches
  const predBatchOps  = [];   // { ref, pts } to batch-write
  const updatedMatches = [];

  for (let i = 0; i < toProcess.length; i++) {
    const { ourMatch, rA, rB } = toProcess[i];
    const current = matchDocs[i].exists ? matchDocs[i].data() : {};

    if (current.resultA === rA && current.resultB === rB && current.status === 'completed') {
      console.log(`  — Already scored: ${ourMatch.teamA} ${rA}–${rB} ${ourMatch.teamB}`);
      continue;
    }

    // Write result
    await matchRefs[i].set({ resultA: rA, resultB: rB, status: 'completed' }, { merge: true });

    // Read predictions for this match
    const predsSnap = await db.collection('predictions')
      .where('matchId', '==', ourMatch.matchId).get();

    let skipped = 0;
    predsSnap.forEach(doc => {
      const p    = doc.data();
      const pts  = calculatePoints(p.predictedA, p.predictedB, rA, rB);
      const prev = p.pointsAwarded ?? null;
      if (prev === pts) { skipped++; return; }
      predBatchOps.push({ ref: doc.ref, pts });
      const delta = pts - (prev ?? 0);
      allUserDeltas[p.userId] = (allUserDeltas[p.userId] || 0) + delta;
    });
    if (skipped > 0) console.log(`    (skipped ${skipped} already-correct predictions)`);

    updatedMatches.push({ ourMatch, rA, rB, count: predsSnap.size });
  }

  // ── Batch-write prediction scores ─────────────────────────────────────────
  if (predBatchOps.length > 0) {
    const predBatch = db.batch();
    predBatchOps.forEach(({ ref, pts }) => predBatch.update(ref, { pointsAwarded: pts }));
    await predBatch.commit();
    console.log(`  Wrote ${predBatchOps.length} prediction score(s)`);
  }

  // ── Batch-read ALL affected users in one round-trip ───────────────────────
  const affectedUids = Object.keys(allUserDeltas).filter(uid => allUserDeltas[uid] !== 0);
  if (affectedUids.length > 0) {
    const userRefs  = affectedUids.map(uid => db.collection('users').doc(uid));
    const userDocs  = await db.getAll(...userRefs);
    const userBatch = db.batch();

    userDocs.forEach((snap, idx) => {
      if (!snap.exists) return;
      const uid   = affectedUids[idx];
      const delta = allUserDeltas[uid];
      const prev  = snap.data().totalPoints || 0;
      userBatch.update(userRefs[idx], { totalPoints: prev + delta });
    });

    await userBatch.commit();
    console.log(`  Updated ${affectedUids.length} user point total(s)`);
  }

  // ── Log results ───────────────────────────────────────────────────────────
  for (const { ourMatch, rA, rB, count } of updatedMatches) {
    console.log(`  ✅ ${ourMatch.teamA} ${rA}–${rB} ${ourMatch.teamB} · ${count} prediction(s) scored`);
  }

  // ── Write last-sync timestamp ─────────────────────────────────────────────
  await db.collection('config').doc('lastSync').set({
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    matchesUpdated: updatedMatches.length
  });

  console.log(`Done. ${updatedMatches.length} match(es) updated.`);
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
