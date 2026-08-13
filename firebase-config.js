import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, addDoc, updateDoc, doc, deleteDoc, query, where, orderBy, limit, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBlBCaXn4y3sJDENW0GXw3ck_D2h3qknHc",
  authDomain: "crm-gestao-mldu.firebaseapp.com",
  projectId: "crm-gestao-mldu",
  storageBucket: "crm-gestao-mldu.firebasestorage.app",
  messagingSenderId: "1040392341069",
  appId: "1:1040392341069:web:6acf1beb34af663cfffe04"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Exportar instâncias para o resto da aplicação
window.firebaseDb = db;
window.firebaseStorage = storage;
window.firebaseCollections = {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  onSnapshot,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
  serverTimestamp
};
