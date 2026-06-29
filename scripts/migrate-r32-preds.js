/**
 * migrate-r32-preds.js
 * 
 * When R32 fixtures were corrected, matchId-to-team assignments changed.
 * Predictions made under the old (wrong) mapping must be remapped so they
 * stay attributed to the same match the user actually predicted for.
 *
 * Old → New matchId remapping (team follows the match, not the slot):
 *   m074 (was Germany/Paraguay)    → m075 (Germany/Paraguay now lives here)
 *   m075 (was Netherlands/Morocco) → m076
 *   m076 (was Brazil/Japan)        → m074
 *   m077 (was France/Sweden)       → m078
 *   m078 (was Ivory Coast/Norway)  → m077
 *   m081 (was USA/Bosnia)          → m082
 *   m082 (was Belgium/Senegal)     → m081
 *   m083 (was Portugal/Croatia)    → m084
 *   m084 (was Spain/Austria)       → m083
 *   m086 (was Argentina/CaboVerde) → m087
 *   m087 (was Colombia/Ghana)      → m088
 *   m088 (was Australia/Egypt)     → m086
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const REMAP = {
  m074: 'm075',
  m075: 'm076',
  m076: 'm074',
  m077: 'm078',
  m078: 'm077',
  m081: 'm082',
  m082: 'm081',
  m083: 'm084',
  m084: 'm083',
  m086: 'm087',
  m087: 'm088',
  m088: 'm086',
};
const OLD_IDS = Object.keys(REMAP);

async function main() {
  console.log('Reading all R32 predictions that need remapping…');

  // Read all predictions for affected matchIds in one pass BEFORE any writes
  const toMigrate = []; // { oldDocId, newDocId, newMatchId, data }

  for (const oldMatchId of OLD_IDS) {
    const snap = await db.collection('predictions')
      .where('matchId', '==', oldMatchId).get();
    if (snap.empty) { console.log(`  ${oldMatchId}: no predictions`); continue; }
    const newMatchId = REMAP[oldMatchId];
    snap.forEach(doc => {
      const data = doc.data();
      const newDocId = `${data.userId}_${newMatchId}`;
      toMigrate.push({ oldDocId: doc.id, oldRef: doc.ref, newDocId, newMatchId, data });
    });
    console.log(`  ${oldMatchId} → ${newMatchId}: ${snap.size} prediction(s) queued`);
  }

  if (toMigrate.length === 0) {
    console.log('No predictions to migrate.');
    process.exit(0);
  }

  console.log(`\nMigrating ${toMigrate.length} prediction(s)…`);

  // Write new docs then delete old ones in batches of 500
  const CHUNK = 200;
  for (let i = 0; i < toMigrate.length; i += CHUNK) {
    const chunk = toMigrate.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const { oldRef, newDocId, newMatchId, data } of chunk) {
      const newRef = db.collection('predictions').doc(newDocId);
      batch.set(newRef, { ...data, matchId: newMatchId });
      batch.delete(oldRef);
    }
    await batch.commit();
    console.log(`  Committed chunk ${Math.floor(i/CHUNK)+1}`);
  }

  console.log(`Done — ${toMigrate.length} predictions remapped.`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
