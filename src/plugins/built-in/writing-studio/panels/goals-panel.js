function renderGoalsPanel(container, { engines, settings }) {
  const dailyGoal = settings.get('dailyGoal') || 1000;
  const progress = engines.goals.getDailyProgress(dailyGoal);
  const streak = engines.goals.getStreak(dailyGoal);
  const weekly = engines.goals.getWeeklyTotal();
  const last30 = engines.goals.getLast30Days();

  container.replaceChildren();

  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  // Daily progress section
  const section1 = document.createElement('div');
  section1.className = 'ws-section';
  const heading1 = document.createElement('h3');
  heading1.className = 'ws-heading';
  heading1.textContent = 'Daily Progress';
  section1.appendChild(heading1);

  const bar = document.createElement('div');
  bar.className = 'ws-progress-bar';
  const fill = document.createElement('div');
  fill.className = 'ws-progress-fill';
  fill.style.width = progress.pct + '%';
  bar.appendChild(fill);
  section1.appendChild(bar);

  const row = document.createElement('div');
  row.className = 'ws-stat-row';
  const label = document.createElement('span');
  label.textContent =
    progress.written.toLocaleString() + ' / ' + dailyGoal.toLocaleString() + ' words';
  const pct = document.createElement('span');
  pct.className = 'ws-pct';
  pct.textContent = progress.pct + '%';
  row.appendChild(label);
  row.appendChild(pct);
  section1.appendChild(row);
  panel.appendChild(section1);

  // Stats cards
  const section2 = document.createElement('div');
  section2.className = 'ws-section';
  const grid = document.createElement('div');
  grid.className = 'ws-stat-grid';

  const streakCard = document.createElement('div');
  streakCard.className = 'ws-stat-card';
  const streakVal = document.createElement('span');
  streakVal.className = 'ws-stat-value';
  streakVal.textContent = String(streak);
  const streakLbl = document.createElement('span');
  streakLbl.className = 'ws-stat-label';
  streakLbl.textContent = 'Day Streak';
  streakCard.appendChild(streakVal);
  streakCard.appendChild(streakLbl);

  const weekCard = document.createElement('div');
  weekCard.className = 'ws-stat-card';
  const weekVal = document.createElement('span');
  weekVal.className = 'ws-stat-value';
  weekVal.textContent = weekly.toLocaleString();
  const weekLbl = document.createElement('span');
  weekLbl.className = 'ws-stat-label';
  weekLbl.textContent = 'This Week';
  weekCard.appendChild(weekVal);
  weekCard.appendChild(weekLbl);

  grid.appendChild(streakCard);
  grid.appendChild(weekCard);
  section2.appendChild(grid);
  panel.appendChild(section2);

  // 30-day chart
  const section3 = document.createElement('div');
  section3.className = 'ws-section';
  const heading3 = document.createElement('h3');
  heading3.className = 'ws-heading';
  heading3.textContent = 'Last 30 Days';
  section3.appendChild(heading3);

  const chart = document.createElement('div');
  chart.className = 'ws-chart';
  const maxWords = Math.max(...last30.map((d) => d.words), 1);
  for (const day of last30) {
    const barEl = document.createElement('div');
    const height = Math.max(2, (day.words / maxWords) * 60);
    barEl.className = 'ws-bar' + (day.words >= dailyGoal ? ' ws-bar-met' : '');
    barEl.style.height = height + 'px';
    barEl.title = day.date + ': ' + day.words + ' words';
    chart.appendChild(barEl);
  }
  section3.appendChild(chart);
  panel.appendChild(section3);

  // GitHub-style activity heatmap over the same 30-day window: intensity is
  // relative to the daily goal (empty / <33% / <66% / <100% / goal met).
  const section4 = document.createElement('div');
  section4.className = 'ws-section';
  const heading4 = document.createElement('h3');
  heading4.className = 'ws-heading';
  heading4.textContent = 'Writing Heatmap';
  section4.appendChild(heading4);

  const heatmap = document.createElement('div');
  heatmap.className = 'ws-heatmap';
  heatmap.setAttribute('role', 'img');
  heatmap.setAttribute('aria-label', 'Daily writing activity over the last 30 days');
  for (const day of last30) {
    const cell = document.createElement('span');
    cell.className = 'ws-heatmap-cell ' + heatLevel(day.words, dailyGoal);
    cell.title = `${day.date}: ${day.words} words${day.words >= dailyGoal ? ' — goal met' : ''}`;
    heatmap.appendChild(cell);
  }
  section4.appendChild(heatmap);
  panel.appendChild(section4);

  container.appendChild(panel);
}

/**
 * Map a day's word count to a heatmap intensity class (l0 implicit…l4).
 * @param {number} words words written that day
 * @param {number} goal daily goal
 * @returns {string} class suffix ('' for empty days)
 */
function heatLevel(words, goal) {
  if (!words || words <= 0) return '';
  const ratio = words / Math.max(1, goal);
  if (ratio >= 1) return 'l4';
  if (ratio >= 0.66) return 'l3';
  if (ratio >= 0.33) return 'l2';
  return 'l1';
}

module.exports = { renderGoalsPanel };
