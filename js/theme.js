import { renderIcons } from './utils.js';

const KEY = 'otiva_theme';
const LABELS = { light: 'Светлая', dark: 'Тёмная', system: 'Системная' };
const ICONS = { light: 'sun', dark: 'moon', system: 'monitor' };
const ORDER = ['light', 'dark', 'system'];

export function getTheme() {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(value) {
  const root = document.documentElement;
  if (value === 'light' || value === 'dark') root.setAttribute('data-theme', value);
  else root.removeAttribute('data-theme');
}

export function setTheme(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // localStorage недоступен — тема применится только на текущую загрузку
  }
  applyTheme(value);
}

let outsideClickBound = false;

// Рисует кнопку-иконку в хедере, которая открывает попап выбора темы (как в GitHub).
export function mountThemeSwitcher(host) {
  const current = getTheme();
  host.innerHTML = `
    <div class="theme-switcher">
      <button type="button" class="header-icon-link" id="theme-toggle-btn" aria-haspopup="true" aria-label="Тема оформления" title="Тема оформления">
        <i data-lucide="${ICONS[current]}" class="icon"></i>
      </button>
      <div class="theme-menu" id="theme-menu" hidden role="menu">
        ${ORDER.map((v) => `
          <button type="button" class="theme-menu__item ${v === current ? 'is-active' : ''}" data-theme-choice="${v}" role="menuitemradio" aria-checked="${v === current}">
            <i data-lucide="${ICONS[v]}" class="icon"></i>
            <span>${LABELS[v]}</span>
            ${v === current ? '<i data-lucide="check" class="icon theme-menu__check"></i>' : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `;

  const btn = host.querySelector('#theme-toggle-btn');
  const menu = host.querySelector('#theme-menu');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });

  menu.querySelectorAll('[data-theme-choice]').forEach((item) => {
    item.addEventListener('click', () => {
      setTheme(item.dataset.themeChoice);
      mountThemeSwitcher(host);
    });
  });

  if (!outsideClickBound) {
    outsideClickBound = true;
    document.addEventListener('click', () => {
      document.getElementById('theme-menu')?.setAttribute('hidden', '');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.getElementById('theme-menu')?.setAttribute('hidden', '');
    });
  }

  renderIcons();
}
