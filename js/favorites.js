import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { authReady, getCurrentUser } from './auth.js';

// Избранное хранится в Firestore, в подколлекции users/{uid}/favorites —
// приватные данные пользователя, id документа = id объявления (идемпотентно).
// Кэш хранит целиком данные документов (не только id), чтобы страница профиля
// могла отрисовать список избранного без повторного запроса той же коллекции.
let cache = new Map();
let loadPromise = null;

async function loadCache() {
  const { user } = await authReady();
  if (!user) {
    cache = new Map();
    return cache;
  }
  const snap = await getDocs(collection(db, 'users', user.uid, 'favorites'));
  cache = new Map(snap.docs.map((d) => [d.id, d.data()]));
  return cache;
}

// Дожидается авторизации и первой загрузки списка избранного текущего пользователя.
// Вызывать перед рендером карточек, где нужно сразу показать правильное состояние сердечка.
export function ensureFavoritesLoaded() {
  if (!loadPromise) loadPromise = loadCache();
  return loadPromise;
}

export function isFavorite(listingId) {
  return cache.has(listingId);
}

// Список избранного для страницы профиля — из уже загруженного кэша, без нового запроса.
export function getFavorites() {
  return Array.from(cache.entries())
    .sort((a, b) => (b[1].createdAt?.toMillis?.() || 0) - (a[1].createdAt?.toMillis?.() || 0));
}

// Возвращает true/false (новое состояние) или null, если пользователь не авторизован.
export async function toggleFavorite(listingId, listing = {}) {
  const user = getCurrentUser();
  if (!user) return null;
  const ref = doc(db, 'users', user.uid, 'favorites', listingId);
  if (cache.has(listingId)) {
    await deleteDoc(ref);
    cache.delete(listingId);
    return false;
  }
  const data = {
    listingId,
    listingTitle: listing.title || '',
    listingPrice: listing.price ?? null,
    listingImage: listing.images?.[0] || null,
    listingStatus: listing.status || 'active',
    city: listing.city || '',
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  cache.set(listingId, data);
  return true;
}
