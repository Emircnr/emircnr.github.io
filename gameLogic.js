// ========== Firebase Kurulumu ==========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    updateProfile, 
    GoogleAuthProvider, 
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get, 
    child, 
    update, 
    onValue 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// Senin firebaseConfig'in
const firebaseConfig = {
    apiKey: "AIzaSyDThNGVa7YBhQIINuIOxUiLbTvu0cOZh4w",
    authDomain: "maping-c0315.firebaseapp.com",
    databaseURL: "https://maping-c0315-default-rtdb.firebaseio.com",
    projectId: "maping-c0315",
    storageBucket: "maping-c0315.firebasestorage.app",
    messagingSenderId: "1056086990632",
    appId: "1:1056086990632:web:1f83946cad5b68e2f73a1d",
    measurementId: "G-3N34BTYV8C"
};

// Firebase başlat
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();

// ========== UI Elemanları ==========
const authContainer = document.getElementById("auth-container");
const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginBtn = document.getElementById("login-btn");
const googleBtn = document.getElementById("google-btn");

const registerDisplayName = document.getElementById("register-display-name");
const registerEmail = document.getElementById("register-email");
const registerPassword = document.getElementById("register-password");
const registerConfirmPassword = document.getElementById("register-confirm-password");
const registerBtn = document.getElementById("register-btn");

const logoutBtn = document.getElementById("logout-btn");
const gameContainer = document.getElementById("game-container");
const topInfo = document.getElementById("top-info");

// Bildirim alanı
const notificationArea = document.getElementById("notification-area");

// ========== Bildirim Fonksiyonu ==========
function showNotification(message, type = "info", duration = 3000) {
    const div = document.createElement("div");
    div.classList.add("notification-item");
    div.textContent = message;
    if (type === "error") {
        div.style.borderColor = "var(--danger)";
        div.style.color = "var(--danger)";
    }
    if (type === "success") {
        div.style.borderColor = "var(--brand)";
        div.style.color = "var(--brand)";
    }
    notificationArea.appendChild(div);
    setTimeout(() => div.remove(), duration);
}

// ========== Sekme Geçişleri ==========
loginTab.addEventListener("click", () => {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    loginForm.classList.add("active");
    registerForm.classList.remove("active");
});
registerTab.addEventListener("click", () => {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");
    registerForm.classList.add("active");
    loginForm.classList.remove("active");
});

// ========== Firebase Auth İşlemleri ==========
loginBtn.addEventListener("click", async () => {
    const email = loginEmail.value.trim();
    const password = loginPassword.value.trim();
    if (!email || !password) {
        showNotification("Email ve şifre gerekli!", "error");
        return;
    }
    try {
        await signInWithEmailAndPassword(auth, email, password);
        showNotification("Giriş başarılı!", "success");
    } catch (err) {
        showNotification("Giriş başarısız: " + err.message, "error");
    }
});

registerBtn.addEventListener("click", async () => {
    const displayName = registerDisplayName.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value.trim();
    const confirmPassword = registerConfirmPassword.value.trim();

    if (!displayName || !email || !password) {
        showNotification("Tüm alanlar gerekli!", "error");
        return;
    }
    if (password !== confirmPassword) {
        showNotification("Şifreler uyuşmuyor!", "error");
        return;
    }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
        await set(ref(db, "users/" + userCredential.user.uid), {
            displayName,
            email,
            createdAt: Date.now()
        });
        showNotification("Kayıt başarılı!", "success");
    } catch (err) {
        showNotification("Kayıt başarısız: " + err.message, "error");
    }
});

googleBtn.addEventListener("click", async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        await set(ref(db, "users/" + user.uid), {
            displayName: user.displayName || "Oyuncu",
            email: user.email,
            createdAt: Date.now()
        });
        showNotification("Google ile giriş başarılı!", "success");
    } catch (err) {
        showNotification("Google girişi başarısız: " + err.message, "error");
    }
});

logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    showNotification("Çıkış yapıldı", "success");
});

// ========== Oturum Dinleyici ==========
onAuthStateChanged(auth, (user) => {
    if (user) {
        authContainer.style.display = "none";
        gameContainer.style.display = "block";
        topInfo.style.display = "flex";
        showNotification(`Hoşgeldin, ${user.displayName || "Oyuncu"}`, "success");
    } else {
        authContainer.style.display = "flex";
        gameContainer.style.display = "none";
        topInfo.style.display = "none";
    }
});
// ========== Leaflet Harita Kurulumu ==========
let map;
let playerMarker;
let otherPlayers = {};

function initMap() {
    map = L.map('map').setView([39.92077, 32.85411], 6); // Türkiye merkez

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap Katkıcıları'
    }).addTo(map);
}

// ========== Oyuncu Konumunu Alma ==========
function updatePlayerLocation(user) {
    if (!navigator.geolocation) {
        showNotification("Tarayıcınız konum servisini desteklemiyor!", "error");
        return;
    }
    navigator.geolocation.watchPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            // Firebase'e konum kaydet
            update(ref(db, "users/" + user.uid), {
                lat,
                lng,
                lastUpdate: Date.now()
            });

            // Kendi marker'ını güncelle
            if (!playerMarker) {
                playerMarker = L.marker([lat, lng], {
                    icon: L.icon({
                        iconUrl: "https://cdn-icons-png.flaticon.com/512/1946/1946429.png",
                        iconSize: [38, 38],
                        iconAnchor: [19, 38]
                    })
                }).addTo(map).bindPopup(user.displayName || "Ben");
            } else {
                playerMarker.setLatLng([lat, lng]);
            }
        },
        (err) => {
            showNotification("Konum alınamadı: " + err.message, "error");
        },
        { enableHighAccuracy: true }
    );
}

// ========== Diğer Oyuncuları Gösterme ==========
function trackOtherPlayers(currentUid) {
    const usersRef = ref(db, "users");
    onValue(usersRef, (snapshot) => {
        const players = snapshot.val();
        for (let uid in players) {
            if (uid === currentUid) continue;

            const p = players[uid];
            if (!p.lat || !p.lng) continue;

            if (!otherPlayers[uid]) {
                otherPlayers[uid] = L.marker([p.lat, p.lng], {
                    icon: L.icon({
                        iconUrl: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
                        iconSize: [32, 32],
                        iconAnchor: [16, 32]
                    })
                }).addTo(map).bindPopup(p.displayName || "Oyuncu");
            } else {
                otherPlayers[uid].setLatLng([p.lat, p.lng]);
            }
        }
    });
}

// ========== Oturum Açıldığında Haritayı Başlat ==========
onAuthStateChanged(auth, (user) => {
    if (user) {
        setTimeout(() => {
            initMap();
            updatePlayerLocation(user);
            trackOtherPlayers(user.uid);
            document.getElementById("map").style.display = "block";
        }, 500);
    } else {
        document.getElementById("map").style.display = "none";
    }
});
// ========== Skor Sistemi ==========
const scoreDisplay = document.createElement("div");
scoreDisplay.style.position = "absolute";
scoreDisplay.style.top = "10px";
scoreDisplay.style.right = "10px";
scoreDisplay.style.padding = "8px 12px";
scoreDisplay.style.background = "rgba(0,0,0,0.6)";
scoreDisplay.style.borderRadius = "8px";
scoreDisplay.style.fontSize = "14px";
scoreDisplay.style.zIndex = "999";
scoreDisplay.innerHTML = "Skor: 0";
document.body.appendChild(scoreDisplay);

let currentScore = 0;

// Skoru artırma
function addScore(points) {
    currentScore += points;
    scoreDisplay.innerHTML = `Skor: ${currentScore}`;
    const user = auth.currentUser;
    if (user) {
        update(ref(db, "users/" + user.uid), {
            score: currentScore
        });
    }
}

// Skoru Firebase’den çekme
function loadScore(user) {
    const userRef = ref(db, "users/" + user.uid);
    get(userRef).then((snapshot) => {
        if (snapshot.exists() && snapshot.val().score) {
            currentScore = snapshot.val().score;
            scoreDisplay.innerHTML = `Skor: ${currentScore}`;
        } else {
            currentScore = 0;
            scoreDisplay.innerHTML = "Skor: 0";
        }
    });
}

// ========== Oyun İçi Etkileşim Örneği ==========
map?.on("click", (e) => {
    // Haritaya tıklayınca +10 puan
    addScore(10);
    showNotification("+10 puan kazandın!", "success");
});

// ========== Oturum Açıldığında Skoru Yükle ==========
onAuthStateChanged(auth, (user) => {
    if (user) {
        loadScore(user);
    }
});

// ========== Çıkış Yapınca Temizlik ==========
onAuthStateChanged(auth, (user) => {
    if (!user) {
        currentScore = 0;
        scoreDisplay.innerHTML = "Skor: 0";
        if (playerMarker) {
            map.removeLayer(playerMarker);
            playerMarker = null;
        }
        for (let uid in otherPlayers) {
            map.removeLayer(otherPlayers[uid]);
        }
        otherPlayers = {};
    }
});

// ========== Geliştirici İçin Konsol Bilgisi ==========
console.log("Global Conquest oyunu başarıyla yüklendi! 🚀");
