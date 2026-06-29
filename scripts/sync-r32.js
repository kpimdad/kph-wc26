/**
 * sync-r32.js
 * Writes correct R32 team names and kickoff times to Firestore match docs.
 * Run via: node scripts/sync-r32.js
 * Requires: FIREBASE_SERVICE_ACCOUNT env var
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const R32 = [
  { matchId:"m073", teamA:"South Africa", flagA:"🇿🇦", teamB:"Canada",                flagB:"🇨🇦", kickoffUTC:"2026-06-28T19:00:00Z", venue:"SoFi Stadium, Los Angeles" },
  { matchId:"m074", teamA:"Brazil",       flagA:"🇧🇷", teamB:"Japan",                 flagB:"🇯🇵", kickoffUTC:"2026-06-29T17:00:00Z", venue:"NRG Stadium, Houston" },
  { matchId:"m075", teamA:"Germany",      flagA:"🇩🇪", teamB:"Paraguay",              flagB:"🇵🇾", kickoffUTC:"2026-06-29T20:30:00Z", venue:"Gillette Stadium, Foxborough" },
  { matchId:"m076", teamA:"Netherlands",  flagA:"🇳🇱", teamB:"Morocco",               flagB:"🇲🇦", kickoffUTC:"2026-06-30T01:00:00Z", venue:"Estadio BBVA, Monterrey" },
  { matchId:"m077", teamA:"Ivory Coast",  flagA:"🇨🇮", teamB:"Norway",                flagB:"🇳🇴", kickoffUTC:"2026-06-30T17:00:00Z", venue:"AT&T Stadium, Arlington" },
  { matchId:"m078", teamA:"France",       flagA:"🇫🇷", teamB:"Sweden",                flagB:"🇸🇪", kickoffUTC:"2026-06-30T21:00:00Z", venue:"MetLife Stadium, East Rutherford" },
  { matchId:"m079", teamA:"Mexico",       flagA:"🇲🇽", teamB:"Ecuador",               flagB:"🇪🇨", kickoffUTC:"2026-07-01T01:00:00Z", venue:"Estadio Azteca, Mexico City" },
  { matchId:"m080", teamA:"England",      flagA:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", teamB:"DR Congo",              flagB:"🇨🇩", kickoffUTC:"2026-07-01T16:00:00Z", venue:"Mercedes-Benz Stadium, Atlanta" },
  { matchId:"m081", teamA:"Belgium",      flagA:"🇧🇪", teamB:"Senegal",               flagB:"🇸🇳", kickoffUTC:"2026-07-01T20:00:00Z", venue:"Lumen Field, Seattle" },
  { matchId:"m082", teamA:"USA",          flagA:"🇺🇸", teamB:"Bosnia and Herzegovina",flagB:"🇧🇦", kickoffUTC:"2026-07-02T00:00:00Z", venue:"Levi's Stadium, Santa Clara" },
  { matchId:"m083", teamA:"Spain",        flagA:"🇪🇸", teamB:"Austria",               flagB:"🇦🇹", kickoffUTC:"2026-07-02T19:00:00Z", venue:"SoFi Stadium, Los Angeles" },
  { matchId:"m084", teamA:"Portugal",     flagA:"🇵🇹", teamB:"Croatia",               flagB:"🇭🇷", kickoffUTC:"2026-07-02T23:00:00Z", venue:"BMO Field, Toronto" },
  { matchId:"m085", teamA:"Switzerland",  flagA:"🇨🇭", teamB:"Algeria",               flagB:"🇩🇿", kickoffUTC:"2026-07-03T03:00:00Z", venue:"BC Place, Vancouver" },
  { matchId:"m086", teamA:"Australia",    flagA:"🇦🇺", teamB:"Egypt",                 flagB:"🇪🇬", kickoffUTC:"2026-07-03T18:00:00Z", venue:"AT&T Stadium, Arlington" },
  { matchId:"m087", teamA:"Argentina",    flagA:"🇦🇷", teamB:"Cabo Verde",            flagB:"🇨🇻", kickoffUTC:"2026-07-03T22:00:00Z", venue:"Hard Rock Stadium, Miami" },
  { matchId:"m088", teamA:"Colombia",     flagA:"🇨🇴", teamB:"Ghana",                 flagB:"🇬🇭", kickoffUTC:"2026-07-04T01:30:00Z", venue:"Arrowhead Stadium, Kansas City" },
];

async function main() {
  const batch = db.batch();
  for (const m of R32) {
    const ref = db.collection('matches').doc(m.matchId);
    batch.set(ref, {
      teamA: m.teamA, flagA: m.flagA,
      teamB: m.teamB, flagB: m.flagB,
      kickoffUTC: m.kickoffUTC,
      venue: m.venue,
    }, { merge: true });
    console.log(`  ${m.matchId}: ${m.teamA} vs ${m.teamB}  ${m.kickoffUTC}`);
  }
  await batch.commit();
  console.log('Done — 16 R32 docs updated in Firestore');
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
