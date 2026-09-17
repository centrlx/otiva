export function formatPrice(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString('ru-RU')} ₸`;
}

export function formatDate(input) {
  const date = input?.toDate ? input.toDate() : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTime(input) {
  const date = input?.toDate ? input.toDate() : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const STOP_WORDS = new Set([
  'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то', 'все',
  'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за', 'бы', 'по', 'от',
  'для', 'или', 'до', 'из', 'о', 'об',
]);

// Разбивает текст на нормализованные токены (леммы упрощённо — только нижний регистр
// и отсечение стоп-слов/коротких слов) для полей searchTokens в Firestore.
export function tokenize(text) {
  if (!text) return [];
  const words = String(text)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return Array.from(new Set(words)).slice(0, 30);
}

export function toast(message, type = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--visible'));
  setTimeout(() => {
    el.classList.remove('toast--visible');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function ratingStars(avg = 0) {
  const rounded = Math.round(Number(avg) || 0);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

export function renderIcons() {
  window.lucide?.createIcons();
}
