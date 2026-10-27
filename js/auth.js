// كل كود Firebase هنا. يُهيَّأ مرة واحدة فقط.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

function emit(detail) {
  window.MaLast = detail;
  window.dispatchEvent(new CustomEvent("ma-auth", { detail }));
}

const configured = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && !String(firebaseConfig.apiKey).startsWith("PASTE");

if (!configured) {
  window.Ma = null;
  emit({ ready: false, user: null, profile: null });
} else {
  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    let busy = false;
    const pub = (u) => (u ? { uid: u.uid, email: u.email, displayName: u.displayName || "" } : null);

    async function loadProfile(u) {
      try {
        const s = await getDoc(doc(db, "users", u.uid));
        return s.exists() ? s.data() : null;
      } catch (e) {
        return null;
      }
    }

    // ينشئ ملف المستخدم إن لم يوجد. الدور دائمًا "customer".
    async function ensureProfile(u, name, wantsMerchant, lang) {
      const old = await loadProfile(u);
      if (old) return old;
      const fallback = String(u.email || "user").split("@")[0].slice(0, 60).padEnd(2, "_");
      await setDoc(doc(db, "users", u.uid), {
        uid: u.uid,
        displayName: String(name || u.displayName || fallback).trim().slice(0, 60),
        email: u.email,
        role: "customer",
        status: "active",
        lang: lang === "fr" ? "fr" : "ar",
        wantsMerchant: !!wantsMerchant,
        createdAt: serverTimestamp(),
      });
      return await loadProfile(u);
    }

    async function refresh() {
      const u = auth.currentUser;
      if (!u) return emit({ ready: true, user: null, profile: null });
      let p = await loadProfile(u);
      if (!p) {
        try { p = await ensureProfile(u, null, false, document.documentElement.lang); } catch (e) { p = null; }
      }
      emit({ ready: true, user: pub(u), profile: p });
    }

    window.Ma = {
      async register(name, email, password, wantsMerchant, lang) {
        busy = true;
        let err = null;
        try {
          const c = await createUserWithEmailAndPassword(auth, email, password);
          try { await updateProfile(c.user, { displayName: name }); } catch (e) {}
          await ensureProfile(c.user, name, wantsMerchant, lang);
        } catch (e) {
          err = e;
        } finally {
          busy = false;
        }
        await refresh();
        if (err) throw err;
      },
      async login(email, password) {
        await signInWithEmailAndPassword(auth, email, password);
      },
      async logout() {
        await signOut(auth);
      },
      async reset(email) {
        try {
          await sendPasswordResetEmail(auth, email);
        } catch (e) {
          if (e && e.code === "auth/user-not-found") return; // لا نكشف هل البريد مسجّل
          throw e;
        }
      },
      async saveProfile(name, lang) {
        const u = auth.currentUser;
        await updateDoc(doc(db, "users", u.uid), { displayName: name, lang: lang === "fr" ? "fr" : "ar" });
        try { await updateProfile(u, { displayName: name }); } catch (e) {}
        await refresh();
      },
    };

    onAuthStateChanged(auth, () => { if (!busy) refresh(); });
  } catch (e) {
    console.error("Firebase init failed", e);
    window.Ma = null;
    emit({ ready: false, user: null, profile: null });
  }
}
