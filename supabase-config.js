/* ==========================================================
   IVOIR360 — Connexion à Supabase
   Remplacez ces deux valeurs par celles de votre projet :
   https://supabase.com > votre projet > Project Settings > API
   (la clé « anon public » peut être publiée : la sécurité est
   assurée par les règles de supabase/schema.sql).
   ========================================================== */

const SUPABASE_URL = "https://xsermglynqcsigrvkolf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZXJtZ2x5bnFjc2lncnZrb2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MzU1NzcsImV4cCI6MjEwOTExMTU3N30.zVlWgjJ3B3JcurOmHv1I69QpiwBMi3Nw8FO2Ttzw4Fs";

const SUPABASE_READY = !SUPABASE_URL.includes("VOTRE-PROJET");
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Connexion Google ----------
// Remplacez par l'« ID client OAuth » créé sur https://console.cloud.google.com
// (API et services > Identifiants > ID client OAuth 2.0 > Application Web).
// Ajoutez aussi cet ID dans Supabase : Authentication > Providers > Google.
const GOOGLE_CLIENT_ID = "683583867232-9td0irtijrv8ejvha4icaoe5fs56q6jj.apps.googleusercontent.com";

// Rubriques du site et leur page
const CATEGORY_PAGES = {
  Musique: "musique.html",
  Interviews: "interviews.html",
  Documentaire: "documentaire.html",
  SnapNow: "snapnow.html"
};

// Nom affiché de chaque rubrique (la valeur enregistrée avec les vidéos reste "Musique")
const CATEGORY_LABELS = { Musique: "Musiques" };
const categoryLabel = (category) => CATEGORY_LABELS[category] || category;

// ---------- Profil des membres : sexe et pays ----------
const GENDER_LABELS = { homme: "Homme", femme: "Femme", autre: "Autre / ne pas préciser" };

// Codes pays ISO (le nom en français est donné par le navigateur)
const COUNTRY_CODES = (
  "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI " +
  "KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ " +
  "ET FJ FI FR GF PF GA GM GE DE GH GR GD GP GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL " +
  "IT JM JP JO KZ KE KI XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR " +
  "MU YT MX FM MD MC MN ME MA MZ MM NA NR NP NL NC NZ NI NE NG KP MK NO OM PK PW PS PA PG " +
  "PY PE PH PL PT PR QA RE RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR " +
  "SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA " +
  "VE VN EH YE ZM ZW"
).split(" ");

const countryNames = new Intl.DisplayNames(["fr"], { type: "region" });
const countryName = (code) => (code ? countryNames.of(code) : "");
