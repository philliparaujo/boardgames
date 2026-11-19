import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// ignoreUndefinedProperties: a reducer that leaves an `undefined` field in its
// result would otherwise make the whole write fail.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

let signedIn: Promise<void> | null = null;

// Signs in anonymously once; every Firestore call awaits this first.
export function ensureSignedIn(): Promise<void> {
  if (!signedIn) {
    signedIn = signInAnonymously(auth)
      .then(() => undefined)
      .catch((error) => {
        signedIn = null;
        throw error;
      });
  }
  return signedIn;
}
