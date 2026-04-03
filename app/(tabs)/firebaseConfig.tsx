// firebaseConfig.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from 'firebase/firestore';
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAd6vSIUgewRInyIpuqBYBtYbRS8xryhxo",
  authDomain: "yesorno-2a36d.firebaseapp.com",
  projectId: "yesorno-2a36d",
  storageBucket: "yesorno-2a36d.firebasestorage.app",
  messagingSenderId: "387059011263",
  appId: "1:387059011263:web:0bcae906c525752c8cc00a",
  measurementId: "G-3J7SPD94F1"
};

// 避免在熱更新 (Hot Reload) 時重複初始化 Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// 導出 auth 實例
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);