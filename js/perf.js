// Лёгкая обёртка над Performance API — меряет реальное время от запроса до ответа
// Firebase и печатает в консоль браузера. Ничего не ломает: если что-то пошло не так,
// просто не логирует, а не бросает ошибку.

const marks = new Map();
// performance.now() уже отсчитывается от начала навигации (timeOrigin) само по себе —
// раньше здесь дополнительно вычиталось время старта ЭТОГО модуля, из-за чего "с начала
// загрузки страницы" на самом деле показывало "с момента, когда сам perf.js успел
// загрузиться" (а если долго грузился SDK — то и сам perf.js тоже, отсюда странные цифры).

export function perfStart(label) {
  marks.set(label, performance.now());
  try { performance.mark(`${label}-start`); } catch { /* noop */ }
}

export function perfEnd(label, extra = '') {
  const start = marks.get(label);
  if (start == null) return null;
  const duration = performance.now() - start;
  marks.delete(label);
  try {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
  } catch { /* noop */ }
  const sinceLoad = performance.now().toFixed(0);
  console.log(
    `%c⏱ ${label}%c ${duration.toFixed(0)} ms${extra ? ` (${extra})` : ''} — с начала загрузки страницы: ${sinceLoad} ms`,
    'color:#ff5a1f;font-weight:700;',
    'color:inherit;font-weight:600;'
  );
  return duration;
}

// Оборачивает промис (например getDocs(...)) и логирует её длительность автоматически.
export async function perfWrap(label, promise) {
  perfStart(label);
  try {
    const result = await promise;
    perfEnd(label);
    return result;
  } catch (err) {
    perfEnd(label, 'ошибка: ' + err.message);
    throw err;
  }
}

// Сводка по сетевым запросам к Firebase из встроенного Resource Timing API —
// не требует ручных меток, ловит вообще все обращения к googleapis.com на странице.
window.addEventListener('load', () => {
  setTimeout(() => {
    const entries = performance.getEntriesByType('resource')
      .filter((e) => /googleapis\.com|gstatic\.com/.test(e.name));
    if (!entries.length) return;
    console.groupCollapsed(`%c⏱ Сетевые запросы к Firebase/Google (${entries.length})`, 'color:#ff5a1f;font-weight:700;');
    entries
      .sort((a, b) => b.duration - a.duration)
      .forEach((e) => {
        const short = e.name.replace(/^https?:\/\//, '').slice(0, 90);
        console.log(`${e.duration.toFixed(0)} ms — ${short}`);
      });
    console.groupEnd();
  }, 500);
});
