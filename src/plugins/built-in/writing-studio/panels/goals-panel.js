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
  label.textContent = progress.written.toLocaleString() + ' / ' + dailyGoal.toLocaleString() + ' words';
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
  const maxWords = Math.max(...last30.map(d => d.words), 1);
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

  container.appendChild(panel);
}

module.exports = { renderGoalsPanel };
