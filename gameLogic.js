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

document.getElementById("open-notifications-btn").addEventListener("click", () => {
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

      // GeoJSON'i ilk defa oluşturacaksa (ülke datası)
      loadAndInitializeGeoJson();

      // Odaya bağlan ve dinle
      joinRoomAsPlayer();
    }
  });
}

/*****************************************************************
 * Lobi - Odalar Listesi Dinleme
 *****************************************************************/
function listenRoomsList() {
  // "rooms" altına child_added / changed / removed
  db.ref("rooms").on("value", (snapshot) => {
    const allRooms = snapshot.val();
    if (!allRooms) {
      roomsListDiv.innerHTML = "<p style='text-align:center;'>Henüz oda yok.</p>";
      return;
    }

    roomsListDiv.innerHTML = "";
    // Her oda için bir satır
    Object.keys(allRooms).forEach((rId) => {
      const rData = allRooms[rId];
      if (!rData) return;

      const totalPlayers = rData.players ? Object.keys(rData.players).length : 0;
      const isLocked = rData.password && rData.password.length > 0;
      const gameStarted = rData.gameState === "started";

      // "room-item" div
      const roomItem = document.createElement("div");
      roomItem.classList.add("room-item");

      const roomInfo = document.createElement("div");
      roomInfo.classList.add("room-info");
      roomInfo.innerHTML = `
        <span><strong>${rData.roomName}</strong>${isLocked ? '<i class="fas fa-lock room-lock"></i>' : ''}</span>
        <span>Oyuncu: ${totalPlayers}/16</span>
        <span>Durum: ${rData.gameState === "waiting" ? "Beklemede" : "Başladı"}</span>
      `;

      const actionsDiv = document.createElement("div");
      actionsDiv.classList.add("room-actions");

      // Katıl Butonu
      const joinBtn = document.createElement("button");
      joinBtn.textContent = "Katıl";
      // Koşullar: oyun başlamadıysa ve 16'dan az oyuncu varsa
      if (gameStarted || totalPlayers >= 16) {
        joinBtn.disabled = true;
        joinBtn.style.opacity = 0.5;
      }
      joinBtn.addEventListener("click", () => {
        // Şifre kontrol
        if (isLocked) {
          const pass = prompt("Bu oda şifreli. Şifreyi girin:");
          if (pass !== rData.password) {
            showNotification("Şifre hatalı!");
            return;
          }
        }
        joinExistingRoom(rId, rData);
      });

      // İzle Butonu (her zaman aktif)
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
  // Player ID
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  // Renk seçili mi?
  if (!chosenColor) {
    showNotification("Lütfen önce bir renk seçin!");
    return;
  }

  // Oyuncu sayısı kontrol
  const totalPlayers = rData.players ? Object.keys(rData.players).length : 0;
  if (totalPlayers >= 16) {
    showNotification("Oda 16 oyuncuya ulaşmış, katılamazsınız.");
    return;
  }
  // Oyun başlamış mı?
  if (rData.gameState === "started") {
    showNotification("Oyun zaten başlamış. Katılamazsınız!");
    return;
  }
  // Renk kullanım kontrol
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

      // Odaya bağlan
      joinRoomAsPlayer();
    }
  });
}

/*****************************************************************
 * İzleyici Olarak Odaya Bağlanma
 *****************************************************************/
function spectateRoom(roomId) {
  // Yalnızca izleyici
  isSpectator = true;
  if (!localStorage.getItem("spectatorId")) {
    localStorage.setItem("spectatorId", "spec_" + Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("spectatorId");

  currentRoomId = roomId;
  roomRef = db.ref("rooms/" + currentRoomId);

  // watchers dizisine ekle
  const updates = {};
  updates[`watchers/${localPlayerId}`] = {
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  };
  db.ref("rooms/" + roomId).update(updates, (err) => {
    if (!err) {
      showNotification("Oyunu izliyorsunuz...");
      // Arayüz
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
  // Lobi gizle, oyun ekranı göster
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

  // Chat ve global notifications sadece bir kez dinlenmeli
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

  // Oda verisini dinle
  roomRef.on("value", (snapshot) => {
    roomData = snapshot.val() || {};
    updateGameUI();
    displayPendingPactOffers();
    displayActivePacts();
    displayTradeOffers();
  });

  // Chat ve global notifications
  if (!chatListenerAdded) {
    addChatAndNotificationListeners();
    chatListenerAdded = true;
  }

  // İzleyiciysek, bazı butonları devre dışı bırakalım
  endTurnBtn.disabled = true;
  bottomIconsDiv.querySelectorAll("button").forEach((btn) => {
    btn.disabled = true;
    btn.style.opacity = 0.5;
  });
  exitRoomBtn.disabled = false; // çıkış her zaman aktif
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

  // Oda adı
  displayRoomNameSpan.textContent = roomData.roomName || "-";

  // Tur bilgisi
  currentRoundSpan.textContent = roomData.round || 1;

  // Sıradaki oyuncu
  if (roomData.players && roomData.players[roomData.hostId]) {
    const turnIndex = roomData.currentTurnIndex || 0;
    const pIds = Object.keys(roomData.players);
    // Turn sistemini "playerOrder" yerine "Object.keys" ile basit tutabiliriz
    // Fakat isterseniz "playerOrder" dizi sıralama da yapabilirsiniz.
    if (pIds[turnIndex]) {
      const currP = roomData.players[pIds[turnIndex]];
      currentPlayerSpan.textContent = currP ? currP.name : "?";
    }
  }

  // Oyun durumu
  handleGameState(roomData.gameState);

  // Oyuncu listesi (sol popup)
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

  // Select listeleri (kaynak gönderme, asker destek vb.)
  updateRecipientSelects();
  updatePactRecipientSelect();
  updatePrivateMessageRecipientSelect();
  updateEmbargoPlayersSelect();
  updateSupportRecipientSelect();

  // Sıradaysak timer
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
    // Yalnızca host ise "start game" butonu görünsün
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
  const startTime = now + 30000; // 30 sn gerisayım
  roomRef.update({
    gameState: "starting",
    startTime: startTime
  });
  startGameBtn.style.display = "none";

  // 30sn geri sayım
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
 * GeoJSON & Ülke Veri Başlatma (Sadece Oda Kurucusu)
 *****************************************************************/
function loadAndInitializeGeoJson() {
  fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
    .then(res => res.json())
    .then(geoJsonData => {
      const features = geoJsonData.features;

      // Rastgele 43 ülkeye petrol, 60 ülkeye buğday vb.
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

      // DB'ye yaz
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
        'Tiles &copy; Esri &mdash; Source: Esri, GEBCO, NOAA, National Geographic, DeLorme, HERE, Geonames.org and others'
    }
  ).addTo(map);

  fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
    .then(res => res.json())
    .then(geoJsonData => {
      geoJsonLayer = L.geoJson(geoJsonData, {
        style: () => ({
          color: "#555",
          weight: 1,
          fillColor: "#ccc",
          fillOpacity: 0.7
        }),
        onEachFeature: (feature, layer) => {
          const cname = feature.properties.name;
          let cData = roomData && roomData.countryData ? roomData.countryData[cname] : {};
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
  const ownerName = cData.owner && roomData && roomData.players && roomData.players[cData.owner]
    ? roomData.players[cData.owner].name
    : "Yok";

  let effectiveIncome = cData.income || 0;
  if (cData.factories) {
    effectiveIncome = Math.floor(effectiveIncome * (1 + 0.20 * cData.factories));
  }
  const effOil = cData.oilProduction
    ? Math.floor(cData.oilProduction * (1 + 0.15 * (cData.refineries || 0)))
    : 0;
  const effWheat = cData.wheatProduction
    ? Math.floor(cData.wheatProduction * (1 + 0.20 * (cData.grainMills || 0)))
    : 0;

  let castleDef = 0;
  if (cData.castleDefenseLevel > 0) {
    castleDef = 5 * cData.castleDefenseLevel;
  }

  return `
    <div>
      <p><i class="fas fa-money-bill-wave"></i> Gelir: ${effectiveIncome}$</p>
      <p><i class="fas fa-users"></i> Asker: ${cData.soldiers || 0}</p>
      <p><i class="fas fa-fort-awesome"></i> Kışla: ${cData.barracksCount || 0}</p>
      <p><i class="fas fa-industry"></i> Fabrika: ${cData.factories || 0}</p>
      <p><i class="fas fa-oil-can"></i> Rafine: ${cData.refineries || 0}</p>
      <p><i class="fas fa-oil-can"></i> Petrol Üretimi: ${effOil}</p>
      <p><i class="fas fa-wheat-awn"></i> Değirmen: ${cData.grainMills || 0}</p>
      <p><i class="fas fa-wheat-awn"></i> Buğday Üretimi: ${effWheat}</p>
      <p><i class="fas fa-chess-rook"></i> Kale Gücü: ${castleDef > 0 ? "%"+castleDef : "-"}</p>
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

  // Sıralama basitçe players anahtarlarına dayalı:
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
      // Süre doldu, otomatik tur geç
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
    // Belki lobideyken?
    location.reload();
    return;
  }

  if (isSpectator) {
    // watchers dan sil
    roomRef.child(`watchers/${localPlayerId}`).remove();
    localStorage.removeItem("roomId");
    location.reload();
    return;
  }

  // Oyuncu
  const updates = {};
  if (roomData.players && roomData.players[localPlayerId]) {
    // Odayı terk ediyor
    updates[`players/${localPlayerId}`] = null;

    // Sıra bizdeyse => next turn
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
    // Herhangi bir veri yok -> reload
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

  // Tur sonunda para & buğday ekleme
  if (player.countries && roomData.countryData) {
    let totalMoney = 0;
    let totalWheat = 0;
    player.countries.forEach((cName) => {
      const cData = roomData.countryData[cName];
      if (!cData) return;

      // Kışla asker üretimi
      if (cData.barracksCount) {
        const newSoldiers = (cData.soldiers || 0) + (5 * cData.barracksCount);
        updates[`countryData/${cName}/soldiers`] = newSoldiers;
      }
      // Gelir
      let effInc = cData.income || 0;
      if (cData.factories) {
        effInc = Math.floor(effInc * (1 + 0.20 * cData.factories));
      }
      totalMoney += effInc;

      // Buğday
      if (cData.wheatProduction) {
        const effW = Math.floor(cData.wheatProduction * (1 + 0.20 * (cData.grainMills || 0)));
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
 * (Kodu gerektikçe düzenli tutmak adına toplu halde)
 *****************************************************************/

// => SALDIRI
const attackBtn = document.getElementById("attack-btn");
attackBtn.addEventListener("click", doAttack);

function doAttack() {
  if (!isMyTurn()) {
    showNotification("Sıranız değil!");
    return;
  }
  if (!selectedCountry) {
    showNotification("Lütfen bir ülke seçin!");
    return;
  }
  const soldiersToSend = parseInt(document.getElementById("attack-soldiers").value);
  if (isNaN(soldiersToSend) || soldiersToSend <= 0) {
    showNotification("Geçerli asker sayısı girin!");
    return;
  }

  const attacker = roomData.players[localPlayerId];
  if (!attacker) return;

  const targetC = roomData.countryData[selectedCountry];
  if (!targetC) return;

  // Kendi toprağına asker ekleme = petrol harcanmaz
  if (targetC.owner === localPlayerId) {
    // Yeterli asker var mı?
    if (soldiersToSend > attacker.soldiers) {
      showNotification("Yeterli askeriniz yok!");
      return;
    }
    // Petrol harcanmıyor -> normalde petrol kontrol yok
    const newCountrySoldiers = targetC.soldiers + soldiersToSend;

    const updates = {};
    updates[`countryData/${selectedCountry}/soldiers`] = newCountrySoldiers;
    updates[`players/${localPlayerId}/soldiers`] = (attacker.soldiers - soldiersToSend);

    roomRef.update(updates, () => {
      showNotification(`${selectedCountry} ülkesine ${soldiersToSend} asker eklendi.`);
      broadcastNotification(`${attacker.name}, kendi toprağına ${soldiersToSend} asker yığdı.`);
    });
    return;
  }

  // Başka oyuncunun toprağına saldırmak => petrol gerekli
  if (attacker.petrol < soldiersToSend) {
    showNotification("Yeterli petrol yok! (1 asker = 1 varil)");
    return;
  }
  if (soldiersToSend > attacker.soldiers) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }

  // İlk 3 tur sadece sahipsiz ülkeye saldırı
  if (roomData.round < 4 && targetC.owner && targetC.owner !== localPlayerId) {
    showNotification("İlk 3 tur yalnızca sahipsiz ülkelere saldırabilirsiniz!");
    return;
  }

  // Pakt var mı?
  if (targetC.owner && hasActivePact(localPlayerId, targetC.owner)) {
    showNotification("Bu oyuncu ile saldırmazlık paktınız var, saldıramazsınız!");
    return;
  }

  // Saldırı logic
  const updates = {};
  // Petrol düş
  updates[`players/${localPlayerId}/petrol`] = attacker.petrol - soldiersToSend;
  // Asker düş
  updates[`players/${localPlayerId}/soldiers`] = attacker.soldiers - soldiersToSend;

  let resultText = "";
  // Kale savunması
  let effectiveAttackers = soldiersToSend;
  if (targetC.castleDefenseLevel > 0) {
    const defPercent = 5 * targetC.castleDefenseLevel;
    const killedByCastle = Math.floor((defPercent / 100) * effectiveAttackers);
    effectiveAttackers -= killedByCastle;
    if (effectiveAttackers < 0) effectiveAttackers = 0;
    resultText += `Kale savunması: ${killedByCastle} saldıran asker öldü. `;
  }

  if (effectiveAttackers > targetC.soldiers) {
    // Ülke fethedildi
    const remaining = effectiveAttackers - targetC.soldiers;
    updates[`countryData/${selectedCountry}/soldiers`] = remaining;
    updates[`countryData/${selectedCountry}/owner`] = localPlayerId;
    updates[`countryData/${selectedCountry}/supporters`] = {};

    // Eski sahibin ülke listesinden çıkar
    if (targetC.owner && roomData.players[targetC.owner]) {
      const oldDefCountries = roomData.players[targetC.owner].countries || [];
      const newDefCountries = oldDefCountries.filter((x) => x !== selectedCountry);
      updates[`players/${targetC.owner}/countries`] = newDefCountries;
    }
    // Yeni sahibin ülke listesine ekle
    const myCountries = attacker.countries || [];
    if (!myCountries.includes(selectedCountry)) myCountries.push(selectedCountry);
    updates[`players/${localPlayerId}/countries`] = myCountries;

    resultText += `${selectedCountry} fethedildi! (${soldiersToSend} vs ${targetC.soldiers})`;
  } else {
    // Savunma kazandı
    const newDefSoldiers = targetC.soldiers - effectiveAttackers;
    updates[`countryData/${selectedCountry}/soldiers`] = newDefSoldiers;
    resultText += `${selectedCountry} savunuldu! (${soldiersToSend} vs ${targetC.soldiers})`;
  }

  roomRef.update(updates, () => {
    // Saldırı sonrası petrol ödülü
    immediateOilReward(localPlayerId);
    showNotification(resultText);
    broadcastNotification(`Saldırı: ${attacker.name} → ${selectedCountry}. ${resultText}`);
    // Ardından tur sonu
    nextTurn();
  });
}

// Saldırı Sonrası Petrol Ödülü
function immediateOilReward(pid) {
  const pData = roomData.players[pid];
  if (!pData || !pData.countries) return;

  let totalOil = 0;
  pData.countries.forEach((cName) => {
    const cData = roomData.countryData[cName];
    if (!cData || !cData.oilProduction) return;
    const effOil = Math.floor(cData.oilProduction * (1 + 0.15 * (cData.refineries || 0)));
    totalOil += effOil;
  });

  if (totalOil > 0) {
    const newOil = (pData.petrol || 0) + totalOil;
    roomRef.child(`players/${pid}/petrol`).set(newOil);
    broadcastNotification(`${pData.name}, saldırı sonrası +${totalOil} varil petrol kazandı.`);
  }
}

// => ASKER SATIN AL
document.getElementById("buy-soldiers-btn").addEventListener("click", () => {
  const count = parseInt(document.getElementById("soldiers-to-buy").value);
  if (isNaN(count) || count <= 0) {
    showNotification("Geçerli asker sayısı girin!");
    return;
  }
  const costMoney = 10 * count;
  const costWheat = 25 * count;

  const p = roomData.players[localPlayerId];
  if (!p) return;
  if (p.money < costMoney) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (p.wheat < costWheat) {
    showNotification("Yeterli buğdayınız yok!");
    return;
  }
  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/wheat`] = p.wheat - costWheat;
  updates[`players/${localPlayerId}/soldiers`] = p.soldiers + count;

  roomRef.update(updates, () => {
    showNotification(`${count} asker satın alındı.`);
    broadcastNotification(`${p.name} ${count} asker satın aldı.`);
  });
});

// => ASKER ÇEK
document.getElementById("pull-soldiers-btn").addEventListener("click", () => {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const count = parseInt(document.getElementById("pull-soldiers-count").value);
  if (isNaN(count) || count <= 0) {
    showNotification("Geçerli asker sayısı girin!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (!p) return;

  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;

  const updates = {};
  // Ülke bize ait
  if (cData.owner === localPlayerId) {
    let totalSupporters = 0;
    if (cData.supporters) {
      for (let sId in cData.supporters) {
        totalSupporters += cData.supporters[sId];
      }
    }
    const occupantSoldiers = cData.soldiers - totalSupporters; // bizim asıl askerimiz
    if (count > occupantSoldiers) {
      showNotification("Bu kadar asker çekemezsiniz (ülkedeki destek hariç)!");
      return;
    }
    updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers - count;
    updates[`players/${localPlayerId}/soldiers`] = p.soldiers + count;

    broadcastNotification(`${p.name}, ${selectedCountry} ülkesinden ${count} asker çekti.`);
    showNotification(`${selectedCountry} ülkesinden ${count} asker çekildi.`);
  } else {
    // Destek askerini geri çek
    const supAmt = cData.supporters && cData.supporters[localPlayerId] ? cData.supporters[localPlayerId] : 0;
    if (count > supAmt) {
      showNotification("Bu ülkede bu kadar destek askeriniz yok!");
      return;
    }
    if (cData.soldiers < count) {
      showNotification("Veri tutarsızlığı: ülkedeki asker yetersiz!");
      return;
    }
    updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers - count;
    const newSup = supAmt - count;
    if (newSup <= 0) {
      updates[`countryData/${selectedCountry}/supporters/${localPlayerId}`] = null;
    } else {
      updates[`countryData/${selectedCountry}/supporters/${localPlayerId}`] = newSup;
    }
    updates[`players/${localPlayerId}/soldiers`] = p.soldiers + count;

    broadcastNotification(`${p.name}, ${selectedCountry} ülkesinden destek askerini geri çekti.`);
    showNotification(`${selectedCountry} ülkesinden destek askeri çekildi.`);
  }

  roomRef.update(updates);
});

// => DESTEK GÖNDER
document.getElementById("send-support-btn").addEventListener("click", () => {
  const recipient = document.getElementById("support-recipient").value;
  const cName = document.getElementById("support-recipient-country").value;
  const num = parseInt(document.getElementById("support-soldiers").value);

  if (!recipient || !cName) {
    showNotification("Oyuncu ve ülke seçmelisiniz!");
    return;
  }
  if (isNaN(num) || num <= 0) {
    showNotification("Geçerli asker sayısı girin!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (!p) return;
  if (p.soldiers < num) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }

  const recData = roomData.players[recipient];
  if (!recData) {
    showNotification("Seçilen oyuncu yok!");
    return;
  }
  const targetC = roomData.countryData[cName];
  if (!targetC) {
    showNotification("Ülke bulunamadı!");
    return;
  }
  if (targetC.owner !== recipient) {
    showNotification("Bu ülke o oyuncuya ait değil!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/soldiers`] = p.soldiers - num;
  updates[`countryData/${cName}/soldiers`] = (targetC.soldiers || 0) + num;

  const oldSup = targetC.supporters && targetC.supporters[localPlayerId] ? targetC.supporters[localPlayerId] : 0;
  updates[`countryData/${cName}/supporters/${localPlayerId}`] = oldSup + num;

  roomRef.update(updates, () => {
    broadcastNotification(`${p.name}, ${recData.name} (${cName}) ülkesine ${num} asker destek gönderdi.`);
    showNotification("Askeri destek gönderildi.");
  });
});

/*****************************************************************
 * Kaynak Gönder
 *****************************************************************/
document.getElementById("send-money-btn").addEventListener("click", () => {
  const amt = parseInt(document.getElementById("money-to-send").value);
  const recId = document.getElementById("recipient-player").value;
  if (isNaN(amt) || amt <= 0 || !recId) {
    showNotification("Geçerli miktar ve alıcı seçin!");
    return;
  }
  if (recId === localPlayerId) {
    showNotification("Kendinize kaynak gönderemezsiniz!");
    return;
  }

  const p = roomData.players[localPlayerId];
  if (!p || p.money < amt) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - amt;
  updates[`players/${recId}/money`] = (roomData.players[recId].money || 0) + amt;
  roomRef.update(updates, () => {
    showNotification(`${amt}$ gönderildi.`);
    broadcastNotification(`${p.name} => ${roomData.players[recId].name}: ${amt}$`);
  });
});

document.getElementById("send-petrol-btn").addEventListener("click", () => {
  const amt = parseInt(document.getElementById("petrol-to-send").value);
  const recId = document.getElementById("recipient-player-petrol").value;
  if (isNaN(amt) || amt <= 0 || !recId) {
    showNotification("Geçerli miktar ve alıcı seçin!");
    return;
  }
  if (recId === localPlayerId) {
    showNotification("Kendinize kaynak gönderemezsiniz!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (!p || p.petrol < amt) {
    showNotification("Yeterli petrol yok!");
    return;
  }
  const updates = {};
  updates[`players/${localPlayerId}/petrol`] = p.petrol - amt;
  updates[`players/${recId}/petrol`] = (roomData.players[recId].petrol || 0) + amt;
  roomRef.update(updates, () => {
    showNotification(`${amt} varil petrol gönderildi.`);
    broadcastNotification(`${p.name} => ${roomData.players[recId].name}: ${amt} varil petrol`);
  });
});

document.getElementById("send-wheat-btn").addEventListener("click", () => {
  const amt = parseInt(document.getElementById("wheat-to-send").value);
  const recId = document.getElementById("recipient-player-wheat").value;
  if (isNaN(amt) || amt <= 0 || !recId) {
    showNotification("Geçerli miktar ve alıcı seçin!");
    return;
  }
  if (recId === localPlayerId) {
    showNotification("Kendinize kaynak gönderemezsiniz!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (!p || p.wheat < amt) {
    showNotification("Yeterli buğday yok!");
    return;
  }
  const updates = {};
  updates[`players/${localPlayerId}/wheat`] = p.wheat - amt;
  updates[`players/${recId}/wheat`] = (roomData.players[recId].wheat || 0) + amt;
  roomRef.update(updates, () => {
    showNotification(`${amt} buğday gönderildi.`);
    broadcastNotification(`${p.name} => ${roomData.players[recId].name}: ${amt} buğday`);
  });
});

/*****************************************************************
 * Bina Kurma & Kale
 *****************************************************************/
document.getElementById("buy-barracks-btn").addEventListener("click", () => {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("barracks-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli sayı girin!");
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
  if (!p) return;
  if (p.money < costMoney || p.petrol < costPetrol || p.wheat < costWheat) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - costPetrol;
  updates[`players/${localPlayerId}/wheat`] = p.wheat - costWheat;
  updates[`countryData/${selectedCountry}/barracksCount`] = cData.barracksCount + q;

  roomRef.update(updates, () => {
    showNotification(`${q} kışla kuruldu!`);
    broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} kışla kurdu.`);
  });
});

document.getElementById("build-factory-btn").addEventListener("click", () => {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("factory-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli sayı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== localPlayerId) {
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

  roomRef.update(updates, () => {
    showNotification(`${q} fabrika kuruldu!`);
    broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} fabrika kurdu.`);
  });
});

document.getElementById("build-refinery-btn").addEventListener("click", () => {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("refinery-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli sayı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== localPlayerId) {
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

  roomRef.update(updates, () => {
    showNotification(`${q} rafine kuruldu!`);
    broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} rafine kurdu.`);
  });
});

document.getElementById("build-grainmill-btn").addEventListener("click", () => {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("grainmill-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli sayı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== localPlayerId) {
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

  roomRef.update(updates, () => {
    showNotification(`${q} değirmen kuruldu!`);
    broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} değirmen kurdu.`);
  });
});

document.getElementById("build-castle-btn").addEventListener("click", () => {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cData.castleDefenseLevel > 0) {
    showNotification("Bu ülkede zaten kale var!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.money < 1000 || p.petrol < 1000 || p.wheat < 1000) {
    showNotification("Kale için yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - 1000;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - 1000;
  updates[`players/${localPlayerId}/wheat`] = p.wheat - 1000;
  updates[`countryData/${selectedCountry}/castleDefenseLevel`] = 1;
  updates[`countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: 1300, petrol: 1300, wheat: 1300
  };
  roomRef.update(updates, () => {
    showNotification("Kale kuruldu (%5 savunma).");
    broadcastNotification(`${p.name}, ${selectedCountry} ülkesine kale kurdu.`);
  });
});

document.getElementById("upgrade-castle-btn").addEventListener("click", () => {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cData.castleDefenseLevel < 1) {
    showNotification("Önce kale kurun!");
    return;
  }
  if (cData.castleDefenseLevel >= 6) {
    showNotification("Kale savunması maksimum (%30)!");
    return;
  }
  if (!cData.castleNextUpgradeCost) {
    showNotification("Yükseltme maliyeti bulunamadı!");
    return;
  }
  const cost = cData.castleNextUpgradeCost;
  const p = roomData.players[localPlayerId];
  if (p.money < cost.money || p.petrol < cost.petrol || p.wheat < cost.wheat) {
    showNotification("Güçlendirme için yeterli kaynağınız yok!");
    return;
  }

  const newLevel = cData.castleDefenseLevel + 1;
  const newMoney = p.money - cost.money;
  const newPetrol = p.petrol - cost.petrol;
  const newWheat = p.wheat - cost.wheat;

  const nm = Math.floor(cost.money * 1.3);
  const np = Math.floor(cost.petrol * 1.3);
  const nw = Math.floor(cost.wheat * 1.3);

  const updates = {};
  updates[`players/${localPlayerId}/money`] = newMoney;
  updates[`players/${localPlayerId}/petrol`] = newPetrol;
  updates[`players/${localPlayerId}/wheat`] = newWheat;
  updates[`countryData/${selectedCountry}/castleDefenseLevel`] = newLevel;
  updates[`countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: nm, petrol: np, wheat: nw
  };

  roomRef.update(updates, () => {
    updateCastleUpgradeCostUI();
    broadcastNotification(`${p.name}, ${selectedCountry} kalesini güçlendirdi (Seviye ${newLevel}).`);
    showNotification(`Kale güçlendirildi. Yeni seviye: ${newLevel} (%${newLevel*5} savunma).`);
  });
});

function updateCastleUpgradeCostUI() {
  const costSpan = document.getElementById("castle-upgrade-cost-text");
  if (!costSpan) return;
  if (!selectedCountry || !roomData.countryData[selectedCountry]) {
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
  const cost = cData.castleNextUpgradeCost;
  costSpan.textContent = `${cost.money}$ + ${cost.petrol} Varil + ${cost.wheat} Buğday`;
}

/*****************************************************************
 * Saldırmazlık Pakti
 *****************************************************************/
function hasActivePact(a, b) {
  if (!roomData || !roomData.pacts) return false;
  const rd = roomData.round || 1;
  for (let pactId in roomData.pacts) {
    const pact = roomData.pacts[pactId];
    if (pact.active && rd <= pact.expirationRound) {
      if (
        (pact.playerA === a && pact.playerB === b) ||
        (pact.playerA === b && pact.playerB === a)
      ) {
        return true;
      }
    }
  }
  return false;
}

// Pakt Teklif Gönder
document.getElementById("send-pact-offer-btn").addEventListener("click", () => {
  if (!isMyTurn()) {
    showNotification("Pakt teklifini sadece kendi sıranızda gönderebilirsiniz!");
    return;
  }
  const rec = document.getElementById("pact-offer-recipient").value;
  const dur = parseInt(document.getElementById("pact-duration").value);
  const cost = parseInt(document.getElementById("pact-cost").value);

  if (!rec || rec === localPlayerId) {
    showNotification("Lütfen bir oyuncu seçin!");
    return;
  }
  if (isNaN(dur) || dur <= 0) {
    showNotification("Geçerli tur sayısı girin!");
    return;
  }
  if (isNaN(cost) || cost < 0) {
    showNotification("Geçerli bir para miktarı girin (0 veya üzeri)!");
    return;
  }
  if (hasActivePact(localPlayerId, rec)) {
    showNotification("Zaten aktif bir paktınız var!");
    return;
  }

  const senderData = roomData.players[localPlayerId];
  if (!senderData) return;

  const offerRef = roomRef.child("pactOffers").push();
  const newOffer = {
    offerId: offerRef.key,
    senderId: localPlayerId,
    senderName: senderData.name,
    recipientId: rec,
    duration: dur,
    cost: cost,
    status: "pending",
    timestamp: Date.now() // Paktın atıldığı zaman
  };
  offerRef.set(newOffer);

  broadcastNotification(`Pakt Teklifi: ${senderData.name} → ${roomData.players[rec].name} (Tur:${dur}, Para:${cost}$)`);
  showNotification("Pakt teklifi gönderildi!");

  // 2 dakika içinde cevaplanmazsa otomatik iptal
  setTimeout(() => {
    // Teklife sonradan bak -> hala pending mi?
    roomRef.child("pactOffers").child(newOffer.offerId).once("value", (snap) => {
      const off = snap.val();
      if (off && off.status === "pending") {
        // iptal
        roomRef.child("pactOffers").child(newOffer.offerId).update({status: "rejected"});
        broadcastNotification(`Pakt Teklifi Süresi Doldu: ${senderData.name} → ${roomData.players[rec].name}`);
      }
    });
  }, PACT_OFFER_TIMEOUT);
});

// Gelen Teklifler Listesi
function displayPendingPactOffers() {
  const container = document.getElementById("pact-pending-offers");
  if (!container) return;
  container.innerHTML = "";
  if (!roomData || !roomData.pactOffers) return;

  Object.values(roomData.pactOffers).forEach((offer) => {
    if (offer.status === "pending" && offer.recipientId === localPlayerId) {
      const div = document.createElement("div");
      div.className = "pact-offer-item";
      div.dataset.offerId = offer.offerId;
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

document.getElementById("pact-pending-offers").addEventListener("click", (e) => {
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

  // Zaten aktif pakt var mı?
  if (hasActivePact(offer.senderId, offer.recipientId)) {
    showNotification("Bu oyuncu ile zaten pakt var!");
    roomRef.child(`pactOffers/${offerId}`).update({status: "rejected"});
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
    roomRef.child(`pactOffers/${offerId}`).update({status: "rejected"});
    return;
  }
  const expRound = (roomData.round || 1) + offer.duration;
  const pactKey = db.ref().push().key;

  const updates = {};
  updates[`pactOffers/${offerId}/status`] = "accepted";
  updates[`players/${offer.senderId}/money`] = sender.money - offer.cost;
  updates[`players/${offer.recipientId}/money`] = recipient.money + offer.cost;
  updates[`pacts/${pactKey}`] = {
    playerA: offer.senderId,
    playerB: offer.recipientId,
    active: true,
    cost: offer.cost,
    duration: offer.duration,
    expirationRound: expRound
  };

  roomRef.update(updates, () => {
    broadcastNotification(`Pakt Anlaşması: ${sender.name} & ${recipient.name} (Tur:${offer.duration}, Para:${offer.cost}$)`);
    showNotification("Pakt teklifi kabul edildi!");
  });
}

function rejectPactOffer(offerId) {
  const offer = roomData.pactOffers[offerId];
  if (!offer || offer.status !== "pending") return;
  roomRef.child(`pactOffers/${offerId}`).update({status: "rejected"});
  broadcastNotification(`Pakt Reddedildi: ${offer.senderName} → Reddedildi.`);
  showNotification("Pakt teklifi reddedildi.");
}

// Aktif Paktlar
function displayActivePacts() {
  const container = document.getElementById("active-pacts-container");
  if (!container) return;
  container.innerHTML = "";
  if (!roomData || !roomData.pacts) return;

  const rd = roomData.round || 1;
  Object.keys(roomData.pacts).forEach((id) => {
    const pact = roomData.pacts[id];
    if (pact.active && rd <= pact.expirationRound) {
      if (pact.playerA === localPlayerId || pact.playerB === localPlayerId) {
        const otherId = (pact.playerA === localPlayerId) ? pact.playerB : pact.playerA;
        const otherName = roomData.players[otherId]?.name || "???";
        const roundsLeft = pact.expirationRound - rd + 1;

        const el = document.createElement("div");
        el.className = "active-pact-item";
        el.innerHTML = `
          <p>Pakt: <strong>${otherName}</strong></p>
          <p>Kalan Tur: <strong>${roundsLeft}</strong></p>
        `;
        container.appendChild(el);
      }
    }
  });
}

/*****************************************************************
 * Ticaret (Market)
 *****************************************************************/
function displayTradeOffers() {
  const listDiv = document.getElementById("trade-offers-list");
  if (!listDiv) return;
  listDiv.innerHTML = "";
  if (!roomData || !roomData.tradeOffers) return;

  Object.values(roomData.tradeOffers).forEach((offer) => {
    if (offer.status === "pending") {
      // Ambargo
      if (offer.embargo && offer.embargo.includes(localPlayerId)) {
        return; // görmeyelim
      }
      const itemDiv = document.createElement("div");
      itemDiv.className = "offer-item";

      const itemLabel = (offer.itemType === "petrol") ? "Petrol" : "Buğday";
      let html = `
        <p><strong>Satıcı:</strong> ${offer.sellerName}</p>
        <p><strong>Ürün:</strong> ${itemLabel}</p>
        <p><strong>Mevcut Miktar:</strong> ${offer.quantity}</p>
        <p><strong>Birim Fiyat:</strong> ${offer.price} $</p>
      `;

      if (offer.sellerId === localPlayerId) {
        // İptal
        html += `
          <button class="cancel-offer-btn" style="background:linear-gradient(45deg, #c0392b, #e74c3c); margin-top:10px;">İptal Et</button>
        `;
      } else {
        // Satın alma
        html += `
          <label style="font-size:14px;color:#ccc;">Almak istediğiniz miktar:</label>
          <input type="number" class="partial-buy-quantity" min="1" max="${offer.quantity}" />
          <button class="partial-buy-btn">Satın Al</button>
        `;
      }

      if (offer.embargo && offer.embargo.length > 0) {
        const embUsers = offer.embargo.map(id => roomData.players[id]?.name || "???").join(", ");
        html += `<p style="color:red;"><strong>Ambargo:</strong> ${embUsers}</p>`;
      }

      itemDiv.innerHTML = html;
      listDiv.appendChild(itemDiv);

      // Events
      const partialBuyBtn = itemDiv.querySelector(".partial-buy-btn");
      if (partialBuyBtn) {
        partialBuyBtn.addEventListener("click", () => {
          const input = itemDiv.querySelector(".partial-buy-quantity");
          const amt = parseInt(input.value);
          if (isNaN(amt) || amt <= 0) {
            showNotification("Geçerli miktar girin!");
            return;
          }
          acceptTradeOffer(offer.offerId, amt);
        });
      }
      const cancelBtn = itemDiv.querySelector(".cancel-offer-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          cancelTradeOffer(offer.offerId);
        });
      }
    }
  });
}

document.getElementById("create-trade-offer-btn").addEventListener("click", createTradeOffer);

function createTradeOffer() {
  const itemType = document.getElementById("trade-item-type").value;
  const qty = parseInt(document.getElementById("trade-quantity").value);
  const price = parseInt(document.getElementById("trade-price").value);
  const embargoSelect = document.getElementById("embargo-players");
  let embargoList = [];
  for (let i = 0; i < embargoSelect.options.length; i++) {
    if (embargoSelect.options[i].selected) {
      embargoList.push(embargoSelect.options[i].value);
    }
  }

  if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
    showNotification("Geçerli adet ve fiyat girin!");
    return;
  }

  const seller = roomData.players[localPlayerId];
  if (!seller) return;

  let enough = false;
  if (itemType === "petrol" && seller.petrol >= qty) {
    enough = true;
  } else if (itemType === "wheat" && seller.wheat >= qty) {
    enough = true;
  }
  if (!enough) {
    showNotification("Satacak yeterli miktar yok!");
    return;
  }

  const tRef = roomRef.child("tradeOffers").push();
  const newOffer = {
    offerId: tRef.key,
    sellerId: localPlayerId,
    sellerName: seller.name,
    itemType: itemType,
    quantity: qty,
    price: price,
    status: "pending",
    embargo: embargoList
  };
  tRef.set(newOffer);

  broadcastNotification(`${seller.name} bir ticaret teklifi oluşturdu (${itemType}, adet:${qty}, fiyat:${price}$).`);
  showNotification("Ticaret teklifi oluşturuldu!");
}

function acceptTradeOffer(offerId, buyAmount) {
  if (!roomData.tradeOffers || !roomData.tradeOffers[offerId]) {
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
  if (!seller || !buyer) return;

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

  if (offer.itemType === "petrol" && seller.petrol >= buyAmount) {
    hasEnough = true;
    updates[`players/${offer.sellerId}/petrol`] = seller.petrol - buyAmount;
    updates[`players/${localPlayerId}/petrol`] = buyer.petrol + buyAmount;
  } else if (offer.itemType === "wheat" && seller.wheat >= buyAmount) {
    hasEnough = true;
    updates[`players/${offer.sellerId}/wheat`] = seller.wheat - buyAmount;
    updates[`players/${localPlayerId}/wheat`] = buyer.wheat + buyAmount;
  }
  if (!hasEnough) {
    showNotification("Satıcının yeterli ürünü kalmamış!");
    return;
  }

  updates[`players/${localPlayerId}/money`] = buyer.money - totalCost;
  updates[`players/${offer.sellerId}/money`] = seller.money + totalCost;

  const newQty = offer.quantity - buyAmount;
  if (newQty <= 0) {
    updates[`tradeOffers/${offer.offerId}/status`] = "completed";
  }
  updates[`tradeOffers/${offer.offerId}/quantity`] = newQty;

  roomRef.update(updates, () => {
    broadcastNotification(`Ticaret: ${seller.name} -> ${buyer.name} (${buyAmount} x ${offer.itemType}).`);
    showNotification("Ticaret başarıyla gerçekleşti!");
  });
}

function cancelTradeOffer(offerId) {
  const offer = roomData.tradeOffers[offerId];
  if (!offer) return;
  if (offer.sellerId !== localPlayerId) {
    showNotification("Sadece kendi teklifinizi iptal edebilirsiniz!");
    return;
  }
  if (offer.status !== "pending") {
    showNotification("Bu teklif zaten tamamlanmış veya iptal edilmiş.");
    return;
  }
  roomRef.child("tradeOffers").child(offerId).update({status: "cancelled"});
  broadcastNotification(`Ticaret teklifi iptal edildi: ${offer.sellerName}`);
  showNotification("Teklif iptal edildi.");
}

/*****************************************************************
 * Chat Sistemi
 *****************************************************************/
document.getElementById("open-chat-btn").addEventListener("click", () => {
  toggleChat(!chatOpen);
});
document.getElementById("close-chat-btn").addEventListener("click", () => {
  toggleChat(false);
});

function toggleChat(show) {
  chatPopup.style.display = show ? "flex" : "none";
  chatOpen = show;
  if (chatOpen) {
    unreadMessages = 0;
    updateChatBadge();
  }
}

document.getElementById("send-chat-btn").addEventListener("click", sendChatMessage);
document.getElementById("chat-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendChatMessage();
  }
});

function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;

  let senderName = "Anon";
  if (roomData && roomData.players && roomData.players[localPlayerId]) {
    senderName = roomData.players[localPlayerId].name;
  } else if (isSpectator) {
    senderName = "İzleyici";
  }
  const msgObj = {
    sender: senderName,
    senderId: localPlayerId,
    text: text,
    recipientId: "",
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(msgObj, () => {
    input.value = "";
  });
}

// Özel mesaj
document.getElementById("send-private-message-btn").addEventListener("click", () => {
  const pmInput = document.getElementById("private-message-input");
  const pmRecipient = document.getElementById("private-message-recipient");
  const text = pmInput.value.trim();
  const rec = pmRecipient.value;
  if (!text || !rec) return;

  let senderName = "Anon";
  if (roomData && roomData.players && roomData.players[localPlayerId]) {
    senderName = roomData.players[localPlayerId].name;
  } else if (isSpectator) {
    senderName = "İzleyici";
  }
  const pm = {
    sender: senderName,
    senderId: localPlayerId,
    text: text,
    recipientId: rec,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(pm, () => {
    pmInput.value = "";
    showNotification("Özel mesaj gönderildi!");
  });
});

function appendChatMessage(msg) {
  // PM?
  if (msg.recipientId && msg.recipientId !== "") {
    // Bize mi? veya bizden mi?
    if (msg.senderId !== localPlayerId && msg.recipientId !== localPlayerId) {
      return; // İlgisiz
    }
  }
  const chatMessages = document.getElementById("chat-messages");
  const div = document.createElement("div");

  if (msg.recipientId && msg.recipientId !== "") {
    // PM
    const targetName = roomData.players[msg.recipientId]?.name || "Bilinmeyen";
    if (msg.senderId === localPlayerId) {
      div.innerHTML = `<strong>[PM to ${targetName}]:</strong> ${msg.text}`;
    } else {
      div.innerHTML = `<strong>[PM from ${msg.sender}]:</strong> ${msg.text}`;
    }
    div.style.color = "#f39c12";
  } else {
    // Genel
    div.textContent = msg.sender + ": " + msg.text;
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (!chatOpen && msg.senderId !== localPlayerId) {
    unreadMessages++;
    updateChatBadge();
  }
}

function updateChatBadge() {
  const chatBtn = document.getElementById("open-chat-btn");
  if (unreadMessages > 0) {
    chatBtn.dataset.badge = unreadMessages;
  } else {
    chatBtn.dataset.badge = "";
  }
}

/*****************************************************************
 * Select Listeleri Güncelleme (Asker Destek, Kaynak Gönderme, Pakt)
 *****************************************************************/
function updateRecipientSelects() {
  const moneySel = document.getElementById("recipient-player");
  const petrolSel = document.getElementById("recipient-player-petrol");
  const wheatSel = document.getElementById("recipient-player-wheat");
  if (!moneySel || !petrolSel || !wheatSel) return;

  moneySel.innerHTML = "";
  petrolSel.innerHTML = "";
  wheatSel.innerHTML = "";

  if (!roomData || !roomData.players) return;
  Object.keys(roomData.players).forEach((pid) => {
    if (pid === localPlayerId) return; // kendimize gönderme
    const pData = roomData.players[pid];
    if (!pData) return;

    const opt1 = document.createElement("option");
    opt1.value = pid;
    opt1.textContent = pData.name;
    moneySel.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = pid;
    opt2.textContent = pData.name;
    petrolSel.appendChild(opt2);

    const opt3 = document.createElement("option");
    opt3.value = pid;
    opt3.textContent = pData.name;
    wheatSel.appendChild(opt3);
  });
}

function updatePrivateMessageRecipientSelect() {
  const pmSel = document.getElementById("private-message-recipient");
  if (!pmSel) return;
  pmSel.innerHTML = "";
  if (!roomData || !roomData.players) return;

  Object.keys(roomData.players).forEach((pid) => {
    if (pid === localPlayerId) return;
    const pData = roomData.players[pid];
    if (!pData) return;
    const opt = document.createElement("option");
    opt.value = pid;
    opt.textContent = pData.name;
    pmSel.appendChild(opt);
  });
}

function updateEmbargoPlayersSelect() {
  const embargoSel = document.getElementById("embargo-players");
  if (!embargoSel) return;
  embargoSel.innerHTML = "";

  if (!roomData || !roomData.players) return;
  Object.keys(roomData.players).forEach((pid) => {
    if (pid === localPlayerId) return;
    const pData = roomData.players[pid];
    if (!pData) return;
    const opt = document.createElement("option");
    opt.value = pid;
    opt.textContent = pData.name;
    embargoSel.appendChild(opt);
  });
}

function updateSupportRecipientSelect() {
  const supRec = document.getElementById("support-recipient");
  if (!supRec) return;
  supRec.innerHTML = "<option value=''>--Oyuncu Seç--</option>";

  if (!roomData || !roomData.players) return;
  Object.keys(roomData.players).forEach((pid) => {
    if (pid === localPlayerId) return;
    supRec.innerHTML += `<option value='${pid}'>${roomData.players[pid].name}</option>`;
  });
}

document.getElementById("support-recipient").addEventListener("change", function() {
  const supRecC = document.getElementById("support-recipient-country");
  supRecC.innerHTML = "<option value=''>--Ülke Seç--</option>";
  const selPid = this.value;
  if (!selPid || !roomData.players[selPid]) return;
  const recData = roomData.players[selPid];
  if (!recData.countries) return;
  recData.countries.forEach((cName) => {
    supRecC.innerHTML += `<option value='${cName}'>${cName}</option>`;
  });
});

function updatePactRecipientSelect() {
  const pactSel = document.getElementById("pact-offer-recipient");
  if (!pactSel) return;
  pactSel.innerHTML = "";
  if (!roomData || !roomData.players) return;

  Object.keys(roomData.players).forEach((pid) => {
    if (pid === localPlayerId) return;
    const pData = roomData.players[pid];
    if (!pData) return;
    const opt = document.createElement("option");
    opt.value = pid;
    opt.textContent = pData.name;
    pactSel.appendChild(opt);
  });
}

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
      // Oyuncu var mı?
      if (rDat.players && rDat.players[localPlayerId]) {
        roomRef = refCheck;
        joinRoomAsPlayer();
      } else if (rDat.watchers && rDat.watchers[localPlayerId]) {
        // spect
        isSpectator = true;
        roomRef = refCheck;
        joinRoomAsSpectator();
      }
    });
  }

  // Harita
  const gameContainerObserver = new MutationObserver(() => {
    if (gameContainer.style.display !== "none") {
      initializeMap();
    }
  });
  gameContainerObserver.observe(gameContainer, {
    attributes: true, attributeFilter: ["style"]
  });
});
