/* ==========================================================
   IVOIR360 — Script
   Les comptes, les vidéos et les réglages du site sont
   enregistrés dans Supabase (voir supabase-config.js et
   supabase/schema.sql). Ils se gèrent depuis admin.html.
   ========================================================== */

const $ = (id) => document.getElementById(id);

let videos = [];
let currentUser = null;
let authKnown = false; // passe à true dès que Supabase a indiqué si quelqu'un est connecté
let videosLoaded = false; // évite d'afficher « Aucune vidéo » avant d'avoir reçu la liste
// Réglages modifiés depuis le tableau de bord (admin.html)
let settings = { categories: {}, content: {}, announcement: "" };
// Chaque page indique sa rubrique (<body data-category="Musique">) ; l'accueil affiche tout
const currentCategory = document.body.dataset.category || "Tout";

const categoryEnabled = (category) => settings.categories?.[category] !== false;

// ---------- Icônes ----------
const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  globe: '<svg class="site-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/></svg>',
  user: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  eye: '<svg class="icon" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg class="icon icon-eye-off" viewBox="0 0 24 24"><path d="M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 005.4-1.6"/><path d="M9.9 9.9a3 3 0 004.2 4.2M3 3l18 18"/></svg>',
  google: '<svg class="google-icon" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>'
};

// ---------- Analyse des liens ----------
function getYouTubeId(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/
  );
  return match ? match[1] : null;
}

function isDirectVideo(url) {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function timeAgo(date) {
  const days = Math.floor((Date.now() - date) / 86400000);
  if (days < 1) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

// ---------- Compteur de vues ----------
// Les vues sont enregistrées en ligne (service gratuit Abacus) pour être
// les mêmes pour tous les visiteurs.
const VIEWS_API = "https://abacus.jasoncameron.dev";
const VIEWS_NAMESPACE = "ivory360-com";
const viewRequests = {};

// Identifiant unique d'une vidéo pour le compteur
function viewKey(url) {
  const ytId = getYouTubeId(url);
  if (ytId) return "yt-" + ytId;
  let hash = 0;
  for (const c of url) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return "url-" + (hash >>> 0).toString(36);
}

function formatViews(n) {
  return `${n.toLocaleString("fr-FR")} vue${n > 1 ? "s" : ""}`;
}

// action "get" : lire le nombre de vues ; action "hit" : ajouter une vue
async function fetchViews(key, action) {
  try {
    const res = await fetch(`${VIEWS_API}/${action}/${VIEWS_NAMESPACE}/${key}`);
    if (res.status === 404) return 0; // vidéo encore jamais vue
    if (!res.ok) return null;
    return (await res.json()).value;
  } catch {
    return null;
  }
}

function getViews(key) {
  if (!viewRequests[key]) viewRequests[key] = fetchViews(key, "get");
  return viewRequests[key];
}

function showViews(key, value) {
  document.querySelectorAll(`[data-views="${key}"]`).forEach((el) => {
    if (value === null) el.parentElement.remove(); // service indisponible : on masque le compteur
    else el.textContent = formatViews(value);
  });
}

// Une vue est ajoutée à chaque ouverture de la vidéo
async function countView(key) {
  const value = await fetchViews(key, "hit");
  if (value === null) return getViews(key);
  viewRequests[key] = Promise.resolve(value);
  showViews(key, value);
  return value;
}

// ---------- Chargement des vidéos ----------
async function loadVideos() {
  const { data, error } = await db
    .from("videos")
    .select("*")
    .eq("status", "published")
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    toast("Impossible de charger les vidéos.");
    return;
  }
  videos = data;
  videosLoaded = true;
  document.documentElement.classList.add("videos-ready");
  renderVideos();
}

// ---------- Affichage des vidéos ----------
function renderVideos() {
  if (!videosLoaded) return; // liste pas encore reçue : on n'affiche ni cartes ni « Aucune vidéo »
  const grid = $("videoGrid");
  const search = $("searchInput").value.trim().toLowerCase();

  const list = videos.filter((v) => {
    const okCategory = currentCategory === "Tout"
      ? categoryEnabled(v.category)
      : v.category === currentCategory;
    const okSearch = !search || v.title.toLowerCase().includes(search);
    return okCategory && okSearch;
  });

  grid.innerHTML = "";
  $("emptyMsg").classList.toggle("hidden", list.length > 0);

  list.forEach((video) => {
    const ytId = getYouTubeId(video.url);
    const source = ytId ? "YouTube" : getDomain(video.url);
    const thumbnail = ytId
      ? `<img src="https://img.youtube.com/vi/${ytId}/hqdefault.jpg" alt="" loading="lazy">`
      : ICONS.globe;

    const card = document.createElement("article");
    card.className = "video-card";
    card.innerHTML = `
      <div class="thumb">
        ${thumbnail}
        <span class="play-btn">${ICONS.play}</span>
        <span class="badge">${escapeHtml(source)}</span>
        ${currentCategory === "Tout" ? `<span class="badge badge-category">${escapeHtml(categoryLabel(video.category))}</span>` : ""}
        ${video.featured ? '<span class="badge badge-featured">À la une</span>' : ""}
      </div>
      <div class="video-body">
        <h4>${escapeHtml(video.title)}</h4>
        <small>${ICONS.user} ${escapeHtml(video.author_name)} · ${timeAgo(Date.parse(video.created_at))}</small>
        <small class="views">${ICONS.eye} <span data-views="${viewKey(video.url)}">…</span></small>
      </div>`;
    card.addEventListener("click", () => openPlayer(video));
    grid.appendChild(card);

    const key = viewKey(video.url);
    getViews(key).then((value) => showViews(key, value));
  });
}

$("searchInput")?.addEventListener("input", renderVideos); // absent de partager.html

// ---------- Rubriques sur petit écran ----------
// La ligne d'onglets peut se faire glisser : la rubrique active est amenée dans la partie
// visible, et chaque bord ne s'estompe que s'il reste des onglets cachés de ce côté.
function setupTabs() {
  const tabs = document.querySelector(".tabs");
  if (!tabs) return;
  const update = () => {
    tabs.classList.toggle("has-before", tabs.scrollLeft > 4);
    tabs.classList.toggle("has-more", tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 4);
  };
  const active = tabs.querySelector(".tab.active");
  if (active) tabs.scrollLeft = active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2;
  tabs.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(tabs);
  update();
}

// ---------- Lecteur ----------
function openPlayer(video) {
  const frame = $("playerFrame");
  const ytId = getYouTubeId(video.url);

  if (ytId) {
    frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1"
      allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  } else if (isDirectVideo(video.url)) {
    frame.innerHTML = `<video src="${escapeHtml(video.url)}" controls autoplay></video>`;
  } else {
    // Les autres sites ne peuvent pas toujours être intégrés : on propose d'ouvrir le lien
    frame.innerHTML = ICONS.globe;
  }

  $("playerTitle").textContent = video.title;
  const meta = `${video.author_name} · ${categoryLabel(video.category)} · ${timeAgo(Date.parse(video.created_at))}`;
  $("playerMeta").textContent = meta;
  countView(viewKey(video.url)).then((value) => {
    if (value !== null && $("playerTitle").textContent === video.title) {
      $("playerMeta").textContent = `${meta} · ${formatViews(value)}`;
    }
  });
  $("playerDesc").textContent = video.description || "";
  $("playerLink").href = video.url;
  openModal("playerModal");
}

// ---------- Sexe et pays des membres ----------
// Champs ajoutés au formulaire d'inscription et à la fenêtre « Complétez votre profil »
function profileFields(prefix) {
  const genders = Object.entries(GENDER_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  const countries = COUNTRY_CODES
    .filter((code) => code !== "CI")
    .map((code) => [code, countryName(code)])
    .sort((a, b) => a[1].localeCompare(b[1], "fr"))
    .map(([code, name]) => `<option value="${code}">${escapeHtml(name)}</option>`).join("");

  return `
    <div class="field">
      <label for="${prefix}Gender">Sexe</label>
      <select id="${prefix}Gender" required>
        <option value="" disabled selected>Choisir</option>${genders}
      </select>
    </div>
    <div class="field">
      <label for="${prefix}Country">Pays</label>
      <select id="${prefix}Country" required>
        <option value="" disabled selected>Choisir un pays</option>
        <option value="CI">${escapeHtml(countryName("CI"))}</option>${countries}
      </select>
    </div>`;
}

$("signupError").insertAdjacentHTML("beforebegin", profileFields("signup"));

// Comptes Google ou créés avant l'ajout de ces champs : on demande de compléter le profil
document.body.insertAdjacentHTML("beforeend", `
  <div class="modal" id="profileModal">
    <div class="modal-box">
      <button class="close" data-close>&times;</button>
      <h3>Complétez votre profil</h3>
      <form id="profileForm">
        ${profileFields("profile")}
        <p class="error" id="profileError"></p>
        <button type="submit" class="btn btn-green btn-full">Enregistrer</button>
      </form>
    </div>
  </div>`);

$("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const gender = $("profileGender").value;
  const country = $("profileCountry").value;
  const { error } = await db.rpc("set_my_profile", { p_gender: gender, p_country: country });
  if (error) {
    $("profileError").textContent = "L'enregistrement a échoué. Réessayez dans un instant.";
    return;
  }
  Object.assign(currentUser, { gender, country });
  closeModal("profileModal");
  toast("Merci, votre profil est complet !");
});

// ---------- Fenêtres ----------
function openModal(id) {
  if (id === "loginModal" || id === "signupModal") loadGoogle();
  $(id).querySelectorAll(".error").forEach((el) => (el.textContent = ""));
  $(id).classList.add("open");
}

function closeModal(id) {
  $(id).classList.remove("open");
  if (id === "playerModal") $("playerFrame").innerHTML = ""; // arrête la vidéo
}

document.querySelectorAll("[data-open]").forEach((btn) =>
  btn.addEventListener("click", () => openModal(btn.dataset.open))
);

document.querySelectorAll("[data-switch]").forEach((link) =>
  link.addEventListener("click", (e) => {
    e.preventDefault();
    closeModal(link.closest(".modal").id);
    openModal(link.dataset.switch);
  })
);

document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.hasAttribute("data-close")) closeModal(modal.id);
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelectorAll(".modal.open").forEach((m) => closeModal(m.id));
});

// ---------- Mot de passe visible en survolant l'œil (fenêtres de connexion et d'inscription) ----------
function setupPasswordEyes() {
  document.querySelectorAll('.modal input[type="password"]').forEach((input) => {
    const wrap = document.createElement("div");
    wrap.className = "password-field";
    input.replaceWith(wrap);
    wrap.append(input);
    wrap.insertAdjacentHTML("beforeend",
      `<button type="button" class="password-eye" aria-label="Afficher le mot de passe">${ICONS.eye}${ICONS.eyeOff}</button>`);
    const eye = wrap.lastElementChild;

    const show = (visible) => {
      input.type = visible ? "text" : "password";
      eye.classList.toggle("on", visible);
      eye.setAttribute("aria-label", visible ? "Masquer le mot de passe" : "Afficher le mot de passe");
    };

    // Souris : visible tant que le pointeur est sur l'œil
    eye.addEventListener("mouseenter", () => show(true));
    eye.addEventListener("mouseleave", () => show(false));
    // Écran tactile (pas de survol) ou clavier : un appui affiche / masque
    let pointer = "mouse";
    eye.addEventListener("pointerdown", (e) => (pointer = e.pointerType));
    eye.addEventListener("click", (e) => {
      if (e.detail === 0 || pointer !== "mouse") show(input.type === "password");
    });
    // Toujours masqué à nouveau après l'envoi du formulaire
    input.form?.addEventListener("submit", () => show(false));
  });
}

function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(t.timer);
  t.timer = setTimeout(() => t.classList.remove("show"), 3000);
}

// ---------- Réglages du site ----------
async function loadSettings() {
  const { data, error } = await db.from("settings").select("key, value");
  if (error) return;
  data.forEach((row) => (settings[row.key] = row.value));
  applySettings();
}

function applySettings() {
  // Textes modifiés depuis le tableau de bord (éléments marqués data-content="...")
  document.querySelectorAll("[data-content]").forEach((el) => {
    const text = settings.content?.[el.dataset.content];
    if (text) el.textContent = text;
  });

  // Rubriques désactivées : liens masqués et page inaccessible
  Object.entries(CATEGORY_PAGES).forEach(([category, page]) => {
    const enabled = categoryEnabled(category);
    document.querySelectorAll(`a[href="${page}"]`).forEach((a) => a.classList.toggle("hidden", !enabled));
    const option = [...($("videoCategory")?.options || [])].find((o) => o.value === category);
    if (option) option.hidden = option.disabled = !enabled;
  });
  if (currentCategory !== "Tout" && !categoryEnabled(currentCategory)) location.replace("index.html");

  // Bandeau d'annonce en haut de chaque page
  const message = String(settings.announcement || "").trim();
  let bar = $("announcement");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "announcement";
    bar.className = "announcement";
    document.body.prepend(bar);
  }
  bar.textContent = message;
  bar.classList.toggle("hidden", !message);

  renderVideos();
}

// ---------- Comptes ----------
function updateUI() {
  const logged = Boolean(currentUser);
  $("guestActions").classList.toggle("hidden", logged);
  $("userActions").classList.toggle("hidden", !logged);
  // Seule l'équipe (admins, modérateurs) ajoute du contenu ; les membres regardent et écrivent dans le chat
  const isStaff = ["admin", "moderator"].includes(currentUser?.role);
  $("partager")?.classList.toggle("hidden", !isStaff); // formulaire présent seulement sur partager.html
  $("shareLocked")?.classList.toggle("hidden", isStaff);
  document.querySelectorAll('a[href^="partager.html"]').forEach((link) => link.classList.toggle("hidden", !isStaff));
  $("chatForm")?.classList.toggle("hidden", !logged);
  renderChat(); // le bouton « supprimer » dépend du compte connecté
  $("adminLink").classList.toggle("hidden", !isStaff);
  if (logged) $("userName").textContent = currentUser.name;

  // Une fois la réponse de Supabase connue, elle remplace l'état mémorisé de la dernière visite
  if (authKnown) {
    document.documentElement.classList.toggle("logged", logged);
    document.documentElement.classList.toggle("staff", isStaff);
  }
}

function rememberProfile(user) {
  try {
    if (user) localStorage.setItem("ivory360-profile", JSON.stringify({ name: user.name, role: user.role }));
    else localStorage.removeItem("ivory360-profile");
  } catch {}
}

// Nom affiché tout de suite, avant la réponse de Supabase
try {
  const saved = JSON.parse(localStorage.getItem("ivory360-profile"));
  if (saved) $("userName").textContent = saved.name;
} catch {}

// Lit le profil (nom, rôle) du compte connecté
async function loadProfile(session) {
  authKnown = true;
  if (!session) {
    currentUser = null;
    rememberProfile(null);
    updateUI();
    return;
  }

  const { data: profile } = await db
    .from("profiles")
    .select("name, role, banned, gender, country")
    .eq("id", session.user.id)
    .single();

  if (profile?.banned) {
    rememberProfile(null);
    await db.auth.signOut();
    toast("Votre compte a été suspendu. Contactez l'équipe IVOIR360.");
    return;
  }

  currentUser = {
    id: session.user.id,
    email: session.user.email,
    name: profile?.name || session.user.email.split("@")[0],
    role: profile?.role || "member",
    gender: profile?.gender,
    country: profile?.country
  };
  rememberProfile(currentUser);
  updateUI();
  if (profile && (!profile.gender || !profile.country)) openModal("profileModal");
}

// Appelé au chargement de la page, à la connexion et à la déconnexion.
// Supabase recommande de ne pas interroger la base directement dans ce rappel.
// (le renouvellement automatique du jeton ne change pas le profil : pas besoin de le relire)
db.auth.onAuthStateChange((event, session) => {
  if (event !== "TOKEN_REFRESHED") setTimeout(() => loadProfile(session), 0);
});

// Messages d'erreur de Supabase traduits en français
function authErrorMessage(error) {
  const message = error.message || "";
  if (/invalid login credentials/i.test(message)) return "E-mail ou mot de passe incorrect.";
  if (/already registered/i.test(message)) return "Un compte existe déjà avec cet e-mail.";
  if (/email not confirmed/i.test(message)) return "Confirmez d'abord votre e-mail grâce au lien reçu.";
  if (/password/i.test(message)) return "Mot de passe trop faible (8 caractères minimum).";
  return "Une erreur est survenue. Réessayez dans un instant.";
}

$("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("signupName").value.trim();
  const { data, error } = await db.auth.signUp({
    email: $("signupEmail").value.trim().toLowerCase(),
    password: $("signupPass").value,
    options: { data: { name, gender: $("signupGender").value, country: $("signupCountry").value } }
  });

  if (error) {
    $("signupError").textContent = authErrorMessage(error);
    return;
  }
  // Supabase ne signale pas les e-mails déjà inscrits quand la confirmation par e-mail est active
  if (data.user?.identities?.length === 0) {
    $("signupError").textContent = "Un compte existe déjà avec cet e-mail.";
    return;
  }

  e.target.reset();
  closeModal("signupModal");
  toast(data.session
    ? `Bienvenue ${name} ! Votre compte est créé.`
    : "Compte créé ! Cliquez sur le lien reçu par e-mail pour l'activer.");
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { data, error } = await db.auth.signInWithPassword({
    email: $("loginEmail").value.trim().toLowerCase(),
    password: $("loginPass").value
  });

  if (error) {
    $("loginError").textContent = authErrorMessage(error);
    return;
  }

  e.target.reset();
  closeModal("loginModal");
  const name = data.user.user_metadata?.name;
  toast(name ? `Bon retour, ${name} !` : "Vous êtes connecté.");
});

$("logoutBtn").addEventListener("click", async () => {
  await db.auth.signOut();
  if (window.google?.accounts) google.accounts.id.disableAutoSelect();
  toast("Vous êtes déconnecté.");
});

// ---------- Compte Google ----------
// Le jeton renvoyé par Google est vérifié par Supabase, qui crée le compte au besoin.
async function handleGoogleLogin(response) {
  const { data, error } = await db.auth.signInWithIdToken({
    provider: "google",
    token: response.credential
  });

  if (error) {
    toast("La connexion avec Google a échoué.");
    return;
  }

  closeModal("loginModal");
  closeModal("signupModal");
  const name = data.user.user_metadata?.full_name || data.user.user_metadata?.name;
  toast(name ? `Bienvenue ${name} !` : "Vous êtes connecté.");
}

function setupGoogle() {
  const containers = document.querySelectorAll(".google-btn");
  const configured = !GOOGLE_CLIENT_ID.startsWith("VOTRE_");

  if (!configured || !window.google?.accounts) {
    // Bouton de remplacement tant que Google n'est pas configuré ou pas chargé
    containers.forEach((box) => {
      box.innerHTML = `<button type="button" class="btn btn-google btn-full">${ICONS.google} Se connecter avec Google</button>`;
      box.firstChild.addEventListener("click", () =>
        toast(configured
          ? "Google est en cours de chargement. Réessayez dans un instant."
          : "Connexion Google pas encore configurée (GOOGLE_CLIENT_ID).")
      );
    });
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleLogin
  });
  containers.forEach((box) => {
    box.innerHTML = "";
    google.accounts.id.renderButton(box, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: box.closest("#signupModal") ? "signup_with" : "signin_with",
      locale: "fr",
      width: 300
    });
  });
}

// Appelée automatiquement par la bibliothèque Google une fois chargée
window.onGoogleLibraryLoad = setupGoogle;

// La bibliothèque Google n'est téléchargée qu'à la première ouverture d'une fenêtre de connexion
function loadGoogle() {
  if ($("googleScript")) return;
  const script = document.createElement("script");
  script.id = "googleScript";
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  document.head.appendChild(script);
}

// ---------- Partage d'une vidéo (partager.html uniquement) ----------
function setupShareForm() {
  // Rubrique pré-sélectionnée depuis une page de rubrique (ex. partager.html?rubrique=Musique)
  const preset = new URLSearchParams(location.search).get("rubrique");
  if (CATEGORY_PAGES[preset]) $("videoCategory").value = preset;

  $("videoUrl").addEventListener("input", () => {
    const url = $("videoUrl").value.trim();
    const hint = $("urlHint");
    if (getYouTubeId(url)) {
      hint.textContent = "✓ Lien YouTube détecté : la vidéo sera lue sur le site.";
      hint.classList.add("ok");
    } else if (getDomain(url)) {
      hint.textContent = `✓ Lien vers ${getDomain(url)}`;
      hint.classList.add("ok");
    } else {
      hint.textContent = "Lien YouTube ou lien d'une vidéo sur un autre site.";
      hint.classList.remove("ok");
    }
  });

  $("shareForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = $("videoUrl").value.trim();

    if (!/^https?:\/\//i.test(url) || !getDomain(url)) {
      $("shareError").textContent = "Veuillez entrer un lien valide (commençant par http:// ou https://).";
      return;
    }

    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;
    const category = $("videoCategory").value;
    // Le statut (publiée ou en attente) et le nom de l'auteur sont fixés par le serveur
    const { data, error } = await db
      .from("videos")
      .insert({
        title: $("videoTitle").value.trim(),
        url,
        category,
        description: $("videoDesc").value.trim(),
        author_id: currentUser.id,
        author_name: currentUser.name
      })
      .select()
      .single();
    button.disabled = false;

    if (error) {
      $("shareError").textContent = "La publication a échoué. Réessayez dans un instant.";
      return;
    }

    e.target.reset();
    $("shareError").textContent = "";
    $("urlHint").textContent = "Lien YouTube ou lien d'une vidéo sur un autre site.";
    $("urlHint").classList.remove("ok");

    // Le formulaire reste affiché pour enchaîner plusieurs ajouts
    if (data.status === "pending") {
      toast("Merci ! Votre vidéo sera publiée après validation par l'équipe.");
      return;
    }
    toast(`Votre vidéo a été publiée dans la rubrique ${categoryLabel(category)} !`);
  });
}

// ---------- Chat (toutes les pages : une seule discussion pour tout le site) ----------
const CHAT_LIMIT = 50; // nombre de messages affichés
// Aucun lien dans le chat (même règle que la base, voir supabase/schema.sql)
const CHAT_LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|fr|ci|io|co|me|ly|be|tv|gg|app|info|xyz|link|site|online|shop|biz|africa|tk|ru|uk|us|de|to|cc|live|store)\b)/i;
// Chaque message s'autodétruit 4 heures après son envoi (la base les supprime aussi, voir supabase/schema.sql)
const CHAT_TTL = 4 * 60 * 60 * 1000;
let messages = [];

// Temps restant avant l'autodestruction, ex. « 3 h 12 » ou « 8 min »
function chatRemaining(date) {
  const minutes = Math.max(1, Math.ceil((Date.parse(date) + CHAT_TTL - Date.now()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

function chatTime(date) {
  const d = new Date(date);
  const hour = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return hour;
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} à ${hour}`;
}

function renderChat() {
  const list = $("chatList");
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  const isStaff = ["admin", "moderator"].includes(currentUser?.role);
  messages = messages.filter((m) => Date.parse(m.created_at) + CHAT_TTL > Date.now());

  list.innerHTML = messages.map((m) => {
    const mine = currentUser && m.author_id === currentUser.id;
    const removable = mine || isStaff;
    return `
      <li class="chat-msg${mine ? " mine" : ""}">
        <div class="chat-meta">
          <strong>${escapeHtml(m.author_name)}</strong>
          <span>${chatTime(m.created_at)}</span>
          <span class="chat-timer" title="Ce message s'autodétruit 4 heures après son envoi">⏳ ${chatRemaining(m.created_at)}</span>
          ${removable ? `<button type="button" class="chat-delete" data-id="${m.id}" aria-label="Supprimer">&times;</button>` : ""}
        </div>
        <p>${escapeHtml(m.body)}</p>
      </li>`;
  }).join("");

  $("chatEmpty").classList.toggle("hidden", messages.length > 0);
  if (atBottom) list.scrollTop = list.scrollHeight; // reste en bas si on lisait les derniers messages
}

function addMessage(message) {
  if (messages.some((m) => m.id === message.id)) return; // déjà reçu (envoi + temps réel)
  messages.push(message);
  messages = messages.slice(-CHAT_LIMIT);
  renderChat();
  // Chat fermé : un point signale le nouveau message sur la bulle
  if (!chatVisible() && message.author_id !== currentUser?.id) {
    $("chatToggle").classList.add("has-new");
  }
}

// Ouvert ou fermé (classe « chat-closed » sur <html>, posée dès le chargement par le petit
// script du <head>) : même fonctionnement à toutes les tailles d'écran, le choix est mémorisé.
// Sans choix mémorisé : ouvert sur grand écran, fermé sur petit écran (il couvrirait la page).
function chatVisible() {
  return !document.documentElement.classList.contains("chat-closed");
}

// Ouverture et fermeture « en fumée » : le panneau se déforme (filtre SVG #chatSmoke)
// et se dissipe en montant (« out »), ou se condense à partir de la fumée (« in »).
// La durée doit rester égale à --chat-smoke dans style.css.
const SMOKE_MS = 700;
const SMOKE_DISPLACE = 35; // déformation maximale (en pixels)
const SMOKE_BLUR = 2; // flou maximal
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let smokeFrame = null;

function stopSmoke() {
  if (smokeFrame) cancelAnimationFrame(smokeFrame);
  smokeFrame = null;
  $("chat").classList.remove("smoking-out", "smoking-in");
}

function smoke(direction, done) {
  const chat = $("chat");
  const noise = document.querySelector("#chatSmoke feTurbulence");
  const blur = document.querySelector("#chatSmoke feGaussianBlur");
  const displace = document.querySelector("#chatSmoke feDisplacementMap");
  const start = performance.now();

  const render = (t) => {
    // « out » : la fumée se disperse de plus en plus vite ; « in » : elle se résorbe
    const e = direction === "out" ? t * t : (1 - t) * (1 - t);
    displace.setAttribute("scale", (e * SMOKE_DISPLACE).toFixed(1));
    blur.setAttribute("stdDeviation", (e * SMOKE_BLUR).toFixed(2));
    noise.setAttribute("baseFrequency", `${(0.01 + e * 0.01).toFixed(4)} ${(0.03 - e * 0.015).toFixed(4)}`);
  };

  render(0); // premier affichage déjà dans le bon état (pas d'image nette ou vide au départ)
  chat.classList.add(`smoking-${direction}`);
  const step = (now) => {
    const t = Math.min(1, (now - start) / SMOKE_MS);
    render(t);
    if (t < 1) {
      smokeFrame = requestAnimationFrame(step);
      return;
    }
    smokeFrame = null;
    // Fin de l'effet sans transition : le panneau ne réapparaît (ou ne clignote) pas un instant
    chat.style.transition = "none";
    chat.classList.remove(`smoking-${direction}`);
    done?.();
    void chat.offsetWidth;
    chat.style.transition = "";
  };
  smokeFrame = requestAnimationFrame(step);
}

function setChatOpen(open) {
  // Clic pendant la fumée : on l'interrompt
  stopSmoke();

  const chat = $("chat");
  const apply = () => {
    document.documentElement.classList.toggle("chat-closed", !open);
    try { localStorage.setItem("ivory360-chat", open ? "open" : "closed"); } catch {}
  };
  const animate = !reducedMotion.matches && open !== chatVisible();

  if (animate && !open) {
    smoke("out", apply); // fermé pour de bon une fois la fumée dissipée
  } else if (animate && open) {
    // Ouvert tout de suite (sans transition), l'animation part de la fumée
    chat.style.transition = "none";
    apply();
    smoke("in");
    void chat.offsetWidth;
    chat.style.transition = "";
  } else {
    apply();
  }
  $("chatToggle").classList.toggle("open", open);
  $("chatToggle").setAttribute("aria-expanded", open);
  $("chatToggle").setAttribute("aria-label", open ? "Fermer le chat" : "Ouvrir le chat");
  if (open) {
    $("chatToggle").classList.remove("has-new");
    $("chatList").scrollTop = $("chatList").scrollHeight;
  }
}

// Panneau du chat, fixé à droite de l'écran sur toutes les pages
// (fermé, il se rouvre avec une bulle en bas à droite)
// (la classe « with-chat » qui réserve sa place est déjà dans le HTML de chaque page,
// pour que la mise en page soit la bonne dès le premier affichage)
function createChat() {
  document.body.insertAdjacentHTML("beforeend", `
    <svg class="smoke-defs" aria-hidden="true">
      <filter id="chatSmoke" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.01 0.03" numOctaves="3" seed="7" result="noise"/>
        <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="soft"/>
        <feDisplacementMap in="soft" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </svg>
    <aside class="chat" id="chat" aria-label="Chat">
      <div class="chat-head">
        <strong>Discussion</strong>
        <button type="button" class="chat-close" id="chatClose" aria-label="Fermer le chat">
          <svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <ul class="chat-list" id="chatList"></ul>
      <p class="chat-empty" id="chatEmpty">Aucun message pour le moment. Lancez la discussion !</p>
      <form class="chat-form hidden" id="chatForm">
        <input type="text" id="chatInput" maxlength="500" placeholder="Écrire un commentaire..." autocomplete="off" required>
        <button type="submit" class="btn btn-green" aria-label="Envoyer">
          <svg class="icon" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>
        </button>
      </form>
    </aside>
    <button type="button" class="chat-toggle" id="chatToggle" aria-label="Ouvrir le chat" aria-expanded="false">
      <svg class="icon icon-open" viewBox="0.6 1.2 24 24"><!-- décalé pour être centré comme la croix --><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/></svg>
      <svg class="icon icon-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>`);

  // La bulle reflète l'état du chat dès le chargement (croix si le chat est déjà ouvert)
  const openAtStart = chatVisible();
  $("chatToggle").classList.toggle("open", openAtStart);
  $("chatToggle").setAttribute("aria-expanded", openAtStart);
  $("chatToggle").setAttribute("aria-label", openAtStart ? "Fermer le chat" : "Ouvrir le chat");

  $("chatToggle").addEventListener("click", () => setChatOpen(!chatVisible()));
  $("chatClose").addEventListener("click", () => setChatOpen(false));

  // Le panneau commence juste sous l'en-tête, même quand le bandeau d'annonce est affiché,
  // et s'arrête au-dessus du pied de page noir quand celui-ci arrive à l'écran
  // (mis à jour seulement quand la valeur change : la modifier recalcule le style de toute la page)
  const header = document.querySelector(".header");
  const footer = document.querySelector(".footer");
  let lastTop = null;
  let lastBottom = null;
  const place = () => {
    const top = Math.round(Math.max(16, header.getBoundingClientRect().bottom + 16));
    const footerTop = footer ? footer.getBoundingClientRect().top : Infinity;
    const bottom = Math.round(Math.max(16, window.innerHeight - footerTop + 16));
    if (top !== lastTop) {
      lastTop = top;
      document.documentElement.style.setProperty("--chat-top", `${top}px`);
    }
    if (bottom !== lastBottom) {
      lastBottom = bottom;
      document.documentElement.style.setProperty("--chat-bottom", `${bottom}px`);
    }
  };
  window.addEventListener("scroll", place, { passive: true });
  window.addEventListener("resize", place);
  new ResizeObserver(place).observe(document.body);
  place();
}

async function loadMessages() {
  const { data, error } = await db
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(CHAT_LIMIT);
  if (error) return;
  messages = data.reverse();
  renderChat();
  $("chatList").scrollTop = $("chatList").scrollHeight;

  // Nouveaux messages et suppressions en direct, pour tous les visiteurs
  db.channel("chat")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },
      (payload) => addMessage(payload.new))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" },
      (payload) => {
        messages = messages.filter((m) => m.id !== payload.old.id);
        renderChat();
      })
    .subscribe();

  // Toutes les 30 secondes : compte à rebours mis à jour, messages expirés retirés
  setInterval(renderChat, 30000);
}

function setupChat() {
  $("chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = $("chatInput").value.trim();
    if (!body || !currentUser) return;
    if (CHAT_LINK.test(body)) {
      toast("Les liens ne sont pas autorisés dans le chat.");
      return;
    }

    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;
    // Le nom de l'auteur et l'heure sont fixés par le serveur
    const { data, error } = await db
      .from("messages")
      .insert({ body, author_id: currentUser.id, author_name: currentUser.name })
      .select()
      .single();
    button.disabled = false;

    if (error) {
      toast("Le message n'a pas pu être envoyé. Réessayez dans un instant.");
      return;
    }
    $("chatInput").value = "";
    addMessage(data);
    $("chatList").scrollTop = $("chatList").scrollHeight;
  });

  $("chatList").addEventListener("click", async (e) => {
    const button = e.target.closest(".chat-delete");
    if (!button) return;
    const id = Number(button.dataset.id);
    const { error } = await db.from("messages").delete().eq("id", id);
    if (error) {
      toast("Impossible de supprimer ce message.");
      return;
    }
    messages = messages.filter((m) => m.id !== id);
    renderChat();
  });
}

// ---------- Démarrage ----------
$("year").textContent = new Date().getFullYear();
setupPasswordEyes();
if ($("shareForm")) setupShareForm();
createChat();
setupChat();
setupTabs();
updateUI();
renderVideos();
setupGoogle(); // bouton de remplacement en attendant le chargement de Google
if (SUPABASE_READY) {
  loadSettings();
  if ($("videoGrid")) loadVideos(); // pas de liste de vidéos sur partager.html
  loadMessages();
} else {
  console.warn("IVOIR360 : Supabase n'est pas encore configuré (supabase-config.js).");
}
