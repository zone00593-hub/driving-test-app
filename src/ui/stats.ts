import { CATEGORY_NAMES, CONFIG } from '../config';
import { BANK } from '../core/bank';
import { formatClock } from '../core/exam';
import { categoryStats, dayKey, streak, summarize } from '../core/progress';
import type { Attempt } from '../types';
import { formatDateTime, html, mount, Safe } from './dom';
import type { View } from './view';

/** 模擬考分數走勢（最近 20 次）。只有一條線加一條及格線，數值另列在下方表格。 */
function scoreChart(attempts: Attempt[]): Safe {
  const per = CONFIG.exam.pointsPerQuestion;
  const pts = attempts.slice(-20).map((a) => (a.total - a.wrong) * per);
  const max = CONFIG.exam.questions * per;
  const W = 320;
  const H = 120;
  const padX = 8;
  const padY = 10;
  const x = (i: number) => (pts.length === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (pts.length - 1));
  // 縱軸不從 0 開始：分數多半集中在及格線附近，從 0 開始會把線擠在最上面看不出起伏。
  const min = Math.max(0, Math.min(CONFIG.exam.passScore, ...pts) - 10);
  const y = (v: number) => padY + (1 - (Math.min(v, max) - min) / (max - min)) * (H - padY * 2);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const passY = y(CONFIG.exam.passScore).toFixed(1);
  const dots = pts
    .map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" class="${v >= CONFIG.exam.passScore ? 'dot-ok' : 'dot-bad'}"/>`)
    .join('');
  // 這段 SVG 全部由數字組成，沒有外部文字，所以可以直接當作安全的標記。
  return new Safe(
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="最近 ${pts.length} 次模擬考分數走勢，縱軸從 ${min} 到 ${max} 分，虛線是及格線 ${CONFIG.exam.passScore} 分">` +
      `<line x1="0" x2="${W}" y1="${passY}" y2="${passY}" class="pass-line"/>` +
      `<path d="${line}" class="score-line"/>${dots}</svg>`,
  );
}

export const statsView: View = (root, app) => {
  const render = () => {
    const prog = app.store.prog;
    const s = summarize(BANK, prog);
    const cats = categoryStats(BANK, prog);
    const attempts = app.store.attempts;
    const per = CONFIG.exam.pointsPerQuestion;
    const now = Date.now();
    const days = Array.from({ length: 14 }, (_v, i) => {
      const key = dayKey(now - (13 - i) * 86_400_000);
      return { key, n: app.store.activity[key] ?? 0 };
    });
    const maxDay = Math.max(1, ...days.map((d) => d.n));
    const passed = attempts.filter((a) => a.passed).length;

    mount(
      root,
      html`
        <h1 tabindex="-1">統計</h1>

        <section class="card">
          <dl class="tiles">
            <div><dt>已熟</dt><dd>${s.mastered}</dd></div>
            <div><dt>還不會</dt><dd>${s.weak}</dd></div>
            <div><dt>做過</dt><dd>${s.seen} / ${s.total}</dd></div>
            <div><dt>連續天數</dt><dd>${streak(app.store.activity, now)}</dd></div>
          </dl>
        </section>

        <section class="card" aria-labelledby="cat-h">
          <h2 id="cat-h">各架構</h2>
          ${cats.map((c) => {
            const pct = Math.round((c.mastered / c.total) * 100);
            const acc = c.answers ? `${Math.round((c.correct / c.answers) * 100)}%` : '尚無資料';
            return html`<div class="catrow">
              <p class="catname">${CATEGORY_NAMES[c.c]}<span class="muted small">　已熟 ${c.mastered} / ${c.total}・作答正確率 ${acc}</span></p>
              <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${c.total}" aria-valuenow="${c.mastered}" aria-label="${CATEGORY_NAMES[c.c]}已熟題數">
                <span style="width:${pct}%"></span>
              </div>
            </div>`;
          })}
        </section>

        <section class="card" aria-labelledby="day-h">
          <h2 id="day-h">最近 14 天作答題數</h2>
          <div class="daybars" role="img" aria-label="最近 14 天每天的作答題數，今天 ${days[13].n} 題">
            ${days.map((d) => html`<div class="daybar" title="${d.key}：${d.n} 題"><span style="height:${Math.round((d.n / maxDay) * 100)}%"></span></div>`)}
          </div>
          <p class="muted small daylabels"><span>${days[0].key.slice(5)}</span><span>今天 ${days[13].n} 題</span></p>
        </section>

        <section class="card" aria-labelledby="exam-h">
          <h2 id="exam-h">模擬考紀錄</h2>
          ${attempts.length === 0
            ? html`<p class="muted">還沒有考過。<a href="#/exam">去考一份</a>。</p>`
            : html`
                <p>共 ${attempts.length} 次，及格 ${passed} 次。</p>
                ${scoreChart(attempts)}
                <div class="tablewrap">
                  <table>
                    <thead>
                      <tr><th scope="col">時間</th><th scope="col">分數</th><th scope="col">錯題</th><th scope="col">用時</th><th scope="col">結果</th></tr>
                    </thead>
                    <tbody>
                      ${attempts
                        .slice()
                        .reverse()
                        .slice(0, 30)
                        .map(
                          (a) => html`<tr>
                            <td>${formatDateTime(a.at)}</td>
                            <td class="num">${(a.total - a.wrong) * per}</td>
                            <td class="num">${a.wrong}</td>
                            <td class="num">${formatClock(a.seconds)}</td>
                            <td class="${a.passed ? 'ok-text' : 'bad-text'}">${a.passed ? '及格' : '不及格'}</td>
                          </tr>`,
                        )}
                    </tbody>
                  </table>
                </div>
              `}
        </section>
      `,
    );
  };
  render();
  return { refresh: render };
};
