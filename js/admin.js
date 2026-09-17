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
  writeBatch,
  serverTimestamp,
  getCountFromServer,
  getAggregateFromServer,
  average,
  sum,
  addDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { mountHeader, requireAdmin } from './auth.js';
import { CATEGORIES, CITIES, LISTING_STATUS, CHAT_STATUS } from './constants.js';
import { formatPrice, formatDate, formatDateTime, escapeHtml, debounce, toast, qs, renderIcons } from './utils.js';
import { confirmModal } from './modal.js';

mountHeader();

const adminAuth = await requireAdmin();
if (!adminAuth) throw new Error('redirecting');

const tabs = document.querySelectorAll('.tab');
const panels = {
  listings: qs('#listings-panel'),
  users: qs('#users-panel'),
  chats: qs('#chats-panel'),
  reviews: qs('#reviews-panel'),
  stats: qs('#stats-panel'),
};
const loaders = {
  listings: loadListings,
  users: loadUsers,
  chats: loadChats,
  reviews: loadReviews,
  stats: loadStats,
};
const loaded = {};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== tab.dataset.tab; });
    const key = tab.dataset.tab;
    if (!loaded[key]) { loaded[key] = true; loaders[key](); }
  });
});

loadListings();
loaded.listings = true;

// ---------- Объявления ----------

let allListings = [];

async function loadListings() {
  const host = qs('#listings-table');
  host.innerHTML = '<div class="loader">Загрузка…</div>';
  const snap = await getDocs(query(collection(db, 'listings'), orderBy('createdAt', 'desc'), limit(300)));
  allListings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderListingsTable(allListings);
}

function renderListingsTable(items) {
  const host = qs('#listings-table');
  if (!items.length) { host.innerHTML = '<div class="empty-state"><h3>Объявлений нет</h3></div>'; return; }
  host.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Название</th><th>Категория</th><th>Цена</th><th>Город</th><th>Владелец</th><th>Статус</th><th>Дата</th><th></th></tr></thead>
      <tbody>
        ${items.map((d) => `
          <tr data-id="${d.id}">
            <td><a href="listing.html?id=${d.id}">${escapeHtml(d.title)}</a></td>
            <td>${escapeHtml(CATEGORIES.find((c) => c.id === d.category)?.label || d.category)}</td>
            <td>${formatPrice(d.price)}</td>
            <td>${escapeHtml(d.city || '')}</td>
            <td>${escapeHtml(d.ownerName || '')}</td>
            <td>
              <select data-status="${d.id}">
                ${Object.entries(LISTING_STATUS).map(([k, v]) => `<option value="${k}" ${k === d.status ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </td>
            <td>${formatDate(d.createdAt)}</td>
            <td><button class="btn btn-ghost btn-sm" data-delete="${d.id}" type="button">Удалить</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  host.querySelectorAll('[data-status]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await updateDoc(doc(db, 'listings', sel.dataset.status), { status: sel.value, updatedAt: serverTimestamp() });
        toast('Статус обновлён', 'success');
      } catch (err) { toast('Ошибка: ' + err.message, 'error'); }
    });
  });
  host.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmModal('Удалить объявление?'))) return;
      await deleteDoc(doc(db, 'listings', btn.dataset.delete));
      allListings = allListings.filter((l) => l.id !== btn.dataset.delete);
      renderListingsTable(allListings);
      toast('Удалено', 'success');
    });
  });
}

qs('#listings-search').addEventListener('input', debounce((e) => {
  const term = e.target.value.trim().toLowerCase();
  renderListingsTable(term ? allListings.filter((l) => l.title.toLowerCase().includes(term)) : allListings);
}, 250));

// ---------- Пользователи ----------

async function loadUsers() {
  const host = qs('#users-table');
  host.innerHTML = '<div class="loader">Загрузка…</div>';
  const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(300)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!items.length) { host.innerHTML = '<div class="empty-state"><h3>Пользователей нет</h3></div>'; return; }
  host.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Имя</th><th>Email</th><th>Город</th><th>Роль</th><th>Регистрация</th></tr></thead>
      <tbody>
        ${items.map((u) => `
          <tr data-id="${u.id}">
            <td>${escapeHtml(u.displayName || '')}</td>
            <td>${escapeHtml(u.email || '')}</td>
            <td>${escapeHtml(u.city || '')}</td>
            <td>
              <select data-role="${u.id}">
                <option value="user" ${u.role !== 'admin' ? 'selected' : ''}>user</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
              </select>
            </td>
            <td>${formatDate(u.createdAt)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  host.querySelectorAll('[data-role]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await updateDoc(doc(db, 'users', sel.dataset.role), { role: sel.value });
        toast('Роль обновлена', 'success');
      } catch (err) { toast('Ошибка: ' + err.message, 'error'); }
    });
  });
}

// ---------- Сделки (чаты) ----------

async function loadChats() {
  const host = qs('#chats-table');
  host.innerHTML = '<div class="loader">Загрузка…</div>';
  const snap = await getDocs(query(collection(db, 'chats'), orderBy('lastMessageAt', 'desc'), limit(300)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!items.length) { host.innerHTML = '<div class="empty-state"><h3>Переписок нет</h3></div>'; return; }
  host.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Объявление</th><th>Покупатель</th><th>Продавец</th><th>Статус</th><th>Последнее сообщение</th><th></th></tr></thead>
      <tbody>
        ${items.map((c) => `
          <tr data-id="${c.id}">
            <td><a href="listing.html?id=${c.listingId}">${escapeHtml(c.listingTitle)}</a></td>
            <td>${escapeHtml(c.buyerName || '')}</td>
            <td>${escapeHtml(c.ownerName || '')}</td>
            <td><span class="pill pill--${c.status}">${CHAT_STATUS[c.status] || c.status}</span></td>
            <td>${formatDateTime(c.lastMessageAt)}</td>
            <td class="admin-table__actions">
              <button class="btn btn-ghost btn-sm" data-view="${c.id}" type="button">Просмотреть</button>
              ${c.status === 'pending' ? `<button class="btn btn-danger btn-sm" data-cancel="${c.id}" type="button">Отменить</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  host.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => openChatViewer(items.find((x) => x.id === btn.dataset.view)));
  });
  host.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmModal('Принудительно отменить сделку?'))) return;
      const c = items.find((x) => x.id === btn.dataset.cancel);
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'chats', c.id), { status: 'cancelled' });
        batch.set(doc(collection(db, 'history')), {
          listingId: c.listingId,
          listingTitle: c.listingTitle,
          listingPrice: c.listingPrice,
          listingImage: c.listingImage,
          requesterId: c.buyerId,
          requesterName: c.buyerName,
          ownerId: c.ownerId,
          ownerName: c.ownerName,
          status: 'cancelled',
          finishedAt: serverTimestamp(),
        });
        await batch.commit();
        toast('Сделка отменена', 'success');
        loadChats();
      } catch (err) { toast('Ошибка: ' + err.message, 'error'); }
    });
  });
}

// Модерация: читать переписку любых двух пользователей может только админ
// (правила Firestore разрешают это отдельной веткой isAdmin() в chats/messages).
function openChatViewer(chat) {
  if (!chat) return;
  let host = document.getElementById('admin-modal-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'admin-modal-host';
    document.body.appendChild(host);
  }
  host.innerHTML = `
    <div class="modal-backdrop is-open" id="admin-chat-backdrop">
      <div class="modal-card admin-chat-modal">
        <div class="admin-chat-modal__head">
          <div>
            <h3 class="mt-0" style="margin-bottom:2px;">${escapeHtml(chat.listingTitle)}</h3>
            <span class="muted" style="font-size:12.5px;">Покупатель: ${escapeHtml(chat.buyerName || '')} · Продавец: ${escapeHtml(chat.ownerName || '')}</span>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="admin-chat-close-btn" aria-label="Закрыть">
            <i data-lucide="x" class="icon" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <div class="admin-chat-modal__messages" id="admin-chat-messages">
          <div class="loader">Загрузка…</div>
        </div>
      </div>
    </div>
  `;
  renderIcons();

  const unsub = onSnapshot(
    query(collection(db, 'chats', chat.id, 'messages'), orderBy('createdAt', 'asc')),
    (snap) => {
      const box = document.getElementById('admin-chat-messages');
      if (!box) return;
      if (snap.empty) {
        box.innerHTML = '<p class="muted text-center">Сообщений пока нет.</p>';
        return;
      }
      box.innerHTML = snap.docs
        .map((d) => {
          const m = d.data();
          return `
            <div class="chat-bubble ${m.senderId === chat.ownerId ? 'chat-bubble--own' : ''}">
              <div class="chat-bubble__sender">${escapeHtml(m.senderName)}</div>
              <div class="chat-bubble__text">${escapeHtml(m.text)}</div>
              <div class="chat-bubble__time">${formatDateTime(m.createdAt)}</div>
            </div>
          `;
        })
        .join('');
      box.scrollTop = box.scrollHeight;
    },
    (err) => {
      const box = document.getElementById('admin-chat-messages');
      if (box) box.innerHTML = `<p class="muted">Не удалось загрузить переписку: ${err.message}</p>`;
    }
  );

  const close = () => {
    unsub();
    host.innerHTML = '';
  };
  document.getElementById('admin-chat-close-btn').addEventListener('click', close);
  document.getElementById('admin-chat-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'admin-chat-backdrop') close();
  });
}

// ---------- Отзывы ----------

async function loadReviews() {
  const host = qs('#reviews-table');
  host.innerHTML = '<div class="loader">Загрузка…</div>';
  try {
    const snap = await getDocs(query(collectionGroup(db, 'reviews'), orderBy('createdAt', 'desc'), limit(300)));
    const items = snap.docs.map((d) => ({ path: d.ref.path, listingId: d.ref.parent.parent.id, ...d.data() }));
    if (!items.length) { host.innerHTML = '<div class="empty-state"><h3>Отзывов нет</h3></div>'; return; }
    host.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Автор</th><th>Оценка</th><th>Текст</th><th>Объявление</th><th>Дата</th><th></th></tr></thead>
        <tbody>
          ${items.map((r) => `
            <tr>
              <td>${escapeHtml(r.authorName)}</td>
              <td>${r.rating} ★</td>
              <td>${escapeHtml((r.text || '').slice(0, 80))}</td>
              <td><a href="listing.html?id=${r.listingId}">Открыть</a></td>
              <td>${formatDateTime(r.createdAt)}</td>
              <td><button class="btn btn-ghost btn-sm" data-delete-review="${r.path}" type="button">Удалить</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    host.querySelectorAll('[data-delete-review]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmModal('Удалить отзыв?'))) return;
        await deleteDoc(doc(db, btn.dataset.deleteReview));
        loadReviews();
        toast('Отзыв удалён', 'success');
      });
    });
  } catch (err) {
    host.innerHTML = `<p class="muted">Не удалось загрузить отзывы (нужен индекс collectionGroup для reviews).</p>`;
  }
}

// ---------- Статистика ----------

async function loadStats() {
  const grid = qs('#stats-grid');
  grid.innerHTML = '<div class="loader">Считаем…</div>';
  try {
    const [listingsCount, activeCount, usersCount, pendingChatsCount, historyCount] = await Promise.all([
      getCountFromServer(collection(db, 'listings')),
      getCountFromServer(query(collection(db, 'listings'), where('status', '==', 'active'))),
      getCountFromServer(collection(db, 'users')),
      getCountFromServer(query(collection(db, 'chats'), where('status', '==', 'pending'))),
      getCountFromServer(collection(db, 'history')),
    ]);

    let avgPriceHtml = '';
    try {
      const agg = await getAggregateFromServer(
        query(collection(db, 'listings'), where('status', '==', 'active')),
        { avgPrice: average('price'), totalValue: sum('price') }
      );
      avgPriceHtml = tile(formatPrice(Math.round(agg.data().avgPrice || 0)), 'Средняя цена активных');
    } catch (e) {
      // агрегатные sum/average могут быть недоступны в некоторых окружениях — пропускаем плитку
    }

    grid.innerHTML = [
      tile(listingsCount.data().count, 'Всего объявлений'),
      tile(activeCount.data().count, 'Активных объявлений'),
      tile(usersCount.data().count, 'Пользователей'),
      tile(pendingChatsCount.data().count, 'Сделок ожидают решения'),
      tile(historyCount.data().count, 'Завершённых сделок'),
      avgPriceHtml,
    ].join('');
  } catch (err) {
    grid.innerHTML = `<p class="muted">Не удалось загрузить статистику: ${err.message}</p>`;
  }
}

function tile(value, label) {
  return `<div class="stat-tile"><div class="stat-tile__value">${value}</div><div class="stat-tile__label">${label}</div></div>`;
}

// ---------- Демо-данные ----------

const DEMO_TITLES = [
  ['Смартфон iPhone 13, 128 ГБ', 'electronics', 54990],
  ['Ноутбук ASUS VivoBook 15', 'electronics', 42000],
  ['Наушники Sony WH-1000XM4', 'electronics', 19900],
  ['Велосипед горный Stels Navigator', 'transport', 15500],
  ['Автомобиль Kia Rio 2018', 'transport', 890000],
  ['Скутер Yamaha Aerox', 'transport', 165000],
  ['Квартира-студия 28 м²', 'realestate', 3200000],
  ['Дом с участком 6 соток', 'realestate', 5600000],
  ['Диван угловой раскладной', 'home', 21000],
  ['Холодильник Samsung', 'home', 34500],
  ['Куртка зимняя мужская', 'fashion', 4900],
  ['Кроссовки Nike Air Max', 'fashion', 6200],
  ['Гитара акустическая Yamaha', 'hobby', 12000],
  ['Палатка туристическая 4-местная', 'hobby', 7800],
  ['Услуги репетитора по математике', 'services', 1200],
  ['Ремонт квартир под ключ', 'services', 50000],
  ['Требуется курьер на авто', 'job', 60000],
  ['Ищу работу веб-разработчиком', 'job', 90000],
  ['Котята шотландские вислоухие', 'animals', 8000],
  ['Коляска детская 2 в 1', 'kids', 11500],
];

qs('#seed-btn').addEventListener('click', async () => {
  const btn = qs('#seed-btn');
  btn.disabled = true;
  btn.textContent = 'Заполняем…';
  const { tokenize } = await import('./utils.js');
  try {
    for (let i = 0; i < DEMO_TITLES.length; i += 1) {
      const [title, category, price] = DEMO_TITLES[i];
      const description = `${title}. Хорошее состояние, торг уместен. Демонстрационное объявление №${i + 1} для проверки каталога.`;
      await addDoc(collection(db, 'listings'), {
        title,
        description,
        titleLower: title.toLowerCase(),
        searchTokens: tokenize(`${title} ${description}`),
        category,
        condition: i % 3 === 0 ? 'new' : 'used',
        price,
        city: CITIES[i % CITIES.length],
        tags: [],
        images: [],
        ownerId: adminAuth.user.uid,
        ownerName: adminAuth.profile?.displayName || adminAuth.user.email,
        status: 'active',
        ratingAvg: 0,
        reviewsCount: 0,
        createdAt: serverTimestamp(),
      });
    }
    toast('Демо-данные добавлены!', 'success');
    loaded.listings = false;
    if (!panels.listings.hidden) loadListings();
  } catch (err) {
    toast('Ошибка: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Заполнить демо-данными (20 объявлений)';
  }
});
