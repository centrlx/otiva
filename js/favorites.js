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
let cache = new Set();
let loadPromise = null;

async function loadCache() {
  const { user } = await authReady();
  if (!user) {
    cache = new Set();
    return cache;
  }
  const snap = await getDocs(collection(db, 'users', user.uid, 'favorites'));
  cache = new Set(snap.docs.map((d) => d.id));
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
  await setDoc(ref, {
    listingId,
    listingTitle: listing.title || '',
    listingPrice: listing.price ?? null,
    listingImage: listing.images?.[0] || null,
    listingStatus: listing.status || 'active',
    city: listing.city || '',
    createdAt: serverTimestamp(),
  });
  cache.add(listingId);
  return true;
}
