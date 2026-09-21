import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { mountHeader, requireAuth, refreshProfile, logoutUser } from './auth.js';
import { CITIES, LISTING_STATUS, HISTORY_STATUS } from './constants.js';
import {
  formatPrice, formatDate, formatDateTime, escapeHtml, ratingStars, toast, qs, renderIcons,
} from './utils.js';
import { ensureFavoritesLoaded, toggleFavorite } from './favorites.js';
import { confirmModal } from './modal.js';

mountHeader();

const auth = await requireAuth();
if (!auth) throw new Error('redirecting to auth');
const { user, profile } = auth;

qs('#hero-sub').textContent = `${profile?.displayName || user.email} · роль: ${profile?.role === 'admin' ? 'администратор' : 'пользователь'}`;
qs('#p-cities').innerHTML = CITIES.map((c) => `<option value="${c}"></option>`).join('');
qs('#p-name').value = profile?.displayName || '';
qs('#p-city').value = profile?.city || '';
qs('#p-phone').value = profile?.phone || '';
qs('#p-email').value = user.email;

qs('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = qs('#profile-msg');
  try {
    await updateDoc(doc(db, 'users', user.uid), {
      displayName: qs('#p-name').value.trim(),
      city: qs('#p-city').value.trim(),
      phone: qs('#p-phone').value.trim(),
    });
    await refreshProfile();
    msg.textContent = 'Сохранено!';
    toast('Профиль обновлён', 'success');
  } catch (err) {
    msg.textContent = 'Ошибка: ' + err.message;
  }
});

qs('#logout-btn').addEventListener('click', async () => {
  await logoutUser();
  window.location.href = 'index.html';
});

const tabs = document.querySelectorAll('.tab');
const panels = {
  listings: qs('#listings-panel'),
  favorites: qs('#favorites-panel'),
  history: qs('#history-panel'),
  reviews: qs('#reviews-panel'),
};
const loaders = { favorites: loadFavorites, history: loadHistory, reviews: loadReviews };
const loaded = {};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== tab.dataset.tab; });
    const key = tab.dataset.tab;
    if (!loaded[key] && loaders[key]) { loaded[key] = true; loaders[key](); }
  });
});

// ---------- Мои объявления (realtime) ----------

const myListingsQuery = query(collection(db, 'listings'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50));
onSnapshot(myListingsQuery, (snap) => {
  if (snap.empty) {
    panels.listings.innerHTML = `<div class="empty-state"><h3>У вас пока нет объявлений</h3><a class="btn btn-primary" href="listing-form.html">Разместить первое</a></div>`;
    return;
  }
  panels.listings.innerHTML = snap.docs.map((d) => listingRow(d.id, d.data())).join('');
  panels.listings.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmModal('Удалить объявление?'))) return;
      await deleteDoc(doc(db, 'listings', btn.dataset.delete));
      toast('Удалено', 'success');
    });
  });
});

function listingRow(id, d) {
  return `
    <div class="mini-row">
      <div class="mini-row__img" style="${d.images?.[0] ? `background-image:url('${escapeHtml(d.images[0])}')` : ''}"></div>
      <div class="mini-row__body">
        <div class="mini-row__title"><a href="listing.html?id=${id}">${escapeHtml(d.title)}</a></div>
        <div class="mini-row__meta">${formatPrice(d.price)} · ${formatDate(d.createdAt)}</div>
        <span class="pill pill--${d.status}">${LISTING_STATUS[d.status] || d.status}</span>
      </div>
      <div class="mini-row__actions">
        <a class="btn btn-ghost btn-sm" href="listing-form.html?id=${id}">Изменить</a>
        <button class="btn btn-ghost btn-sm" data-delete="${id}" type="button">Удалить</button>
      </div>
    </div>
  `;
}

// ---------- Избранное (Firestore: users/{uid}/favorites, денормализовано) ----------

async function loadFavorites() {
  panels.favorites.innerHTML = '<div class="loader">Загрузка…</div>';
  // Не await — идёт параллельно с запросом ниже, нужен только к моменту клика «Убрать».
  const favCachePromise = ensureFavoritesLoaded();
  const snap = await getDocs(query(collection(db, 'users', user.uid, 'favorites'), orderBy('createdAt', 'desc'), limit(50)));
  await favCachePromise;
  if (snap.empty) {
    panels.favorites.innerHTML = `<div class="empty-state"><h3>Список избранного пуст</h3><a class="btn btn-primary" href="index.html">Перейти в каталог</a></div>`;
    return;
  }
  panels.favorites.innerHTML = snap.docs
    .map((d) => {
      const f = d.data();
      return `
        <div class="mini-row">
          <div class="mini-row__img" style="${f.listingImage ? `background-image:url('${escapeHtml(f.listingImage)}')` : ''}"></div>
          <div class="mini-row__body">
            <div class="mini-row__title"><a href="listing.html?id=${f.listingId}">${escapeHtml(f.listingTitle)}</a></div>
            <div class="mini-row__meta">${formatPrice(f.listingPrice)} · ${escapeHtml(f.city || '')}</div>
            <span class="pill pill--${f.listingStatus}">${LISTING_STATUS[f.listingStatus] || f.listingStatus}</span>
          </div>
          <div class="mini-row__actions">
            <button class="btn btn-ghost btn-sm" data-unfav="${f.listingId}" type="button">
              <i data-lucide="heart-off" class="icon" style="width:15px;height:15px;"></i>
              Убрать
            </button>
          </div>
        </div>
      `;
    })
    .join('');
  panels.favorites.querySelectorAll('[data-unfav]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await toggleFavorite(btn.dataset.unfav);
      btn.closest('.mini-row').remove();
      if (!panels.favorites.children.length) loadFavorites();
    });
  });
  renderIcons();
}

// ---------- История ----------

async function loadHistory() {
  panels.history.innerHTML = '<div class="loader">Загрузка…</div>';
  const [asRequester, asOwner] = await Promise.all([
    getDocs(query(collection(db, 'history'), where('requesterId', '==', user.uid), orderBy('finishedAt', 'desc'), limit(50))),
    getDocs(query(collection(db, 'history'), where('ownerId', '==', user.uid), orderBy('finishedAt', 'desc'), limit(50))),
  ]);
  const merged = new Map();
  [...asRequester.docs, ...asOwner.docs].forEach((d) => merged.set(d.id, d.data()));
  const items = Array.from(merged.values()).sort((a, b) => (b.finishedAt?.toMillis?.() || 0) - (a.finishedAt?.toMillis?.() || 0));
  if (!items.length) {
    panels.history.innerHTML = `<div class="empty-state"><h3>История пуста</h3></div>`;
    return;
  }
  panels.history.innerHTML = items
    .map((h) => `
      <div class="mini-row">
        <div class="mini-row__img" style="${h.listingImage ? `background-image:url('${escapeHtml(h.listingImage)}')` : ''}"></div>
        <div class="mini-row__body">
          <div class="mini-row__title"><a href="listing.html?id=${h.listingId}">${escapeHtml(h.listingTitle)}</a></div>
          <div class="mini-row__meta">
            ${formatPrice(h.listingPrice)} · ${h.requesterId === user.uid ? 'как покупатель' : 'как продавец'} · ${formatDateTime(h.finishedAt)}
          </div>
          <span class="pill pill--${h.status}">${HISTORY_STATUS[h.status] || h.status}</span>
        </div>
      </div>
    `)
    .join('');
}

// ---------- Мои отзывы ----------

async function loadReviews() {
  panels.reviews.innerHTML = '<div class="loader">Загрузка…</div>';
  try {
    const snap = await getDocs(query(collectionGroup(db, 'reviews'), where('authorId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50)));
    if (snap.empty) {
      panels.reviews.innerHTML = `<div class="empty-state"><h3>Вы ещё не оставляли отзывы</h3></div>`;
      return;
    }
    panels.reviews.innerHTML = snap.docs
      .map((d) => {
        const r = d.data();
        const listingId = d.ref.parent.parent.id;
        return `
          <div class="mini-row" data-path="${d.ref.path}">
            <div class="mini-row__body">
              <div class="mini-row__title"><a href="listing.html?id=${listingId}">Отзыв на объявление</a></div>
              <div class="stars">${ratingStars(r.rating)}</div>
              <div class="mini-row__meta">${escapeHtml(r.text)}</div>
              <div class="mini-row__meta">${formatDateTime(r.createdAt)}</div>
            </div>
            <div class="mini-row__actions">
              <button class="btn btn-ghost btn-sm" data-delete-review="${d.ref.path}" type="button">Удалить</button>
            </div>
          </div>
        `;
      })
      .join('');
    panels.reviews.querySelectorAll('[data-delete-review]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmModal('Удалить отзыв?'))) return;
        await deleteDoc(doc(db, btn.dataset.deleteReview));
        btn.closest('.mini-row').remove();
        toast('Отзыв удалён', 'success');
      });
    });
  } catch (err) {
    panels.reviews.innerHTML = `<p class="muted">Не удалось загрузить отзывы. Возможно, нужен составной индекс Firestore (см. консоль браузера).</p>`;
  }
}
