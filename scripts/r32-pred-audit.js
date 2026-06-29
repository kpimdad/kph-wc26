/**
 * r32-pred-audit.js — shows every R32 prediction doc currently in Firestore
 * grouped by match, so we can see if predictions landed in the right slots.
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const R32 = {
  m073:'South Africa vs Canada',  m074:'Brazil vs Japan',
  m075:'Germany vs Paraguay',     m076:'Netherlands vs Morocco',
  m077:'Ivory Coast vs Norway',   m078:'France vs Sweden',
  m079:'Mexico vs Ecuador',       m080:'England vs DR Congo',
  m081:'Belgium vs Senegal',      m082:'USA vs Bosnia',
  m083:'Spain vs Austria',        m084:'Portugal vs Croatia',
  m085:'Switzerland vs Algeria',  m086:'Australia vs Egypt',
  m087:'Argentina vs Cabo Verde', m088:'Colombia vs Ghana',
};

async function main() {
  const uSnap = await db.collection('users').get();
  const userMap = {};
  uSnap.forEach(d => { userMap[d.id] = d.data().nickname || d.id; });

  // Fetch R32 predictions in 2 whereIn queries
  const ids = Object.keys(R32);
  const snaps = await Promise.all([
    db.collection('predictions').where('matchId','in', ids.slice(0,10)).get(),
    db.collection('predictions').where('matchId','in', ids.slice(10)).get(),
  ]);

  // Group by matchId
  const byMatch = {};
  ids.forEach(id => { byMatch[id] = []; });
  snaps.forEach(snap => snap.forEach(d => {
    const p = d.data();
    if (byMatch[p.matchId]) byMatch[p.matchId].push(p);
  }));

  console.log('═══ R32 PREDICTION AUDIT ═══\n');
  for (const [mid, label] of Object.entries(R32)) {
    const preds = byMatch[mid];
    if (!preds.length) { console.log(`${mid} ${label}: (no predictions)`); continue; }
    console.log(`${mid} — ${label}`);
    preds.sort((a,b)=>(userMap[a.userId]||'').localeCompare(userMap[b.userId]||''));
    preds.forEach(p => {
      const nick = userMap[p.userId] || p.userId;
      console.log(`  ${nick.padEnd(25)} ${p.predictedA}–${p.predictedB}`);
    });
  }
  process.exit(0);
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
