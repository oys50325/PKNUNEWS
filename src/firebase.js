const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const realtimeDatabaseURL = normalizeDatabaseURL(
  import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://ps1news-default-rtdb.firebaseio.com/",
);

export const firebaseReady = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.appId,
);

let appPromise;
let servicesPromise;

const LOCAL_KEY = "ps1-news-netter-issues";
const USERS_KEY = "ps1-news-netter-users";
export const realtimeDatabaseReady = Boolean(realtimeDatabaseURL);

export function watchAuth(callback) {
  if (!firebaseReady) {
    callback(null);
    return () => {};
  }
  let unsubscribe = () => {};
  getServices().then(({ auth, authApi }) => {
    unsubscribe = authApi.onAuthStateChanged(auth, callback);
  });
  return () => unsubscribe();
}

export async function loginAdmin(email, password) {
  if (!firebaseReady) throw new Error("Firebase 환경변수가 아직 설정되지 않았습니다.");
  const { auth, authApi } = await getServices();
  return authApi.signInWithEmailAndPassword(auth, email, password);
}

export async function logoutAdmin() {
  if (!firebaseReady) return;
  const { auth, authApi } = await getServices();
  await authApi.signOut(auth);
}

export async function listIssues() {
  if (!firebaseReady) return readLocalIssues();
  const { db, firestoreApi } = await getServices();
  const snapshot = await firestoreApi.getDocs(
    firestoreApi.query(
      firestoreApi.collection(db, "newsletters"),
      firestoreApi.orderBy("publishedAt", "desc"),
    ),
  );
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listUsers() {
  if (!realtimeDatabaseReady) return readLocalUsers();
  const data = await readRealtime("users");
  if (!data) return [];
  return Object.entries(data).map(([id, user]) => ({ id, ...user }));
}

export async function saveUsers(users) {
  const cleanUsers = users.map((user) => ({
    ...user,
    id: user.id || crypto.randomUUID(),
  }));
  localStorage.setItem(USERS_KEY, JSON.stringify(cleanUsers));
  if (!realtimeDatabaseReady) return cleanUsers;
  const payload = Object.fromEntries(cleanUsers.map((user) => [user.id, stripUndefined(user)]));
  await writeRealtime("users", payload);
  return cleanUsers;
}

export async function publishIssue(issue) {
  if (!firebaseReady) return saveLocalIssue(issue);
  const { db, storage, firestoreApi, storageApi } = await getServices();
  await ensureSignedIn();

  const issueRef = await firestoreApi.addDoc(firestoreApi.collection(db, "newsletters"), {
    title: issue.title,
    edition: issue.edition,
    monthLabel: issue.monthLabel,
    summary: issue.summary,
    sections: issue.sections,
    events: issue.events,
    pageCount: issue.pages.length,
    createdAt: firestoreApi.serverTimestamp(),
    publishedAt: firestoreApi.serverTimestamp(),
    storageMode: "compressed-page-images",
  });

  const pages = [];
  for (let index = 0; index < issue.pages.length; index += 1) {
    const page = issue.pages[index];
    const storagePath = `issues/${issueRef.id}/page-${String(index + 1).padStart(2, "0")}.jpg`;
    const fileRef = storageApi.ref(storage, storagePath);
    await storageApi.uploadBytes(fileRef, page.blob, {
      contentType: "image/jpeg",
      cacheControl: "public,max-age=31536000,immutable",
    });
    pages.push({
      number: index + 1,
      url: await storageApi.getDownloadURL(fileRef),
      storagePath,
      width: page.width,
      height: page.height,
      size: page.blob.size,
    });
  }

  return { id: issueRef.id, ...issue, pages };
}

export async function removeIssue(issue) {
  if (!firebaseReady) {
    const next = readLocalIssues().filter((item) => item.id !== issue.id);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    return;
  }

  const { db, storage, firestoreApi, storageApi } = await getServices();
  await ensureSignedIn();
  await firestoreApi.deleteDoc(firestoreApi.doc(db, "newsletters", issue.id));
  if (issue.pages) {
    await Promise.allSettled(
      issue.pages.map((page) =>
        storageApi.deleteObject(
          storageApi.ref(storage, page.storagePath || `issues/${issue.id}/page-${String(page.number).padStart(2, "0")}.jpg`),
        ),
      ),
    );
  }
}

export async function deleteTemporaryPdf(path) {
  if (!firebaseReady || !path) return;
  const { storage, storageApi } = await getServices();
  await storageApi.deleteObject(storageApi.ref(storage, path));
}

async function getApp() {
  if (!appPromise) {
    appPromise = import("firebase/app").then(({ initializeApp }) => initializeApp(firebaseConfig));
  }
  return appPromise;
}

async function getServices() {
  if (!servicesPromise) {
    servicesPromise = Promise.all([
      getApp(),
      import("firebase/auth"),
      import("firebase/firestore"),
      import("firebase/storage"),
    ]).then(([app, authApi, firestoreApi, storageApi]) => ({
      auth: authApi.getAuth(app),
      db: firestoreApi.getFirestore(app),
      storage: storageApi.getStorage(app),
      authApi,
      firestoreApi,
      storageApi,
    }));
  }
  return servicesPromise;
}

async function ensureSignedIn() {
  const { auth, authApi } = await getServices();
  if (!auth.currentUser) {
    await authApi.signInAnonymously(auth);
  }
}

function readLocalIssues() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalIssue(issue) {
  const saved = {
    ...issue,
    id: crypto.randomUUID(),
    pages: issue.pages.map((page, index) => ({
      number: index + 1,
      url: page.url,
      width: page.width,
      height: page.height,
      size: page.blob.size,
    })),
    publishedAt: new Date().toISOString(),
  };
  const next = [saved, ...readLocalIssues()].slice(0, 12);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  return saved;
}

function readLocalUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

async function readRealtime(path) {
  const response = await fetch(`${realtimeDatabaseURL}/${path}.json`);
  if (!response.ok) throw new Error(`Realtime Database read failed: ${response.status}`);
  return response.json();
}

async function writeRealtime(path, value) {
  const response = await fetch(`${realtimeDatabaseURL}/${path}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(`Realtime Database write failed: ${response.status}`);
  return response.json();
}

function normalizeDatabaseURL(url) {
  return String(url || "").replace(/\/+$/, "");
}

function stripUndefined(value) {
  return JSON.parse(JSON.stringify(value));
}
