// firebase/config.ts

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Vercelに登録した環境変数から設定を取得する形式
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  // measurementId は省略します
};

// アプリを初期化
// ※ apiKey の値が空だと、ここでエラーになる
const app = initializeApp(firebaseConfig);

// Firestoreのインスタンスを取得し、エクスポート
export const db = getFirestore(app);