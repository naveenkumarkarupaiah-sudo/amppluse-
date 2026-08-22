// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDmfmyISq3XPBesUyJ_PjBijujBPGL-n-E",
    authDomain: "amppulse-651f2.firebaseapp.com",
    projectId: "amppulse-651f2",
    storageBucket: "amppulse-651f2.firebasestorage.app",
    messagingSenderId: "371064960749",
    appId: "1:371064960749:web:c7185cb9e1b862ed28fee4",
    measurementId: "G-S0976GDN2Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);