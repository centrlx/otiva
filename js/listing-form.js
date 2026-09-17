import {
  doc,
  getDoc,
  addDoc,
  updateDoc,
  collection,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { mountHeader, requireAuth } from './auth.js';
import { CATEGORIES, CITIES } from './constants.js';
import { tokenize, toast, qs, getParam } from './utils.js';

mountHeader();

const auth = await requireAuth();
if (!auth) throw new Error('redirecting to auth');
const { user, profile } = auth;

qs('#f-category').innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
qs('#cities-list').innerHTML = CITIES.map((c) => `<option value="${c}"></option>`).join('');

const editId = getParam('id');
let editingDoc = null;

if (editId) {
  const snap = await getDoc(doc(db, 'listings', editId));
  if (!snap.exists()) {
    toast('Объявление не найдено', 'error');
    window.location.href = 'profile.html';
  } else {
    editingDoc = { id: snap.id, ...snap.data() };
    if (editingDoc.ownerId !== user.uid && profile?.role !== 'admin') {
      toast('Нет доступа к редактированию этого объявления', 'error');
      window.location.href = 'index.html';
    } else {
      fillForm(editingDoc);
      qs('#form-title').textContent = 'Редактирование объявления';
      qs('#submit-btn').textContent = 'Сохранить изменения';
    }
  }
}

function fillForm(d) {
  qs('#f-title').value = d.title || '';
  qs('#f-category').value = d.category || '';
  qs('#f-condition').value = d.condition || 'used';
  qs('#f-price').value = d.price ?? '';
  qs('#f-city').value = d.city || '';
  qs('#f-description').value = d.description || '';
  qs('#f-tags').value = (d.tags || []).join(', ');
  qs('#f-images').value = (d.images || []).join('\n');
}

qs('#listing-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = qs('#form-msg');
  msg.textContent = '';
  const submitBtn = qs('#submit-btn');
  submitBtn.disabled = true;

  const title = qs('#f-title').value.trim();
  const description = qs('#f-description').value.trim();
  const category = qs('#f-category').value;
  const condition = qs('#f-condition').value;
  const price = Number(qs('#f-price').value);
  const city = qs('#f-city').value.trim();
  const tags = qs('#f-tags').value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
  const images = qs('#f-images').value.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 6);

  const payload = {
    title,
    description,
    titleLower: title.toLowerCase(),
    searchTokens: tokenize(`${title} ${description}`),
    category,
    condition,
    price,
    city,
    tags,
    images,
    updatedAt: serverTimestamp(),
  };

  try {
    if (editingDoc) {
      await updateDoc(doc(db, 'listings', editingDoc.id), payload);
      toast('Изменения сохранены', 'success');
      window.location.href = `listing.html?id=${editingDoc.id}`;
    } else {
      const ref = await addDoc(collection(db, 'listings'), {
        ...payload,
        ownerId: user.uid,
        ownerName: profile?.displayName || user.email,
        status: 'active',
        ratingAvg: 0,
        reviewsCount: 0,
        createdAt: serverTimestamp(),
      });
      toast('Объявление опубликовано!', 'success');
      window.location.href = `listing.html?id=${ref.id}`;
    }
  } catch (err) {
    msg.textContent = 'Ошибка: ' + err.message;
    submitBtn.disabled = false;
  }
});
