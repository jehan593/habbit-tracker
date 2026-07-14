// ─── STATE ─────────────────────────────────────────────────────────────────
let habits = [];
let logs = {};   // { "YYYY-MM-DD": { habitId: "yes"|"no"|null } }
let deletedHabitIds = [];  // Track deleted habits to prevent re-adding during merge
let selectedType = 'good';
let currentDate = todayStr();
let progressPeriod = 7;
let completionChart = null;
let sparklineCharts = {}; // habitId -> Chart instance, for per-habit trend sparklines

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadData() {
  try {
    const h = localStorage.getItem('ht_habits');
    const l = localStorage.getItem('ht_logs');
    const d = localStorage.getItem('ht_deleted_habit_ids');
    if (h) habits = JSON.parse(h);
    if (l) logs = JSON.parse(l);
    if (d) deletedHabitIds = JSON.parse(d);
  } catch(e) {}
}

function saveData() {
  localStorage.setItem('ht_habits', JSON.stringify(habits));
  localStorage.setItem('ht_logs', JSON.stringify(logs));
  localStorage.setItem('ht_deleted_habit_ids', JSON.stringify(deletedHabitIds));
}

// ─── DATE UTILS ─────────────────────────────────────────────────────────────
function formatDisplayDate(str) {
  const d = new Date(str + 'T00:00:00');
  const today = todayStr();
  const yesterday = offsetDate(today, -1);
  if (str === today) return 'Today';
  if (str === yesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
}

function offsetDate(str, days) {
  const d = new Date(str + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRange(endStr, days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) dates.push(offsetDate(endStr, -i));
  return dates;
}

// ─── TABS ───────────────────────────────────────────────────────────────────
function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('section-' + name).classList.add('active');
  if (name === 'progress') renderProgress();
  if (name === 'habits') renderManageHabits();
  if (name === 'today') renderToday();
}

// ─── TODAY ──────────────────────────────────────────────────────────────────
function renderToday() {
  document.getElementById('today-title').textContent = formatDisplayDate(currentDate);
  const d = new Date(currentDate + 'T00:00:00');
  document.getElementById('today-subtitle').textContent =
    d.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  const picker = document.getElementById('date-picker');
  picker.max = todayStr();
  picker.value = currentDate;

  renderStats();
  renderHabitList();
}

function renderStats() {
  const dayLog = logs[currentDate] || {};
  // Only include habits that were created on or before the current date
  const visibleHabits = habits.filter(h => !h.createdAt || h.createdAt <= currentDate);
  const total = visibleHabits.length;
  const goodHabits = visibleHabits.filter(h => h.type === 'good');
  const badHabits = visibleHabits.filter(h => h.type === 'bad');

  let goodDone = 0, badDone = 0, logged = 0;
  visibleHabits.forEach(h => {
    const v = dayLog[h.id];
    if (v === 'yes') { logged++; if (h.type === 'good') goodDone++; }
    if (v === 'no') { logged++; if (h.type === 'bad') badDone++; }
  });

  const pct = total ? Math.round((logged / total) * 100) : 0;
  const bestStreak = getBestCurrentStreak(currentDate);
  const bestStreakLabel = bestStreak >= 3 ? `🔥 ${bestStreak}` : `${bestStreak}`;

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card">
      <div class="stat-val">${bestStreakLabel}</div>
      <div class="stat-label">Best streak</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${pct}%</div>
      <div class="stat-label">Logged today</div>
    </div>
    <div class="stat-card good">
      <div class="stat-val">${goodDone}/${goodHabits.length}</div>
      <div class="stat-label">Good habits done</div>
    </div>
    <div class="stat-card bad">
      <div class="stat-val">${badDone}/${badHabits.length}</div>
      <div class="stat-label">Bad habits done</div>
    </div>
  `;
}

// Highest current streak (as of `asOfDate`) among habits visible on that date.
function getBestCurrentStreak(asOfDate) {
  let best = 0;
  habits.filter(h => !h.createdAt || h.createdAt <= asOfDate).forEach(h => {
    const s = getStreak(h.id, asOfDate);
    if (s > best) best = s;
  });
  return best;
}

function renderHabitList() {
  const wrap = document.getElementById('today-habits-wrap');
  const dayLog = logs[currentDate] || {};
  // Filter habits that were created on or before the current date
  const visibleHabits = habits.filter(h => !h.createdAt || h.createdAt <= currentDate);
  const goodH = visibleHabits.filter(h => h.type === 'good');
  const badH = visibleHabits.filter(h => h.type === 'bad');

  if (!visibleHabits.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">🌱</div><p>No habits yet</p><small>Go to Manage Habits to add your first habit</small></div>`;
    return;
  }

  let html = '';

  if (goodH.length) {
    html += `<div class="habit-section-title">Good habits</div>`;
    goodH.forEach(h => html += habitItemHTML(h, dayLog[h.id] || null));
  }
  if (badH.length) {
    html += `<div class="habit-section-title">Bad habits to avoid</div>`;
    badH.forEach(h => html += habitItemHTML(h, dayLog[h.id] || null));
  }

  wrap.innerHTML = html;
}

function habitItemHTML(h, val) {
  const streak = getStreak(h.id, currentDate);
  const streakHTML = streak >= 3
    ? `<span class="habit-streak fire">🔥 ${streak}</span>`
    : streak > 0 ? `<span class="habit-streak">${streak} day streak</span>` : '';

  const statusClass = val === 'yes' ? 'done-yes' : val === 'no' ? 'done-no' : '';

  const yesLabel = h.type === 'good' ? '✓' : '✓';
  const noLabel = h.type === 'good' ? '✗' : '✗';
  const yesTitle = h.type === 'good' ? 'Done' : 'Avoided';
  const noTitle = h.type === 'good' ? 'Missed' : 'Gave in';

  return `
    <div class="habit-item ${statusClass}" id="hi-${h.id}">
      <div class="habit-type-dot ${h.type}"></div>
      <div class="habit-info">
        <div class="name">${escHtml(h.name)}</div>
        ${h.desc ? `<div class="meta">${escHtml(h.desc)}</div>` : ''}
      </div>
      ${streakHTML}
      <div class="habit-actions">
        <button class="check-btn yes ${val === 'yes' ? 'active' : ''}" title="${yesTitle}"
          onclick="logHabit('${h.id}', 'yes')">${yesLabel}</button>
        <button class="check-btn no ${val === 'no' ? 'active' : ''}" title="${noTitle}"
          onclick="logHabit('${h.id}', 'no')">${noLabel}</button>
      </div>
    </div>`;
}

function logHabit(id, val) {
  if (!logs[currentDate]) logs[currentDate] = {};
  const current = logs[currentDate][id];
  logs[currentDate][id] = current === val ? null : val;
  saveData();
  renderToday();
  showToast(val === 'yes' ? '✓ Logged!' : '✗ Logged!');
}

function getStreak(habitId, fromDate) {
  let streak = 0;
  let check = fromDate;
  for (let i = 0; i < 365; i++) {
    const v = (logs[check] || {})[habitId];
    if (v === 'yes') { streak++; check = offsetDate(check, -1); }
    else break;
  }
  return streak;
}

function changeDay(n) {
  const next = offsetDate(currentDate, n);
  if (next > todayStr()) return;
  currentDate = next;
  renderToday();
}

function goToday() {
  currentDate = todayStr();
  renderToday();
}

function onDateChange() {
  const val = document.getElementById('date-picker').value;
  if (val > todayStr()) return;
  currentDate = val;
  renderToday();
}

// ─── MANAGE HABITS ──────────────────────────────────────────────────────────
function renderManageHabits() {
  const list = document.getElementById('manage-habits-list');
  if (!habits.length) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">📋</div><p>No habits yet</p><small>Click "Add Habit" to get started</small></div>`;
    return;
  }
  list.innerHTML = habits.map(h => `
    <div class="manage-habit-item">
      <span class="habit-badge ${h.type}">${h.type}</span>
      <div class="manage-habit-info">
        <div class="name">${escHtml(h.name)}</div>
        ${h.desc ? `<div class="desc">${escHtml(h.desc)}</div>` : ''}
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteHabit('${h.id}')">Delete</button>
    </div>
  `).join('');
}

function deleteHabit(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;
  document.getElementById('confirm-habit-name').textContent = habit.name;
  document.getElementById('confirm-modal-backdrop').classList.add('open');
  const btn = document.getElementById('confirm-delete-btn');
  btn.onclick = () => {
    habits = habits.filter(h => h.id !== id);
    for (const date in logs) delete logs[date][id];
    // Track this deletion so it persists across syncs
    if (!deletedHabitIds.includes(id)) {
      deletedHabitIds.push(id);
    }
    saveData();
    renderManageHabits();
    closeConfirmModal();
    showToast('Habit deleted');
  };
}

function closeConfirmModal(e) {
  if (!e || e.target.id === 'confirm-modal-backdrop')
    document.getElementById('confirm-modal-backdrop').classList.remove('open');
}

// ─── ADD HABIT MODAL ─────────────────────────────────────────────────────────
function openAddModal() {
  document.getElementById('habit-name').value = '';
  document.getElementById('habit-desc').value = '';
  selectType('good');
  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => document.getElementById('habit-name').focus(), 100);
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('open');
}

function closeModal(e) {
  if (e.target.id === 'add-modal') closeAddModal();
}

function selectType(t) {
  selectedType = t;
  document.getElementById('type-good').classList.toggle('active', t === 'good');
  document.getElementById('type-bad').classList.toggle('active', t === 'bad');
}

function saveHabit() {
  const name = document.getElementById('habit-name').value.trim();
  if (!name) { showToast('Please enter a name'); return; }
  habits.push({
    id: 'h' + Date.now(),
    name,
    desc: document.getElementById('habit-desc').value.trim(),
    type: selectedType,
    createdAt: todayStr()
  });
  saveData();
  closeAddModal();
  renderManageHabits();
  renderToday();
  showToast('Habit added!');
}

// ─── PROGRESS ───────────────────────────────────────────────────────────────
function setPeriod(days, el) {
  progressPeriod = days;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderProgress();
}

function renderProgress() {
  renderDigest();
  renderHeatmap();
  renderCompletionChart();
  renderPerHabitLines();
}

// Weekly summary above the charts, as a row of colored stat chips.
function renderDigest() {
  const el = document.getElementById('progress-digest');
  if (!el) return;
  if (!habits.length) { el.innerHTML = ''; return; }

  const days = getDateRange(todayStr(), 7);
  const goodAvgPct = avg(days.map(d => getCompletionForDateByType(d, 'good')));
  const badAvgPct  = avg(days.map(d => getCompletionForDateByType(d, 'bad')));

  let best = null;
  habits.forEach(h => {
    const s = getStreak(h.id, todayStr());
    if (s > 0 && (!best || s > best.streak)) best = { name: h.name, streak: s };
  });

  const chips = [];
  if (goodAvgPct !== null) chips.push('<span class="digest-chip good">✓ ' + goodAvgPct + '% good done</span>');
  if (badAvgPct !== null) chips.push('<span class="digest-chip bad">⚠ ' + badAvgPct + '% bad avoided</span>');
  if (best) chips.push('<span class="digest-chip streak">🔥 ' + escHtml(best.name) + ' — ' + best.streak + 'd</span>');

  if (!chips.length) {
    el.innerHTML = '<span class="digest-empty">No habits logged yet this week</span>';
    return;
  }
  el.innerHTML = '<span class="digest-label">This week</span>' + chips.join('');
}

function goToDateFromHeatmap(dateStr) {
  currentDate = dateStr;
  const tabBtn = document.getElementById('tab-today');
  if (tabBtn) switchTab('today', tabBtn);
}

// ─── HEATMAP ────────────────────────────────────────────────────────────────
// Success rate among habits actually LOGGED that day (good done, or bad
// avoided) — habits that were never logged are excluded from the ratio, not
// counted as failures. Returns null when nothing was logged at all that day
// (or no habits existed yet), which renders as neutral, not red.
function getDayScore(dateStr) {
  const dayLog = logs[dateStr] || {};
  const visible = habits.filter(h => !h.createdAt || h.createdAt <= dateStr);
  if (!visible.length) return null;
  let success = 0, loggedCount = 0;
  visible.forEach(h => {
    const v = dayLog[h.id];
    if (v !== 'yes' && v !== 'no') return; // not logged — excluded, not a failure
    loggedCount++;
    if (h.type === 'good' && v === 'yes') success++;
    if (h.type === 'bad' && v === 'yes') success++; // avoided
  });
  if (!loggedCount) return null;
  return success / loggedCount;
}

// Maps a 0..1 score to a diverging color class: 'good1'..'good4' (greener as
// it approaches 1), 'bad1'..'bad4' (redder as it approaches 0), or '' for a
// neutral/tied day (score exactly 0.5, or no entries at all).
function heatmapLevel(score) {
  if (score === null || score === 0.5) return '';
  if (score > 0.5) {
    const t = (score - 0.5) / 0.5;
    return 'good' + (t <= 0.25 ? 1 : t <= 0.5 ? 2 : t <= 0.75 ? 3 : 4);
  }
  const t = (0.5 - score) / 0.5;
  return 'bad' + (t <= 0.25 ? 1 : t <= 0.5 ? 2 : t <= 0.75 ? 3 : 4);
}

function renderHeatmap() {
  const wrap = document.getElementById('heatmap-wrap');
  if (!wrap) return;
  if (!habits.length) {
    wrap.innerHTML = '<div style="color:var(--text3);font-size:14px;padding:8px 0;">No habits yet.</div>';
    return;
  }

  const WEEKS = 52;
  const days = getDateRange(todayStr(), WEEKS * 7); // chronological, ends today
  const firstWeekday = new Date(days[0] + 'T00:00:00').getDay(); // 0=Sun
  const lastWeekday = new Date(days[days.length - 1] + 'T00:00:00').getDay();

  // Pad to whole Sun–Sat weeks so cells stack into 7-row columns cleanly.
  const padded = [
    ...Array(firstWeekday).fill(null),
    ...days,
    ...Array(6 - lastWeekday).fill(null)
  ];

  const columns = [];
  for (let i = 0; i < padded.length; i += 7) columns.push(padded.slice(i, i + 7));

  let lastMonth = null;
  const monthLabelsHTML = columns.map(col => {
    const firstDate = col.find(d => d !== null);
    let label = '';
    if (firstDate) {
      const month = firstDate.slice(0, 7); // YYYY-MM
      if (month !== lastMonth) {
        label = new Date(firstDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short' });
        lastMonth = month;
      }
    }
    return `<span class="heatmap-month-label">${label}</span>`;
  }).join('');

  const cellsHTML = columns.map(col => {
    const cellsInCol = col.map(d => {
      if (!d) return '<div class="heatmap-cell" style="visibility:hidden;"></div>';
      const score = getDayScore(d);
      const levelCls = heatmapLevel(score);
      const levelClass = levelCls ? ' ' + levelCls : '';
      const pctLabel = score === null ? 'No entries' : Math.round(score * 100) + '% success';
      const dateLabel = new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return `<div class="heatmap-cell clickable${levelClass}" title="${dateLabel} — ${pctLabel}" onclick="goToDateFromHeatmap('${d}')"></div>`;
    }).join('');
    return `<div class="heatmap-col">${cellsInCol}</div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="heatmap-month-labels">${monthLabelsHTML}</div>
    <div class="heatmap">${cellsHTML}</div>
  `;
}

function getCompletionForDate(dateStr) {
  const dayLog = logs[dateStr] || {};
  // Only include habits that were created on or before this date
  const relevantHabits = habits.filter(h => !h.createdAt || h.createdAt <= dateStr);
  const total = relevantHabits.length;
  if (!total) return 0;
  const logged = relevantHabits.filter(h => dayLog[h.id] === 'yes' || dayLog[h.id] === 'no').length;
  return Math.round((logged / total) * 100);
}

function getCompletionForDateByType(dateStr, type) {
  const dayLog = logs[dateStr] || {};
  // Only include habits that were created on or before this date
  const group = habits.filter(h => h.type === type && (!h.createdAt || h.createdAt <= dateStr));
  if (!group.length) return null;
  const logged = group.filter(h => dayLog[h.id] === 'yes' || dayLog[h.id] === 'no').length;
  if (!logged) return null; // nothing marked — skip this day entirely
  if (type === 'good') {
    // only count marked habits; unmarked ones are ignored
    const done = group.filter(h => dayLog[h.id] === 'yes').length;
    return Math.round((done / logged) * 100);
  } else {
    // bad: 'no' = gave in, 'yes' = avoided
    const gaveIn = group.filter(h => dayLog[h.id] === 'no').length;
    return Math.round((gaveIn / logged) * 100);
  }
}

function avg(arr) {
  const vals = arr.filter(v => v !== null);
  return vals.length ? Math.round(vals.reduce((a,b) => a+b, 0) / vals.length) : null;
}

function renderCompletionChart() {
  const dates = getDateRange(todayStr(), progressPeriod);
  const labels = dates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString(undefined, { month:'short', day:'numeric' });
  });
  const goodData = dates.map(d => getCompletionForDateByType(d, 'good'));
  const badData  = dates.map(d => getCompletionForDateByType(d, 'bad'));
  const goodAvg  = avg(goodData);
  const badAvg   = avg(badData);
  const pr = progressPeriod <= 30 ? 4 : 2;

  // Update summary stats above chart
  const goodHabits = habits.filter(h => h.type === 'good');
  const badHabits  = habits.filter(h => h.type === 'bad');
  const titleEl = document.getElementById('dual-chart-title');
  if (titleEl) {
    let summary = '';
    if (goodAvg !== null) summary += `<span style="color:#3ecf8e;font-weight:600;">${goodAvg}% avg good</span>`;
    if (goodAvg !== null && badAvg !== null) summary += ' &nbsp;·&nbsp; ';
    if (badAvg !== null) summary += `<span style="color:#f56565;font-weight:600;">${badAvg}% avg bad gave in</span>`;
    titleEl.innerHTML = 'Completion rate &nbsp;<span style="font-size:12px;color:var(--text3);font-weight:400;">' + summary + '</span>';
  }

  const ctx = document.getElementById('completion-chart').getContext('2d');
  if (completionChart) completionChart.destroy();

  const datasets = [];
  if (goodHabits.length) {
    datasets.push({
      label: 'Good habits done',
      data: goodData,
      borderColor: '#3ecf8e',
      backgroundColor: 'rgba(62,207,142,0.07)',
      borderWidth: 2.5, fill: true, tension: 0.4,
      pointBackgroundColor: '#3ecf8e',
      pointBorderColor: '#0e0f11',
      pointBorderWidth: 1.5,
      pointRadius: pr, pointHoverRadius: 7,
      spanGaps: true
    });
    if (goodAvg !== null) datasets.push({
      label: 'Avg good',
      data: dates.map(() => goodAvg),
      borderColor: 'rgba(62,207,142,0.35)',
      borderWidth: 1.5,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false,
      tension: 0,
      spanGaps: true
    });
  }
  if (badHabits.length) {
    datasets.push({
      label: 'Bad habits — gave in',
      data: badData,
      borderColor: '#f56565',
      backgroundColor: 'rgba(245,101,101,0.05)',
      borderWidth: 2.5, fill: true, tension: 0.4,
      pointBackgroundColor: '#f56565',
      pointBorderColor: '#0e0f11',
      pointBorderWidth: 1.5,
      pointRadius: pr, pointHoverRadius: 7,
      spanGaps: true
    });
    if (badAvg !== null) datasets.push({
      label: 'Avg bad',
      data: dates.map(() => badAvg),
      borderColor: 'rgba(245,101,101,0.35)',
      borderWidth: 1.5,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false,
      tension: 0,
      spanGaps: true
    });
  }

  completionChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color: '#9b9791', font: { size: 12 }, boxWidth: 10, boxHeight: 10,
            filter: item => !item.text.startsWith('Avg')
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label.startsWith('Avg')) return null;
              const v = ctx.parsed.y;
              const isGood = ctx.dataset.label.includes('Good');
              const isBad  = ctx.dataset.label.includes('Bad');
              const dateStr = dates[ctx.dataIndex];
              const dayLog = logs[dateStr] || {};
              let note = '';
              if (isGood) {
                const g = habits.filter(h => h.type === 'good');
                const loggedG = g.filter(h => dayLog[h.id] === 'yes' || dayLog[h.id] === 'no').length;
                const doneG   = g.filter(h => dayLog[h.id] === 'yes').length;
                note = loggedG ? ` (${doneG}/${loggedG} logged)` : '';
              } else if (isBad) {
                const b = habits.filter(h => h.type === 'bad');
                const loggedB  = b.filter(h => dayLog[h.id] === 'yes' || dayLog[h.id] === 'no').length;
                const gaveInB  = b.filter(h => dayLog[h.id] === 'no').length;
                const avoidedB = b.filter(h => dayLog[h.id] === 'yes').length;
                note = loggedB ? ` (${gaveInB} gave in, ${avoidedB} avoided / ${loggedB} logged)` : '';
              }
              return ' ' + ctx.dataset.label + ': ' + (v !== null ? v + '%' + note : '—');
            },
            afterBody: (items) => {
              const dateStr = dates[items[0].dataIndex];
              const dayLog = logs[dateStr] || {};
              const lines = [];
              habits.forEach(h => {
                const v = dayLog[h.id];
                if (!v) return;
                const icon = (h.type === 'good' && v === 'yes') ? '✓' :
                             (h.type === 'good' && v === 'no')  ? '✗' :
                             (h.type === 'bad'  && v === 'yes') ? '✓' : '⚠';
                lines.push('  ' + icon + ' ' + h.name);
              });
              return lines.length ? ['', 'Habits:'].concat(lines) : [];
            }
          }
        }
      },
      scales: {
        y: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8b94a8', callback: v => v + '%', stepSize: 25 }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#8b94a8', maxRotation: 0, maxTicksLimit: 10 }
        }
      }
    }
  });
}

// Longest run of consecutive 'yes' days a habit has ever had (not just the
// current run) — scans day-by-day from creation (or earliest log) to today.
function getLongestStreak(habitId) {
  const habit = habits.find(h => h.id === habitId);
  let start = habit && habit.createdAt ? habit.createdAt : null;
  if (!start) {
    const loggedDates = Object.keys(logs).filter(d => (logs[d] || {})[habitId] !== undefined).sort();
    start = loggedDates.length ? loggedDates[0] : todayStr();
  }
  const end = todayStr();
  // Safety cap: isValidDateStr only checks format, not plausible range, so a
  // malformed/extreme createdAt from an import or synced Gist (e.g. year 0001)
  // shouldn't turn this into a hundreds-of-thousands-of-iterations scan.
  const earliestReasonable = offsetDate(end, -1825); // ~5 years
  if (start < earliestReasonable) start = earliestReasonable;
  let longest = 0, current = 0;
  for (let d = start; d <= end; d = offsetDate(d, 1)) {
    if ((logs[d] || {})[habitId] === 'yes') { current++; if (current > longest) longest = current; }
    else current = 0;
  }
  return longest;
}

function renderPerHabitLines() {
  const wrap = document.getElementById('per-habit-lines');

  Object.values(sparklineCharts).forEach(c => c.destroy());
  sparklineCharts = {};

  if (!habits.length) {
    wrap.innerHTML = '<div style="color:var(--text3);font-size:14px;padding:8px 0;">No habits yet.</div>';
    return;
  }
  const dates = getDateRange(todayStr(), progressPeriod);
  const total = dates.length;

  wrap.innerHTML = habits.map(function(h) {
    // Filter dates to only include those from when the habit was created onwards
    const habitDates = dates.filter(d => !h.createdAt || d >= h.createdAt);
    const habitTotal = habitDates.length;
    const done     = habitDates.filter(function(d) { return (logs[d] || {})[h.id] === 'yes'; }).length;
    const missed   = habitDates.filter(function(d) { return (logs[d] || {})[h.id] === 'no'; }).length;
    const unlogged = habitTotal - done - missed;
    const logged2   = done + missed;
    const donePct   = logged2 ? Math.round((done / logged2) * 100) : 0;
    const missedPct = logged2 ? Math.round((missed / logged2) * 100) : 0;
    const unlogPct  = 100 - donePct - missedPct;

    const isGood      = h.type === 'good';
    const doneLabel   = isGood ? 'Done' : 'Avoided';
    const missedLabel = isGood ? 'Missed' : 'Did it';
    const doneColor   = '#3ecf8e';
    const missedColor = '#f56565';

    const streak = getStreak(h.id, todayStr());
    const longest = getLongestStreak(h.id);

    const streakHTML = streak >= 2
      ? '<span style="font-size:12px;color:#fbbf24;background:rgba(251,191,36,0.1);padding:2px 8px;border-radius:6px;">&#128293; ' + streak + ' streak</span>'
      : '';
    const bestHTML = longest >= 2
      ? '<span style="font-size:12px;color:var(--text3);">best: ' + longest + 'd</span>'
      : '';

    return '<div class="habit-progress-item">'
      + '<div class="progress-top">'
      + '<span class="habit-badge ' + h.type + '">' + h.type + '</span>'
      + '<span class="prog-name">' + escHtml(h.name) + '</span>'
      + streakHTML
      + bestHTML
      + '<canvas class="habit-sparkline" id="spark-' + h.id + '" width="60" height="20"></canvas>'
      + '</div>'
      + '<div style="display:flex;gap:3px;height:8px;border-radius:4px;overflow:hidden;margin-bottom:8px;">'
      + '<div style="width:' + donePct + '%;background:' + doneColor + ';transition:width 0.4s;"></div>'
      + '<div style="width:' + missedPct + '%;background:' + missedColor + ';opacity:0.5;transition:width 0.4s;"></div>'
      + '<div style="width:' + unlogPct + '%;background:var(--bg3);"></div>'
      + '</div>'
      + '<div style="display:flex;gap:16px;font-size:12px;color:var(--text3);flex-wrap:wrap;">'
      + '<span style="color:' + doneColor + ';font-weight:500;">' + doneLabel + ': ' + done + 'd (' + donePct + '%)</span>'
      + '<span style="color:' + missedColor + ';opacity:0.85;">' + missedLabel + ': ' + missed + 'd (' + missedPct + '%)</span>'
      + '<span>Unlogged: ' + unlogged + 'd</span>'
      + '</div>'
      + '</div>';
  }).join('');

  // Sparkline canvases only exist in the DOM now — create their charts after insertion.
  habits.forEach(function(h) {
    const canvas = document.getElementById('spark-' + h.id);
    if (!canvas) return;
    const habitDates = dates.filter(d => !h.createdAt || d >= h.createdAt);
    const points = habitDates.map(function(d) { return (logs[d] || {})[h.id] === 'yes' ? 1 : 0; });
    sparklineCharts[h.id] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: habitDates,
        datasets: [{
          data: points,
          borderColor: h.type === 'good' ? '#3ecf8e' : '#f56565',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          fill: false
        }]
      },
      options: {
        responsive: false,
        animation: false,
        scales: { x: { display: false }, y: { display: false, min: 0, max: 1 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
  });
}


// ─── GITHUB GIST SYNC ────────────────────────────────────────────────────────
const GIST_FILENAME = 'habitOS-data.json';

function getSyncConfig() {
  return {
    token: localStorage.getItem('ht_sync_token') || '',
    gistId: localStorage.getItem('ht_sync_gist_id') || '',
    lastSync: localStorage.getItem('ht_sync_last') || ''
  };
}

function isSyncConnected() {
  return !!getSyncConfig().token;
}

function updateSyncBtn() {
  const btn = document.getElementById('sync-btn');
  const pullBtn = document.getElementById('header-pull-btn');
  const pushBtn = document.getElementById('header-push-btn');
  if (!btn) return;
  const cfg = getSyncConfig();
  btn.classList.toggle('active', !!cfg.token);
  const showTransfer = !!(cfg.token && cfg.gistId);
  if (pullBtn) pullBtn.style.display = showTransfer ? 'inline-flex' : 'none';
  if (pushBtn) pushBtn.style.display = cfg.token ? 'inline-flex' : 'none';
}

function openSyncModal() {
  const cfg = getSyncConfig();
  document.getElementById('sync-token').value = cfg.token ? '••••••••••••••••••••' : '';
  document.getElementById('sync-gist-id').value = cfg.gistId || '';
  document.getElementById('sync-error').textContent = '';
  updateSyncModalState(!!cfg.token);
  document.getElementById('sync-modal-backdrop').classList.add('open');
}

function closeSyncModal(e) {
  if (!e || e.target.id === 'sync-modal-backdrop')
    document.getElementById('sync-modal-backdrop').classList.remove('open');
}

function onSyncTokenInput() {
  const input = document.getElementById('sync-token');
  if (input.value === '••••••••••••••••••••') input.value = '';
  updateSyncModalState(false);
}

function updateSyncModalState(connected) {
  const cfg = getSyncConfig();
  document.getElementById('sync-gist-row').style.display = 'block';
  document.getElementById('sync-status-row').style.display = connected ? 'block' : 'none';
  document.getElementById('sync-save-btn').textContent = connected ? 'Update' : 'Connect';

  if (connected) {
    const dot = document.getElementById('sync-dot');
    const txt = document.getElementById('sync-status-text');
    dot.className = 'sync-status-dot connected';
    txt.textContent = cfg.gistId ? 'Connected — Gist: ' + cfg.gistId.slice(0, 10) + '…' : 'Connected — add Gist ID then Push to create one';
    const last = document.getElementById('sync-last-time');
    last.textContent = cfg.lastSync ? 'Last synced: ' + new Date(cfg.lastSync).toLocaleString() : '';
  }
}

// ─── UNTRUSTED-DATA SANITIZATION ─────────────────────────────────────────────
// Applied to anything not created via the app's own UI (imported files, or
// data pulled from a Gist that could have been hand-edited or tampered with).
// Habit ids and types get interpolated unescaped into inline HTML attributes
// (see habitItemHTML / renderManageHabits), so unvalidated fields there are
// an XSS vector — this whitelists/regenerates them before they ever reach render.
function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function sanitizeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

function sanitizeDataset(raw) {
  const rawHabits = Array.isArray(raw.habits) ? raw.habits : [];
  const idMap = {};
  const seenIds = new Set();
  const cleanHabits = [];

  rawHabits.forEach((h, i) => {
    if (!h || typeof h !== 'object') return;
    const name = typeof h.name === 'string' ? h.name.trim().slice(0, 60) : '';
    if (!name) return;
    const validId = sanitizeId(h.id);
    let id;
    if (validId && !seenIds.has(validId)) {
      id = validId; // well-formed and not a duplicate — keep as-is, logs need no remap
    } else {
      id = 'h' + Date.now() + '_' + i;
      // Only remap logs when the ORIGINAL id was itself malformed (unambiguous:
      // no other habit could legitimately claim that exact string). If this was
      // a duplicate of an already-seen valid id, the earlier habit keeps that id
      // and rightfully owns any logs filed under it — remapping here would steal
      // them from the habit that still visibly has the original id.
      if (!validId && typeof h.id === 'string') idMap[h.id] = id;
    }
    seenIds.add(id);
    const type = (h.type === 'good' || h.type === 'bad') ? h.type : 'good';
    const desc = typeof h.desc === 'string' ? h.desc.trim().slice(0, 500) : '';
    const createdAt = isValidDateStr(h.createdAt) ? h.createdAt : null;
    cleanHabits.push({ id, name, type, desc, createdAt });
  });

  const rawLogs = (raw.logs && typeof raw.logs === 'object') ? raw.logs : {};
  const validHabitIds = new Set(cleanHabits.map(h => h.id));
  const cleanLogs = {};
  for (const date of Object.keys(rawLogs)) {
    if (!isValidDateStr(date)) continue;
    const dayLog = rawLogs[date];
    if (!dayLog || typeof dayLog !== 'object') continue;
    const cleanDay = {};
    for (const rawId of Object.keys(dayLog)) {
      const mappedId = idMap[rawId] || rawId;
      if (!validHabitIds.has(mappedId)) continue;
      const v = dayLog[rawId];
      if (v === 'yes' || v === 'no') cleanDay[mappedId] = v;
    }
    if (Object.keys(cleanDay).length) cleanLogs[date] = cleanDay;
  }

  const deletedHabitIdsClean = Array.isArray(raw.deletedHabitIds)
    ? raw.deletedHabitIds.filter(id => sanitizeId(id))
    : [];

  return { habits: cleanHabits, logs: cleanLogs, deletedHabitIds: deletedHabitIdsClean };
}

// Merge remote data into local.
// Remote habits are the source of truth (so deletions propagate on pull).
// Local-only habits (created on this device since the last push) are preserved.
// Remote wins on log-entry conflicts (same habit same day).
function mergeRemoteIntoLocal(remote) {
  const clean = sanitizeDataset(remote || {});
  const remoteDeletedIds = clean.deletedHabitIds;
  const deletedSet = new Set([...deletedHabitIds, ...remoteDeletedIds]);

  // Remote habits are the source of truth, but a habit deleted on either side
  // is dropped even if the remote copy hasn't caught up with that deletion yet —
  // otherwise merging in a stale remote (e.g. syncPush pulling before pushing)
  // would resurrect a habit the user just deleted locally.
  const remoteHabits = clean.habits.filter(h => !deletedSet.has(h.id));

  // Habits: use remote as the base, then append any local-only habits
  // (created on this device since the last push) so they aren't wiped.
  const remoteIds = new Set(remoteHabits.map(h => h.id));
  const localOnlyHabits = habits.filter(h => !remoteIds.has(h.id) && !deletedSet.has(h.id));
  habits = [...remoteHabits, ...localOnlyHabits];

  // Merge logs: remote wins if both sides have an entry for the same day/habit
  const remoteLogs = clean.logs;
  for (const date of Object.keys(remoteLogs)) {
    if (!logs[date]) logs[date] = {};
    for (const habitId of Object.keys(remoteLogs[date])) {
      logs[date][habitId] = remoteLogs[date][habitId];
    }
  }

  // Clean up log entries for habits that no longer exist
  const allIds = new Set(habits.map(h => h.id));
  for (const date in logs) {
    for (const id in logs[date]) {
      if (!allIds.has(id)) delete logs[date][id];
    }
  }

  // Merge deleted habit tracking
  for (const id of remoteDeletedIds) {
    if (!deletedHabitIds.includes(id)) {
      deletedHabitIds.push(id);
    }
  }
}

async function saveSyncConfig() {
  const tokenInput = document.getElementById('sync-token');
  const gistInput = document.getElementById('sync-gist-id');
  const errEl = document.getElementById('sync-error');
  errEl.textContent = '';

  let token = tokenInput.value.trim();
  if (token === '••••••••••••••••••••' || token === '') token = getSyncConfig().token;
  if (!token) { errEl.textContent = 'Please enter a GitHub token.'; return; }
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_') && !token.startsWith('gho_')) {
    errEl.textContent = 'Token should start with ghp_, github_pat_, or gho_';
    return;
  }

  setSyncDotState('syncing', 'Verifying token…');
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json' }
    });
    if (!res.ok) { errEl.textContent = 'Invalid token or network error (' + res.status + ')'; setSyncDotState('error','Error'); return; }
  } catch(e) { errEl.textContent = 'Network error: ' + e.message; setSyncDotState('error','Error'); return; }

  localStorage.setItem('ht_sync_token', token);
  const gistId = gistInput.value.trim();
  if (gistId) localStorage.setItem('ht_sync_gist_id', gistId);
  else localStorage.removeItem('ht_sync_gist_id');

  updateSyncModalState(true);
  updateSyncBtn();
  setSyncDotState('connected', 'Connected — use Pull or Push below');
  showToast('Sync configured!');
}

function setSyncDotState(state, text) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-status-text');
  document.getElementById('sync-status-row').style.display = 'block';
  if (dot) dot.className = 'sync-status-dot ' + state;
  if (txt) txt.textContent = text;
}

async function syncPush() {
  const cfg = getSyncConfig();
  if (!cfg.token) { showToast('Set up sync first'); return; }
  const errEl = document.getElementById('sync-error');
  errEl.textContent = '';
  setSyncDotState('syncing', 'Pushing…');

  // Pull and merge first so a push from this device doesn't silently clobber
  // changes another device already pushed since our last sync.
  if (cfg.gistId) {
    try {
      const pullRes = await fetch('https://api.github.com/gists/' + cfg.gistId + '?_=' + Date.now(), {
        headers: { Authorization: 'token ' + cfg.token, Accept: 'application/vnd.github.v3+json' },
        cache: 'no-store'
      });
      if (pullRes.ok) {
        const pullData = await pullRes.json();
        const remoteFile = pullData.files && pullData.files[GIST_FILENAME];
        if (remoteFile) {
          mergeRemoteIntoLocal(JSON.parse(remoteFile.content));
          saveData();
          renderToday();
          renderManageHabits();
          renderProgress();
        }
      }
      // If the pull fails (network hiccup, etc.) fall through and push local
      // state as a best effort rather than blocking the push entirely.
    } catch(e) {}
  }

  const content = JSON.stringify({ habits, logs, deletedHabitIds, syncedAt: new Date().toISOString() }, null, 2);
  const body = { description: 'habitOS data', public: false, files: { [GIST_FILENAME]: { content } } };

  try {
    let res, data;
    if (cfg.gistId) {
      res = await fetch('https://api.github.com/gists/' + cfg.gistId, {
        method: 'PATCH',
        headers: { Authorization: 'token ' + cfg.token, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json' },
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: { Authorization: 'token ' + cfg.token, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json' },
        body: JSON.stringify(body)
      });
    }
    data = await res.json();
    if (!res.ok) { errEl.textContent = data.message || 'Push failed'; setSyncDotState('error', 'Push failed'); return; }

    if (!cfg.gistId) {
      localStorage.setItem('ht_sync_gist_id', data.id);
      document.getElementById('sync-gist-id').value = data.id;
      updateSyncBtn();
    }
    const now = new Date().toISOString();
    localStorage.setItem('ht_sync_last', now);
    setSyncDotState('connected', 'Pushed ✓');
    document.getElementById('sync-last-time').textContent = 'Last synced: ' + new Date(now).toLocaleString();
    updateSyncBtn();
    showToast('Pushed to Gist ✓');
  } catch(e) { errEl.textContent = 'Network error: ' + e.message; setSyncDotState('error', 'Error'); }
}

async function syncPull() {
  const cfg = getSyncConfig();
  if (!cfg.token) { showToast('Set up sync first'); return; }
  if (!cfg.gistId) { document.getElementById('sync-error').textContent = 'No Gist ID — push first or enter one above.'; return; }
  const errEl = document.getElementById('sync-error');
  errEl.textContent = '';
  setSyncDotState('syncing', 'Pulling…');

  try {
    const res = await fetch('https://api.github.com/gists/' + cfg.gistId + '?_=' + Date.now(), {
      headers: { Authorization: 'token ' + cfg.token, Accept: 'application/vnd.github.v3+json' },
      cache: 'no-store'
    });
    if (!res.ok) { errEl.textContent = 'Pull failed (' + res.status + ')'; setSyncDotState('error', 'Pull failed'); return; }
    const data = await res.json();
    const file = data.files[GIST_FILENAME];
    if (!file) { errEl.textContent = 'No habitOS data found in that Gist.'; setSyncDotState('error', 'Not found'); return; }

    const remote = JSON.parse(file.content);
    // Merge remote into local — preserves local-only changes
    mergeRemoteIntoLocal(remote);
    saveData();
    renderToday();
    renderManageHabits();
    renderProgress();

    // After successful pull, sync the deleted tracking from remote
    const now = new Date().toISOString();
    localStorage.setItem('ht_sync_last', now);
    setSyncDotState('connected', 'Pulled ✓');
    document.getElementById('sync-last-time').textContent = 'Last synced: ' + new Date(now).toLocaleString();
    showToast('Pulled from Gist ✓');
  } catch(e) { errEl.textContent = 'Error: ' + e.message; setSyncDotState('error', 'Error'); }
}

// ─── IMPORT / EXPORT ─────────────────────────────────────────────────────────
function exportData() {
  const data = { habits, logs, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `habits-${todayStr()}.json`;
  a.click();
  showToast('Data exported!');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data || typeof data !== 'object' || !Array.isArray(data.habits)) {
        showToast('Invalid file');
        return;
      }
      if (!confirm('Importing will replace all current habits and logs on this device. Continue?')) return;
      const clean = sanitizeDataset(data);
      habits = clean.habits;
      logs = clean.logs;
      // Full replace — also reset local deletion tombstones so a habit that
      // was deleted here but is present in the imported file actually stays
      // restored instead of vanishing again on the next sync.
      deletedHabitIds = clean.deletedHabitIds;
      saveData();
      renderToday();
      renderManageHabits();
      showToast('Data imported!');
    } catch { showToast('Invalid file'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ─── PASSWORD AUTH ──────────────────────────────────────────────────────────
function hashPw(pw) {
  // simple deterministic hash (not cryptographic, but fine for local file)
  let h = 0x811c9dc5;
  for (let i = 0; i < pw.length; i++) {
    h ^= pw.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function initLockScreen() {
  const stored = localStorage.getItem('ht_pw');
  if (!stored) {
    // No password set yet — stay hidden, let user set one via the header button
    return;
  }
  // Password exists — show the lock screen
  document.getElementById('lock-screen').classList.remove('hidden');
  document.getElementById('lock-pw-input').focus();
}

function submitLock() {
  const input = document.getElementById('lock-pw-input');
  const pw = input.value;
  const stored = localStorage.getItem('ht_pw');
  const errEl = document.getElementById('lock-error');
  input.classList.remove('error');
  errEl.textContent = '';

  if (!pw) { errEl.textContent = 'Please enter a password.'; return; }

  if (!stored) {
    // first-time setup
    if (pw.length < 4) { errEl.textContent = 'Password must be at least 4 characters.'; input.classList.add('error'); return; }
    localStorage.setItem('ht_pw', hashPw(pw));
    document.getElementById('lock-screen').classList.add('hidden');
    showToast('Password set! You\'re in.');
  } else {
    if (hashPw(pw) === stored) {
      document.getElementById('lock-screen').classList.add('hidden');
    } else {
      errEl.textContent = 'Incorrect password.';
      input.classList.add('error');
      input.value = '';
      setTimeout(() => input.classList.remove('error'), 500);
    }
  }
}

function openPwModal() {
  document.getElementById('pw-current').value = '';
  document.getElementById('pw-new').value = '';
  document.getElementById('pw-confirm').value = '';
  document.getElementById('pw-change-error').textContent = '';
  document.getElementById('pw-modal-backdrop').classList.add('open');
  setTimeout(() => document.getElementById('pw-current').focus(), 100);
}

function closePwModal(e) {
  if (!e || e.target.id === 'pw-modal-backdrop')
    document.getElementById('pw-modal-backdrop').classList.remove('open');
}

function doChangePassword() {
  const cur = document.getElementById('pw-current').value;
  const nw  = document.getElementById('pw-new').value;
  const cfm = document.getElementById('pw-confirm').value;
  const errEl = document.getElementById('pw-change-error');
  const stored = localStorage.getItem('ht_pw');
  errEl.textContent = '';

  if (stored && hashPw(cur) !== stored) { errEl.textContent = 'Current password is incorrect.'; return; }
  if (nw.length < 4) { errEl.textContent = 'New password must be at least 4 characters.'; return; }
  if (nw !== cfm) { errEl.textContent = 'Passwords do not match.'; return; }

  localStorage.setItem('ht_pw', hashPw(nw));
  document.getElementById('pw-modal-backdrop').classList.remove('open');
  showToast('Password updated!');
}

// ─── INIT ────────────────────────────────────────────────────────────────────
document.getElementById('header-date').textContent =
  new Date().toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAddModal();
    closeConfirmModal();
  }
});

loadData();
initLockScreen();
renderToday();
updateSyncBtn();
