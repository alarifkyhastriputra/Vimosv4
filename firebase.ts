
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence, indexedDBLocalPersistence, browserSessionPersistence, getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAgOPD5DDtjExQaVeu6VLFI7CMP9i8VOQw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "projectchat01-d16bc.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://projectchat01-d16bc-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "projectchat01-d16bc",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "projectchat01-d16bc.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "163313653543",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:163313653543:web:8bf5627ebe6a92ff11bb02"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence]
  });
} catch {
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const db = getDatabase(app);

