// ─── STATE ─────────────────────────────────────────────────────────────────
let habits = [];
let logs = {};   // { "YYYY-MM-DD": { habitId: "yes"|"no"|null } }
let deletedHabitIds = [];  // Track deleted habits to prevent re-adding during merge
let selectedType = 'good';
let editingHabitId = null;
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

  document.getElementById('stats-row').innerHTML = `
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
    html += `<div class="habit-section-title good">Good habits</div>`;
    goodH.forEach(h => html += habitItemHTML(h, dayLog[h.id] || null));
  }
  if (badH.length) {
    html += `<div class="habit-section-title bad">Bad habits</div>`;
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

  const yesLabel = h.type === 'good' ? 'Done' : 'Avoided';
  const noLabel = h.type === 'good' ? 'Missed' : 'Gave in';

  return `
    <div class="habit-item ${statusClass}" id="hi-${h.id}">
      <span class="habit-badge ${h.type}">${h.type}</span>
      <div class="habit-info">
        <div class="name">${escHtml(h.name)}</div>
        ${h.desc ? `<div class="meta">${escHtml(h.desc)}</div>` : ''}
      </div>
      <div class="habit-item-meta">
        ${streakHTML}
        <div class="habit-actions">
          <button class="check-btn yes ${val === 'yes' ? 'active' : ''}"
            onclick="logHabit('${h.id}', 'yes')">✓ ${yesLabel}</button>
          <button class="check-btn no ${val === 'no' ? 'active' : ''}"
            onclick="logHabit('${h.id}', 'no')">✗ ${noLabel}</button>
        </div>
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

  const manageItemHTML = h => `
    <div class="manage-habit-item">
      <span class="habit-badge ${h.type}">${h.type}</span>
      <div class="manage-habit-info">
        <div class="name">${escHtml(h.name)}</div>
        ${h.desc ? `<div class="desc">${escHtml(h.desc)}</div>` : ''}
      </div>
      <div class="manage-habit-actions">
        <button class="btn btn-sm" onclick="editHabit('${h.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteHabit('${h.id}')">Delete</button>
      </div>
    </div>
  `;

  const goodH = habits.filter(h => h.type === 'good');
  const badH  = habits.filter(h => h.type === 'bad');

  let html = '';
  if (goodH.length) {
    html += `<div class="habit-section-title good">Good habits</div>`;
    html += goodH.map(manageItemHTML).join('');
  }
  if (badH.length) {
    html += `<div class="habit-section-title bad">Bad habits</div>`;
    html += badH.map(manageItemHTML).join('');
  }
  list.innerHTML = html;
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

// ─── ADD / EDIT HABIT MODAL ──────────────────────────────────────────────────
function openAddModal() {
  editingHabitId = null;
  document.getElementById('add-modal-title').textContent = 'Add Habit';
  document.getElementById('add-modal-save-btn').textContent = 'Save Habit';
  document.getElementById('habit-name').value = '';
  document.getElementById('habit-desc').value = '';
  selectType('good');
  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => document.getElementById('habit-name').focus(), 100);
}

function editHabit(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;
  editingHabitId = id;
  document.getElementById('add-modal-title').textContent = 'Edit Habit';
  document.getElementById('add-modal-save-btn').textContent = 'Save Changes';
  document.getElementById('habit-name').value = habit.name;
  document.getElementById('habit-desc').value = habit.desc || '';
  selectType(habit.type);
  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => document.getElementById('habit-name').focus(), 100);
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('open');
  editingHabitId = null;
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
  const desc = document.getElementById('habit-desc').value.trim();

  if (editingHabitId) {
    const habit = habits.find(h => h.id === editingHabitId);
    if (habit) {
      if (habit.type !== selectedType) {
        const loggedDays = Object.keys(logs).filter(d => {
          const v = (logs[d] || {})[habit.id];
          return v === 'yes' || v === 'no';
        }).length;
        if (loggedDays > 0) {
          const ok = confirm(
            '"' + habit.name + '" has ' + loggedDays + ' logged day' + (loggedDays === 1 ? '' : 's') + '. ' +
            'Changing its type will re-label all of that history (e.g. "Done" becomes "Avoided") ' +
            'and shift it between the good/bad stats. Continue?'
          );
          if (!ok) return;
        }
      }
      habit.name = name;
      habit.desc = desc;
      habit.type = selectedType;
    }
    saveData();
    closeAddModal();
    renderManageHabits();
    renderToday();
    showToast('Habit updated!');
    return;
  }

  habits.push({
    id: 'h' + Date.now(),
    name,
    desc,
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

// Weekly summary above the charts — a mini 7-day heatmap (same green/red
// day-scoring as the 12-month heatmap below) instead of raw percentages.
function renderDigest() {
  const el = document.getElementById('progress-digest');
  if (!el) return;
  if (!habits.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';

  const days = getDateRange(todayStr(), 7);
  const anyLogged = days.some(d => getDayScore(d) !== null);
  if (!anyLogged) {
    el.innerHTML = '<span class="digest-label">Last 7 days</span><span class="digest-empty">No habits logged yet</span>';
    return;
  }

  const cells = days.map(d => {
    const score = getDayScore(d);
    const pctLabel = score === null ? 'No entries' : Math.round(score * 100) + '% success';
    const weekdayLabel = new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
    const dateLabel = new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    let fill;
    if (score === null) {
      fill = '<div class="week-cell-fill neutral"></div>';
    } else {
      const goodPct = Math.round(score * 100);
      fill = '<div class="week-cell-fill bad" style="height:' + (100 - goodPct) + '%;"></div>'
           + '<div class="week-cell-fill good" style="height:' + goodPct + '%;"></div>';
    }
    return '<div class="week-day">'
      + '<div class="week-cell clickable" title="' + dateLabel + ' — ' + pctLabel + '" onclick="goToDateFromHeatmap(\'' + d + '\')">' + fill + '</div>'
      + '<span class="week-day-label">' + weekdayLabel + '</span>'
      + '</div>';
  }).join('');

  el.innerHTML = '<span class="digest-label">Last 7 days</span><div class="week-heatmap">' + cells + '</div>';
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
  if (score === null) return '';
  if (score === 0.5) return 'tied';
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
  wrap.scrollLeft = wrap.scrollWidth; // default view to the most recent days
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
    if (goodAvg !== null) summary += `<span style="color:#3ecf8e;font-weight:600;">${goodAvg}% good</span>`;
    if (goodAvg !== null && badAvg !== null) summary += ' &nbsp;·&nbsp; ';
    if (badAvg !== null) summary += `<span style="color:#f56565;font-weight:600;">${badAvg}% bad</span>`;
    titleEl.innerHTML = 'Daily trend &nbsp;<span style="font-size:12px;color:var(--text3);font-weight:400;">' + summary + '</span>';
  }

  const ctx = document.getElementById('completion-chart').getContext('2d');
  if (completionChart) completionChart.destroy();

  const datasets = [];
  if (goodHabits.length) {
    datasets.push({
      label: 'Good habits',
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
      label: 'Bad habits',
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
        tooltip: { enabled: false }
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
  // malformed/extreme createdAt from an import or synced data (e.g. year 0001)
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

  const itemHTML = function(h) {
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
      ? '<span class="best-badge">🏆 best ' + longest + 'd</span>'
      : '';

    return '<div class="habit-progress-item">'
      + '<div class="progress-top">'
      + '<span class="habit-badge ' + h.type + '">' + h.type + '</span>'
      + '<span class="prog-name">' + escHtml(h.name) + '</span>'
      + '<div class="progress-top-meta">'
      + streakHTML
      + bestHTML
      + '<canvas class="habit-sparkline" id="spark-' + h.id + '" width="60" height="20"></canvas>'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:3px;height:8px;border-radius:4px;overflow:hidden;margin-bottom:8px;">'
      + '<div style="width:' + donePct + '%;background:' + doneColor + ';transition:width 0.4s;"></div>'
      + '<div style="width:' + missedPct + '%;background:' + missedColor + ';opacity:0.5;transition:width 0.4s;"></div>'
      + '<div style="width:' + unlogPct + '%;background:var(--bg3);"></div>'
      + '</div>'
      + '<div class="prog-stats">'
      + '<span class="prog-stat good">' + doneLabel + ': ' + done + 'd <b>' + donePct + '%</b></span>'
      + '<span class="prog-stat bad">' + missedLabel + ': ' + missed + 'd <b>' + missedPct + '%</b></span>'
      + '<span class="prog-stat neutral">Unlogged: ' + unlogged + 'd</span>'
      + '</div>'
      + '</div>';
  };

  const goodH = habits.filter(h => h.type === 'good');
  const badH  = habits.filter(h => h.type === 'bad');

  let html = '';
  if (goodH.length) {
    html += '<div class="habit-section-title good">Good habits</div>';
    html += goodH.map(itemHTML).join('');
  }
  if (badH.length) {
    html += '<div class="habit-section-title bad">Bad habits</div>';
    html += badH.map(itemHTML).join('');
  }
  wrap.innerHTML = html;

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


// ─── SUPABASE SYNC ───────────────────────────────────────────────────────────
// Fill these in from your Supabase project: Project Settings → API.
// The anon key is safe to ship client-side — Row Level Security (see the SQL
// migration) is what actually restricts each user to their own rows.
const SUPABASE_URL = 'https://aybqklcczxlnkclvkudx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YnFrbGNjenhsbmtjbHZrdWR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMzM0OTAsImV4cCI6MjA5OTYwOTQ5MH0.AARisHgCux0t6D4OaKW40kMjupLSDiMEuV6c1cSTNl8';

const sb = (window.supabase && SUPABASE_URL.startsWith('http') && !SUPABASE_URL.includes('YOUR-PROJECT'))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let syncSession = null; // current Supabase auth session, or null when signed out

function isSyncConnected() {
  return !!syncSession;
}

function updateSyncBtn() {
  const btn = document.getElementById('sync-btn');
  const pullBtn = document.getElementById('header-pull-btn');
  const pushBtn = document.getElementById('header-push-btn');
  if (!btn) return;
  const connected = isSyncConnected();
  btn.classList.toggle('active', connected);
  if (pullBtn) pullBtn.style.display = connected ? 'inline-flex' : 'none';
  if (pushBtn) pushBtn.style.display = connected ? 'inline-flex' : 'none';
}

function openSyncModal() {
  document.getElementById('sync-error').textContent = '';
  updateSyncModalState();
  document.getElementById('sync-modal-backdrop').classList.add('open');
}

function closeSyncModal(e) {
  if (!e || e.target.id === 'sync-modal-backdrop')
    document.getElementById('sync-modal-backdrop').classList.remove('open');
}

function onSyncEmailInput() {
  document.getElementById('sync-error').textContent = '';
}

function updateSyncModalState() {
  const connected = isSyncConnected();
  document.getElementById('sync-signed-out').style.display = connected ? 'none' : 'block';
  document.getElementById('sync-signed-in').style.display = connected ? 'block' : 'none';

  const saveBtn = document.getElementById('sync-save-btn');
  saveBtn.textContent = connected ? 'Sign out' : 'Send magic link';
  saveBtn.onclick = connected ? syncSignOut : sendMagicLink;

  if (connected) {
    const dot = document.getElementById('sync-dot');
    const txt = document.getElementById('sync-status-text');
    dot.className = 'sync-status-dot connected';
    txt.textContent = 'Signed in as ' + syncSession.user.email;
    const lastSync = localStorage.getItem('ht_sync_last');
    document.getElementById('sync-last-time').textContent =
      lastSync ? 'Last synced: ' + new Date(lastSync).toLocaleString() : '';
  }
}

async function sendMagicLink() {
  const errEl = document.getElementById('sync-error');
  errEl.textContent = '';
  if (!sb) { errEl.textContent = 'Sync isn’t configured — missing Supabase project URL/key.'; return; }
  const email = document.getElementById('sync-email').value.trim();
  if (!email) { errEl.textContent = 'Enter your email address.'; return; }

  const btn = document.getElementById('sync-save-btn');
  btn.disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
  btn.disabled = false;
  if (error) { errEl.textContent = error.message; return; }
  showToast('Magic link sent — check your email');
}

async function syncSignOut() {
  if (sb) await sb.auth.signOut();
  syncSession = null;
  updateSyncBtn();
  updateSyncModalState();
  showToast('Signed out');
}

async function initSyncAuth() {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  syncSession = session;
  updateSyncBtn();

  sb.auth.onAuthStateChange((event, session) => {
    const wasConnected = isSyncConnected();
    syncSession = session;
    updateSyncBtn();
    if (document.getElementById('sync-modal-backdrop').classList.contains('open')) {
      updateSyncModalState();
    }
    if (session && !wasConnected) showToast('Signed in ✓');
  });
}

// ─── UNTRUSTED-DATA SANITIZATION ─────────────────────────────────────────────
// Applied to imported JSON files, which could have been hand-edited or come
// from an untrusted source. Habit ids and types get interpolated unescaped
// into inline HTML attributes
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

// Merge remote rows into local state.
// Remote habits are the source of truth for anything already pushed (so edits
// or deletions made on another device propagate on pull). A habit that only
// exists locally (created on this device since the last push) is preserved.
// Remote wins on log-entry conflicts (same habit, same day).
function mergeRemoteIntoLocal(remoteHabits, remoteLogRows) {
  const activeRemote = remoteHabits.filter(h => !h.deleted_at);
  const deletedRemoteIds = new Set(remoteHabits.filter(h => h.deleted_at).map(h => h.id));
  const remoteIds = new Set(activeRemote.map(h => h.id));

  const localOnlyHabits = habits.filter(h => !remoteIds.has(h.id) && !deletedRemoteIds.has(h.id));
  habits = [
    ...activeRemote.map(h => ({ id: h.id, name: h.name, type: h.type, desc: h.description || '', createdAt: h.created_at })),
    ...localOnlyHabits
  ];

  for (const row of remoteLogRows) {
    if (!logs[row.date]) logs[row.date] = {};
    logs[row.date][row.habit_id] = row.value;
  }

  // Clean up log entries for habits that no longer exist
  const allIds = new Set(habits.map(h => h.id));
  for (const date in logs) {
    for (const id in logs[date]) {
      if (!allIds.has(id)) delete logs[date][id];
    }
  }

  // Remote tombstones (habits deleted on another device) need to be tracked
  // locally too, so a later push doesn't accidentally resurrect them.
  for (const id of deletedRemoteIds) {
    if (!deletedHabitIds.includes(id)) deletedHabitIds.push(id);
  }
}

function setSyncDotState(state, text) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-status-text');
  if (dot) dot.className = 'sync-status-dot ' + state;
  if (txt) txt.textContent = text;
}

async function syncPush() {
  if (!sb || !syncSession) { showToast('Sign in to sync first'); return; }
  const errEl = document.getElementById('sync-error');
  errEl.textContent = '';
  setSyncDotState('syncing', 'Pushing…');

  const uid = syncSession.user.id;
  const habitRows = habits.map(h => ({
    id: h.id, user_id: uid, name: h.name, type: h.type,
    description: h.desc || '', created_at: h.createdAt || null, deleted_at: null
  }));
  // Tombstone rows for habits deleted on this device — upsert is idempotent,
  // so re-sending the same tombstone on every push is harmless.
  const tombstoneRows = deletedHabitIds
    .filter(id => !habits.some(h => h.id === id))
    .map(id => ({
      id, user_id: uid, name: '(deleted)', type: 'good', description: '', created_at: null,
      deleted_at: new Date().toISOString()
    }));
  const logRows = [];
  for (const date of Object.keys(logs)) {
    for (const habitId of Object.keys(logs[date])) {
      logRows.push({ user_id: uid, habit_id: habitId, date, value: logs[date][habitId] });
    }
  }

  try {
    if (habitRows.length || tombstoneRows.length) {
      const { error } = await sb.from('habits').upsert([...habitRows, ...tombstoneRows]);
      if (error) throw error;
    }
    if (logRows.length) {
      const { error } = await sb.from('logs').upsert(logRows);
      if (error) throw error;
    }
    const now = new Date().toISOString();
    localStorage.setItem('ht_sync_last', now);
    setSyncDotState('connected', 'Pushed ✓');
    const last = document.getElementById('sync-last-time');
    if (last) last.textContent = 'Last synced: ' + new Date(now).toLocaleString();
    showToast('Pushed ✓');
  } catch(e) {
    errEl.textContent = e.message || 'Push failed';
    setSyncDotState('error', 'Push failed');
  }
}

async function syncPull() {
  if (!sb || !syncSession) { showToast('Sign in to sync first'); return; }
  const errEl = document.getElementById('sync-error');
  errEl.textContent = '';
  setSyncDotState('syncing', 'Pulling…');

  const uid = syncSession.user.id;
  try {
    const [habitsRes, logsRes] = await Promise.all([
      sb.from('habits').select('*').eq('user_id', uid),
      sb.from('logs').select('*').eq('user_id', uid)
    ]);
    if (habitsRes.error) throw habitsRes.error;
    if (logsRes.error) throw logsRes.error;

    mergeRemoteIntoLocal(habitsRes.data || [], logsRes.data || []);
    saveData();
    renderToday();
    renderManageHabits();
    renderProgress();

    const now = new Date().toISOString();
    localStorage.setItem('ht_sync_last', now);
    setSyncDotState('connected', 'Pulled ✓');
    const last = document.getElementById('sync-last-time');
    if (last) last.textContent = 'Last synced: ' + new Date(now).toLocaleString();
    showToast('Pulled ✓');
  } catch(e) {
    errEl.textContent = e.message || 'Pull failed';
    setSyncDotState('error', 'Pull failed');
  }
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
initSyncAuth();
