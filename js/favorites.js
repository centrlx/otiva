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

export function ensureFavoritesLoaded() {
  if (!loadPromise) loadPromise = loadCache();
  return loadPromise;
}

export function isFavorite(listingId) {
  return cache.has(listingId);
}

export function getFavorites() {
  return Array.from(cache.entries())
    .sort((a, b) => (b[1].createdAt?.toMillis?.() || 0) - (a[1].createdAt?.toMillis?.() || 0));
}

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
