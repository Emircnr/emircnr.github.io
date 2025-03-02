<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <!-- Mobil cihazlarda uygun ölçeklendirme ve görünüm için -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Global Conquest - Online</title>

  <!-- Google Fonts: Orbitron (başlıklar), Montserrat (metinler) -->
  <link
    href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Montserrat:wght@300;500;700&display=swap"
    rel="stylesheet"
  />

  <!-- Leaflet CSS (Harita için) -->
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    crossorigin=""
  />

  <!-- Leaflet Pattern Plugin (Bayrak resmiyle pattern dolgusu) -->
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet-pattern/dist/leaflet.pattern.css"
  />

  <!-- FontAwesome -->
  <link
    rel="stylesheet"
    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
    crossorigin="anonymous"
    referrerpolicy="no-referrer"
  />

  <!-- Animate.css (Animasyonlar için) -->
  <link
    rel="stylesheet"
    href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css"
  />

  <style>
    /*******************************************************
     * GENEL SIFIRLAMA & YAZI AİLELERİ
     *******************************************************/
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: "Montserrat", sans-serif;
      background: radial-gradient(circle at top left, #191c1e 0%, #131516 100%);
      color: #eeeeee;
      overflow-x: hidden;
      transition: background 0.5s;
    }
    h1,
    h2,
    h3,
    h4 {
      font-family: "Orbitron", sans-serif;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    a {
      text-decoration: none;
      color: inherit;
    }
    button {
      cursor: pointer;
    }

    /*******************************************************
     * SAYFA GÖRÜNÜMLERİ (Auth, Profile, Game)
     *******************************************************/
    /* Ortak container stilleri */
    .container-page {
      display: none; /* JS ile aktif edildiğinde block/flex */
      min-height: 100vh;
    }

    /* -- AUTH (Giriş/Kayıt) -- */
    #auth-container {
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #150f2f 0%, #1b1638 45%, #222 100%);
    }
    #auth-wrapper {
      width: 90%;
      max-width: 450px;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 20px;
      padding: 30px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(6px);
      animation: fadeInUp 0.8s ease forwards;
    }
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(50px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    #auth-wrapper h1 {
      text-align: center;
      color: #64ffda;
      font-size: 30px;
      margin-bottom: 20px;
      text-shadow: 0 0 8px rgba(100, 255, 218, 0.4);
    }
    .auth-tabs {
      display: flex;
      margin-bottom: 20px;
    }
    .auth-tab {
      flex: 1;
      text-align: center;
      padding: 10px 0;
      cursor: pointer;
      font-weight: 600;
      color: #eee;
      border-bottom: 2px solid transparent;
      transition: border-color 0.3s;
    }
    .auth-tab.active {
      color: #64ffda;
      border-color: #64ffda;
    }

    .auth-form {
      margin-bottom: 15px;
    }
    .auth-form input[type="text"],
    .auth-form input[type="email"],
    .auth-form input[type="password"] {
      width: 100%;
      padding: 12px;
      margin-bottom: 15px;
      border: 1px solid #444;
      border-radius: 6px;
      font-size: 16px;
      outline: none;
      color: #333;
      transition: box-shadow 0.3s, border-color 0.3s;
    }
    .auth-form input:focus {
      border-color: #64ffda;
      box-shadow: 0 0 8px #64ffda;
    }
    .auth-form button {
      width: 100%;
      padding: 14px;
      margin-bottom: 15px;
      background: linear-gradient(to right, #64ffda, #00c9ff);
      border: 1px solid #00adb5;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 600;
      color: #000;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s, box-shadow 0.3s;
    }
    .auth-form button:hover {
      transform: scale(1.03);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.7);
    }

    /* -- PROFILE -- */
    #profile-container {
      display: flex;
      flex-direction: column;
      background: linear-gradient(135deg, #342f2e 0%, #1b1638 45%, #222 100%);
      padding: 20px;
    }
    #profile-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 10px;
      padding: 15px;
      margin-bottom: 20px;
    }
    #profile-header h2 {
      font-size: 24px;
      color: #64ffda;
      margin: 0;
    }
    #profile-header .profile-buttons {
      display: flex;
      align-items: center;
    }
    #profile-header .profile-buttons button {
      padding: 10px 16px;
      margin-left: 10px;
      font-size: 14px;
      color: #000;
      border: none;
      border-radius: 6px;
      background: linear-gradient(135deg, #64ffda, #00c9ff);
      transition: transform 0.3s;
    }
    #profile-header .profile-buttons button:hover {
      transform: scale(1.03);
    }

    #profile-content {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
    }
    /* Arkadaş listesi, istekler, davetler, vb. */
    .friends-section,
    .friend-requests-section,
    .add-friend-section,
    .room-invites-section,
    .active-rooms-section,
    .create-room-section {
      flex: 1;
      min-width: 280px;
      background: rgba(0, 0, 0, 0.25);
      padding: 15px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }
    .friends-section h3,
    .friend-requests-section h3,
    .add-friend-section h3,
    .room-invites-section h3,
    .active-rooms-section h3,
    .create-room-section h3 {
      color: #f7df1e;
      margin-bottom: 10px;
      text-transform: uppercase;
      font-size: 16px;
    }
    .friend-list,
    .friend-request-list,
    .room-invite-list,
    #active-rooms-list {
      max-height: 240px;
      overflow-y: auto;
    }
    .friend-item,
    .friend-request-item,
    .room-invite-item {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      margin-bottom: 10px;
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 14px;
    }
    .friend-item span.online-status {
      font-weight: bold;
      margin-left: 6px;
      color: #41ff9e; /* Çevrimiçi */
    }
    .friend-item span.offline-status {
      font-weight: bold;
      margin-left: 6px;
      color: #ff7171; /* Çevrimdışı */
    }
    .friend-request-item button,
    .room-invite-item button {
      margin-left: 8px;
      padding: 5px 10px;
      font-size: 12px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      transition: background 0.3s;
    }
    .accept-friend-btn {
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      color: #fff;
    }
    .reject-friend-btn {
      background: linear-gradient(135deg, #c0392b, #e74c3c);
      color: #fff;
    }
    .remove-friend-btn {
      background: linear-gradient(135deg, #e74c3c, #c0392b);
      color: #fff;
      padding: 5px 8px;
      font-size: 12px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
    }

    /* Arkadaş ekleme formu */
    .add-friend-section input[type="text"] {
      width: 100%;
      padding: 10px;
      margin-bottom: 10px;
      border: 1px solid #444;
      border-radius: 6px;
      outline: none;
      color: #333;
      transition: box-shadow 0.3s, border-color 0.3s;
    }
    .add-friend-section input[type="text"]:focus {
      border-color: #64ffda;
      box-shadow: 0 0 8px #64ffda;
    }
    .add-friend-section button {
      width: 100%;
      padding: 12px;
      margin-bottom: 5px;
      background: linear-gradient(to right, #64ffda, #00c9ff);
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      color: #000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s, box-shadow 0.3s;
      cursor: pointer;
    }
    .add-friend-section button:hover {
      transform: scale(1.03);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.7);
    }

    /* Oda Davetleri */
    .room-invites-section .room-invite-item div button {
      margin-left: 8px;
    }

    /* Oda Kurma Bölümü (yeni) */
    .create-room-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .create-room-section input[type="text"] {
      width: 100%;
      padding: 10px;
      border: 1px solid #444;
      border-radius: 6px;
      outline: none;
      color: #333;
      transition: box-shadow 0.3s, border-color 0.3s;
    }
    .create-room-section input:focus {
      border-color: #64ffda;
      box-shadow: 0 0 8px #64ffda;
    }
    .create-room-section select {
      width: 100%;
      min-height: 50px;
      padding: 6px;
      border: 1px solid #444;
      border-radius: 6px;
      outline: none;
      color: #333;
    }
    .create-room-section button {
      width: 100%;
      padding: 12px;
      background: linear-gradient(to right, #ffa72b, #ffc107);
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      color: #000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s, box-shadow 0.3s;
      cursor: pointer;
      margin-top: 5px;
    }
    .create-room-section button:hover {
      transform: scale(1.03);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.7);
    }

    /* Aktif Odalar */
    .active-rooms-section .active-room-item {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      margin-bottom: 10px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .active-rooms-section .active-room-item button {
      padding: 6px 12px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 13px;
      margin-right: 5px;
    }
    .btn-join-room {
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      color: #fff;
    }
    .btn-watch-room {
      background: linear-gradient(135deg, #3498db, #5dade2);
      color: #fff;
    }

    /*******************************************************
     * BİLDİRİMLER (Kısa Süreli Popup)
     *******************************************************/
    #notification-area {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 3000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: flex-end;
    }
    .notification-item {
      min-width: 200px;
      max-width: 380px;
      background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(0,0,0,0.5));
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.8);
      font-size: 16px;
      line-height: 1.4;
      opacity: 0;
      transform: translateX(100%);
      animation: slideIn 0.5s forwards, fadeOut 0.5s 5.5s forwards;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    @keyframes slideIn {
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    @keyframes fadeOut {
      to {
        opacity: 0;
        transform: translateX(100%);
      }
    }

    /*******************************************************
     * OYUN EKRANI GENEL
     *******************************************************/
    #game-container {
      display: none;
      height: 100vh;
      background: radial-gradient(circle at center, #0f0f0f 0%, #000 80%);
      position: relative;
      overflow: hidden;
    }
    #map-container {
      width: 100%;
      height: 100%;
      position: relative;
    }
    #map {
      width: 100%;
      height: 100%;
      background-color: #0c2022;
    }
    .toggle-info-cards {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1100;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      transition: background 0.3s, transform 0.3s;
    }
    .toggle-info-cards:hover {
      background: rgba(0, 0, 0, 0.8);
      transform: scale(1.05);
    }

    /*******************************************************
     * ÜST BİLGİ (TUR, ODA KODU, SIRA) + BAŞLAT BUTONU
     *******************************************************/
    #top-info {
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 3000;
      background: rgba(0, 0, 0, 0.65);
      padding: 8px 16px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      gap: 15px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    }
    #top-info p {
      margin: 0;
      font-size: 15px;
      color: #eee;
    }
    #top-info p span {
      font-weight: 600;
      color: #64ffda;
    }
    #end-turn-btn {
      background: linear-gradient(135deg, #ff9966, #ff5e62);
      border: none;
      border-radius: 6px;
      font-size: 14px;
      color: #fff;
      padding: 8px 12px;
      cursor: pointer;
      transition: transform 0.3s, box-shadow 0.3s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #end-turn-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 0 10px rgba(255, 150, 120, 0.6);
    }
    #turn-timer {
      font-size: 14px;
      color: #f39c12;
      background: rgba(0, 0, 0, 0.5);
      padding: 3px 8px;
      border-radius: 4px;
    }
    #start-game-btn {
      background: linear-gradient(135deg, #9be15d, #00e3ae);
      border: none;
      border-radius: 6px;
      font-size: 14px;
      color: #000;
      padding: 8px 12px;
      cursor: pointer;
      transition: transform 0.3s;
      display: none;
    }
    #start-game-btn:hover {
      transform: scale(1.05);
    }
    #start-countdown {
      font-size: 16px;
      color: #f39c12;
      display: none;
    }

    /*******************************************************
     * ALT BUTONLAR (CHAT, MARKET, PAKT, vs.)
     *******************************************************/
    #bottom-icons {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 20px;
      z-index: 3000;
    }
    .bottom-icon-btn {
      width: 50px;
      height: 50px;
      border: none;
      border-radius: 50%;
      background: linear-gradient(135deg, #64ffda, #00c9ff);
      color: #000;
      font-size: 20px;
      cursor: pointer;
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.6);
      transition: transform 0.3s, box-shadow 0.3s;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    }
    .bottom-icon-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.8);
    }
    /* Chat Badge (Mesaj Bildirimi) */
    .bottom-icon-btn[data-badge]:after {
      content: attr(data-badge);
      position: absolute;
      top: -5px;
      right: -5px;
      background: #ff4b4b;
      color: white;
      border-radius: 50%;
      min-width: 20px;
      min-height: 20px;
      padding: 2px 6px;
      text-align: center;
      font-size: 12px;
      pointer-events: none;
    }
    #exit-room-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ff5d5d, #ff2d2d);
      border: none;
      border-radius: 6px;
      font-size: 14px;
      color: #fff;
      padding: 10px 16px;
      cursor: pointer;
      transition: transform 0.3s, box-shadow 0.3s;
      z-index: 3000;
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.5);
    }
    #exit-room-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 18px rgba(255, 45, 45, 0.7);
    }

    /*******************************************************
     * LEAFLET TOOLTIP
     *******************************************************/
    .leaflet-tooltip {
      background: transparent;
      border: none;
      font-family: "Montserrat", sans-serif;
      font-size: 13px;
    }
    .country-popup-tooltip {
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 6px 10px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      text-align: left;
    }

    /*******************************************************
     * GENEL POPUP TASARIM (Modern Cam Görünümü)
     *******************************************************/
    .modern-popup {
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 460px;
      max-height: 70vh;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      display: none;
      flex-direction: column;
      z-index: 3002;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.8);
      animation: popupFadeIn 0.5s ease forwards;
    }
    @keyframes popupFadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .modern-popup .popup-header {
      background: rgba(0, 0, 0, 0.6);
      padding: 15px;
      border-top-left-radius: 14px;
      border-top-right-radius: 14px;
      color: #64ffda;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 18px;
      cursor: pointer;
      text-transform: uppercase;
    }
    .modern-popup .popup-header button {
      background: transparent;
      border: none;
      color: #fff;
      font-size: 24px;
      cursor: pointer;
    }
    .modern-popup .popup-content {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      color: #eee;
      font-size: 15px;
      position: relative;
    }
    .modern-popup .popup-content h3 {
      font-size: 16px;
      color: #f7df1e;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .modern-popup .popup-content button {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #64ffda, #00c9ff);
      border: none;
      border-radius: 6px;
      font-size: 16px;
      color: #000;
      cursor: pointer;
      transition: transform 0.3s, box-shadow 0.3s;
      margin-bottom: 15px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
    }
    .modern-popup .popup-content button:hover {
      transform: scale(1.02);
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.6);
    }
    .modern-popup .popup-content input[type="number"],
    .modern-popup .popup-content input[type="text"],
    .modern-popup .popup-content select {
      width: 100%;
      padding: 10px;
      margin-bottom: 10px;
      border: 1px solid #333;
      border-radius: 6px;
      font-size: 14px;
      color: #000;
      outline: none;
    }

    /*******************************************************
     * CHAT POPUP (Genel + Özel)
     *******************************************************/
    .chat-popup {
      width: 460px;
      max-height: 70vh;
      display: none;
      flex-direction: column;
      z-index: 3001;
    }
    .chat-header {
      background: rgba(0, 0, 0, 0.6);
      padding: 15px;
      border-top-left-radius: 14px;
      border-top-right-radius: 14px;
      color: #64ffda;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 18px;
      cursor: pointer;
      text-transform: uppercase;
    }
    .chat-header button {
      background: transparent;
      border: none;
      color: #fff;
      font-size: 24px;
      cursor: pointer;
    }
    .chat-messages {
      flex: 1;
      padding: 15px;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.2);
      color: #eee;
      font-size: 15px;
    }
    .chat-input-container {
      display: flex;
      border-top: 1px solid #444;
    }
    .chat-input-container input[type="text"] {
      flex: 1;
      padding: 15px;
      border: none;
      outline: none;
      background: #1e1e1e;
      color: #eee;
      font-size: 15px;
    }
    .chat-input-container button {
      padding: 15px;
      background: linear-gradient(135deg, #64ffda, #00c9ff);
      border: none;
      cursor: pointer;
      color: #000;
      font-size: 18px;
    }
    .chat-private-container {
      border-top: 1px solid #444;
      background: rgba(0, 0, 0, 0.3);
      padding: 15px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .chat-private-container h4 {
      color: #f7df1e;
      margin: 0 0 4px;
      text-transform: uppercase;
      font-size: 14px;
    }
    .chat-private-container select,
    .chat-private-container input[type="text"] {
      padding: 10px;
      border: 1px solid #333;
      border-radius: 6px;
      outline: none;
      background: #fafafa;
      font-size: 14px;
      color: #000;
    }
    .chat-private-container button {
      padding: 10px;
      background: linear-gradient(135deg, #a1ffce, #faffd1);
      border: none;
      cursor: pointer;
      color: #000;
      align-self: flex-end;
      font-size: 16px;
      border-radius: 6px;
      transition: transform 0.3s, box-shadow 0.3s;
    }
    .chat-private-container button:hover {
      transform: scale(1.02);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
    }

    /*******************************************************
     * PAKT POPUP
     *******************************************************/
    #pact-popup {
      width: 460px;
      max-height: 70vh;
      display: none;
      flex-direction: column;
      z-index: 3002;
    }
    #pact-popup-header {
      background: rgba(0, 0, 0, 0.6);
      padding: 15px;
      border-top-left-radius: 14px;
      border-top-right-radius: 14px;
      color: #64ffda;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 18px;
      cursor: pointer;
      text-transform: uppercase;
    }
    #pact-popup .popup-content h3 {
      color: #f7df1e;
      margin-bottom: 10px;
      text-transform: uppercase;
      font-size: 16px;
    }
    .pact-offer-item {
      background: rgba(0, 0, 0, 0.35);
      padding: 12px;
      margin-bottom: 12px;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .pact-offer-item button {
      padding: 8px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: transform 0.3s;
    }
    .pact-offer-item button:hover {
      transform: scale(1.05);
    }
    .pact-offer-item .accept-btn {
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      color: #fff;
    }
    .pact-offer-item .reject-btn {
      background: linear-gradient(135deg, #c0392b, #e74c3c);
      color: #fff;
    }
    .active-pact-item {
      background: rgba(0, 0, 0, 0.3);
      padding: 10px;
      border-radius: 5px;
      margin-bottom: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    /*******************************************************
     * MARKET POPUP (Ticaret Merkezi)
     *******************************************************/
    .market-popup {
      width: 480px;
      max-height: 70vh;
      display: none;
      flex-direction: column;
      z-index: 3002;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.8);
      animation: popupFadeIn 0.5s ease forwards;
    }
    .market-header {
      background: rgba(0, 0, 0, 0.6);
      padding: 15px;
      border-top-left-radius: 14px;
      border-top-right-radius: 14px;
      color: #64ffda;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 18px;
      cursor: pointer;
      text-transform: uppercase;
    }
    .market-header button {
      background: transparent;
      border: none;
      color: #fff;
      font-size: 24px;
      cursor: pointer;
    }
    .market-content {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      color: #eee;
    }
    .market-section {
      margin-bottom: 20px;
      background: rgba(0, 0, 0, 0.25);
      padding: 15px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    }
    .market-section h3 {
      font-size: 15px;
      margin-bottom: 10px;
      color: #f7df1e;
      text-transform: uppercase;
    }
    .offer-item {
      background: rgba(0, 0, 0, 0.3);
      margin-bottom: 12px;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /*******************************************************
     * OYUNCULAR POPUP (SOL TARAFTA)
     *******************************************************/
    #players-popup {
      position: fixed;
      bottom: 80px;
      left: 20px;
      width: 460px;
      max-height: 70vh;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      display: none;
      flex-direction: column;
      z-index: 3002;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.8);
      animation: popupFadeIn 0.5s ease forwards;
    }
    #players-popup .popup-header {
      background: rgba(0, 0, 0, 0.6);
      padding: 15px;
      border-top-left-radius: 14px;
      border-top-right-radius: 14px;
      color: #64ffda;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 18px;
      cursor: pointer;
      text-transform: uppercase;
    }
    #players-popup .popup-content {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      color: #eee;
      font-size: 15px;
      background: rgba(0, 0, 0, 0.2);
    }
    /* --- Oyuncu listesi öğesi --- */
    #players-popup .popup-content .player-info {
      background: rgba(0, 0, 0, 0.3);
      padding: 12px;
      margin-bottom: 12px;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      font-size: 15px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    /*******************************************************
     * BAYRAK DÜZENLEYİCİ (Flag Editor) POPUP
     *******************************************************/
    #flag-editor-popup {
      width: 480px;
      max-height: 80vh;
      display: none;
      flex-direction: column;
      z-index: 3003;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.8);
      animation: popupFadeIn 0.5s ease forwards;
      right: 50%;
      bottom: 50%;
      transform: translate(50%, -50%);
    }

    /*******************************************************
     * RESPONSIVE (Mobil)
     *******************************************************/
    @media screen and (max-width: 768px) {
      /* Auth */
      #auth-wrapper {
        width: 90%;
      }

      /* Profile */
      #profile-content {
        flex-direction: column;
      }

      /* Üst Bilgi */
      #top-info {
        flex-direction: column;
        gap: 8px;
      }
      #top-info p {
        font-size: 14px;
      }

      /* Alt Butonlar */
      #bottom-icons {
        gap: 10px;
      }
      .bottom-icon-btn {
        width: 44px;
        height: 44px;
        font-size: 16px;
      }
      /* Odadan Çık Butonu */
      #exit-room-btn {
        bottom: 85px;
        right: 20px;
        font-size: 13px;
        padding: 8px 12px;
      }
      /* Popup'lar */
      .modern-popup,
      .chat-popup,
      .market-popup,
      #pact-popup,
      #players-popup,
      #flag-editor-popup {
        width: 90% !important;
        left: 5% !important;
        right: auto !important;
        bottom: 90px;
        transform: none !important;
      }
    }
  </style>
</head>

<body>
  <!-- =============== 1. Giriş / Kayıt Ekranı =============== -->
  <div id="auth-container" class="container-page">
    <div id="auth-wrapper" class="animate__animated animate__fadeIn">
      <h1>GLOBAL CONQUEST</h1>

      <!-- Sekme başlıkları: Giriş - Kayıt -->
      <div class="auth-tabs">
        <div id="login-tab" class="auth-tab active">Giriş Yap</div>
        <div id="register-tab" class="auth-tab">Kayıt Ol</div>
      </div>

      <!-- Giriş Formu -->
      <div id="login-form" class="auth-form">
        <input type="email" id="login-email" placeholder="E-Posta" />
        <input type="password" id="login-password" placeholder="Şifre" />
        <button id="login-btn">Giriş Yap</button>
      </div>

      <!-- Kayıt Formu -->
      <div id="register-form" class="auth-form" style="display:none;">
        <input type="email" id="register-email" placeholder="E-Posta" />
        <input type="password" id="register-password" placeholder="Şifre" />
        <input
          type="password"
          id="register-confirm-password"
          placeholder="Şifre Tekrar"
        />
        <input
          type="text"
          id="register-display-name"
          placeholder="Kullanıcı Adı (Profil Adı)"
        />
        <button id="register-btn">Kayıt Ol</button>
      </div>
    </div>
  </div>

  <!-- =============== 2. Profil Ekranı (Arkadaşlar, İstekler, Davetler, Oda Kurma, Aktif Odalar) =============== -->
  <div id="profile-container" class="container-page">
    <!-- Üst profil bar -->
    <div id="profile-header">
      <h2 id="profile-username">Kullanıcı Adınız</h2>
      <div class="profile-buttons">
        <button id="edit-flag-btn" style="background: linear-gradient(135deg, #ffc107, #fdf7d8); color: #000;">
          Bayrak Düzenle
        </button>
        <button id="profile-logout-btn" style="background: linear-gradient(135deg, #ff5d5d, #ff2d2d); color: #fff;">
          Çıkış Yap
        </button>
      </div>
    </div>

    <div id="profile-content">
      <!-- Arkadaşlar -->
      <div class="friends-section">
        <h3>Arkadaşlar</h3>
        <div class="friend-list" id="friend-list"></div>
      </div>

      <!-- Arkadaş İstekleri -->
      <div class="friend-requests-section">
        <h3>Gelen İstekler</h3>
        <div class="friend-request-list" id="friend-request-list"></div>
      </div>

      <!-- Oda Davetleri -->
      <div class="room-invites-section">
        <h3>Gelen Oda Davetleri</h3>
        <div class="room-invite-list" id="room-invite-list"></div>
      </div>

      <!-- Arkadaş Ekleme -->
      <div class="add-friend-section">
        <h3>Arkadaş Ekle</h3>
        <input type="text" id="add-friend-username" placeholder="Kullanıcı Adı" />
        <button id="send-friend-request-btn">İstek Gönder</button>
      </div>

      <!-- Oda Kurma (Yeni) -->
      <div class="create-room-section">
        <h3>Oda Kur</h3>
        <input type="text" id="room-name-input" placeholder="Oda Adı" />
        <select id="room-invite-friends" multiple></select>
        <button id="create-room-btn">Odayı Kur</button>
      </div>

      <!-- Aktif Odalar Listesi -->
      <div class="active-rooms-section">
        <h3>Aktif Odalar</h3>
        <div id="active-rooms-list"></div>
      </div>
    </div>
  </div>

  <!-- =============== BİLDİRİM ALANI (Kısa Süreli) =============== -->
  <div id="notification-area"></div>

  <!-- =============== 3. Oyun Ekranı =============== -->
  <div id="game-container">
    <!-- Üst Bilgi (Tur, Oda Kodu, Sıra, Başlat vb.) -->
    <div id="top-info">
      <p>
        Oda: <span id="display-room-name">-</span> |
        Tur: <span id="current-round">1</span> |
        Sıra: <span id="current-player">?</span>
      </p>
      <button id="end-turn-btn">
        <i class="fas fa-forward"></i> Tur Sonu
        <span id="turn-timer">60s</span>
      </button>
      <!-- Oyun Başlat (Sadece Host görür) -->
      <button id="start-game-btn">Oyunu Başlat</button>
      <!-- 30 Saniye Geri Sayım -->
      <span id="start-countdown">30</span>
    </div>

    <!-- Harita Alanı -->
    <div id="map-container">
      <div id="map"></div>
      <!-- Bilgi Kartları Aç/Kapa -->
      <button id="toggle-info-cards" class="toggle-info-cards">
        <i class="fas fa-eye-slash"></i>
      </button>
    </div>

    <!-- Odadan Çık -->
    <button id="exit-room-btn">Odadan Çık</button>

    <!-- Alt İkonlar (Chat, Market, vb.) -->
    <div id="bottom-icons">
      <button
        id="open-players-btn"
        class="bottom-icon-btn"
        title="Oyuncular"
      >
        <i class="fas fa-users"></i>
      </button>
      <button
        id="open-military-btn"
        class="bottom-icon-btn"
        title="Asker İşlemleri"
      >
        <i class="fas fa-shield-alt"></i>
      </button>
      <button
        id="open-building-btn"
        class="bottom-icon-btn"
        title="Bina Kurma"
      >
        <i class="fas fa-building"></i>
      </button>
      <button
        id="open-resource-btn"
        class="bottom-icon-btn"
        title="Kaynak Gönderme"
      >
        <i class="fas fa-hand-holding-usd"></i>
      </button>
      <button
        id="open-market-btn"
        class="bottom-icon-btn"
        data-badge=""
        title="Ticaret Merkezi"
      >
        <i class="fas fa-store"></i>
      </button>
      <button
        id="open-pact-btn"
        class="bottom-icon-btn"
        title="Saldırmazlık Pakti"
      >
        <i class="fas fa-handshake"></i>
      </button>
      <button
        id="open-chat-btn"
        class="bottom-icon-btn"
        data-badge=""
        title="Sohbet"
      >
        <i class="fas fa-comments"></i>
      </button>
      <button
        id="open-notifications-btn"
        class="bottom-icon-btn"
        title="Bildirimler"
      >
        <i class="fas fa-bell"></i>
      </button>
    </div>
  </div>

  <!-- =============== ASKER İŞLEMLERİ POPUP =============== -->
  <div id="military-popup" class="modern-popup">
    <div class="popup-header" id="military-popup-header">
      <span>Asker İşlemleri</span>
      <button id="close-military-btn">&times;</button>
    </div>
    <div class="popup-content">
      <h3>Saldırı</h3>
      <p style="font-size:14px; color:#ddd;">
        - Hedef ülkeyi haritadan seçin <br />
        - Gönderilecek asker sayısı girin (1 asker = 1 varil petrol)
      </p>
      <input
        type="number"
        id="attack-soldiers"
        placeholder="Asker sayısı"
        min="1"
      />
      <button id="attack-btn">
        <i class="fas fa-crosshairs"></i> Saldırı Yap
      </button>

      <h3>Asker Satın Al</h3>
      <p style="font-size:14px; color:#ddd;">
        (1 Asker = 10$ + 25 Buğday)
      </p>
      <input
        type="number"
        id="soldiers-to-buy"
        placeholder="Adet"
        min="1"
      />
      <button id="buy-soldiers-btn">
        <i class="fas fa-user-plus"></i> Satın Al
      </button>

      <h3>Asker Çek</h3>
      <input
        type="number"
        id="pull-soldiers-count"
        placeholder="Asker sayısı"
        min="1"
      />
      <button id="pull-soldiers-btn">
        <i class="fas fa-running"></i> Asker Çek
      </button>

      <h3>Askeri Destek Gönder</h3>
      <p style="font-size:14px; color:#ddd;">
        - Başka oyuncunun ülkesine asker desteği
      </p>
      <label for="support-recipient" style="font-size:14px; color:#ccc;"
        >Oyuncu Seç:</label
      >
      <select id="support-recipient"></select>
      <label for="support-recipient-country" style="font-size:14px; color:#ccc;"
        >Ülke Seç:</label
      >
      <select id="support-recipient-country"></select>
      <input
        type="number"
        id="support-soldiers"
        placeholder="Asker sayısı"
        min="1"
      />
      <button id="send-support-btn">
        <i class="fas fa-hands-helping"></i> Destek Gönder
      </button>
    </div>
  </div>

  <!-- =============== BİNA KURMA POPUP =============== -->
  <div id="building-popup" class="modern-popup">
    <div class="popup-header" id="building-popup-header">
      <span>Bina Kurma</span>
      <button id="close-building-btn">&times;</button>
    </div>
    <div class="popup-content">
      <h3>Kışla Kur</h3>
      <p style="font-size:14px; color:#ddd;">
        (1 Kışla = 300$ + 50 Varil + 120 Buğday)
      </p>
      <input
        type="number"
        id="barracks-quantity"
        placeholder="Adet"
        min="1"
      />
      <button id="buy-barracks-btn">
        <i class="fas fa-fort-awesome"></i> Kışla Kur
      </button>

      <h3>Fabrika Kur</h3>
      <p style="font-size:14px; color:#ddd;">
        (1 Fabrika = 500$ + 130 Varil)
      </p>
      <input
        type="number"
        id="factory-quantity"
        placeholder="Adet"
        min="1"
      />
      <button id="build-factory-btn">
        <i class="fas fa-industry"></i> Fabrika Kur
      </button>

      <h3>Rafine Kur</h3>
      <p style="font-size:14px; color:#ddd;">
        (1 Rafine = 800$ + 250 Varil)
      </p>
      <input
        type="number"
        id="refinery-quantity"
        placeholder="Adet"
        min="1"
      />
      <button id="build-refinery-btn">
        <i class="fas fa-oil-can"></i> Rafine Kur
      </button>

      <h3>Değirmen Kur</h3>
      <p style="font-size:14px; color:#ddd;">
        (1 Değirmen = 200$ + 100 Varil)
      </p>
      <input
        type="number"
        id="grainmill-quantity"
        placeholder="Adet"
        min="1"
      />
      <button id="build-grainmill-btn">
        <i class="fas fa-wheat-awn"></i> Değirmen Kur
      </button>

      <h3>Kale Kur</h3>
      <p style="font-size:14px; color:#ddd;">
        - (1 Kale = 1000$ + 1000 Varil + 1000 Buğday) <br/>
        - Ülkede yalnızca 1 kale kurulabilir <br/>
        - Kale, o ülkeye saldıran askerlerin %5'ini öldürür
      </p>
      <button id="build-castle-btn">
        <i class="fas fa-chess-rook"></i> Kale Kur
      </button>

      <h3>Kale Güçlendirme</h3>
      <p style="font-size:14px; color:#ddd;">
        - Her güçlendirme kale savunmasına +%5 ekler (Max %30) <br/>
        - İlk güçlendirme maliyeti: 1300$ + 1300 Varil + 1300 Buğday <br/>
        - Sonrakiler her defasında %30 artar
      </p>
      <p style="font-size:14px; color:#64ffda;">
        Mevcut / Sonraki Güçlendirme Fiyatı:
        <span id="castle-upgrade-cost-text">-</span>
      </p>
      <button id="upgrade-castle-btn">
        <i class="fas fa-arrow-up"></i> Kale Güçlendir
      </button>
    </div>
  </div>

  <!-- =============== KAYNAK GÖNDERME POPUP =============== -->
  <div id="resource-popup" class="modern-popup">
    <div class="popup-header" id="resource-popup-header">
      <span>Kaynak Gönder</span>
      <button id="close-resource-btn">&times;</button>
    </div>
    <div class="popup-content">
      <h3>Para Gönder</h3>
      <input
        type="number"
        id="money-to-send"
        placeholder="Miktar ($)"
        min="1"
      />
      <select id="recipient-player"></select>
      <button id="send-money-btn">
        <i class="fas fa-hand-holding-usd"></i> Para Gönder
      </button>

      <h3>Petrol Gönder</h3>
      <input
        type="number"
        id="petrol-to-send"
        placeholder="Varil"
        min="1"
      />
      <select id="recipient-player-petrol"></select>
      <button id="send-petrol-btn">
        <i class="fas fa-gas-pump"></i> Petrol Gönder
      </button>

      <h3>Buğday Gönder</h3>
      <input
        type="number"
        id="wheat-to-send"
        placeholder="Buğday"
        min="1"
      />
      <select id="recipient-player-wheat"></select>
      <button id="send-wheat-btn">
        <i class="fas fa-wheat-awn"></i> Buğday Gönder
      </button>
    </div>
  </div>

  <!-- =============== OYUNCULAR POPUP (SOL) =============== -->
  <div id="players-popup" class="modern-popup">
    <div class="popup-header" id="players-popup-header">
      <span>Oyuncu Bilgileri</span>
      <button id="close-players-btn">&times;</button>
    </div>
    <div class="popup-content" id="players-info">
      <!-- Oyuncu listesi buraya dinamik gelecek -->
    </div>
  </div>

  <!-- =============== CHAT POPUP =============== -->
  <div id="chat-popup" class="chat-popup modern-popup">
    <div class="chat-header" id="chat-popup-header">
      <span>Sohbet</span>
      <button id="close-chat-btn">&times;</button>
    </div>
    <div id="chat-messages" class="chat-messages"></div>
    <!-- Genel Sohbet Girişi -->
    <div class="chat-input-container">
      <input type="text" id="chat-input" placeholder="Mesajınızı yazın..." />
      <button id="send-chat-btn">
        <i class="fas fa-paper-plane"></i>
      </button>
    </div>
    <!-- Özel Mesaj Girişi -->
    <div class="chat-private-container">
      <h4>Özel Mesaj</h4>
      <select id="private-message-recipient"></select>
      <input
        type="text"
        id="private-message-input"
        placeholder="Özel mesajınız..."
      />
      <button id="send-private-message-btn">
        <i class="fas fa-user-secret"></i> Gönder
      </button>
    </div>
  </div>

  <!-- =============== SALDIRMAZLIK PAKTI POPUP =============== -->
  <div id="pact-popup" class="modern-popup">
    <div id="pact-popup-header" class="popup-header">
      <span>Saldırmazlık Pakti</span>
      <button id="close-pact-btn">&times;</button>
    </div>
    <div class="popup-content">
      <h3>Yeni Pakt Teklifi Gönder</h3>
      <select id="pact-offer-recipient"></select>
      <input
        type="number"
        id="pact-duration"
        placeholder="Tur sayısı (örn: 3)"
      />
      <input type="number" id="pact-cost" placeholder="Tek seferlik para ($)" />
      <button id="send-pact-offer-btn" style="margin-bottom: 15px;">
        Teklif Gönder
      </button>

      <h3>Gelen Teklifler</h3>
      <div id="pact-pending-offers"></div>

      <h3>Aktif Paktlarınız</h3>
      <div id="active-pacts-container"></div>
    </div>
  </div>

  <!-- =============== TİCARET POPUP (MARKET) =============== -->
  <div id="market-popup" class="market-popup modern-popup">
    <div class="market-header" id="market-popup-header">
      <h2>Ticaret Merkezi</h2>
      <button id="close-market-btn">&times;</button>
    </div>
    <div class="market-content">
      <div class="market-section">
        <h3>Yeni Teklif Oluştur</h3>
        <label style="font-size:14px;color:#ccc;"
          >Satmak istediğiniz ürün:</label
        ><br />
        <select id="trade-item-type">
          <option value="petrol">Petrol</option>
          <option value="wheat">Buğday</option>
        </select>
        <br /><br />

        <label style="font-size:14px;color:#ccc;"
          >Miktar (adet/varil/buğday):</label
        >
        <input
          type="number"
          id="trade-quantity"
          placeholder="Miktar"
          min="1"
        />

        <label style="font-size:14px;color:#ccc;">Birim Fiyat ($):</label>
        <input
          type="number"
          id="trade-price"
          placeholder="Birim Fiyat"
          min="1"
        />

        <label style="font-size:14px;color:#ccc;">Ambargo (Oyuncular):</label
        ><br />
        <select
          id="embargo-players"
          multiple
          style="width: 100%; min-height: 50px;"
        ></select>
        <small style="color:#ccc;"
          >(Seçtiğiniz oyuncular bu teklifi satın
          alamaz)</small
        >
        <br /><br />

        <button
          id="create-trade-offer-btn"
          style="font-size:15px;"
        >
          Teklifi Oluştur
        </button>
      </div>

      <div class="market-section offer-list">
        <h3>Mevcut Teklifler</h3>
        <div id="trade-offers-list"></div>
      </div>
    </div>
  </div>

  <!-- =============== BAYRAK DÜZENLEYİCİ POPUP =============== -->
  <div id="flag-editor-popup" class="modern-popup">
    <div class="popup-header" id="flag-editor-popup-header">
      <span>Bayrak Düzenleyici</span>
      <button id="close-flag-editor-btn">&times;</button>
    </div>
    <div class="popup-content" style="position: relative;">
      <canvas
        id="flag-canvas"
        width="400"
        height="300"
        style="border:1px solid #ccc; background:#fff; display:block; margin:0 auto;"
      ></canvas>

      <div style="text-align:center; margin-top:10px;">
        <label>Renk:</label>
        <input type="color" id="flag-color" value="#ff0000" />
        
        <label>Kalınlık:</label>
        <input type="range" id="flag-brush-size" min="1" max="20" value="5" />

        <button id="flag-erase-btn" style="margin-left:5px;">Silgi</button>
        <button id="flag-clear-btn" style="margin-left:5px;">Temizle</button>
      </div>

      <button id="save-flag-btn" style="margin-top:10px;">
        Kaydet
      </button>
    </div>
  </div>

  <!-- Leaflet JS (Harita) -->
  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    crossorigin=""
  ></script>
  
  <!-- Leaflet Pattern Plugin (Bayrak görselini polygon fill olarak kullanmak için) -->
  <script src="https://unpkg.com/leaflet-pattern/dist/leaflet.pattern.js"></script>

  <!-- Firebase (v9) -->
  <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js"></script>

  <!-- Yeni Oyun Kodları (gameLogic.js) - GÜNCELLEME SONRASI -->
  <script src="gameLogic.js"></script>
</body>
</html>
