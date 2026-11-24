/* ==========================================================
   IVOIR360 — Tableau de bord (admin.html)
   Réservé aux comptes « modérateur » et « administrateur ».
   Les droits sont vérifiés par Supabase (supabase/schema.sql) :
   masquer un bouton ici ne suffit pas à donner ou retirer un droit.
   ========================================================== */

const $ = (id) => document.getElementById(id);

const STATUS_LABELS = { pending: "En attente", published: "Publiée", hidden: "Masquée" };
const ROLE_LABELS = { member: "Membre", moderator: "Modérateur", admin: "Administrateur" };

// Textes du site modifiables (data-content="..." dans les pages HTML).
// « text » est le texte d'origine, affiché tant que le champ reste vide.
const CONTENT_FIELDS = [
  { key: "home_title", label: "Accueil — titre", text: "Découvrez toute l'actualité" },
  { key: "home_title_green", label: "Accueil — titre (partie verte)", text: "sur les gbairais et le showbiz ivoirien" },
  { key: "home_text", label: "Accueil — introduction", long: true, text: "Tous les nouveaux clips, les gbairais et interviews de la scène ivoirienne. Connecte-toi chaque jour sur IVOIR360 pour ne rien louper ." },
  { key: "feature_Musique", label: "Accueil — carte Musiques", text: "Clips, lives et nouveautés partagés par les membres." },
  { key: "feature_Interviews", label: "Accueil — carte Interviews", text: "Les artistes se racontent : parcours, projets, coulisses." },
  { key: "feature_Documentaire", label: "Accueil — carte Documentaire", text: "L'histoire des artistes, des genres et des scènes musicales." },
  { key: "feature_SnapNow", label: "Accueil — carte SnapNow", text: "Les moments forts de la scène ivoirienne, capturés sur le vif." },
  { key: "page_Musique", label: "Page Musiques — introduction", text: "Clips, lives et nouveautés de la scène ivoirienne, partagés par les membres." },
  { key: "page_Interviews", label: "Page Interviews — introduction", text: "Les artistes se racontent : parcours, projets, coulisses." },
  { key: "page_Documentaire", label: "Page Documentaire — introduction", text: "Est-ce que toi tu aimes gbairais même ..." },
  { key: "page_SnapNow", label: "Page SnapNow — introduction", text: "Les moments forts de la scène ivoirienne, capturés sur le vif." }
];

let me = null;         // profil du compte connecté
let videos = [];
let members = [];
let settings = { moderation: false, categories: {}, content: {}, announcement: "" };
const views = {};      // nombre de vues par vidéo (clé du compteur -> nombre)
let editingId = null;  // vidéo en cours de modification (null = ajout)

// ---------- Outils (mêmes fonctions que script.js) ----------
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function getYouTubeId(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/
  );
  return match ? match[1] : null;
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const formatDate = (date) => new Date(date).toLocaleDateString("fr-FR");
const formatNumber = (n) => (n === null || n === undefined ? "—" : n.toLocaleString("fr-FR"));

function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(t.timer);
  t.timer = setTimeout(() => t.classList.remove("show"), 3000);
}

// ---------- Vues (service Abacus, voir script.js) ----------
const VIEWS_API = "https://abacus.jasoncameron.dev";
const VIEWS_NAMESPACE = "ivory360-com";

function viewKey(url) {
  const ytId = getYouTubeId(url);
  if (ytId) return "yt-" + ytId;
  let hash = 0;
  for (const c of url) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return "url-" + (hash >>> 0).toString(36);
}

async function fetchViews(key) {
  try {
    const res = await fetch(`${VIEWS_API}/get/${VIEWS_NAMESPACE}/${key}`);
    if (res.status === 404) return 0;
    if (!res.ok) return null;
    return (await res.json()).value;
  } catch {
    return null;
  }
}

const videoViews = (video) => views[viewKey(video.url)];

async function loadViews() {
  const keys = [...new Set(videos.map((v) => viewKey(v.url)))].filter((k) => !(k in views));
  await Promise.all(keys.map(async (key) => (views[key] = await fetchViews(key))));
  renderStats();
  renderVideos();
}

// ---------- Accès ----------
function showOnly(id) {
  ["setupGate", "loginGate", "deniedGate", "dashboard"].forEach((gate) =>
    $(gate).classList.toggle("hidden", gate !== id)
  );
}

async function start(session) {
  $("userActions").classList.toggle("hidden", !session);
  if (!session) {
    me = null;
    showOnly("loginGate");
    loadGoogle();
    return;
  }

  const { data: profile } = await db.from("profiles").select("*").eq("id", session.user.id).single();
  $("userName").textContent = profile?.name || session.user.email;
  $("userRole").textContent = ROLE_LABELS[profile?.role] || "";

  if (!profile || profile.banned || !["admin", "moderator"].includes(profile.role)) {
    me = null;
    showOnly("deniedGate");
    return;
  }

  me = profile;
  // Les modérateurs ne voient que les statistiques et les vidéos
  document.querySelectorAll("[data-admin]").forEach((el) => el.classList.toggle("hidden", me.role !== "admin"));
  showOnly("dashboard");
  openPanel(location.hash.slice(1));
  await loadAll();
}

if (SUPABASE_READY) {
  // Supabase recommande de ne pas interroger la base directement dans ce rappel
  db.auth.onAuthStateChange((event, session) => {
    if (event !== "TOKEN_REFRESHED") setTimeout(() => start(session), 0);
  });
} else {
  showOnly("setupGate");
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await db.auth.signInWithPassword({
    email: $("loginEmail").value.trim().toLowerCase(),
    password: $("loginPass").value
  });
  $("loginError").textContent = error ? "E-mail ou mot de passe incorrect." : "";
  if (!error) e.target.reset();
});

$("logoutBtn").addEventListener("click", async () => {
  await db.auth.signOut();
  if (window.google?.accounts) google.accounts.id.disableAutoSelect();
});

// Connexion Google : le jeton est vérifié par Supabase
window.onGoogleLibraryLoad = () => {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async (response) => {
      const { error } = await db.auth.signInWithIdToken({ provider: "google", token: response.credential });
      if (error) toast("La connexion avec Google a échoué.");
    }
  });
  document.querySelectorAll(".google-btn").forEach((box) =>
    google.accounts.id.renderButton(box, { theme: "outline", size: "large", shape: "pill", locale: "fr", width: 300 })
  );
};

// La bibliothèque Google n'est téléchargée que si le formulaire de connexion est affiché
function loadGoogle() {
  if ($("googleScript")) return;
  const script = document.createElement("script");
  script.id = "googleScript";
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  document.head.appendChild(script);
}

// ---------- Onglets ----------
function openPanel(name) {
  const tab = document.querySelector(`.admin-nav [data-panel="${name}"]:not(.hidden)`)
    || document.querySelector('.admin-nav [data-panel="stats"]');
  document.querySelectorAll(".admin-nav .tab").forEach((t) => t.classList.toggle("active", t === tab));
  document.querySelectorAll(".panel").forEach((p) =>
    p.classList.toggle("hidden", p.id !== `panel-${tab.dataset.panel}`)
  );
  history.replaceState(null, "", `#${tab.dataset.panel}`);
}

document.querySelectorAll(".admin-nav .tab").forEach((tab) =>
  tab.addEventListener("click", () => openPanel(tab.dataset.panel))
);

// ---------- Chargement des données ----------
async function loadAll() {
  const [videoRes, memberRes, settingsRes] = await Promise.all([
    db.from("videos").select("*").order("created_at", { ascending: false }),
    db.from("profiles").select("*").order("created_at", { ascending: false }),
    db.from("settings").select("key, value")
  ]);
  if (videoRes.error || memberRes.error || settingsRes.error) toast("Certaines données n'ont pas pu être chargées.");

  videos = videoRes.data || [];
  members = memberRes.data || [];
  (settingsRes.data || []).forEach((row) => (settings[row.key] = row.value));

  renderStats();
  renderVideos();
  renderMembers();
  fillContentForm();
  fillSettingsForm();
  loadViews();
}

// ---------- Statistiques ----------
function renderStats() {
  const published = videos.filter((v) => v.status === "published");
  const pending = videos.filter((v) => v.status === "pending");
  const viewsLoaded = videos.length > 0 && videos.every((v) => videoViews(v) !== undefined);
  const totalViews = (list) => list.reduce((sum, v) => sum + (videoViews(v) || 0), 0);

  $("kpiMembers").textContent = formatNumber(members.length);
  $("kpiPublished").textContent = formatNumber(published.length);
  $("kpiPending").textContent = formatNumber(pending.length);
  $("kpiViews").textContent = viewsLoaded ? formatNumber(totalViews(videos)) : "…";

  $("pendingCount").textContent = pending.length;
  $("pendingCount").classList.toggle("hidden", pending.length === 0);

  $("statsCategories").innerHTML = Object.keys(CATEGORY_PAGES).map((category) => {
    const list = videos.filter((v) => v.category === category);
    return `<tr>
      <td>${escapeHtml(categoryLabel(category))}</td>
      <td>${list.filter((v) => v.status === "published").length}</td>
      <td>${list.filter((v) => v.status === "pending").length}</td>
      <td>${viewsLoaded ? formatNumber(totalViews(list)) : "…"}</td>
    </tr>`;
  }).join("");

  const top = [...published].sort((a, b) => (videoViews(b) || 0) - (videoViews(a) || 0)).slice(0, 5);
  $("statsTop").innerHTML = top.length
    ? top.map((v) => `<li><span>${escapeHtml(v.title)}</span><strong>${formatNumber(videoViews(v))}</strong></li>`).join("")
    : '<li class="muted">Aucune vidéo publiée.</li>';

  $("statsMembers").innerHTML = members.slice(0, 5).map((m) =>
    `<li><span>${escapeHtml(m.name)}</span><small>${formatDate(m.created_at)}</small></li>`
  ).join("") || '<li class="muted">Aucun membre.</li>';

  $("statsGender").innerHTML = countList(members.map((m) => GENDER_LABELS[m.gender]));
  $("statsCountry").innerHTML = countList(members.map((m) => countryName(m.country)));
}

// Liste « valeur — nombre de membres (pourcentage) », de la plus fréquente à la moins fréquente
function countList(values) {
  if (!values.length) return '<li class="muted">Aucun membre.</li>';
  const counts = {};
  values.forEach((v) => {
    const key = v || "Non renseigné";
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => `<li><span>${escapeHtml(label)}</span><strong>${n} <small>(${Math.round((n / values.length) * 100)} %)</small></strong></li>`)
    .join("");
}

// ---------- Vidéos ----------
function fillCategorySelects() {
  const options = Object.keys(CATEGORY_PAGES)
    .map((c) => `<option value="${c}">${escapeHtml(categoryLabel(c))}</option>`).join("");
  $("videoCategoryFilter").insertAdjacentHTML("beforeend", options);
  $("videoCategory").innerHTML = options;
}

function renderVideos() {
  const search = $("videoSearch").value.trim().toLowerCase();
  const status = $("videoStatusFilter").value;
  const category = $("videoCategoryFilter").value;

  const list = videos.filter((v) =>
    (!status || v.status === status) &&
    (!category || v.category === category) &&
    (!search || `${v.title} ${v.author_name}`.toLowerCase().includes(search))
  );

  $("videosEmpty").classList.toggle("hidden", list.length > 0);
  $("videoRows").innerHTML = list.map((v) => {
    const ytId = getYouTubeId(v.url);
    const thumb = ytId
      ? `<img src="https://img.youtube.com/vi/${ytId}/mqdefault.jpg" alt="" loading="lazy">`
      : '<span class="thumb-empty"></span>';
    const toggle = {
      pending: '<button class="btn-sm btn-sm-green" data-action="publish">Valider</button><button class="btn-sm" data-action="hide">Refuser</button>',
      published: '<button class="btn-sm" data-action="hide">Masquer</button>',
      hidden: '<button class="btn-sm btn-sm-green" data-action="publish">Publier</button>'
    }[v.status];

    return `<tr data-id="${v.id}">
      <td><div class="cell-video">${thumb}<div>
        <strong>${escapeHtml(v.title)}</strong>
        <a href="${escapeHtml(v.url)}" target="_blank" rel="noopener">${escapeHtml(getDomain(v.url))}</a>
      </div></div></td>
      <td>${escapeHtml(categoryLabel(v.category))}</td>
      <td>${escapeHtml(v.author_name)}</td>
      <td>${formatDate(v.created_at)}</td>
      <td>${videoViews(v) === undefined ? "…" : formatNumber(videoViews(v))}</td>
      <td>
        <span class="pill pill-${v.status}">${STATUS_LABELS[v.status]}</span>
        ${v.featured ? '<span class="pill pill-featured">À la une</span>' : ""}
      </td>
      <td><div class="actions">
        ${toggle}
        <button class="btn-sm" data-action="feature">${v.featured ? "Retirer de la une" : "Mettre à la une"}</button>
        <button class="btn-sm" data-action="edit">Modifier</button>
        <button class="btn-sm btn-sm-red" data-action="delete">Supprimer</button>
      </div></td>
    </tr>`;
  }).join("");
}

["videoSearch", "videoStatusFilter", "videoCategoryFilter"].forEach((id) =>
  $(id).addEventListener("input", renderVideos)
);

async function updateVideo(id, changes, message) {
  const { error } = await db.from("videos").update(changes).eq("id", id);
  if (error) {
    toast("La modification a échoué.");
    return false;
  }
  Object.assign(videos.find((v) => v.id === id), changes);
  renderVideos();
  renderStats();
  toast(message);
  return true;
}

$("videoRows").addEventListener("click", async (e) => {
  const button = e.target.closest("[data-action]");
  if (!button) return;
  const id = Number(button.closest("tr").dataset.id);
  const video = videos.find((v) => v.id === id);

  switch (button.dataset.action) {
    case "publish":
      updateVideo(id, { status: "published" }, "Vidéo publiée.");
      break;
    case "hide":
      updateVideo(id, { status: "hidden" }, "Vidéo masquée.");
      break;
    case "feature":
      updateVideo(id, { featured: !video.featured }, video.featured ? "Vidéo retirée de la une." : "Vidéo mise à la une.");
      break;
    case "edit":
      openVideoModal(video);
      break;
    case "delete": {
      if (!confirm(`Supprimer définitivement « ${video.title} » ?`)) return;
      const { error } = await db.from("videos").delete().eq("id", id);
      if (error) {
        toast("La suppression a échoué.");
        return;
      }
      videos = videos.filter((v) => v.id !== id);
      renderVideos();
      renderStats();
      toast("Vidéo supprimée.");
      break;
    }
  }
});

// Fenêtre d'ajout / de modification
function openVideoModal(video) {
  editingId = video?.id ?? null;
  $("videoModalTitle").textContent = video ? "Modifier la vidéo" : "Ajouter une vidéo";
  $("videoUrl").value = video?.url || "";
  $("videoTitle").value = video?.title || "";
  $("videoCategory").value = video?.category || "Musique";
  $("videoAuthor").value = video?.author_name || "IVOIR360";
  $("videoDesc").value = video?.description || "";
  $("videoStatus").value = video?.status || "published";
  $("videoFeatured").checked = Boolean(video?.featured);
  $("videoError").textContent = "";
  $("videoModal").classList.add("open");
}

function closeModal() {
  $("videoModal").classList.remove("open");
}

$("addVideoBtn").addEventListener("click", () => openVideoModal(null));

$("videoModal").addEventListener("click", (e) => {
  if (e.target === $("videoModal") || e.target.hasAttribute("data-close")) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

$("videoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = $("videoUrl").value.trim();
  if (!/^https?:\/\//i.test(url) || !getDomain(url)) {
    $("videoError").textContent = "Veuillez entrer un lien valide (commençant par http:// ou https://).";
    return;
  }

  const fields = {
    url,
    title: $("videoTitle").value.trim(),
    category: $("videoCategory").value,
    author_name: $("videoAuthor").value.trim(),
    description: $("videoDesc").value.trim(),
    status: $("videoStatus").value,
    featured: $("videoFeatured").checked
  };

  if (editingId !== null) {
    if (await updateVideo(editingId, fields, "Vidéo modifiée.")) closeModal();
    return;
  }

  const { data, error } = await db.from("videos").insert({ ...fields, author_id: me.id }).select().single();
  if (error) {
    $("videoError").textContent = "L'ajout a échoué. Réessayez dans un instant.";
    return;
  }
  videos.unshift(data);
  closeModal();
  renderVideos();
  renderStats();
  loadViews();
  toast("Vidéo ajoutée.");
});

// ---------- Membres ----------
function renderMembers() {
  const search = $("memberSearch").value.trim().toLowerCase();
  const list = members.filter((m) => !search || `${m.name} ${m.email}`.toLowerCase().includes(search));

  $("membersEmpty").classList.toggle("hidden", list.length > 0);
  $("memberRows").innerHTML = list.map((m) => {
    const self = m.id === me?.id; // on ne modifie pas son propre compte (évite de perdre l'accès)
    const count = videos.filter((v) => v.author_id === m.id).length;
    const roles = Object.entries(ROLE_LABELS)
      .map(([value, label]) => `<option value="${value}"${m.role === value ? " selected" : ""}>${label}</option>`).join("");

    return `<tr data-id="${m.id}">
      <td><strong>${escapeHtml(m.name)}</strong>${self ? " <small>(vous)</small>" : ""}<br><small>${escapeHtml(m.email)}</small></td>
      <td>${m.gender ? escapeHtml(GENDER_LABELS[m.gender]) : '<span class="muted">—</span>'}</td>
      <td>${m.country ? escapeHtml(countryName(m.country)) : '<span class="muted">—</span>'}</td>
      <td>${formatDate(m.created_at)}</td>
      <td>${count}</td>
      <td><select class="role-select" data-action="role"${self ? " disabled" : ""}>${roles}</select></td>
      <td><span class="pill ${m.banned ? "pill-hidden" : "pill-published"}">${m.banned ? "Suspendu" : "Actif"}</span></td>
      <td>${self ? "" : `<button class="btn-sm ${m.banned ? "btn-sm-green" : "btn-sm-red"}" data-action="ban">${m.banned ? "Réactiver" : "Suspendre"}</button>`}</td>
    </tr>`;
  }).join("");
}

$("memberSearch").addEventListener("input", renderMembers);

async function updateMember(id, changes, message) {
  const { error } = await db.from("profiles").update(changes).eq("id", id);
  if (error) toast("La modification a échoué.");
  else {
    Object.assign(members.find((m) => m.id === id), changes);
    toast(message);
  }
  renderMembers();
}

$("memberRows").addEventListener("change", (e) => {
  if (e.target.dataset.action !== "role") return;
  const member = members.find((m) => m.id === e.target.closest("tr").dataset.id);
  const role = e.target.value;
  if (role === "admin" && !confirm(`Donner à ${member.name} tous les droits d'administration ?`)) {
    e.target.value = member.role;
    return;
  }
  updateMember(member.id, { role }, `${member.name} est maintenant ${ROLE_LABELS[role].toLowerCase()}.`);
});

$("memberRows").addEventListener("click", (e) => {
  if (e.target.dataset.action !== "ban") return;
  const member = members.find((m) => m.id === e.target.closest("tr").dataset.id);
  if (!member.banned && !confirm(`Suspendre ${member.name} ? Ce membre ne pourra plus se connecter ni publier.`)) return;
  updateMember(member.id, { banned: !member.banned }, member.banned ? `${member.name} est réactivé.` : `${member.name} est suspendu.`);
});

// ---------- Contenu et réglages ----------
async function saveSettings(entries) {
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
  const { error } = await db.from("settings").upsert(rows);
  if (error) {
    toast("L'enregistrement a échoué.");
    return;
  }
  Object.assign(settings, entries);
  toast("Modifications enregistrées : elles sont visibles sur le site.");
}

function fillContentForm() {
  $("announcementInput").value = settings.announcement || "";
  $("contentFields").innerHTML = CONTENT_FIELDS.map((f) => {
    const value = escapeHtml(settings.content?.[f.key] || "");
    const input = f.long
      ? `<textarea id="content-${f.key}" rows="3" placeholder="${escapeHtml(f.text)}">${value}</textarea>`
      : `<input type="text" id="content-${f.key}" placeholder="${escapeHtml(f.text)}" value="${value}">`;
    return `<div class="field"><label for="content-${f.key}">${escapeHtml(f.label)}</label>${input}</div>`;
  }).join("") + '<p class="panel-hint">Un champ laissé vide garde le texte d\'origine (affiché en gris).</p>';
}

$("contentForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const content = {};
  CONTENT_FIELDS.forEach((f) => {
    const value = $(`content-${f.key}`).value.trim();
    if (value) content[f.key] = value;
  });
  saveSettings({ content, announcement: $("announcementInput").value.trim() });
});

function fillSettingsForm() {
  $("moderationInput").checked = settings.moderation === true;
  $("categoryToggles").innerHTML = Object.keys(CATEGORY_PAGES).map((c) => `
    <label class="switch-row">
      <input type="checkbox" data-category="${c}"${settings.categories?.[c] !== false ? " checked" : ""}>
      <span><strong>${escapeHtml(categoryLabel(c))}</strong><small>${CATEGORY_PAGES[c]}</small></span>
    </label>`).join("");
}

$("settingsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const categories = {};
  document.querySelectorAll("#categoryToggles [data-category]").forEach((input) => {
    categories[input.dataset.category] = input.checked;
  });
  saveSettings({ moderation: $("moderationInput").checked, categories });
});

// ---------- Démarrage ----------
fillCategorySelects();
