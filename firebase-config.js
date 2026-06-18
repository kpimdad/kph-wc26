// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIREBASE CONFIGURATION — KPH WC 2026
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Firebase Console → KPH project → Project Settings → Your apps → Web app

const FIREBASE_CONFIG = {
  apiKey:            "REPLACE_ME",
  authDomain:        "REPLACE_ME",
  projectId:         "REPLACE_ME",
  storageBucket:     "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId:             "REPLACE_ME"
};

// ── football-data.org API key ──────────────────────
// Used only by the GitHub Actions backend script (scripts/fetch-results.js).
// Set it as a GitHub Secret (FOOTBALL_API_KEY) — never put it here.
