/***************************************************************
 *  gameLogic.js
 *  Tüm oyun, profil, arkadaşlık, kayıt/giriş işlevlerini içerir
 ***************************************************************/

/*****************************************************************
 * 1. Firebase Başlatma
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

const auth = firebase.auth();
const db = firebase.database();

/*****************************************************************
 * 2. GENEL DEĞİŞKENLER (Auth, Profil)
 *****************************************************************/
let currentUser = null; // Firebase Auth kullanıcısı (uid vb.)
let currentUserData = null; // DB'deki kullanıcı verisi

let localPlayerId = null; // Oyun içi playerId
let currentRoomCode = null;
let roomRef = null;
let roomData = null;

let selectedCountry = null;
let map, geoJsonLayer = null;
let infoCardsPermanent = false;
let turnTimeRemaining = 60;
let turnTimerInterval = null;
let startInterval = null;
let notificationsMuted = false;
let unreadMessages = 0;
let chatOpen = false;

const availableColors = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "brown",
  "pink"
];
let localPlayerColor = null;
let chatListenerAdded = false;

/*****************************************************************
 * 3. SAYFA YÖNETİMİ (Single Page Uygulama Mantığı)
 *****************************************************************/
const authContainer = document.getElementById("auth-container");
const profileContainer = document.getElementById("profile-container");
const lobbyContainer = document.getElementById("lobby-container");
const gameContainer = document.getElementById("game-container");

/** Ekran gösterme/kapatma yardımcı fonksiyonları */
function showAuthPage() {
  authContainer.style.display = "flex";
  profileContainer.style.display = "none";
  lobbyContainer.style.display = "none";
  gameContainer.style.display = "none";
}
function showProfilePage() {
  authContainer.style.display = "none";
  profileContainer.style.display = "flex";
  lobbyContainer.style.display = "none";
  gameContainer.style.display = "none";
}
function showLobbyPage() {
  authContainer.style.display = "none";
  profileContainer.style.display = "none";
  lobbyContainer.style.display = "flex";
  gameContainer.style.display = "none";
}
function showGamePage() {
  authContainer.style.display = "none";
  profileContainer.style.display = "none";
  lobbyContainer.style.display = "none";
  gameContainer.style.display = "block";
}

/*****************************************************************
 * 4. Firebase Authentication (Giriş & Kayıt)
 *****************************************************************/
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    // DB'den kullanıcı verisini çek
    const snapshot = await db.ref("users/" + user.uid).once("value");
    currentUserData = snapshot.val();

    // Kullanıcı verisi yoksa (örneğin yeni kayıt), oluşturma
    if (!currentUserData) {
      // Beklenmedik bir durum, kayıt anında set edilmesi gerekirdi
      // Gerekirse burada set edebilirsin
    } else {
      // Profil sayfasına yönlendir
      document.getElementById("profile-username").textContent =
        currentUserData.displayName || "Kullanıcı Adınız";
      loadUserFriends();
      loadFriendRequests();
      loadFriendInviteList();
      showProfilePage();
    }
  } else {
    currentUser = null;
    currentUserData = null;
    // Auth ekranına
    showAuthPage();
  }
});

/** LOGIN VE REGISTER FORM ELEMENTLERİ */
const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

loginTab.addEventListener("click", () => {
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
  loginForm.style.display = "block";
  registerForm.style.display = "none";
});

registerTab.addEventListener("click", () => {
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
  registerForm.style.display = "block";
  loginForm.style.display = "none";
});

/** GİRİŞ YAP */
document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!email || !password) {
    showNotification("Lütfen tüm alanları doldurun!");
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showNotification("Giriş başarılı!");
  } catch (err) {
    showNotification("Giriş hata: " + err.message);
  }
});

/** KAYIT OL */
document.getElementById("register-btn").addEventListener("click", async () => {
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value.trim();
  const confirmPassword = document
    .getElementById("register-confirm-password")
    .value.trim();
  const displayName = document
    .getElementById("register-display-name")
    .value.trim();

  if (!email || !password || !confirmPassword || !displayName) {
    showNotification("Lütfen tüm alanları doldurun!");
    return;
  }
  if (password !== confirmPassword) {
    showNotification("Şifreler eşleşmiyor!");
    return;
  }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;
    // DB'ye kaydet
    await db.ref("users/" + uid).set({
      email: email,
      displayName: displayName,
      friends: {}, // Arkadaşlar
      friendRequests: {}, // Gelen istekler
    });
    showNotification("Kayıt işlemi başarılı, giriş yapıldı!");
  } catch (err) {
    showNotification("Kayıt hata: " + err.message);
  }
});

/** ÇIKIŞ YAP */
document
  .getElementById("profile-logout-btn")
  .addEventListener("click", async () => {
    await auth.signOut();
    showNotification("Çıkış yapıldı.");
  });

/*****************************************************************
 * 5. Profil Ekranı (Arkadaşlar, İstekler, Davet)
 *****************************************************************/
document.getElementById("go-lobby-btn").addEventListener("click", () => {
  showLobbyPage();
});

/** Arkadaşlar yükleme */
async function loadUserFriends() {
  const friendListDiv = document.getElementById("friend-list");
  friendListDiv.innerHTML = "";
  if (!currentUser || !currentUserData || !currentUserData.friends) return;

  const friendIds = Object.keys(currentUserData.friends);
  for (const fId of friendIds) {
    const snap = await db.ref("users/" + fId).once("value");
    const friendData = snap.val();
    if (!friendData) continue;

    const friendItem = document.createElement("div");
    friendItem.className = "friend-item";
    friendItem.innerHTML = `
      <span>${friendData.displayName}</span>
      <button class="remove-friend-btn" data-fid="${fId}">
        Sil
      </button>
    `;
    friendListDiv.appendChild(friendItem);
  }
}

/** Arkadaş istekleri yükleme */
async function loadFriendRequests() {
  const requestListDiv = document.getElementById("friend-request-list");
  requestListDiv.innerHTML = "";
  if (!currentUser || !currentUserData || !currentUserData.friendRequests)
    return;

  const requestIds = Object.keys(currentUserData.friendRequests);
  for (const rId of requestIds) {
    const snap = await db.ref("users/" + rId).once("value");
    const requestUserData = snap.val();
    if (!requestUserData) continue;

    const reqItem = document.createElement("div");
    reqItem.className = "friend-request-item";
    reqItem.innerHTML = `
      <span>${requestUserData.displayName}</span>
      <div>
        <button class="accept-friend-btn" data-fid="${rId}">Kabul</button>
        <button class="reject-friend-btn" data-fid="${rId}">Reddet</button>
      </div>
    `;
    requestListDiv.appendChild(reqItem);
  }
}

/** Arkadaş ekleme isteği yolla */
document
  .getElementById("send-friend-request-btn")
  .addEventListener("click", async () => {
    const targetUsername = document
      .getElementById("add-friend-username")
      .value.trim();
    if (!targetUsername) {
      showNotification("Kullanıcı adı girin!");
      return;
    }
    // DB'de bu displayName'e sahip user'ı bul
    const allUsersSnap = await db.ref("users").once("value");
    const allUsersData = allUsersSnap.val();
    let targetUserId = null;

    for (const uid in allUsersData) {
      if (
        allUsersData[uid].displayName &&
        allUsersData[uid].displayName.toLowerCase() ===
          targetUsername.toLowerCase()
      ) {
        targetUserId = uid;
        break;
      }
    }

    if (!targetUserId) {
      showNotification("Bu kullanıcı adı bulunamadı!");
      return;
    }
    if (targetUserId === currentUser.uid) {
      showNotification("Kendinize istek gönderemezsiniz!");
      return;
    }

    // İstek gönder
    await db
      .ref("users/" + targetUserId + "/friendRequests/" + currentUser.uid)
      .set(true);

    showNotification("Arkadaşlık isteği gönderildi!");
  });

/** Arkadaş isteklerini Dinamik Olarak Yönetme */
const friendRequestList = document.getElementById("friend-request-list");
friendRequestList.addEventListener("click", async (e) => {
  if (e.target.classList.contains("accept-friend-btn")) {
    const fromUid = e.target.getAttribute("data-fid");
    await acceptFriendRequest(fromUid);
  } else if (e.target.classList.contains("reject-friend-btn")) {
    const fromUid = e.target.getAttribute("data-fid");
    await rejectFriendRequest(fromUid);
  }
});

async function acceptFriendRequest(fromUid) {
  if (!currentUser) return;
  // Arkadaşlık ekle
  await db.ref(`users/${currentUser.uid}/friends/${fromUid}`).set(true);
  await db.ref(`users/${fromUid}/friends/${currentUser.uid}`).set(true);
  // İstek sil
  await db.ref(`users/${currentUser.uid}/friendRequests/${fromUid}`).remove();

  showNotification("İstek kabul edildi!");
}

async function rejectFriendRequest(fromUid) {
  if (!currentUser) return;
  // Sadece isteği sil
  await db.ref(`users/${currentUser.uid}/friendRequests/${fromUid}`).remove();
  showNotification("İstek reddedildi!");
}

/** Arkadaş silme */
const friendListDiv = document.getElementById("friend-list");
friendListDiv.addEventListener("click", async (e) => {
  if (e.target.classList.contains("remove-friend-btn")) {
    const fId = e.target.getAttribute("data-fid");
    await removeFriend(fId);
  }
});
async function removeFriend(fId) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friends/${fId}`).remove();
  await db.ref(`users/${fId}/friends/${currentUser.uid}`).remove();
  showNotification("Arkadaş listeden silindi!");
}

/** Davet Gönderme Bölümü */
function loadFriendInviteList() {
  const inviteListDiv = document.getElementById("invite-friend-list");
  inviteListDiv.innerHTML = "";
  if (!currentUserData || !currentUserData.friends) return;

  const friendIds = Object.keys(currentUserData.friends);
  friendIds.forEach(async (fId) => {
    const snap = await db.ref("users/" + fId).once("value");
    const friendData = snap.val();
    if (friendData) {
      const div = document.createElement("div");
      div.className = "friend-item";
      div.innerHTML = `
        <span>${friendData.displayName}</span>
      `;
      inviteListDiv.appendChild(div);
    }
  });
}

/** Oda Oluştur & Davet Gönder */
document
  .getElementById("create-room-invite-btn")
  .addEventListener("click", async () => {
    // Burada basitçe bir oda oluşturacağız ve tüm arkadaşlara invitation ekleyebiliriz
    // Geliştirme: Seçmeli davet (checkbox) yapılabilir, burada basitleştirdik
    
    // Lobi sayfasına geçip normal oda oluşturma logic'i mi kullanacağız?
    // Yoksa direkt minimal bir oda oluşturup DB'ye yazacağız?
    // Bu örnekte, "normal oda oluşturma" logic'ini tetikleyerek lobiye geçebiliriz.
    showLobbyPage();
    showNotification("Lobiye yönlendirildiniz. Oda oluşturup davet gönderebilirsiniz.");
    // Dilersen "arkadaşlara invitation" ekleme logic'i de ekleyebilirsin.
  });

/*****************************************************************
 * 6. Lobi Ekranı (Oda Oluştur / Katıl)
 *****************************************************************/
// Lobi renk seçimi
const creatorColorDiv = document.getElementById("creator-color-options");
const joinColorDiv = document.getElementById("join-color-options");
availableColors.forEach((color) => {
  // Oda Kurucu Renk
  const btn1 = document.createElement("button");
  btn1.className = "global-color-option";
  btn1.style.background = color;
  btn1.dataset.color = color;
  btn1.addEventListener("click", function () {
    creatorColorDiv
      .querySelectorAll(".global-color-option")
      .forEach((s) => s.classList.remove("selected"));
    btn1.classList.add("selected");
    localPlayerColor = color;
  });
  creatorColorDiv.appendChild(btn1);

  // Odaya Katılan Renk
  const btn2 = document.createElement("button");
  btn2.className = "global-color-option";
  btn2.style.background = color;
  btn2.dataset.color = color;
  btn2.addEventListener("click", function () {
    joinColorDiv
      .querySelectorAll(".global-color-option")
      .forEach((s) => s.classList.remove("selected"));
    btn2.classList.add("selected");
    localPlayerColor = color;
  });
  joinColorDiv.appendChild(btn2);
});

// Rastgele oda kodu üret
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** Oda Oluştur Butonu */
document.getElementById("create-room-btn").addEventListener("click", async () => {
  const playerName = document
    .getElementById("creator-player-name")
    .value.trim();
  const maxPlayers = parseInt(document.getElementById("max-players").value);
  if (!playerName) {
    showNotification("Lütfen oyun içi adınızı girin!");
    return;
  }
  if (!localPlayerColor) {
    showNotification("Lütfen bir renk seçin!");
    return;
  }
  if (isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 8) {
    showNotification("Oyuncu sayısı 2 ile 8 arasında olmalı!");
    return;
  }

  // Player ID atamadıysak oluştur
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  const roomCode = generateRoomCode();
  currentRoomCode = roomCode;
  roomRef = db.ref("rooms/" + roomCode);

  const newRoomData = {
    roomCode: roomCode,
    maxPlayers: maxPlayers,
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
      showGamePage();
      document.getElementById("display-room-code").textContent = roomCode;
    }
  });
});

/** Odaya Katıl Butonu */
document.getElementById("join-room-btn").addEventListener("click", async () => {
  const playerName = document.getElementById("join-player-name").value.trim();
  const roomCodeInput = document
    .getElementById("room-code")
    .value.trim()
    .toUpperCase();

  if (!playerName) {
    showNotification("Lütfen oyun içi adınızı girin!");
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

  // Player ID atamadıysak oluştur
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  currentRoomCode = roomCodeInput;
  roomRef = db.ref("rooms/" + roomCodeInput);

  const snapshot = await roomRef.once("value");
  if (!snapshot.exists()) {
    showNotification("Böyle bir oda bulunamadı!");
    return;
  }
  const room = snapshot.val();
  if (room.gameState !== "waiting") {
    showNotification("Oyun zaten başladı veya başlamak üzere!");
    return;
  }
  const playerCount = Object.keys(room.players || {}).length;
  if (playerCount >= room.maxPlayers) {
    showNotification("Oda dolu!");
    return;
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
      showGamePage();
      document.getElementById("display-room-code").textContent = roomCodeInput;
    }
  });
});

/** Otomatik Bağlanma (Sayfa yenilenmiş olabilir) */
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
      joinRoomAndListen();
      showGamePage();
      document.getElementById("display-room-code").textContent = savedRoomCode;
    });
  }
}

/*****************************************************************
 * 7. Oyun Ekranı ve Harita Kurulumu
 *****************************************************************/
function joinRoomAndListen() {
  if (!roomRef) return;
  roomRef.on("value", (snapshot) => {
    roomData = snapshot.val();
    updateGameUI();
    displayPendingPactOffers();
    displayActivePacts();
    displayTradeOffers();
  });

  if (!chatListenerAdded) {
    // Sohbet
    roomRef.child("chat").on("child_added", (snap) => {
      const msg = snap.val();
      appendChatMessage(msg);
    });
    // Global Bildirim
    roomRef.child("notifications").on("child_added", (snap) => {
      const data = snap.val();
      if (data && data.text) {
        displayGlobalNotification(data.text);
      }
    });
    chatListenerAdded = true;
  }
}

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

  // Oyun Durumu
  handleGameState(roomData.gameState);

  // Oyuncu Listesi
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

  // Sıradaysak sayaç başlat
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

/** Oyun Durumu */
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

/** Oyunu Başlat */
document.getElementById("start-game-btn").addEventListener("click", () => {
  if (!roomData || !roomData.players[localPlayerId].isHost) return;
  if (roomData.gameState !== "waiting") return;
  const now = Date.now();
  const startTime = now + 30000; // 30 sn
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

/** Harita Başlatma */
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
          layer.on("click", () => selectCountryOnMap(cname, layer));
        }
      }).addTo(map);
    });
}

/** Harita Container gözleniyor, açılınca haritayı başlat */
const gameContainerObserver = new MutationObserver(() => {
  if (gameContainer.style.display !== "none") {
    initializeMap();
  }
});
gameContainerObserver.observe(document.getElementById("game-container"), {
  attributes: true,
  attributeFilter: ["style"]
});

/** Ülkelerin gelir & üretim verilerini DB'ye ilk defa yaz */
function loadAndInitializeGeoJson() {
  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
    .then((response) => response.json())
    .then((geoJsonData) => {
      const features = geoJsonData.features;

      // 43 ülkede rastgele petrol kapasitesi (150-500)
      let oilIndexes = [];
      if (features.length > 43) {
        while (oilIndexes.length < 43) {
          const randIdx = Math.floor(Math.random() * features.length);
          if (!oilIndexes.includes(randIdx)) {
            oilIndexes.push(randIdx);
          }
        }
      }

      // 60 ülkede rastgele buğday kapasitesi (200-700)
      let wheatIndexes = [];
      if (features.length > 60) {
        while (wheatIndexes.length < 60) {
          const randIdx = Math.floor(Math.random() * features.length);
          if (!wheatIndexes.includes(randIdx)) {
            wheatIndexes.push(randIdx);
          }
        }
      }

      // Her ülke için countryData oluştur
      const countryDataInit = {};
      features.forEach((feature, idx) => {
        const countryName = feature.properties.name;
        let oilProduction = 0;
        if (oilIndexes.includes(idx)) {
          oilProduction =
            Math.floor(Math.random() * (500 - 150 + 1)) + 150;
        }
        let wheatProduction = 0;
        if (wheatIndexes.includes(idx)) {
          wheatProduction =
            Math.floor(Math.random() * (700 - 200 + 1)) + 200;
        }

        countryDataInit[countryName] = {
          income: Math.floor(Math.random() * 500) + 100,
          soldiers: 0,
          owner: null,
          barracksCount: 0,
          factories: 0,
          refineries: 0,
          oilProduction: oilProduction,
          wheatProduction: wheatProduction,
          grainMills: 0,
          supporters: {},
          // Kale ile ilgili
          castleDefenseLevel: 0,
          castleNextUpgradeCost: null
        };
      });

      roomRef.child("countryData").set(countryDataInit);
    });
}

/** Ülke popup content */
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

/** Ülke seçildiğinde */
function selectCountryOnMap(countryName, layer) {
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

/** Bilgi Kartı Aç/Kapa */
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

function updateTooltipsPermanent() {
  if (!geoJsonLayer) return;
  geoJsonLayer.eachLayer((layer) => {
    layer.unbindTooltip();
    const cname = layer.feature.properties.name;
    const cData =
      roomData && roomData.countryData ? roomData.countryData[cname] : {};
    layer.bindTooltip(getCountryPopupContent(cname, cData), {
      permanent: infoCardsPermanent,
      direction: "center",
      className: "country-popup-tooltip"
    });
  });
}

/*****************************************************************
 * 8. Bildirim Sistemi
 *****************************************************************/
function showNotification(message, duration = 3000) {
  if (notificationsMuted) return;
  const existingArea = document.getElementById("notification-area");
  if (!existingArea) return;

  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = message;
  existingArea.appendChild(item);

  setTimeout(() => {
    if (existingArea.contains(item)) {
      existingArea.removeChild(item);
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

/** Bildirimleri kapat/aç */
document
  .getElementById("open-notifications-btn")
  .addEventListener("click", () => {
    notificationsMuted = !notificationsMuted;
    if (!notificationsMuted) {
      showNotification("Bildirimler açıldı.");
    } else {
      showNotification("Bildirimler kapatıldı.");
    }
  });

/*****************************************************************
 * 9. 60 Saniye Tur Sayacı
 *****************************************************************/
function isMyTurn() {
  if (!roomData || !roomData.playerOrder) return false;
  if (roomData.gameState !== "started") return false;
  const currentTurnIndex = roomData.currentTurnIndex || 0;
  return roomData.playerOrder[currentTurnIndex] === localPlayerId;
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

/*****************************************************************
 * 10. Oyun Butonları ve İşlevleri (Tur, Odadan Çık vb.)
 *****************************************************************/
document.getElementById("end-turn-btn").addEventListener("click", () => {
  nextTurn(false);
});

function nextTurn(autoEnd = false) {
  if (!isMyTurn()) return;
  stopTurnTimer();

  const turnIndex = roomData.currentTurnIndex || 0;
  const currentPid = roomData.playerOrder[turnIndex];
  const player = roomData.players[currentPid];
  if (!player) return;

  const updates = {};
  // Tur sonu gelir/besin
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

  // Yeni sıraya geç
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

/** Odadan Çık */
document.getElementById("exit-room-btn").addEventListener("click", () => {
  if (!roomRef || !roomData) return;
  const updates = {};
  let newOrder = (roomData.playerOrder || []).filter(
    (id) => id !== localPlayerId
  );

  // Sıra bizdeyse sırayı devret
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

  showLobbyPage();
  localStorage.removeItem("roomCode");
  stopTurnTimer();
  clearInterval(startInterval);
  showNotification("Odadan ayrıldınız.");
});

/*****************************************************************
 * 11. Asker, Bina, Kaynak Gönderme vb. Popuplar
 *****************************************************************/
// --- Popup Aç/Kapa Mantığı ---
const militaryPopup = document.getElementById("military-popup");
const buildingPopup = document.getElementById("building-popup");
const resourcePopup = document.getElementById("resource-popup");
const playersPopup = document.getElementById("players-popup");
const pactPopup = document.getElementById("pact-popup");
const marketPopup = document.getElementById("market-popup");
const chatPopup = document.getElementById("chat-popup");

document.getElementById("open-military-btn").addEventListener("click", () => {
  togglePopup(militaryPopup);
});
document
  .getElementById("close-military-btn")
  .addEventListener("click", () => {
    militaryPopup.style.display = "none";
  });

document.getElementById("open-building-btn").addEventListener("click", () => {
  togglePopup(buildingPopup);
  updateCastleUpgradeCostUI();
});
document
  .getElementById("close-building-btn")
  .addEventListener("click", () => {
    buildingPopup.style.display = "none";
  });

document.getElementById("open-resource-btn").addEventListener("click", () => {
  togglePopup(resourcePopup);
});
document
  .getElementById("close-resource-btn")
  .addEventListener("click", () => {
    resourcePopup.style.display = "none";
  });

document.getElementById("open-players-btn").addEventListener("click", () => {
  togglePopup(playersPopup);
});
document
  .getElementById("close-players-btn")
  .addEventListener("click", () => {
    playersPopup.style.display = "none";
  });

document.getElementById("open-pact-btn").addEventListener("click", () => {
  togglePopup(pactPopup);
});
document.getElementById("close-pact-btn").addEventListener("click", () => {
  pactPopup.style.display = "none";
});

document.getElementById("open-market-btn").addEventListener("click", () => {
  togglePopup(marketPopup);
});
document.getElementById("close-market-btn").addEventListener("click", () => {
  marketPopup.style.display = "none";
});

document.getElementById("open-chat-btn").addEventListener("click", () => {
  toggleChat(!chatOpen);
});
document.getElementById("close-chat-btn").addEventListener("click", () => {
  toggleChat(false);
});

function togglePopup(popupElement) {
  if (popupElement.style.display === "flex") {
    popupElement.style.display = "none";
  } else {
    popupElement.style.display = "flex";
  }
}

/*****************************************************************
 * 12. Asker İşlemleri
 *****************************************************************/
document.getElementById("attack-btn").addEventListener("click", attack);
document
  .getElementById("buy-soldiers-btn")
  .addEventListener("click", buySoldiers);
document
  .getElementById("pull-soldiers-btn")
  .addEventListener("click", pullSoldiers);
document
  .getElementById("send-support-btn")
  .addEventListener("click", sendSupport);

function attack() {
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
  // Petrol kontrol
  if (attacker.petrol < soldiersToSend) {
    showNotification(
      `Bu saldırı için ${soldiersToSend} varil petrol gerekiyor, elinizde yeterli yok!`
    );
    return;
  }

  const target = roomData.countryData[selectedCountry];
  if (!target) return;

  // İlk 3 tur sadece sahipsiz ülkelere saldırı
  if (roomData.round < 4) {
    if (target.owner) {
      showNotification("İlk 3 tur sadece sahipsiz ülkelere saldırabilirsiniz!");
      return;
    }
  }

  // Pakt kontrol (aktif pakt varsa saldıramaz)
  if (target.owner && target.owner !== localPlayerId) {
    if (hasActivePact(localPlayerId, target.owner)) {
      showNotification(
        "Bu oyuncu ile saldırmazlık paktınız var! Saldıramazsınız."
      );
      return;
    }
  }

  const updates = {};
  let attackResult = "";

  // Petrol düş
  updates[`players/${localPlayerId}/petrol`] = attacker.petrol - soldiersToSend;

  // Kendi toprağımıza asker gönderiyorsak
  if (target.owner === localPlayerId) {
    if (soldiersToSend > attacker.soldiers) {
      showNotification("Yeterli askeriniz yok!");
      return;
    }
    updates[`countryData/${selectedCountry}/soldiers`] =
      target.soldiers + soldiersToSend;
    updates[`players/${localPlayerId}/soldiers`] =
      attacker.soldiers - soldiersToSend;

    attackResult = `${selectedCountry} ülkesine ${soldiersToSend} asker yerleştirildi.`;
    roomRef.update(updates, () => {
      immediateOilReward(localPlayerId);
    });
    showNotification(attackResult);
    broadcastNotification(
      `Saldırı: ${attacker.name} (kendi toprağına asker yığdı).`
    );
    return;
  }

  // Başka ülkeye saldırı
  if (soldiersToSend > attacker.soldiers) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }
  updates[`players/${localPlayerId}/soldiers`] =
    attacker.soldiers - soldiersToSend;

  // Kale savunması
  let effectiveAttackers = soldiersToSend;
  if (target.castleDefenseLevel > 0) {
    const defensePercent = 5 * target.castleDefenseLevel;
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
    // Bize ekle
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
    // Saldırıdan sonra petrol kazan
    immediateOilReward(localPlayerId);
  });

  broadcastNotification(
    `Saldırı: ${attacker.name} → ${selectedCountry}. ${attackResult}`
  );
  showNotification(attackResult);

  // Tur geç
  nextTurn();
}

/** Saldırı sonrası hemen petrol geliri */
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

/** Asker Satın Al */
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

/** Asker Çek */
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
      `${currPlayer.name}, ${selectedCountry} ülkesinden ${count} destek askerini geri çekti.`
    );
    showNotification(
      `${selectedCountry} ülkesinden destek askeri çekildi.`
    );
  }

  roomRef.update(updates);
}

/** Askeri Destek Gönder */
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

/*****************************************************************
 * 13. Kaynak Gönderme
 *****************************************************************/
document.getElementById("send-money-btn").addEventListener("click", sendMoney);
document.getElementById("send-petrol-btn").addEventListener("click", sendPetrol);
document.getElementById("send-wheat-btn").addEventListener("click", sendWheat);

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

/** Select listelerini güncelleme */
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
        // Para
        const opt1 = document.createElement("option");
        opt1.value = pid;
        opt1.textContent = roomData.players[pid].name;
        moneySelect.appendChild(opt1);

        // Petrol
        const opt2 = document.createElement("option");
        opt2.value = pid;
        opt2.textContent = roomData.players[pid].name;
        petrolSelect.appendChild(opt2);

        // Buğday
        const opt3 = document.createElement("option");
        opt3.value = pid;
        opt3.textContent = roomData.players[pid].name;
        wheatSelect.appendChild(opt3);
      }
    });
  }
}

/*****************************************************************
 * 14. Bina Kurma & Kale
 *****************************************************************/
document
  .getElementById("buy-barracks-btn")
  .addEventListener("click", buildBarracks);
document
  .getElementById("build-factory-btn")
  .addEventListener("click", buildFactory);
document
  .getElementById("build-refinery-btn")
  .addEventListener("click", buildRefinery);
document
  .getElementById("build-grainmill-btn")
  .addEventListener("click", buildGrainMill);
document
  .getElementById("build-castle-btn")
  .addEventListener("click", buildCastle);
document
  .getElementById("upgrade-castle-btn")
  .addEventListener("click", upgradeCastle);

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
  const player = roomData.players[localPlayerId];
  if (player.money < 1000 || player.petrol < 1000 || player.wheat < 1000) {
    showNotification("Kale kurmak için yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = player.money - 1000;
  updates[`players/${localPlayerId}/petrol`] = player.petrol - 1000;
  updates[`players/${localPlayerId}/wheat`] = player.wheat - 1000;

  updates[`countryData/${selectedCountry}/castleDefenseLevel`] = 1;
  updates[`countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: 1300,
    petrol: 1300,
    wheat: 1300
  };

  roomRef.update(updates);
  broadcastNotification(`${player.name}, ${selectedCountry} ülkesine kale kurdu!`);
  showNotification("Kale kuruldu (%5 savunma).");
}

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

  // Sonraki maliyet
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

/*****************************************************************
 * 15. Saldırmazlık Pakti
 *****************************************************************/
document
  .getElementById("send-pact-offer-btn")
  .addEventListener("click", () => {
    if (!isMyTurn()) {
      showNotification("Pakt teklifini sadece kendi sıranızda gönderebilirsiniz!");
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
      status: "pending"
    };
    pactOfferRef.set(newOffer);

    broadcastNotification(
      `Pakt Teklifi: ${senderData.name} → ${roomData.players[recipient].name} (Tur:${duration}, Para:${cost}$)`
    );
    showNotification("Pakt teklifi gönderildi!");
  });

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

function displayPendingPactOffers() {
  const container = document.getElementById("pact-pending-offers");
  if (!container) return;
  container.innerHTML = "";
  if (!roomData || !roomData.pactOffers) return;

  Object.values(roomData.pactOffers).forEach((offer) => {
    if (offer.status === "pending" && offer.recipientId === localPlayerId) {
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
  broadcastNotification(`Pakt Reddedildi: ${offer.senderName} → Reddedildi.`);
  showNotification("Pakt teklifi reddedildi.");
}

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

/*****************************************************************
 * 16. Market (Ticaret)
 *****************************************************************/
document
  .getElementById("create-trade-offer-btn")
  .addEventListener("click", createTradeOffer);

function toggleChat(show) {
  chatPopup.style.display = show ? "flex" : "none";
  chatOpen = show;
  if (chatOpen) {
    unreadMessages = 0;
    updateChatBadge();
  }
}

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

/** Özel mesaj */
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
    // Özel
    const targetName =
      roomData.players[message.recipientId]?.name || "Bilinmeyen";
    if (message.senderId === localPlayerId) {
      msgDiv.innerHTML = `<strong>[PM to ${targetName}]:</strong> ${message.text}`;
    } else {
      msgDiv.innerHTML = `<strong>[PM from ${message.sender}]:</strong> ${message.text}`;
    }
    msgDiv.style.color = "#f39c12";
  } else {
    // Genel
    msgDiv.textContent = message.sender + ": " + message.text;
  }

  chatMessagesDiv.appendChild(msgDiv);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;

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

/** Support recipient country select */
document
  .getElementById("support-recipient")
  .addEventListener("change", function () {
    const selectedPlayerId = this.value;
    const supportRecipientCountry = document.getElementById(
      "support-recipient-country"
    );
    supportRecipientCountry.innerHTML =
      "<option value=''>--Ülke Seç--</option>";

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

/** Ticaret Teklifi Oluşturma */
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
        return;
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
        html += `
          <label style="font-size:14px;color:#ccc;">Almak istediğiniz miktar:</label>
          <input type="number" class="partial-buy-quantity" placeholder="Miktar" min="1" max="${offer.quantity}" />
          <button class="partial-buy-btn">Satın Al</button>
        `;
      } else {
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
      updates[`players/${localPlayerId}/petrol`] =
        buyer.petrol + buyAmount;
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
  if (!roomData || !roomData.tradeOffers || !roomData.tradeOffers[offerId])
    return;
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

/*****************************************************************
 * 17. Oyun Başlangıcı (DOMContentLoaded)
 *****************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  // localPlayerId yüklenir (Auth'tan bağımsız)
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  // Otomatik odaya bağlanma
  autoReconnect();
});
