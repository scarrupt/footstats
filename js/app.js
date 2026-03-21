'use strict';

// ══════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════

const STATS = ['touches', 'forwardPasses', 'carries', 'tackles', 'midfield', 'goals'];

const POSITIONS = [
  { value: 'goalkeeper',  label: 'Goalkeeper',     short: 'GK' },
  { value: 'center-back', label: 'Center Back',    short: 'CB' },
  { value: 'full-back',   label: 'Full Back',      short: 'FB' },
  { value: 'wing-back',   label: 'Wing Back',      short: 'WB' },
  { value: 'def-mid',     label: 'Defensive Mid',  short: 'DM' },
  { value: 'midfielder',  label: 'Central Mid',    short: 'CM' },
  { value: 'att-mid',     label: 'Attacking Mid',  short: 'AM' },
  { value: 'winger',      label: 'Winger',         short: 'WG' },
  { value: 'striker',     label: 'Striker',        short: 'ST' },
];

function posLabel(value) {
  return POSITIONS.find(p => p.value === value)?.label || value;
}
function posShort(value) {
  return POSITIONS.find(p => p.value === value)?.short || value.toUpperCase();
}

const STAT_META = {
  touches:      { label: 'Total Touches',  emoji: '⚽', color: '#3b82f6' },
  forwardPasses:{ label: 'Forward Passes', emoji: '↗',  color: '#22c55e' },
  carries:      { label: 'Ball Carries',   emoji: '🏃', color: '#f97316' },
  tackles:      { label: 'Tackles',        emoji: '🛡',  color: '#f43f5e' },
  midfield:     { label: 'Into Midfield',  emoji: '⬆',  color: '#a855f7' },
  goals:        { label: 'Goals',          emoji: '🌟', color: '#fbbf24' },
};

// Per-period benchmarks for U13 center back (good = target worth 5 stars)
// Weights sum to 1.0 and favour "midfield influence" stats
const BENCHMARKS = {
  '7v7': {
    touches:       { avg: 18, good: 25 },
    forwardPasses: { avg:  5, good:  9 },
    carries:       { avg:  2, good:  4 },
    tackles:       { avg:  4, good:  6 },
    midfield:      { avg:  2, good:  4 },
  },
  '9v9': {
    touches:       { avg: 15, good: 22 },
    forwardPasses: { avg:  4, good:  7 },
    carries:       { avg:  1, good:  3 },
    tackles:       { avg:  3, good:  5 },
    midfield:      { avg:  1, good:  3 },
  },
};

const WEIGHTS = {
  touches:       0.15,
  forwardPasses: 0.25,
  carries:       0.25,
  tackles:       0.15,
  midfield:      0.20,
};

// ══════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════

const state = {
  currentMatch: null,
  currentPeriodStats: null,
  currentPosition: 'center-back',
  setup: { matchType: '7v7', numPeriods: 2, position: 'center-back' },
  detailMatchId: null,
};

// ══════════════════════════════════════════════
//  STORAGE
// ══════════════════════════════════════════════

const STORAGE_KEY = 'footstats_v1';

function loadMatches() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function persistMatches(matches) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
}

function upsertMatch(match) {
  const all = loadMatches();
  const i = all.findIndex(m => m.id === match.id);
  if (i >= 0) all[i] = match; else all.unshift(match);
  persistMatches(all);
}

function removeMatch(id) {
  persistMatches(loadMatches().filter(m => m.id !== id));
}

// ══════════════════════════════════════════════
//  DATA HELPERS
// ══════════════════════════════════════════════

function emptyStats() {
  return { touches: 0, forwardPasses: 0, carries: 0, tackles: 0, midfield: 0, goals: 0 };
}

function sumStats(match, playedOnly = false) {
  const total = emptyStats();
  for (const p of match.periods) {
    if (playedOnly && p.substituted) continue;
    for (const k of STATS) total[k] += p.stats[k];
  }
  return total;
}

function playedPeriods(match) {
  return match.periods.filter(p => !p.substituted);
}

function createMatch({ opponent, matchType, numPeriods, position }) {
  return {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    opponent,
    matchType,
    numPeriods: Number(numPeriods),
    position,
    periods: [],
    completed: false,
    rating: null,
  };
}

// ══════════════════════════════════════════════
//  RATING
// ══════════════════════════════════════════════

function calcRating(match) {
  const bm = BENCHMARKS[match.matchType];
  const played = playedPeriods(match);
  const total = sumStats(match, true); // played periods only
  const n = played.length || 1;

  let score = 0;
  const details = {};

  for (const stat of Object.keys(WEIGHTS)) {
    const perPeriod = total[stat] / n;
    const statScore = Math.min(perPeriod / bm[stat].good, 1);
    score += statScore * WEIGHTS[stat];
    details[stat] = { perPeriod, statScore, bm: bm[stat] };
  }

  const stars = Math.round(score * 5); // 1–5 whole stars

  const labels = [
    { min: 5, label: 'Outstanding!',      sub: 'Exceptional game — screenshot this for the trainer 📸' },
    { min: 4, label: 'Great Game',        sub: 'Really strong involvement and forward play.' },
    { min: 3, label: 'Good Game',         sub: 'Solid performance, keep pushing into midfield.' },
    { min: 2, label: 'Getting There',     sub: 'More forward passes and midfield runs will help.' },
    { min: 0, label: 'Quiet Game',        sub: 'Demand the ball more and step up next time.' },
  ];

  const { label, sub } = labels.find(l => stars >= l.min);
  return { stars, label, sub, details };
}

function starsHtml(stars) {
  return (
    '<span class="star-full">' + '★'.repeat(Math.max(0, stars)) + '</span>' +
    '<span class="star-empty">' + '☆'.repeat(Math.max(0, 5 - stars)) + '</span>'
  );
}

// ══════════════════════════════════════════════
//  VIEW ROUTER
// ══════════════════════════════════════════════

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
}

// ══════════════════════════════════════════════
//  CONFIRM DIALOG
// ══════════════════════════════════════════════

function confirm(message, okLabel, callback) {
  const overlay = document.getElementById('confirm-overlay');
  document.getElementById('confirm-msg').textContent = message;
  document.getElementById('confirm-yes').textContent = okLabel || 'Confirm';
  overlay.classList.remove('hidden');

  function cleanup() {
    overlay.classList.add('hidden');
    document.getElementById('confirm-yes').removeEventListener('click', onYes);
    document.getElementById('confirm-no').removeEventListener('click', onNo);
  }
  function onYes() { cleanup(); callback(true); }
  function onNo()  { cleanup(); callback(false); }

  document.getElementById('confirm-yes').addEventListener('click', onYes);
  document.getElementById('confirm-no').addEventListener('click', onNo);
}

// ══════════════════════════════════════════════
//  HOME VIEW
// ══════════════════════════════════════════════

function renderHome() {
  const matches = loadMatches().filter(m => m.completed).slice(0, 3);
  const el = document.getElementById('recent-list');

  if (matches.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">⚽</div><div class="empty-text">No matches yet.<br>Tap New Match to start!</div></div>`;
    return;
  }
  el.innerHTML = matches.map(matchCardHtml).join('');
  el.querySelectorAll('.match-card').forEach((card, i) => {
    card.addEventListener('click', () => openDetail(matches[i]));
  });
}

function matchCardHtml(m) {
  const dt = new Date(m.date);
  const d = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const t = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const stars = m.rating ? starsHtml(m.rating.stars) : '–';
  const score = m.scoreUs != null ? ` · ${m.scoreUs}–${m.scoreThem}` : '';
  return `
    <div class="match-card">
      <div class="match-card-info">
        <div class="match-card-opp">vs ${esc(m.opponent)}${score}</div>
        <div class="match-card-meta">${d} · ${t} · ${m.matchType}</div>
      </div>
      <div class="match-card-stars stars">${stars}</div>
    </div>`;
}

// ══════════════════════════════════════════════
//  SETUP VIEW
// ══════════════════════════════════════════════

function initSetup() {
  document.getElementById('input-opponent').value = '';
  document.getElementById('input-opponent').classList.remove('error');

  setSegActive('seg-match-type', state.setup.matchType);
  setSegActive('seg-periods', String(state.setup.numPeriods));
  document.getElementById('select-position').value = state.setup.position;

  showView('setup');
}

function setSegActive(groupId, value) {
  const group = document.getElementById(groupId);
  group.querySelectorAll('.seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

function handleStartMatch() {
  const oppInput = document.getElementById('input-opponent');
  const opponent = oppInput.value.trim();
  if (!opponent) {
    oppInput.classList.add('error');
    oppInput.focus();
    return;
  }
  oppInput.classList.remove('error');

  state.currentMatch = createMatch({
    opponent,
    matchType: state.setup.matchType,
    numPeriods: state.setup.numPeriods,
    position: state.setup.position,
  });
  state.currentPosition = state.setup.position;

  startPeriod();
}

// ══════════════════════════════════════════════
//  RECORDING VIEW
// ══════════════════════════════════════════════

const pressState = {}; // { [stat]: { timer, fired } }

// ══════════════════════════════════════════════
//  WAKE LOCK (keep screen on during a period)
// ══════════════════════════════════════════════

let wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (_) { /* denied or low battery — fail silently */ }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

function startPeriod() {
  state.currentPeriodStats = emptyStats();
  const num = state.currentMatch.periods.length + 1;
  const total = state.currentMatch.numPeriods;

  document.getElementById('rec-period-label').textContent = `Period ${num} / ${total}`;
  document.getElementById('rec-opponent').textContent = `vs ${state.currentMatch.opponent}`;
  document.getElementById('rec-pos-btn').textContent = posShort(state.currentPosition) + ' ▾';

  // Reset counts
  for (const stat of STATS) {
    getCountEl(stat).textContent = '0';
  }

  // Show hint only on first period
  const hint = document.querySelector('.stat-btn.touches .stat-hint');
  if (hint) hint.style.display = state.currentMatch.periods.length === 0 ? '' : 'none';

  acquireWakeLock();
  showView('recording');
}

function getCountEl(stat) {
  return document.getElementById('count-' + stat);
}

function increment(stat) {
  state.currentPeriodStats[stat]++;
  animateCount(stat);
}

function decrement(stat) {
  if (state.currentPeriodStats[stat] <= 0) return;
  state.currentPeriodStats[stat]--;
  animateCount(stat);
  // Flash the button to signal "undo"
  const btn = document.querySelector(`.stat-btn[data-stat="${stat}"]`);
  btn.classList.add('dec-flash');
  setTimeout(() => btn.classList.remove('dec-flash'), 300);
  navigator.vibrate?.([20, 10, 20]);
}

function animateCount(stat) {
  const el = getCountEl(stat);
  el.textContent = state.currentPeriodStats[stat];
  el.classList.remove('popping');
  void el.offsetWidth; // force reflow
  el.classList.add('popping');
  setTimeout(() => el.classList.remove('popping'), 200);
}

function bindStatButtons() {
  document.querySelectorAll('.stat-btn[data-stat]').forEach(btn => {
    const stat = btn.dataset.stat;
    pressState[stat] = { timer: null, fired: false };

    // ── Touch (mobile) ───────────────────────
    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      pressState[stat].fired = false;
      btn.classList.add('pressing');
      pressState[stat].timer = setTimeout(() => {
        pressState[stat].fired = true;
        btn.classList.remove('pressing');
        decrement(stat);
      }, 600);
    }, { passive: false });

    btn.addEventListener('touchend', e => {
      e.preventDefault();
      clearTimeout(pressState[stat].timer);
      btn.classList.remove('pressing');
      if (!pressState[stat].fired) increment(stat);
    }, { passive: false });

    btn.addEventListener('touchcancel', () => {
      clearTimeout(pressState[stat].timer);
      pressState[stat].fired = true; // prevent increment
      btn.classList.remove('pressing');
    });

    btn.addEventListener('touchmove', () => {
      clearTimeout(pressState[stat].timer);
      pressState[stat].fired = true; // scrolling — cancel
      btn.classList.remove('pressing');
    });

    // ── Mouse (desktop / simulator) ──────────
    btn.addEventListener('mousedown', () => {
      pressState[stat].fired = false;
      pressState[stat].timer = setTimeout(() => {
        pressState[stat].fired = true;
        decrement(stat);
      }, 600);
    });

    btn.addEventListener('mouseup', () => {
      clearTimeout(pressState[stat].timer);
      if (!pressState[stat].fired) increment(stat);
    });

    btn.addEventListener('mouseleave', () => {
      clearTimeout(pressState[stat].timer);
      pressState[stat].fired = true;
    });
  });
}

function handleSub() {
  const num = state.currentMatch.periods.length + 1;
  confirm(`Mark Period ${num} as substitute (not playing)?`, 'Not Playing', ok => {
    if (!ok) return;
    releaseWakeLock();

    state.currentMatch.periods.push({
      number: num,
      substituted: true,
      position: state.currentPosition,
      stats: emptyStats(),
    });
    showPeriodEnd();
  });
}

function handleEndPeriod() {
  const num = state.currentMatch.periods.length + 1;
  confirm(`End Period ${num}?`, 'End Period', ok => {
    if (!ok) return;
    releaseWakeLock();

    state.currentMatch.periods.push({
      number: num,
      position: state.currentPosition,
      stats: { ...state.currentPeriodStats },
    });

    showPeriodEnd();
  });
}

// ══════════════════════════════════════════════
//  PERIOD END VIEW
// ══════════════════════════════════════════════

function showPeriodEnd() {
  const match = state.currentMatch;
  upsertMatch(match); // save after every period so data survives any crash
  const lastPeriod = match.periods[match.periods.length - 1];
  const isLast = match.periods.length >= match.numPeriods;
  const bm = BENCHMARKS[match.matchType];

  document.getElementById('period-end-title').textContent =
    `Period ${lastPeriod.number} Complete`;

  const nextBtn = document.getElementById('btn-next-period');
  if (isLast) {
    nextBtn.textContent = 'See Results';
    nextBtn.onclick = showMatchEnd;
  } else {
    nextBtn.textContent = `Start Period ${lastPeriod.number + 1}`;
    nextBtn.onclick = startPeriod;
  }

  let html = statsCardHtml(`Period ${lastPeriod.number} Stats`, lastPeriod.stats, bm, lastPeriod.position, lastPeriod.substituted);

  if (match.periods.length > 1) {
    html += statsCardHtml('Match Total So Far (played periods)', sumStats(match, true), bm);
  }

  document.getElementById('period-end-content').innerHTML = html;
  showView('period-end');
}

function statsCardHtml(title, stats, bm, position, substituted) {
  if (substituted) {
    return `<div class="card"><div class="card-title">${title} <span class="sub-badge">Not Playing</span></div></div>`;
  }
  const posStr = position ? ` — ${posLabel(position)}` : '';
  const ratedStats = Object.keys(WEIGHTS);
  const rows = ratedStats.map(stat => {
    const m = STAT_META[stat];
    return `
      <div class="stat-row">
        <div class="stat-row-label">
          <span class="dot" style="background:${m.color}"></span>
          <span>${m.emoji} ${m.label}</span>
        </div>
        <span class="stat-row-value" style="color:${m.color}">${stats[stat]}</span>
      </div>`;
  }).join('');

  const goalRow = stats.goals > 0 ? `
    <div class="goal-row">
      <div class="goal-row-label">🌟 Goals</div>
      <div class="goal-row-value">${stats.goals}</div>
    </div>` : '';

  return `<div class="card"><div class="card-title">${title}${posStr}</div>${rows}${goalRow}</div>`;
}

// ══════════════════════════════════════════════
//  MATCH END VIEW
// ══════════════════════════════════════════════

function showMatchEnd() {
  const match = state.currentMatch;
  match.completed = true;
  match.rating = calcRating(match);

  const { rating } = match;
  const total = sumStats(match, true); // played periods only
  const bm = BENCHMARKS[match.matchType];
  const n = playedPeriods(match).length;
  const dt = new Date(match.date);
  const d = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const t = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  let html = `
    <div class="info-grid">
      <div class="info-cell"><div class="info-cell-label">Date</div><div class="info-cell-value">${d}</div></div>
      <div class="info-cell"><div class="info-cell-label">Time</div><div class="info-cell-value">${t}</div></div>
      <div class="info-cell"><div class="info-cell-label">Opponent</div><div class="info-cell-value">${esc(match.opponent)}</div></div>
      <div class="info-cell"><div class="info-cell-label">Format</div><div class="info-cell-value">${match.matchType}</div></div>
    </div>

    <div class="card">
      <div class="card-title">Final Score</div>
      <div class="score-row">
        <div class="score-team">
          <div class="score-team-label">Us</div>
          <input type="number" id="score-us" class="score-input" min="0" max="99" value="0" inputmode="numeric">
        </div>
        <div class="score-sep">:</div>
        <div class="score-team">
          <div class="score-team-label">${esc(match.opponent)}</div>
          <input type="number" id="score-them" class="score-input" min="0" max="99" value="0" inputmode="numeric">
        </div>
      </div>
    </div>

    <div class="rating-card">
      <div class="stars">${starsHtml(rating.stars)}</div>
      <div class="rating-label">${rating.label}</div>
      <div class="rating-sub">${rating.sub}</div>
    </div>`;

  // Benchmark bars (only rated stats, not goals)
  const barRows = Object.keys(WEIGHTS).map(stat => {
    const m = STAT_META[stat];
    const det = rating.details[stat];
    const pct = Math.round(det.statScore * 100);
    const perP = det.perPeriod.toFixed(1);
    const scoreColor = det.statScore >= 0.9 ? '#4ade80' : det.statScore >= 0.6 ? '#fbbf24' : '#f43f5e';
    return `
      <div class="benchmark">
        <div class="benchmark-header">
          <span class="benchmark-name">${m.emoji} ${m.label}</span>
          <span class="benchmark-score" style="color:${scoreColor}">${total[stat]} total · ${perP}/period</span>
        </div>
        <div class="bar-bg">
          <div class="bar-fill" style="width:${pct}%;background:${m.color}"></div>
        </div>
        <div class="benchmark-target">Target: ${bm[stat].good}/period</div>
      </div>`;
  }).join('');

  html += `<div class="card"><div class="card-title">Performance vs Targets</div>${barRows}</div>`;

  // Per-period breakdown
  for (const p of match.periods) {
    html += statsCardHtml(`Period ${p.number}`, p.stats, bm, p.position, p.substituted);
  }

  document.getElementById('match-end-content').innerHTML = html;
  showView('match-end');
}

function handleSaveMatch() {
  const us   = parseInt(document.getElementById('score-us')?.value)   || 0;
  const them = parseInt(document.getElementById('score-them')?.value) || 0;
  state.currentMatch.scoreUs   = us;
  state.currentMatch.scoreThem = them;

  upsertMatch(state.currentMatch);
  state.currentMatch = null;
  renderHome();
  showView('home');
}

// ══════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════

function exportCSV() {
  const matches = loadMatches().filter(m => m.completed);
  if (matches.length === 0) return;

  const header = [
    'Date', 'Time', 'Opponent', 'Format', 'Score',
    'Period', 'Position', 'Substituted',
    'Touches', 'Forward Passes', 'Ball Carries', 'Tackles', 'Into Midfield', 'Goals',
    'Rating (stars)', 'Rating Label',
  ].join(',');

  const rows = [];
  for (const m of matches) {
    const dt = new Date(m.date);
    const date = dt.toLocaleDateString('en-GB');
    const time = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const score = m.scoreUs != null ? `${m.scoreUs}-${m.scoreThem}` : '';
    const stars = m.rating?.stars ?? '';
    const label = m.rating?.label ?? '';
    for (const p of m.periods) {
      rows.push([
        date, time,
        `"${(m.opponent || '').replace(/"/g, '""')}"`,
        m.matchType,
        score,
        p.number,
        p.position || '',
        p.substituted ? 'yes' : 'no',
        p.stats.touches, p.stats.forwardPasses, p.stats.carries,
        p.stats.tackles, p.stats.midfield, p.stats.goals,
        stars,
        `"${label}"`,
      ].join(','));
    }
  }

  const csv = [header, ...rows].join('\n');
  const file = new File([csv], 'footstats.csv', { type: 'text/csv' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'FootStats Export' });
  } else {
    // Fallback: copy CSV text to clipboard
    navigator.clipboard.writeText(csv).then(() => {
      alert('CSV copied to clipboard — paste it into Notes or Mail.');
    });
  }
}

// ══════════════════════════════════════════════
//  HISTORY VIEW
// ══════════════════════════════════════════════

function showHistory() {
  const matches = loadMatches().filter(m => m.completed);
  const el = document.getElementById('history-content');

  if (matches.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No matches recorded yet.</div></div>`;
  } else {
    el.innerHTML = matches.map(matchCardHtml).join('');
    el.querySelectorAll('.match-card').forEach((card, i) => {
      card.addEventListener('click', () => openDetail(matches[i]));
    });
  }
  showView('history');
}

// ══════════════════════════════════════════════
//  MATCH DETAIL VIEW
// ══════════════════════════════════════════════

function openDetail(match) {
  state.detailMatchId = match.id;
  const dt = new Date(match.date);
  const d = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const t = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const bm = BENCHMARKS[match.matchType];
  const total = sumStats(match);

  document.getElementById('detail-title').textContent = `vs ${esc(match.opponent)}`;

  let html = `
    <div class="info-grid">
      <div class="info-cell"><div class="info-cell-label">Date</div><div class="info-cell-value">${d}</div></div>
      <div class="info-cell"><div class="info-cell-label">Time</div><div class="info-cell-value">${t}</div></div>
      <div class="info-cell"><div class="info-cell-label">Format</div><div class="info-cell-value">${match.matchType}</div></div>
      <div class="info-cell"><div class="info-cell-label">Periods</div><div class="info-cell-value">${match.periods.length}</div></div>
    </div>`;

  if (match.scoreUs != null) {
    html += `<div class="card" style="text-align:center">
      <div class="card-title">Final Score</div>
      ${scoreHtml(match)}
    </div>`;
  }

  if (match.rating) {
    html += `
      <div class="rating-card">
        <div class="stars">${starsHtml(match.rating.stars)}</div>
        <div class="rating-label">${match.rating.label}</div>
        <div class="rating-sub">${match.rating.sub}</div>
      </div>`;
  }

  html += statsCardHtml('Total Stats', total, bm);

  for (const p of match.periods) {
    html += statsCardHtml(`Period ${p.number}`, p.stats, bm, p.position, p.substituted);
  }

  document.getElementById('detail-content').innerHTML = html;

  document.getElementById('btn-delete-match').onclick = () => {
    confirm('Delete this match?', 'Delete', ok => {
      if (!ok) return;
      removeMatch(state.detailMatchId);
      renderHome();
      showHistory();
    });
  };

  showView('match-detail');
}

// ══════════════════════════════════════════════
//  POSITION PICKER
// ══════════════════════════════════════════════

function openPositionPicker() {
  const overlay = document.getElementById('pos-picker');
  const list = document.getElementById('pos-options');

  list.innerHTML = POSITIONS.map(p => `
    <button class="pos-option ${p.value === state.currentPosition ? 'selected' : ''}"
            data-value="${p.value}">
      <span>${p.label}</span>
      <span style="color:var(--muted);font-size:14px">${p.short}</span>
    </button>`).join('');

  overlay.classList.remove('hidden');

  list.querySelectorAll('.pos-option').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentPosition = btn.dataset.value;
      document.getElementById('rec-pos-btn').textContent = posShort(state.currentPosition) + ' ▾';
      overlay.classList.add('hidden');
    });
  });

  document.getElementById('pos-cancel').onclick = () => overlay.classList.add('hidden');
}

// ══════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════

function scoreHtml(m) {
  if (m.scoreUs == null) return '';
  const cls = m.scoreUs > m.scoreThem ? 'score-win' : m.scoreUs < m.scoreThem ? 'score-loss' : 'score-draw';
  return `<div class="score-display"><span class="${cls}">${m.scoreUs}</span> <span style="color:var(--muted);font-size:28px">:</span> <span class="${cls}">${m.scoreThem}</span></div>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════

function init() {
  // ── Segment controls ─────────────────────
  document.querySelectorAll('.seg').forEach(group => {
    group.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const val = btn.dataset.value;
        if (group.id === 'seg-match-type') state.setup.matchType = val;
        else if (group.id === 'seg-periods') state.setup.numPeriods = Number(val);
      });
    });
  });

  // ── Position select (setup) ───────────────
  document.getElementById('select-position').addEventListener('change', e => {
    state.setup.position = e.target.value;
  });

  // ── Back buttons ─────────────────────────
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => {
      const dest = btn.dataset.back;
      if (dest === 'home') { renderHome(); showView('home'); }
      else if (dest === 'history') showHistory();
    });
  });

  // ── Home ─────────────────────────────────
  document.getElementById('btn-new-match').addEventListener('click', initSetup);
  document.getElementById('btn-history').addEventListener('click', showHistory);

  // ── Setup ────────────────────────────────
  document.getElementById('btn-start-match').addEventListener('click', handleStartMatch);

  // ── Recording ────────────────────────────
  bindStatButtons();
  document.getElementById('btn-end-period').addEventListener('click', handleEndPeriod);
  document.getElementById('rec-pos-btn').addEventListener('click', openPositionPicker);
  document.getElementById('btn-sub').addEventListener('click', handleSub);

  // ── History ──────────────────────────────
  document.getElementById('btn-export').addEventListener('click', exportCSV);

  // ── Match end ────────────────────────────
  document.getElementById('btn-save-match').addEventListener('click', handleSaveMatch);

  // ── Render home ──────────────────────────
  renderHome();

  // ── Re-acquire wake lock after app comes back to foreground ──
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.getElementById('view-recording').classList.contains('active')) {
      acquireWakeLock();
    }
  });

  // ── Register service worker ──────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
