/**
 * backup-match-preds.js
 * Runs every 10 minutes via GitHub Actions cron.
 * For each match that locked in the past 10 minutes (and hasn't been backed up yet),
 * fetches all user predictions, formats them, and emails a CSV + summary to the admin.
 *
 * Secrets required:
 *   FIREBASE_SERVICE_ACCOUNT  — Firebase service account JSON
 *   GMAIL_USER                — Gmail address to send from (e.g. imdadkp@gmail.com)
 *   GMAIL_APP_PASSWORD        — Gmail App Password (16-char, from Google Account → Security)
 */
'use strict';
const admin  = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const ADMIN_EMAIL = process.env.GMAIL_USER || 'imdadkp@gmail.com';
const WINDOW_MS   = 12 * 60 * 1000; // 12-min window (handles slight cron drift)

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtUTC(iso) {
  return iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—';
}

function buildCSV(matchInfo, preds, userMap) {
  const header = [
    'Nickname', 'PredictedA', 'PredictedB', 'PenaltyPick',
    'SubmittedAt', 'LastEditAt', 'EditCount', 'LastMinute', 'EditHistory'
  ].join(',');

  const rows = preds.map(p => {
    const nick = userMap[p.userId] || p.userId;
    const edits = (p.editHistory || []);
    const history = edits.map(e =>
      `${fmtUTC(e.changedAt)}: ${e.fromA}-${e.fromB} → ${e.toA}-${e.toB}`
    ).join(' | ');
    return [
      `"${nick}"`,
      p.predictedA ?? '',
      p.predictedB ?? '',
      p.penaltyPick || '',
      fmtUTC(p.submittedAt?.toDate?.()?.toISOString() || p.submittedAt),
      fmtUTC(p.updatedAt?.toDate?.()?.toISOString()   || p.updatedAt),
      edits.length,
      p.lastMinute ? 'yes' : 'no',
      `"${history}"`,
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

function buildHTML(matchInfo, preds, userMap) {
  const rows = preds.map(p => {
    const nick  = userMap[p.userId] || p.userId;
    const edits = (p.editHistory || []);
    const histHTML = edits.length
      ? '<ul>' + edits.map(e =>
          `<li>${fmtUTC(e.changedAt)}: <b>${e.fromA}–${e.fromB}</b> → <b>${e.toA}–${e.toB}</b></li>`
        ).join('') + '</ul>'
      : '<em>No edits</em>';
    return `<tr>
      <td>${nick}</td>
      <td><b>${p.predictedA ?? '?'}–${p.predictedB ?? '?'}</b>${p.penaltyPick ? ` 🏆${p.penaltyPick==='teamA'?matchInfo.teamA:matchInfo.teamB}` : ''}</td>
      <td>${p.lastMinute ? '🔥 Yes' : 'No'}</td>
      <td>${fmtUTC(p.updatedAt?.toDate?.()?.toISOString() || p.updatedAt)}</td>
      <td>${histHTML}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><body style="font-family:sans-serif">
<h2>🔒 Match Locked: ${matchInfo.teamA} vs ${matchInfo.teamB}</h2>
<p><b>${matchInfo.matchDay}</b> · ${matchInfo.venue}<br>Kickoff: ${fmtUTC(matchInfo.kickoffUTC)}</p>
<p>${preds.length} prediction(s) locked in.</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
  <thead style="background:#f0f0f0">
    <tr><th>Player</th><th>Pick</th><th>Last-Minute?</th><th>Last Edit</th><th>Edit History</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const now = Date.now();
  console.log(`[${new Date(now).toISOString()}] Checking for just-locked matches…`);

  // Find matches where kickoffUTC is within the past WINDOW_MS and backupSent !== true
  const windowStart = new Date(now - WINDOW_MS).toISOString();
  const windowEnd   = new Date(now).toISOString();

  const matchSnap = await db.collection('matches')
    .where('kickoffUTC', '>=', windowStart)
    .where('kickoffUTC', '<=', windowEnd)
    .get();

  if (matchSnap.empty) { console.log('No matches locked in this window.'); process.exit(0); }

  // Filter out already-backed-up matches
  const toBackup = [];
  matchSnap.forEach(d => {
    const m = d.data();
    if (!m.backupSent) toBackup.push({ id: d.id, ...m });
  });

  if (toBackup.length === 0) { console.log('All matches in window already backed up.'); process.exit(0); }
  console.log(`${toBackup.length} match(es) to back up.`);

  // Load all users (for nickname mapping)
  const userSnap = await db.collection('users').get();
  const userMap  = {};
  userSnap.forEach(d => { userMap[d.id] = d.data().nickname || d.id; });

  // Set up mailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  for (const match of toBackup) {
    console.log(`\nBacking up: ${match.teamA} vs ${match.teamB} (${match.matchId})`);

    // Fetch predictions for this match only
    const predSnap = await db.collection('predictions')
      .where('matchId', '==', match.matchId).get();

    const preds = [];
    predSnap.forEach(d => preds.push(d.data()));
    preds.sort((a, b) => (userMap[a.userId] || '').localeCompare(userMap[b.userId] || ''));

    console.log(`  ${preds.length} prediction(s) found`);

    const csvContent  = buildCSV(match, preds, userMap);
    const htmlContent = buildHTML(match, preds, userMap);
    const filename    = `predictions_${match.matchId}_${match.teamA.replace(/\s/g,'')}_vs_${match.teamB.replace(/\s/g,'')}.csv`;

    await transporter.sendMail({
      from:    `"KPH WC26 Backup" <${process.env.GMAIL_USER}>`,
      to:      ADMIN_EMAIL,
      subject: `🔒 Locked: ${match.teamA} vs ${match.teamB} — ${preds.length} picks`,
      html:    htmlContent,
      attachments: [{ filename, content: csvContent }],
    });
    console.log(`  Email sent to ${ADMIN_EMAIL}`);

    // Mark as backed up in Firestore
    await db.collection('matches').doc(match.matchId).update({ backupSent: true });
    console.log(`  backupSent = true written to Firestore`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
