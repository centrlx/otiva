import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  serverTimestamp,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { mountHeader, requireAuth } from './auth.js';
import { CHAT_STATUS } from './constants.js';
import { formatPrice, formatDateTime, escapeHtml, toast, qs, getParam, renderIcons } from './utils.js';
import { confirmModal } from './modal.js';
import { perfStart, perfEnd } from './perf.js';

mountHeader();

const auth = await requireAuth();
if (!auth) throw new Error('redirecting to auth');
const { user } = auth;

const els = {
  layout: qs('#messages-layout'),
  list: qs('#chat-list'),
  empty: qs('#chat-empty'),
  active: qs('#chat-active'),
  header: qs('#chat-header'),
  messages: qs('#chat-messages'),
  form: qs('#chat-send-form'),
  input: qs('#chat-text-input'),
};

const chatsCache = new Map();
let activeChatId = getParam('chat');
let autoOpened = false;
let unsubMessages = null;

function renderList() {
  const items = Array.from(chatsCache.entries()).sort(
    (a, b) => (b[1].lastMessageAt?.toMillis?.() || 0) - (a[1].lastMessageAt?.toMillis?.() || 0)
  );
  if (!items.length) {
    els.list.innerHTML = `<div class="empty-state"><h3>Пока нет переписок</h3><a class="btn btn-primary btn-sm" href="index.html">В каталог</a></div>`;
    return;
  }
  els.list.innerHTML = items
    .map(([id, c]) => {
      const isOwnerRole = c.ownerId === user.uid;
      const otherName = isOwnerRole ? c.buyerName : c.ownerName;
      const unread = isOwnerRole ? c.unreadForOwner : c.unreadForBuyer;
      return `
        <button type="button" class="chat-list__item ${id === activeChatId ? 'is-active' : ''} ${unread ? 'is-unread' : ''}" data-chat="${id}">
          <div class="chat-list__thumb" style="${c.listingImage ? `background-image:url('${escapeHtml(c.listingImage)}')` : ''}"></div>
          <div class="chat-list__body">
            <div class="chat-list__title">${escapeHtml(c.listingTitle)}</div>
            <div class="chat-list__meta">${escapeHtml(otherName || '')}</div>
            <div class="chat-list__preview">${escapeHtml(c.lastMessage || 'Нет сообщений')}</div>
          </div>
          <span class="pill pill--${c.status}">${CHAT_STATUS[c.status] || c.status}</span>
          ${unread ? '<span class="chat-dot"></span>' : ''}
        </button>
      `;
    })
    .join('');
  els.list.querySelectorAll('[data-chat]').forEach((btn) => {
    btn.addEventListener('click', () => openChat(btn.dataset.chat));
  });
}

function maybeAutoOpen() {
  if (!autoOpened && activeChatId && chatsCache.has(activeChatId)) {
    autoOpened = true;
    openChat(activeChatId);
  }
}

const listQueries = [
  query(collection(db, 'chats'), where('ownerId', '==', user.uid), orderBy('lastMessageAt', 'desc'), limit(100)),
  query(collection(db, 'chats'), where('buyerId', '==', user.uid), orderBy('lastMessageAt', 'desc'), limit(100)),
];
perfStart('Firestore: список чатов');
let listQueriesLeft = listQueries.length;
listQueries.forEach((q) => {
  onSnapshot(q, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'removed') chatsCache.delete(change.doc.id);
      else chatsCache.set(change.doc.id, change.doc.data());
    });
    if (listQueriesLeft > 0) {
      listQueriesLeft -= 1;
      if (listQueriesLeft === 0) perfEnd('Firestore: список чатов', `${chatsCache.size} чатов`);
    }
    renderList();
    if (activeChatId && chatsCache.has(activeChatId)) renderChatHeader();
    maybeAutoOpen();
    // Если где-то обе стороны уже подтвердили, а завершить может только владелец —
    // проверяем это здесь же, а не только по клику (вдруг вторая сторона подтвердила уже после нас).
    chatsCache.forEach((c, id) => tryAutoFinalize(id, c));
  });
});

function openChat(chatId) {
  activeChatId = chatId;
  history.replaceState(null, '', `messages.html?chat=${chatId}`);
  els.empty.hidden = true;
  els.active.hidden = false;
  els.layout.classList.add('is-chat-open');
  renderList();

  const chat = chatsCache.get(chatId);
  renderChatHeader();

  const isOwnerRole = chat.ownerId === user.uid;
  const unreadField = isOwnerRole ? 'unreadForOwner' : 'unreadForBuyer';
  if (chat[unreadField]) {
    updateDoc(doc(db, 'chats', chatId), { [unreadField]: false }).catch(() => {});
  }

  if (unsubMessages) unsubMessages();
  // limitToLast — не открытый запрос всей истории переписки, а только последние N сообщений
  // (важно на будущее: у активного чата их со временем могут накопиться сотни).
  unsubMessages = onSnapshot(
    query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limitToLast(200)),
    (snap) => renderMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

function renderChatHeader() {
  const chat = chatsCache.get(activeChatId);
  if (!chat) return;
  const isOwnerRole = chat.ownerId === user.uid;
  const otherName = isOwnerRole ? chat.buyerName : chat.ownerName;
  const myConfirmed = isOwnerRole ? chat.confirmedByOwner : chat.confirmedByBuyer;
  const bothConfirmed = chat.confirmedByOwner && chat.confirmedByBuyer;

  let actionsHtml = '';
  if (chat.status === 'pending') {
    if (bothConfirmed) {
      // Обе стороны уже подтвердили — отклонить больше нельзя, ждём финализации (её проводит владелец).
      actionsHtml = `<span class="muted" style="font-size:12.5px;">Обе стороны подтвердили — сделка завершается…</span>`;
    } else if (myConfirmed) {
      actionsHtml = `
        <span class="muted" style="font-size:12.5px;">Вы подтвердили, ждём вторую сторону…</span>
        <button class="btn btn-ghost btn-sm" id="chat-decline-btn" type="button">Отклонить</button>
      `;
    } else {
      actionsHtml = `
        <button class="btn btn-secondary btn-sm" id="chat-confirm-btn" type="button">Подтвердить</button>
        <button class="btn btn-ghost btn-sm" id="chat-decline-btn" type="button">Отклонить</button>
      `;
    }
  }

  els.header.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm chat-back-btn" id="chat-back-btn" aria-label="Назад">
      <i data-lucide="arrow-left" class="icon"></i>
    </button>
    <a href="listing.html?id=${chat.listingId}" class="chat-header__listing">
      <div class="chat-header__thumb" style="${chat.listingImage ? `background-image:url('${escapeHtml(chat.listingImage)}')` : ''}"></div>
      <div>
        <div class="chat-header__title">${escapeHtml(chat.listingTitle)}</div>
        <div class="muted" style="font-size:12px;">${formatPrice(chat.listingPrice)} · ${escapeHtml(otherName || '')}</div>
      </div>
    </a>
    <div class="chat-header__status">
      <span class="pill pill--${chat.status}">${CHAT_STATUS[chat.status] || chat.status}</span>
      ${actionsHtml}
    </div>
  `;
  qs('#chat-back-btn', els.header)?.addEventListener('click', () => {
    els.layout.classList.remove('is-chat-open');
  });
  qs('#chat-confirm-btn', els.header)?.addEventListener('click', confirmMySide);
  qs('#chat-decline-btn', els.header)?.addEventListener('click', declineDeal);
  renderIcons();
}

// Каждая сторона подтверждает только свой флаг. Как только оба true — сделка
// автоматически завершается (см. tryAutoFinalize), отдельной кнопки «Завершить» больше нет.
async function confirmMySide() {
  const chat = chatsCache.get(activeChatId);
  if (!chat) return;
  const isOwnerRole = chat.ownerId === user.uid;
  const myField = isOwnerRole ? 'confirmedByOwner' : 'confirmedByBuyer';
  const otherConfirmed = isOwnerRole ? chat.confirmedByBuyer : chat.confirmedByOwner;
  try {
    await updateDoc(doc(db, 'chats', activeChatId), { [myField]: true });
    toast(otherConfirmed ? 'Обе стороны подтвердили — завершаем сделку…' : 'Вы подтвердили сделку', 'success');
    if (otherConfirmed) tryAutoFinalize(activeChatId, { ...chat, [myField]: true });
  } catch (err) {
    toast('Ошибка: ' + err.message, 'error');
  }
}

// Отклонить может любая сторона, но только пока сделку не подтвердили оба —
// это же ограничение продублировано в firestore.rules, а не только здесь.
async function declineDeal() {
  const chat = chatsCache.get(activeChatId);
  if (!chat || (chat.confirmedByOwner && chat.confirmedByBuyer)) return;
  const ok = await confirmModal({
    title: 'Отклонить сделку?',
    message: 'Переписка останется доступной, но сделка будет отмечена как отклонённая.',
    confirmText: 'Отклонить',
    danger: true,
  });
  if (!ok) return;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'chats', activeChatId), { status: 'cancelled' });
    batch.set(doc(collection(db, 'history')), {
      listingId: chat.listingId,
      listingTitle: chat.listingTitle,
      listingPrice: chat.listingPrice,
      listingImage: chat.listingImage,
      requesterId: chat.buyerId,
      requesterName: chat.buyerName,
      ownerId: chat.ownerId,
      ownerName: chat.ownerName,
      status: 'cancelled',
      finishedAt: serverTimestamp(),
    });
    await batch.commit();
    toast('Сделка отклонена', 'success');
  } catch (err) {
    toast('Ошибка: ' + err.message, 'error');
  }
}

const finalizingChats = new Set();

// Как только оба флага true — завершаем сделку. Пишет всегда только владелец
// (правила Firestore не дают покупателю менять чужое объявление), поэтому если
// подтвердил последним покупатель, сделку доведёт до конца клиент владельца —
// сразу, если он сейчас в мессенджере, или при следующем открытии messages.html.
async function tryAutoFinalize(chatId, chat) {
  if (chat.ownerId !== user.uid) return;
  if (chat.status !== 'pending' || !chat.confirmedByOwner || !chat.confirmedByBuyer) return;
  if (finalizingChats.has(chatId)) return;
  finalizingChats.add(chatId);
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'chats', chatId), { status: 'completed' });
    batch.set(doc(collection(db, 'history')), {
      listingId: chat.listingId,
      listingTitle: chat.listingTitle,
      listingPrice: chat.listingPrice,
      listingImage: chat.listingImage,
      requesterId: chat.buyerId,
      requesterName: chat.buyerName,
      ownerId: chat.ownerId,
      ownerName: chat.ownerName,
      status: 'completed',
      finishedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'listings', chat.listingId), { status: 'sold', updatedAt: serverTimestamp() });
    await batch.commit();
    if (chatId === activeChatId) toast('Сделка завершена!', 'success');
  } catch (err) {
    console.error('auto-finalize failed:', err);
  } finally {
    finalizingChats.delete(chatId);
  }
}

function renderMessages(messages) {
  if (!messages.length) {
    els.messages.innerHTML = `<p class="muted text-center">Сообщений пока нет — напишите первым.</p>`;
    return;
  }
  els.messages.innerHTML = messages
    .map((m) => `
      <div class="chat-bubble ${m.senderId === user.uid ? 'chat-bubble--own' : ''}">
        <div class="chat-bubble__text">${escapeHtml(m.text)}</div>
        <div class="chat-bubble__time">${formatDateTime(m.createdAt)}</div>
      </div>
    `)
    .join('');
  els.messages.scrollTop = els.messages.scrollHeight;
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  const chat = chatsCache.get(activeChatId);
  if (!text || !chat) return;
  const isOwnerRole = chat.ownerId === user.uid;
  els.input.value = '';
  try {
    await addDoc(collection(db, 'chats', activeChatId, 'messages'), {
      senderId: user.uid,
      senderName: isOwnerRole ? chat.ownerName : chat.buyerName,
      text,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'chats', activeChatId), {
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      unreadForOwner: !isOwnerRole,
      unreadForBuyer: isOwnerRole,
    });
  } catch (err) {
    toast('Ошибка: ' + err.message, 'error');
    els.input.value = text;
  }
});

renderIcons();
