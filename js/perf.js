const marks = new Map();

export function perfStart(label) {
  marks.set(label, performance.now());
  try { performance.mark(`${label}-start`); } catch {}
}

export function perfEnd(label, extra = '') {
  const start = marks.get(label);
  if (start == null) return null;
  const duration = performance.now() - start;
  marks.delete(label);
  try {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
  } catch {}
  const sinceLoad = performance.now().toFixed(0);
  console.log(
    `%c⏱ ${label}%c ${duration.toFixed(0)} ms${extra ? ` (${extra})` : ''} — с начала загрузки страницы: ${sinceLoad} ms`,
    'color:#ff5a1f;font-weight:700;',
    'color:inherit;font-weight:600;'
  );
  return duration;
}

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
