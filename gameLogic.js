// ==================== Firebase Kurulumu ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get, 
    update, 
    onValue 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// ==================== Firebase Config ====================
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

// ==================== Firebase Başlatma ====================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ==================== HTML Elemanları ====================
// Auth alanı
const authContainer = document.getElementById("auth-container");
const authTitle = document.getElementById("auth-title");
const authDisplayName = document.getElementById("auth-displayName");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authPasswordConfirm = document.getElementById("auth-passwordConfirm");
const authActionBtn = document.getElementById("auth-action-btn");
const toggleAuthBtn = document.getElementById("toggle-auth");

// Oyun alanı
const gameContainer = document.getElementById("game-container");
const topInfo = document.getElementById("top-info");
const logoutBtn = document.getElementById("logout-btn");

// Lobi alanı
const lobbyContainer = document.getElementById("lobby-container");
const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("join-room-btn");
const displayRoomCode = document.getElementById("display-room-code");

// Harita
const mapContainer = document.getElementById("map");

// Bildirim alanı
const notificationArea = document.getElementById("notification-area");

// ==================== Bildirim Fonksiyonu ====================
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

// ==================== Auth Durum Yönetimi ====================
let isRegisterMode = false;

toggleAuthBtn.addEventListener("click", () => {
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
        authTitle.textContent = "Kayıt Ol";
        authDisplayName.style.display = "block";
        authPasswordConfirm.style.display = "block";
        authActionBtn.textContent = "Kayıt Ol";
        toggleAuthBtn.textContent = "Giriş Yap";
    } else {
        authTitle.textContent = "Giriş Yap";
        authDisplayName.style.display = "none";
        authPasswordConfirm.style.display = "none";
        authActionBtn.textContent = "Giriş Yap";
        toggleAuthBtn.textContent = "Kayıt Ol";
    }
});

// ==================== Giriş / Kayıt İşlemleri ====================
authActionBtn.addEventListener("click", async () => {
    const displayName = authDisplayName.value.trim();
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();
    const confirmPassword = authPasswordConfirm.value.trim();

    if (!email || !password) {
        showNotification("Email ve şifre gerekli!", "error");
        return;
    }

    if (isRegisterMode) {
        if (!displayName) {
            showNotification("Kullanıcı adı gerekli!", "error");
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
    } else {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            showNotification("Giriş başarılı!", "success");
        } catch (err) {
            showNotification("Giriş başarısız: " + err.message, "error");
        }
    }
});
// ==================== Oturum Değişimini Dinle ====================
let currentUser = null;
let currentRoomId = null;
let roomRef = null;
let roomData = null;
let selectedCountry = null;
let map, geoJsonLayer;
let infoCardsPermanent = false;

// Basit ekran yönetimi
function showAuth() {
  document.body.classList.remove("lobby");
  authContainer.style.display = "flex";
  lobbyContainer.style.display = "none";
  gameContainer.style.display = "none";
}
function showLobby() {
  document.body.classList.add("lobby");
  authContainer.style.display = "none";
  lobbyContainer.style.display = "block";
  gameContainer.style.display = "none";
}
function showGame() {
  document.body.classList.remove("lobby");
  authContainer.style.display = "none";
  lobbyContainer.style.display = "none";
  gameContainer.style.display = "block";
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    currentRoomId = null;
    roomRef = null;
    roomData = null;
    showAuth();
    return;
  }
  currentUser = user;
  // Kullanıcı kaydı DB'de yoksa min profil aç
  const userSnap = await get(ref(db, "users/" + user.uid));
  if (!userSnap.exists()) {
    await set(ref(db, "users/" + user.uid), {
      displayName: user.displayName || user.email.split("@")[0],
      email: user.email,
      createdAt: Date.now()
    });
  }
  showLobby();
});

// ==================== Basit Yardımcılar ====================
const COLORS = ["#ff3b3b","#ff9f1c","#ffd166","#06d6a0","#118ab2","#8a4fff","#ef476f","#7bdff2"];
function renderColorOptions(containerId) {
  const box = document.getElementById(containerId);
  box.innerHTML = "";
  COLORS.forEach((c) => {
    const dot = document.createElement("span");
    dot.className = "global-color-option";
    dot.style.background = c;
    dot.addEventListener("click", () => {
      [...box.children].forEach(el => el.classList.remove("selected"));
      dot.classList.add("selected");
      dot.dataset.value = c;
    });
    box.appendChild(dot);
  });
}
renderColorOptions("creator-color-options");
renderColorOptions("join-color-options");

function getSelectedColor(containerId) {
  const el = document.querySelector(`#${containerId} .global-color-option.selected`);
  return el ? (el.dataset.value || el.style.backgroundColor) : COLORS[0];
}

// Basit 6 haneli kod
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ==================== Oda Oluştur ====================
createRoomBtn.addEventListener("click", async () => {
  const name = document.getElementById("creator-player-name").value.trim();
  const maxPlayers = parseInt(document.getElementById("max-players").value || "0", 10);
  const color = getSelectedColor("creator-color-options");
  if (!name) return showNotification("Adınızı girin!", "error");
  if (isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 8) {
    return showNotification("Oyuncu sayısı 2-8 arası olmalı.", "error");
  }

  const code = generateRoomCode();
  const roomId = crypto.randomUUID();

  // Host oyuncu objesi
  const hostPlayer = {
    name,
    color,
    money: 1000,
    soldiers: 0,
    petrol: 100,
    wheat: 400,
    countries: [],
    isHost: true,
    joinedAt: Date.now()
  };

  const roomPayload = {
    roomId,
    code,
    name: `Oda - ${code}`,
    gameState: "waiting",        // waiting | starting | started | ended
    currentTurnIndex: 0,
    round: 1,
    createdAt: Date.now(),
    maxPlayers,
    hostUid: currentUser.uid,
    playerOrder: [currentUser.uid],
    players: { [currentUser.uid]: hostPlayer }
  };

  // Oda kodu -> roomId map
  const updates = {};
  updates[`rooms/${roomId}`] = roomPayload;
  updates[`roomCodes/${code}`] = roomId;

  await update(ref(db), updates);
  showNotification("Oda oluşturuldu!", "success");
  // Ülke verisi ilk kurulum (varsa atla)
  await ensureCountryData(roomId);

  // Odaya bağlan
  attachRoom(roomId);
});

// ==================== Odaya Katıl ====================
joinRoomBtn.addEventListener("click", async () => {
  const name = document.getElementById("join-player-name").value.trim();
  const code = document.getElementById("room-code").value.trim().toUpperCase();
  const color = getSelectedColor("join-color-options");

  if (!name || !code) return showNotification("Ad ve kod gerekli.", "error");

  // Kodu çöz
  const idSnap = await get(ref(db, `roomCodes/${code}`));
  if (!idSnap.exists()) return showNotification("Oda bulunamadı.", "error");
  const roomId = idSnap.val();

  const rSnap = await get(ref(db, `rooms/${roomId}`));
  if (!rSnap.exists()) return showNotification("Oda artık yok.", "error");
  const r = rSnap.val();

  if (r.gameState !== "waiting" && r.gameState !== "starting") {
    return showNotification("Oyun başlamış, katılamazsınız.", "error");
  }
  const already = r.players && r.players[currentUser.uid];
  if (!already) {
    // kapasite
    const pc = r.players ? Object.keys(r.players).length : 0;
    if (pc >= (r.maxPlayers || 8)) return showNotification("Oda dolu.", "error");

    const newPlayer = {
      name,
      color,
      money: 1000,
      soldiers: 0,
      petrol: 100,
      wheat: 400,
      countries: [],
      isHost: false,
      joinedAt: Date.now()
    };
    const ups = {};
    ups[`rooms/${roomId}/players/${currentUser.uid}`] = newPlayer;
    ups[`rooms/${roomId}/playerOrder/${pc}`] = currentUser.uid;
    await update(ref(db), ups);
  }

  attachRoom(roomId);
});

// ==================== Odaya Bağlan ve Dinle ====================
function attachRoom(roomId) {
  if (roomRef) roomRef.off(); // eski dinleyicileri bırak
  currentRoomId = roomId;
  roomRef = ref(db, `rooms/${roomId}`);

  onValue(roomRef, (snap) => {
    if (!snap.exists()) {
      showNotification("Oda kapatıldı.", "error");
      showLobby();
      return;
    }
    roomData = snap.val();
    // Top bar
    displayRoomCode.textContent = roomData.code || "-";
    document.getElementById("current-round").textContent = roomData.round || 1;

    // Sıra
    const idx = roomData.currentTurnIndex || 0;
    const pid = (roomData.playerOrder || [])[idx];
    const pName = roomData.players?.[pid]?.name || "?";
    document.getElementById("current-player").textContent = pName;

    // Start butonu görünürlüğü
    const startBtn = document.getElementById("start-game-btn");
    const isHost = !!roomData.players?.[currentUser.uid]?.isHost;
    if (roomData.gameState === "waiting" && isHost) startBtn.style.display = "inline-block";
    else startBtn.style.display = "none";

    // Haritayı kur / güncelle
    initializeMap();
    paintCountries();

    showGame();
  });
}

// ==================== Oyunu Başlat (Host) ====================
document.getElementById("start-game-btn").addEventListener("click", async () => {
  if (!roomData) return;
  const me = roomData.players?.[currentUser.uid];
  if (!me?.isHost) return;

  await update(ref(db, `rooms/${currentRoomId}`), {
    gameState: "started",
    currentTurnIndex: 0,
    round: 1
  });
  showNotification("Oyun başladı!", "success");
});

// ==================== Ülke Verisi (İlk Kurulum) ====================
async function ensureCountryData(roomId) {
  const cSnap = await get(ref(db, `rooms/${roomId}/countryData`));
  if (cSnap.exists()) return;

  // GeoJSON'ı fetch edip rastgele üretim ve gelir atayalım
  const world = await fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json").then(r => r.json());
  const feats = world.features || [];
  // Yağ ve buğday için rastgele indeks setleri
  const oilSet = new Set();
  while (oilSet.size < Math.min(43, feats.length)) oilSet.add(Math.floor(Math.random()*feats.length));
  const wheatSet = new Set();
  while (wheatSet.size < Math.min(60, feats.length)) wheatSet.add(Math.floor(Math.random()*feats.length));

  const payload = {};
  feats.forEach((f, idx) => {
    const name = f.properties?.name || `C_${idx}`;
    payload[name] = {
      income: Math.floor(Math.random()*500)+100,
      soldiers: 0,
      owner: null,
      barracksCount: 0,
      factories: 0,
      refineries: 0,
      oilProduction: oilSet.has(idx) ? Math.floor(Math.random()*(500-150+1))+150 : 0,
      wheatProduction: wheatSet.has(idx) ? Math.floor(Math.random()*(700-200+1))+200 : 0,
      grainMills: 0,
      supporters: {},
      castleDefenseLevel: 0
    };
  });

  await set(ref(db, `rooms/${roomId}/countryData`), payload);
}

// ==================== Leaflet Harita ====================
function initializeMap() {
  if (map) return;
  map = L.map("map", {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 7,
    worldCopyJump: false
  });

  // Basit koyu tonlu bir zemin (Esri Ocean)
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri", maxZoom: 7 }
  ).addTo(map);

  // GeoJSON katmanı
  fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
    .then(r => r.json())
    .then(geo => {
      geoJsonLayer = L.geoJSON(geo, {
        style: defaultCountryStyle,
        onEachFeature: (feature, layer) => {
          const cname = feature.properties?.name;
          layer.bindTooltip(() => countryTooltip(cname), {
            permanent: infoCardsPermanent,
            direction: "center",
            className: "country-popup-tooltip"
          });
          layer.on("click", () => handleCountryClick(cname, layer));
        }
      }).addTo(map);
    });
}

function defaultCountryStyle() {
  return {
    color: "#555",
    weight: 1,
    fillColor: "#cccccc",
    fillOpacity: 0.7
  };
}

function countryTooltip(cname) {
  if (!roomData?.countryData?.[cname]) return `<div><p>${cname}</p><p>Veri yok</p></div>`;
  const c = roomData.countryData[cname];
  const ownerName = c.owner && roomData.players?.[c.owner]?.name ? roomData.players[c.owner].name : "Yok";

  let effIncome = c.income || 0;
  if (c.factories) effIncome = Math.floor(effIncome * (1 + 0.2 * c.factories));
  const effOil = c.oilProduction ? Math.floor(c.oilProduction * (1 + 0.15 * (c.refineries || 0))) : 0;
  const effWheat = c.wheatProduction ? Math.floor(c.wheatProduction * (1 + 0.2 * (c.grainMills || 0))) : 0;
  const castleTxt = c.castleDefenseLevel > 0 ? `%${c.castleDefenseLevel * 5}` : "-";

  return `
    <div>
      <p><i class="fas fa-money-bill-wave"></i> Gelir: ${effIncome}$</p>
      <p><i class="fas fa-users"></i> Asker: ${c.soldiers || 0}</p>
      <p><i class="fas fa-fort-awesome"></i> Kışla: ${c.barracksCount || 0}</p>
      <p><i class="fas fa-industry"></i> Fabrika: ${c.factories || 0}</p>
      <p><i class="fas fa-oil-can"></i> Rafine: ${c.refineries || 0}</p>
      <p><i class="fas fa-oil-can"></i> Petrol Üretimi: ${effOil}</p>
      <p><i class="fas fa-wheat-awn"></i> Değirmen: ${c.grainMills || 0}</p>
      <p><i class="fas fa-wheat-awn"></i> Buğday Üretimi: ${effWheat}</p>
      <p><i class="fas fa-chess-rook"></i> Kale Gücü: ${castleTxt}</p>
      <p><i class="fas fa-crown"></i> Sahip: ${ownerName}</p>
    </div>`;
}

// Ülke boyama (owner renkleri)
function paintCountries() {
  if (!geoJsonLayer || !roomData?.countryData) return;
  geoJsonLayer.eachLayer((layer) => {
    const cname = layer.feature.properties?.name;
    const c = roomData.countryData[cname];
    if (!c) return layer.setStyle(defaultCountryStyle());

    if (c.owner && roomData.players?.[c.owner]) {
      const col = roomData.players[c.owner].color || "#f39c12";
      layer.setStyle({ color:"#555", weight:1, fillColor: col, fillOpacity: 0.9 });
    } else {
      layer.setStyle(defaultCountryStyle());
    }
    if (layer.setTooltipContent) layer.setTooltipContent(countryTooltip(cname));
  });
}

// Ülke seçimi
function handleCountryClick(cname, layer) {
  selectedCountry = cname;
  showNotification(`Seçilen ülke: ${cname}`);
  // kısa bir highlight
  layer.setStyle({ weight: 3, color: "#ff7043" });
  setTimeout(() => paintCountries(), 600);
  // Kale maliyet metnini (3. kısımda yazacağımız fonk) güvenli çağır:
  const span = document.getElementById("castle-upgrade-cost-text");
  if (span) span.textContent = "-"; // 3. kısımda gerçek değer güncellenecek
}

// Tooltip kalıcı/aç-kapa
document.getElementById("toggle-info-cards").addEventListener("click", () => {
  infoCardsPermanent = !infoCardsPermanent;
  const icon = document.querySelector("#toggle-info-cards i");
  icon.className = infoCardsPermanent ? "fas fa-eye" : "fas fa-eye-slash";
  // Tooltipleri yeniden bağlamak için katmanı yeniden oluşturmak yerine içerikleri güncelleyelim:
  paintCountries();
});

// ==================== Odadan Çık ====================
document.getElementById("exit-room-btn").addEventListener("click", async () => {
  if (!currentRoomId || !roomData) {
    showLobby();
    return;
  }
  // Oyuncuyu odadan çıkar (sıradaysa 3. kısımda turn logic ile ele alacağız)
  if (roomData.players?.[currentUser.uid]) {
    const newOrder = (roomData.playerOrder || []).filter(id => id !== currentUser.uid);
    const ups = {};
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}`] = null;
    ups[`rooms/${currentRoomId}/playerOrder`] = newOrder;
    await update(ref(db), ups).catch(()=>{});
  }
  currentRoomId = null;
  roomRef = null;
  roomData = null;
  showLobby();
});
