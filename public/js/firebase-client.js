import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCdRDpgvJGgX6rl7qbR3a0982rbvajj4n0",
    authDomain: "chronic-ai-4dc64.firebaseapp.com",
    databaseURL: "https://chronic-ai-4dc64-default-rtdb.firebaseio.com",
    projectId: "chronic-ai-4dc64",
    storageBucket: "chronic-ai-4dc64.firebasestorage.app",
    messagingSenderId: "711618829524",
    appId: "1:711618829524:web:8028006eefe89aeee52f41",
    measurementId: "G-957Y3YHBVY"
};

const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const database = getDatabase(firebaseApp);
export const storage = getStorage(firebaseApp);

