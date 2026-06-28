/**
 * sync-r32.js
 * Writes confirmed R32 team names into Firestore matches collection.
 * Safe to re-run — only updates teamA/teamB, leaves status/results untouched.
 */
'use strict';
const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const R32 = {
  'm073': { teamA: 'South Africa',          teamB: 'Canada' },
  'm074': { teamA: 'Germany',               teamB: 'Paraguay' },
  'm075': { teamA: 'Netherlands',           teamB: 'Morocco' },
  'm076': { teamA: 'Brazil',               teamB: 'Japan' },
  'm077': { teamA: 'France',               teamB: 'Sweden' },
  'm078': { teamA: 'Ivory Coast',           teamB: 'Norway' },
  'm079': { teamA: 'Mexico',               teamB: 'Ecuador' },
  'm080': { teamA: 'England',              teamB: 'DR Congo' },
  'm081': { teamA: 'USA',                  teamB: 'Bosnia and Herzegovina' },
  'm082': { teamA: 'Belgium',              teamB: 'Senegal' },
  'm083': { teamA: 'Portugal',             teamB: 'Croatia' },
  'm084': { teamA: 'Spain',               teamB: 'Austria' },
  'm085': { teamA: 'Switzerland',          teamB: 'Algeria' },
  'm086': { teamA: 'Argentina',            teamB: 'Cabo Verde' },
  'm087': { teamA: 'Colombia',             teamB: 'Ghana' },
  'm088': { teamA: 'Australia',            teamB: 'Egypt' },
};

async function main() {
  console.log('Syncing R32 fixtures to Firestore…\n');
  const batch = db.batch();
  for (const [matchId, teams] of Object.entries(R32)) {
    const ref = db.collection('matches').doc(matchId);
    batch.set(ref, teams, { merge: true });
    console.log(`  ${matchId}: ${teams.teamA} v ${teams.teamB}`);
  }
  await batch.commit();
  console.log('\n✅ Done.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
