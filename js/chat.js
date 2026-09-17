import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { getCurrentUser, getCurrentProfile } from './auth.js';

// Один чат на пару (объявление, покупатель) — детерминированный id,
// поэтому повторный клик «Написать продавцу» просто открывает существующий чат.
export function chatIdFor(listingId, buyerId) {
  return `${listingId}_${buyerId}`;
}

// Создаёт чат при первом обращении (get-then-set, а не upsert — чтобы повторные
// визиты не пытались переписать поля, которые правила разрешают менять только через update).
export async function openOrCreateChat(listing) {
  const user = getCurrentUser();
  if (!user) return null;
  const chatId = chatIdFor(listing.id, user.uid);
  const ref = doc(db, 'chats', chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const profile = getCurrentProfile();
    await setDoc(ref, {
      listingId: listing.id,
      listingTitle: listing.title,
      listingPrice: listing.price,
      listingImage: listing.images?.[0] || null,
      ownerId: listing.ownerId,
      ownerName: listing.ownerName,
      buyerId: user.uid,
      buyerName: profile?.displayName || user.email,
      status: 'pending',
      confirmedByOwner: false,
      confirmedByBuyer: false,
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      unreadForOwner: false,
      unreadForBuyer: false,
      createdAt: serverTimestamp(),
    });
  }
  return chatId;
}

// Живой бейдж непрочитанных чатов для иконки в хедере.
export function watchUnreadBadge(onChange) {
  const user = getCurrentUser();
  if (!user) return;
  let ownerUnread = 0;
  let buyerUnread = 0;
  const emit = () => onChange(ownerUnread + buyerUnread);

  onSnapshot(
    query(collection(db, 'chats'), where('ownerId', '==', user.uid), where('unreadForOwner', '==', true)),
    (snap) => { ownerUnread = snap.size; emit(); }
  );
  onSnapshot(
    query(collection(db, 'chats'), where('buyerId', '==', user.uid), where('unreadForBuyer', '==', true)),
    (snap) => { buyerUnread = snap.size; emit(); }
  );
}
