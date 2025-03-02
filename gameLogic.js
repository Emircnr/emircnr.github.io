/***************************************************************
 *  gameLogic.js
 *  Yenilenmiş sürüm: Lobi kaldırıldı. Oda kurma, katılma, izleme
 *  işlemleri profil ekranı üzerinden yapılıyor.
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
 * 2. GENEL DEĞİŞKENLER (Auth, Profil, Oda vb.)
 *****************************************************************/
let currentUser = null;         // Firebase Auth kullanıcısı (uid)
let currentUserData = null;     // DB'deki kullanıcı verisi
let localPlayerId = null;       // Oyun içi benzersiz ID (Local Storage)
let currentRoomId = null;       // Odada "rooms/roomId"
let roomRef = null;             // Firebase Realtime DB "rooms/roomId" referansı
let roomData = null;            // Anlık oda verisi (dinamik güncellenir)

let selectedCountry = null;     // Haritada seçilen ülke
let map, geoJsonLayer = null;
let infoCardsPermanent = false; // Ülke tooltip'lerinin kalıcılığı
let turnTimeRemaining = 60;
let turnTimerInterval = null;
let startInterval = null;
let notificationsMuted = false;
let unreadMessages = 0;
let chatOpen = false;
let isSpectator = false;        // Odaya seyirci (izleyici) olarak mı girdik?

// Bayrak düzenleyici
let flagCanvas, flagCtx;
let isDrawing = false;
let brushColor = "#ff0000";
let brushSize = 5;
let isErasing = false;

// Leaflet Pattern cache: her oyuncu için bir pattern saklıyoruz
let playerPatterns = {}; // { playerId: L.Pattern }

// Chat / Notification listener kontrolü
let chatListenerAdded = false;

/*****************************************************************
 * 3. SAYFA YÖNETİMİ (Single Page Application Mantığı)
 *****************************************************************/
const authContainer = document.getElementById("auth-container");
const profileContainer = document.getElementById("profile-container");
const gameContainer = document.getElementById("game-container");

function showAuthPage() {
  authContainer.style.display = "flex";
  profileContainer.style.display = "none";
  gameContainer.style.display = "none";
}
function showProfilePage() {
  authContainer.style.display = "none";
  profileContainer.style.display = "flex";
  gameContainer.style.display = "none";
}
function showGamePage() {
  authContainer.style.display = "none";
  profileContainer.style.display = "none";
  gameContainer.style.display = "block";
}

/*****************************************************************
 * 4. Firebase Authentication (Giriş & Kayıt)
 *****************************************************************/
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    setUserOnlineStatus(true);

    const snapshot = await db.ref("users/" + user.uid).once("value");
    currentUserData = snapshot.val() || {};

    if (!currentUserData.displayName) {
      currentUserData.displayName = user.email.split("@")[0];
      await db.ref("users/" + user.uid).update({
        displayName: currentUserData.displayName
      });
    }
    document.getElementById("profile-username").textContent =
      currentUserData.displayName || "Kullanıcı Adınız";

    // Profil ekranında kullanıcı verilerini yükle
    loadUserFriends();
    loadFriendRequests();
    loadFriendInviteList();
    loadRoomInvites();
    loadActiveRooms(); // Tüm aktif odalar listelenecek

    showProfilePage();
  } else {
    currentUser = null;
    currentUserData = null;
    showAuthPage();
  }
});

// Presence (online/offline)
function setUserOnlineStatus(isOnline) {
  if (!currentUser) return;
  const userStatusRef = db.ref("users/" + currentUser.uid + "/online");
  if (isOnline) {
    userStatusRef.set(true);
    userStatusRef.onDisconnect().set(false);
  } else {
    userStatusRef.set(false);
  }
}

// Giriş / Kayıt sekmesi
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

// Giriş Yap
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

// Kayıt Ol
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
    await db.ref("users/" + uid).set({
      email: email,
      displayName: displayName,
      online: true,
      friends: {},
      friendRequests: {},
      roomInvites: {}
    });
    showNotification("Kayıt başarılı, giriş yapıldı!");
  } catch (err) {
    showNotification("Kayıt hata: " + err.message);
  }
});

// Çıkış Yap
document.getElementById("profile-logout-btn").addEventListener("click", async () => {
  setUserOnlineStatus(false);
  await auth.signOut();
  showNotification("Çıkış yapıldı.");
});

/*****************************************************************
 * 5. Profil Ekranı (Arkadaşlar, İstekler, Oda Davetleri, Oda Kurma)
 *****************************************************************/

/** Arkadaşları Yükle */
async function loadUserFriends() {
  const friendListDiv = document.getElementById("friend-list");
  friendListDiv.innerHTML = "";
  if (!currentUserData || !currentUserData.friends) return;

  const friendIds = Object.keys(currentUserData.friends);
  for (const fId of friendIds) {
    const snap = await db.ref("users/" + fId).once("value");
    const friendData = snap.val();
    if (!friendData) continue;

    const friendItem = document.createElement("div");
    friendItem.className = "friend-item";
    friendItem.innerHTML = `
      <span>
        ${friendData.displayName} 
        ${
          friendData.online
            ? '<span class="online-status">(Çevrimiçi)</span>'
            : '<span class="offline-status">(Çevrimdışı)</span>'
        }
      </span>
      <button class="remove-friend-btn" data-fid="${fId}">
        Sil
      </button>
    `;
    friendListDiv.appendChild(friendItem);
  }
}

/** Arkadaş İsteklerini Yükle */
async function loadFriendRequests() {
  const requestListDiv = document.getElementById("friend-request-list");
  requestListDiv.innerHTML = "";
  if (!currentUserData || !currentUserData.friendRequests) return;

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

/** Arkadaş Ekleme İsteği Gönder */
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
    const allUsersSnap = await db.ref("users").once("value");
    const allUsersData = allUsersSnap.val();
    let targetUserId = null;

    for (const uid in allUsersData) {
      const dName = allUsersData[uid].displayName || "";
      if (dName.toLowerCase() === targetUsername.toLowerCase()) {
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

    await db
      .ref("users/" + targetUserId + "/friendRequests/" + currentUser.uid)
      .set(true);

    showNotification("Arkadaşlık isteği gönderildi!");
  });

const friendRequestList = document.getElementById("friend-request-list");
friendRequestList.addEventListener("click", async (e) => {
  if (e.target.classList.contains("accept-friend-btn")) {
    const fromUid = e.target.getAttribute("data-fid");
    await acceptFriendRequest(fromUid);
    loadUserFriends();
  } else if (e.target.classList.contains("reject-friend-btn")) {
    const fromUid = e.target.getAttribute("data-fid");
    await rejectFriendRequest(fromUid);
  }
});

async function acceptFriendRequest(fromUid) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friends/${fromUid}`).set(true);
  await db.ref(`users/${fromUid}/friends/${currentUser.uid}`).set(true);
  await db.ref(`users/${currentUser.uid}/friendRequests/${fromUid}`).remove();
  showNotification("İstek kabul edildi!");
}
async function rejectFriendRequest(fromUid) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friendRequests/${fromUid}`).remove();
  showNotification("İstek reddedildi.");
}

/** Arkadaş Silme */
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
  showNotification("Arkadaş silindi.");
  loadUserFriends();
}

/*****************************************************************
 * 6. Oda Davetleri (roomInvites) - (Kullanıcıya gelen davetler veya joinRequest'ler)
 *****************************************************************/
async function loadRoomInvites() {
  const inviteListDiv = document.getElementById("room-invite-list");
  inviteListDiv.innerHTML = "";
  if (!currentUserData || !currentUserData.roomInvites) return;

  const invites = currentUserData.roomInvites;
  for (let inviteId in invites) {
    const inv = invites[inviteId];
    if (!inv) continue;

    // type: 'hostInvite' (host -> user) veya 'joinRequest' (user -> host)
    // status: 'pending'
    // fromUid, fromName, roomId, roomName
    const div = document.createElement("div");
    div.className = "room-invite-item";

    if (inv.type === "hostInvite") {
      // Eski mantık: Host'un bize gönderdiği davet
      div.innerHTML = `
        <span>${inv.fromName} odasına davet etti: ${inv.roomName || inv.roomId}</span>
        <div>
          <button class="accept-room-invite-btn" data-iid="${inviteId}">Kabul</button>
          <button class="reject-room-invite-btn" data-iid="${inviteId}">Reddet</button>
        </div>
      `;
    } else if (inv.type === "joinRequest") {
      // Bu, BİZ odayı kurduğumuz zaman, başka oyuncuların katılmak istediği istek.
      // Yani "fromUid" = isteği gönderen kişi
      div.innerHTML = `
        <span>${inv.fromName} adlı kullanıcı, ${inv.roomName} odanıza katılmak istiyor.</span>
        <div>
          <button class="accept-join-request-btn" data-iid="${inviteId}">Kabul</button>
          <button class="reject-room-invite-btn" data-iid="${inviteId}">Reddet</button>
        </div>
      `;
    }
    inviteListDiv.appendChild(div);
  }
}

const roomInviteList = document.getElementById("room-invite-list");
roomInviteList.addEventListener("click", async (e) => {
  // hostInvite => normal katıl
  if (e.target.classList.contains("accept-room-invite-btn")) {
    const inviteId = e.target.getAttribute("data-iid");
    await acceptRoomInvite(inviteId);
  } else if (e.target.classList.contains("reject-room-invite-btn")) {
    const inviteId = e.target.getAttribute("data-iid");
    await rejectRoomInvite(inviteId);
  }
  // joinRequest => oda kurucusu kabul ederse, player ekle
  if (e.target.classList.contains("accept-join-request-btn")) {
    const inviteId = e.target.getAttribute("data-iid");
    await acceptJoinRequest(inviteId);
  }
});

async function acceptRoomInvite(inviteId) {
  if (!currentUserData || !currentUserData.roomInvites) return;
  const invite = currentUserData.roomInvites[inviteId];
  if (!invite) return;

  // hostInvite tipinde => odanın host'u "fromUid"
  const roomId = invite.roomId;
  await joinRoomDirect(roomId); // Odaya direkt katıl
  // Daveti sil
  await db.ref(`users/${currentUser.uid}/roomInvites/${inviteId}`).remove();
  showNotification(`Odaya katılıyorsunuz (${invite.roomName || roomId}).`);
}

async function rejectRoomInvite(inviteId) {
  await db.ref(`users/${currentUser.uid}/roomInvites/${inviteId}`).remove();
  showNotification("Oda daveti reddedildi.");
}

async function acceptJoinRequest(inviteId) {
  if (!currentUserData || !currentUserData.roomInvites) return;
  const request = currentUserData.roomInvites[inviteId];
  if (!request) return;
  // type = 'joinRequest', fromUid = katılmak isteyen
  const joinerUid = request.fromUid;
  const roomId = request.roomId;
  const snap = await db.ref("rooms/" + roomId).once("value");
  if (!snap.exists()) {
    showNotification("Oda bulunamadı (Silinmiş olabilir).");
    // isteği reddet
    await db.ref(`users/${currentUser.uid}/roomInvites/${inviteId}`).remove();
    return;
  }
  const rData = snap.val();
  // Sadece oda host'u bu işlemi yapabilir
  if (rData.hostUid !== currentUser.uid) {
    showNotification("Bu odaya sahip değilsiniz!");
    return;
  }
  // Kişiyi oda players listesine ekle
  if (!rData.players) rData.players = {};
  if (!rData.playerOrder) rData.playerOrder = [];

  // Kontrol: zaten eklendiyse
  if (rData.players[joinerUid]) {
    showNotification("Bu oyuncu zaten odaya katılı!");
    // Davet sil
    await db.ref(`users/${currentUser.uid}/roomInvites/${inviteId}`).remove();
    return;
  }
  // Oyun başlamadıysa ekleyelim
  if (rData.gameState !== "waiting" && rData.gameState !== "starting") {
    showNotification("Oyun zaten başladı, katılamaz!");
    return;
  }

  const userSnap = await db.ref("users/" + joinerUid).once("value");
  const userData = userSnap.val();

  // Eklenecek player objesi
  const newPlayerObj = {
    name: userData.displayName || "Oyuncu",
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: false,
    flag: userData.flag || ""
  };

  // GÜNCELLEME
  const updates = {};
  updates[`rooms/${roomId}/players/${joinerUid}`] = newPlayerObj;
  rData.playerOrder.push(joinerUid);
  updates[`rooms/${roomId}/playerOrder`] = rData.playerOrder;

  // Daveti sil
  updates[`users/${currentUser.uid}/roomInvites/${inviteId}`] = null;

  await db.ref().update(updates);
  showNotification(`${newPlayerObj.name} odaya eklendi!`);
  broadcastNotification(`${newPlayerObj.name} odaya katıldı (${rData.name}).`, roomId);
}

/*****************************************************************
 * 7. Arkadaş Listesi: Oda Kurarken Davet Ekle (Artık "Oda Kur" butonu)
 *****************************************************************/
/** Arkadaş davet listesi (oda kurma seçiminde gösterilecek) */
function loadFriendInviteList() {
  const inviteSelect = document.getElementById("room-invite-friends");
  inviteSelect.innerHTML = "";
  if (!currentUserData || !currentUserData.friends) return;

  const friendIds = Object.keys(currentUserData.friends);
  friendIds.forEach(async (fId) => {
    const snap = await db.ref("users/" + fId).once("value");
    const friendData = snap.val();
    if (friendData) {
      // <option value="fId">ArkadaşAdı</option>
      const opt = document.createElement("option");
      opt.value = fId;
      opt.textContent = friendData.displayName;
      inviteSelect.appendChild(opt);
    }
  });
}

/*****************************************************************
 * 8. Oda Kurma (Profil Ekranı) + Oda Listesi
 *****************************************************************/
document.getElementById("create-room-btn").addEventListener("click", createRoom);

async function createRoom() {
  const roomNameInput = document.getElementById("room-name-input");
  const friendSelect = document.getElementById("room-invite-friends");

  const rName = roomNameInput.value.trim();
  if (!rName) {
    showNotification("Oda adı giriniz!");
    return;
  }
  // playerId sabit
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  // Yeni oda key
  const newRoomId = db.ref("rooms").push().key;

  // Host player objesi
  const userFlag = currentUserData.flag || "";
  const hostPlayerData = {
    name: currentUserData.displayName || "Oyuncu",
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: true,
    flag: userFlag
  };

  // Oda datası
  const newRoomData = {
    roomId: newRoomId,
    name: rName,
    gameState: "waiting",
    currentTurnIndex: 0,
    round: 1,
    playerOrder: [currentUser.uid], // Artık playerId = authUid (basitleştirdik)
    players: {
      [currentUser.uid]: hostPlayerData
    },
    watchers: {},
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    hostUid: currentUser.uid
  };

  // DB'ye yaz
  await db.ref("rooms/" + newRoomId).set(newRoomData);

  // Seçili arkadaşlara davet yolla (hostInvite)
  const selectedFriends = Array.from(friendSelect.options)
    .filter((opt) => opt.selected)
    .map((o) => o.value);
  if (selectedFriends.length > 0) {
    for (const fId of selectedFriends) {
      const inviteKey = db.ref(`users/${fId}/roomInvites`).push().key;
      const inviteData = {
        type: "hostInvite",
        fromUid: currentUser.uid,
        fromName: hostPlayerData.name,
        roomId: newRoomId,
        roomName: rName,
        status: "pending"
      };
      await db.ref(`users/${fId}/roomInvites/${inviteKey}`).set(inviteData);
    }
  }

  // Harita ülke verisi ilk defa yükleme
  initializeCountryData(newRoomId);

  showNotification("Oda oluşturuldu: " + rName);
  // Tekrar aktif oda listesini yükleyelim
  loadActiveRooms();
}

/** Aktif Odaları Yükle (Profil Ekranında göster) */
function loadActiveRooms() {
  const activeRoomsList = document.getElementById("active-rooms-list");
  activeRoomsList.innerHTML = "";

  db.ref("rooms").on("value", (snapshot) => {
    activeRoomsList.innerHTML = "";
    const allRooms = snapshot.val();
    if (!allRooms) return;
    for (let rId in allRooms) {
      const r = allRooms[rId];
      if (!r || r.gameState === "ended") continue; // oyun bitmişse listeleme
      // Aktif oda
      const div = document.createElement("div");
      div.className = "active-room-item";
      // Örnek gösterim: "StratejikOda (host: Ali, oyuncu sayısı: 3)"
      const playerCount = r.players ? Object.keys(r.players).length : 0;
      div.innerHTML = `
        <strong>${r.name}</strong>
        <p>Host: ${r.hostUid}</p>
        <p>Oyuncu Sayısı: ${playerCount}</p>
        <div>
          <button class="btn-join-room" data-rid="${rId}">Katıl</button>
          <button class="btn-watch-room" data-rid="${rId}">İzle</button>
        </div>
      `;
      activeRoomsList.appendChild(div);
    }
  });
}

// Oda listesindeki Katıl / İzle butonları
document.getElementById("active-rooms-list").addEventListener("click", async (e) => {
  if (e.target.classList.contains("btn-join-room")) {
    const roomId = e.target.getAttribute("data-rid");
    // Odaya katılım isteği gönder (host'a)
    requestJoinRoom(roomId);
  } else if (e.target.classList.contains("btn-watch-room")) {
    const roomId = e.target.getAttribute("data-rid");
    watchRoom(roomId);
  }
});

/** Katıl butonuna tıklanınca host'a istek atar */
async function requestJoinRoom(roomId) {
  const snap = await db.ref("rooms/" + roomId).once("value");
  if (!snap.exists()) {
    showNotification("Oda bulunamadı!");
    return;
  }
  const rData = snap.val();
  // Oyun başlamışsa veya bitmişse istek yollama
  if (rData.gameState !== "waiting" && rData.gameState !== "starting") {
    showNotification("Oyun zaten başladı veya bitti, katılamazsınız!");
    return;
  }
  // Host'a roomInvites altına ekle (type=joinRequest)
  const hostUid = rData.hostUid;
  const key = db.ref(`users/${hostUid}/roomInvites`).push().key;
  const data = {
    type: "joinRequest",
    fromUid: currentUser.uid,
    fromName: currentUserData.displayName,
    roomId,
    roomName: rData.name,
    status: "pending"
  };
  await db.ref(`users/${hostUid}/roomInvites/${key}`).set(data);
  showNotification("Katılma isteği gönderildi. Onay bekleniyor.");
}

/** İzle butonuna tıklanınca, doğrudan watchers listesine eklenir */
async function watchRoom(roomId) {
  const snap = await db.ref("rooms/" + roomId).once("value");
  if (!snap.exists()) {
    showNotification("Oda bulunamadı!");
    return;
  }
  const rData = snap.val();
  // watchers/ uid = {name, joinedAt}
  const updates = {};
  updates[`rooms/${roomId}/watchers/${currentUser.uid}`] = {
    name: currentUserData.displayName,
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  };
  await db.ref().update(updates);
  showNotification(`İzleyici olarak ${rData.name} odasına giriliyor...`);
  // Artık game ekranını aç
  joinRoomAsSpectator(roomId);
}

/*****************************************************************
 * 9. Oyun Ekranı ve Harita Kurulumu
 *****************************************************************/
/**
 * roomData => {
 *   players: { uid: {...} },
 *   watchers: { uid: {...} }
 *   ...
 * }
 */

function joinRoomDirect(roomId) {
  // Hemen veriyi çekeriz, eğer players içinde currentUser yoksa -> reddedilir
  db.ref("rooms/" + roomId).once("value", (snap) => {
    if (!snap.exists()) {
      showNotification("Oda bulunamadı!");
      return;
    }
    const r = snap.val();
    // Kontrol: players içinde currentUser.uid var mı?
    if (!r.players || !r.players[currentUser.uid]) {
      showNotification("Bu odaya katılımınız henüz onaylanmamış.");
      return;
    }
    // Katılabilirse
    loadMapAndRoom(roomId);
  });
}

function joinRoomAsSpectator(roomId) {
  // Sadece watchers listesine ekliyoruz, ekranda hamle butonları pasif olacak
  isSpectator = true;
  loadMapAndRoom(roomId);
}

function loadMapAndRoom(roomId) {
  currentRoomId = roomId;
  roomRef = db.ref("rooms/" + roomId);
  roomRef.on("value", (snapshot) => {
    roomData = snapshot.val() || {};
    updateGameUI();
    displayPendingPactOffers();
    displayActivePacts();
    displayTradeOffers();
  });
  showGamePage();
  document.getElementById("display-room-name").textContent = "-";

  // Harita initialize
  initializeMap();
}

/** Oda verisi değiştikçe UI güncelle */
function updateGameUI() {
  if (!roomData) return;
  document.getElementById("display-room-name").textContent = roomData.name || "-";
  // Tur
  document.getElementById("current-round").textContent = roomData.round || 1;

  // Kim Sırada
  if (roomData.playerOrder && roomData.players) {
    const idx = roomData.currentTurnIndex || 0;
    const currentPlayerId = roomData.playerOrder[idx];
    const pl = roomData.players[currentPlayerId];
    if (pl) {
      document.getElementById("current-player").textContent = pl.name;
    }
  }

  // Oyuncular popup
  const playersInfoDiv = document.getElementById("players-info");
  if (playersInfoDiv) {
    playersInfoDiv.innerHTML = "";
    // Players
    if (roomData.playerOrder) {
      roomData.playerOrder.forEach((pid) => {
        const pData = roomData.players[pid];
        if (pData) {
          const pDiv = document.createElement("div");
          pDiv.className = "player-info";
          pDiv.id = "player-info-" + pid;

          // Bayrak resmi
          let flagImg = "";
          if (pData.flag) {
            flagImg = `<img src="${pData.flag}" alt="Flag" style="max-width:40px;max-height:25px; margin-right:10px;" />`;
          }
          pDiv.innerHTML = `
            <p><strong>${flagImg} ${pData.name}</strong></p>
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
    // Watchers (isteğe bağlı, göster)
    if (roomData.watchers) {
      const watchersUids = Object.keys(roomData.watchers);
      if (watchersUids.length > 0) {
        const watchersDiv = document.createElement("div");
        watchersDiv.className = "player-info";
        watchersDiv.innerHTML = `<p><strong>Seyirciler:</strong></p>`;
        watchersUids.forEach((wu) => {
          watchersDiv.innerHTML += `<p>- ${roomData.watchers[wu].name}</p>`;
        });
        playersInfoDiv.appendChild(watchersDiv);
      }
    }
  }

  // Oyun state
  handleGameState(roomData.gameState);

  // Harita güncelle
  if (map && roomData.countryData && geoJsonLayer) {
    geoJsonLayer.eachLayer((layer) => {
      const cname = layer.feature.properties.name;
      const cData = roomData.countryData[cname];
      if (!cData) return;

      // Varsayılan stil
      const defaultStyle = {
        weight: 1,
        color: "#555",
        fillColor: "#ccc",
        fillOpacity: 0.7
      };

      if (cData.owner && roomData.players[cData.owner]) {
        const ownerData = roomData.players[cData.owner];
        if (ownerData.flag) {
          // Bayrak pattern
          const pat = getPlayerPattern(cData.owner);
          if (pat) {
            layer.setStyle({
              fillPattern: pat,
              fillOpacity: 1,
              weight: 1,
              color: "#555"
            });
          } else {
            layer.setStyle({
              fillColor: "#f39c12",
              fillOpacity: 0.7,
              weight: 1,
              color: "#555"
            });
          }
        } else {
          layer.setStyle({
            fillColor: "#f39c12",
            fillOpacity: 0.7,
            weight: 1,
            color: "#555"
          });
        }
      } else {
        // Sahipsiz
        layer.setStyle(defaultStyle);
      }
      layer.setTooltipContent(getCountryPopupContent(cname, cData));
    });
  }

  // Bazı select'lerin güncellenmesi
  updateRecipientSelects();
  updatePactRecipientSelect();
  updatePrivateMessageRecipientSelect();
  updateEmbargoPlayersSelect();
  updateSupportRecipientSelect();

  // Tur sayacı
  if (roomData.gameState === "started") {
    if (isMyTurn()) startTurnTimer();
    else stopTurnTimer();
  } else {
    stopTurnTimer();
  }
}

function handleGameState(state) {
  const startBtn = document.getElementById("start-game-btn");
  const countdownSpan = document.getElementById("start-countdown");
  if (!state) return;

  // Eğer host isek vs.
  const isHost = !!(roomData.players && roomData.players[currentUser?.uid]?.isHost);

  if (state === "waiting") {
    if (isHost && !isSpectator) {
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
  if (!roomData) return;
  const isHost = roomData.players[currentUser?.uid]?.isHost;
  if (!isHost || isSpectator) return;
  if (roomData.gameState !== "waiting") return;
  const now = Date.now();
  const startTime = now + 30000; // 30 sn sonra başlayacak
  roomRef.update({ gameState: "starting", startTime });
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

/** Ülke verilerini (geojson) DB'ye ilk defa yaz */
function initializeCountryData(roomId) {
  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
    .then((r) => r.json())
    .then((geoJsonData) => {
      const features = geoJsonData.features;
      let oilIndexes = [];
      while (oilIndexes.length < 43 && oilIndexes.length < features.length) {
        const rand = Math.floor(Math.random() * features.length);
        if (!oilIndexes.includes(rand)) oilIndexes.push(rand);
      }
      let wheatIndexes = [];
      while (wheatIndexes.length < 60 && wheatIndexes.length < features.length) {
        const rand = Math.floor(Math.random() * features.length);
        if (!wheatIndexes.includes(rand)) wheatIndexes.push(rand);
      }
      const countryDataInit = {};
      features.forEach((f, idx) => {
        const cname = f.properties.name;
        let oilProduction = 0;
        if (oilIndexes.includes(idx)) {
          oilProduction = Math.floor(Math.random() * (500 - 150 + 1)) + 150;
        }
        let wheatProduction = 0;
        if (wheatIndexes.includes(idx)) {
          wheatProduction = Math.floor(Math.random() * (700 - 200 + 1)) + 200;
        }
        countryDataInit[cname] = {
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
          castleDefenseLevel: 0,
          castleNextUpgradeCost: null
        };
      });
      db.ref("rooms/" + roomId + "/countryData").set(countryDataInit);
    });
}

/** Haritayı Başlatma */
function initializeMap() {
  if (map) return;
  map = L.map("map", {
    center: [20, 0],
    zoom: 2,
    maxBounds: [
      [-85, -180],
      [85, 180]
    ],
    maxBoundsViscosity: 1.0,
    worldCopyJump: false,
    noWrap: true
  });

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 7,
      minZoom: 2,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, GEBCO, NOAA...'
    }
  ).addTo(map);

  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
    .then((r) => r.json())
    .then((geoJsonData) => {
      geoJsonLayer = L.geoJson(geoJsonData, {
        style: {
          color: "#555",
          weight: 1,
          fillColor: "#ccc",
          fillOpacity: 0.7
        },
        onEachFeature: (feature, layer) => {
          const cname = feature.properties.name;
          layer.bindTooltip(
            getCountryPopupContent(
              cname,
              roomData && roomData.countryData ? roomData.countryData[cname] : {}
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

function selectCountryOnMap(countryName, layer) {
  if (isSpectator) {
    showNotification("Seyirci modundasınız, etkileşime kapalı.");
    return;
  }
  selectedCountry = countryName;
  showNotification("Seçilen ülke: " + countryName, 1500);

  layer.setStyle({ weight: 4, color: "#FF4500" });
  setTimeout(() => {
    const cData = roomData.countryData[countryName];
    if (cData && cData.owner && roomData.players[cData.owner]?.flag) {
      const pat = getPlayerPattern(cData.owner);
      if (pat) {
        layer.setStyle({
          fillPattern: pat,
          fillOpacity: 1,
          weight: 1,
          color: "#555"
        });
      } else {
        layer.setStyle({
          fillColor: "#f39c12",
          fillOpacity: 0.7,
          weight: 1,
          color: "#555"
        });
      }
    } else if (cData && cData.owner) {
      layer.setStyle({
        fillColor: "#f39c12",
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

function getCountryPopupContent(countryName, country) {
  if (!country) country = {};
  const ownerText = country.owner && roomData.players[country.owner]
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

/** Tooltips kalıcı veya değil */
document.getElementById("toggle-info-cards").addEventListener("click", () => {
  infoCardsPermanent = !infoCardsPermanent;
  updateTooltipsPermanent();
  const icon = document.getElementById("toggle-info-cards").querySelector("i");
  icon.className = infoCardsPermanent ? "fas fa-eye" : "fas fa-eye-slash";
});

function updateTooltipsPermanent() {
  if (!geoJsonLayer) return;
  geoJsonLayer.eachLayer((layer) => {
    layer.unbindTooltip();
    const cname = layer.feature.properties.name;
    const cData = roomData?.countryData?.[cname] || {};
    layer.bindTooltip(getCountryPopupContent(cname, cData), {
      permanent: infoCardsPermanent,
      direction: "center",
      className: "country-popup-tooltip"
    });
  });
}

/*****************************************************************
 * 10. Bildirim Sistemi
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

/** Oda içine global bir mesaj yaymak istersek */
function broadcastNotification(text, roomId) {
  if (!roomId) return;
  db.ref(`rooms/${roomId}/notifications`).push({
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

/** Bildirimleri Kap/Aç */
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
 * 11. 60 Saniye Tur Sayacı
 *****************************************************************/
function isMyTurn() {
  if (!roomData?.playerOrder || !roomData.players) return false;
  if (roomData.gameState !== "started") return false;
  if (isSpectator) return false;
  const currentTurnIndex = roomData.currentTurnIndex || 0;
  return roomData.playerOrder[currentTurnIndex] === currentUser.uid;
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
      if (roomData && roomData.gameState === "started" && isMyTurn()) {
        nextTurn(true);
      }
    } else {
      timerEl.textContent = turnTimeRemaining + "s";
    }
  }, 1000);
}

function stopTurnTimer() {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  const timerEl = document.getElementById("turn-timer");
  if (timerEl) timerEl.textContent = "60s";
}

/*****************************************************************
 * 12. Oyun Butonları (Tur Sonu, Odadan Çık)
 *****************************************************************/
document.getElementById("end-turn-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız, hamle yapamazsınız.");
    return;
  }
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
  // Tur sonu gelir
  if (player.countries && roomData.countryData) {
    let totalMoneyGained = 0;
    let totalWheatGained = 0;

    player.countries.forEach((cName) => {
      const cData = roomData.countryData[cName];
      if (!cData) return;
      // Kışla -> asker
      if (cData.barracksCount) {
        updates[`rooms/${currentRoomId}/countryData/${cName}/soldiers`] =
          (cData.soldiers || 0) + 5 * cData.barracksCount;
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
    updates[`rooms/${currentRoomId}/players/${currentPid}/money`] = (player.money || 0) + totalMoneyGained;
    updates[`rooms/${currentRoomId}/players/${currentPid}/wheat`] = (player.wheat || 0) + totalWheatGained;
  }

  let newIndex = turnIndex + 1;
  let newRound = roomData.round || 1;
  if (newIndex >= roomData.playerOrder.length) {
    newIndex = 0;
    newRound++;
    updates[`rooms/${currentRoomId}/round`] = newRound;
  }
  updates[`rooms/${currentRoomId}/currentTurnIndex`] = newIndex;

  db.ref().update(updates, () => {
    const nextPid = roomData.playerOrder[newIndex];
    let endText = "Sıra " + (roomData.players[nextPid]?.name || "?") + " adlı oyuncuya geçti.";
    if (autoEnd) {
      endText = player.name + " süresini doldurdu! " + endText;
    }
    broadcastNotification(endText, currentRoomId);
    showNotification(endText, 1500);
  });
}

document.getElementById("exit-room-btn").addEventListener("click", async () => {
  if (!roomRef || !roomData) return;
  stopTurnTimer();
  clearInterval(startInterval);

  if (!isSpectator && roomData.players && roomData.players[currentUser.uid]) {
    // Oyuncu olarak çıktı
    const updates = {};
    const newOrder = (roomData.playerOrder || []).filter((id) => id !== currentUser.uid);

    // Eğer çıkınca sıra ondaysa, sonraki tura geç
    if (isMyTurn()) {
      let idx = roomData.currentTurnIndex || 0;
      idx++;
      let newR = roomData.round || 1;
      if (idx >= newOrder.length && newOrder.length > 0) {
        idx = 0;
        newR++;
      }
      updates[`rooms/${currentRoomId}/round`] = newR;
      updates[`rooms/${currentRoomId}/currentTurnIndex`] = newOrder.length ? idx : 0;
    }
    updates[`rooms/${currentRoomId}/playerOrder`] = newOrder;
    updates[`rooms/${currentRoomId}/players/${currentUser.uid}`] = null;

    await db.ref().update(updates);
    showNotification("Odadan ayrıldınız.");
  } else if (isSpectator && roomData.watchers && roomData.watchers[currentUser.uid]) {
    // Seyirci olarak çıktı
    await db.ref(`rooms/${currentRoomId}/watchers/${currentUser.uid}`).remove();
    showNotification("İzlemeyi bıraktınız.");
  }

  showProfilePage();
});

/*****************************************************************
 * 13. Asker İşlemleri (Saldırı, Satın Al, Çek, Destek)
 *****************************************************************/
const militaryPopup = document.getElementById("military-popup");
function togglePopup(popupElement) {
  if (popupElement.style.display === "flex") {
    popupElement.style.display = "none";
  } else {
    popupElement.style.display = "flex";
  }
}
// Popup açma / kapama
document.getElementById("open-military-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  togglePopup(militaryPopup);
});
document.getElementById("close-military-btn").addEventListener("click", () => {
  militaryPopup.style.display = "none";
});

// Saldırı
document.getElementById("attack-btn").addEventListener("click", attack);
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
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }
  const attacker = roomData.players[currentUser.uid];
  if (!attacker) return;
  if (attacker.petrol < soldiersToSend) {
    showNotification(
      `Bu saldırı için ${soldiersToSend} varil petrol gerekiyor, elinizde yeterli yok!`
    );
    return;
  }
  const target = roomData.countryData[selectedCountry];
  if (!target) return;

  // İlk 3 tur sadece sahipsiz ülkeye saldır
  if (roomData.round < 4 && target.owner && target.owner !== currentUser.uid) {
    showNotification("İlk 3 tur yalnızca sahipsiz ülkelere saldırabilirsiniz!");
    return;
  }
  // Pakt kontrolü
  if (target.owner && target.owner !== currentUser.uid) {
    if (hasActivePact(currentUser.uid, target.owner)) {
      showNotification("Bu oyuncu ile saldırmazlık paktınız var!");
      return;
    }
  }

  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = attacker.petrol - soldiersToSend;

  if (target.owner === currentUser.uid) {
    // Kendi ülkemize asker yollama
    if (soldiersToSend > attacker.soldiers) {
      showNotification("Yeterli asker yok!");
      return;
    }
    updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = target.soldiers + soldiersToSend;
    updates[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = attacker.soldiers - soldiersToSend;
    const msg = `${selectedCountry} ülkesine ${soldiersToSend} asker yerleştirildi.`;
    db.ref().update(updates, () => {
      immediateOilReward(currentUser.uid);
    });
    broadcastNotification(
      `Asker Transferi: ${attacker.name} (kendi ülkesine asker taşıdı).`,
      currentRoomId
    );
    showNotification(msg);
    return nextTurn();
  }

  if (soldiersToSend > attacker.soldiers) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] =
    attacker.soldiers - soldiersToSend;

  let result = "";
  let effectiveAttackers = soldiersToSend;
  // Kale savunması
  if (target.castleDefenseLevel > 0) {
    const defensePercent = 5 * target.castleDefenseLevel;
    const killedByCastle = Math.floor((defensePercent / 100) * effectiveAttackers);
    effectiveAttackers -= killedByCastle;
    if (effectiveAttackers < 0) effectiveAttackers = 0;
    result += `Kale savunması: ${killedByCastle} saldıran asker öldü. `;
  }

  if (effectiveAttackers > target.soldiers) {
    const remaining = effectiveAttackers - target.soldiers;
    updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = remaining;
    updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/owner`] = currentUser.uid;
    updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters`] = {};

    // Önceki sahibin countries listesinden çıkar
    if (target.owner && roomData.players[target.owner]) {
      let defCountries = roomData.players[target.owner].countries || [];
      defCountries = defCountries.filter((x) => x !== selectedCountry);
      updates[`rooms/${currentRoomId}/players/${target.owner}/countries`] = defCountries;
    }
    // Bize ekle
    let myCountries = attacker.countries || [];
    if (!myCountries.includes(selectedCountry)) myCountries.push(selectedCountry);
    updates[`rooms/${currentRoomId}/players/${currentUser.uid}/countries`] = myCountries;

    result += `${selectedCountry} fethedildi! (${soldiersToSend} vs ${target.soldiers})`;
  } else {
    // Savundu
    updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] =
      target.soldiers - effectiveAttackers;
    result += `${selectedCountry} savunuldu! (${soldiersToSend} vs ${target.soldiers})`;
  }

  db.ref().update(updates, () => {
    immediateOilReward(currentUser.uid);
  });
  broadcastNotification(`${attacker.name} → ${selectedCountry}. ${result}`, currentRoomId);
  showNotification(result);
  nextTurn();
}

function immediateOilReward(playerId) {
  if (!roomData || !roomData.players[playerId]) return;
  const p = roomData.players[playerId];
  if (!p.countries) return;
  let totalOil = 0;
  p.countries.forEach((cName) => {
    const c = roomData.countryData[cName];
    if (c && c.oilProduction) {
      const effOil = Math.floor(c.oilProduction * (1 + 0.15 * (c.refineries || 0)));
      totalOil += effOil;
    }
  });
  if (totalOil > 0) {
    const newVal = (p.petrol || 0) + totalOil;
    db.ref(`rooms/${currentRoomId}/players/${playerId}/petrol`).set(newVal);
    showNotification(`Saldırı sonrası petrol: +${totalOil} varil`);
    broadcastNotification(`${p.name}, saldırı sonrası +${totalOil} petrol kazandı!`, currentRoomId);
  }
}

// Asker Satın Al
document.getElementById("buy-soldiers-btn").addEventListener("click", buySoldiers);
function buySoldiers() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  const count = parseInt(document.getElementById("soldiers-to-buy").value);
  if (isNaN(count) || count <= 0) {
    showNotification("Geçerli bir sayı girin!");
    return;
  }
  const costMoney = 10 * count;
  const costWheat = 25 * count;
  const currP = roomData.players[currentUser.uid];
  if (currP.money < costMoney) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (currP.wheat < costWheat) {
    showNotification("Yeterli buğdayınız yok!");
    return;
  }

  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = currP.money - costMoney;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = currP.wheat - costWheat;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = currP.soldiers + count;
  db.ref().update(updates);
  broadcastNotification(`${currP.name} ${count} asker satın aldı.`, currentRoomId);
  showNotification(`${count} asker satın alındı.`);
}

// Asker Çek
document.getElementById("pull-soldiers-btn").addEventListener("click", pullSoldiers);
function pullSoldiers() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const count = parseInt(document.getElementById("pull-soldiers-count").value);
  if (isNaN(count) || count <= 0) {
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }
  const currP = roomData.players[currentUser.uid];
  const cData = roomData.countryData[selectedCountry];
  if (!currP || !cData) return;

  const updates = {};
  if (cData.owner === currentUser.uid) {
    // Destek hariç, ülkedeki ana asker sayısı
    let totalSup = 0;
    for (let sid in cData.supporters) {
      totalSup += cData.supporters[sid];
    }
    const occupant = cData.soldiers - totalSup;
    if (occupant < count) {
      showNotification("Ülkedeki destek askerleri hariç bu kadar çekemezsiniz!");
      return;
    }
    updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = cData.soldiers - count;
    updates[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = currP.soldiers + count;
    broadcastNotification(
      `${currP.name}, ${selectedCountry} ülkesinden ${count} asker çekti.`,
      currentRoomId
    );
  } else {
    // Destek askeri çekme
    const mySupport = cData.supporters?.[currentUser.uid] || 0;
    if (mySupport < count) {
      showNotification("Bu ülkede o kadar destek askeriniz yok!");
      return;
    }
    if (cData.soldiers < count) {
      showNotification("Ülkede yeterli asker yok! (Veri tutarsızlığı)");
      return;
    }
    updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = cData.soldiers - count;
    const newSup = mySupport - count;
    if (newSup <= 0) {
      updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters/${currentUser.uid}`] = null;
    } else {
      updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters/${currentUser.uid}`] = newSup;
    }
    updates[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = currP.soldiers + count;
    broadcastNotification(
      `${currP.name}, ${selectedCountry} ülkesinden ${count} destek askerini geri çekti.`,
      currentRoomId
    );
  }
  db.ref().update(updates);
  showNotification("Asker çekildi.");
}

// Askeri Destek Gönder
document.getElementById("send-support-btn").addEventListener("click", sendSupport);
function sendSupport() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
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
  const currP = roomData.players[currentUser.uid];
  if (currP.soldiers < num) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }
  const targC = roomData.countryData[cName];
  if (!targC) {
    showNotification("Ülke bulunamadı!");
    return;
  }
  if (targC.owner !== recipient) {
    showNotification("Bu ülke o oyuncuya ait değil!");
    return;
  }

  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = currP.soldiers - num;
  updates[`rooms/${currentRoomId}/countryData/${cName}/soldiers`] = (targC.soldiers || 0) + num;
  const oldSup = targC.supporters?.[currentUser.uid] || 0;
  updates[`rooms/${currentRoomId}/countryData/${cName}/supporters/${currentUser.uid}`] = oldSup + num;

  db.ref().update(updates);
  broadcastNotification(
    `${currP.name}, ${roomData.players[recipient].name} (${cName}) ülkesine ${num} asker destek gönderdi.`,
    currentRoomId
  );
  showNotification("Askeri destek gönderildi!");
}

/** Destek select */
function updateSupportRecipientSelect() {
  const sel = document.getElementById("support-recipient");
  sel.innerHTML = "<option value=''>--Oyuncu Seç--</option>";
  if (!roomData?.playerOrder) return;
  roomData.playerOrder.forEach((pid) => {
    if (pid !== currentUser.uid && roomData.players[pid]) {
      const o = document.createElement("option");
      o.value = pid;
      o.textContent = roomData.players[pid].name;
      sel.appendChild(o);
    }
  });
}
document.getElementById("support-recipient").addEventListener("change", function () {
  const recipient = this.value;
  const selC = document.getElementById("support-recipient-country");
  selC.innerHTML = "<option value=''>--Ülke Seç--</option>";
  if (!recipient || !roomData.players[recipient]) return;
  const rc = roomData.players[recipient].countries || [];
  rc.forEach((cName) => {
    const opt = document.createElement("option");
    opt.value = cName;
    opt.textContent = cName;
    selC.appendChild(opt);
  });
});

/*****************************************************************
 * 14. Kaynak Gönderme
 *****************************************************************/
const resourcePopup = document.getElementById("resource-popup");
document.getElementById("open-resource-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  togglePopup(resourcePopup);
});
document.getElementById("close-resource-btn").addEventListener("click", () => {
  resourcePopup.style.display = "none";
});

document.getElementById("send-money-btn").addEventListener("click", sendMoney);
document.getElementById("send-petrol-btn").addEventListener("click", sendPetrol);
document.getElementById("send-wheat-btn").addEventListener("click", sendWheat);

function updateRecipientSelects() {
  const moneySel = document.getElementById("recipient-player");
  const petrolSel = document.getElementById("recipient-player-petrol");
  const wheatSel = document.getElementById("recipient-player-wheat");
  if (!moneySel || !petrolSel || !wheatSel) return;

  moneySel.innerHTML = "";
  petrolSel.innerHTML = "";
  wheatSel.innerHTML = "";

  if (roomData?.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== currentUser.uid && roomData.players[pid]) {
        const pName = roomData.players[pid].name;
        const o1 = document.createElement("option");
        o1.value = pid;
        o1.textContent = pName;
        moneySel.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = pid;
        o2.textContent = pName;
        petrolSel.appendChild(o2);

        const o3 = document.createElement("option");
        o3.value = pid;
        o3.textContent = pName;
        wheatSel.appendChild(o3);
      }
    });
  }
}

function sendMoney() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  const amt = parseInt(document.getElementById("money-to-send").value);
  const recId = document.getElementById("recipient-player").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const cp = roomData.players[currentUser.uid];
  if (cp.money < amt) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (!recId) {
    showNotification("Alıcı seçin!");
    return;
  }
  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = cp.money - amt;
  updates[`rooms/${currentRoomId}/players/${recId}/money`] = roomData.players[recId].money + amt;

  db.ref().update(updates);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt}$`, currentRoomId);
  showNotification(`${amt}$ gönderildi.`);
}

function sendPetrol() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  const amt = parseInt(document.getElementById("petrol-to-send").value);
  const recId = document.getElementById("recipient-player-petrol").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const cp = roomData.players[currentUser.uid];
  if (cp.petrol < amt) {
    showNotification("Yeterli petrol yok!");
    return;
  }
  if (!recId) {
    showNotification("Alıcı seçin!");
    return;
  }
  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = cp.petrol - amt;
  updates[`rooms/${currentRoomId}/players/${recId}/petrol`] = roomData.players[recId].petrol + amt;

  db.ref().update(updates);
  broadcastNotification(
    `${cp.name} → ${roomData.players[recId].name}: ${amt} varil petrol`,
    currentRoomId
  );
  showNotification(`${amt} varil petrol gönderildi.`);
}

function sendWheat() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  const amt = parseInt(document.getElementById("wheat-to-send").value);
  const recId = document.getElementById("recipient-player-wheat").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const cp = roomData.players[currentUser.uid];
  if (cp.wheat < amt) {
    showNotification("Yeterli buğday yok!");
    return;
  }
  if (!recId) {
    showNotification("Alıcı seçin!");
    return;
  }
  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = cp.wheat - amt;
  updates[`rooms/${currentRoomId}/players/${recId}/wheat`] = roomData.players[recId].wheat + amt;

  db.ref().update(updates);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt} buğday`, currentRoomId);
  showNotification(`${amt} buğday gönderildi.`);
}

/*****************************************************************
 * 15. Bina Kurma (Kışla, Fabrika, Rafine, Değirmen, Kale)
 *****************************************************************/
const buildingPopup = document.getElementById("building-popup");
document.getElementById("open-building-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  togglePopup(buildingPopup);
  updateCastleUpgradeCostUI();
});
document.getElementById("close-building-btn").addEventListener("click", () => {
  buildingPopup.style.display = "none";
});

document.getElementById("buy-barracks-btn").addEventListener("click", buildBarracks);
document.getElementById("build-factory-btn").addEventListener("click", buildFactory);
document.getElementById("build-refinery-btn").addEventListener("click", buildRefinery);
document.getElementById("build-grainmill-btn").addEventListener("click", buildGrainMill);
document.getElementById("build-castle-btn").addEventListener("click", buildCastle);
document.getElementById("upgrade-castle-btn").addEventListener("click", upgradeCastle);

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
  if (!cData || cData.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 300 * q;
  const costPetrol = 50 * q;
  const costWheat = 120 * q;
  const p = roomData.players[currentUser.uid];
  if (p.money < costMoney || p.petrol < costPetrol || p.wheat < costWheat) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - costMoney;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - costPetrol;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat - costWheat;
  updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/barracksCount`] =
    cData.barracksCount + q;

  db.ref().update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} kışla kurdu!`, currentRoomId);
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
  if (!cData || cData.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 500 * q;
  const costPetrol = 130 * q;
  const p = roomData.players[currentUser.uid];
  if (p.money < costMoney || p.petrol < costPetrol) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - costMoney;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - costPetrol;
  updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/factories`] = cData.factories + q;

  db.ref().update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} fabrika kurdu!`, currentRoomId);
  showNotification(`${q} fabrika kuruldu!`);
}

function buildRefinery() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("refinery-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli rafine sayısı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 800 * q;
  const costPetrol = 250 * q;
  const p = roomData.players[currentUser.uid];
  if (p.money < costMoney || p.petrol < costPetrol) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - costMoney;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - costPetrol;
  updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/refineries`] = cData.refineries + q;

  db.ref().update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} rafine kurdu!`, currentRoomId);
  showNotification(`${q} rafine kuruldu!`);
}

function buildGrainMill() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("grainmill-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli değirmen sayısı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 200 * q;
  const costPetrol = 100 * q;
  const p = roomData.players[currentUser.uid];
  if (p.money < costMoney || p.petrol < costPetrol) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - costMoney;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - costPetrol;
  updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/grainMills`] = cData.grainMills + q;

  db.ref().update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} değirmen kurdu!`, currentRoomId);
  showNotification(`${q} değirmen kuruldu!`);
}

function buildCastle() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cData.castleDefenseLevel > 0) {
    showNotification("Bu ülkede zaten kale var!");
    return;
  }
  const p = roomData.players[currentUser.uid];
  if (p.money < 1000 || p.petrol < 1000 || p.wheat < 1000) {
    showNotification("Kale için yeterli kaynak yok!");
    return;
  }

  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - 1000;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - 1000;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat - 1000;

  updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleDefenseLevel`] = 1;
  updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: 1300,
    petrol: 1300,
    wheat: 1300
  };

  db.ref().update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine kale kurdu!`, currentRoomId);
  showNotification("Kale kuruldu (%5).");
}

function upgradeCastle() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cData.castleDefenseLevel < 1) {
    showNotification("Önce kale kurun!");
    return;
  }
  if (cData.castleDefenseLevel >= 6) {
    showNotification("Kale savunması %30'u aştı (Max)!");
    return;
  }
  if (!cData.castleNextUpgradeCost) {
    showNotification("Yükseltme verisi yok!");
    return;
  }
  const p = roomData.players[currentUser.uid];
  const cost = cData.castleNextUpgradeCost;
  if (p.money < cost.money || p.petrol < cost.petrol || p.wheat < cost.wheat) {
    showNotification("Gerekli kaynak yok!");
    return;
  }

  const updates = {};
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - cost.money;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - cost.petrol;
  updates[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat - cost.wheat;

  const newLevel = cData.castleDefenseLevel + 1;
  updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleDefenseLevel`] = newLevel;
  const nm = Math.floor(cost.money * 1.3);
  const np = Math.floor(cost.petrol * 1.3);
  const nw = Math.floor(cost.wheat * 1.3);
  updates[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: nm, petrol: np, wheat: nw
  };

  db.ref().update(updates, () => {
    updateCastleUpgradeCostUI();
  });
  broadcastNotification(`${p.name}, ${selectedCountry} kalesini güçlendirdi (Seviye ${newLevel}).`, currentRoomId);
  showNotification(`Kale güçlendirildi. (%${newLevel * 5} savunma)`);
}

function updateCastleUpgradeCostUI() {
  const costSpan = document.getElementById("castle-upgrade-cost-text");
  if (!costSpan) return;
  if (!selectedCountry || !roomData?.countryData?.[selectedCountry]) {
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
 * 16. Saldırmazlık Pakti
 *****************************************************************/
const pactPopup = document.getElementById("pact-popup");
document.getElementById("open-pact-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  togglePopup(pactPopup);
});
document.getElementById("close-pact-btn").addEventListener("click", () => {
  pactPopup.style.display = "none";
});

document.getElementById("send-pact-offer-btn").addEventListener("click", () => {
  if (!isMyTurn()) {
    showNotification("Pakt teklifini yalnızca kendi sıranızda yapabilirsiniz!");
    return;
  }
  const recip = document.getElementById("pact-offer-recipient").value;
  const duration = parseInt(document.getElementById("pact-duration").value);
  const cost = parseInt(document.getElementById("pact-cost").value);

  if (!recip || recip === currentUser.uid) {
    showNotification("Geçerli bir oyuncu seçin!");
    return;
  }
  if (isNaN(duration) || duration <= 0) {
    showNotification("Tur sayısı geçersiz!");
    return;
  }
  if (isNaN(cost) || cost < 0) {
    showNotification("Para miktarı geçersiz!");
    return;
  }
  if (hasActivePact(currentUser.uid, recip)) {
    showNotification("Bu oyuncuyla zaten aktif bir paktınız var!");
    return;
  }
  const sender = roomData.players[currentUser.uid];
  const offRef = db.ref(`rooms/${currentRoomId}/pactOffers`).push();
  const newOffer = {
    offerId: offRef.key,
    senderId: currentUser.uid,
    senderName: sender.name,
    recipientId: recip,
    duration,
    cost,
    status: "pending"
  };
  offRef.set(newOffer);
  broadcastNotification(
    `Pakt Teklifi: ${sender.name} → ${roomData.players[recip].name} (Tur:${duration}, Para:${cost}$)`,
    currentRoomId
  );
  showNotification("Pakt teklifi gönderildi!");
});

function hasActivePact(a, b) {
  if (!roomData?.pacts) return false;
  for (let pid in roomData.pacts) {
    const pact = roomData.pacts[pid];
    if (pact.active && roomData.round <= pact.expirationRound) {
      if ((pact.playerA === a && pact.playerB === b) ||
          (pact.playerA === b && pact.playerB === a)) {
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
  if (!roomData?.pactOffers) return;

  Object.values(roomData.pactOffers).forEach((offer) => {
    if (offer.status === "pending" && offer.recipientId === currentUser.uid) {
      const div = document.createElement("div");
      div.className = "pact-offer-item";
      div.dataset.offerId = offer.offerId;
      div.innerHTML = `
        <p><strong>${offer.senderName}</strong> size saldırmazlık pakti teklif ediyor.</p>
        <p>Tur: ${offer.duration}, Para: ${offer.cost}$</p>
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
  if (!roomData?.pacts) return;

  for (let pid in roomData.pacts) {
    const pact = roomData.pacts[pid];
    if (pact.active && roomData.round <= pact.expirationRound) {
      if (pact.playerA === currentUser.uid || pact.playerB === currentUser.uid) {
        const otherId = (pact.playerA === currentUser.uid) ? pact.playerB : pact.playerA;
        const otherName = roomData.players[otherId]?.name || "???";
        const rLeft = pact.expirationRound - roomData.round + 1;

        const d = document.createElement("div");
        d.className = "active-pact-item";
        d.innerHTML = `
          <p>Pakt: <strong>${otherName}</strong></p>
          <p>Kalan Tur: <strong>${rLeft}</strong></p>
        `;
        container.appendChild(d);
      }
    }
  }
}

document.getElementById("pact-pending-offers").addEventListener("click", (e) => {
  if (e.target.classList.contains("accept-btn")) {
    const oid = e.target.getAttribute("data-offer-id");
    acceptPactOffer(oid);
  } else if (e.target.classList.contains("reject-btn")) {
    const oid = e.target.getAttribute("data-offer-id");
    rejectPactOffer(oid);
  }
});

function acceptPactOffer(offerId) {
  const offer = roomData?.pactOffers?.[offerId];
  if (!offer || offer.status !== "pending") return;
  if (hasActivePact(offer.senderId, offer.recipientId)) {
    showNotification("Zaten aktif bir pakt var!");
    db.ref(`rooms/${currentRoomId}/pactOffers/${offerId}`).update({ status: "rejected" });
    return;
  }
  const sender = roomData.players[offer.senderId];
  const rec = roomData.players[offer.recipientId];
  if (!sender || !rec) return;

  if (sender.money < offer.cost) {
    showNotification("Teklifi gönderenin parası yok! Teklif geçersiz.");
    db.ref(`rooms/${currentRoomId}/pactOffers/${offerId}`).update({ status: "rejected" });
    return;
  }
  const expRound = (roomData.round || 1) + offer.duration;
  const pactId = db.ref().push().key;
  const ups = {};
  ups[`rooms/${currentRoomId}/pactOffers/${offerId}/status`] = "accepted";
  ups[`rooms/${currentRoomId}/players/${offer.senderId}/money`] = sender.money - offer.cost;
  ups[`rooms/${currentRoomId}/players/${offer.recipientId}/money`] = rec.money + offer.cost;
  if (!roomData.pacts) {
    ups[`rooms/${currentRoomId}/pacts`] = {};
  }
  ups[`rooms/${currentRoomId}/pacts/${pactId}`] = {
    playerA: offer.senderId,
    playerB: offer.recipientId,
    active: true,
    cost: offer.cost,
    duration: offer.duration,
    expirationRound: expRound
  };
  db.ref().update(ups);
  broadcastNotification(`Pakt: ${sender.name} & ${rec.name} (Tur:${offer.duration}, Para:${offer.cost}$).`, currentRoomId);
  showNotification("Pakt teklifi kabul edildi!");
}

function rejectPactOffer(offerId) {
  const offer = roomData?.pactOffers?.[offerId];
  if (!offer || offer.status !== "pending") return;
  db.ref(`rooms/${currentRoomId}/pactOffers/${offerId}`).update({ status: "rejected" });
  broadcastNotification(`Pakt Reddedildi: ${offer.senderName} -> Reddedildi.`, currentRoomId);
  showNotification("Pakt teklifi reddedildi.");
}

function updatePactRecipientSelect() {
  const s = document.getElementById("pact-offer-recipient");
  if (!s) return;
  s.innerHTML = "";
  if (roomData?.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== currentUser.uid && roomData.players[pid]) {
        const o = document.createElement("option");
        o.value = pid;
        o.textContent = roomData.players[pid].name;
        s.appendChild(o);
      }
    });
  }
}

/*****************************************************************
 * 17. Market (Ticaret) Sistemi
 *****************************************************************/
const marketPopup = document.getElementById("market-popup");
document.getElementById("open-market-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  togglePopup(marketPopup);
});
document.getElementById("close-market-btn").addEventListener("click", () => {
  marketPopup.style.display = "none";
});

document.getElementById("create-trade-offer-btn").addEventListener("click", createTradeOffer);
function createTradeOffer() {
  if (!roomData?.players[currentUser.uid]) return;
  if (!isMyTurn()) {
    showNotification("Ticaret teklifini yalnızca kendi sıranızda yapabilirsiniz!");
    return;
  }
  const itemType = document.getElementById("trade-item-type").value;
  const qty = parseInt(document.getElementById("trade-quantity").value);
  const price = parseInt(document.getElementById("trade-price").value);
  if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
    showNotification("Geçerli miktar/fiyat girin!");
    return;
  }
  const seller = roomData.players[currentUser.uid];
  let ok = false;
  if (itemType === "petrol" && seller.petrol >= qty) ok = true;
  if (itemType === "wheat" && seller.wheat >= qty) ok = true;
  if (!ok) {
    showNotification("Yeterli ürününüz yok!");
    return;
  }

  // Ambargo listesi
  const embSel = document.getElementById("embargo-players");
  let embargoList = [];
  for (let i = 0; i < embSel.options.length; i++) {
    if (embSel.options[i].selected) {
      embargoList.push(embSel.options[i].value);
    }
  }

  const offRef = db.ref(`rooms/${currentRoomId}/tradeOffers`).push();
  offRef.set({
    offerId: offRef.key,
    sellerId: currentUser.uid,
    sellerName: seller.name,
    itemType,
    quantity: qty,
    price,
    status: "pending",
    embargo: embargoList
  });
  broadcastNotification(
    `${seller.name} ticaret teklifi oluşturdu (${itemType}, adet:${qty}, fiyat:${price}$).`,
    currentRoomId
  );
  showNotification("Ticaret teklifi oluşturuldu!");
}

function displayTradeOffers() {
  const div = document.getElementById("trade-offers-list");
  if (!div) return;
  div.innerHTML = "";
  if (!roomData?.tradeOffers) return;

  const offers = Object.values(roomData.tradeOffers);
  offers.forEach((o) => {
    if (o.status === "pending") {
      if (o.embargo && o.embargo.includes(currentUser.uid)) return;
      const d = document.createElement("div");
      d.className = "offer-item";
      let itemLabel = o.itemType === "petrol" ? "Petrol" : "Buğday";
      let html = `
        <p><strong>Satıcı:</strong> ${o.sellerName}</p>
        <p><strong>Ürün:</strong> ${itemLabel}</p>
        <p><strong>Mevcut Miktar:</strong> ${o.quantity}</p>
        <p><strong>Birim Fiyat:</strong> ${o.price} $</p>
      `;
      if (o.sellerId !== currentUser.uid) {
        // Satın alma
        html += `
          <label style="font-size:14px;color:#ccc;">Almak istediğiniz miktar:</label>
          <input type="number" class="partial-buy-quantity" placeholder="Miktar" min="1" max="${o.quantity}" />
          <button class="partial-buy-btn">Satın Al</button>
        `;
      } else {
        // Kendi teklifini iptal
        html += `
          <button class="cancel-offer-btn" style="background:linear-gradient(45deg, #c0392b, #e74c3c); margin-top:10px;">İptal Et</button>
        `;
      }
      if (o.embargo && o.embargo.length > 0) {
        const embUsers = o.embargo
          .map((id) => roomData.players[id]?.name || "???")
          .join(", ");
        html += `<p style="color:red;"><strong>Ambargo:</strong> ${embUsers}</p>`;
      }
      d.innerHTML = html;

      const partialBtn = d.querySelector(".partial-buy-btn");
      if (partialBtn) {
        partialBtn.addEventListener("click", () => {
          const inp = d.querySelector(".partial-buy-quantity");
          const amt = parseInt(inp.value);
          if (isNaN(amt) || amt <= 0) {
            showNotification("Geçerli miktar girin!");
            return;
          }
          acceptTradeOffer(o.offerId, amt);
        });
      }
      const cancelBtn = d.querySelector(".cancel-offer-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => cancelTradeOffer(o.offerId));
      }
      div.appendChild(d);
    }
  });
}

function acceptTradeOffer(offerId, buyAmount) {
  const off = roomData?.tradeOffers?.[offerId];
  if (!off || off.status !== "pending") {
    showNotification("Teklif geçerli değil!");
    return;
  }
  const seller = roomData.players[off.sellerId];
  const buyer = roomData.players[currentUser.uid];
  if (!seller || !buyer) return;
  if (buyAmount > off.quantity) {
    showNotification("Teklifte yeterli stok yok!");
    return;
  }
  const totalCost = off.price * buyAmount;
  if (buyer.money < totalCost) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  const ups = {};
  let hasEnough = false;
  if (off.itemType === "petrol") {
    if (seller.petrol >= buyAmount) {
      hasEnough = true;
      ups[`rooms/${currentRoomId}/players/${off.sellerId}/petrol`] = seller.petrol - buyAmount;
      ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = buyer.petrol + buyAmount;
    }
  } else if (off.itemType === "wheat") {
    if (seller.wheat >= buyAmount) {
      hasEnough = true;
      ups[`rooms/${currentRoomId}/players/${off.sellerId}/wheat`] = seller.wheat - buyAmount;
      ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = buyer.wheat + buyAmount;
    }
  }
  if (!hasEnough) {
    showNotification("Satıcının yeterli miktarı kalmamış!");
    return;
  }
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = buyer.money - totalCost;
  ups[`rooms/${currentRoomId}/players/${off.sellerId}/money`] = seller.money + totalCost;
  const newQty = off.quantity - buyAmount;
  if (newQty <= 0) {
    ups[`rooms/${currentRoomId}/tradeOffers/${offerId}/status`] = "completed";
  }
  ups[`rooms/${currentRoomId}/tradeOffers/${offerId}/quantity`] = newQty;

  db.ref().update(ups, (err) => {
    if (!err) {
      broadcastNotification(
        `Ticaret: ${seller.name} -> ${buyer.name} (${buyAmount} x ${off.itemType}).`,
        currentRoomId
      );
      showNotification("Ticaret başarıyla gerçekleşti!");
    }
  });
}

function cancelTradeOffer(offerId) {
  const off = roomData?.tradeOffers?.[offerId];
  if (!off) return;
  if (off.sellerId !== currentUser.uid) {
    showNotification("Sadece kendi teklifinizi iptal edebilirsiniz!");
    return;
  }
  if (off.status !== "pending") {
    showNotification("Bu teklif zaten tamamlanmış/iptal.");
    return;
  }
  db.ref(`rooms/${currentRoomId}/tradeOffers/${offerId}`).update({ status: "cancelled" });
  broadcastNotification("Ticaret teklifi iptal edildi: " + off.sellerName, currentRoomId);
  showNotification("Teklif iptal edildi.");
}

function updateEmbargoPlayersSelect() {
  const sel = document.getElementById("embargo-players");
  if (!sel) return;
  sel.innerHTML = "";
  if (roomData?.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== currentUser.uid && roomData.players[pid]) {
        const o = document.createElement("option");
        o.value = pid;
        o.textContent = roomData.players[pid].name;
        sel.appendChild(o);
      }
    });
  }
}

/*****************************************************************
 * 18. Sohbet (Chat) Sistemi
 *****************************************************************/
const chatPopup = document.getElementById("chat-popup");
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
  if (!text || !roomRef) return;

  let senderName = currentUserData?.displayName || "Anon";
  if (roomData?.players?.[currentUser.uid]) {
    senderName = roomData.players[currentUser.uid].name;
  }
  const msg = {
    sender: senderName,
    senderId: currentUser.uid,
    text,
    recipientId: "",
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(msg, () => {
    input.value = "";
  });
}

// Özel mesaj
document.getElementById("send-private-message-btn").addEventListener("click", () => {
  const pmInput = document.getElementById("private-message-input");
  const pmRecip = document.getElementById("private-message-recipient");
  const txt = pmInput.value.trim();
  const rc = pmRecip.value;
  if (!txt || !rc) return;

  let senderName = currentUserData?.displayName || "Anon";
  if (roomData?.players?.[currentUser.uid]) {
    senderName = roomData.players[currentUser.uid].name;
  }
  const pm = {
    sender: senderName,
    senderId: currentUser.uid,
    text: txt,
    recipientId: rc,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(pm, () => {
    pmInput.value = "";
    showNotification("Özel mesaj gönderildi!");
  });
});

function appendChatMessage(message) {
  // Özel mesaj mı?
  if (message.recipientId && message.recipientId !== "") {
    // Sadece bize veya bizden geliyorsa göster
    if (message.senderId !== currentUser.uid && message.recipientId !== currentUser.uid) {
      return;
    }
  }
  const chatMessagesDiv = document.getElementById("chat-messages");
  const div = document.createElement("div");

  if (message.recipientId && message.recipientId !== "") {
    const targName = roomData.players[message.recipientId]?.name || "???";
    if (message.senderId === currentUser.uid) {
      div.innerHTML = `<strong>[PM to ${targName}]:</strong> ${message.text}`;
    } else {
      div.innerHTML = `<strong>[PM from ${message.sender}]:</strong> ${message.text}`;
    }
    div.style.color = "#f39c12";
  } else {
    div.textContent = `${message.sender}: ${message.text}`;
  }
  chatMessagesDiv.appendChild(div);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;

  if (!chatOpen && message.senderId !== currentUser.uid) {
    unreadMessages++;
    updateChatBadge();
  }
}

function updateChatBadge() {
  const btn = document.getElementById("open-chat-btn");
  if (unreadMessages > 0) {
    btn.dataset.badge = unreadMessages;
  } else {
    btn.dataset.badge = "";
  }
}

/** Chat + Notification listener */
function addChatListeners() {
  if (chatListenerAdded || !roomRef) return;
  roomRef.child("chat").on("child_added", (snap) => {
    const msg = snap.val();
    appendChatMessage(msg);
  });
  roomRef.child("notifications").on("child_added", (snap) => {
    const data = snap.val();
    if (data && data.text) {
      displayGlobalNotification(data.text);
    }
  });
  chatListenerAdded = true;
}

/*****************************************************************
 * 19. BAYRAK DÜZENLEYİCİ (Flag Editor)
 *****************************************************************/
const flagEditorPopup = document.getElementById("flag-editor-popup");
document.getElementById("edit-flag-btn").addEventListener("click", () => {
  initFlagCanvas();
  flagEditorPopup.style.display = "flex";
});
document.getElementById("close-flag-editor-btn").addEventListener("click", () => {
  flagEditorPopup.style.display = "none";
});
document.getElementById("save-flag-btn").addEventListener("click", saveFlagDrawing);

function initFlagCanvas() {
  if (!flagCanvas) {
    flagCanvas = document.getElementById("flag-canvas");
    flagCtx = flagCanvas.getContext("2d");

    flagCanvas.addEventListener("mousedown", startDrawing);
    flagCanvas.addEventListener("mousemove", drawOnCanvas);
    flagCanvas.addEventListener("mouseup", stopDrawing);
    flagCanvas.addEventListener("mouseleave", stopDrawing);
  }
  flagCtx.fillStyle = "#ffffff";
  flagCtx.fillRect(0, 0, flagCanvas.width, flagCanvas.height);

  if (currentUserData && currentUserData.flag) {
    const img = new Image();
    img.onload = function () {
      flagCtx.drawImage(img, 0, 0, flagCanvas.width, flagCanvas.height);
    };
    img.src = currentUserData.flag;
  }
}

function startDrawing(e) {
  isDrawing = true;
  drawOnCanvas(e);
}
function drawOnCanvas(e) {
  if (!isDrawing) return;
  const rect = flagCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  flagCtx.lineWidth = brushSize;
  flagCtx.lineCap = "round";
  flagCtx.lineJoin = "round";

  if (isErasing) {
    flagCtx.strokeStyle = "#ffffff";
  } else {
    flagCtx.strokeStyle = brushColor;
  }

  flagCtx.lineTo(x, y);
  flagCtx.stroke();
  flagCtx.beginPath();
  flagCtx.moveTo(x, y);
}
function stopDrawing() {
  isDrawing = false;
  flagCtx.beginPath();
}

document.getElementById("flag-erase-btn").addEventListener("click", () => {
  isErasing = !isErasing;
  document.getElementById("flag-erase-btn").textContent = isErasing ? "Kalem" : "Silgi";
});
document.getElementById("flag-clear-btn").addEventListener("click", () => {
  flagCtx.fillStyle = "#ffffff";
  flagCtx.fillRect(0, 0, flagCanvas.width, flagCanvas.height);
});
document.getElementById("flag-color").addEventListener("input", (e) => {
  brushColor = e.target.value;
  if (isErasing) {
    isErasing = false;
    document.getElementById("flag-erase-btn").textContent = "Silgi";
  }
});
document.getElementById("flag-brush-size").addEventListener("input", (e) => {
  brushSize = parseInt(e.target.value);
});

function saveFlagDrawing() {
  if (!flagCanvas || !flagCtx) return;
  const dataUrl = flagCanvas.toDataURL("image/png");
  db.ref("users/" + currentUser.uid + "/flag").set(dataUrl);
  currentUserData.flag = dataUrl;
  showNotification("Bayrak kaydedildi!");
  flagEditorPopup.style.display = "none";
}

/*****************************************************************
 * 20. Leaflet Pattern ile Bayrak Pattern'ı
 *****************************************************************/
function getPlayerPattern(playerId) {
  if (playerPatterns[playerId]) {
    return playerPatterns[playerId];
  }
  if (!roomData || !roomData.players[playerId]) return null;
  const p = roomData.players[playerId];
  if (!p.flag) return null;

  // Pattern oluştur
  const pat = new L.Pattern({
    patternUnits: 'userSpaceOnUse',
    width: 50,
    height: 50
  });
  // Tekrarsız kaplama
  pat.addShape(
    new L.PatternShape('image',
      { x: 0, y: 0, width: 50, height: 50 },
      { href: p.flag }
    )
  );

  pat.addTo(map);
  playerPatterns[playerId] = pat;
  return pat;
}

/*****************************************************************
 * 21. DOMContentLoaded
 *****************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  // Chat & Notification listener ekle
  // (Odaya girdiğimizde "addChatListeners()" çağırmak için)
  // Bunun daha sağlam hali: roomRef değişince addChatListeners()...
  const observer = new MutationObserver(() => {
    // Oyun ekranı açıldığında chat dinleyicisini ekle
    if (gameContainer.style.display !== "none" && roomRef) {
      addChatListeners();
    }
  });
  observer.observe(gameContainer, { attributes: true, attributeFilter: ["style"] });
});
