/**
 * AmpPulse Firebase Configuration & Realtime Database Initialization
 * Project ID: amppulse-651f2
 */

const firebaseConfig = {
  apiKey: "AIzaSyDmfmyISq3XPBesUyJ_PjBijujBPGL-n-E",
  authDomain: "amppulse-651f2.firebaseapp.com",
  projectId: "amppulse-651f2",
  databaseURL: "https://amppulse-651f2-default-rtdb.firebaseio.com",
  storageBucket: "amppulse-651f2.firebasestorage.app",
  messagingSenderId: "371064960749",
  appId: "1:371064960749:web:c7185cb9e1b862ed28fee4",
  measurementId: "G-S0976GDN2Y"
};

// Global Firebase Realtime Database Instance
window.firebaseDb = null;

function initFirebaseApp() {
  if (typeof firebase !== 'undefined') {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      window.firebaseDb = firebase.database();
      console.log("[Firebase] Successfully connected to Firebase Realtime Database (amppulse-651f2)!");
    } catch (e) {
      console.warn("[Firebase] Initialization notice:", e.message);
    }
  } else {
    console.warn("[Firebase] SDK script not loaded yet.");
  }
}

// Auto-initialize when script loads
initFirebaseApp();
