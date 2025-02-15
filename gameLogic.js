/*****************************************************************
 * Firebase Başlatma
 *****************************************************************/
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

/*****************************************************************
 * GLOBAL DEĞİŞKENLER ve Yardımcı Fonksiyonlar
 *****************************************************************/
let localPlayerId = null;
let localPlayerColor = null;
let currentRoomId = null;         // Firebase key (push id) - oda referansı
let roomRef = null;               // db.ref('rooms/'+currentRoomId)
let roomData = null;              // Anlık oda verisi
let isSpectator = false;          // Oyuna izleyici (spectator) olarak mı girdik?
let selectedCountry = null;

let map, geoJsonLayer = null;
let infoCardsPermanent = false;   // Ülke bilgisi tooltip kalıcı
let turnTimeRemaining = 60;
let turnTimerInterval = null;
let startInterval = null;
let chatListenerAdded = false;
let notificationsMuted = false;
let chatOpen = false;
let unreadMessages = 0;

const availableColors = [
  "red", "blue", "green", "yellow", "purple",
  "orange", "brown", "pink"
];

// 2 Dakika (ms)
const PACT_OFFER_TIMEOUT = 2 * 60 * 1000;

/*****************************************************************
 * DOM Referansları
 *****************************************************************/
const lobbyContainer = document.getElementById("lobby-container");
const gameContainer = document.getElementById("game-container");

const createRoomSection = document.getElementById("create-room-section");
const createRoomBtn = document.getElementById("create-room-btn");
const roomNameInput = document.getElementById("room-name");
const roomPasswordInput = document.getElementById("room-password");
const roomsListDiv = document.getElementById("rooms-list");

const colorOptionsDiv = document.getElementById("creator-color-options");

const notificationArea = document.getElementById("notification-area");

const topInfoDiv = document.getElementById("top-info");
const displayRoomNameSpan = document.getElementById("display-room-name");
const currentRoundSpan = document.getElementById("current-round");
const currentPlayerSpan = document.getElementById("current-player");
const endTurnBtn = document.getElementById("end-turn-btn");
const turnTimerSpan = document.getElementById("turn-timer");
const startGameBtn = document.getElementById("start-game-btn");
const startCountdownSpan = document.getElementById("start-countdown");

const toggleInfoCardsBtn = document.getElementById("toggle-info-cards");
const exitRoomBtn = document.getElementById("exit-room-btn");
const bottomIconsDiv = document.getElementById("bottom-icons");

// Popups
const militaryPopup = document.getElementById("military-popup");
const buildingPopup = document.getElementById("building-popup");
const resourcePopup = document.getElementById("resource-popup");
const playersPopup = document.getElementById("players-popup");
const pactPopup = document.getElementById("pact-popup");
const marketPopup = document.getElementById("market-popup");
const chatPopup = document.getElementById("chat-popup");

/*****************************************************************
 * Pop-up Aç/Kapat Yardımcı Fonksiyonları
 *****************************************************************/
function openPopup(popupElem) {
  popupElem.style.display = "flex";
}
function closePopup(popupElem) {
  popupElem.style.display = "none";
}

/*****************************************************************
 * Renk Seçimi - Lobi
 *****************************************************************/
let chosenColor = null; // Geçici seçtiğimiz renk (lobi)
function initColorOptions() {
  colorOptionsDiv.innerHTML = "";
  availableColors.forEach((c) => {
    const btn = document.createElement("div");
    btn.classList.add("color-option");
    btn.style.backgroundColor = c;
    btn.dataset.color = c;
    btn.addEventListener("click", () => {
      // Önce tümünden .selected kaldır
      colorOptionsDiv
        .querySelectorAll(".color-option")
        .forEach((x) => x.classList.remove("selected"));
      // Kendisine ekle
      btn.classList.add("selected");
      chosenColor = c;
    });
    colorOptionsDiv.appendChild(btn);
  });
}

/*****************************************************************
 * Bildirim Fonksiyonları
 *****************************************************************/
function showNotification(message, duration = 3000) {
  if (notificationsMuted) return;
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

function broadcastNotification(text) {
  if (!roomRef) return;
  roomRef.child("notifications").push({
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

function displayGlobalNotification(text) {
  if (notificationsMuted) return;
  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = text;
  notificationArea.appendChild(item);

  setTimeout(() => {
    if (notificationArea.contains(item)) {
      notificationArea.removeChild(item);
    }
  }, 6500);
}

document
  .getElementById("open-notifications-btn")
  .addEventListener("click", () => {
    notificationsMuted = !notificationsMuted;
    if (!notificationsMuted) {
      showNotification("Bildirimler açıldı.");
    }
  });

/*****************************************************************
 * Oda Oluşturma
 *****************************************************************/
createRoomBtn.addEventListener("click", createRoom);

function createRoom() {
  const rName = roomNameInput.value.trim();
  const rPass = roomPasswordInput.value.trim();

  if (!rName) {
    showNotification("Lütfen bir Oda Adı girin!");
    return;
  }
  if (!chosenColor) {
    showNotification("Lütfen bir renk seçin!");
    return;
  }

  // Player ID
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  // Yeni oda verisi
  const newRoomRef = db.ref("rooms").push();
  const roomKey = newRoomRef.key;

  const roomObj = {
    roomId: roomKey,
    roomName: rName,
    password: rPass || "",
    gameState: "waiting",
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    hostId: localPlayerId,
    currentTurnIndex: 0,
    round: 1,
    players: {},
    watchers: {}
  };

  roomObj.players[localPlayerId] = {
    name: "Oyuncu",
    color: chosenColor,
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: true
  };

  newRoomRef.set(roomObj, (err) => {
    if (err) {
      showNotification("Oda oluşturulurken hata oluştu!");
      console.error(err);
    } else {
      showNotification(`Oda oluşturuldu: ${rName}`);
      // localStorage
      localStorage.setItem("roomId", roomKey);
      localStorage.setItem("playerId", localPlayerId);
      currentRoomId = roomKey;
      roomRef = db.ref("rooms/" + currentRoomId);

      // GeoJSON veri oluşturma (ülke datası)
      loadAndInitializeGeoJson();

      // Odaya bağlan
      joinRoomAsPlayer();
    }
  });
}

/*****************************************************************
 * Lobi - Odalar Listesi Dinleme
 *****************************************************************/
function listenRoomsList() {
  db.ref("rooms").on("value", (snapshot) => {
    const allRooms = snapshot.val();
    if (!allRooms) {
      roomsListDiv.innerHTML =
        "<p style='text-align:center;'>Henüz oda yok.</p>";
      return;
    }

    roomsListDiv.innerHTML = "";
    // Her oda için
    Object.keys(allRooms).forEach((rId) => {
      const rData = allRooms[rId];
      if (!rData) return;

      const totalPlayers = rData.players
        ? Object.keys(rData.players).length
        : 0;
      const isLocked = rData.password && rData.password.length > 0;
      const gameStarted = rData.gameState === "started";

      const roomItem = document.createElement("div");
      roomItem.classList.add("room-item");

      const roomInfo = document.createElement("div");
      roomInfo.classList.add("room-info");
      roomInfo.innerHTML = `
        <span><strong>${rData.roomName}</strong>${
        isLocked ? '<i class="fas fa-lock room-lock"></i>' : ""
      }</span>
        <span>Oyuncu: ${totalPlayers}/16</span>
        <span>Durum: ${
          rData.gameState === "waiting" ? "Beklemede" : "Başladı"
        }</span>
      `;

      const actionsDiv = document.createElement("div");
      actionsDiv.classList.add("room-actions");

      // Katıl Butonu
      const joinBtn = document.createElement("button");
      joinBtn.textContent = "Katıl";
      if (gameStarted || totalPlayers >= 16) {
        joinBtn.disabled = true;
        joinBtn.style.opacity = 0.5;
      }
      joinBtn.addEventListener("click", () => {
        // Şifreli mi?
        if (isLocked) {
          const pass = prompt("Bu oda şifreli. Şifreyi girin:");
          if (pass !== rData.password) {
            showNotification("Şifre hatalı!");
            return;
          }
        }
        joinExistingRoom(rId, rData);
      });

      // İzle Butonu
      const spectateBtn = document.createElement("button");
      spectateBtn.textContent = "İzle";
      spectateBtn.addEventListener("click", () => {
        spectateRoom(rId);
      });

      actionsDiv.appendChild(joinBtn);
      actionsDiv.appendChild(spectateBtn);

      roomItem.appendChild(roomInfo);
      roomItem.appendChild(actionsDiv);

      roomsListDiv.appendChild(roomItem);
    });
  });
}

/*****************************************************************
 * Var Olan Odaya Katılma
 *****************************************************************/
function joinExistingRoom(roomId, rData) {
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  if (!chosenColor) {
    showNotification("Lütfen önce bir renk seçin!");
    return;
  }

  const totalPlayers = rData.players ? Object.keys(rData.players).length : 0;
  if (totalPlayers >= 16) {
    showNotification("Oda 16 oyuncuya ulaşmış, katılamazsınız.");
    return;
  }
  if (rData.gameState === "started") {
    showNotification("Oyun zaten başlamış. Katılamazsınız!");
    return;
  }
  if (rData.players) {
    for (let pid in rData.players) {
      if (rData.players[pid].color === chosenColor) {
        showNotification("Bu renk başka oyuncu tarafından alınmış!");
        return;
      }
    }
  }

  const updates = {};
  const playerObj = {
    name: "Oyuncu",
    color: chosenColor,
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: false
  };
  updates[`players/${localPlayerId}`] = playerObj;

  db.ref("rooms/" + roomId).update(updates, (err) => {
    if (err) {
      showNotification("Odaya katılırken hata oluştu!");
      console.error(err);
    } else {
      showNotification("Odaya katıldınız!");
      localStorage.setItem("roomId", roomId);
      localStorage.setItem("playerId", localPlayerId);

      currentRoomId = roomId;
      roomRef = db.ref("rooms/" + currentRoomId);

      // Bağlan
      joinRoomAsPlayer();
    }
  });
}

/*****************************************************************
 * İzleyici Olarak Odaya Bağlanma
 *****************************************************************/
function spectateRoom(roomId) {
  isSpectator = true;
  if (!localStorage.getItem("spectatorId")) {
    localStorage.setItem(
      "spectatorId",
      "spec_" + Math.random().toString(36).substr(2, 9)
    );
  }
  localPlayerId = localStorage.getItem("spectatorId");

  currentRoomId = roomId;
  roomRef = db.ref("rooms/" + currentRoomId);

  const updates = {};
  updates[`watchers/${localPlayerId}`] = {
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  };
  db.ref("rooms/" + roomId).update(updates, (err) => {
    if (!err) {
      showNotification("Oyunu izliyorsunuz...");
      joinRoomAsSpectator();
    } else {
      console.error(err);
    }
  });
}

/*****************************************************************
 * Odaya Bağlandıktan Sonra (Oyuncu)
 *****************************************************************/
function joinRoomAsPlayer() {
  document.body.classList.remove("lobby");
  lobbyContainer.style.display = "none";
  gameContainer.style.display = "block";

  // Oda verisini dinle
  roomRef.on("value", (snapshot) => {
    roomData = snapshot.val() || {};
    updateGameUI();
    displayPendingPactOffers();
    displayActivePacts();
    displayTradeOffers();
  });

  // Chat ve notifications
  if (!chatListenerAdded) {
    addChatAndNotificationListeners();
    chatListenerAdded = true;
  }
}

/*****************************************************************
 * Odaya Bağlandıktan Sonra (İzleyici)
 *****************************************************************/
function joinRoomAsSpectator() {
  document.body.classList.remove("lobby");
  lobbyContainer.style.display = "none";
  gameContainer.style.display = "block";

  roomRef.on("value", (snapshot) => {
    roomData = snapshot.val() || {};
    updateGameUI();
    displayPendingPactOffers();
    displayActivePacts();
    displayTradeOffers();
  });

  if (!chatListenerAdded) {
    addChatAndNotificationListeners();
    chatListenerAdded = true;
  }

  // İzleyiciysek butonlar kapalı
  endTurnBtn.disabled = true;
  bottomIconsDiv.querySelectorAll("button").forEach((btn) => {
    btn.disabled = true;
    btn.style.opacity = 0.5;
  });
  exitRoomBtn.disabled = false; 
}

/*****************************************************************
 * Chat & Bildirim Dinleyici
 *****************************************************************/
function addChatAndNotificationListeners() {
  roomRef.child("chat").on("child_added", (snap) => {
    const msg = snap.val();
    if (msg) appendChatMessage(msg);
  });
  roomRef.child("notifications").on("child_added", (snap) => {
    const data = snap.val();
    if (data && data.text) {
      displayGlobalNotification(data.text);
    }
  });
}

/*****************************************************************
 * Oda Verisi Değiştikçe UI Güncelleme
 *****************************************************************/
function updateGameUI() {
  if (!roomData) return;

  displayRoomNameSpan.textContent = roomData.roomName || "-";
  currentRoundSpan.textContent = roomData.round || 1;

  if (roomData.players && roomData.players[roomData.hostId]) {
    const turnIndex = roomData.currentTurnIndex || 0;
    const pIds = Object.keys(roomData.players);
    if (pIds[turnIndex]) {
      const currP = roomData.players[pIds[turnIndex]];
      currentPlayerSpan.textContent = currP ? currP.name : "?";
    }
  }

  handleGameState(roomData.gameState);

  // Oyuncu listesi
  const playersInfoDiv = document.getElementById("players-info");
  if (playersInfoDiv) {
    playersInfoDiv.innerHTML = "";
    if (roomData.players) {
      Object.keys(roomData.players).forEach((pid) => {
        const pData = roomData.players[pid];
        if (!pData) return;
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
      });
    }
  }

  // Harita
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

  // Select listeleri
  updateRecipientSelects();
  updatePactRecipientSelect();
  updatePrivateMessageRecipientSelect();
  updateEmbargoPlayersSelect();
  updateSupportRecipientSelect();

  // Timer
  if (!isSpectator && roomData.gameState === "started") {
    if (isMyTurn()) startTurnTimer();
    else stopTurnTimer();
  } else {
    stopTurnTimer();
  }
}

/*****************************************************************
 * Oyun Durumu (waiting, started)
 *****************************************************************/
function handleGameState(state) {
  if (!state) return;
  if (state === "waiting") {
    if (roomData.hostId === localPlayerId && !isSpectator) {
      startGameBtn.style.display = "block";
    } else {
      startGameBtn.style.display = "none";
    }
    startCountdownSpan.style.display = "none";
  } else if (state === "started") {
    startGameBtn.style.display = "none";
    startCountdownSpan.style.display = "none";
    clearInterval(startInterval);
    startInterval = null;
  }
}

/*****************************************************************
 * Oyunu Başlat (Host)
 *****************************************************************/
startGameBtn.addEventListener("click", () => {
  if (!roomData || roomData.hostId !== localPlayerId) return;
  if (roomData.gameState !== "waiting") return;

  const now = Date.now();
  const startTime = now + 30000; // 30sn
  roomRef.update({
    gameState: "starting",
    startTime: startTime
  });
  startGameBtn.style.display = "none";

  startCountdownSpan.style.display = "inline";
  startInterval = setInterval(() => {
    if (!roomData) return;
    const now2 = Date.now();
    const diff = (roomData.startTime || startTime) - now2;
    if (diff <= 0) {
      clearInterval(startInterval);
      startInterval = null;
      roomRef.update({ gameState: "started" });
      return;
    }
    const secondsLeft = Math.floor(diff / 1000);
    startCountdownSpan.textContent = secondsLeft;
  }, 1000);
});

/*****************************************************************
 * GeoJSON & Ülke Veri Başlatma
 *****************************************************************/
function loadAndInitializeGeoJson() {
  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
    .then((res) => res.json())
    .then((geoJsonData) => {
      const features = geoJsonData.features;
      let oilIndexes = [];
      while (oilIndexes.length < 43) {
        const r = Math.floor(Math.random() * features.length);
        if (!oilIndexes.includes(r)) oilIndexes.push(r);
      }
      let wheatIndexes = [];
      while (wheatIndexes.length < 60) {
        const r = Math.floor(Math.random() * features.length);
        if (!wheatIndexes.includes(r)) wheatIndexes.push(r);
      }

      const countryDataInit = {};
      features.forEach((f, idx) => {
        const cname = f.properties.name;
        let oilProd = 0;
        if (oilIndexes.includes(idx)) {
          oilProd = Math.floor(Math.random() * (500 - 150 + 1)) + 150;
        }
        let wheatProd = 0;
        if (wheatIndexes.includes(idx)) {
          wheatProd = Math.floor(Math.random() * (700 - 200 + 1)) + 200;
        }
        countryDataInit[cname] = {
          income: Math.floor(Math.random() * 500) + 100,
          soldiers: 0,
          owner: null,
          barracksCount: 0,
          factories: 0,
          refineries: 0,
          oilProduction: oilProd,
          wheatProduction: wheatProd,
          grainMills: 0,
          supporters: {},
          castleDefenseLevel: 0,
          castleNextUpgradeCost: null
        };
      });

      if (roomRef) {
        roomRef.child("countryData").set(countryDataInit);
      }
    });
}

/*****************************************************************
 * Harita (Leaflet) Kurulumu
 *****************************************************************/
function initializeMap() {
  if (map) return;
  map = L.map("map").setView([20, 0], 2);

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 12,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, GEBCO, NOAA, National Geographic, DeLorme, HERE, Geonames.org and others"
    }
  ).addTo(map);

  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
    .then((res) => res.json())
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
          let cData =
            roomData && roomData.countryData
              ? roomData.countryData[cname]
              : {};
          layer.bindTooltip(getCountryPopupContent(cname, cData), {
            permanent: infoCardsPermanent,
            direction: "center",
            className: "country-popup-tooltip"
          });
          layer.on("click", () => selectCountryLayer(cname, layer));
        }
      }).addTo(map);
    });
}

function getCountryPopupContent(countryName, cData) {
  if (!cData) cData = {};
  const ownerName =
    cData.owner &&
    roomData &&
    roomData.players &&
    roomData.players[cData.owner]
      ? roomData.players[cData.owner].name
      : "Yok";

  let effectiveIncome = cData.income || 0;
  if (cData.factories) {
    effectiveIncome = Math.floor(effectiveIncome * (1 + 0.2 * cData.factories));
  }
  const effOil = cData.oilProduction
    ? Math.floor(cData.oilProduction * (1 + 0.15 * (cData.refineries || 0)))
    : 0;
  const effWheat = cData.wheatProduction
    ? Math.floor(cData.wheatProduction * (1 + 0.2 * (cData.grainMills || 0)))
    : 0;

  let castleDef = 0;
  if (cData.castleDefenseLevel > 0) {
    castleDef = 5 * cData.castleDefenseLevel;
  }

  return `
    <div>
      <p><i class="fas fa-money-bill-wave"></i> Gelir: ${effectiveIncome}$</p>
      <p><i class="fas fa-users"></i> Asker: ${cData.soldiers || 0}</p>
      <p><i class="fas fa-fort-awesome"></i> Kışla: ${
        cData.barracksCount || 0
      }</p>
      <p><i class="fas fa-industry"></i> Fabrika: ${cData.factories || 0}</p>
      <p><i class="fas fa-oil-can"></i> Rafine: ${cData.refineries || 0}</p>
      <p><i class="fas fa-oil-can"></i> Petrol Üretimi: ${effOil}</p>
      <p><i class="fas fa-wheat-awn"></i> Değirmen: ${
        cData.grainMills || 0
      }</p>
      <p><i class="fas fa-wheat-awn"></i> Buğday Üretimi: ${effWheat}</p>
      <p><i class="fas fa-chess-rook"></i> Kale Gücü: ${
        castleDef > 0 ? "%" + castleDef : "-"
      }</p>
      <p><i class="fas fa-crown"></i> Sahip: ${ownerName}</p>
    </div>
  `;
}

function selectCountryLayer(cName, layer) {
  selectedCountry = cName;
  showNotification("Seçilen Ülke: " + cName, 1500);

  // Geçici vurgulama
  layer.setStyle({ weight: 4, color: "#FF4500" });
  setTimeout(() => {
    const cData = roomData.countryData ? roomData.countryData[cName] : null;
    if (cData && cData.owner && roomData.players[cData.owner]) {
      layer.setStyle({
        fillColor: roomData.players[cData.owner].color,
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

  // Kale güncelle
  updateCastleUpgradeCostUI();
}

function updateTooltipsPermanent() {
  if (!geoJsonLayer) return;
  geoJsonLayer.eachLayer((layer) => {
    layer.unbindTooltip();
    const cName = layer.feature.properties.name;
    const cData = roomData.countryData ? roomData.countryData[cName] : {};
    layer.bindTooltip(getCountryPopupContent(cName, cData), {
      permanent: infoCardsPermanent,
      direction: "center",
      className: "country-popup-tooltip"
    });
  });
}

toggleInfoCardsBtn.addEventListener("click", () => {
  infoCardsPermanent = !infoCardsPermanent;
  updateTooltipsPermanent();
  toggleInfoCardsBtn.querySelector("i").className = infoCardsPermanent
    ? "fas fa-eye"
    : "fas fa-eye-slash";
});

/*****************************************************************
 * Kullanıcı Sırası Kontrol
 *****************************************************************/
function isMyTurn() {
  if (!roomData || !roomData.players) return false;
  if (roomData.gameState !== "started") return false;

  const pIds = Object.keys(roomData.players);
  const idx = roomData.currentTurnIndex || 0;
  return pIds[idx] === localPlayerId;
}

/*****************************************************************
 * 60 Saniye Sayaç
 *****************************************************************/
function startTurnTimer() {
  turnTimeRemaining = 60;
  turnTimerSpan.textContent = turnTimeRemaining + "s";
  if (turnTimerInterval) clearInterval(turnTimerInterval);

  turnTimerInterval = setInterval(() => {
    turnTimeRemaining--;
    if (turnTimeRemaining <= 0) {
      clearInterval(turnTimerInterval);
      turnTimeRemaining = 0;
      turnTimerSpan.textContent = "0s";
      if (isMyTurn()) nextTurn(true);
    } else {
      turnTimerSpan.textContent = turnTimeRemaining + "s";
    }
  }, 1000);
}

function stopTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
  turnTimerSpan.textContent = "60s";
}

/*****************************************************************
 * Oda Çıkışı
 *****************************************************************/
exitRoomBtn.addEventListener("click", () => {
  if (!roomRef || !roomData) {
    location.reload();
    return;
  }

  if (isSpectator) {
    roomRef.child(`watchers/${localPlayerId}`).remove();
    localStorage.removeItem("roomId");
    location.reload();
    return;
  }

  const updates = {};
  if (roomData.players && roomData.players[localPlayerId]) {
    updates[`players/${localPlayerId}`] = null;

    if (isMyTurn()) {
      stopTurnTimer();
      const pIds = Object.keys(roomData.players);
      let idx = roomData.currentTurnIndex || 0;
      idx++;
      if (idx >= pIds.length) {
        idx = 0;
        updates["round"] = (roomData.round || 1) + 1;
      }
      updates["currentTurnIndex"] = idx;
    }
    roomRef.update(updates);

    localStorage.removeItem("roomId");
    showNotification("Odadan ayrıldınız.");
    setTimeout(() => {
      location.reload();
    }, 1000);
  } else {
    location.reload();
  }
});

/*****************************************************************
 * "Tur Sonu" Butonu
 *****************************************************************/
endTurnBtn.addEventListener("click", () => {
  nextTurn(false);
});

function nextTurn(autoEnd = false) {
  if (!isMyTurn() || !roomData || !roomData.players) return;

  stopTurnTimer();

  const pIds = Object.keys(roomData.players);
  let turnIndex = roomData.currentTurnIndex || 0;
  const currentPid = pIds[turnIndex];
  const player = roomData.players[currentPid];
  if (!player) return;

  const updates = {};

  // Gelir & Buğday
  if (player.countries && roomData.countryData) {
    let totalMoney = 0;
    let totalWheat = 0;
    player.countries.forEach((cName) => {
      const cData = roomData.countryData[cName];
      if (!cData) return;

      // Kışla = asker üretimi
      if (cData.barracksCount) {
        const newSoldiers = (cData.soldiers || 0) + 5 * cData.barracksCount;
        updates[`countryData/${cName}/soldiers`] = newSoldiers;
      }
      let effInc = cData.income || 0;
      if (cData.factories) {
        effInc = Math.floor(effInc * (1 + 0.2 * cData.factories));
      }
      totalMoney += effInc;

      if (cData.wheatProduction) {
        const effW = Math.floor(
          cData.wheatProduction * (1 + 0.2 * (cData.grainMills || 0))
        );
        totalWheat += effW;
      }
    });
    updates[`players/${currentPid}/money`] = (player.money || 0) + totalMoney;
    updates[`players/${currentPid}/wheat`] = (player.wheat || 0) + totalWheat;
  }

  // Sıra ilerle
  turnIndex++;
  if (turnIndex >= pIds.length) {
    turnIndex = 0;
    updates["round"] = (roomData.round || 1) + 1;
  }
  updates["currentTurnIndex"] = turnIndex;

  roomRef.update(updates, () => {
    const nextPid = pIds[turnIndex];
    let msg = `Sıra ${roomData.players[nextPid]?.name || "???"} adlı oyuncuya geçti.`;
    if (autoEnd) {
      msg = `${player.name} süresini doldurdu! ` + msg;
    }
    broadcastNotification(msg);
    showNotification(msg);
  });
}

/*****************************************************************
 * Asker, Saldırı, Bina, Kaynak vb. İşlemleri
 *****************************************************************/
// (Kodun bu kısmı önceki paylaşımlardaki mantıkla aynıdır; saldırı, asker çekme vb.)

/* ... 
   Buraya daha önce gösterilen saldırı, asker satın al, 
   bina kurma, kale güçlendirme, kaynak gönderme
   vb. fonksiyonlar aynen eklenecek.
   Kod çok uzun olduğu için tek tek tekrar göstermiyoruz 
   ancak yukarıdaki tam sürümü kopyalayın.
... */

/*****************************************************************
 * Saldırmazlık Pakti
 *****************************************************************/
// (Aynı şekilde pakt işlemleri, pakt teklifi gönderme, kabul/red vb. kodlar)

/*****************************************************************
 * Ticaret (Market)
 *****************************************************************/
// (Ticaret teklifi oluşturma, satın alma, iptal etme vb. kodlar)

/*****************************************************************
 * Chat Sistemi
 *****************************************************************/
// (Sohbet, özel mesaj vb. kodlar)

/*****************************************************************
 * Popup Aç/Kapat Event'leri (ÖNEMLİ)
 *****************************************************************/

// Asker İşlemleri Popup
document.getElementById("open-military-btn").addEventListener("click", () => {
  openPopup(militaryPopup);
});
document.getElementById("close-military-btn").addEventListener("click", () => {
  closePopup(militaryPopup);
});

// Bina Kurma Popup
document.getElementById("open-building-btn").addEventListener("click", () => {
  openPopup(buildingPopup);
});
document.getElementById("close-building-btn").addEventListener("click", () => {
  closePopup(buildingPopup);
});

// Kaynak Gönderme Popup
document.getElementById("open-resource-btn").addEventListener("click", () => {
  openPopup(resourcePopup);
});
document.getElementById("close-resource-btn").addEventListener("click", () => {
  closePopup(resourcePopup);
});

// Oyuncular Popup
document.getElementById("open-players-btn").addEventListener("click", () => {
  openPopup(playersPopup);
});
document.getElementById("close-players-btn").addEventListener("click", () => {
  closePopup(playersPopup);
});

// Pakt Popup
document.getElementById("open-pact-btn").addEventListener("click", () => {
  openPopup(pactPopup);
});
document.getElementById("close-pact-btn").addEventListener("click", () => {
  closePopup(pactPopup);
});

// Market Popup
document.getElementById("open-market-btn").addEventListener("click", () => {
  openPopup(marketPopup);
});
document.getElementById("close-market-btn").addEventListener("click", () => {
  closePopup(marketPopup);
});

// Chat Popup
// Chat için zaten "toggleChat" fonksiyonu var, ancak kapanış eklemek için:
document.getElementById("close-chat-btn").addEventListener("click", () => {
  closePopup(chatPopup);
  chatOpen = false;
});

/*****************************************************************
 * DOMContentLoaded
 *****************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  // Renkleri oluştur
  initColorOptions();

  // Odaları listele
  listenRoomsList();

  // Otomatik reconnect?
  if (localStorage.getItem("roomId")) {
    const savedRoomId = localStorage.getItem("roomId");
    const refCheck = db.ref("rooms/" + savedRoomId);
    refCheck.once("value", (snap) => {
      if (!snap.exists()) return;
      currentRoomId = savedRoomId;
      localPlayerId = localStorage.getItem("playerId") || null;
      if (!localPlayerId) return;
      const rDat = snap.val();
      if (rDat.players && rDat.players[localPlayerId]) {
        roomRef = refCheck;
        joinRoomAsPlayer();
      } else if (rDat.watchers && rDat.watchers[localPlayerId]) {
        isSpectator = true;
        roomRef = refCheck;
        joinRoomAsSpectator();
      }
    });
  }

  // Harita açılınca
  const gameContainerObserver = new MutationObserver(() => {
    if (gameContainer.style.display !== "none") {
      initializeMap();
    }
  });
  gameContainerObserver.observe(gameContainer, {
    attributes: true,
    attributeFilter: ["style"],
  });
});
