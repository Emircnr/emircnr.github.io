/***************************************************************
 * OYUN MANTIĞI (gameLogic2.js)
 * Bu dosya, daha önce paylaşılan HTML (index) ile birlikte
 * çalışacak şekilde tasarlanmıştır.
 ***************************************************************/

/*****************************************************************
 * 1) Firebase Başlatma
 *****************************************************************/
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};
// Firebase başlat
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/*****************************************************************
 * 2) GLOBAL DEĞİŞKENLER
 *****************************************************************/
let localPlayerId = null;             // Kullanıcıya özel benzersiz ID (localStorage'da saklarız)
let currentRoomId = null;            // Şu an bulunduğumuz odanın (Firebase key) referansı
let roomRef = null;                  // db.ref("rooms/"+currentRoomId)
let roomData = null;                 // Odanın anlık verisi
let isSpectator = false;             // İzleyici mi, oyuncu mu?
let localPlayerColor = null;         // Oyuncunun seçtiği renk
let selectedCountry = null;          // Haritada seçilen ülke
let map = null;                      // Leaflet harita objesi
let geoJsonLayer = null;             // Leaflet GeoJSON katmanı
let infoCardsPermanent = false;      // Ülke bilgisi tooltip sürekli açık/kapalı
let chatOpen = false;                // Sohbet penceresi açık mı?
let unreadMessages = 0;              // Okunmamış mesaj sayısı
let notificationsMuted = false;      // Bildirimler kapalı mı?
let turnTimerInterval = null;        // 60 sn turn sayacı
let turnTimeRemaining = 60;          // Geri sayım
let startInterval = null;            // Oyun başlama geri sayacı (30 sn)
let pactCheckInterval = null;        // Pakt tekliflerini 2 dk kontrol için interval

// Kullanılabilir renkler:
const availableColors = [
  "red", "blue", "green", "yellow",
  "purple", "orange", "brown", "pink",
  "cyan", "magenta", "lime", "teal",
  "navy", "maroon", "olive", "gray"
];

/*****************************************************************
 * 3) DOMContentLoaded OLAYI
 *****************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  // Kullanıcıya yerel bir ID atanmamışsa oluştur
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  // Lobi ekranındaki renk kutucuklarını oluştur
  initColorSelectionUI();

  // Oda oluşturma butonu
  document.getElementById("create-room-btn").addEventListener("click", createRoom);

  // Odalar listesini sürekli takip et
  listenRoomsList();

  // Bildirim butonuna tıklandığında kapat/aç
  document.getElementById("open-notifications-btn").addEventListener("click", () => {
    notificationsMuted = !notificationsMuted;
    if (!notificationsMuted) {
      showNotification("Bildirimler açıldı.");
    } else {
      showNotification("Bildirimler kapatıldı.");
    }
  });

  // Oyun içi popup butonları
  initGamePopupsButtons();

  // Otomatik yeniden bağlanma (sayfa yenilenmiş olabilir)
  autoReconnect();
});

/*****************************************************************
 * 4) LOBİ EKRANI - Renk Seçimi Arayüzü
 *****************************************************************/
function initColorSelectionUI() {
  const container = document.getElementById("color-selection-container");
  if (!container) return;

  availableColors.forEach((color) => {
    const div = document.createElement("div");
    div.className = "color-box";
    div.style.backgroundColor = color;
    div.addEventListener("click", () => {
      // Seçili rengi kaldır
      container.querySelectorAll(".color-box").forEach((el) => {
        el.classList.remove("selected");
      });
      // Yeni seçili
      div.classList.add("selected");
      localPlayerColor = color;
    });
    container.appendChild(div);
  });
}

/*****************************************************************
 * 5) LOBİ EKRANI - ODA LİSTESİNİ DİNLER
 *****************************************************************/
function listenRoomsList() {
  const roomsListEl = document.getElementById("rooms-list");
  if (!roomsListEl) return;

  // rooms verisini sürekli dinle
  db.ref("rooms").on("value", (snapshot) => {
    const roomsData = snapshot.val();
    roomsListEl.innerHTML = "";

    if (!roomsData) {
      // Hiç oda yok
      const p = document.createElement("p");
      p.textContent = "Henüz oda yok. Yukarıdan yeni bir oda oluşturun.";
      roomsListEl.appendChild(p);
      return;
    }

    // Odaları ekrana bas
    Object.keys(roomsData).forEach((roomId) => {
      const r = roomsData[roomId];
      if (!r) return;

      const itemDiv = document.createElement("div");
      itemDiv.className = "room-item";

      // Oda bilgisi
      const infoDiv = document.createElement("div");
      infoDiv.className = "room-info";
      const roomNameEl = document.createElement("span");
      roomNameEl.innerHTML = `<strong>Oda Adı:</strong> ${r.roomName}`;
      const playerCountEl = document.createElement("span");
      let playerCount = r.players ? Object.keys(r.players).length : 0;
      playerCountEl.textContent = `Oyuncu: ${playerCount}/16`;

      infoDiv.appendChild(roomNameEl);
      infoDiv.appendChild(playerCountEl);

      // Actions
      const actionsDiv = document.createElement("div");
      actionsDiv.className = "room-actions";

      // Katıl butonu / Kilitli
      if (r.roomPassword) {
        // Kilit varsa
        if (r.gameState === "waiting" && playerCount < 16) {
          const lockedBtn = document.createElement("button");
          lockedBtn.className = "locked-btn";
          lockedBtn.textContent = "Katıl (Şifre)";
          lockedBtn.addEventListener("click", () => {
            // Şifre sor
            const pwd = prompt("Oda şifresini giriniz:");
            if (pwd === r.roomPassword) {
              joinRoom(roomId, false);  // izle = false
            } else {
              showNotification("Hatalı şifre!");
            }
          });
          actionsDiv.appendChild(lockedBtn);
        }
      } else {
        // Şifre yok
        if (r.gameState === "waiting" && playerCount < 16) {
          const joinBtn = document.createElement("button");
          joinBtn.className = "join-btn";
          joinBtn.textContent = "Katıl";
          joinBtn.addEventListener("click", () => joinRoom(roomId, false));
          actionsDiv.appendChild(joinBtn);
        }
      }

      // İzle butonu (oda başlasa da izlenebilir)
      const watchBtn = document.createElement("button");
      watchBtn.className = "watch-btn";
      watchBtn.textContent = "İzle";
      watchBtn.addEventListener("click", () => {
        joinRoom(roomId, true); // izle = true
      });
      actionsDiv.appendChild(watchBtn);

      itemDiv.appendChild(infoDiv);
      itemDiv.appendChild(actionsDiv);
      roomsListEl.appendChild(itemDiv);
    });
  });
}

/*****************************************************************
 * 6) ODA OLUŞTURMA
 *****************************************************************/
function createRoom() {
  const roomNameInput = document.getElementById("room-name");
  const roomPwdInput = document.getElementById("room-password");
  const playerNameInput = document.getElementById("player-name");

  const rName = roomNameInput.value.trim();
  const rPwd = roomPwdInput.value.trim() || "";
  const pName = playerNameInput.value.trim();

  if (!rName) {
    showNotification("Lütfen oda adı giriniz!");
    return;
  }
  if (!pName) {
    showNotification("Lütfen oyuncu adınızı giriniz!");
    return;
  }
  if (!localPlayerColor) {
    showNotification("Lütfen bir renk seçiniz!");
    return;
  }

  // Yeni oda referansı
  const newRoomRef = db.ref("rooms").push();
  currentRoomId = newRoomRef.key;

  // Oda verisi
  const newRoomData = {
    roomName: rName,
    roomPassword: rPwd,  // varsa
    hostId: localPlayerId,
    gameState: "waiting",
    startTime: null,   // "starting" aşamasında 30 sn
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    players: {},
    watchers: {},
    usedColors: {
      [localPlayerColor]: true // Seçili rengi rezerve ediyoruz
    },
    round: 1,
    currentTurnIndex: 0,
    playerOrder: [localPlayerId]
  };

  // Oyuncu verisi
  newRoomData.players[localPlayerId] = {
    name: pName,
    color: localPlayerColor,
    money: 1000,
    soldiers: 0,
    petrol: 100,
    wheat: 400,
    countries: [],
    isHost: true,
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  };

  // Firebase'e yaz
  newRoomRef.set(newRoomData, (err) => {
    if (err) {
      showNotification("Oda oluşturulurken hata oluştu!");
    } else {
      showNotification("Oda oluşturuldu.");
      localStorage.setItem("roomId", currentRoomId);
      localStorage.setItem("isSpectator", "false");
      isSpectator = false;
      roomRef = newRoomRef;

      // Lobi gizle, oyun ekranını göster
      document.getElementById("lobby-container").style.display = "none";
      document.getElementById("game-container").style.display = "block";

      // Oda verisini dinlemeye başla
      listenRoomData();
      // Ülke datasını kurucu yükleyip kaydedecek
      loadAndInitializeGeoJson();
      // Arayüz
      document.getElementById("display-room-name").textContent = rName;
    }
  });
}

/*****************************************************************
 * 7) ODAYA KATIL (Oyuncu veya İzleyici)
 *****************************************************************/
function joinRoom(roomId, spectate = false) {
  // room verisine eriş
  const ref = db.ref("rooms/" + roomId);
  ref.once("value", (snapshot) => {
    if (!snapshot.exists()) {
      showNotification("Böyle bir oda bulunamadı!");
      return;
    }
    const rData = snapshot.val();
    // Oyun başlamış mı?
    if (rData.gameState !== "waiting") {
      // Yalnızca izleyici olarak girebilir
      if (!spectate) {
        showNotification("Oyun başlamış; oyuncu olarak katılamazsınız!");
        return;
      }
    }
    // 16 oyuncu limiti
    const playerCount = rData.players ? Object.keys(rData.players).length : 0;
    if (!spectate && playerCount >= 16) {
      showNotification("Oda dolu (16)!");
      return;
    }

    // İzleyici olarak mı?
    if (spectate) {
      // watchers altına ekle
      const updates = {};
      updates[`watchers/${localPlayerId}`] = {
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      };
      ref.update(updates, (err) => {
        if (err) {
          showNotification("İzleyici olarak girilemedi!");
        } else {
          currentRoomId = roomId;
          isSpectator = true;
          localStorage.setItem("roomId", roomId);
          localStorage.setItem("isSpectator", "true");
          showNotification("Odayı izliyorsunuz.");
          // Lobi gizle, oyun ekranı
          document.getElementById("lobby-container").style.display = "none";
          document.getElementById("game-container").style.display = "block";

          // Dinleme
          roomRef = db.ref("rooms/" + currentRoomId);
          listenRoomData();

          document.getElementById("display-room-name").textContent = rData.roomName || "-";
        }
      });
    } else {
      // Oyuncu olarak
      const pName = document.getElementById("player-name").value.trim();
      if (!pName) {
        showNotification("Oyuncu adınızı girmediniz!");
        return;
      }
      if (!localPlayerColor) {
        showNotification("Lütfen bir renk seçiniz!");
        return;
      }
      // Renk daha önce kullanıldı mı?
      if (rData.usedColors && rData.usedColors[localPlayerColor]) {
        showNotification("Bu renk zaten alınmış, başka renk seçin!");
        return;
      }

      const updates = {};
      // usedColors
      updates[`usedColors/${localPlayerColor}`] = true;
      // player
      updates[`players/${localPlayerId}`] = {
        name: pName,
        color: localPlayerColor,
        money: 1000,
        soldiers: 0,
        petrol: 100,
        wheat: 400,
        countries: [],
        isHost: false,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      };
      // playerOrder
      const newOrder = rData.playerOrder || [];
      newOrder.push(localPlayerId);
      updates["playerOrder"] = newOrder;

      ref.update(updates, (err) => {
        if (err) {
          showNotification("Odaya katılırken hata oluştu!");
        } else {
          currentRoomId = roomId;
          isSpectator = false;
          localStorage.setItem("roomId", roomId);
          localStorage.setItem("isSpectator", "false");
          showNotification("Odaya katıldınız.");
          // Lobi gizle, oyun ekranı
          document.getElementById("lobby-container").style.display = "none";
          document.getElementById("game-container").style.display = "block";

          // Dinleme
          roomRef = db.ref("rooms/" + currentRoomId);
          listenRoomData();

          document.getElementById("display-room-name").textContent = rData.roomName || "-";
        }
      });
    }
  });
}

/*****************************************************************
 * 8) ODA VERİSİNİ (roomRef) DİNLER
 *****************************************************************/
function listenRoomData() {
  if (!roomRef) return;

  // Her güncellemede
  roomRef.on("value", (snapshot) => {
    roomData = snapshot.val();
    if (!roomData) return;
    updateGameUI();
  });

  // Chat dinleme
  roomRef.child("chat").on("child_added", (snap) => {
    const msg = snap.val();
    appendChatMessage(msg);
  });

  // Global bildirim dinleme
  roomRef.child("notifications").on("child_added", (snap) => {
    const data = snap.val();
    if (data && data.text) {
      displayGlobalNotification(data.text);
    }
  });

  // Pakt teklifleri 2 dk kontrol
  if (!pactCheckInterval) {
    pactCheckInterval = setInterval(() => {
      removeExpiredPactOffers();
    }, 15_000);  // 15 sn'de bir kontrol
  }
}

/*****************************************************************
 * 9) OTO. YENİDEN BAĞLANMA (Sayfa yenilemesi vs.)
 *****************************************************************/
function autoReconnect() {
  const savedRoomId = localStorage.getItem("roomId");
  const spect = localStorage.getItem("isSpectator") === "true";
  if (savedRoomId) {
    const refCheck = db.ref("rooms/" + savedRoomId);
    refCheck.once("value", (snap) => {
      if (!snap.exists()) return;
      const rData = snap.val();
      // Eğer bu player kayıtta yoksa (oyuncu ya da watcher) - alakasız
      if ((!spect && !rData.players?.[localPlayerId]) &&
          (!rData.watchers?.[localPlayerId])) {
        return; 
      }
      currentRoomId = savedRoomId;
      isSpectator = spect;
      roomRef = refCheck;

      // Lobi gizle, oyun ekranı göster
      document.getElementById("lobby-container").style.display = "none";
      document.getElementById("game-container").style.display = "block";
      document.getElementById("display-room-name").textContent = rData.roomName || "-";
      listenRoomData();
    });
  }
}

/*****************************************************************
 * 10) OYUN EKRANI ARAYÜZ GÜNCELLEME
 *****************************************************************/
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

  // Oyuncular listesini güncelle
  updatePlayersPopup();

  // Harita güncelle
  if (map && roomData.countryData && geoJsonLayer) {
    geoJsonLayer.eachLayer((layer) => {
      const cname = layer.feature.properties.name;
      const cData = roomData.countryData[cname];
      if (!cData) return;

      if (cData.owner && roomData.players[cData.owner]) {
        layer.setStyle({
          fillColor: roomData.players[cData.owner].color,
          fillOpacity: 0.7,
          color: "#555",
          weight: 1
        });
      } else {
        layer.setStyle({
          fillColor: "#ccc",
          fillOpacity: 0.7,
          color: "#555",
          weight: 1
        });
      }
      layer.setTooltipContent(getCountryPopupContent(cname, cData));
    });
  }

  // Destek gönderme, kaynak gönderme vb. select listeleri
  updateSelectLists();

  // 60 sn turn sayaç
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

/*****************************************************************
 * 11) OYUN DURUMU YÖNETİMİ (waiting, starting, started)
 *****************************************************************/
function handleGameState(state) {
  const startBtn = document.getElementById("start-game-btn");
  const countdownSpan = document.getElementById("start-countdown");

  // Eğer izleyiciysek start butonunu hiçbir zaman görmeyiz
  if (isSpectator) {
    startBtn.style.display = "none";
    countdownSpan.style.display = "none";
    return;
  }

  // Host isek, waiting durumunda buton görebiliriz
  if (roomData.hostId === localPlayerId && state === "waiting") {
    startBtn.style.display = "block";
  } else {
    startBtn.style.display = "none";
  }

  if (state === "waiting") {
    countdownSpan.style.display = "none";
  } else if (state === "starting") {
    countdownSpan.style.display = "inline";
    startBtn.style.display = "none";
    startCountdownListener();
  } else if (state === "started") {
    countdownSpan.style.display = "none";
    clearInterval(startInterval);
    startInterval = null;
  }
}

// "Oyunu Başlat" butonu
document.getElementById("start-game-btn").addEventListener("click", () => {
  // Sadece host ve waiting durumunda
  if (!roomData || roomData.hostId !== localPlayerId) return;
  if (roomData.gameState !== "waiting") return;

  const now = Date.now();
  const startTime = now + 30000; // 30 sn
  roomRef.update({
    gameState: "starting",
    startTime: startTime
  });
});

function startCountdownListener() {
  const countdownSpan = document.getElementById("start-countdown");
  if (startInterval) clearInterval(startInterval);

  startInterval = setInterval(() => {
    if (!roomData || !roomData.startTime) return;
    const now = Date.now();
    const diff = roomData.startTime - now;
    if (diff <= 0) {
      clearInterval(startInterval);
      startInterval = null;
      // Oyun başlasın
      roomRef.update({ gameState: "started" });
      return;
    }
    const secondsLeft = Math.floor(diff / 1000);
    countdownSpan.textContent = secondsLeft;
  }, 1000);
}

/*****************************************************************
 * 12) ÜLKE GEOJSON YÜKLEME (Sadece kurucu ilk oluşturduğunda)
 *****************************************************************/
function loadAndInitializeGeoJson() {
  fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
    .then(res => res.json())
    .then(geoJsonData => {
      const features = geoJsonData.features;

      // Rastgele petrol üretimi ve buğday üretimi atama
      // (örnek olarak kısıtlı sayıda ülkeye random veriler)
      let oilIndexes = pickRandomIndexes(features.length, 40);
      let wheatIndexes = pickRandomIndexes(features.length, 60);

      const countryDataInit = {};
      features.forEach((feature, idx) => {
        const cname = feature.properties.name;
        let oilProd = 0;
        if (oilIndexes.includes(idx)) {
          oilProd = randomInt(150, 500);
        }
        let wheatProd = 0;
        if (wheatIndexes.includes(idx)) {
          wheatProd = randomInt(200, 700);
        }
        countryDataInit[cname] = {
          income: randomInt(100, 600),
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

      // DB'ye kaydet
      roomRef.child("countryData").set(countryDataInit);
    });
}

function pickRandomIndexes(maxIndex, count) {
  const arr = [];
  while (arr.length < count && arr.length < maxIndex) {
    const rnd = Math.floor(Math.random() * maxIndex);
    if (!arr.includes(rnd)) arr.push(rnd);
  }
  return arr;
}
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/*****************************************************************
 * 13) LEAFLET HARİTA
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
          let cData = (roomData && roomData.countryData)
            ? roomData.countryData[cname] : null;

          layer.bindTooltip(
            getCountryPopupContent(cname, cData || {}),
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

// Haritada bir ülke seçildiğinde
function selectCountry(countryName, layer) {
  selectedCountry = countryName;
  showNotification("Seçilen ülke: " + countryName, 1500);

  // Animasyon vurgusu
  layer.setStyle({ weight: 4, color: "#FF4500" });
  setTimeout(() => {
    if (!roomData || !roomData.countryData) return;
    const cData = roomData.countryData[countryName];
    if (cData && cData.owner && roomData.players[cData.owner]) {
      layer.setStyle({
        fillColor: roomData.players[cData.owner].color,
        fillOpacity: 0.7,
        color: "#555",
        weight: 1
      });
    } else {
      layer.setStyle({
        fillColor: "#ccc",
        fillOpacity: 0.7,
        color: "#555",
        weight: 1
      });
    }
  }, 800);

  // Kale yükseltme maliyetini güncelle
  updateCastleUpgradeCostUI();
}

function getCountryPopupContent(countryName, c) {
  const ownerText = (c.owner && roomData.players[c.owner])
    ? roomData.players[c.owner].name : "Yok";

  let effectiveIncome = c.income || 0;
  if (c.factories) {
    effectiveIncome = Math.floor(effectiveIncome * (1 + 0.20 * c.factories));
  }
  const effectiveOil = c.oilProduction
    ? Math.floor(c.oilProduction * (1 + 0.15 * (c.refineries || 0)))
    : 0;
  const effectiveWheat = c.wheatProduction
    ? Math.floor(c.wheatProduction * (1 + 0.20 * (c.grainMills || 0)))
    : 0;

  const defPercent = c.castleDefenseLevel > 0
    ? "%" + (c.castleDefenseLevel * 5)
    : "-";

  return `
    <div>
      <p><i class="fas fa-money-bill-wave"></i> Gelir: ${effectiveIncome}$</p>
      <p><i class="fas fa-users"></i> Asker: ${c.soldiers || 0}</p>
      <p><i class="fas fa-fort-awesome"></i> Kışla: ${c.barracksCount || 0}</p>
      <p><i class="fas fa-industry"></i> Fabrika: ${c.factories || 0}</p>
      <p><i class="fas fa-oil-can"></i> Rafine: ${c.refineries || 0}</p>
      <p><i class="fas fa-oil-can"></i> Petrol Üretimi: ${effectiveOil}</p>
      <p><i class="fas fa-wheat-awn"></i> Değirmen: ${c.grainMills || 0}</p>
      <p><i class="fas fa-wheat-awn"></i> Buğday Üretimi: ${effectiveWheat}</p>
      <p><i class="fas fa-chess-rook"></i> Kale Gücü: ${defPercent}</p>
      <p><i class="fas fa-crown"></i> Sahip: ${ownerText}</p>
    </div>
  `;
}

function updateTooltipsPermanent() {
  if (!geoJsonLayer || !roomData || !roomData.countryData) return;
  geoJsonLayer.eachLayer((layer) => {
    const cname = layer.feature.properties.name;
    const cData = roomData.countryData[cname];
    layer.unbindTooltip();
    layer.bindTooltip(getCountryPopupContent(cname, cData), {
      permanent: infoCardsPermanent,
      direction: "center",
      className: "country-popup-tooltip"
    });
  });
}

/*****************************************************************
 * 14) SEÇİLİ ÜLKEDE KALE YÜKSELTME MALİYETİ
 *****************************************************************/
function updateCastleUpgradeCostUI() {
  const costSpan = document.getElementById("castle-upgrade-cost-text");
  if (!costSpan) return;

  if (!selectedCountry || !roomData?.countryData[selectedCountry]) {
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

/*****************************************************************
 * 15) OYUNCULAR LİSTESİ POPUP
 *****************************************************************/
function updatePlayersPopup() {
  const pInfoDiv = document.getElementById("players-info");
  if (!pInfoDiv) return;
  pInfoDiv.innerHTML = "";
  if (!roomData.players) return;

  const order = roomData.playerOrder || [];
  order.forEach(pid => {
    const p = roomData.players[pid];
    if (!p) return;
    const div = document.createElement("div");
    div.className = "player-info";
    div.innerHTML = `
      <p><strong>${p.name}</strong> ${p.isHost ? "(Host)" : ""}</p>
      <p>Para: ${p.money}$</p>
      <p>Asker: ${p.soldiers}</p>
      <p>Petrol: ${p.petrol}</p>
      <p>Buğday: ${p.wheat}</p>
      <p>Ülkeler: ${(p.countries?.length) || 0}</p>
    `;
    pInfoDiv.appendChild(div);
  });
}

/*****************************************************************
 * 16) TUR SIRASI - 60 SN SAYACI
 *****************************************************************/
function isMyTurn() {
  if (isSpectator) return false;
  if (!roomData || !roomData.playerOrder) return false;
  if (roomData.gameState !== "started") return false;
  const idx = roomData.currentTurnIndex || 0;
  return roomData.playerOrder[idx] === localPlayerId;
}

function startTurnTimer() {
  const timerEl = document.getElementById("turn-timer");
  turnTimeRemaining = 60;
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  timerEl.textContent = turnTimeRemaining + "s";

  turnTimerInterval = setInterval(() => {
    turnTimeRemaining--;
    if (turnTimeRemaining <= 0) {
      clearInterval(turnTimerInterval);
      timerEl.textContent = "0s";
      // Süre doldu -> otomatik sıra geç
      if (isMyTurn()) {
        nextTurn(true);
      }
    } else {
      timerEl.textContent = turnTimeRemaining + "s";
    }
  }, 1000);
}

function stopTurnTimer() {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  const tEl = document.getElementById("turn-timer");
  if (tEl) tEl.textContent = "60s";
}

/*****************************************************************
 * 17) PAKT TEKLİFLERİ - 2 DAKİKA SÜRE
 *****************************************************************/
function removeExpiredPactOffers() {
  if (!roomData || !roomData.pactOffers) return;
  const now = Date.now();
  Object.entries(roomData.pactOffers).forEach(([offerId, offer]) => {
    if (offer.status === "pending" && offer.timeCreated) {
      const diff = now - offer.timeCreated;
      if (diff >= 120_000) {
        // 2 dk doldu, reddet/iptal et
        roomRef.child("pactOffers").child(offerId).remove();
        broadcastNotification(`Pakt Teklifi Süresi Doldu (Otomatik İptal).`);
      }
    }
  });
}

/*****************************************************************
 * 18) POPUP BUTONLARI VE GENEL OYUN FONKSİYONLARI
 *****************************************************************/
function initGamePopupsButtons() {
  // Bilgi kartları
  document.getElementById("toggle-info-cards").addEventListener("click", () => {
    infoCardsPermanent = !infoCardsPermanent;
    updateTooltipsPermanent();
    const icon = document.getElementById("toggle-info-cards").querySelector("i");
    icon.className = infoCardsPermanent ? "fas fa-eye" : "fas fa-eye-slash";
  });

  // Odadan çık
  document.getElementById("exit-room-btn").addEventListener("click", () => {
    exitRoom();
  });

  // Tur bitir
  document.getElementById("end-turn-btn").addEventListener("click", () => nextTurn(false));

  // Asker İşlemleri
  document.getElementById("attack-btn").addEventListener("click", attack);
  document.getElementById("buy-soldiers-btn").addEventListener("click", buySoldiers);
  document.getElementById("pull-soldiers-btn").addEventListener("click", pullSoldiers);
  document.getElementById("send-support-btn").addEventListener("click", sendSupport);

  // Bina Kurma
  document.getElementById("buy-barracks-btn").addEventListener("click", buildBarracks);
  document.getElementById("build-factory-btn").addEventListener("click", buildFactory);
  document.getElementById("build-refinery-btn").addEventListener("click", buildRefinery);
  document.getElementById("build-grainmill-btn").addEventListener("click", buildGrainMill);
  document.getElementById("build-castle-btn").addEventListener("click", buildCastle);
  document.getElementById("upgrade-castle-btn").addEventListener("click", upgradeCastle);

  // Kaynak Gönder
  document.getElementById("send-money-btn").addEventListener("click", sendMoney);
  document.getElementById("send-petrol-btn").addEventListener("click", sendPetrol);
  document.getElementById("send-wheat-btn").addEventListener("click", sendWheat);

  // Chat
  document.getElementById("open-chat-btn").addEventListener("click", () => toggleChat(!chatOpen));
  document.getElementById("close-chat-btn").addEventListener("click", () => toggleChat(false));
  document.getElementById("send-chat-btn").addEventListener("click", sendChatMessage);
  document.getElementById("chat-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendChatMessage();
  });

  // Özel mesaj
  document.getElementById("send-private-message-btn").addEventListener("click", sendPrivateMessage);

  // Pakt
  document.getElementById("send-pact-offer-btn").addEventListener("click", sendPactOffer);
  document.getElementById("pact-pending-offers").addEventListener("click", (e) => {
    if (e.target.classList.contains("accept-btn")) {
      const offerId = e.target.getAttribute("data-offer-id");
      acceptPactOffer(offerId);
    } else if (e.target.classList.contains("reject-btn")) {
      const offerId = e.target.getAttribute("data-offer-id");
      rejectPactOffer(offerId);
    }
  });

  // Market
  document.getElementById("create-trade-offer-btn").addEventListener("click", createTradeOffer);
  // Market popup close
  document.getElementById("close-market-btn").addEventListener("click", () => {
    document.getElementById("market-popup").style.display = "none";
  });
  document.getElementById("market-popup-header").addEventListener("click", (e) => {
    // tıklama başlığı kapatmıyor, X butonu kapatıyor
    if (e.target.id === "close-market-btn") {
      document.getElementById("market-popup").style.display = "none";
    }
  });
}

/*****************************************************************
 * TURU GEÇ
 *****************************************************************/
function nextTurn(autoEnd = false) {
  if (!isMyTurn()) return;
  stopTurnTimer();

  const turnIndex = roomData.currentTurnIndex || 0;
  const currPid = roomData.playerOrder[turnIndex];
  const p = roomData.players[currPid];
  if (!p) return;

  const updates = {};

  // Tur sonu gelir / buğday eklenmesi
  if (p.countries && roomData.countryData) {
    let totalMoneyGained = 0;
    let totalWheatGained = 0;

    p.countries.forEach((cName) => {
      const cData = roomData.countryData[cName];
      if (!cData) return;

      // Kışla -> asker üretimi
      if (cData.barracksCount) {
        const newSoldiers = (cData.soldiers || 0) + (5 * cData.barracksCount);
        updates[`countryData/${cName}/soldiers`] = newSoldiers;
      }
      // Para
      let effIncome = cData.income || 0;
      if (cData.factories) {
        effIncome = Math.floor(effIncome * (1 + 0.20 * cData.factories));
      }
      totalMoneyGained += effIncome;

      // Buğday
      if (cData.wheatProduction) {
        const effWheat = Math.floor(
          cData.wheatProduction * (1 + 0.20 * (cData.grainMills || 0))
        );
        totalWheatGained += effWheat;
      }
    });

    updates[`players/${currPid}/money`] = (p.money || 0) + totalMoneyGained;
    updates[`players/${currPid}/wheat`] = (p.wheat || 0) + totalWheatGained;
  }

  // Sıradaki oyuncu
  let newIndex = turnIndex + 1;
  let newRound = roomData.round || 1;
  if (newIndex >= roomData.playerOrder.length) {
    newIndex = 0;
    newRound++;
    updates["round"] = newRound;
  }
  updates["currentTurnIndex"] = newIndex;

  roomRef.update(updates);

  let endText = "Sıra " + (roomData.players[roomData.playerOrder[newIndex]]?.name || "?") + " adlı oyuncuya geçti.";
  if (autoEnd) {
    endText = p.name + " süresini doldurdu! " + endText;
  }
  broadcastNotification(endText);
  showNotification(endText, 1500);
}

/*****************************************************************
 * ODADAN ÇIK
 *****************************************************************/
function exitRoom() {
  if (!roomRef || !roomData) return;

  // İzleyiciysek watchers'tan sil
  if (isSpectator) {
    const updates = {};
    updates[`watchers/${localPlayerId}`] = null;
    roomRef.update(updates);
    cleanupAndGoLobby();
    return;
  }

  // Oyuncuysak players'tan sil + playerOrder'dan çıkar
  const updates = {};
  let newOrder = (roomData.playerOrder || []).filter(id => id !== localPlayerId);

  // Sıra bizdeyse -> next turn
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
    updates["currentTurnIndex"] = (newOrder.length > 0) ? idx : 0;
  }

  updates["playerOrder"] = newOrder;
  updates[`players/${localPlayerId}`] = null;
  // usedColors -> color'ı serbest bırakalım mı? Oyun ortasında belki.
  // Ama genelde bırakılmaz, yine de dilersek:
  // if (localPlayerColor) updates[`usedColors/${localPlayerColor}`] = null;

  roomRef.update(updates, () => {
    cleanupAndGoLobby();
  });
}
function cleanupAndGoLobby() {
  document.getElementById("game-container").style.display = "none";
  document.getElementById("lobby-container").style.display = "block";
  localStorage.removeItem("roomId");
  localStorage.removeItem("isSpectator");
  stopTurnTimer();
  clearInterval(startInterval);
  clearInterval(pactCheckInterval);
  pactCheckInterval = null;
  showNotification("Odadan ayrıldınız.");
}

/*****************************************************************
 * ASKER SALDIRISI / SAVUNMA
   - Kendi toprağına asker ekleme => petrol 0 harca
   - Başka toprağa => asker kadar petrol
 *****************************************************************/
function attack() {
  if (!isMyTurn()) {
    showNotification("Sıranız değil!");
    return;
  }
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const soldiersToSend = parseInt(document.getElementById("attack-soldiers").value);
  if (isNaN(soldiersToSend) || soldiersToSend <= 0) {
    showNotification("Geçerli asker sayısı girin!");
    return;
  }
  const attacker = roomData.players[localPlayerId];
  if (!attacker) return;

  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;

  // Kendi ülkemize mi?
  if (cData.owner === localPlayerId) {
    // petrol harcanmaz
    if (soldiersToSend > attacker.soldiers) {
      showNotification("Yeterli askeriniz yok!");
      return;
    }
    // Ülkeye ekle
    const updates = {};
    updates[`players/${localPlayerId}/soldiers`] = attacker.soldiers - soldiersToSend;
    updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers + soldiersToSend;
    roomRef.update(updates, () => {
      // Saldırı sonrası petrol ödülü
      immediateOilReward(localPlayerId);
    });
    broadcastNotification(`${attacker.name}, kendi ülkesine ${soldiersToSend} asker gönderdi.`);
    showNotification(`${selectedCountry} ülkesine asker eklendi.`);
    return;
  }

  // Başka ülkeye saldırı
  // Petrol kontrol (saldırı = 1 asker = 1 varil petrol)
  if (attacker.petrol < soldiersToSend) {
    showNotification(`Bu saldırı için ${soldiersToSend} varil petrol gerekiyor, yeterli değil!`);
    return;
  }
  if (soldiersToSend > attacker.soldiers) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }

  // Pakt var mı?
  if (cData.owner && cData.owner !== localPlayerId && hasActivePact(localPlayerId, cData.owner)) {
    showNotification("Bu oyuncu ile saldırmazlık paktınız var!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/petrol`] = attacker.petrol - soldiersToSend;
  updates[`players/${localPlayerId}/soldiers`] = attacker.soldiers - soldiersToSend;

  let finalText = "";
  let effectiveAttackers = soldiersToSend;

  // Kale savunması
  if (cData.castleDefenseLevel > 0) {
    const defPercent = cData.castleDefenseLevel * 5;
    const killedByCastle = Math.floor((defPercent / 100) * effectiveAttackers);
    effectiveAttackers -= killedByCastle;
    if (effectiveAttackers < 0) effectiveAttackers = 0;
    finalText += `Kale savunması: ${killedByCastle} saldıran asker öldü. `;
  }

  if (effectiveAttackers > cData.soldiers) {
    // Ülke düştü
    const remaining = effectiveAttackers - cData.soldiers;
    updates[`countryData/${selectedCountry}/soldiers`] = remaining;
    updates[`countryData/${selectedCountry}/owner`] = localPlayerId;
    updates[`countryData/${selectedCountry}/supporters`] = {};

    // Eski sahibin listesinden çıkar
    if (cData.owner && roomData.players[cData.owner]) {
      let oldCountries = roomData.players[cData.owner].countries || [];
      oldCountries = oldCountries.filter(x => x !== selectedCountry);
      updates[`players/${cData.owner}/countries`] = oldCountries;
    }
    // Bize ekle
    let myCountries = attacker.countries || [];
    if (!myCountries.includes(selectedCountry)) {
      myCountries.push(selectedCountry);
    }
    updates[`players/${localPlayerId}/countries`] = myCountries;

    finalText += `${selectedCountry} fethedildi! (${soldiersToSend} vs ${cData.soldiers})`;
  } else {
    // Savunma kazandı
    updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers - effectiveAttackers;
    finalText += `${selectedCountry} savunuldu! (${soldiersToSend} vs ${cData.soldiers})`;
  }

  roomRef.update(updates, () => {
    immediateOilReward(localPlayerId);
  });
  broadcastNotification(`Saldırı: ${attacker.name} -> ${selectedCountry}. ${finalText}`);
  showNotification(finalText);

  // Otomatik tur geç
  nextTurn();
}

// Saldırı sonrası petrol ödülü
function immediateOilReward(playerId) {
  if (!roomData || !roomData.players?.[playerId]) return;
  const p = roomData.players[playerId];
  if (!p.countries) return;
  let totalGain = 0;
  p.countries.forEach((cName) => {
    const c = roomData.countryData[cName];
    if (c && c.oilProduction) {
      const eff = Math.floor(c.oilProduction * (1 + 0.15 * (c.refineries || 0)));
      totalGain += eff;
    }
  });
  if (totalGain > 0) {
    const updates = {};
    updates[`players/${playerId}/petrol`] = p.petrol + totalGain;
    roomRef.update(updates);
    showNotification(`Saldırı sonrası petrol geliri: +${totalGain} varil`);
    broadcastNotification(`${p.name}, saldırı sonrası +${totalGain} varil petrol kazandı!`);
  }
}

// Asker Satın Al
function buySoldiers() {
  if (isSpectator) return;
  const count = parseInt(document.getElementById("soldiers-to-buy").value);
  if (isNaN(count) || count <= 0) {
    showNotification("Geçerli asker sayısı girin!");
    return;
  }
  const p = roomData.players[localPlayerId];
  const costMoney = 10 * count;
  const costWheat = 25 * count;
  if (p.money < costMoney) {
    showNotification("Yeterli para yok!");
    return;
  }
  if (p.wheat < costWheat) {
    showNotification("Yeterli buğday yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/wheat`] = p.wheat - costWheat;
  updates[`players/${localPlayerId}/soldiers`] = p.soldiers + count;
  roomRef.update(updates);

  broadcastNotification(`${p.name}, ${count} asker satın aldı.`);
  showNotification(`${count} asker satın alındı.`);
}

// Asker Çekme
function pullSoldiers() {
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
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;

  const updates = {};
  // Ülke bize aitse
  if (cData.owner === localPlayerId) {
    let totalSupporters = 0;
    if (cData.supporters) {
      Object.values(cData.supporters).forEach(v => totalSupporters += v);
    }
    const occupantSoldiers = cData.soldiers - totalSupporters;
    if (occupantSoldiers < count) {
      showNotification("Bu kadar asker çekemezsiniz (destek askerleri hariç)!");
      return;
    }
    if (count > p.soldiers + occupantSoldiers) {
      // teori
      showNotification("Yeterli asker yok!");
      return;
    }
    updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers - count;
    updates[`players/${localPlayerId}/soldiers`] = p.soldiers + count;

    broadcastNotification(`${p.name}, ${selectedCountry} ülkesinden ${count} asker çekti.`);
    showNotification(`${selectedCountry} ülkesinden asker çekildi.`);
  } else {
    // Destek askeri çek
    const sup = cData.supporters?.[localPlayerId] || 0;
    if (sup < count) {
      showNotification("Bu ülkede o kadar destek askeriniz yok!");
      return;
    }
    if (cData.soldiers < count) {
      showNotification("Veri tutarsızlığı! Ülkede yeterli asker yok!");
      return;
    }
    updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers - count;
    const newSup = sup - count;
    if (newSup <= 0) {
      updates[`countryData/${selectedCountry}/supporters/${localPlayerId}`] = null;
    } else {
      updates[`countryData/${selectedCountry}/supporters/${localPlayerId}`] = newSup;
    }
    updates[`players/${localPlayerId}/soldiers`] = p.soldiers + count;

    broadcastNotification(`${p.name}, ${selectedCountry} ülkesindeki destek askerini geri çekti.`);
    showNotification("Destek askeri geri çekildi.");
  }
  roomRef.update(updates);
}

// Destek Gönder
function sendSupport() {
  if (isSpectator) return;
  const recId = document.getElementById("support-recipient").value;
  const cName = document.getElementById("support-recipient-country").value;
  const num = parseInt(document.getElementById("support-soldiers").value);
  if (!recId || !cName || isNaN(num) || num <= 0) {
    showNotification("Geçerli oyuncu, ülke ve asker sayısı girin!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.soldiers < num) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }
  const targetC = roomData.countryData[cName];
  if (!targetC) {
    showNotification("Ülke bulunamadı!");
    return;
  }
  if (targetC.owner !== recId) {
    showNotification("Bu ülke seçilen oyuncuya ait değil!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/soldiers`] = p.soldiers - num;
  updates[`countryData/${cName}/soldiers`] = (targetC.soldiers || 0) + num;
  const oldSup = targetC.supporters?.[localPlayerId] || 0;
  updates[`countryData/${cName}/supporters/${localPlayerId}`] = oldSup + num;

  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${roomData.players[recId].name} ülkesine ${num} asker destek gönderdi.`);
  showNotification("Askeri destek gönderildi!");
}

/*****************************************************************
 * KAYNAK GÖNDERME (para, petrol, buğday)
 *****************************************************************/
function sendMoney() {
  if (isSpectator) return;
  const amt = parseInt(document.getElementById("money-to-send").value);
  const recId = document.getElementById("recipient-player").value;
  if (isNaN(amt) || amt <= 0 || !recId) return;
  const p = roomData.players[localPlayerId];
  if (p.money < amt) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (recId === localPlayerId) {
    showNotification("Kendinize gönderemezsiniz!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - amt;
  updates[`players/${recId}/money`] = (roomData.players[recId].money || 0) + amt;
  roomRef.update(updates);
  broadcastNotification(`${p.name} → ${roomData.players[recId].name}: ${amt}$ gönderildi.`);
  showNotification("Para gönderildi.");
}

function sendPetrol() {
  if (isSpectator) return;
  const amt = parseInt(document.getElementById("petrol-to-send").value);
  const recId = document.getElementById("recipient-player-petrol").value;
  if (isNaN(amt) || amt <= 0 || !recId) return;
  const p = roomData.players[localPlayerId];
  if (p.petrol < amt) {
    showNotification("Yeterli petrol yok!");
    return;
  }
  if (recId === localPlayerId) {
    showNotification("Kendinize gönderemezsiniz!");
    return;
  }
  const updates = {};
  updates[`players/${localPlayerId}/petrol`] = p.petrol - amt;
  updates[`players/${recId}/petrol`] = (roomData.players[recId].petrol || 0) + amt;
  roomRef.update(updates);
  broadcastNotification(`${p.name} → ${roomData.players[recId].name}: ${amt} varil petrol gönderildi.`);
  showNotification("Petrol gönderildi.");
}

function sendWheat() {
  if (isSpectator) return;
  const amt = parseInt(document.getElementById("wheat-to-send").value);
  const recId = document.getElementById("recipient-player-wheat").value;
  if (isNaN(amt) || amt <= 0 || !recId) return;
  const p = roomData.players[localPlayerId];
  if (p.wheat < amt) {
    showNotification("Yeterli buğday yok!");
    return;
  }
  if (recId === localPlayerId) {
    showNotification("Kendinize gönderemezsiniz!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/wheat`] = p.wheat - amt;
  updates[`players/${recId}/wheat`] = (roomData.players[recId].wheat || 0) + amt;
  roomRef.update(updates);
  broadcastNotification(`${p.name} → ${roomData.players[recId].name}: ${amt} buğday gönderildi.`);
  showNotification("Buğday gönderildi.");
}

/*****************************************************************
 * BİNALAR
 *****************************************************************/
function buildBarracks() {
  if (!selectedCountry) {
    showNotification("Ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("barracks-quantity").value);
  if (isNaN(q) || q <= 0) return;
  buildGeneric("barracks", q);
}

function buildFactory() {
  if (!selectedCountry) {
    showNotification("Ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("factory-quantity").value);
  if (isNaN(q) || q <= 0) return;
  buildGeneric("factory", q);
}

function buildRefinery() {
  if (!selectedCountry) {
    showNotification("Ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("refinery-quantity").value);
  if (isNaN(q) || q <= 0) return;
  buildGeneric("refinery", q);
}

function buildGrainMill() {
  if (!selectedCountry) {
    showNotification("Ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("grainmill-quantity").value);
  if (isNaN(q) || q <= 0) return;
  buildGeneric("grainmill", q);
}

function buildGeneric(type, quantity) {
  if (isSpectator) return;
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  let costMoney = 0, costPetrol = 0, costWheat = 0;
  let propName = "";

  if (type === "barracks") {
    costMoney = 300 * quantity;
    costPetrol = 50 * quantity;
    costWheat = 120 * quantity;
    propName = "barracksCount";
  } else if (type === "factory") {
    costMoney = 500 * quantity;
    costPetrol = 130 * quantity;
    propName = "factories";
  } else if (type === "refinery") {
    costMoney = 800 * quantity;
    costPetrol = 250 * quantity;
    propName = "refineries";
  } else if (type === "grainmill") {
    costMoney = 200 * quantity;
    costPetrol = 100 * quantity;
    propName = "grainMills";
  }

  const p = roomData.players[localPlayerId];
  if (p.money < costMoney || p.petrol < costPetrol || p.wheat < costWheat) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - costPetrol;
  if (costWheat > 0) updates[`players/${localPlayerId}/wheat`] = p.wheat - costWheat;
  updates[`countryData/${selectedCountry}/${propName}`] = (cData[propName] || 0) + quantity;
  roomRef.update(updates);

  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${quantity} adet ${type} kurdu.`);
  showNotification(`${quantity} adet ${type} kuruldu.`);
}

// Kale Kur
function buildCastle() {
  if (!selectedCountry) {
    showNotification("Ülke seçin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cData.castleDefenseLevel > 0) {
    showNotification("Zaten kale var!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.money < 1000 || p.petrol < 1000 || p.wheat < 1000) {
    showNotification("Yeterli kaynağınız yok!");
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
  showNotification("Kale kuruldu. (%5 savunma)");
}

// Kale Güçlendirme
function upgradeCastle() {
  if (!selectedCountry) {
    showNotification("Ülke seçin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cData.castleDefenseLevel < 1) {
    showNotification("Önce kale kurulmalı!");
    return;
  }
  if (cData.castleDefenseLevel >= 6) {
    showNotification("Kale %30 savunma ile maks durumda!");
    return;
  }
  if (!cData.castleNextUpgradeCost) return;
  const cost = cData.castleNextUpgradeCost;

  const p = roomData.players[localPlayerId];
  if (p.money < cost.money || p.petrol < cost.petrol || p.wheat < cost.wheat) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - cost.money;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - cost.petrol;
  updates[`players/${localPlayerId}/wheat`] = p.wheat - cost.wheat;

  const newLevel = cData.castleDefenseLevel + 1;
  updates[`countryData/${selectedCountry}/castleDefenseLevel`] = newLevel;

  const nm = Math.floor(cost.money * 1.3);
  const np = Math.floor(cost.petrol * 1.3);
  const nw = Math.floor(cost.wheat * 1.3);
  updates[`countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: nm, petrol: np, wheat: nw
  };

  roomRef.update(updates, () => {
    updateCastleUpgradeCostUI();
  });
  broadcastNotification(`${p.name}, ${selectedCountry} kalesini güçlendirdi (%${newLevel * 5} savunma).`);
  showNotification(`Kale +%5 güçlendirildi. Yeni seviye: ${newLevel}`);
}

/*****************************************************************
 * 19) CHAT SISTEMİ
 *****************************************************************/
function toggleChat(show) {
  chatOpen = show;
  const chatPopup = document.getElementById("chat-popup");
  chatPopup.style.display = show ? "flex" : "none";
  if (chatOpen) {
    unreadMessages = 0;
    updateChatBadge();
  }
}
function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || !roomRef) return;

  let senderName = "Anon";
  if (roomData?.players?.[localPlayerId]) {
    senderName = roomData.players[localPlayerId].name;
  }
  const msg = {
    sender: senderName,
    senderId: localPlayerId,
    text: text,
    recipientId: "",
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(msg, () => {
    input.value = "";
  });
}
function sendPrivateMessage() {
  if (!roomRef) return;
  const pmInput = document.getElementById("private-message-input");
  const pmRecipient = document.getElementById("private-message-recipient");
  const txt = pmInput.value.trim();
  const rid = pmRecipient.value;
  if (!txt || !rid) return;

  let senderName = roomData?.players?.[localPlayerId]?.name || "Anon";
  const pm = {
    sender: senderName,
    senderId: localPlayerId,
    text: txt,
    recipientId: rid,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(pm, () => {
    pmInput.value = "";
    showNotification("Özel mesaj gönderildi.");
  });
}
function appendChatMessage(msg) {
  // Özel mi?
  if (msg.recipientId && msg.recipientId !== "") {
    // Bize mi veya bizden mi?
    if (msg.senderId !== localPlayerId && msg.recipientId !== localPlayerId) {
      // Alakasız PM
      return;
    }
  }
  const chatMessagesDiv = document.getElementById("chat-messages");
  const div = document.createElement("div");
  if (msg.recipientId && msg.recipientId !== "") {
    // PM
    let otherName = "???";
    if (roomData.players[msg.recipientId]) {
      otherName = roomData.players[msg.recipientId].name;
    }
    if (msg.senderId === localPlayerId) {
      div.innerHTML = `<strong>[PM to ${otherName}]:</strong> ${msg.text}`;
    } else {
      div.innerHTML = `<strong>[PM from ${msg.sender}]:</strong> ${msg.text}`;
    }
    div.style.color = "#f39c12";
  } else {
    // Genel
    div.textContent = msg.sender + ": " + msg.text;
  }
  chatMessagesDiv.appendChild(div);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;

  if (!chatOpen && msg.senderId !== localPlayerId) {
    unreadMessages++;
    updateChatBadge();
  }
}
function updateChatBadge() {
  const openChatBtn = document.getElementById("open-chat-btn");
  openChatBtn.dataset.badge = unreadMessages > 0 ? unreadMessages : "";
}

/*****************************************************************
 * 20) SALDIRMAZLIK PAKT SISTEMİ
 *****************************************************************/
function sendPactOffer() {
  if (!isMyTurn()) {
    showNotification("Sıranız değil, pakt teklifini kendi sıranızda yapabilirsiniz!");
    return;
  }
  const recip = document.getElementById("pact-offer-recipient").value;
  const dur = parseInt(document.getElementById("pact-duration").value);
  const cost = parseInt(document.getElementById("pact-cost").value);
  if (!recip || recip === localPlayerId) {
    showNotification("Geçerli bir oyuncu seçin!");
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
  if (hasActivePact(localPlayerId, recip)) {
    showNotification("Bu oyuncu ile zaten aktif paktınız var!");
    return;
  }

  const sender = roomData.players[localPlayerId];
  if (!sender) return;

  const newOfferRef = roomRef.child("pactOffers").push();
  const newOffer = {
    offerId: newOfferRef.key,
    senderId: localPlayerId,
    senderName: sender.name,
    recipientId: recip,
    duration: dur,
    cost: cost,
    status: "pending",
    timeCreated: Date.now()
  };
  newOfferRef.set(newOffer);
  broadcastNotification(`Pakt Teklifi: ${sender.name} -> ${roomData.players[recip].name} (Tur:${dur}, Para:${cost}$)`);
  showNotification("Pakt teklifi gönderildi (2 dk içinde yanıt verilmezse iptal).");
}
function displayPendingPactOffers() {
  const container = document.getElementById("pact-pending-offers");
  container.innerHTML = "";
  if (!roomData?.pactOffers) return;

  Object.values(roomData.pactOffers).forEach(offer => {
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
function displayActivePacts() {
  const c = document.getElementById("active-pacts-container");
  c.innerHTML = "";
  if (!roomData?.pacts) return;

  const r = roomData.round || 1;
  Object.values(roomData.pacts).forEach(pact => {
    if (pact.active && r <= pact.expirationRound) {
      if (pact.playerA === localPlayerId || pact.playerB === localPlayerId) {
        const otherId = (pact.playerA === localPlayerId) ? pact.playerB : pact.playerA;
        const otherName = roomData.players[otherId]?.name || "???";
        const left = pact.expirationRound - r + 1;

        const item = document.createElement("div");
        item.className = "active-pact-item";
        item.innerHTML = `
          <p>Pakt: <strong>${otherName}</strong></p>
          <p>Kalan Tur: <strong>${left}</strong></p>
        `;
        c.appendChild(item);
      }
    }
  });
}
function acceptPactOffer(offerId) {
  const offer = roomData.pactOffers[offerId];
  if (!offer || offer.status !== "pending") return;
  if (hasActivePact(offer.senderId, offer.recipientId)) {
    showNotification("Zaten aktif pakt var!");
    roomRef.child("pactOffers").child(offerId).remove();
    return;
  }
  const sender = roomData.players[offer.senderId];
  const rec = roomData.players[offer.recipientId];
  if (!sender || !rec) {
    showNotification("Teklifteki oyuncular bulunamadı!");
    return;
  }
  if (sender.money < offer.cost) {
    showNotification("Teklifi gönderenin yeterli parası yok. Teklif geçersiz!");
    roomRef.child("pactOffers").child(offerId).remove();
    return;
  }
  const r = roomData.round || 1;
  const expRound = r + offer.duration;
  const pactId = db.ref().push().key;
  const updates = {};
  updates[`pactOffers/${offerId}`] = null;  // Sil
  updates[`players/${offer.senderId}/money`] = sender.money - offer.cost;
  updates[`players/${offer.recipientId}/money`] = rec.money + offer.cost;
  updates[`pacts/${pactId}`] = {
    playerA: offer.senderId,
    playerB: offer.recipientId,
    active: true,
    cost: offer.cost,
    duration: offer.duration,
    expirationRound: expRound
  };
  roomRef.update(updates);
  broadcastNotification(`Pakt Anlaşması: ${sender.name} & ${rec.name} (Tur:${offer.duration}, Para:${offer.cost}$).`);
  showNotification("Pakt teklifi kabul edildi.");
}
function rejectPactOffer(offerId) {
  const offer = roomData.pactOffers[offerId];
  if (!offer || offer.status !== "pending") return;
  roomRef.child("pactOffers").child(offerId).remove();
  broadcastNotification("Pakt teklifi reddedildi.");
  showNotification("Pakt teklifi reddedildi.");
}
function hasActivePact(a, b) {
  if (!roomData?.pacts) return false;
  const r = roomData.round || 1;
  return Object.values(roomData.pacts).some(pact => {
    if (pact.active && r <= pact.expirationRound) {
      return (
        (pact.playerA === a && pact.playerB === b) ||
        (pact.playerA === b && pact.playerB === a)
      );
    }
    return false;
  });
}

/*****************************************************************
 * 21) TİCARET (MARKET)
 *****************************************************************/
function createTradeOffer() {
  if (isSpectator) return;
  const itemType = document.getElementById("trade-item-type").value;
  const qty = parseInt(document.getElementById("trade-quantity").value);
  const price = parseInt(document.getElementById("trade-price").value);
  if (!itemType || isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
    showNotification("Geçerli adet ve fiyat girin!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (itemType === "petrol" && p.petrol < qty) {
    showNotification("Yeterli petrol yok!");
    return;
  }
  if (itemType === "wheat" && p.wheat < qty) {
    showNotification("Yeterli buğday yok!");
    return;
  }

  // Ambargo list
  const embargoSelect = document.getElementById("embargo-players");
  let embargoList = [];
  for (let i = 0; i < embargoSelect.options.length; i++) {
    if (embargoSelect.options[i].selected) {
      embargoList.push(embargoSelect.options[i].value);
    }
  }

  const newTradeRef = roomRef.child("tradeOffers").push();
  const offer = {
    offerId: newTradeRef.key,
    sellerId: localPlayerId,
    sellerName: p.name,
    itemType,
    quantity: qty,
    price,
    status: "pending",
    embargo: embargoList
  };
  newTradeRef.set(offer);
  broadcastNotification(`${p.name}, bir ticaret teklifi oluşturdu (${itemType}, adet:${qty}, fiyat:${price}$).`);
  showNotification("Ticaret teklifi oluşturuldu.");
}

// Ticaret listesi UI
function displayTradeOffers() {
  const container = document.getElementById("trade-offers-list");
  if (!container) return;
  container.innerHTML = "";
  if (!roomData?.tradeOffers) return;

  const offers = Object.values(roomData.tradeOffers).filter(o => o.status === "pending");
  offers.forEach(offer => {
    // Ambargo
    if (offer.embargo?.includes(localPlayerId)) return;

    const div = document.createElement("div");
    div.className = "offer-item";

    let label = (offer.itemType === "petrol") ? "Petrol" : "Buğday";
    let html = `
      <p><strong>Satıcı:</strong> ${offer.sellerName}</p>
      <p><strong>Ürün:</strong> ${label}</p>
      <p><strong>Mevcut Miktar:</strong> ${offer.quantity}</p>
      <p><strong>Birim Fiyat:</strong> ${offer.price} $</p>
    `;
    // Satıcı biz miyiz?
    if (offer.sellerId === localPlayerId) {
      // iptal
      html += `<button class="cancel-offer-btn" data-offer-id="${offer.offerId}"
        style="background:linear-gradient(45deg, #c0392b, #e74c3c);">
        İptal Et
      </button>`;
    } else {
      // satın al
      html += `
        <label>Miktar:</label>
        <input type="number" class="partial-buy-quantity" min="1" max="${offer.quantity}" />
        <button class="partial-buy-btn" data-offer-id="${offer.offerId}">Satın Al</button>
      `;
    }
    if (offer.embargo && offer.embargo.length) {
      const embUsers = offer.embargo.map(id => roomData.players[id]?.name || "???").join(", ");
      html += `<p style="color:red;"><strong>Ambargo:</strong> ${embUsers}</p>`;
    }

    div.innerHTML = html;
    container.appendChild(div);
  });

  // event
  container.querySelectorAll(".partial-buy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const offerId = btn.getAttribute("data-offer-id");
      const parent = btn.closest(".offer-item");
      const input = parent.querySelector(".partial-buy-quantity");
      const amount = parseInt(input.value);
      acceptTradeOffer(offerId, amount);
    });
  });
  container.querySelectorAll(".cancel-offer-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const offerId = btn.getAttribute("data-offer-id");
      cancelTradeOffer(offerId);
    });
  });
}

function acceptTradeOffer(offerId, buyAmount) {
  if (!roomData?.tradeOffers?.[offerId]) {
    showNotification("Teklif bulunamadı!");
    return;
  }
  const offer = roomData.tradeOffers[offerId];
  if (offer.status !== "pending") {
    showNotification("Teklif geçerli değil!");
    return;
  }
  if (buyAmount > offer.quantity) {
    showNotification("Bu kadar stok yok!");
    return;
  }
  const buyer = roomData.players[localPlayerId];
  const seller = roomData.players[offer.sellerId];
  if (!buyer || !seller) {
    showNotification("Alıcı/Satıcı bulunamadı!");
    return;
  }
  const totalCost = offer.price * buyAmount;
  if (buyer.money < totalCost) {
    showNotification("Yeterli para yok!");
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
  } else {
    // wheat
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

  const newQty = offer.quantity - buyAmount;
  if (newQty <= 0) {
    updates[`tradeOffers/${offerId}/status`] = "completed";
  }
  updates[`tradeOffers/${offerId}/quantity`] = newQty;
  roomRef.update(updates, () => {
    broadcastNotification(`Ticaret: ${seller.name} -> ${buyer.name} (${buyAmount} x ${offer.itemType}).`);
    showNotification("Ticaret işlemi başarıyla tamamlandı!");
  });
}

function cancelTradeOffer(offerId) {
  const offer = roomData?.tradeOffers?.[offerId];
  if (!offer) return;
  if (offer.sellerId !== localPlayerId) {
    showNotification("Sadece kendi teklifinizi iptal edebilirsiniz!");
    return;
  }
  if (offer.status !== "pending") {
    showNotification("Bu teklif zaten tamamlandı veya iptal edildi!");
    return;
  }
  roomRef.child("tradeOffers").child(offerId).update({ status: "cancelled" });
  broadcastNotification("Ticaret teklifi iptal edildi: " + offer.sellerName);
  showNotification("Teklif iptal edildi.");
}

/*****************************************************************
 * ÇEŞİTLİ YARDIMCI FONKSİYONLAR (BİLDİRİM vb.)
 *****************************************************************/
function showNotification(msg, duration = 3000) {
  if (notificationsMuted) return;
  const area = document.getElementById("notification-area");
  if (!area) return;
  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = msg;
  area.appendChild(item);
  setTimeout(() => {
    if (area.contains(item)) {
      area.removeChild(item);
    }
  }, duration + 800);
}

function broadcastNotification(text) {
  if (!roomRef) return;
  roomRef.child("notifications").push({
    text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

function displayGlobalNotification(text) {
  if (notificationsMuted) return;
  const area = document.getElementById("notification-area");
  if (!area) return;
  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = text;
  area.appendChild(item);
  setTimeout(() => {
    if (area.contains(item)) {
      area.removeChild(item);
    }
  }, 6500);
}

// Select listelerini güncelle (kaynak gönderme, destek gönderme, pakt)
function updateSelectLists() {
  // Kaynak
  const moneySel = document.getElementById("recipient-player");
  const petrolSel = document.getElementById("recipient-player-petrol");
  const wheatSel = document.getElementById("recipient-player-wheat");
  // Destek
  const supportSel = document.getElementById("support-recipient");
  const supportSelC = document.getElementById("support-recipient-country");
  // Pakt
  const pactSel = document.getElementById("pact-offer-recipient");
  // Private msg
  const pmSel = document.getElementById("private-message-recipient");
  // Market embargo
  const embSel = document.getElementById("embargo-players");

  if (!moneySel || !petrolSel || !wheatSel || !supportSel || !supportSelC ||
      !pactSel || !pmSel || !embSel) return;

  // Temizle
  moneySel.innerHTML = "";
  petrolSel.innerHTML = "";
  wheatSel.innerHTML = "";
  supportSel.innerHTML = "<option value=''>--Oyuncu--</option>";
  supportSelC.innerHTML = "<option value=''>--Ülke--</option>";
  pactSel.innerHTML = "";
  pmSel.innerHTML = "";
  embSel.innerHTML = "";

  if (roomData?.playerOrder) {
    roomData.playerOrder.forEach(pid => {
      const p = roomData.players[pid];
      if (!p) return;
      // Kaynak
      let opt1 = document.createElement("option");
      opt1.value = pid;
      opt1.textContent = p.name;
      moneySel.appendChild(opt1);

      let opt2 = document.createElement("option");
      opt2.value = pid;
      opt2.textContent = p.name;
      petrolSel.appendChild(opt2);

      let opt3 = document.createElement("option");
      opt3.value = pid;
      opt3.textContent = p.name;
      wheatSel.appendChild(opt3);

      // Pakt
      if (pid !== localPlayerId) {
        let opt4 = document.createElement("option");
        opt4.value = pid;
        opt4.textContent = p.name;
        pactSel.appendChild(opt4);

        // PM
        let opt5 = document.createElement("option");
        opt5.value = pid;
        opt5.textContent = p.name;
        pmSel.appendChild(opt5);

        // Market embargo
        let opt6 = document.createElement("option");
        opt6.value = pid;
        opt6.textContent = p.name;
        embSel.appendChild(opt6);

        // Destek -> Sadece combo'da oyuncu listesi
        let opt7 = document.createElement("option");
        opt7.value = pid;
        opt7.textContent = p.name;
        supportSel.appendChild(opt7);
      }
    });
  }

  // Destek alıcı ülke listesi, change event
  supportSel.addEventListener("change", function() {
    const rid = this.value;
    supportSelC.innerHTML = "<option value=''>--Ülke--</option>";
    if (!rid) return;
    const recP = roomData.players[rid];
    if (!recP?.countries) return;
    recP.countries.forEach(cn => {
      const op = document.createElement("option");
      op.value = cn;
      op.textContent = cn;
      supportSelC.appendChild(op);
    });
  });

  // Pakt offers / aktif pakt UI
  displayPendingPactOffers();
  displayActivePacts();
  // Market
  displayTradeOffers();
}

/*****************************************************************
 * 22) SAYFADA HARİTA GÖRÜNÜR OLUNCA KUR
 *****************************************************************/
const gameContainerObserver = new MutationObserver(() => {
  const gc = document.getElementById("game-container");
  if (gc.style.display !== "none") {
    initializeMap();
  }
});
gameContainerObserver.observe(document.getElementById("game-container"), {
  attributes: true,
  attributeFilter: ["style"]
});
