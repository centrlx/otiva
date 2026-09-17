import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { mountHeader } from './auth.js';
import { CATEGORIES, CATEGORY_MAP, CITIES, SORT_OPTIONS, PAGE_SIZE } from './constants.js';
import {
  formatPrice, debounce, escapeHtml, tokenize, ratingStars, qs,
  getParam, renderIcons, toast,
} from './utils.js';
import { ensureFavoritesLoaded, isFavorite, toggleFavorite } from './favorites.js';

mountHeader();

const grid = qs('#listing-grid');
const skeletonGrid = qs('#skeleton-grid');
const emptyState = qs('#empty-state');
const loadMoreWrap = qs('#load-more-wrap');
const loadMoreBtn = qs('#load-more-btn');
const resultsTitle = qs('#results-title');
const resultsCount = qs('#results-count');
const liveBanner = qs('#live-banner');
const categoryStrip = qs('#category-strip');

const filtersPanel = qs('#filters');
const filterBackdrop = qs('#filter-backdrop');
const categorySelect = qs('#f-category');
const citySelect = qs('#f-city');
const conditionSelect = qs('#f-condition');
const sortSelect = qs('#f-sort');
const priceMinInput = qs('#f-price-min');
const priceMaxInput = qs('#f-price-max');
const searchInput = qs('#f-search');

categorySelect.insertAdjacentHTML('beforeend', CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join(''));
citySelect.insertAdjacentHTML('beforeend', CITIES.map((c) => `<option value="${c}">${c}</option>`).join(''));
sortSelect.innerHTML = SORT_OPTIONS.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');

// Категории-пилюли над каталогом
categoryStrip.innerHTML = CATEGORIES.map((c) => `
  <button type="button" class="category-pill" data-category="${c.id}">
    <i data-lucide="${c.icon}" class="icon"></i>
    <span>${c.label}</span>
  </button>
`).join('');

function syncCategoryStrip() {
  categoryStrip.querySelectorAll('.category-pill').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.category === categorySelect.value);
  });
}

categoryStrip.addEventListener('click', (e) => {
  const btn = e.target.closest('.category-pill');
  if (!btn) return;
  categorySelect.value = categorySelect.value === btn.dataset.category ? '' : btn.dataset.category;
  syncCategoryStrip();
  loadPage(true);
});

// Предзаполнение из URL (переход из хедера) и локального города
const initialQuery = getParam('q');
const initialCategory = getParam('category');
if (initialQuery) searchInput.value = initialQuery;
if (initialCategory) categorySelect.value = initialCategory;
const savedCity = localStorage.getItem('otiva_city');
if (savedCity) citySelect.value = savedCity;
syncCategoryStrip();

window.addEventListener('otiva:city-changed', (e) => {
  citySelect.value = e.detail || '';
  loadPage(true);
});

let cursor = null;
let loadedDocs = [];
let loading = false;
let hasMore = true;
let requestId = 0;

function currentFilters() {
  return {
    search: searchInput.value.trim(),
    category: categorySelect.value,
    city: citySelect.value,
    condition: conditionSelect.value,
    priceMin: priceMinInput.value ? Number(priceMinInput.value) : null,
    priceMax: priceMaxInput.value ? Number(priceMaxInput.value) : null,
    sort: sortSelect.value,
  };
}

function buildQuery(filters, afterDoc) {
  const clauses = [where('status', '==', 'active')];
  if (filters.category) clauses.push(where('category', '==', filters.category));
  if (filters.city) clauses.push(where('city', '==', filters.city));
  if (filters.condition) clauses.push(where('condition', '==', filters.condition));

  const tokens = filters.search ? tokenize(filters.search).slice(0, 10) : [];

  let orderClauses;
  if (tokens.length) {
    clauses.push(where('searchTokens', 'array-contains-any', tokens));
    orderClauses = [orderBy('createdAt', 'desc')];
  } else if (filters.priceMin != null || filters.priceMax != null) {
    if (filters.priceMin != null) clauses.push(where('price', '>=', filters.priceMin));
    if (filters.priceMax != null) clauses.push(where('price', '<=', filters.priceMax));
    const dir = filters.sort === 'price_desc' ? 'desc' : 'asc';
    orderClauses = [orderBy('price', dir)];
  } else {
    const sortDef = SORT_OPTIONS.find((s) => s.id === filters.sort) || SORT_OPTIONS[0];
    orderClauses = [orderBy(sortDef.field, sortDef.dir)];
  }

  const parts = [collection(db, 'listings'), ...clauses, ...orderClauses, limit(PAGE_SIZE)];
  if (afterDoc) parts.push(startAfter(afterDoc));
  return query(...parts);
}

function listingCardHtml(id, d) {
  const img = d.images?.[0];
  const statusPill = d.status !== 'active'
    ? `<span class="pill pill--${d.status}">${d.status === 'reserved' ? 'Забронировано' : d.status === 'sold' ? 'Продано' : 'В архиве'}</span>`
    : '';
  const fav = isFavorite(id);
  return `
    <a class="listing-card" href="listing.html?id=${id}">
      <div class="listing-card__img">
        ${img ? `
          <div class="photo-frame__bg" style="background-image:url('${escapeHtml(img)}')"></div>
          <img class="photo-frame__img" src="${escapeHtml(img)}" alt="" loading="lazy" onerror="this.remove()" />
        ` : '📷 без фото'}
        <div class="listing-card__status">${statusPill}</div>
        <button type="button" class="favorite-btn ${fav ? 'is-active' : ''}" data-fav="${id}" aria-label="В избранное">
          <i data-lucide="heart" class="icon"></i>
        </button>
      </div>
      <div class="listing-card__body">
        <div class="listing-card__price">${formatPrice(d.price)}</div>
        <div class="listing-card__title">${escapeHtml(d.title)}</div>
        ${d.reviewsCount ? `<span class="stars" title="${d.ratingAvg?.toFixed(1)}">${ratingStars(d.ratingAvg)}</span>` : ''}
        <div class="listing-card__meta">
          <span>${escapeHtml(d.city || '')}</span>
          <span>${escapeHtml(CATEGORY_MAP[d.category] || '')}</span>
        </div>
      </div>
    </a>
  `;
}

function skeletonCardHtml() {
  return `
    <div class="skeleton-card">
      <div class="skeleton skeleton-card__img"></div>
      <div class="skeleton-card__body">
        <div class="skeleton skeleton-line" style="width:60%;"></div>
        <div class="skeleton skeleton-line" style="width:90%;"></div>
        <div class="skeleton skeleton-line" style="width:40%;"></div>
      </div>
    </div>
  `;
}

function attachCardHandlers() {
  grid.querySelectorAll('[data-fav]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.fav;
      const source = loadedDocs.find((d) => d.id === id);
      const active = await toggleFavorite(id, source?.data());
      if (active === null) {
        toast('Войдите, чтобы добавлять в избранное', 'error');
        return;
      }
      btn.classList.toggle('is-active', active);
    });
  });
  renderIcons();
}

async function loadPage(reset) {
  if (loading) return;
  loading = true;
  const myRequest = ++requestId;
  if (reset) {
    cursor = null;
    loadedDocs = [];
    grid.innerHTML = '';
    hasMore = true;
    emptyState.hidden = true;
  }
  skeletonGrid.innerHTML = Array.from({ length: 8 }, skeletonCardHtml).join('');
  loadMoreWrap.hidden = true;

  try {
    const filters = currentFilters();
    const q = buildQuery(filters, cursor);
    const snap = await getDocs(q);
    if (myRequest !== requestId) return; // выбило более новым запросом

    snap.forEach((d) => {
      loadedDocs.push(d);
      grid.insertAdjacentHTML('beforeend', listingCardHtml(d.id, d.data()));
    });
    attachCardHandlers();
    cursor = snap.docs[snap.docs.length - 1] || cursor;
    hasMore = snap.docs.length === PAGE_SIZE;
    loadMoreWrap.hidden = !hasMore;
    emptyState.hidden = loadedDocs.length !== 0;
    resultsCount.textContent = loadedDocs.length
      ? `Показано: ${loadedDocs.length}${hasMore ? '+' : ''}`
      : '';
    resultsTitle.textContent = filters.search ? `Результаты по запросу «${filters.search}»` : 'Все объявления';
  } catch (err) {
    console.error(err);
    grid.insertAdjacentHTML(
      'beforeend',
      `<p class="muted">Не удалось загрузить объявления. Проверьте конфигурацию Firebase (js/firebase-config.js) и требуемые индексы Firestore (см. консоль браузера).</p>`
    );
  } finally {
    skeletonGrid.innerHTML = '';
    loading = false;
  }
}

const debouncedReload = debounce(() => loadPage(true), 350);

searchInput.addEventListener('input', debouncedReload);
[categorySelect, citySelect, conditionSelect, sortSelect].forEach((el) =>
  el.addEventListener('change', () => { syncCategoryStrip(); loadPage(true); })
);
[priceMinInput, priceMaxInput].forEach((el) => el.addEventListener('change', () => loadPage(true)));

qs('#f-reset').addEventListener('click', () => {
  searchInput.value = '';
  categorySelect.value = '';
  citySelect.value = '';
  conditionSelect.value = '';
  priceMinInput.value = '';
  priceMaxInput.value = '';
  sortSelect.value = SORT_OPTIONS[0].id;
  syncCategoryStrip();
  loadPage(true);
});

loadMoreBtn.addEventListener('click', () => loadPage(false));

// Мобильная выдвижная панель фильтров
function openFilters() {
  filtersPanel.classList.add('is-open');
  filterBackdrop.classList.add('is-open');
}
function closeFilters() {
  filtersPanel.classList.remove('is-open');
  filterBackdrop.classList.remove('is-open');
}
qs('#filters-toggle').addEventListener('click', openFilters);
qs('#filters-close').addEventListener('click', closeFilters);
filterBackdrop.addEventListener('click', closeFilters);

ensureFavoritesLoaded().then(() => loadPage(true));
renderIcons();

// Realtime: отслеживаем самые свежие объявления и показываем баннер,
// если появилось что-то новее уже загруженного (без перезагрузки страницы).
const liveQuery = query(
  collection(db, 'listings'),
  where('status', '==', 'active'),
  orderBy('createdAt', 'desc'),
  limit(1)
);
let initialLiveId = null;
onSnapshot(liveQuery, (snap) => {
  const topId = snap.docs[0]?.id;
  if (!topId) return;
  if (initialLiveId === null) {
    initialLiveId = topId;
    return;
  }
  if (topId !== initialLiveId && !loadedDocs.some((d) => d.id === topId)) {
    liveBanner.hidden = false;
  }
});

qs('#live-refresh-btn').addEventListener('click', () => {
  liveBanner.hidden = true;
  initialLiveId = null;
  loadPage(true);
});
