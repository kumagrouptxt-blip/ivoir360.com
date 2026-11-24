/* ==========================================================
   IVOIR360 — Fond animé de la page SnapNow
   Un tissu soyeux aux reflets chromés qui ondule comme un drapeau
   dans une légère brise. Dessiné en WebGL derrière les vidéos.
   Couleurs : le vert très sombre #042613 en base, avec des reflets
   jade, menthe, sarcelle et vert pomme à la place des pastels.
   ========================================================== */

(function () {
  const section = document.getElementById("videos");
  if (!section) return;

  const RESOLUTION = 0.5; // dessin en demi-résolution : le tissu est flou, inutile de calculer chaque pixel
  const SPEED = 0.00054;  // vitesse de la brise

  const canvas = document.createElement("canvas");
  canvas.className = "silk-bg";
  canvas.setAttribute("aria-hidden", "true");

  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return; // pas de WebGL : on garde le fond uni
  section.prepend(canvas);

  const VERTEX = `
    attribute vec2 pos;
    void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

  const FRAGMENT = `
    precision mediump float;
    uniform vec2 res;
    uniform float t;

    // Hauteur du tissu : des plis qui avancent de gauche à droite, comme poussés par le vent
    float fold(vec2 p) {
      return sin(p.x * 2.2 - t * 0.9 + sin(p.y * 1.3 + t * 0.3) * 1.2) * 0.5
           + sin(p.x * 3.7 + p.y * 1.8 - t * 1.3) * 0.22
           + sin((p.x + p.y) * 1.4 - t * 0.6 + sin(p.x * 0.8 - t * 0.2) * 2.0) * 0.35;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / res.y;
      vec2 p = uv * 1.6;
      p += 0.25 * vec2(sin(p.y * 1.7 + t * 0.4), cos(p.x * 1.5 - t * 0.35)); // ondulation liquide

      // Orientation de la surface, pour la lumière
      float e = 0.01;
      float h = fold(p);
      vec2 g = vec2(fold(p + vec2(e, 0.0)) - h, fold(p + vec2(0.0, e)) - h) / e;
      vec3 n = normalize(vec3(-g * 0.35, 1.0));
      vec3 light = normalize(vec3(-0.4, 0.6, 0.7));
      float diffuse = clamp(dot(n, light), 0.0, 1.0);
      float shine = pow(clamp(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 24.0);

      // Reflets irisés : les couleurs changent selon l'angle des plis
      float k1 = 0.5 + 0.5 * sin(n.x * 4.0 + n.y * 3.0 + uv.x * 1.2 - t * 0.1);
      float k2 = 0.5 + 0.5 * sin(h * 3.0 + uv.y * 2.0 + 1.5);

      vec3 base  = vec3(0.016, 0.149, 0.075); // #042613
      vec3 teal  = vec3(0.055, 0.302, 0.235); // sarcelle profond (remplace le lavande)
      vec3 jade  = vec3(0.122, 0.478, 0.302); // jade (remplace le rose)
      vec3 mint  = vec3(0.247, 0.749, 0.624); // menthe (remplace le cyan)
      vec3 lime  = vec3(0.549, 0.776, 0.247); // vert pomme du site (remplace la pêche)
      vec3 anise = vec3(0.827, 0.949, 0.627); // vert anis pour les reflets les plus clairs

      // Grandes zones qui glissent lentement du vert foncé au vert clair
      float k3 = 0.5 + 0.5 * sin(uv.x * 1.1 - uv.y * 0.8 + h * 0.8 - t * 0.15);

      vec3 dark  = mix(teal, jade, k1);
      vec3 bright = mix(mint, mix(lime, anise, k2 * 0.5), k2);
      vec3 tint = mix(dark, bright, k3 * k3 * 0.75);
      vec3 color = base + tint * diffuse * diffuse * 0.605;     // +10 % de lumière
      color += mix(mint, anise, k1) * shine * 0.385;            // +10 % de brillance
      color = mix(base, color, 0.85); // reste sombre pour que les vidéos ressortent

      gl_FragColor = vec4(color, 1.0);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    canvas.remove();
    return;
  }
  gl.useProgram(program);

  // Un grand triangle qui couvre tout l'écran
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "pos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, "res");
  const uTime = gl.getUniformLocation(program, "t");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const offset = Math.random() * 100;
  let visible = true;
  let lastFrame = 0;

  function resize() {
    canvas.width = Math.max(1, Math.round(section.clientWidth * RESOLUTION));
    canvas.height = Math.max(1, Math.round(section.clientHeight * RESOLUTION));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }

  function draw(time) {
    gl.uniform1f(uTime, offset + time * SPEED);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function loop(now) {
    // ~30 images par seconde, et seulement quand la section est à l'écran
    if (visible && now - lastFrame > 33) {
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
})();
