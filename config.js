// Your Firebase settings.
// Firebase console → Project settings → Your apps → network-web → "SDK setup and configuration" → Config.
// Replace the whole firebaseConfig block below with the one Firebase shows you.
// These values are safe to publish: your data is protected by the security rule in Firebase.

const firebaseConfig = {
  apiKey: "PASTE_FROM_FIREBASE",
  authDomain: "network-crm-37a56.firebaseapp.com",
  projectId: "network-crm-37a56",
  storageBucket: "network-crm-37a56.firebasestorage.app",
  messagingSenderId: "669921843150",
  appId: "PASTE_FROM_FIREBASE"
};

window.CRM_CONFIG = { firebase: firebaseConfig };
