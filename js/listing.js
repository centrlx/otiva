import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { mountHeader, authReady, getCurrentUser, getCurrentProfile } from './auth.js';
import { CATEGORY_MAP, CONDITION_MAP, LISTING_STATUS, RELATED_PAGE_SIZE } from './constants.js';
import {
  formatPrice, formatDate, formatDateTime, escapeHtml, ratingStars, toast, qs, getParam,
  renderIcons,
} from './utils.js';
import { ensureFavoritesLoaded, isFavorite, toggleFavorite } from './favorites.js';
import { confirmModal } from './modal.js';
import { openOrCreateChat } from './chat.js';

mountHeader();

const listingId = getParam('id');
if (!listingId) {
  window.location.href = 'index.html';
}

const els = {
  loader: qs('#listing-loader'),
  notFound: qs('#listing-not-found'),
  content: qs('#listing-content'),
  gallery: qs('#gallery'),
  statusPill: qs('#listing-status-pill'),
  date: qs('#listing-date'),
  title: qs('#listing-title'),
  price: qs('#listing-price'),
  tags: qs('#listing-tags'),
  description: qs('#listing-description'),
  ownerAvatar: qs('#owner-avatar'),
  ownerName: qs('#owner-name'),
  ownerCity: qs('#owner-city'),
  actionArea: qs('#action-area'),
  reviewsCount: qs('#reviews-count'),
  reviewFormWrap: qs('#review-form-wrap'),
  reviewsList: qs('#reviews-list'),
  relatedGrid: qs('#related-grid'),
  relatedMoreWrap: qs('#related-more-wrap'),
  relatedMoreBtn: qs('#related-more-btn'),
};

let listingData = null;
let ownerProfile = null;
let myReviewCache = null;
let reviewFormInitialized = false;

await authReady();
await ensureFavoritesLoaded();
watchListing();

function watchListing() {
  const ref = doc(db, 'listings', listingId);
  onSnapshot(ref, async (snap) => {
    if (!snap.exists()) {
      els.loader.hidden = true;
      els.notFound.hidden = false;
      return;
    }
    const wasFirstLoad = listingData === null;
    listingData = { id: snap.id, ...snap.data() };
    if (wasFirstLoad) {
      ownerProfile = await getDoc(doc(db, 'users', listingData.ownerId)).then((s) => (s.exists() ? s.data() : null));
      loadRelated(true);
      watchReviews();
    }
    render();
    els.loader.hidden = true;
    els.content.hidden = false;
  });
}

function render() {
  const d = listingData;
  els.statusPill.textContent = LISTING_STATUS[d.status] || d.status;
  els.statusPill.className = `pill pill--${d.status}`;
  els.date.textContent = 'Опубликовано ' + formatDate(d.createdAt);
  els.title.textContent = d.title;
  els.price.textContent = formatPrice(d.price);
  els.description.textContent = d.description;

  els.tags.innerHTML = [
    `<span class="tag">${escapeHtml(CATEGORY_MAP[d.category] || d.category)}</span>`,
    `<span class="tag">${escapeHtml(CONDITION_MAP[d.condition] || d.condition)}</span>`,
    `<span class="tag">${escapeHtml(d.city || '')}</span>`,
    ...(d.tags || []).map((t) => `<span class="tag">#${escapeHtml(t)}</span>`),
  ].join('');

  const images = d.images?.length ? d.images : [];
  els.gallery.innerHTML = images.length
    ? `<div class="photo-frame__bg" style="background-image:url('${escapeHtml(images[0])}')"></div>
       <img class="photo-frame__img" src="${escapeHtml(images[0])}" alt="${escapeHtml(d.title)}" onerror="this.remove()" />`
    : '📷 Фото не добавлено';

  els.ownerAvatar.textContent = (d.ownerName || '?').slice(0, 1).toUpperCase();
  els.ownerName.textContent = d.ownerName || 'Продавец';
  els.ownerCity.textContent = ownerProfile?.city || d.city || '';

  renderActionArea();
  syncFavoriteButton();
  renderIcons();
}

function syncFavoriteButton() {
  const btn = qs('#favorite-toggle-btn');
  const label = qs('#favorite-toggle-label');
  if (!btn) return;
  const active = isFavorite(listingId);
  btn.classList.toggle('is-active', active);
  label.textContent = active ? 'В избранном' : 'В избранное';
}

qs('#favorite-toggle-btn')?.addEventListener('click', async () => {
  const active = await toggleFavorite(listingId, listingData);
  if (active === null) {
    toast('Войдите, чтобы добавлять в избранное', 'error');
    return;
  }
  syncFavoriteButton();
});

function renderActionArea() {
  const user = getCurrentUser();
  const profile = getCurrentProfile();
  const d = listingData;
  const isOwner = user && user.uid === d.ownerId;
  const isAdmin = profile?.role === 'admin';
  let html = '';

  if (isOwner || isAdmin) {
    html += `
      <div class="owner-controls">
        ${isOwner ? `<a class="btn btn-ghost btn-block" href="listing-form.html?id=${d.id}">Редактировать</a>` : ''}
        <label class="field" style="margin-top:10px;">
          <span class="muted">Статус объявления</span>
          <select id="status-select">
            ${Object.entries(LISTING_STATUS).map(([k, v]) => `<option value="${k}" ${k === d.status ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </label>
        <button class="btn btn-danger btn-block btn-sm" id="delete-listing-btn" type="button">Удалить объявление</button>
      </div>
    `;
  } else if (!user) {
    html += `<a class="btn btn-primary btn-block" href="auth.html?redirect=${encodeURIComponent(location.pathname + location.search)}">Войдите, чтобы написать продавцу</a>`;
  } else if (d.status !== 'active') {
    html += `<button class="btn btn-block" disabled>Недоступно (${LISTING_STATUS[d.status]})</button>`;
  } else {
    html += `
      <button class="btn btn-primary btn-block" id="chat-btn" type="button">
        <i data-lucide="message-circle" class="icon" style="width:16px;height:16px;"></i>
        Написать продавцу
      </button>
    `;
  }

  els.actionArea.innerHTML = html;
  renderIcons();

  if (isOwner || isAdmin) {
    qs('#status-select', els.actionArea)?.addEventListener('change', async (e) => {
      try {
        await updateDoc(doc(db, 'listings', d.id), { status: e.target.value, updatedAt: serverTimestamp() });
        toast('Статус обновлён', 'success');
      } catch (err) {
        toast('Ошибка: ' + err.message, 'error');
      }
    });
    qs('#delete-listing-btn', els.actionArea)?.addEventListener('click', async () => {
      if (!(await confirmModal('Удалить объявление безвозвратно?'))) return;
      try {
        await deleteDoc(doc(db, 'listings', d.id));
        toast('Объявление удалено', 'success');
        window.location.href = 'index.html';
      } catch (err) {
        toast('Ошибка: ' + err.message, 'error');
      }
    });
  } else if (user && d.status === 'active') {
    qs('#chat-btn', els.actionArea)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const chatId = await openOrCreateChat(d);
        window.location.href = `messages.html?chat=${chatId}`;
      } catch (err) {
        toast('Ошибка: ' + err.message, 'error');
        btn.disabled = false;
      }
    });
  }
}

// ---------- Отзывы ----------

function watchReviews() {
  const q = query(collection(db, 'listings', listingId, 'reviews'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap) => {
    const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    els.reviewsCount.textContent = reviews.length ? `(${reviews.length})` : '';
    renderReviews(reviews);
    syncListingRating(reviews);
  });
}

function renderReviews(reviews) {
  const user = getCurrentUser();
  const profile = getCurrentProfile();
  myReviewCache = user ? reviews.find((r) => r.authorId === user.uid) || null : null;
  if (!reviewFormInitialized) {
    reviewFormInitialized = true;
    renderReviewForm();
  }
  if (!reviews.length) {
    els.reviewsList.innerHTML = '<p class="muted">Пока нет отзывов. Будьте первым!</p>';
    return;
  }
  els.reviewsList.innerHTML = reviews
    .map((r) => {
      const canManage = user && (user.uid === r.authorId || profile?.role === 'admin');
      return `
        <div class="review-item" data-id="${r.id}">
          <div class="review-item__head">
            <span class="review-item__name">${escapeHtml(r.authorName)}</span>
            <span class="muted">${formatDateTime(r.createdAt)}</span>
          </div>
          <div class="stars">${ratingStars(r.rating)}</div>
          <p>${escapeHtml(r.text)}</p>
          ${canManage ? `
            <div class="review-item__actions">
              ${user.uid === r.authorId ? `<button class="btn btn-ghost btn-sm review-edit-btn" type="button">Изменить</button>` : ''}
              <button class="btn btn-ghost btn-sm review-delete-btn" type="button">Удалить</button>
            </div>` : ''}
        </div>
      `;
    })
    .join('');

  els.reviewsList.querySelectorAll('.review-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.review-item').dataset.id;
      if (!(await confirmModal('Удалить отзыв?'))) return;
      await deleteDoc(doc(db, 'listings', listingId, 'reviews', id));
      renderReviewForm();
    });
  });
  els.reviewsList.querySelectorAll('.review-edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.review-item');
      const id = item.dataset.id;
      const review = reviews.find((r) => r.id === id);
      renderReviewForm(review);
      window.scrollTo({ top: els.reviewFormWrap.offsetTop - 90, behavior: 'smooth' });
    });
  });
}

function starPickerHtml(value) {
  return `
    <div class="star-picker" id="review-star-picker" data-value="${value}">
      ${[1, 2, 3, 4, 5].map((n) => `
        <button type="button" class="star-picker__btn ${n <= value ? 'is-filled' : ''}" data-star="${n}" aria-label="${n} из 5">
          <i data-lucide="star" class="icon"></i>
        </button>
      `).join('')}
    </div>
  `;
}

function wireStarPicker() {
  const picker = qs('#review-star-picker', els.reviewFormWrap);
  if (!picker) return;
  const paint = (value) => {
    picker.querySelectorAll('.star-picker__btn').forEach((b) => {
      b.classList.toggle('is-filled', Number(b.dataset.star) <= value);
    });
  };
  picker.querySelectorAll('.star-picker__btn').forEach((b) => {
    b.addEventListener('click', () => {
      picker.dataset.value = b.dataset.star;
      paint(Number(b.dataset.star));
    });
    b.addEventListener('mouseenter', () => paint(Number(b.dataset.star)));
  });
  picker.addEventListener('mouseleave', () => paint(Number(picker.dataset.value)));
}

// editing !== null — открыта форма редактирования (кнопка «Изменить»).
// Без аргумента функция сама решает: если у пользователя уже есть отзыв (myReviewCache),
// показывает компактную подсказку вместо формы — оставить второй отзыв нельзя.
function renderReviewForm(editing = null) {
  const user = getCurrentUser();
  const profile = getCurrentProfile();
  if (!user) {
    els.reviewFormWrap.innerHTML = `<p class="muted">Войдите, чтобы оставить отзыв.</p>`;
    return;
  }
  if (user.uid === listingData?.ownerId) {
    els.reviewFormWrap.innerHTML = `<p class="muted">Вы не можете оставить отзыв на своё объявление.</p>`;
    return;
  }
  if (!editing && myReviewCache) {
    els.reviewFormWrap.innerHTML = `
      <div class="flex-between gap-8">
        <span class="muted">Вы уже оставили отзыв на это объявление.</span>
        <button type="button" class="btn btn-ghost btn-sm" id="edit-my-review-btn">Изменить мой отзыв</button>
      </div>
    `;
    qs('#edit-my-review-btn', els.reviewFormWrap).addEventListener('click', () => renderReviewForm(myReviewCache));
    return;
  }

  const initialRating = editing?.rating || 5;
  els.reviewFormWrap.innerHTML = `
    <form id="review-form" class="review-form">
      <div class="field">
        <label>Оценка</label>
        ${starPickerHtml(initialRating)}
      </div>
      <div class="field">
        <textarea id="review-text" rows="2" placeholder="Поделитесь впечатлением…" required>${escapeHtml(editing?.text || '')}</textarea>
      </div>
      <div class="flex-between gap-8">
        <button class="btn btn-primary btn-sm" type="submit">${editing ? 'Сохранить изменения' : 'Отправить отзыв'}</button>
        ${editing ? `<button type="button" class="btn btn-ghost btn-sm" id="cancel-review-edit-btn">Отмена</button>` : ''}
      </div>
    </form>
  `;
  wireStarPicker();
  qs('#cancel-review-edit-btn', els.reviewFormWrap)?.addEventListener('click', () => renderReviewForm());
  qs('#review-form', els.reviewFormWrap).addEventListener('submit', async (e) => {
    e.preventDefault();
    const rating = Number(qs('#review-star-picker', els.reviewFormWrap).dataset.value);
    const text = qs('#review-text', els.reviewFormWrap).value.trim();
    if (!text) return;
    try {
      // Id документа отзыва = uid автора — гарантирует не более одного отзыва на человека
      // на уровне базы (и Firestore Rules), а не только клиентской проверкой.
      await setDoc(doc(db, 'listings', listingId, 'reviews', user.uid), {
        authorId: user.uid,
        authorName: profile?.displayName || user.email,
        rating,
        text,
        createdAt: editing?.createdAt || serverTimestamp(),
      });
      toast('Отзыв сохранён', 'success');
      renderReviewForm();
    } catch (err) {
      toast('Ошибка: ' + err.message, 'error');
    }
  });
  renderIcons();
}

async function syncListingRating(reviews) {
  if (!listingData) return;
  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / count : 0;
  const rounded = Math.round(avg * 10) / 10;
  if (listingData.reviewsCount === count && listingData.ratingAvg === rounded) return;
  try {
    await updateDoc(doc(db, 'listings', listingId), { ratingAvg: rounded, reviewsCount: count });
  } catch (err) {
    // могут не совпасть права, если это не автор изменения — безопасно игнорируем
  }
}

// ---------- Похожие объявления ----------

let relatedCursor = null;
let relatedItemsById = {};

async function loadRelated(reset) {
  if (reset) {
    els.relatedGrid.innerHTML = '';
    relatedCursor = null;
    relatedItemsById = {};
  }
  const clauses = [
    where('status', '==', 'active'),
    where('category', '==', listingData.category),
  ];
  const parts = [collection(db, 'listings'), ...clauses, orderBy('createdAt', 'desc'), limit(RELATED_PAGE_SIZE)];
  if (relatedCursor) parts.push(startAfter(relatedCursor));
  const snap = await getDocs(query(...parts));
  relatedCursor = snap.docs[snap.docs.length - 1] || relatedCursor;
  let added = 0;
  snap.forEach((d) => {
    if (d.id === listingId) return;
    added += 1;
    const item = d.data();
    relatedItemsById[d.id] = item;
    const fav = isFavorite(d.id);
    els.relatedGrid.insertAdjacentHTML(
      'beforeend',
      `<a class="listing-card" href="listing.html?id=${d.id}">
        <div class="listing-card__img">
          ${item.images?.[0] ? `
            <div class="photo-frame__bg" style="background-image:url('${escapeHtml(item.images[0])}')"></div>
            <img class="photo-frame__img" src="${escapeHtml(item.images[0])}" alt="" loading="lazy" onerror="this.remove()" />
          ` : '📷'}
          <button type="button" class="favorite-btn ${fav ? 'is-active' : ''}" data-fav="${d.id}" aria-label="В избранное">
            <i data-lucide="heart" class="icon"></i>
          </button>
        </div>
        <div class="listing-card__body">
          <div class="listing-card__price">${formatPrice(item.price)}</div>
          <div class="listing-card__title">${escapeHtml(item.title)}</div>
        </div>
      </a>`
    );
  });
  els.relatedGrid.querySelectorAll('[data-fav]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.fav;
      const active = await toggleFavorite(id, relatedItemsById[id]);
      if (active === null) {
        toast('Войдите, чтобы добавлять в избранное', 'error');
        return;
      }
      btn.classList.toggle('is-active', active);
    });
  });
  els.relatedMoreWrap.hidden = snap.docs.length < RELATED_PAGE_SIZE;
  if (!added && !els.relatedGrid.children.length) {
    els.relatedGrid.innerHTML = '<p class="muted">Похожих объявлений пока нет.</p>';
  }
  renderIcons();
}

els.relatedMoreBtn.addEventListener('click', () => loadRelated(false));
