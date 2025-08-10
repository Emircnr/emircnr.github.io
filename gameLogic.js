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
// ==================== Bildirim & Yardımcılar ====================
let notificationsMuted = false;
let chatOpen = false;
let unreadMessages = 0;
let turnTimerInterval = null;
let turnTimeRemaining = 60;

function showNotification(text, type = "info", duration = 3000) {
  if (notificationsMuted && type !== "error" && type !== "success") return;
  const area = document.getElementById("notification-area");
  if (!area) return;
  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = text;
  area.appendChild(item);
  setTimeout(() => area.contains(item) && area.removeChild(item), duration + 800);
}

document.getElementById("open-notifications-btn").addEventListener("click", () => {
  notificationsMuted = !notificationsMuted;
  showNotification(notificationsMuted ? "Bildirimler kapatıldı." : "Bildirimler açıldı.");
});

// ==================== Tur Yönetimi ====================
function isMyTurn() {
  if (!roomData?.playerOrder || roomData?.gameState !== "started") return false;
  const idx = roomData.currentTurnIndex || 0;
  return roomData.playerOrder[idx] === currentUser.uid;
}

function startTurnTimer() {
  stopTurnTimer();
  const el = document.getElementById("turn-timer");
  turnTimeRemaining = 60;
  el.textContent = "60s";
  turnTimerInterval = setInterval(() => {
    turnTimeRemaining--;
    if (turnTimeRemaining <= 0) {
      stopTurnTimer();
      el.textContent = "0s";
      if (isMyTurn()) nextTurn(true);
      return;
    }
    el.textContent = `${turnTimeRemaining}s`;
  }, 1000);
}

function stopTurnTimer() {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  const el = document.getElementById("turn-timer");
  if (el) el.textContent = "60s";
}

document.getElementById("end-turn-btn").addEventListener("click", () => {
  if (!isMyTurn()) return showNotification("Sıranız değil!", "error");
  nextTurn(false);
});

async function nextTurn(autoEnd = false) {
  if (!roomData || !isMyTurn()) return;

  const idx = roomData.currentTurnIndex || 0;
  const pid = roomData.playerOrder[idx];
  const me = roomData.players?.[pid];
  if (!me) return;

  stopTurnTimer();

  const ups = {};

  // Tur sonu üretimler (para + buğday) ve kışla askerleri
  if (me.countries && roomData.countryData) {
    let incomeGain = 0;
    let wheatGain = 0;

    me.countries.forEach((cName) => {
      const c = roomData.countryData[cName];
      if (!c) return;
      // Kışla -> +5 asker/kişla
      if (c.barracksCount) {
        ups[`rooms/${currentRoomId}/countryData/${cName}/soldiers`] = (c.soldiers || 0) + (5 * c.barracksCount);
      }
      // Para
      let effIncome = c.income || 0;
      if (c.factories) effIncome = Math.floor(effIncome * (1 + 0.2 * c.factories));
      incomeGain += effIncome;
      // Buğday
      if (c.wheatProduction) {
        const effW = Math.floor(c.wheatProduction * (1 + 0.2 * (c.grainMills || 0)));
        wheatGain += effW;
      }
    });

    ups[`rooms/${currentRoomId}/players/${pid}/money`]  = (me.money  || 0) + incomeGain;
    ups[`rooms/${currentRoomId}/players/${pid}/wheat`]  = (me.wheat  || 0) + wheatGain;
  }

  // Sıradaki oyuncu / tur
  let newIdx = idx + 1;
  let newRound = roomData.round || 1;
  const orderLen = (roomData.playerOrder || []).length;

  if (newIdx >= orderLen) {
    newIdx = 0;
    newRound += 1;
    ups[`rooms/${currentRoomId}/round`] = newRound;
  }
  ups[`rooms/${currentRoomId}/currentTurnIndex`] = newIdx;

  await update(ref(db), ups);

  const nextPid = roomData.playerOrder[newIdx];
  const msg = autoEnd
    ? `${me.name} süresi doldu! Sıra ${roomData.players?.[nextPid]?.name || "?"} oyuncusunda.`
    : `Sıra ${roomData.players?.[nextPid]?.name || "?"} oyuncusunda.`;
  pushNotification(msg);
}

// Oda içi global bildirim
function pushNotification(text) {
  if (!currentRoomId) return;
  const nref = ref(db, `rooms/${currentRoomId}/notifications`);
  const key = crypto.randomUUID();
  update(nref, { [key]: { text, timestamp: Date.now() } });
}

// Oyun ekranı gösterildiğinde tur saatini yönet (oda değişimlerini dinle)
const gameObserver = new MutationObserver(() => {
  if (document.getElementById("game-container").style.display !== "none" && roomData) {
    if (roomData.gameState === "started" && isMyTurn()) startTurnTimer();
    else stopTurnTimer();
  }
});
gameObserver.observe(document.getElementById("game-container"), { attributes: true, attributeFilter: ["style"] });

// ==================== Asker İşlemleri ====================
document.getElementById("open-military-btn").addEventListener("click", () => {
  document.getElementById("military-popup").style.display =
    document.getElementById("military-popup").style.display === "flex" ? "none" : "flex";
});
document.getElementById("close-military-btn").addEventListener("click", () => {
  document.getElementById("military-popup").style.display = "none";
});

document.getElementById("attack-btn").addEventListener("click", attack);
async function attack() {
  if (!roomData) return;
  if (!isMyTurn()) return showNotification("Sıranız değil!", "error");
  if (!selectedCountry) return showNotification("Bir ülke seçin!", "error");

  const soldiers = parseInt(document.getElementById("attack-soldiers").value || "0", 10);
  if (isNaN(soldiers) || soldiers <= 0) return showNotification("Geçerli asker sayısı girin!", "error");

  const att = roomData.players[currentUser.uid];
  if (att.petrol < soldiers) return showNotification(`Bu saldırı için ${soldiers} varil petrol gerekli!`, "error");

  const target = roomData.countryData[selectedCountry];
  if (!target) return;

  // İlk 3 tur sadece sahipsiz ülke
  if ((roomData.round || 1) < 4 && target.owner && target.owner !== currentUser.uid) {
    return showNotification("İlk 3 tur yalnızca sahipsiz ülkelere saldırabilirsiniz!", "error");
  }

  // Saldırmazlık paktı kontrolü
  if (target.owner && target.owner !== currentUser.uid) {
    if (hasActivePact(currentUser.uid, target.owner)) {
      return showNotification("Bu oyuncu ile saldırmazlık paktınız var!", "error");
    }
  }

  if (soldiers > att.soldiers) return showNotification("Yeterli askeriniz yok!", "error");

  const ups = {};
  // Petrol gideri
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = att.petrol - soldiers;

  // Kendi ülkesine garnizon ekleme
  if (target.owner === currentUser.uid) {
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = (target.soldiers || 0) + soldiers;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = att.soldiers - soldiers;
    await update(ref(db), ups);
    immediateOilReward(currentUser.uid); // saldırı sonrası petrol ödülü (toplam üretim)
    pushNotification(`${att.name} kendi ülkesine asker taşıdı (${selectedCountry}).`);
    showNotification(`${selectedCountry} ülkesine ${soldiers} asker yerleştirildi.`, "success");
    return nextTurn(false);
  }

  // Saldırı: kale hasarı
  let effectiveAttackers = soldiers;
  if (target.castleDefenseLevel > 0) {
    const defPerc = target.castleDefenseLevel * 5;
    const killed = Math.floor((defPerc / 100) * effectiveAttackers);
    effectiveAttackers = Math.max(0, effectiveAttackers - killed);
  }

  let resultTxt = "";
  if (effectiveAttackers > (target.soldiers || 0)) {
    // Fetih
    const remain = effectiveAttackers - (target.soldiers || 0);
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = remain;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/owner`] = currentUser.uid;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters`] = {};

    // Savunucudan ülkeyi çıkar
    if (target.owner && roomData.players[target.owner]) {
      const defList = (roomData.players[target.owner].countries || []).filter(x => x !== selectedCountry);
      ups[`rooms/${currentRoomId}/players/${target.owner}/countries`] = defList;
    }
    // Bana ekle
    const myList = new Set(att.countries || []);
    myList.add(selectedCountry);
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/countries`] = Array.from(myList);

    // Asker stoktan düş
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = att.soldiers - soldiers;

    resultTxt = `${selectedCountry} fethedildi!`;
  } else {
    // Savunuldu
    const remainDef = (target.soldiers || 0) - effectiveAttackers;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = remainDef;
    // Asker stoktan düş
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = att.soldiers - soldiers;
    resultTxt = `${selectedCountry} savunuldu!`;
  }

  await update(ref(db), ups);
  immediateOilReward(currentUser.uid);
  pushNotification(`${att.name} → ${selectedCountry}. ${resultTxt}`);
  showNotification(resultTxt);
  nextTurn(false);
}

function immediateOilReward(playerId) {
  if (!roomData?.players?.[playerId]) return;
  const p = roomData.players[playerId];
  let totalOil = 0;
  (p.countries || []).forEach((cn) => {
    const c = roomData.countryData?.[cn];
    if (!c?.oilProduction) return;
    const eff = Math.floor(c.oilProduction * (1 + 0.15 * (c.refineries || 0)));
    totalOil += eff;
  });
  if (totalOil > 0) {
    const newVal = (p.petrol || 0) + totalOil;
    set(ref(db, `rooms/${currentRoomId}/players/${playerId}/petrol`), newVal);
    showNotification(`Saldırı sonrası petrol: +${totalOil} varil`);
    pushNotification(`${p.name} saldırı sonrası +${totalOil} petrol kazandı!`);
  }
}

// Asker satın al
document.getElementById("buy-soldiers-btn").addEventListener("click", async () => {
  if (!isMyTurn()) return showNotification("Sıranız değil!", "error");
  const count = parseInt(document.getElementById("soldiers-to-buy").value || "0", 10);
  if (isNaN(count) || count <= 0) return showNotification("Geçerli sayı girin!", "error");

  const me = roomData.players[currentUser.uid];
  const costMoney = 10 * count;
  const costWheat = 25 * count;
  if (me.money < costMoney) return showNotification("Yeterli paranız yok!", "error");
  if (me.wheat < costWheat) return showNotification("Yeterli buğdayınız yok!", "error");

  await update(ref(db), {
    [`rooms/${currentRoomId}/players/${currentUser.uid}/money`]: me.money - costMoney,
    [`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`]: me.wheat - costWheat,
    [`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`]: (me.soldiers || 0) + count
  });
  pushNotification(`${me.name} ${count} asker satın aldı.`);
  showNotification(`${count} asker satın alındı.`, "success");
});

// Asker çek
document.getElementById("pull-soldiers-btn").addEventListener("click", async () => {
  if (!isMyTurn()) return showNotification("Sıranız değil!", "error");
  if (!selectedCountry) return showNotification("Bir ülke seçin!", "error");

  const num = parseInt(document.getElementById("pull-soldiers-count").value || "0", 10);
  if (isNaN(num) || num <= 0) return showNotification("Geçerli asker sayısı girin!", "error");

  const me = roomData.players[currentUser.uid];
  const c = roomData.countryData[selectedCountry];
  if (!c) return;

  const ups = {};
  if (c.owner === currentUser.uid) {
    // Destek hariç çekilebilir
    let totalSup = 0;
    Object.values(c.supporters || {}).forEach(v => totalSup += (v || 0));
    const occupant = (c.soldiers || 0) - totalSup;
    if (occupant < num) return showNotification("Destek hariç bu kadar çekemezsiniz!", "error");

    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = (c.soldiers || 0) - num;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = (me.soldiers || 0) + num;
    await update(ref(db), ups);
    pushNotification(`${me.name}, ${selectedCountry} ülkesinden ${num} asker çekti.`);
    showNotification("Asker çekildi.", "success");
  } else {
    // Destek askeri çekme
    const mySup = c.supporters?.[currentUser.uid] || 0;
    if (mySup < num) return showNotification("Bu ülkede o kadar destek yok!", "error");
    if ((c.soldiers || 0) < num) return showNotification("Ülkede yeterli asker yok!", "error");

    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = (c.soldiers || 0) - num;
    const newSup = mySup - num;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = (me.soldiers || 0) + num;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters/${currentUser.uid}`] = newSup > 0 ? newSup : null;

    await update(ref(db), ups);
    pushNotification(`${me.name}, ${selectedCountry} ülkesindeki destek askerlerinden ${num} çekti.`);
    showNotification("Asker çekildi.", "success");
  }
});

// Askeri Destek
document.getElementById("send-support-btn").addEventListener("click", async () => {
  if (!isMyTurn()) return showNotification("Sıranız değil!", "error");
  const rec = document.getElementById("support-recipient").value;
  const cn = document.getElementById("support-recipient-country").value;
  const num = parseInt(document.getElementById("support-soldiers").value || "0", 10);
  if (!rec || !cn || isNaN(num) || num <= 0) return showNotification("Oyuncu/ülke/asker sayısı gerekli!", "error");

  const me = roomData.players[currentUser.uid];
  if (me.soldiers < num) return showNotification("Yeterli asker yok!", "error");

  const tc = roomData.countryData[cn];
  if (!tc || tc.owner !== rec) return showNotification("Bu ülke hedef oyuncuya ait değil!", "error");

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = me.soldiers - num;
  ups[`rooms/${currentRoomId}/countryData/${cn}/soldiers`] = (tc.soldiers || 0) + num;
  const oldSup = tc.supporters?.[currentUser.uid] || 0;
  ups[`rooms/${currentRoomId}/countryData/${cn}/supporters/${currentUser.uid}`] = oldSup + num;

  await update(ref(db), ups);
  pushNotification(`${me.name}, ${roomData.players[rec].name} (${cn}) ülkesine ${num} asker destek verdi.`);
  showNotification("Askeri destek gönderildi!", "success");
});

// Destek alıcı listeleri
function updateSupportRecipientSelect() {
  const sel = document.getElementById("support-recipient");
  if (!sel || !roomData?.playerOrder) return;
  sel.innerHTML = "<option value=''>--Oyuncu Seç--</option>";
  roomData.playerOrder.forEach((pid) => {
    if (pid !== currentUser.uid && roomData.players?.[pid]) {
      const o = document.createElement("option");
      o.value = pid;
      o.textContent = roomData.players[pid].name;
      sel.appendChild(o);
    }
  });
}
document.getElementById("support-recipient").addEventListener("change", function () {
  const sc = document.getElementById("support-recipient-country");
  sc.innerHTML = "<option value=''>--Ülke Seç--</option>";
  const pid = this.value;
  if (!pid) return;
  const list = roomData.players?.[pid]?.countries || [];
  list.forEach((cn) => {
    const opt = document.createElement("option");
    opt.value = cn;
    opt.textContent = cn;
    sc.appendChild(opt);
  });
});

// ==================== Kaynak Gönderme ====================
document.getElementById("open-resource-btn").addEventListener("click", () => {
  document.getElementById("resource-popup").style.display =
    document.getElementById("resource-popup").style.display === "flex" ? "none" : "flex";
});
document.getElementById("close-resource-btn").addEventListener("click", () => {
  document.getElementById("resource-popup").style.display = "none";
});

["send-money-btn","send-petrol-btn","send-wheat-btn"].forEach(id => {
  document.getElementById(id).addEventListener("click", sendResource);
});

function sendResource(e) {
  if (!isMyTurn()) return showNotification("Sıranız değil!", "error");
  const id = e.currentTarget.id;
  let amt = 0, rec = "", me = roomData.players[currentUser.uid];
  const ups = {};

  if (id === "send-money-btn") {
    amt = parseInt(document.getElementById("money-to-send").value || "0", 10);
    rec = document.getElementById("recipient-player").value;
    if (isNaN(amt) || amt <= 0 || !rec) return showNotification("Geçerli miktar/alıcı.", "error");
    if (me.money < amt) return showNotification("Yeterli para yok!", "error");
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = me.money - amt;
    ups[`rooms/${currentRoomId}/players/${rec}/money`] = (roomData.players[rec].money || 0) + amt;
    pushNotification(`${me.name} → ${roomData.players[rec].name}: ${amt}$`);
    showNotification(`${amt}$ gönderildi.`, "success");
  } else if (id === "send-petrol-btn") {
    amt = parseInt(document.getElementById("petrol-to-send").value || "0", 10);
    rec = document.getElementById("recipient-player-petrol").value;
    if (isNaN(amt) || amt <= 0 || !rec) return showNotification("Geçerli miktar/alıcı.", "error");
    if (me.petrol < amt) return showNotification("Yeterli petrol yok!", "error");
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = me.petrol - amt;
    ups[`rooms/${currentRoomId}/players/${rec}/petrol`] = (roomData.players[rec].petrol || 0) + amt;
    pushNotification(`${me.name} → ${roomData.players[rec].name}: ${amt} varil petrol`);
    showNotification(`${amt} varil petrol gönderildi.`, "success");
  } else {
    amt = parseInt(document.getElementById("wheat-to-send").value || "0", 10);
    rec = document.getElementById("recipient-player-wheat").value;
    if (isNaN(amt) || amt <= 0 || !rec) return showNotification("Geçerli miktar/alıcı.", "error");
    if (me.wheat < amt) return showNotification("Yeterli buğday yok!", "error");
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = me.wheat - amt;
    ups[`rooms/${currentRoomId}/players/${rec}/wheat`] = (roomData.players[rec].wheat || 0) + amt;
    pushNotification(`${me.name} → ${roomData.players[rec].name}: ${amt} buğday`);
    showNotification(`${amt} buğday gönderildi.`, "success");
  }
  update(ref(db), ups);
}

// Alıcı selectlerini güncelle
function updateRecipientSelects() {
  const moneySel = document.getElementById("recipient-player");
  const petrolSel = document.getElementById("recipient-player-petrol");
  const wheatSel = document.getElementById("recipient-player-wheat");
  if (!moneySel || !petrolSel || !wheatSel || !roomData?.playerOrder) return;

  [moneySel, petrolSel, wheatSel].forEach(s => s.innerHTML = "");
  roomData.playerOrder.forEach((pid) => {
    if (pid === currentUser.uid || !roomData.players?.[pid]) return;
    ["moneySel","petrolSel","wheatSel"].forEach(() => {}); // no-op for readability
    const n = roomData.players[pid].name;
    const mk = (val) => { const o = document.createElement("option"); o.value = pid; o.textContent = n; return o; };
    moneySel.appendChild(mk(pid));
    petrolSel.appendChild(mk(pid));
    wheatSel.appendChild(mk(pid));
  });
}

// ==================== Bina Kurma ====================
document.getElementById("open-building-btn").addEventListener("click", () => {
  document.getElementById("building-popup").style.display =
    document.getElementById("building-popup").style.display === "flex" ? "none" : "flex";
  updateCastleUpgradeCostUI();
});
document.getElementById("close-building-btn").addEventListener("click", () => {
  document.getElementById("building-popup").style.display = "none";
});

document.getElementById("buy-barracks-btn").addEventListener("click", () => buildStructure("barracks"));
document.getElementById("build-factory-btn").addEventListener("click", () => buildStructure("factory"));
document.getElementById("build-refinery-btn").addEventListener("click", () => buildStructure("refinery"));
document.getElementById("build-grainmill-btn").addEventListener("click", () => buildStructure("grainmill"));
document.getElementById("build-castle-btn").addEventListener("click", buildCastle);
document.getElementById("upgrade-castle-btn").addEventListener("click", upgradeCastle);

async function buildStructure(kind) {
  if (!isMyTurn()) return showNotification("Sıranız değil!", "error");
  if (!selectedCountry) return showNotification("Bir ülke seçin!", "error");
  const cd = roomData.countryData[selectedCountry];
  if (!cd || cd.owner !== currentUser.uid) return showNotification("Bu ülke size ait değil!", "error");

  const me = roomData.players[currentUser.uid];
  let q = 0, costM = 0, costP = 0, costW = 0, field = "";

  if (kind === "barracks") {
    q = parseInt(document.getElementById("barracks-quantity").value || "0", 10);
    if (isNaN(q) || q <= 0) return showNotification("Geçerli kışla sayısı!", "error");
    costM = 300*q; costP = 50*q; costW = 120*q; field = "barracksCount";
  } else if (kind === "factory") {
    q = parseInt(document.getElementById("factory-quantity").value || "0", 10);
    if (isNaN(q) || q <= 0) return showNotification("Geçerli fabrika sayısı!", "error");
    costM = 500*q; costP = 130*q; field = "factories";
  } else if (kind === "refinery") {
    q = parseInt(document.getElementById("refinery-quantity").value || "0", 10);
    if (isNaN(q) || q <= 0) return showNotification("Geçerli rafine sayısı!", "error");
    costM = 800*q; costP = 250*q; field = "refineries";
  } else {
    q = parseInt(document.getElementById("grainmill-quantity").value || "0", 10);
    if (isNaN(q) || q <= 0) return showNotification("Geçerli değirmen sayısı!", "error");
    costM = 200*q; costP = 100*q; field = "grainMills";
  }

  if (me.money < costM || me.petrol < costP || me.wheat < costW) {
    return showNotification("Yeterli kaynak yok!", "error");
  }

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`]  = me.money  - costM;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = me.petrol - costP;
  if (costW > 0) ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`]  = me.wheat  - costW;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/${field}`] = (cd[field] || 0) + q;

  await update(ref(db), ups);
  pushNotification(`${me.name}, ${selectedCountry} ülkesine ${q} ${kind} kurdu.`);
  showNotification(`${q} ${kind} kuruldu!`, "success");
}

async function buildCastle() {
  if (!isMyTurn()) return showNotification("Sıranız değil!", "error");
  if (!selectedCountry) return showNotification("Bir ülke seçin!", "error");
  const cd = roomData.countryData[selectedCountry];
  if (!cd || cd.owner !== currentUser.uid) return showNotification("Bu ülke size ait değil!", "error");
  if (cd.castleDefenseLevel > 0) return showNotification("Bu ülkede zaten kale var!", "error");

  const me = roomData.players[currentUser.uid];
  if (me.money < 1000 || me.petrol < 1000 || me.wheat < 1000) {
    return showNotification("Kale için yeterli kaynak yok!", "error");
  }

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`]  = me.money  - 1000;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = me.petrol - 1000;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`]  = me.wheat  - 1000;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleDefenseLevel`] = 1;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleNextUpgradeCost`] = { money:1300, petrol:1300, wheat:1300 };

  await update(ref(db), ups);
  pushNotification(`${me.name}, ${selectedCountry} ülkesine kale kurdu.`);
  showNotification("Kale kuruldu (%5).", "success");
  updateCastleUpgradeCostUI();
}

async function upgradeCastle() {
  if (!isMyTurn()) return showNotification("Sıranız değil!", "error");
  if (!selectedCountry) return showNotification("Bir ülke seçin!", "error");
  const cd = roomData.countryData[selectedCountry];
  if (!cd || cd.owner !== currentUser.uid) return showNotification("Bu ülke size ait değil!", "error");
  if (cd.castleDefenseLevel < 1) return showNotification("Önce kale kurun!", "error");
  if (cd.castleDefenseLevel >= 6) return showNotification("Maks seviye (%30)!", "error");
  if (!cd.castleNextUpgradeCost) return showNotification("Yükseltme verisi yok!", "error");

  const me = roomData.players[currentUser.uid];
  const cost = cd.castleNextUpgradeCost;
  if (me.money < cost.money || me.petrol < cost.petrol || me.wheat < cost.wheat) {
    return showNotification("Yeterli kaynak yok!", "error");
  }

  const newLvl = cd.castleDefenseLevel + 1;
  const nm = Math.floor(cost.money * 1.3);
  const np = Math.floor(cost.petrol * 1.3);
  const nw = Math.floor(cost.wheat * 1.3);

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`]  = me.money - cost.money;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = me.petrol - cost.petrol;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`]  = me.wheat - cost.wheat;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleDefenseLevel`] = newLvl;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleNextUpgradeCost`] = { money:nm, petrol:np, wheat:nw };

  await update(ref(db), ups);
  pushNotification(`${me.name}, ${selectedCountry} kalesini güçlendirdi (Seviye ${newLvl}).`);
  showNotification(`Kale güçlendirildi (%${newLvl * 5}).`, "success");
  updateCastleUpgradeCostUI();
}

function updateCastleUpgradeCostUI() {
  const span = document.getElementById("castle-upgrade-cost-text");
  if (!span) return;
  if (!selectedCountry || !roomData?.countryData?.[selectedCountry]) {
    span.textContent = "-";
    return;
  }
  const cd = roomData.countryData[selectedCountry];
  if ((cd.castleDefenseLevel || 0) < 1) {
    span.textContent = "Önce kale kurulmalı.";
    return;
  }
  if (cd.castleDefenseLevel >= 6) {
    span.textContent = "Maks seviye (%30)!";
    return;
  }
  const c = cd.castleNextUpgradeCost;
  span.textContent = c ? `${c.money}$ + ${c.petrol} Varil + ${c.wheat} Buğday` : "-";
}

// ==================== Saldırmazlık Pakti ====================
document.getElementById("open-pact-btn").addEventListener("click", () => {
  document.getElementById("pact-popup").style.display =
    document.getElementById("pact-popup").style.display === "flex" ? "none" : "flex";
});
document.getElementById("close-pact-btn").addEventListener("click", () => {
  document.getElementById("pact-popup").style.display = "none";
});

document.getElementById("send-pact-offer-btn").addEventListener("click", async () => {
  if (!isMyTurn()) return showNotification("Pakt teklifini sadece kendi sıranızda yapabilirsiniz!", "error");
  const rec = document.getElementById("pact-offer-recipient").value;
  const dur = parseInt(document.getElementById("pact-duration").value || "0", 10);
  const cst = parseInt(document.getElementById("pact-cost").value || "0", 10);
  if (!rec || rec === currentUser.uid) return showNotification("Geçerli bir oyuncu seçin!", "error");
  if (isNaN(dur) || dur <= 0) return showNotification("Geçerli tur sayısı!", "error");
  if (isNaN(cst) || cst < 0) return showNotification("Para miktarı geçersiz!", "error");
  if (hasActivePact(currentUser.uid, rec)) return showNotification("Zaten aktif pakt var!", "error");

  const offRef = ref(db, `rooms/${currentRoomId}/pactOffers/${crypto.randomUUID()}`);
  const offerObj = {
    offerId: offRef.key,
    senderId: currentUser.uid,
    senderName: roomData.players[currentUser.uid].name,
    recipientId: rec,
    duration: dur,
    cost: cst,
    status: "pending"
  };
  await set(offRef, offerObj);
  pushNotification(`Pakt Teklifi: ${offerObj.senderName} → ${roomData.players[rec].name} (Tur:${dur}, Para:${cst}$)`);
  showNotification("Pakt teklifi gönderildi!", "success");
});

function hasActivePact(a, b) {
  if (!roomData?.pacts) return false;
  const nowRound = roomData.round || 1;
  return Object.values(roomData.pacts).some(pk =>
    pk.active && nowRound <= pk.expirationRound &&
    ((pk.playerA === a && pk.playerB === b) || (pk.playerA === b && pk.playerB === a))
  );
}

function displayPendingPactOffers() {
  const c = document.getElementById("pact-pending-offers");
  if (!c) return;
  c.innerHTML = "";
  const offers = roomData?.pactOffers || {};
  Object.values(offers).forEach(off => {
    if (off.status === "pending" && off.recipientId === currentUser.uid) {
      const d = document.createElement("div");
      d.className = "pact-offer-item";
      d.innerHTML = `
        <p><strong>${off.senderName}</strong> size saldırmazlık pakti teklif ediyor.</p>
        <p>Tur: ${off.duration}, Para: ${off.cost}$</p>
        <button class="accept-btn" data-id="${off.offerId}">Kabul</button>
        <button class="reject-btn" data-id="${off.offerId}">Reddet</button>
      `;
      c.appendChild(d);
    }
  });
}
function displayActivePacts() {
  const con = document.getElementById("active-pacts-container");
  if (!con) return;
  con.innerHTML = "";
  const nowRound = roomData?.round || 1;
  const pacts = roomData?.pacts || {};
  Object.values(pacts).forEach(pk => {
    if (pk.active && nowRound <= pk.expirationRound &&
        (pk.playerA === currentUser.uid || pk.playerB === currentUser.uid)) {
      const other = pk.playerA === currentUser.uid ? pk.playerB : pk.playerA;
      const otherName = roomData.players?.[other]?.name || "???";
      const left = pk.expirationRound - nowRound + 1;
      const d = document.createElement("div");
      d.className = "active-pact-item";
      d.innerHTML = `<p>Pakt: <strong>${otherName}</strong></p><p>Kalan Tur: <strong>${left}</strong></p>`;
      con.appendChild(d);
    }
  });
}
document.getElementById("pact-pending-offers").addEventListener("click", async (e) => {
  if (!(e.target instanceof HTMLElement)) return;
  const id = e.target.dataset.id;
  if (!id) return;
  const off = roomData?.pactOffers?.[id];
  if (!off || off.status !== "pending") return;

  if (e.target.classList.contains("accept-btn")) {
    if (hasActivePact(off.senderId, off.recipientId)) {
      await update(ref(db), { [`rooms/${currentRoomId}/pactOffers/${id}/status`]: "rejected" });
      return showNotification("Zaten aktif pakt var!", "error");
    }
    const s = roomData.players[off.senderId];
    const r = roomData.players[off.recipientId];
    if (!s || !r) return;

    if ((s.money || 0) < off.cost) {
      await update(ref(db), { [`rooms/${currentRoomId}/pactOffers/${id}/status`]: "rejected" });
      return showNotification("Gönderenin parası yok! Geçersiz.", "error");
    }

    const pkId = crypto.randomUUID();
    const exRound = (roomData.round || 1) + off.duration;
    const ups = {};
    ups[`rooms/${currentRoomId}/pactOffers/${id}/status`] = "accepted";
    ups[`rooms/${currentRoomId}/players/${off.senderId}/money`] = s.money - off.cost;
    ups[`rooms/${currentRoomId}/players/${off.recipientId}/money`] = (r.money || 0) + off.cost;
    ups[`rooms/${currentRoomId}/pacts/${pkId}`] = {
      playerA: off.senderId,
      playerB: off.recipientId,
      active: true,
      cost: off.cost,
      duration: off.duration,
      expirationRound: exRound
    };
    await update(ref(db), ups);
    pushNotification(`Pakt: ${s.name} & ${r.name} (Tur:${off.duration}, Para:${off.cost}$).`);
    showNotification("Pakt teklifi kabul edildi!", "success");
  } else if (e.target.classList.contains("reject-btn")) {
    await update(ref(db), { [`rooms/${currentRoomId}/pactOffers/${id}/status`]: "rejected" });
    pushNotification(`Pakt teklifi reddedildi: ${off.senderName}`);
    showNotification("Pakt teklifi reddedildi.");
  }
});

// Pakt alıcı seçenekleri
function updatePactRecipientSelect() {
  const sel = document.getElementById("pact-offer-recipient");
  if (!sel) return;
  sel.innerHTML = "";
  if (!roomData?.playerOrder) return;
  roomData.playerOrder.forEach((pid) => {
    if (pid !== currentUser.uid && roomData.players?.[pid]) {
      const o = document.createElement("option");
      o.value = pid;
      o.textContent = roomData.players[pid].name;
      sel.appendChild(o);
    }
  });
}

// ==================== Market (Ticaret) ====================
document.getElementById("open-market-btn").addEventListener("click", () => {
  const el = document.getElementById("market-popup");
  el.style.display = el.style.display === "flex" ? "none" : "flex";
});
document.getElementById("close-market-btn").addEventListener("click", () => {
  document.getElementById("market-popup").style.display = "none";
});

document.getElementById("create-trade-offer-btn").addEventListener("click", async () => {
  if (!isMyTurn()) return showNotification("Sadece kendi sıranızda teklif oluşturabilirsiniz!", "error");
  const itemType = document.getElementById("trade-item-type").value;
  const qty = parseInt(document.getElementById("trade-quantity").value || "0", 10);
  const price = parseInt(document.getElementById("trade-price").value || "0", 10);
  if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) return showNotification("Geçerli miktar/fiyat!", "error");

  const me = roomData.players[currentUser.uid];
  if (itemType === "petrol" && me.petrol < qty) return showNotification("Yeterli petrol yok!", "error");
  if (itemType === "wheat"  && me.wheat  < qty) return showNotification("Yeterli buğday yok!", "error");

  // Ambargo listesi
  const embargoSel = document.getElementById("embargo-players");
  const embargo = [];
  for (let i = 0; i < embargoSel.options.length; i++) {
    if (embargoSel.options[i].selected) embargo.push(embargoSel.options[i].value);
  }

  const key = crypto.randomUUID();
  await set(ref(db, `rooms/${currentRoomId}/tradeOffers/${key}`), {
    offerId: key,
    sellerId: currentUser.uid,
    sellerName: me.name,
    itemType,
    quantity: qty,
    price,
    status: "pending",
    embargo
  });

  pushNotification(`${me.name} ticaret teklifi oluşturdu (${itemType}, adet:${qty}, fiyat:${price}$).`);
  showNotification("Ticaret teklifi oluşturuldu!", "success");
});

function displayTradeOffers() {
  const div = document.getElementById("trade-offers-list");
  if (!div) return;
  div.innerHTML = "";

  const offers = roomData?.tradeOffers || {};
  Object.values(offers).forEach((o) => {
    if (o.status !== "pending") return;
    if (Array.isArray(o.embargo) && o.embargo.includes(currentUser.uid)) return;

    const d = document.createElement("div");
    d.className = "offer-item";
    let html = `
      <p><strong>Satıcı:</strong> ${o.sellerName}</p>
      <p><strong>Ürün:</strong> ${o.itemType === "petrol" ? "Petrol" : "Buğday"}</p>
      <p><strong>Mevcut Miktar:</strong> ${o.quantity}</p>
      <p><strong>Birim Fiyat:</strong> ${o.price} $</p>
    `;

    if (o.sellerId !== currentUser.uid) {
      html += `
        <label style="font-size:14px;color:#ccc;">Almak istediğiniz miktar:</label>
        <input type="number" class="partial-buy-quantity" placeholder="Miktar" min="1" max="${o.quantity}" />
        <button class="partial-buy-btn" data-id="${o.offerId}">Satın Al</button>
      `;
    } else {
      html += `
        <button class="cancel-offer-btn" data-id="${o.offerId}" style="background:linear-gradient(45deg, #c0392b, #e74c3c); margin-top:10px;">İptal Et</button>
      `;
    }

    if (o.embargo?.length) {
      const embUsers = o.embargo.map(id => roomData.players?.[id]?.name || "???").join(", ");
      html += `<p style="color:red;"><strong>Ambargo:</strong> ${embUsers}</p>`;
    }

    d.innerHTML = html;
    div.appendChild(d);
  });
}

// Satın alma / iptal handler
document.getElementById("trade-offers-list").addEventListener("click", async (e) => {
  if (!(e.target instanceof HTMLElement)) return;
  const id = e.target.dataset.id;
  if (!id) return;

  const offer = roomData?.tradeOffers?.[id];
  if (!offer || offer.status !== "pending") return;

  if (e.target.classList.contains("partial-buy-btn")) {
    const card = e.target.closest(".offer-item");
    const inp = card.querySelector(".partial-buy-quantity");
    const amt = parseInt(inp.value || "0", 10);
    if (isNaN(amt) || amt <= 0) return showNotification("Geçerli miktar!", "error");
    if (amt > offer.quantity) return showNotification("Teklifte yeterli stok yok!", "error");

    const buyer = roomData.players[currentUser.uid];
    const seller = roomData.players[offer.sellerId];
    const total = offer.price * amt;
    if (buyer.money < total) return showNotification("Yeterli paranız yok!", "error");

    const ups = {};
    // Stok kontrol & transfer
    if (offer.itemType === "petrol") {
      if (seller.petrol < amt) return showNotification("Satıcının petrol stoğu yetersiz!", "error");
      ups[`rooms/${currentRoomId}/players/${offer.sellerId}/petrol`] = seller.petrol - amt;
      ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = (buyer.petrol || 0) + amt;
    } else {
      if (seller.wheat < amt) return showNotification("Satıcının buğday stoğu yetersiz!", "error");
      ups[`rooms/${currentRoomId}/players/${offer.sellerId}/wheat`] = seller.wheat - amt;
      ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = (buyer.wheat || 0) + amt;
    }
    // Para
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = buyer.money - total;
    ups[`rooms/${currentRoomId}/players/${offer.sellerId}/money`] = (seller.money || 0) + total;

    const left = offer.quantity - amt;
    ups[`rooms/${currentRoomId}/tradeOffers/${id}/quantity`] = left;
    if (left <= 0) ups[`rooms/${currentRoomId}/tradeOffers/${id}/status`] = "completed";

    await update(ref(db), ups);
    pushNotification(`Ticaret: ${seller.name} -> ${buyer.name} (${amt} x ${offer.itemType}).`);
    showNotification("Ticaret başarıyla gerçekleşti!", "success");
  } else if (e.target.classList.contains("cancel-offer-btn")) {
    if (offer.sellerId !== currentUser.uid) return showNotification("Sadece kendi teklifinizi iptal edebilirsiniz!", "error");
    await update(ref(db), { [`rooms/${currentRoomId}/tradeOffers/${id}/status`]: "cancelled" });
    pushNotification(`Ticaret teklifi iptal edildi: ${offer.sellerName}`);
    showNotification("Teklif iptal edildi.");
  }
});

// Ambargo select
function updateEmbargoPlayersSelect() {
  const sel = document.getElementById("embargo-players");
  if (!sel) return;
  sel.innerHTML = "";
  if (!roomData?.playerOrder) return;
  roomData.playerOrder.forEach((pid) => {
    if (pid !== currentUser.uid && roomData.players?.[pid]) {
      const o = document.createElement("option");
      o.value = pid;
      o.textContent = roomData.players[pid].name;
      sel.appendChild(o);
    }
  });
}

// ==================== Chat ====================
document.getElementById("open-chat-btn").addEventListener("click", () => toggleChat(true));
document.getElementById("close-chat-btn").addEventListener("click", () => toggleChat(false));
document.getElementById("send-chat-btn").addEventListener("click", sendChatMessage);
document.getElementById("chat-input").addEventListener("keypress", (e) => { if (e.key === "Enter") sendChatMessage(); });
document.getElementById("send-private-message-btn").addEventListener("click", sendPrivateMessage);

function toggleChat(show) {
  const cPop = document.getElementById("chat-popup");
  cPop.style.display = show ? "flex" : "none";
  chatOpen = show;
  if (chatOpen) {
    unreadMessages = 0;
    updateChatBadge();
  }
}

function updateChatBadge() {
  const btn = document.getElementById("open-chat-btn");
  btn.dataset.badge = unreadMessages > 0 ? String(unreadMessages) : "";
}

function sendChatMessage() {
  if (!currentRoomId) return;
  const input = document.getElementById("chat-input");
  const txt = input.value.trim();
  if (!txt) return;
  const senderName = roomData.players?.[currentUser.uid]?.name || "Anon";
  const msgRef = ref(db, `rooms/${currentRoomId}/chat/${crypto.randomUUID()}`);
  set(msgRef, {
    sender: senderName,
    senderId: currentUser.uid,
    text: txt,
    recipientId: "",
    timestamp: Date.now()
  }).then(() => (input.value = ""));
}

function sendPrivateMessage() {
  if (!currentRoomId) return;
  const pmInp = document.getElementById("private-message-input");
  const pmRec = document.getElementById("private-message-recipient");
  const txt = pmInp.value.trim();
  const rc = pmRec.value;
  if (!txt || !rc) return;
  const senderName = roomData.players?.[currentUser.uid]?.name || "Anon";
  const msgRef = ref(db, `rooms/${currentRoomId}/chat/${crypto.randomUUID()}`);
  set(msgRef, {
    sender: senderName,
    senderId: currentUser.uid,
    text: txt,
    recipientId: rc,
    timestamp: Date.now()
  }).then(() => {
    pmInp.value = "";
    showNotification("Özel mesaj gönderildi!");
  });
}

// Chat & global notifs listener
let chatListenerInitialized = false;
function ensureChatListeners() {
  if (chatListenerInitialized || !currentRoomId) return;
  const cRef = ref(db, `rooms/${currentRoomId}/chat`);
  const nRef = ref(db, `rooms/${currentRoomId}/notifications`);

  onValue(cRef, (snap) => {
    const chatDiv = document.getElementById("chat-messages");
    chatDiv.innerHTML = "";
    const data = snap.val() || {};
    Object.values(data).sort((a,b) => (a.timestamp||0)-(b.timestamp||0)).forEach(m => appendChatMessage(m));
  });

  onValue(nRef, (snap) => {
    const data = snap.val() || {};
    // Son değerler gösterilir (tek tek animasyon için burada tek tek de işlenebilir)
    // Basitçe son 5 bildirimi gösterelim
    const last = Object.values(data).sort((a,b)=> (a.timestamp||0)-(b.timestamp||0)).slice(-5);
    last.forEach(n => n.text && displayGlobalNotification(n.text));
  });

  chatListenerInitialized = true;
}

function appendChatMessage(m) {
  // PM filtresi
  if (m.recipientId && m.recipientId !== "" && m.senderId !== currentUser.uid && m.recipientId !== currentUser.uid) {
    return;
  }
  const chatDiv = document.getElementById("chat-messages");
  const d = document.createElement("div");
  if (m.recipientId && m.recipientId !== "") {
    const targName = roomData.players?.[m.recipientId]?.name || "???";
    d.innerHTML = m.senderId === currentUser.uid
      ? `<strong>[PM to ${targName}]:</strong> ${m.text}`
      : `<strong>[PM from ${m.sender}]:</strong> ${m.text}`;
    d.style.color = "#f39c12";
  } else {
    d.textContent = `${m.sender}: ${m.text}`;
  }
  chatDiv.appendChild(d);
  chatDiv.scrollTop = chatDiv.scrollHeight;

  if (!chatOpen && m.senderId !== currentUser.uid) {
    unreadMessages++;
    updateChatBadge();
  }
}

function displayGlobalNotification(text) {
  if (notificationsMuted) return;
  const area = document.getElementById("notification-area");
  if (!area) return;
  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = text;
  area.appendChild(item);
  setTimeout(() => area.contains(item) && area.removeChild(item), 6500);
}

// PM alıcıları
function updatePrivateMessageRecipientSelect() {
  const sel = document.getElementById("private-message-recipient");
  if (!sel) return;
  sel.innerHTML = "<option value=''>--Oyuncu Seç--</option>";
  if (!roomData?.playerOrder) return;
  roomData.playerOrder.forEach((pid) => {
    if (pid !== currentUser.uid && roomData.players?.[pid]) {
      const o = document.createElement("option");
      o.value = pid;
      o.textContent = roomData.players[pid].name;
      sel.appendChild(o);
    }
  });
}

// ==================== Oda Veri Değişimlerine Reaksiyon ====================
// 2. kısımda attachRoom içinde showGame() sonrası çalıştığımızda bu çağrıları yapalım:
function refreshDynamicPanels() {
  updateSupportRecipientSelect();
  updateRecipientSelects();
  updatePactRecipientSelect();
  updatePrivateMessageRecipientSelect();
  updateEmbargoPlayersSelect();
  displayPendingPactOffers();
  displayActivePacts();
  displayTradeOffers();

  // Tur saati
  if (roomData?.gameState === "started") {
    if (isMyTurn()) startTurnTimer();
    else stopTurnTimer();
  } else {
    stopTurnTimer();
  }

  ensureChatListeners();
}

// attachRoom içindeki onValue callback'inin SONUNDA şunu çağırmanız yeterli:
// refreshDynamicPanels();

