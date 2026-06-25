/**
 * set-user-role.js
 * Sets isAdmin: false for a user by nickname (case-insensitive).
 * Usage: node scripts/set-user-role.js "Imdad"
 */
'use strict';
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const target = (process.argv[2] || '').toLowerCase().trim();
  if (!target) { console.error('Usage: node set-user-role.js <nickname>'); process.exit(1); }

  const snap = await db.collection('users').get();
  let found = null;
  snap.forEach(d => {
    if ((d.data().nickname || '').toLowerCase().trim() === target) found = d;
  });

  if (!found) { console.error(`No user found with nickname "${process.argv[2]}"`); process.exit(1); }

  const before = found.data();
  await found.ref.update({ isAdmin: false });
  console.log(`✅ ${before.nickname}: isAdmin ${before.isAdmin} → false`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
