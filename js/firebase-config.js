import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCS7DTZmrxUQ8_aJnSHIR29AkZK3FYFEo0",
  authDomain: "otivaapp.firebaseapp.com",
  projectId: "otivaapp",
  storageBucket: "otivaapp.firebasestorage.app",
  messagingSenderId: "395135644067",
  appId: "1:395135644067:web:317bb242d68fc686adaa16",
  measurementId: "G-R607QY45W6"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Safari (и некоторые сети/блокировщики) рвут потоковый WebChannel-транспорт Firestore —
// автоопределение long-polling чинит "Fetch API cannot load .../Listen/channel".
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
