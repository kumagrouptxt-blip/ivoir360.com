/* ==========================================================
   IVOIR360 — Design animé
   Lignes de niveau (style carte topographique) qui ondulent
   lentement derrière l'en-tête de chaque page.
   ========================================================== */

(function () {
  const sections = document.querySelectorAll(".hero, .page-hero");
  if (!sections.length) return;

  const CELL = 12;            // taille d'une case de la grille (px) : plus petit = lignes plus lisses
  const SCALE = 1 / 340;      // taille des formes : plus petit = formes plus grandes
  const STEP = 0.11;          // écart entre deux lignes
  const SPEED = 0.0000412;    // vitesse de l'animation
  const COLOR = "rgba(0, 104, 55, 0.16)"; // vert du logo, très léger
  const LINE_WIDTH = 1.4;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Bruit de Perlin 3D ---------- */
  const perm = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);

  function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return (h & 1 ? -u : u) + (h & 2 ? -v : v);
  }

  function noise(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
        lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      lerp(
        lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }

  /* ---------- Marching squares ----------
     Arêtes d'une case : 0 haut, 1 droite, 2 bas, 3 gauche.
     Pour chaque configuration, les paires d'arêtes à relier. */
  const SEGMENTS = [
    [], [3, 2], [2, 1], [3, 1], [0, 1], [3, 0, 2, 1], [0, 2], [3, 0],
    [3, 0], [0, 2], [0, 1, 3, 2], [0, 1], [3, 1], [2, 1], [3, 2], [],
  ];

  // Point où une ligne coupe l'arête d'une case (écrit dans px, py : aucun objet créé par case)
  let px = 0, py = 0;
  function edgePoint(edge, x, y, level, a, b, c, d) {
    switch (edge) {
      case 0: px = x + CELL * (level - a) / (b - a); py = y; break;
      case 1: px = x + CELL; py = y + CELL * (level - b) / (c - b); break;
      case 2: px = x + CELL * (level - d) / (c - d); py = y + CELL; break;
      default: px = x; py = y + CELL * (level - a) / (d - a);
    }
  }

  function setupSection(section) {
    const canvas = document.createElement("canvas");
    canvas.className = "contours";
    canvas.setAttribute("aria-hidden", "true");
    section.prepend(canvas);

    const ctx = canvas.getContext("2d");
    let width = 0, height = 0, cols = 0, rows = 0;
    let field = new Float32Array(0);
    let visible = true;
    let lastFrame = 0;
    const offset = Math.random() * 100; // chaque page a son propre dessin

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = section.clientWidth;
      height = section.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / CELL) + 1;
      rows = Math.ceil(height / CELL) + 1;
      field = new Float32Array(cols * rows);
    }

    function draw(time) {
      const z = offset + time * SPEED;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          field[j * cols + i] = noise(i * CELL * SCALE, j * CELL * SCALE, z);
        }
      }

      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();

      for (let level = -0.66; level <= 0.66; level += STEP) {
        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols - 1; i++) {
            const a = field[j * cols + i];           // haut gauche
            const b = field[j * cols + i + 1];       // haut droite
            const c = field[(j + 1) * cols + i + 1]; // bas droite
            const d = field[(j + 1) * cols + i];     // bas gauche
            const config = (a > level) << 3 | (b > level) << 2 | (c > level) << 1 | (d > level);
            if (config === 0 || config === 15) continue;
            const segs = SEGMENTS[config];

            const x = i * CELL, y = j * CELL;
            for (let s = 0; s < segs.length; s += 2) {
              edgePoint(segs[s], x, y, level, a, b, c, d);
              ctx.moveTo(px, py);
              edgePoint(segs[s + 1], x, y, level, a, b, c, d);
              ctx.lineTo(px, py);
            }
          }
        }
      }

      ctx.strokeStyle = COLOR;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    function loop(now) {
      // ~12 images par seconde (les lignes bougent très lentement : la différence avec 30 ne se voit pas),
      // et seulement quand l'en-tête est à l'écran
      if (visible && now - lastFrame > 80) {
        lastFrame = now;
        draw(now);
      }
      requestAnimationFrame(loop);
    }

    new ResizeObserver(() => {
      resize();
      draw(performance.now());
    }).observe(section);

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }).observe(section);

    resize();
    draw(0);
    if (!reduceMotion) requestAnimationFrame(loop);
  }

  sections.forEach(setupSection);
})();
