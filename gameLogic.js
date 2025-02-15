/*******************************************************
 * Firebase Başlatma
 *******************************************************/
const firebaseConfig = {
  apiKey: "AIzaSyCINihMNGs-qRYIIBLzXyeaLnM_Lhp-iwg",
  authDomain: "warmapg-77acb.firebaseapp.com",
  databaseURL: "https://warmapg-77acb-default-rtdb.firebaseio.com",
  projectId: "warmapg-77acb",
  storageBucket: "warmapg-77acb.appspot.com",
  messagingSenderId: "895613631339",
  appId: "1:895613631339:web:a7ecc0cfd8ab3ae7e02a2e",
  measurementId: "G-6SJVLLVDCF"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/*******************************************************
 * GLOBAL DEĞİŞKENLER ve Yardımcı Fonksiyonlar
 *******************************************************/
let localPlayerId = null;
let currentRoomCode = null;
let roomRef = null;
let roomData = null;
let selectedCountry = null;
let map, geoJsonLayer = null;

let localPlayerColor = null;         // Bu oyuncunun seçtiği renk
let chatListenerAdded = false;
let infoCardsPermanent = false;      // Harita üzerindeki info kartları daima açık mı?
let unreadMessages = 0;
let chatOpen = false;
let notificationsMuted = false;

// 60 saniyelik tur zamanlayıcı
let turnTimeRemaining = 60;
let turnTimerInterval = null;

// 30 saniyelik oyun başlat geri sayım (host başlatınca)
let startInterval = null;

// Odaya en fazla 16 oyuncu alınsın
const MAX_PLAYERS = 16;

// Renk seçenekleri (HTML'deki butonlar da bu sıralamayla oluşuyor)
const availableColors = [
  "red", "blue", "green", "yellow",
  "purple", "orange", "brown", "pink",
  "cyan", "magenta", "lime", "navy",
  "maroon", "teal", "olive", "black"
];

/*******************************************************
 * Yardımcı Fonksiyon: Kısa süreli bildirim
 *******************************************************/
function showNotification(message, duration = 3000) {
  if (notificationsMuted) return;
  const notificationArea = document.getElementById("notification-area");
  if (!notificationArea) return;

  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = message;
  notificationArea.appendChild(item);

  setTimeout(() => {
    if (notificationArea.contains(item)) {
      notificationArea.removeChild(item);
    }
  }, duration + 800);
}

/*******************************************************
 * Global Bildirimi (oda içi herkese giden) ekrana yansıtma
 *******************************************************/
function displayGlobalNotification(text) {
  if (notificationsMuted) return;
  const nArea = document.getElementById("notification-area");
  if (!nArea) return;

  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = text;
  nArea.appendChild(item);

  setTimeout(() => {
    if (nArea.contains(item)) {
      nArea.removeChild(item);
    }
  }, 6500);
}

/*******************************************************
 * DB'ye global bildirim yaz (herkes görür)
 *******************************************************/
function broadcastNotification(text) {
  if (!roomRef) return;
  roomRef.child("notifications").push({
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

/*******************************************************
 * Rastgele Oda Kodu
 *******************************************************/
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/*******************************************************
 * Pakt var mı (iki oyuncu arasında)?
 *******************************************************/
function hasActivePact(playerA, playerB) {
  if (!roomData || !roomData.pacts) return false;
  for (let pactId in roomData.pacts) {
    const pact = roomData.pacts[pactId];
    if (pact.active && roomData.round <= pact.expirationRound) {
      if (
        (pact.playerA === playerA && pact.playerB === playerB) ||
        (pact.playerA === playerB && pact.playerB === playerA)
      ) {
        return true;
      }
    }
  }
  return false;
}

/*******************************************************
 * Otomatik Odaya Yeniden Bağlanma (Sayfa yenilemişse)
 *******************************************************/
function autoReconnect() {
  const savedRoomCode = localStorage.getItem("roomCode");
  if (savedRoomCode) {
    const refCheck = db.ref("rooms/" + savedRoomCode);
    refCheck.once("value", (snapshot) => {
      if (!snapshot.exists()) return;
      const savedRoomData = snapshot.val();
      if (!savedRoomData.players || !savedRoomData.players[localPlayerId]) return;
      currentRoomCode = savedRoomCode;
      roomRef = refCheck;
      joinRoomAndListen(); // Oda verilerini dinlemeye başla
      // Arayüz güncelle
      document.body.classList.remove("lobby");
      document.getElementById("lobby-container").style.display = "none";
      document.getElementById("game-container").style.display = "block";
      document.getElementById("display-room-code").textContent = savedRoomCode;
    });
  }
}

/*******************************************************
 * Sıra kontrolü
 *******************************************************/
function isMyTurn() {
  if (!roomData || !roomData.playerOrder) return false;
  if (roomData.gameState !== "started") return false;
  const currentTurnIndex = roomData.currentTurnIndex || 0;
  return roomData.playerOrder[currentTurnIndex] === localPlayerId;
}

/*******************************************************
 * 60 saniyelik turn sayacı
 *******************************************************/
function startTurnTimer() {
  const timerEl = document.getElementById("turn-timer");
  turnTimeRemaining = 60;
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  timerEl.textContent = turnTimeRemaining + "s";

  turnTimerInterval = setInterval(() => {
    turnTimeRemaining--;
    if (turnTimeRemaining <= 0) {
      clearInterval(turnTimerInterval);
      turnTimeRemaining = 0;
      timerEl.textContent = "0s";
      // Süre dolunca otomatik tur geç
      if (roomData && roomData.gameState === "started" && isMyTurn()) {
        nextTurn(true);
      }
    } else {
      timerEl.textContent = turnTimeRemaining + "s";
    }
  }, 1000);
}

function stopTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
  }
  const timerEl = document.getElementById("turn-timer");
  if (timerEl) {
    timerEl.textContent = "60s";
  }
}

/*******************************************************
 * DOMContentLoaded: Lobi (Oda Oluştur/Katıl) Hazırlığı
 *******************************************************/
document.addEventListener("DOMContentLoaded", () => {
  // PlayerId atanmamışsa üret
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  // Renk butonlarını oluştur (Oda Oluştur kısmı)
  const creatorColorDiv = document.getElementById("creator-color-options");
  availableColors.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = "global-color-option";
    btn.style.background = color;
    btn.dataset.color = color;
    creatorColorDiv.appendChild(btn);
  });

  // Renk butonlarını oluştur (Odaya Katıl kısmı)
  const joinColorDiv = document.getElementById("join-color-options");
  availableColors.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = "global-color-option";
    btn.style.background = color;
    btn.dataset.color = color;
    joinColorDiv.appendChild(btn);
  });

  // Renk butonlarına tıklama (seçili yapma)
  // (Lobi oluşturma ve katılma için aynı mantık, sadece localPlayerColor set ediyoruz.)
  document
    .getElementById("creator-color-options")
    .addEventListener("click", (e) => {
      if (e.target.classList.contains("global-color-option")) {
        if (e.target.disabled) return; // Seçilemez
        // Tüm butonlardan "selected"ı kaldır
        document
          .querySelectorAll("#creator-color-options .global-color-option")
          .forEach((btn) => btn.classList.remove("selected"));
        // Seçilene ekle
        e.target.classList.add("selected");
        localPlayerColor = e.target.dataset.color;
      }
    });

  document
    .getElementById("join-color-options")
    .addEventListener("click", (e) => {
      if (e.target.classList.contains("global-color-option")) {
        if (e.target.disabled) return; // Seçilemez
        document
          .querySelectorAll("#join-color-options .global-color-option")
          .forEach((btn) => btn.classList.remove("selected"));
        e.target.classList.add("selected");
        localPlayerColor = e.target.dataset.color;
      }
    });

  // Oda Oluştur
  document.getElementById("create-room-btn").addEventListener("click", () => {
    const playerName = document
      .getElementById("creator-player-name")
      .value.trim();
    if (!playerName) {
      showNotification("Lütfen adınızı girin!");
      return;
    }
    if (!localPlayerColor) {
      showNotification("Lütfen bir renk seçin!");
      return;
    }

    const roomCode = generateRoomCode();
    currentRoomCode = roomCode;
    roomRef = db.ref("rooms/" + roomCode);

    // Yeni oda verisi
    const newRoomData = {
      roomCode: roomCode,
      maxPlayers: MAX_PLAYERS, // 16
      gameState: "waiting",
      currentTurnIndex: 0,
      round: 1,
      playerOrder: [localPlayerId],
      players: {},
      countryData: {},
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    newRoomData.players[localPlayerId] = {
      name: playerName,
      color: localPlayerColor,
      money: 1000,
      soldiers: 0,
      countries: [],
      petrol: 100,
      wheat: 400,
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
      isHost: true
    };

    roomRef.set(newRoomData, (error) => {
      if (error) {
        showNotification("Oda oluşturulurken hata oluştu!");
      } else {
        showNotification("Oda oluşturuldu. Kod: " + roomCode);
        localStorage.setItem("roomCode", roomCode);
        loadAndInitializeGeoJson(); // Ülkeleri (countryData) başlat
        joinRoomAndListen();
        // Arayüz geçişi
        document.body.classList.remove("lobby");
        document.getElementById("lobby-container").style.display = "none";
        document.getElementById("game-container").style.display = "block";
        document.getElementById("display-room-code").textContent = roomCode;
      }
    });
  });

  // Odaya Katıl
  document.getElementById("join-room-btn").addEventListener("click", () => {
    const playerName = document.getElementById("join-player-name").value.trim();
    const roomCodeInput = document
      .getElementById("room-code")
      .value.trim()
      .toUpperCase();
    if (!playerName) {
      showNotification("Lütfen adınızı girin!");
      return;
    }
    if (!localPlayerColor) {
      showNotification("Lütfen bir renk seçin!");
      return;
    }
    if (!roomCodeInput) {
      showNotification("Lütfen oda kodu girin!");
      return;
    }

    currentRoomCode = roomCodeInput;
    roomRef = db.ref("rooms/" + roomCodeInput);

    roomRef.once("value", (snapshot) => {
      if (!snapshot.exists()) {
        showNotification("Böyle bir oda bulunamadı!");
        return;
      }
      const room = snapshot.val();

      // Oyun zaten başlamışsa veya başlamaya yakınsa...
      if (room.gameState !== "waiting") {
        showNotification("Oyun başladı veya başlamak üzere. Katılamazsınız!");
        return;
      }
      // Maks 16 oyuncu
      const playerCount = Object.keys(room.players || {}).length;
      if (playerCount >= MAX_PLAYERS) {
        showNotification("Oda dolu (16/16)!");
        return;
      }

      // Aynı rengi kullanan var mı?
      for (let pid in room.players) {
        if (room.players[pid].color === localPlayerColor) {
          showNotification("Bu renk başka oyuncu tarafından seçilmiş!");
          return;
        }
      }

      const updates = {};
      updates["players/" + localPlayerId] = {
        name: playerName,
        color: localPlayerColor,
        money: 1000,
        soldiers: 0,
        countries: [],
        petrol: 100,
        wheat: 400,
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
        isHost: false
      };
      if (!room.playerOrder) room.playerOrder = [];
      room.playerOrder.push(localPlayerId);
      updates["playerOrder"] = room.playerOrder;

      roomRef.update(updates, (error) => {
        if (error) {
          showNotification("Odaya katılırken hata oluştu!");
        } else {
          showNotification("Odaya katıldınız!");
          localStorage.setItem("roomCode", roomCodeInput);
          joinRoomAndListen();
          // Arayüz
          document.body.classList.remove("lobby");
          document.getElementById("lobby-container").style.display = "none";
          document.getElementById("game-container").style.display = "block";
          document.getElementById("display-room-code").textContent =
            roomCodeInput;
        }
      });
    });
  });

  // Otomatik bağlanma denemesi
  autoReconnect();

  // Bilgi kartları aç/kapa
  document
    .getElementById("toggle-info-cards")
    .addEventListener("click", () => {
      infoCardsPermanent = !infoCardsPermanent;
      updateTooltipsPermanent();
      const icon = document
        .getElementById("toggle-info-cards")
        .querySelector("i");
      icon.className = infoCardsPermanent ? "fas fa-eye" : "fas fa-eye-slash";
    });
});

/*******************************************************
 * GeoJSON + Ülke Verilerini (CountryData) yükleme
 * (Sadece oda kurucusu çağırır)
 *******************************************************/
function loadAndInitializeGeoJson() {
  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
    .then((response) => response.json())
    .then((geoJsonData) => {
      const features = geoJsonData.features;

      // Rasgele 43 ülkeye petrol, 60 ülkeye buğday
      let oilIndexes = [];
      if (features.length > 43) {
        while (oilIndexes.length < 43) {
          const randIdx = Math.floor(Math.random() * features.length);
          if (!oilIndexes.includes(randIdx)) {
            oilIndexes.push(randIdx);
          }
        }
      }
      let wheatIndexes = [];
      if (features.length > 60) {
        while (wheatIndexes.length < 60) {
          const randIdx = Math.floor(Math.random() * features.length);
          if (!wheatIndexes.includes(randIdx)) {
            wheatIndexes.push(randIdx);
          }
        }
      }

      const countryDataInit = {};
      features.forEach((feature, idx) => {
        const countryName = feature.properties.name;
        let oilProduction = 0;
        if (oilIndexes.includes(idx)) {
          oilProduction =
            Math.floor(Math.random() * (500 - 150 + 1)) + 150; // 150-500
        }
        let wheatProduction = 0;
        if (wheatIndexes.includes(idx)) {
          wheatProduction =
            Math.floor(Math.random() * (700 - 200 + 1)) + 200; // 200-700
        }

        countryDataInit[countryName] = {
          income: Math.floor(Math.random() * 500) + 100, // 100-600
          soldiers: 0,
          owner: null,
          barracksCount: 0,
          factories: 0,
          refineries: 0,
          grainMills: 0,
          oilProduction: oilProduction,
          wheatProduction: wheatProduction,
          supporters: {},
          // Kale
          castleDefenseLevel: 0,
          castleNextUpgradeCost: null
        };
      });

      roomRef.child("countryData").set(countryDataInit);
    });
}

/*******************************************************
 * Oda verilerini dinleme & Güncel UI
 *******************************************************/
function joinRoomAndListen() {
  if (!roomRef) return;

  roomRef.on("value", (snapshot) => {
    roomData = snapshot.val();
    updateGameUI();
    displayPendingPactOffers();
    displayActivePacts();
    displayTradeOffers();
    disableUsedColors();    // Renk butonlarını devre dışı bırak (lobi)

    // Pakt tekliflerinin 2 dakikayı geçeni sil
    cleanupExpiredPactOffers();
  });

  // Sohbet ve global notifications sadece bir kez dinlenmeli
  if (!chatListenerAdded) {
    // Sohbet
    roomRef.child("chat").on("child_added", (snap) => {
      const msg = snap.val();
      appendChatMessage(msg);
    });
    // Global bildirim
    roomRef.child("notifications").on("child_added", (snap) => {
      const data = snap.val();
      if (data && data.text) {
        displayGlobalNotification(data.text);
      }
    });
    chatListenerAdded = true;
  }
}

/*******************************************************
 * Daha önce seçilmiş renkleri devre dışı bırak
 *******************************************************/
function disableUsedColors() {
  if (!roomData || !roomData.players) return;

  // Tüm renk butonlarını aktif hale getir
  const allColorBtns = document.querySelectorAll(".color-options .global-color-option");
  allColorBtns.forEach((btn) => {
    btn.disabled = false;
    btn.classList.remove("selected");
  });

  // Kullanılan renkleri bul
  const usedColors = [];
  for (let pid in roomData.players) {
    if (roomData.players[pid].color) {
      usedColors.push(roomData.players[pid].color);
    }
  }

  // Kullanılan renkleri devre dışı yap
  allColorBtns.forEach((btn) => {
    if (usedColors.includes(btn.dataset.color)) {
      btn.disabled = true;
      btn.title = "Bu renk alınmış.";
    } else {
      btn.title = "";
    }
  });
}

/*******************************************************
 * 2 Dakika içinde cevaplanmayan pakt tekliflerini iptal et
 *******************************************************/
function cleanupExpiredPactOffers() {
  if (!roomData || !roomData.pactOffers) return;
  const now = Date.now();
  for (let offerId in roomData.pactOffers) {
    const offer = roomData.pactOffers[offerId];
    if (offer.status === "pending" && offer.createdAt) {
      // 2 dakika = 120000 ms
      if (now - offer.createdAt > 120000) {
        // Sil
        roomRef.child("pactOffers").child(offerId).update({ status: "rejected" });
        broadcastNotification(
          "Pakt teklifi süre aşımından iptal edildi: " + offer.senderName
        );
      }
    }
  }
}

/*******************************************************
 * Arayüz Güncelleme
 *******************************************************/
function updateGameUI() {
  if (!roomData) return;

  // Tur bilgisi
  document.getElementById("current-round").textContent = roomData.round || 1;

  // Sıradaki oyuncu
  if (roomData.playerOrder && roomData.players) {
    const idx = roomData.currentTurnIndex || 0;
    const currentPlayerId = roomData.playerOrder[idx];
    if (roomData.players[currentPlayerId]) {
      document.getElementById("current-player").textContent =
        roomData.players[currentPlayerId].name;
    }
  }

  // Oyun durumu
  handleGameState(roomData.gameState);

  // Oyuncu listesi
  const playersInfoDiv = document.getElementById("players-info");
  if (playersInfoDiv) {
    playersInfoDiv.innerHTML = "";
    if (roomData.playerOrder) {
      roomData.playerOrder.forEach((pid) => {
        const pData = roomData.players[pid];
        if (pData) {
          const pDiv = document.createElement("div");
          pDiv.className = "player-info";
          pDiv.id = "player-info-" + pid;

          pDiv.innerHTML = `
            <p><strong>${pData.name}</strong></p>
            <p>Para: <span>${pData.money}</span>$</p>
            <p>Asker: <span>${pData.soldiers}</span></p>
            <p>Ülkeler: <span>${(pData.countries && pData.countries.length) || 0}</span></p>
            <p>Petrol: <span>${pData.petrol}</span> varil</p>
            <p>Buğday: <span>${pData.wheat}</span></p>
          `;
          playersInfoDiv.appendChild(pDiv);
        }
      });
    }
  }

  // Harita güncelle
  if (map && roomData.countryData && geoJsonLayer) {
    geoJsonLayer.eachLayer((layer) => {
      const cname = layer.feature.properties.name;
      const cData = roomData.countryData[cname];
      if (cData) {
        if (cData.owner && roomData.players[cData.owner]) {
          layer.setStyle({
            fillColor: roomData.players[cData.owner].color,
            fillOpacity: 0.7
          });
        } else {
          layer.setStyle({ fillColor: "#ccc", fillOpacity: 0.7 });
        }
        layer.setTooltipContent(getCountryPopupContent(cname, cData));
      }
    });
  }

  // Select listelerini güncelle
  updateRecipientSelects();
  updatePactRecipientSelect();
  updatePrivateMessageRecipientSelect();
  updateEmbargoPlayersSelect();
  updateSupportRecipientSelect();

  // Sıradaysak sayaç çalışsın
  if (roomData.gameState === "started") {
    if (isMyTurn()) {
      startTurnTimer();
    } else {
      stopTurnTimer();
    }
  } else {
    stopTurnTimer();
  }
}

/*******************************************************
 * Oyun Durumu (waiting, starting, started) Kontrol
 *******************************************************/
function handleGameState(state) {
  const startBtn = document.getElementById("start-game-btn");
  const countdownSpan = document.getElementById("start-countdown");
  if (!state) return;

  if (state === "waiting") {
    // Host ise buton gözüksün
    if (
      roomData.players[localPlayerId] &&
      roomData.players[localPlayerId].isHost
    ) {
      startBtn.style.display = "block";
    } else {
      startBtn.style.display = "none";
    }
    countdownSpan.style.display = "none";
  } else if (state === "starting") {
    startBtn.style.display = "none";
    countdownSpan.style.display = "inline";
    startCountdownListener();
  } else if (state === "started") {
    startBtn.style.display = "none";
    countdownSpan.style.display = "none";
    clearInterval(startInterval);
    startInterval = null;
  }
}

document.getElementById("start-game-btn").addEventListener("click", () => {
  if (!roomData || !roomData.players[localPlayerId].isHost) return;
  if (roomData.gameState !== "waiting") return;

  const now = Date.now();
  const startTime = now + 30000; // 30 sn geri sayım
  roomRef.update({
    gameState: "starting",
    startTime: startTime
  });
});

function startCountdownListener() {
  if (!roomData || !roomData.startTime) return;
  const countdownSpan = document.getElementById("start-countdown");
  if (startInterval) clearInterval(startInterval);

  startInterval = setInterval(() => {
    if (!roomData) return;
    const now = Date.now();
    const diff = roomData.startTime - now;
    if (diff <= 0) {
      clearInterval(startInterval);
      startInterval = null;
      roomRef.update({ gameState: "started" });
      return;
    }
    const secondsLeft = Math.floor(diff / 1000);
    countdownSpan.textContent = secondsLeft;
  }, 1000);
}

/*******************************************************
 * Ülke Popup İçeriği
 *******************************************************/
function getCountryPopupContent(countryName, country) {
  if (!country) country = {};
  const ownerText =
    country.owner && roomData.players[country.owner]
      ? roomData.players[country.owner].name
      : "Yok";

  let effectiveIncome = country.income || 0;
  if (country.factories) {
    effectiveIncome = Math.floor(effectiveIncome * (1 + 0.20 * country.factories));
  }

  const effectiveOil = country.oilProduction
    ? Math.floor(country.oilProduction * (1 + 0.15 * (country.refineries || 0)))
    : 0;

  const effectiveWheat = country.wheatProduction
    ? Math.floor(country.wheatProduction * (1 + 0.20 * (country.grainMills || 0)))
    : 0;

  let castleDefensePercent = 0;
  if (country.castleDefenseLevel > 0) {
    castleDefensePercent = 5 * country.castleDefenseLevel;
  }

  return `
    <div>
      <p><i class="fas fa-money-bill-wave"></i> Gelir: ${effectiveIncome}$</p>
      <p><i class="fas fa-users"></i> Asker: ${country.soldiers || 0}</p>
      <p><i class="fas fa-fort-awesome"></i> Kışla: ${country.barracksCount || 0}</p>
      <p><i class="fas fa-industry"></i> Fabrika: ${country.factories || 0}</p>
      <p><i class="fas fa-oil-can"></i> Rafine: ${country.refineries || 0}</p>
      <p><i class="fas fa-oil-can"></i> Petrol Üretimi: ${effectiveOil}</p>
      <p><i class="fas fa-wheat-awn"></i> Değirmen: ${country.grainMills || 0}</p>
      <p><i class="fas fa-wheat-awn"></i> Buğday Üretimi: ${effectiveWheat}</p>
      <p><i class="fas fa-chess-rook"></i> Kale Gücü: ${
        castleDefensePercent > 0 ? "%" + castleDefensePercent : "-"
      }</p>
      <p><i class="fas fa-crown"></i> Sahip: ${ownerText}</p>
    </div>
  `;
}

function updateTooltipsPermanent() {
  if (!geoJsonLayer) return;
  geoJsonLayer.eachLayer((layer) => {
    layer.unbindTooltip();
    const cname = layer.feature.properties.name;
    const cData =
      roomData && roomData.countryData
        ? roomData.countryData[cname]
        : {};
    layer.bindTooltip(getCountryPopupContent(cname, cData), {
      permanent: infoCardsPermanent,
      direction: "center",
      className: "country-popup-tooltip"
    });
  });
}

function selectCountry(countryName, layer) {
  selectedCountry = countryName;
  showNotification("Seçilen ülke: " + countryName, 1500);
  layer.setStyle({ weight: 4, color: "#FF4500" });

  setTimeout(() => {
    const cData = roomData.countryData ? roomData.countryData[countryName] : null;
    if (cData && cData.owner && roomData.players[cData.owner]) {
      layer.setStyle({
        fillColor: roomData.players[cData.owner].color || "#ccc",
        fillOpacity: 0.7,
        weight: 1,
        color: "#555"
      });
    } else {
      layer.setStyle({
        fillColor: "#ccc",
        fillOpacity: 0.7,
        weight: 1,
        color: "#555"
      });
    }
  }, 800);

  updateCastleUpgradeCostUI();
}

/*******************************************************
 * Kale yükseltme maliyetini UI'da gösterme
 *******************************************************/
function updateCastleUpgradeCostUI() {
  const costSpan = document.getElementById("castle-upgrade-cost-text");
  if (!costSpan) return;

  if (!selectedCountry || !roomData || !roomData.countryData[selectedCountry]) {
    costSpan.textContent = "-";
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (cData.castleDefenseLevel < 1) {
    costSpan.textContent = "Önce kale kurulmalı.";
    return;
  }
  if (cData.castleDefenseLevel >= 6) {
    costSpan.textContent = "Maksimum seviye (%30)!";
    return;
  }
  if (!cData.castleNextUpgradeCost) {
    costSpan.textContent = "-";
    return;
  }

  costSpan.textContent = `
    ${cData.castleNextUpgradeCost.money}$ + 
    ${cData.castleNextUpgradeCost.petrol} Varil + 
    ${cData.castleNextUpgradeCost.wheat} Buğday
  `;
}

/*******************************************************
 * Select/Options Güncellemeleri
 *******************************************************/
function updateRecipientSelects() {
  const moneySelect = document.getElementById("recipient-player");
  const petrolSelect = document.getElementById("recipient-player-petrol");
  const wheatSelect = document.getElementById("recipient-player-wheat");
  if (!moneySelect || !petrolSelect || !wheatSelect) return;

  moneySelect.innerHTML = "";
  petrolSelect.innerHTML = "";
  wheatSelect.innerHTML = "";

  if (roomData && roomData.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (roomData.players[pid]) {
        const opt1 = document.createElement("option");
        opt1.value = pid;
        opt1.textContent = roomData.players[pid].name;
        moneySelect.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = pid;
        opt2.textContent = roomData.players[pid].name;
        petrolSelect.appendChild(opt2);

        const opt3 = document.createElement("option");
        opt3.value = pid;
        opt3.textContent = roomData.players[pid].name;
        wheatSelect.appendChild(opt3);
      }
    });
  }
}

function updatePrivateMessageRecipientSelect() {
  const privateSelect = document.getElementById("private-message-recipient");
  if (!privateSelect) return;
  privateSelect.innerHTML = "";

  if (roomData && roomData.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== localPlayerId && roomData.players[pid]) {
        const opt = document.createElement("option");
        opt.value = pid;
        opt.textContent = roomData.players[pid].name;
        privateSelect.appendChild(opt);
      }
    });
  }
}

function updateEmbargoPlayersSelect() {
  const embargoSelect = document.getElementById("embargo-players");
  if (!embargoSelect) return;
  embargoSelect.innerHTML = "";

  if (roomData && roomData.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== localPlayerId && roomData.players[pid]) {
        const opt = document.createElement("option");
        opt.value = pid;
        opt.textContent = roomData.players[pid].name;
        embargoSelect.appendChild(opt);
      }
    });
  }
}

function updateSupportRecipientSelect() {
  const supportRecipient = document.getElementById("support-recipient");
  if (!supportRecipient) return;

  supportRecipient.innerHTML = "<option value=''>--Oyuncu Seç--</option>";

  if (roomData && roomData.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== localPlayerId && roomData.players[pid]) {
        const option = document.createElement("option");
        option.value = pid;
        option.textContent = roomData.players[pid].name;
        supportRecipient.appendChild(option);
      }
    });
  }
}

document
  .getElementById("support-recipient")
  .addEventListener("change", function () {
    const selectedPlayerId = this.value;
    const supportRecipientCountry = document.getElementById(
      "support-recipient-country"
    );
    supportRecipientCountry.innerHTML = "<option value=''>--Ülke Seç--</option>";

    if (!selectedPlayerId || !roomData || !roomData.players[selectedPlayerId]) {
      return;
    }
    const recData = roomData.players[selectedPlayerId];
    if (!recData.countries || recData.countries.length === 0) {
      return;
    }
    recData.countries.forEach((cName) => {
      const option = document.createElement("option");
      option.value = cName;
      option.textContent = cName;
      supportRecipientCountry.appendChild(option);
    });
  });

/*******************************************************
 * SALDIRMAZLIK PAKTİ (Teklif + Liste + Otomatik Zaman Aşımı)
 *******************************************************/
document
  .getElementById("send-pact-offer-btn")
  .addEventListener("click", () => {
    if (!isMyTurn()) {
      showNotification("Pakt teklifini yalnızca kendi sıranızda gönderebilirsiniz!");
      return;
    }
    const recipient = document.getElementById("pact-offer-recipient").value;
    const duration = parseInt(document.getElementById("pact-duration").value);
    const cost = parseInt(document.getElementById("pact-cost").value);

    if (!recipient || recipient === localPlayerId) {
      showNotification("Lütfen geçerli bir oyuncu seçin!");
      return;
    }
    if (isNaN(duration) || duration <= 0) {
      showNotification("Geçerli tur sayısı girin!");
      return;
    }
    if (isNaN(cost) || cost < 0) {
      showNotification("Geçerli bir para miktarı girin (0 veya üzeri)!");
      return;
    }

    if (hasActivePact(localPlayerId, recipient)) {
      showNotification("Bu oyuncuyla zaten aktif bir paktınız var!");
      return;
    }

    const senderData = roomData.players[localPlayerId];
    if (!senderData) return;

    const pactOfferRef = roomRef.child("pactOffers").push();
    const newOffer = {
      offerId: pactOfferRef.key,
      senderId: localPlayerId,
      senderName: senderData.name,
      recipientId: recipient,
      duration: duration,
      cost: cost,
      status: "pending",
      createdAt: Date.now()
    };
    pactOfferRef.set(newOffer);

    broadcastNotification(
      `Pakt Teklifi: ${senderData.name} → ${roomData.players[recipient].name} (Tur:${duration}, Para:${cost}$)`
    );
    showNotification("Pakt teklifi gönderildi!");
  });

function updatePactRecipientSelect() {
  const pactSelect = document.getElementById("pact-offer-recipient");
  if (!pactSelect) return;
  pactSelect.innerHTML = "";

  if (roomData && roomData.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== localPlayerId && roomData.players[pid]) {
        const opt = document.createElement("option");
        opt.value = pid;
        opt.textContent = roomData.players[pid].name;
        pactSelect.appendChild(opt);
      }
    });
  }
}

function displayPendingPactOffers() {
  const container = document.getElementById("pact-pending-offers");
  if (!container) return;
  container.innerHTML = "";
  if (!roomData || !roomData.pactOffers) return;

  Object.values(roomData.pactOffers).forEach((offer) => {
    if (
      offer.status === "pending" &&
      offer.recipientId === localPlayerId
    ) {
      const div = document.createElement("div");
      div.className = "pact-offer-item";
      div.setAttribute("data-offer-id", offer.offerId);

      div.innerHTML = `
        <p><strong>${offer.senderName}</strong> size saldırmazlık pakti teklif ediyor.</p>
        <p>Tur sayısı: <strong>${offer.duration}</strong></p>
        <p>Para talebi: <strong>${offer.cost}$</strong></p>
        <button class="accept-btn" data-offer-id="${offer.offerId}">Kabul</button>
        <button class="reject-btn" data-offer-id="${offer.offerId}">Reddet</button>
      `;
      container.appendChild(div);
    }
  });
}

function displayActivePacts() {
  const container = document.getElementById("active-pacts-container");
  if (!container) return;
  container.innerHTML = "";
  if (!roomData || !roomData.pacts) return;

  for (let pactId in roomData.pacts) {
    const pact = roomData.pacts[pactId];
    if (pact.active && roomData.round <= pact.expirationRound) {
      if (pact.playerA === localPlayerId || pact.playerB === localPlayerId) {
        const otherPlayerId =
          pact.playerA === localPlayerId ? pact.playerB : pact.playerA;
        const otherPlayerName = roomData.players[otherPlayerId]?.name || "???";
        const roundsLeft = pact.expirationRound - roomData.round + 1;

        const pactEl = document.createElement("div");
        pactEl.className = "active-pact-item";
        pactEl.innerHTML = `
          <p>Pakt: <strong>${otherPlayerName}</strong></p>
          <p>Kalan Tur: <strong>${roundsLeft}</strong></p>
        `;
        container.appendChild(pactEl);
      }
    }
  }
}

document
  .getElementById("pact-pending-offers")
  .addEventListener("click", function (e) {
    if (e.target.classList.contains("accept-btn")) {
      const offerId = e.target.getAttribute("data-offer-id");
      acceptPactOffer(offerId);
    } else if (e.target.classList.contains("reject-btn")) {
      const offerId = e.target.getAttribute("data-offer-id");
      rejectPactOffer(offerId);
    }
  });

function acceptPactOffer(offerId) {
  const offer = roomData.pactOffers[offerId];
  if (!offer || offer.status !== "pending") return;

  if (hasActivePact(offer.senderId, offer.recipientId)) {
    showNotification("Zaten aktif bir pakt var!");
    roomRef.child("pactOffers").child(offerId).update({ status: "rejected" });
    return;
  }

  const sender = roomData.players[offer.senderId];
  const recipient = roomData.players[offer.recipientId];
  if (!sender || !recipient) {
    showNotification("Teklifteki oyuncular bulunamadı!");
    return;
  }
  if (sender.money < offer.cost) {
    showNotification("Teklifi gönderenin yeterli parası yok! Teklif geçersiz.");
    roomRef.child("pactOffers").child(offerId).update({ status: "rejected" });
    return;
  }

  const expirationRound = (roomData.round || 1) + offer.duration;
  const pactId = db.ref().push().key;
  const updates = {};

  updates[`pactOffers/${offerId}/status`] = "accepted";
  updates[`players/${offer.senderId}/money`] = sender.money - offer.cost;
  updates[`players/${offer.recipientId}/money`] = recipient.money + offer.cost;

  updates[`pacts/${pactId}`] = {
    playerA: offer.senderId,
    playerB: offer.recipientId,
    active: true,
    cost: offer.cost,
    duration: offer.duration,
    expirationRound: expirationRound
  };

  roomRef.update(updates);

  broadcastNotification(
    `Pakt Anlaşması: ${sender.name} & ${recipient.name} (Tur: ${offer.duration}, Para: ${offer.cost}$).`
  );
  showNotification("Pakt teklifi kabul edildi!");
}

function rejectPactOffer(offerId) {
  const offer = roomData.pactOffers[offerId];
  if (!offer || offer.status !== "pending") return;
  roomRef.child("pactOffers").child(offerId).update({ status: "rejected" });
  broadcastNotification(
    `Pakt Reddedildi: ${offer.senderName} → Reddedildi.`
  );
  showNotification("Pakt teklifi reddedildi.");
}

/*******************************************************
 * Saldırı sonrası petrol ödülü
 * (Sadece başka topraklara saldırdıktan sonra çalışır)
 *******************************************************/
function immediateOilReward(playerId) {
  if (!roomData || !roomData.players[playerId]) return;
  const player = roomData.players[playerId];
  if (!player.countries) return;

  let totalPetrolGained = 0;
  player.countries.forEach((cName) => {
    const country = roomData.countryData[cName];
    if (country && country.oilProduction) {
      const effectiveOil = Math.floor(
        country.oilProduction * (1 + 0.15 * (country.refineries || 0))
      );
      totalPetrolGained += effectiveOil;
    }
  });
  if (totalPetrolGained > 0) {
    const updates = {};
    updates[`players/${playerId}/petrol`] = player.petrol + totalPetrolGained;
    roomRef.update(updates);
    showNotification(
      `Saldırı sonrası petrol geliri: +${totalPetrolGained} varil`
    );
    broadcastNotification(
      `${player.name}, saldırı sonrası +${totalPetrolGained} varil petrol kazandı!`
    );
  }
}

/*******************************************************
 * SALDIRI (Başka Oyuncu Toprağı)
 *******************************************************/
function attackEnemyTerritory() {
  if (!isMyTurn()) {
    showNotification("Sıranız değil!");
    return;
  }
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const soldiersToSend = parseInt(
    document.getElementById("attack-soldiers").value
  );
  if (isNaN(soldiersToSend) || soldiersToSend <= 0) {
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }

  const attacker = roomData.players[localPlayerId];
  if (!attacker) return;

  const target = roomData.countryData[selectedCountry];
  if (!target) return;

  // Eğer ülke bize aitse, bu buton "enemy territory" saldırı için olmamalı
  if (target.owner === localPlayerId) {
    showNotification("Bu ülke zaten size ait. Başka tuşla asker ekleyebilirsiniz!");
    return;
  }

  // İlk 3 tur sadece sahipsiz ülkelere saldırı
  if (roomData.round < 4) {
    if (target.owner) {
      showNotification("İlk 3 tur yalnızca sahipsiz ülkelere saldırabilirsiniz!");
      return;
    }
  }

  // Pakt kontrol
  if (target.owner && target.owner !== localPlayerId) {
    if (hasActivePact(localPlayerId, target.owner)) {
      showNotification("Bu oyuncu ile saldırmazlık paktınız var! Saldıramazsınız.");
      return;
    }
  }

  // Petrol kontrol (yabancı toprak)
  if (attacker.petrol < soldiersToSend) {
    showNotification(
      `Bu saldırı için ${soldiersToSend} varil petrol gerekiyor, elinizde yeterli yok!`
    );
    return;
  }
  // Asker kontrol
  if (attacker.soldiers < soldiersToSend) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }

  // Saldırı işlemi
  const updates = {};
  let attackResult = "";

  // Petrol düş
  updates[`players/${localPlayerId}/petrol`] = attacker.petrol - soldiersToSend;

  // Asker düş
  updates[`players/${localPlayerId}/soldiers`] = attacker.soldiers - soldiersToSend;

  // Kale savunması
  let effectiveAttackers = soldiersToSend;
  if (target.castleDefenseLevel > 0) {
    const defensePercent = 5 * target.castleDefenseLevel; // Her seviye +%5
    const killedByCastle = Math.floor((defensePercent / 100) * effectiveAttackers);
    effectiveAttackers -= killedByCastle;
    if (effectiveAttackers < 0) effectiveAttackers = 0;
    attackResult += `Kale savunması: ${killedByCastle} saldıran asker öldü. `;
  }

  if (effectiveAttackers > target.soldiers) {
    // Ülke fethedildi
    const remaining = effectiveAttackers - target.soldiers;
    updates[`countryData/${selectedCountry}/soldiers`] = remaining;
    updates[`countryData/${selectedCountry}/owner`] = localPlayerId;
    updates[`countryData/${selectedCountry}/supporters`] = {};

    // Eski sahibin listesinden çıkar
    if (target.owner && roomData.players[target.owner]) {
      let defCountries = roomData.players[target.owner].countries || [];
      defCountries = defCountries.filter((c) => c !== selectedCountry);
      updates[`players/${target.owner}/countries`] = defCountries;
    }
    // Saldırana ekle
    let myCountries = attacker.countries || [];
    if (!myCountries.includes(selectedCountry)) {
      myCountries.push(selectedCountry);
    }
    updates[`players/${localPlayerId}/countries`] = myCountries;

    attackResult += `${selectedCountry} fethedildi! (${soldiersToSend} vs ${target.soldiers})`;
  } else {
    // Savunma kazandı
    updates[`countryData/${selectedCountry}/soldiers`] =
      target.soldiers - effectiveAttackers;
    attackResult += `${selectedCountry} savunuldu! (${soldiersToSend} vs ${target.soldiers})`;
  }

  roomRef.update(updates, () => {
    // Saldırı sonrası petrol kazan
    immediateOilReward(localPlayerId);
  });

  broadcastNotification(
    `Saldırı: ${attacker.name} → ${selectedCountry}. ${attackResult}`
  );
  showNotification(attackResult);

  // Tur geç
  nextTurn();
}
document
  .getElementById("attack-btn")
  .addEventListener("click", attackEnemyTerritory);

/*******************************************************
 * Kendi toprağına asker ekleme (petrol harcanmaz)
 *******************************************************/
function addSoldiersToOwnTerritory() {
  if (!isMyTurn()) {
    showNotification("Sıranız değil!");
    return;
  }
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const soldiersToAdd = parseInt(
    document.getElementById("own-soldiers").value
  );
  if (isNaN(soldiersToAdd) || soldiersToAdd <= 0) {
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }

  const player = roomData.players[localPlayerId];
  if (!player) return;

  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;

  // Ülke gerçekten bize mi ait?
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil! Farklı bir butonla saldırabilirsiniz.");
    return;
  }

  // Asker kontrol
  if (player.soldiers < soldiersToAdd) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }

  // Petrol harcanmaz
  const updates = {};
  updates[`players/${localPlayerId}/soldiers`] = player.soldiers - soldiersToAdd;
  updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers + soldiersToAdd;

  roomRef.update(updates, () => {
    // Kendi toprağına asker eklemede de isterseniz petrol ödülü uygulayabilirsiniz
    // Ancak istek doğrultusunda "immediateOilReward" buraya eklenmedi.
  });

  broadcastNotification(
    `${player.name}, kendi toprağı ${selectedCountry} ülkesine ${soldiersToAdd} asker ekledi.`
  );
  showNotification(`Kendi toprağınıza ${soldiersToAdd} asker eklendi!`);

  // Tur geç
  nextTurn();
}
document
  .getElementById("own-attack-btn")
  .addEventListener("click", addSoldiersToOwnTerritory);

/*******************************************************
 * ASKER SATIN AL
 *******************************************************/
function buySoldiers() {
  const count = parseInt(document.getElementById("soldiers-to-buy").value);
  if (isNaN(count) || count <= 0) {
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }
  const costMoney = 10 * count;
  const costWheat = 25 * count;

  const currPlayer = roomData.players[localPlayerId];
  if (currPlayer.money < costMoney) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (currPlayer.wheat < costWheat) {
    showNotification("Yeterli buğdayınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = currPlayer.money - costMoney;
  updates[`players/${localPlayerId}/wheat`] = currPlayer.wheat - costWheat;
  updates[`players/${localPlayerId}/soldiers`] = currPlayer.soldiers + count;
  roomRef.update(updates);

  broadcastNotification(`${currPlayer.name} ${count} asker satın aldı.`);
  showNotification(`${count} asker satın alındı.`);
}
document
  .getElementById("buy-soldiers-btn")
  .addEventListener("click", buySoldiers);

/*******************************************************
 * ASKER ÇEK
 *******************************************************/
function pullSoldiers() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const count = parseInt(document.getElementById("pull-soldiers-count").value);
  if (isNaN(count) || count <= 0) {
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }
  const currPlayer = roomData.players[localPlayerId];
  if (!currPlayer) return;

  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;

  const updates = {};

  // Ülke bize aitse
  if (cData.owner === localPlayerId) {
    // Kaç asker var? (supporters hariç)
    let totalSupporters = 0;
    if (cData.supporters) {
      for (let supId in cData.supporters) {
        totalSupporters += cData.supporters[supId];
      }
    }
    const occupantSoldiers = cData.soldiers - totalSupporters;
    if (occupantSoldiers < count) {
      showNotification(
        "Bu kadar asker çekemezsiniz (ülkedeki destek askerleri hariç)!"
      );
      return;
    }
    updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers - count;
    updates[`players/${localPlayerId}/soldiers`] =
      currPlayer.soldiers + count;

    broadcastNotification(
      `${currPlayer.name}, ${selectedCountry} ülkesinden ${count} asker çekti.`
    );
    showNotification(`${selectedCountry} ülkesinden ${count} asker çekildi.`);
  } else {
    // Destek askerini geri çek
    const supportAmount =
      cData.supporters && cData.supporters[localPlayerId]
        ? cData.supporters[localPlayerId]
        : 0;
    if (supportAmount < count) {
      showNotification("Bu ülkede bu kadar destek askeriniz yok!");
      return;
    }
    if (cData.soldiers < count) {
      showNotification("Veri tutarsızlığı: ülkedeki toplam asker yetersiz!");
      return;
    }
    updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers - count;
    const newSup = supportAmount - count;
    if (newSup <= 0) {
      updates[`countryData/${selectedCountry}/supporters/${localPlayerId}`] = null;
    } else {
      updates[`countryData/${selectedCountry}/supporters/${localPlayerId}`] = newSup;
    }
    updates[`players/${localPlayerId}/soldiers`] =
      currPlayer.soldiers + count;

    broadcastNotification(
      `${currPlayer.name}, ${selectedCountry} ülkesinden destek askerini (${count}) geri çekti.`
    );
    showNotification(`${selectedCountry} ülkesinden destek askeri çekildi.`);
  }

  roomRef.update(updates);
}
document
  .getElementById("pull-soldiers-btn")
  .addEventListener("click", pullSoldiers);

/*******************************************************
 * ASKERİ DESTEK GÖNDER
 *******************************************************/
function sendSupport() {
  const recipient = document.getElementById("support-recipient").value;
  const cName = document.getElementById("support-recipient-country").value;
  const num = parseInt(document.getElementById("support-soldiers").value);

  if (!recipient || !cName) {
    showNotification("Oyuncu ve ülke seçmelisiniz!");
    return;
  }
  if (isNaN(num) || num <= 0) {
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }
  const currPlayer = roomData.players[localPlayerId];
  if (currPlayer.soldiers < num) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }

  const targetC = roomData.countryData[cName];
  if (!targetC) {
    showNotification("Seçilen ülke bulunamadı!");
    return;
  }
  if (targetC.owner !== recipient) {
    showNotification("Bu ülke, seçilen oyuncuya ait değil!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/soldiers`] = currPlayer.soldiers - num;
  updates[`countryData/${cName}/soldiers`] = (targetC.soldiers || 0) + num;

  const oldSupport =
    targetC.supporters && targetC.supporters[localPlayerId]
      ? targetC.supporters[localPlayerId]
      : 0;
  updates[`countryData/${cName}/supporters/${localPlayerId}`] = oldSupport + num;

  roomRef.update(updates);
  broadcastNotification(
    `${currPlayer.name}, ${roomData.players[recipient].name} (${cName}) ülkesine ${num} asker destek gönderdi.`
  );
  showNotification("Askeri destek gönderildi!");
}
document
  .getElementById("send-support-btn")
  .addEventListener("click", sendSupport);

/*******************************************************
 * Kaynak Gönderme (Para, Petrol, Buğday)
 *******************************************************/
function sendMoney() {
  const amt = parseInt(document.getElementById("money-to-send").value);
  const recId = document.getElementById("recipient-player").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli bir miktar girin!");
    return;
  }
  const currPlayer = roomData.players[localPlayerId];
  if (currPlayer.money < amt) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (recId === localPlayerId) {
    showNotification("Kendinize kaynak gönderemezsiniz!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = currPlayer.money - amt;
  updates[`players/${recId}/money`] = roomData.players[recId].money + amt;
  roomRef.update(updates);

  broadcastNotification(
    `${currPlayer.name} → ${roomData.players[recId].name} : ${amt}$ gönderdi.`
  );
  showNotification(`${amt}$ gönderildi.`);
}
document
  .getElementById("send-money-btn")
  .addEventListener("click", sendMoney);

function sendPetrol() {
  const amt = parseInt(document.getElementById("petrol-to-send").value);
  const recId = document.getElementById("recipient-player-petrol").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const currPlayer = roomData.players[localPlayerId];
  if (currPlayer.petrol < amt) {
    showNotification("Yeterli petrol yok!");
    return;
  }
  if (recId === localPlayerId) {
    showNotification("Kendinize kaynak gönderemezsiniz!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/petrol`] = currPlayer.petrol - amt;
  updates[`players/${recId}/petrol`] = roomData.players[recId].petrol + amt;
  roomRef.update(updates);

  broadcastNotification(
    `${currPlayer.name} → ${roomData.players[recId].name} : ${amt} varil petrol gönderdi.`
  );
  showNotification(`${amt} varil petrol gönderildi.`);
}
document
  .getElementById("send-petrol-btn")
  .addEventListener("click", sendPetrol);

function sendWheat() {
  const amt = parseInt(document.getElementById("wheat-to-send").value);
  const recId = document.getElementById("recipient-player-wheat").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const currPlayer = roomData.players[localPlayerId];
  if (currPlayer.wheat < amt) {
    showNotification("Yeterli buğday yok!");
    return;
  }
  if (recId === localPlayerId) {
    showNotification("Kendinize kaynak gönderemezsiniz!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/wheat`] = currPlayer.wheat - amt;
  updates[`players/${recId}/wheat`] = roomData.players[recId].wheat + amt;
  roomRef.update(updates);

  broadcastNotification(
    `${currPlayer.name} → ${roomData.players[recId].name} : ${amt} buğday gönderdi.`
  );
  showNotification(`${amt} buğday gönderildi.`);
}
document
  .getElementById("send-wheat-btn")
  .addEventListener("click", sendWheat);

/*******************************************************
 * Tur Geç
 *******************************************************/
function nextTurn(autoEnd = false) {
  if (!isMyTurn()) return;
  stopTurnTimer();

  const turnIndex = roomData.currentTurnIndex || 0;
  const currentPid = roomData.playerOrder[turnIndex];
  const player = roomData.players[currentPid];
  if (!player) return;

  const updates = {};

  // Tur sonunda PARA ve BUĞDAY ekle (ülkelerden)
  if (player.countries && roomData.countryData) {
    let totalMoneyGained = 0;
    let totalWheatGained = 0;

    player.countries.forEach((cName) => {
      const country = roomData.countryData[cName];
      if (country) {
        // Kışla asker üretimi
        if (country.barracksCount) {
          updates[`countryData/${cName}/soldiers`] =
            (country.soldiers || 0) + 5 * country.barracksCount;
        }
        // Para
        let effectiveIncome = country.income || 0;
        if (country.factories) {
          effectiveIncome = Math.floor(
            effectiveIncome * (1 + 0.20 * country.factories)
          );
        }
        totalMoneyGained += effectiveIncome;

        // Buğday
        if (country.wheatProduction) {
          const effectiveWheat = Math.floor(
            country.wheatProduction * (1 + 0.20 * (country.grainMills || 0))
          );
          totalWheatGained += effectiveWheat;
        }
      }
    });

    updates[`players/${currentPid}/money`] = (player.money || 0) + totalMoneyGained;
    updates[`players/${currentPid}/wheat`] = (player.wheat || 0) + totalWheatGained;
  }

  // Sırayı bir sonraki oyuncuya geçir
  let newIndex = turnIndex + 1;
  let newRound = roomData.round || 1;
  if (newIndex >= roomData.playerOrder.length) {
    newIndex = 0;
    newRound++;
    updates["round"] = newRound;
  }
  updates["currentTurnIndex"] = newIndex;
  roomRef.update(updates);

  const nextPid = roomData.playerOrder[newIndex];
  let endText =
    "Sıra " + (roomData.players[nextPid]?.name || "?") + " adlı oyuncuya geçti.";
  if (autoEnd) {
    endText = player.name + " süresini doldurdu! " + endText;
  }
  broadcastNotification(endText);
  showNotification(endText, 1500);
}

document
  .getElementById("end-turn-btn")
  .addEventListener("click", () => nextTurn(false));

/*******************************************************
 * Odadan Çık
 *******************************************************/
document.getElementById("exit-room-btn").addEventListener("click", () => {
  if (!roomRef || !roomData) return;
  const updates = {};
  const newOrder = (roomData.playerOrder || []).filter(
    (id) => id !== localPlayerId
  );

  // Sıra bizdeyse sonraki oyuncuya geç
  if (isMyTurn()) {
    stopTurnTimer();
    let idx = roomData.currentTurnIndex || 0;
    idx++;
    let newR = roomData.round || 1;
    if (idx >= newOrder.length && newOrder.length > 0) {
      idx = 0;
      newR++;
    }
    updates["round"] = newR;
    updates["currentTurnIndex"] = newOrder.length > 0 ? idx : 0;
  }

  updates["playerOrder"] = newOrder;
  updates[`players/${localPlayerId}`] = null;
  roomRef.update(updates);

  document.getElementById("game-container").style.display = "none";
  document.getElementById("lobby-container").style.display = "block";
  document.body.classList.add("lobby");

  localStorage.removeItem("roomCode");
  stopTurnTimer();
  clearInterval(startInterval);
  showNotification("Odadan ayrıldınız.");
});

/*******************************************************
 * Kale Kurma + Güçlendirme
 *******************************************************/
function buildCastle() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cData.castleDefenseLevel > 0) {
    showNotification("Bu ülkede zaten kale var!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.money < 1000 || p.petrol < 1000 || p.wheat < 1000) {
    showNotification("Kale kurmak için yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - 1000;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - 1000;
  updates[`players/${localPlayerId}/wheat`] = p.wheat - 1000;

  updates[`countryData/${selectedCountry}/castleDefenseLevel`] = 1;
  updates[`countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: 1300,
    petrol: 1300,
    wheat: 1300
  };

  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine kale kurdu!`);
  showNotification("Kale kuruldu (%5 savunma).");
}
document
  .getElementById("build-castle-btn")
  .addEventListener("click", buildCastle);

function upgradeCastle() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cData.castleDefenseLevel < 1) {
    showNotification("Önce kale kurun!");
    return;
  }
  if (cData.castleDefenseLevel >= 6) {
    showNotification("Kale savunması max (%30)!");
    return;
  }
  if (!cData.castleNextUpgradeCost) {
    showNotification("Yükseltme maliyeti verisi yok!");
    return;
  }

  const player = roomData.players[localPlayerId];
  const cost = cData.castleNextUpgradeCost;
  if (
    player.money < cost.money ||
    player.petrol < cost.petrol ||
    player.wheat < cost.wheat
  ) {
    showNotification("Güçlendirme için yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = player.money - cost.money;
  updates[`players/${localPlayerId}/petrol`] = player.petrol - cost.petrol;
  updates[`players/${localPlayerId}/wheat`] = player.wheat - cost.wheat;

  const newLevel = cData.castleDefenseLevel + 1;
  updates[`countryData/${selectedCountry}/castleDefenseLevel`] = newLevel;

  // Sonraki maliyet %30 artar
  const nm = Math.floor(cost.money * 1.3);
  const np = Math.floor(cost.petrol * 1.3);
  const nw = Math.floor(cost.wheat * 1.3);
  updates[`countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: nm,
    petrol: np,
    wheat: nw
  };

  roomRef.update(updates, () => {
    updateCastleUpgradeCostUI();
  });

  broadcastNotification(
    `${player.name}, ${selectedCountry} kalesini güçlendirdi (Seviye ${newLevel}).`
  );
  showNotification(`Kale güçlendirildi. Yeni seviye: ${newLevel} (%${newLevel * 5} savunma).`);
}
document
  .getElementById("upgrade-castle-btn")
  .addEventListener("click", upgradeCastle);

/*******************************************************
 * Bina Kurma (Kışla, Fabrika, Rafine, Değirmen)
 *******************************************************/
function buildBarracks() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("barracks-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli bir kışla sayısı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 300 * q;
  const costPetrol = 50 * q;
  const costWheat = 120 * q;

  const p = roomData.players[localPlayerId];
  if (p.money < costMoney || p.petrol < costPetrol || p.wheat < costWheat) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - costPetrol;
  updates[`players/${localPlayerId}/wheat`] = p.wheat - costWheat;
  updates[`countryData/${selectedCountry}/barracksCount`] =
    cData.barracksCount + q;

  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} kışla kurdu!`);
  showNotification(`${q} kışla kuruldu!`);
}
document
  .getElementById("buy-barracks-btn")
  .addEventListener("click", buildBarracks);

function buildFactory() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("factory-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli bir fabrika sayısı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 500 * q;
  const costPetrol = 130 * q;

  const p = roomData.players[localPlayerId];
  if (p.money < costMoney || p.petrol < costPetrol) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - costPetrol;
  updates[`countryData/${selectedCountry}/factories`] = cData.factories + q;

  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} fabrika kurdu!`);
  showNotification(`${q} fabrika kuruldu!`);
}
document
  .getElementById("build-factory-btn")
  .addEventListener("click", buildFactory);

function buildRefinery() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("refinery-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli bir rafine sayısı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 800 * q;
  const costPetrol = 250 * q;

  const p = roomData.players[localPlayerId];
  if (p.money < costMoney || p.petrol < costPetrol) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - costPetrol;
  updates[`countryData/${selectedCountry}/refineries`] = cData.refineries + q;

  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} rafine kurdu!`);
  showNotification(`${q} rafine kuruldu!`);
}
document
  .getElementById("build-refinery-btn")
  .addEventListener("click", buildRefinery);

function buildGrainMill() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("grainmill-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli bir değirmen sayısı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 200 * q;
  const costPetrol = 100 * q;

  const p = roomData.players[localPlayerId];
  if (p.money < costMoney || p.petrol < costPetrol) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - costPetrol;
  updates[`countryData/${selectedCountry}/grainMills`] = cData.grainMills + q;

  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} değirmen kurdu!`);
  showNotification(`${q} değirmen kuruldu!`);
}
document
  .getElementById("build-grainmill-btn")
  .addEventListener("click", buildGrainMill);

/*******************************************************
 * Popup Aç/Kapa
 *******************************************************/
const militaryPopup = document.getElementById("military-popup");
document.getElementById("open-military-btn").addEventListener("click", () => {
  militaryPopup.style.display =
    militaryPopup.style.display === "flex" ? "none" : "flex";
});
document.getElementById("close-military-btn").addEventListener("click", () => {
  militaryPopup.style.display = "none";
});

const buildingPopup = document.getElementById("building-popup");
document.getElementById("open-building-btn").addEventListener("click", () => {
  buildingPopup.style.display =
    buildingPopup.style.display === "flex" ? "none" : "flex";
  updateCastleUpgradeCostUI();
});
document
  .getElementById("close-building-btn")
  .addEventListener("click", () => {
    buildingPopup.style.display = "none";
  });

const resourcePopup = document.getElementById("resource-popup");
document.getElementById("open-resource-btn").addEventListener("click", () => {
  resourcePopup.style.display =
    resourcePopup.style.display === "flex" ? "none" : "flex";
});
document
  .getElementById("close-resource-btn")
  .addEventListener("click", () => {
    resourcePopup.style.display = "none";
  });

const playersPopup = document.getElementById("players-popup");
document.getElementById("open-players-btn").addEventListener("click", () => {
  playersPopup.style.display =
    playersPopup.style.display === "flex" ? "none" : "flex";
});
document
  .getElementById("close-players-btn")
  .addEventListener("click", () => {
    playersPopup.style.display = "none";
  });

const pactPopup = document.getElementById("pact-popup");
document.getElementById("open-pact-btn").addEventListener("click", () => {
  pactPopup.style.display =
    pactPopup.style.display === "flex" ? "none" : "flex";
});
document
  .getElementById("close-pact-btn")
  .addEventListener("click", () => {
    pactPopup.style.display = "none";
  });

/*******************************************************
 * CHAT Sistemi
 *******************************************************/
function toggleChat(show) {
  const chatPopup = document.getElementById("chat-popup");
  chatPopup.style.display = show ? "flex" : "none";
  chatOpen = show;
  if (chatOpen) {
    unreadMessages = 0;
    updateChatBadge();
  }
}

document.getElementById("open-chat-btn").addEventListener("click", () => {
  toggleChat(!chatOpen);
});
document.getElementById("close-chat-btn").addEventListener("click", () => {
  toggleChat(false);
});
document.getElementById("send-chat-btn").addEventListener("click", () => {
  sendChatMessage();
});
document.getElementById("chat-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendChatMessage();
  }
});

function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || !roomRef) return;

  let senderName = "Anon";
  if (roomData && roomData.players && roomData.players[localPlayerId]) {
    senderName = roomData.players[localPlayerId].name;
  }
  const msg = {
    sender: senderName,
    senderId: localPlayerId,
    text: text,
    recipientId: "",
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(msg, (err) => {
    if (!err) input.value = "";
  });
}

// Özel Mesaj
document
  .getElementById("send-private-message-btn")
  .addEventListener("click", () => {
    const pmInput = document.getElementById("private-message-input");
    const pmRecipient = document.getElementById("private-message-recipient");
    const msgText = pmInput.value.trim();
    const recip = pmRecipient.value;
    if (!msgText || !recip) return;

    let senderName = "Anon";
    if (roomData && roomData.players && roomData.players[localPlayerId]) {
      senderName = roomData.players[localPlayerId].name;
    }
    const pm = {
      sender: senderName,
      senderId: localPlayerId,
      text: msgText,
      recipientId: recip,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    roomRef.child("chat").push(pm, (err) => {
      if (!err) {
        pmInput.value = "";
        showNotification("Özel mesaj gönderildi!");
      }
    });
  });

function appendChatMessage(message) {
  // Özel mesaj mı?
  if (message.recipientId && message.recipientId !== "") {
    // Bize mi veya biz mi gönderdik?
    if (
      message.senderId !== localPlayerId &&
      message.recipientId !== localPlayerId
    ) {
      return; // İlgisiz PM
    }
  }
  const chatMessagesDiv = document.getElementById("chat-messages");
  const msgDiv = document.createElement("div");

  if (message.recipientId && message.recipientId !== "") {
    // Özel mesaj
    const targetName = roomData.players[message.recipientId]?.name || "Bilinmeyen";
    if (message.senderId === localPlayerId) {
      msgDiv.innerHTML = `<strong>[PM to ${targetName}]:</strong> ${message.text}`;
    } else {
      msgDiv.innerHTML = `<strong>[PM from ${message.sender}]:</strong> ${message.text}`;
    }
    msgDiv.style.color = "#f39c12";
  } else {
    // Genel sohbet
    msgDiv.textContent = message.sender + ": " + message.text;
  }

  chatMessagesDiv.appendChild(msgDiv);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;

  // Chat kapalıysa unreadMessages++ 
  if (!chatOpen && message.senderId !== localPlayerId) {
    unreadMessages++;
    updateChatBadge();
  }
}

function updateChatBadge() {
  const openChatBtn = document.getElementById("open-chat-btn");
  if (unreadMessages > 0) {
    openChatBtn.dataset.badge = unreadMessages;
  } else {
    openChatBtn.dataset.badge = "";
  }
}

/*******************************************************
 * Ticaret (Market)
 *******************************************************/
document
  .getElementById("open-market-btn")
  .addEventListener("click", () => {
    const marketPopup = document.getElementById("market-popup");
    marketPopup.style.display =
      marketPopup.style.display === "flex" ? "none" : "flex";
  });
document
  .getElementById("close-market-btn")
  .addEventListener("click", () => {
    document.getElementById("market-popup").style.display = "none";
  });

document
  .getElementById("create-trade-offer-btn")
  .addEventListener("click", createTradeOffer);

function createTradeOffer() {
  if (!roomData || !roomData.players[localPlayerId]) {
    showNotification("Oyun verisi geçersiz!");
    return;
  }
  const itemType = document.getElementById("trade-item-type").value;
  const qty = parseInt(document.getElementById("trade-quantity").value);
  const price = parseInt(document.getElementById("trade-price").value);

  if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
    showNotification("Geçerli adet ve fiyat girin!");
    return;
  }

  const seller = roomData.players[localPlayerId];
  let enough = false;
  if (itemType === "petrol") {
    if (seller.petrol >= qty) enough = true;
  } else if (itemType === "wheat") {
    if (seller.wheat >= qty) enough = true;
  }

  if (!enough) {
    showNotification("Satacak yeterli miktar yok!");
    return;
  }

  // Ambargo listesi
  const embargoSelect = document.getElementById("embargo-players");
  let embargoList = [];
  for (let i = 0; i < embargoSelect.options.length; i++) {
    if (embargoSelect.options[i].selected) {
      embargoList.push(embargoSelect.options[i].value);
    }
  }

  const tradeRef = roomRef.child("tradeOffers").push();
  const newOffer = {
    offerId: tradeRef.key,
    sellerId: localPlayerId,
    sellerName: seller.name,
    itemType: itemType,
    quantity: qty,
    price: price,
    status: "pending",
    embargo: embargoList
  };
  tradeRef.set(newOffer);

  broadcastNotification(
    `${seller.name} bir ticaret teklifi oluşturdu (${itemType}, adet:${qty}, fiyat:${price}$).`
  );
  showNotification("Ticaret teklifi oluşturuldu!");
}

function displayTradeOffers() {
  const tradeOffersDiv = document.getElementById("trade-offers-list");
  if (!tradeOffersDiv) return;
  tradeOffersDiv.innerHTML = "";
  if (!roomData || !roomData.tradeOffers) return;

  const offersArray = Object.values(roomData.tradeOffers);
  offersArray.forEach((offer) => {
    if (offer.status === "pending") {
      if (offer.embargo && offer.embargo.includes(localPlayerId)) {
        return; // Ambargo var
      }
      const offerDiv = document.createElement("div");
      offerDiv.className = "offer-item";

      let itemLabel = offer.itemType === "petrol" ? "Petrol" : "Buğday";
      let html = `
        <p><strong>Satıcı:</strong> ${offer.sellerName}</p>
        <p><strong>Ürün:</strong> ${itemLabel}</p>
        <p><strong>Mevcut Miktar:</strong> ${offer.quantity}</p>
        <p><strong>Birim Fiyat:</strong> ${offer.price} $</p>
      `;

      if (offer.sellerId !== localPlayerId) {
        // Satın alma
        html += `
          <label style="font-size:14px;color:#ccc;">Almak istediğiniz miktar:</label>
          <input type="number" class="partial-buy-quantity" placeholder="Miktar" min="1" max="${offer.quantity}" />
          <button class="partial-buy-btn">Satın Al</button>
        `;
      } else {
        // Teklifi iptal
        html += `
          <button class="cancel-offer-btn" style="background:linear-gradient(45deg, #c0392b, #e74c3c); margin-top:10px;">İptal Et</button>
        `;
      }

      if (offer.embargo && offer.embargo.length > 0) {
        const embUsers = offer.embargo
          .map((id) => roomData.players[id]?.name || "???")
          .join(", ");
        html += `<p style="color:red;"><strong>Ambargo:</strong> ${embUsers}</p>`;
      }

      offerDiv.innerHTML = html;

      const partialBuyBtn = offerDiv.querySelector(".partial-buy-btn");
      if (partialBuyBtn) {
        partialBuyBtn.addEventListener("click", () => {
          const input = offerDiv.querySelector(".partial-buy-quantity");
          const amt = parseInt(input.value);
          if (isNaN(amt) || amt <= 0) {
            showNotification("Geçerli miktar girin!");
            return;
          }
          acceptTradeOffer(offer.offerId, amt);
        });
      }

      const cancelBtn = offerDiv.querySelector(".cancel-offer-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () =>
          cancelTradeOffer(offer.offerId)
        );
      }

      tradeOffersDiv.appendChild(offerDiv);
    }
  });
}

function acceptTradeOffer(offerId, buyAmount) {
  if (!roomData || !roomData.tradeOffers || !roomData.tradeOffers[offerId]) {
    showNotification("Teklif bulunamadı!");
    return;
  }
  const offer = roomData.tradeOffers[offerId];
  if (offer.status !== "pending") {
    showNotification("Bu teklif geçerli değil!");
    return;
  }
  const seller = roomData.players[offer.sellerId];
  const buyer = roomData.players[localPlayerId];
  if (!seller || !buyer) {
    showNotification("Geçersiz satıcı/alıcı!");
    return;
  }
  if (buyAmount > offer.quantity) {
    showNotification("Teklifte yeterli stok yok!");
    return;
  }
  const totalCost = offer.price * buyAmount;
  if (buyer.money < totalCost) {
    showNotification("Yeterli paranız yok!");
    return;
  }

  let updates = {};
  let hasEnough = false;

  if (offer.itemType === "petrol") {
    if (seller.petrol >= buyAmount) {
      hasEnough = true;
      updates[`players/${offer.sellerId}/petrol`] = seller.petrol - buyAmount;
      updates[`players/${localPlayerId}/petrol`] = buyer.petrol + buyAmount;
    }
  } else if (offer.itemType === "wheat") {
    if (seller.wheat >= buyAmount) {
      hasEnough = true;
      updates[`players/${offer.sellerId}/wheat`] = seller.wheat - buyAmount;
      updates[`players/${localPlayerId}/wheat`] = buyer.wheat + buyAmount;
    }
  }

  if (!hasEnough) {
    showNotification("Satıcının yeterli miktarı kalmamış!");
    return;
  }

  updates[`players/${localPlayerId}/money`] = buyer.money - totalCost;
  updates[`players/${offer.sellerId}/money`] = seller.money + totalCost;

  let newQuantity = offer.quantity - buyAmount;
  if (newQuantity <= 0) {
    updates[`tradeOffers/${offerId}/status`] = "completed";
  }
  updates[`tradeOffers/${offerId}/quantity`] = newQuantity;

  roomRef.update(updates, (err) => {
    if (!err) {
      broadcastNotification(
        `Ticaret: ${seller.name} -> ${buyer.name} (${buyAmount} x ${offer.itemType}).`
      );
      showNotification("Ticaret başarıyla gerçekleşti!");

      const chatMsg = {
        sender: "Sistem",
        senderId: "system",
        text: `Ticaret Onaylandı: ${seller.name} -> ${buyer.name}, ${buyAmount} x ${offer.itemType}`,
        recipientId: "",
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      roomRef.child("chat").push(chatMsg);
    }
  });
}

function cancelTradeOffer(offerId) {
  if (!roomData || !roomData.tradeOffers || !roomData.tradeOffers[offerId]) return;
  const offer = roomData.tradeOffers[offerId];
  if (offer.sellerId !== localPlayerId) {
    showNotification("Sadece kendi teklifinizi iptal edebilirsiniz!");
    return;
  }
  if (offer.status !== "pending") {
    showNotification("Bu teklif zaten tamamlanmış veya iptal edilmiş.");
    return;
  }
  roomRef.child("tradeOffers").child(offerId).update({ status: "cancelled" });
  broadcastNotification("Ticaret teklifi iptal edildi: " + offer.sellerName);
  showNotification("Teklif iptal edildi.");
}

/*******************************************************
 * Leaflet Harita Kurulumu
 *******************************************************/
function initializeMap() {
  if (map) return;
  map = L.map("map").setView([20, 0], 2);

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 12,
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, GEBCO, NOAA, National Geographic, DeLorme, HERE, Geonames.org and others'
    }
  ).addTo(map);

  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
    .then((response) => response.json())
    .then((geoJsonData) => {
      geoJsonLayer = L.geoJson(geoJsonData, {
        style: () => ({
          color: "#555",
          weight: 1,
          fillColor: "#ccc",
          fillOpacity: 0.7
        }),
        onEachFeature: (feature, layer) => {
          const cname = feature.properties.name;
          layer.bindTooltip(
            getCountryPopupContent(
              cname,
              roomData && roomData.countryData
                ? roomData.countryData[cname]
                : {}
            ),
            {
              permanent: infoCardsPermanent,
              direction: "center",
              className: "country-popup-tooltip"
            }
          );
          layer.on("click", () => selectCountry(cname, layer));
        }
      }).addTo(map);
    });
}

// Oyun ekranı açıldığında haritayı başlat
const gameContainerObserver = new MutationObserver(() => {
  const gameContainer = document.getElementById("game-container");
  if (gameContainer.style.display !== "none") {
    initializeMap();
  }
});
gameContainerObserver.observe(document.getElementById("game-container"), {
  attributes: true,
  attributeFilter: ["style"]
});
