// firebase/config.ts

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // Firestore（データベース）をインポート

// ↓↓↓ あなたがコピーした firebaseConfig オブジェクトを使用します ↓↓↓
const firebaseConfig = {
  apiKey: "AIzaSyCADekFY9TMrU9ewG_eoaQtnzhJCJv43Uw",
  authDomain: "dm-match-sharing.firebaseapp.com",
  projectId: "dm-match-sharing",
  storageBucket: "dm-match-sharing.firebasestorage.app",
  messagingSenderId: "680988108788",
  appId: "1:680988108788:web:35c68ceb26e43ff61afba1",
  measurementId: "G-Y0N28Y3KVG" // これは不要ですが、残しておいても問題ありません
};

// 1. Firebase を初期化
const app = initializeApp(firebaseConfig);

// 2. Firestoreのインスタンスを取得し、エクスポート
export const db = getFirestore(app);