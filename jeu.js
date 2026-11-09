/* ==========================================================================
   Komara Mines Guinée — moteur de jeu
   Camion benne, pelle hydraulique, trémie, pompe à gazole.
   Tout est dessiné en vectoriel : aucun asset à charger, démarrage instantané.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------- sites -------------------------------- */
  const SITES = [
    {
      id: "boke", nom: "Boké", minerai: "bauxite", couleur: "#c96a3a",
      prix: 14, objectif: 800, monde: 2000,
      pelle: { x: 520, y: 620 }, tremie: { x: 1520, y: 1480 }, pompe: { x: 1450, y: 600 },
      rochers: 16, description: "La bauxite part vers le port de Conakry.",
    },
    {
      id: "siguiri", nom: "Siguiri", minerai: "or", couleur: "#f5cf1b",
      prix: 70, objectif: 3000, monde: 2200,
      pelle: { x: 640, y: 1560 }, tremie: { x: 1700, y: 620 }, pompe: { x: 420, y: 520 },
      rochers: 24, description: "L'or de Haute-Guinée, au bord du Niger.",
    },
    {
      id: "simandou", nom: "Simandou", minerai: "fer", couleur: "#8c93a8",
      prix: 42, objectif: 9000, monde: 2400,
      pelle: { x: 1900, y: 1900 }, tremie: { x: 420, y: 460 }, pompe: { x: 1150, y: 1180 },
      rochers: 34, description: "Le fer du Sud-Est, la plus grande réserve au monde.",
    },
    {
      id: "banankoro", nom: "Banankoro", minerai: "diamant", couleur: "#4fd6e6",
      prix: 180, objectif: 25000, monde: 2600,
      pelle: { x: 460, y: 2100 }, tremie: { x: 2100, y: 500 }, pompe: { x: 2150, y: 2000 },
      rochers: 44, description: "Le diamant du Kérouané, le plus dur des contrats.",
    },
  ];

  /* ---------------------------- sauvegarde ------------------------------ */
  const CLE = "komara-mines-v1";
  const DEFAUT = {
    argent: 0, livraisons: 0, site: 0, termines: [],
    amels: { capacite: 0, moteur: 0, reservoir: 0, rendement: 0 },
    son: true,
  };

  function charger() {
    try {
      const brut = JSON.parse(localStorage.getItem(CLE) || "null");
      if (!brut || typeof brut !== "object") return { ...DEFAUT, amels: { ...DEFAUT.amels }, termines: [] };
      return {
        ...DEFAUT, ...brut,
        amels: { ...DEFAUT.amels, ...(brut.amels || {}) },
        termines: Array.isArray(brut.termines) ? brut.termines : [],
      };
    } catch (e) {
      return { ...DEFAUT, amels: { ...DEFAUT.amels }, termines: [] };
    }
  }
  let sauvegarde = charger();
  function enregistrer() {
    try { localStorage.setItem(CLE, JSON.stringify(sauvegarde)); } catch (e) {}
  }

  /* --------------------------- ameliorations ---------------------------- */
  const AMELS = [
    {
      cle: "capacite", nom: "Capacité de la benne", unite: "t",
      valeurs: [20, 25, 32, 40, 50], couts: [400, 1100, 2600, 6000],
      detail: (n) => n + " tonnes par voyage",
    },
    {
      cle: "moteur", nom: "Moteur et boîte", unite: "km/h",
      valeurs: [340, 400, 470, 550], couts: [500, 1300, 3200],
      detail: (n) => Math.round(n / 3.6) + " km/h",
    },
    {
      cle: "reservoir", nom: "Réservoir de gazole", unite: "L",
      valeurs: [70, 90, 115, 145], couts: [350, 900, 2200],
      detail: (n) => n + " litres",
    },
    {
      cle: "rendement", nom: "Contrat de vente", unite: "%",
      valeurs: [0, 10, 22, 35], couts: [600, 1600, 4000],
      detail: (n) => "prix + " + n + " %",
    },
  ];

  const niveau = (cle) => sauvegarde.amels[cle] || 0;
  const valeurAmel = (cle) => {
    const a = AMELS.find((x) => x.cle === cle);
    return a.valeurs[Math.min(niveau(cle), a.valeurs.length - 1)];
  };
  const capaciteMax = () => valeurAmel("capacite");
  const vitesseMax = () => valeurAmel("moteur");
  const reservoirMax = () => valeurAmel("reservoir");
  const multiPrix = () => 1 + valeurAmel("rendement") / 100;

  /* ------------------------------ utilitaires --------------------------- */
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const euros = (n) => Math.round(n).toLocaleString("fr-FR") + " €";

  // generateur pseudo-aleatoire deterministe
  function rng(graine) {
    let s = graine >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* -------------------------------- etat -------------------------------- */
  const etat = {
    ecran: "accueil",
    siteIndex: 0,
    enPause: false,
    argent: 0,
    charge: 0,
    gazole: 100,
    livraisonsSite: 0,
    gainSite: 0,
    camion: { x: 1000, y: 1000, angle: 0, v: 0 },
    camera: { x: 1000, y: 1000 },
    particules: [],
    flottants: [],
    temps: 0,
    dernierMsg: "",
  };

  let SCENE = null;
  let site = SITES[0];
  let rochers = [];
  let decor = [];
  let routes = [];

  // filet de securite : si une erreur survient, on l'affiche au lieu d'un ecran fige
  window.addEventListener("error", function (e) {
    const b = document.getElementById("bulle");
    if (b) { b.classList.remove("cache"); b.textContent = "Erreur technique : " + e.message; }
  });

  /* ------------------------------ canvas -------------------------------- */
  // polyfill roundRect (Safari 15 et navigateurs anciens)
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rr = Math.min(typeof r === "number" ? r : 8, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
      return this;
    };
  }

  const canvas = $("#scene");
  const ctx = canvas.getContext("2d");
  let L = 0, H = 0, DPR = 1;

  function redimensionner() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    L = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(L * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", redimensionner);

  /* --------------------------- motif de terrain ------------------------- */
  let motifSol = null;
  function fabriquerSol(couleurMinerai) {
    const c = document.createElement("canvas");
    c.width = c.height = 220;
    const g = c.getContext("2d");
    g.fillStyle = "#a34a26";
    g.fillRect(0, 0, 220, 220);
    const r = rng(7);
    for (let i = 0; i < 420; i++) {
      const x = r() * 220, y = r() * 220, rad = 1 + r() * 7;
      const teinte = r();
      g.fillStyle =
        teinte > 0.72 ? "rgba(196,110,60,0.55)" :
        teinte > 0.42 ? "rgba(139,60,30,0.45)" :
        "rgba(122,52,26,0.35)";
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    // petits eclats de minerai
    for (let i = 0; i < 60; i++) {
      g.fillStyle = couleurMinerai;
      g.globalAlpha = 0.16 + r() * 0.2;
      g.beginPath();
      g.arc(r() * 220, r() * 220, 1 + r() * 2.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return ctx.createPattern(c, "repeat");
  }

  /* ------------------------------ monde --------------------------------- */
  function preparerSite(i) {
    etat.siteIndex = clamp(i, 0, SITES.length - 1);
    site = SITES[etat.siteIndex];
    const r = rng(1000 + etat.siteIndex * 77);
    const M = site.monde;

    rochers = [];
    decor = [];
    const occupe = [site.pelle, site.tremie, site.pompe];

    for (let k = 0; k < site.rochers; k++) {
      let x, y, ok, essais = 0;
      do {
        x = 120 + r() * (M - 240);
        y = 120 + r() * (M - 240);
        ok = true;
        for (const o of occupe) if (Math.hypot(o.x - x, o.y - y) < 320) { ok = false; break; }
        for (const o of rochers) if (Math.hypot(o.x - x, o.y - y) < 150) { ok = false; break; }
        essais++;
      } while (!ok && essais < 60);
      rochers.push({ x, y, r: 26 + r() * 34, teinte: r() });
    }

    for (let k = 0; k < 140; k++) {
      decor.push({
        x: r() * M, y: r() * M,
        taille: 6 + r() * 16,
        type: r() > 0.62 ? "buisson" : "herbe",
        a: r() * Math.PI * 2,
      });
    }

    routes = [
      [site.pelle, site.tremie],
      [site.tremie, site.pompe],
      [site.pelle, site.pompe],
    ];

    motifSol = fabriquerSol(site.couleur);

    etat.camion.x = M / 2;
    etat.camion.y = M / 2 + 120;
    etat.camion.angle = -Math.PI / 2;
    etat.camion.v = 0;
    etat.camera.x = etat.camion.x;
    etat.camera.y = etat.camion.y;
    etat.charge = 0;
    etat.gazole = reservoirMax();
    etat.gainSite = 0;
    etat.livraisonsSite = 0;
    etat.particules.length = 0;
    etat.flottants.length = 0;
    etat.argent = sauvegarde.argent;
    etat.enPause = false;
    bulle("");
  }

  /* ------------------------------ entrées ------------------------------- */
  const input = { x: 0, y: 0, frein: false };
  const clampJoystick = 2.6; // rem

  function brancherJoystick() {
    const zone = $("#zone-joystick");
    const base = $("#joystick");
    const bouton = base.querySelector("i");
    let actif = false, id = null, cx = 0, cy = 0;

    function origine() {
      const b = base.getBoundingClientRect();
      cx = b.left + b.width / 2;
      cy = b.top + b.height / 2;
    }

    function deplacer(px, py) {
      const rayon = base.getBoundingClientRect().width * 0.42;
      let dx = px - cx, dy = py - cy;
      const d = Math.hypot(dx, dy);
      if (d > rayon) { dx = (dx / d) * rayon; dy = (dy / d) * rayon; }
      bouton.style.transform = "translate(" + dx + "px," + dy + "px)";
      const nx = dx / rayon, ny = dy / rayon;
      const mag = Math.hypot(nx, ny);
      input.x = nx;
      input.y = ny;
      input.mag = Math.min(mag, 1);
    }

    function fin() {
      actif = false; id = null;
      input.x = input.y = input.mag = 0;
      bouton.style.transform = "translate(0,0)";
      base.classList.remove("actif");
    }

    zone.addEventListener("pointerdown", (e) => {
      if (etat.ecran !== "jeu" || etat.enPause) return;
      actif = true; id = e.pointerId;
      zone.setPointerCapture(id);
      origine();
      base.classList.add("actif");
      deplacer(e.clientX, e.clientY);
      e.preventDefault();
    }, { passive: false });

    zone.addEventListener("pointermove", (e) => {
      if (!actif || e.pointerId !== id) return;
      deplacer(e.clientX, e.clientY);
      e.preventDefault();
    }, { passive: false });

    ["pointerup", "pointercancel", "pointerleave"].forEach((t) =>
      zone.addEventListener(t, (e) => { if (e.pointerId === id) fin(); })
    );
  }

  function brancherClavier() {
    const touches = {};
    window.addEventListener("keydown", (e) => {
      touches[e.key.toLowerCase()] = true;
      if (e.key === " ") { input.frein = true; e.preventDefault(); }
      if (e.key === "Escape") basculerPause();
      if (e.key.toLowerCase() === "g" && etat.ecran === "jeu") ouvrirGarage();
    });
    window.addEventListener("keyup", (e) => {
      touches[e.key.toLowerCase()] = false;
      if (e.key === " ") input.frein = false;
    });

    setInterval(() => {
      if (etat.ecran !== "jeu" || input.mag > 0.05) return;
      let x = 0, y = 0;
      if (touches["arrowleft"] || touches["q"] || touches["a"]) x -= 1;
      if (touches["arrowright"] || touches["d"]) x += 1;
      if (touches["arrowup"] || touches["z"] || touches["w"]) y -= 1;
      if (touches["arrowdown"] || touches["s"]) y += 1;
      const m = Math.hypot(x, y);
      if (m > 0) { input.x = x / m; input.y = y / m; input.mag = 1; }
      else if (!touches["arrowleft"] && !touches["arrowright"] && !touches["arrowup"] && !touches["arrowdown"]) {
        input.x = input.y = 0; input.mag = 0;
      }
    }, 40);
  }

  /* -------------------------------- audio ------------------------------- */
  const audio = { ctx: null, moteur: null, gainMoteur: null, filtre: null, actif: false };

  function audioInit() {
    if (audio.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio.ctx = new AC();
    const o = audio.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 60;
    const f = audio.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 320;
    const g = audio.ctx.createGain();
    g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(audio.ctx.destination);
    o.start();
    audio.moteur = o; audio.gainMoteur = g; audio.filtre = f;
  }

  function bip(freq, duree, type, vol) {
    if (!sauvegarde.son) return;
    audioInit();
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol == null ? 0.16 : vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (duree || 0.18));
    o.connect(g); g.connect(audio.ctx.destination);
    o.start(t); o.stop(t + (duree || 0.18) + 0.02);
  }

  function sonMoteur(ratio, actif) {
    if (!sauvegarde.son || !audio.moteur) return;
    const t = audio.ctx.currentTime;
    const f = 48 + ratio * 74;
    audio.moteur.frequency.setTargetAtTime(f, t, 0.08);
    audio.filtre.frequency.setTargetAtTime(260 + ratio * 460, t, 0.1);
    audio.gainMoteur.gain.setTargetAtTime(actif ? 0.035 + ratio * 0.03 : 0.012, t, 0.12);
  }

  /* ------------------------------- physique ----------------------------- */
  function mettreAJour(dt) {
    if (etat.ecran !== "jeu" || etat.enPause) return;
    etat.temps += dt;
    const c = etat.camion;
    const vMax = vitesseMax();

    // direction voulue
    const mag = input.mag || 0;
    if (mag > 0.12) {
      const cible = Math.atan2(input.y, input.x);
      let diff = ((cible - c.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const vitesseRot = 2.6 + Math.min(c.v / vMax, 1) * 1.9;
      c.angle += clamp(diff, -vitesseRot * dt, vitesseRot * dt);
    }

    // vitesse
    const cibleV = input.frein ? 0 : mag * vMax;
    const accel = input.frein ? 780 : 520;
    if (c.v < cibleV) c.v = Math.min(cibleV, c.v + accel * dt);
    else c.v = Math.max(cibleV, c.v - accel * dt);

    // avance
    if (c.v > 0.4) {
      c.x += Math.cos(c.angle) * c.v * dt;
      c.y += Math.sin(c.angle) * c.v * dt;
    }

    // limites du monde
    const M = site.monde;
    c.x = clamp(c.x, 60, M - 60);
    c.y = clamp(c.y, 60, M - 60);

    // collisions avec les rochers
    for (const ro of rochers) {
      const d = Math.hypot(c.x - ro.x, c.y - ro.y);
      const mini = ro.r + 30;
      if (d < mini && d > 0.01) {
        const nx = (c.x - ro.x) / d, ny = (c.y - ro.y) / d;
        c.x = ro.x + nx * mini;
        c.y = ro.y + ny * mini;
        c.v *= 0.35;
        if (c.v > 90) poussiere(c.x, c.y, 5);
      }
    }

    // camera avec avance
    const cibleCamX = c.x + Math.cos(c.angle) * Math.min(c.v * 0.32, 90);
    const cibleCamY = c.y + Math.sin(c.angle) * Math.min(c.v * 0.32, 90);
    etat.camera.x = lerp(etat.camera.x, cibleCamX, 1 - Math.pow(0.0016, dt));
    etat.camera.y = lerp(etat.camera.y, cibleCamY, 1 - Math.pow(0.0016, dt));

    // gazole
    const ratio = Math.min(c.v / vMax, 1);
    etat.gazole = Math.max(0, etat.gazole - (0.2 + ratio * 0.58) * dt);

    // poussiere derriere les roues
    if (c.v > 60 && Math.random() < 0.55) poussiere(c.x - Math.cos(c.angle) * 34, c.y - Math.sin(c.angle) * 34, 1);

    // interactions
    const dPelle = dist(c, site.pelle);
    const dTremie = dist(c, site.tremie);
    const dPompe = dist(c, site.pompe);
    const arrete = c.v < 55;

    if (etat.gazole <= 0.01) {
      c.v = 0;
      bulle("Panne sèche ! Il faut du gazole pour repartir.");
      if (dPompe < 150) remplir(dt);
    } else if (dPompe < 150 && etaGazolePlein() === false) {
      remplir(dt);
    } else if (dPelle < 150 && etat.charge < capaciteMax()) {
      if (arrete) charger(dt);
      else bulle("Arrête le camion dans le cercle pour charger.");
    } else if (dTremie < 155 && etat.charge > 0.05) {
      if (arrete) decharger(dt);
      else bulle("Arrête-toi dans le cercle pour vider la benne.");
    } else if (etat.charge >= capaciteMax() - 0.01) {
      bulle("Benne pleine. File à la trémie.");
    } else {
      bulle("");
    }

    // particules
    for (let i = etat.particules.length - 1; i >= 0; i--) {
      const p = etat.particules[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vie -= dt;
      p.r += dt * 14;
      if (p.vie <= 0) etat.particules.splice(i, 1);
    }
    for (let i = etat.flottants.length - 1; i >= 0; i--) {
      const f = etat.flottants[i];
      f.y -= 34 * dt; f.vie -= dt;
      if (f.vie <= 0) etat.flottants.splice(i, 1);
    }

    sonMoteur(ratio, true);
  }

  function etaGazolePlein() { return etat.gazole >= reservoirMax() - 0.4; }

  function poussiere(x, y, n) {
    for (let i = 0; i < n; i++) {
      etat.particules.push({
        x, y,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        r: 3 + Math.random() * 5,
        vie: 0.5 + Math.random() * 0.5,
        max: 1,
      });
    }
  }

  let sonCharge = 0;
  function charger(dt) {
    const avant = etat.charge;
    etat.charge = Math.min(capaciteMax(), etat.charge + 7 * dt);
    if (etat.charge > avant) {
      sonCharge += dt;
      if (sonCharge > 0.34) { sonCharge = 0; bip(320 + Math.random() * 60, 0.06, "square", 0.05); }
      if (Math.random() < 0.45) poussiere(etat.camion.x, etat.camion.y, 1);
    }
    bulle("Chargement de " + site.minerai + "… " + etat.charge.toFixed(0) + " / " + capaciteMax() + " t");
  }

  function remplir(dt) {
    const manque = reservoirMax() - etat.gazole;
    if (manque < 0.3) { bulle("Réservoir plein."); return; }
    const debit = Math.min(manque, 9 * dt);
    const cout = debit * 0.8;
    if (etat.argent < cout) { bulle("Pas assez d'argent pour le gazole."); return; }
    etat.gazole += debit;
    etat.argent -= cout;
    sauvegarde.argent = etat.argent;
    bulle("Plein de gazole en cours… " + Math.round(etat.gazole) + " L");
    if (Math.random() < 0.3) bip(520, 0.04, "sine", 0.04);
  }

  function decharger(dt) {
    const debit = Math.min(etat.charge, 9 * dt);
    const gain = debit * site.prix * multiPrix();
    etat.charge -= debit;
    etat.argent += gain;
    etat.gainSite += gain;
    etat.livraisonsSite += (etat.charge <= 0.001 ? 1 : 0);
    sauvegarde.argent = etat.argent;
    if (etat.charge <= 0.001) {
      sauvegarde.livraisons += 1;
      etat.flottants.push({ x: etat.camion.x, y: etat.camion.y - 40, texte: "+" + euros(gain), vie: 1.6 });
      bip(660, 0.12, "sine", 0.16);
      setTimeout(() => bip(880, 0.16, "sine", 0.16), 110);
      enregistrer();
      verifierObjectif();
    }
    bulle("Déchargement… " + etat.charge.toFixed(0) + " t restantes");
  }

  function verifierObjectif() {
    if (sauvegarde.termines.indexOf(site.id) !== -1) return;
    if (etat.gainSite < site.objectif) return;
    sauvegarde.termines.push(site.id);
    enregistrer();
    ouvrirFinSite();
  }

  /* -------------------------------- rendu ------------------------------- */
  function dessiner() {
    if (!ctx) return;
    ctx.clearRect(0, 0, L, H);

    const cam = etat.camera;
    const ox = L / 2 - cam.x;
    const oy = H / 2 - cam.y;

    ctx.save();
    ctx.translate(ox, oy);

    // sol
    ctx.fillStyle = motifSol || "#a34a26";
    ctx.fillRect(cam.x - L / 2 - 40, cam.y - H / 2 - 40, L + 80, H + 80);

    // pistes
    for (const [a, b] of routes) dessinerRoute(a, b);

    // decor (visible seulement)
    for (const d of decor) {
      if (Math.abs(d.x - cam.x) > L / 2 + 60 || Math.abs(d.y - cam.y) > H / 2 + 60) continue;
      if (d.type === "buisson") {
        ctx.fillStyle = "rgba(52,86,44,0.92)";
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.taille, d.taille * 0.78, d.a, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(88,128,66,0.55)";
        ctx.beginPath();
        ctx.ellipse(d.x - d.taille * 0.2, d.y - d.taille * 0.2, d.taille * 0.5, d.taille * 0.4, d.a, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(122,74,36,0.75)";
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + Math.cos(d.a + k) * d.taille, d.y + Math.sin(d.a + k) * d.taille);
          ctx.stroke();
        }
      }
    }

    // emprises des zones
    dessinerZone(site.pelle, 150, "#ffd700");
    dessinerZone(site.tremie, 155, "#35d07f");
    dessinerZone(site.pompe, 150, "#7dd3fc");

    // trémie + pompe + pelle
    dessinerTremie(site.tremie);
    dessinerPompe(site.pompe);
    dessinerPelle(site.pelle);

    // rochers
    for (const ro of rochers) {
      if (Math.abs(ro.x - cam.x) > L / 2 + 80 || Math.abs(ro.y - cam.y) > H / 2 + 80) continue;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(ro.x + 5, ro.y + 7, ro.r, ro.r * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      const gris = 70 + ro.teinte * 46;
      ctx.fillStyle = "rgb(" + Math.round(gris) + "," + Math.round(gris * 0.95) + "," + Math.round(gris * 0.9) + ")";
      ctx.beginPath();
      ctx.ellipse(ro.x, ro.y, ro.r, ro.r * 0.84, ro.teinte * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.beginPath();
      ctx.ellipse(ro.x - ro.r * 0.22, ro.y - ro.r * 0.24, ro.r * 0.45, ro.r * 0.3, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // particules
    for (const p of etat.particules) {
      ctx.globalAlpha = Math.max(0, p.vie) * 0.5;
      ctx.fillStyle = "#d9a071";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // camion
    dessinerCamion();

    // fleches indicatrices vers la cible
    dessinerGuide();

    // textes flottants
    ctx.textAlign = "center";
    ctx.font = "800 20px -apple-system, system-ui, sans-serif";
    for (const f of etat.flottants) {
      ctx.globalAlpha = Math.min(1, f.vie);
      ctx.fillStyle = "#0a0a0a";
      ctx.fillText(f.texte, f.x + 1.5, f.y + 1.5);
      ctx.fillStyle = "#ffd700";
      ctx.fillText(f.texte, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    dessinerMini();
  }

  function dessinerRoute(a, b) {
    ctx.save();
    ctx.strokeStyle = "rgba(214,160,110,0.5)";
    ctx.lineWidth = 46;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(186,131,84,0.55)";
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function dessinerZone(p, r, couleur) {
    ctx.save();
    ctx.strokeStyle = couleur;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = couleur;
    ctx.fill();
    ctx.restore();
  }

  function dessinerPelle(p) {
    const charge = etat.charge / capaciteMax();
    const actif = dist(etat.camion, p) < 150 && etat.camion.v < 55;
    const bal = Math.sin(etat.temps * 2.2) * (actif ? 1 : 0.25);
    ctx.save();
    ctx.translate(p.x, p.y);

    // ombre
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(6, 10, 62, 44, 0, 0, Math.PI * 2);
    ctx.fill();

    // chenilles
    ctx.fillStyle = "#26242a";
    ctx.beginPath();
    ctx.roundRect(-56, -44, 112, 22, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-56, 22, 112, 22, 8);
    ctx.fill();
    ctx.fillStyle = "#3a3742";
    for (let i = -48; i <= 44; i += 16) {
      ctx.fillRect(i, -42, 6, 18);
      ctx.fillRect(i, 24, 6, 18);
    }

    // tourelle
    ctx.save();
    ctx.rotate(Math.PI * 0.72 + bal * 0.16);
    // bras
    ctx.strokeStyle = "#c9a227";
    ctx.lineWidth = 15;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(52 + bal * 8, 0);
    ctx.lineTo(92 + bal * 10, 22);
    ctx.stroke();
    // godet
    ctx.fillStyle = "#8b7415";
    ctx.beginPath();
    ctx.roundRect(86 + bal * 10, 10, 30, 34, 7);
    ctx.fill();
    // minerai dans le godet
    ctx.fillStyle = site.couleur;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(90 + bal * 10, 14, 22, 16, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // corps
    ctx.fillStyle = "#e0a800";
    ctx.beginPath();
    ctx.roundRect(-40, -32, 84, 64, 14);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.roundRect(-34, -26, 72, 20, 9);
    ctx.fill();

    // cabine
    ctx.fillStyle = "#1d2530";
    ctx.beginPath();
    ctx.roundRect(-26, -18, 40, 38, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(125,211,252,0.5)";
    ctx.beginPath();
    ctx.roundRect(-21, -13, 30, 28, 6);
    ctx.fill();

    // bande tricolore
    ctx.fillStyle = "#d11231"; ctx.fillRect(14, -30, 7, 60);
    ctx.fillStyle = "#f5cf1b"; ctx.fillRect(21, -30, 7, 60);
    ctx.fillStyle = "#009a44"; ctx.fillRect(28, -30, 7, 60);

    ctx.restore();

    // etat de la pelle
    ctx.save();
    ctx.font = "700 13px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = actif ? "#ffd700" : "rgba(255,255,255,0.8)";
    ctx.fillText(actif ? "CHARGEMENT" : "PELLE", p.x, p.y + 78);
    ctx.restore();
  }

  function dessinerTremie(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(8, 12, 78, 62, 0, 0, Math.PI * 2);
    ctx.fill();

    // structure
    ctx.fillStyle = "#4a4f5c";
    ctx.beginPath();
    ctx.roundRect(-72, -58, 144, 116, 14);
    ctx.fill();
    ctx.fillStyle = "#2f333d";
    ctx.beginPath();
    ctx.roundRect(-52, -40, 104, 80, 10);
    ctx.fill();

    // ouverture
    ctx.fillStyle = "#12141a";
    ctx.beginPath();
    ctx.roundRect(-36, -26, 72, 52, 8);
    ctx.fill();
    // minerai au fond
    ctx.fillStyle = site.couleur;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.roundRect(-28, -18, 56, 36, 6);
    ctx.fill();
    ctx.globalAlpha = 1;

    // grille
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    for (let i = -24; i <= 24; i += 12) {
      ctx.beginPath(); ctx.moveTo(i, -26); ctx.lineTo(i, 26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-36, i); ctx.lineTo(36, i); ctx.stroke();
    }

    // bandes de securite
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(-72, -58, 144, 7);
    ctx.fillStyle = "#d11231";
    ctx.fillRect(-72, 51, 144, 7);

    ctx.font = "800 12px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd700";
    ctx.fillText("TRÉMIE · VENTE", 0, 84);
    ctx.restore();
  }

  function dessinerPompe(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.beginPath();
    ctx.ellipse(6, 10, 56, 44, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#20313f";
    ctx.beginPath();
    ctx.roundRect(-50, -40, 100, 80, 12);
    ctx.fill();
    ctx.fillStyle = "#2d4356";
    ctx.beginPath();
    ctx.roundRect(-42, -32, 84, 50, 9);
    ctx.fill();

    // pompe
    ctx.fillStyle = "#7dd3fc";
    ctx.beginPath();
    ctx.roundRect(20, 8, 18, 30, 5);
    ctx.fill();
    ctx.fillStyle = "#0e1720";
    ctx.beginPath();
    ctx.roundRect(-34, -24, 46, 30, 6);
    ctx.fill();
    ctx.fillStyle = "#7dd3fc";
    ctx.font = "800 15px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⛽", -11, -3);

    ctx.font = "800 12px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText("GAZOLE", 0, 64);
    ctx.restore();
  }

  function dessinerCamion() {
    const c = etat.camion;
    const cap = capaciteMax();
    const rempli = etat.charge / cap;

    // ombre
    ctx.save();
    ctx.translate(c.x + 6, c.y + 9);
    ctx.rotate(c.angle);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.roundRect(-42, -25, 88, 50, 12);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);

    // roues
    ctx.fillStyle = "#15151a";
    [[-26, -27], [-26, 27], [16, -27], [16, 27], [32, -25], [32, 25]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.roundRect(x - 10, y - 6, 20, 12, 4);
      ctx.fill();
    });

    // benne
    ctx.fillStyle = "#3c3f4a";
    ctx.beginPath();
    ctx.roundRect(-44, -24, 62, 48, 8);
    ctx.fill();

    // minerai visible
    if (rempli > 0.02) {
      ctx.fillStyle = site.couleur;
      ctx.globalAlpha = 0.35 + rempli * 0.6;
      ctx.beginPath();
      ctx.roundRect(-42, -21, 58, 42, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      for (let i = 0; i < 8; i++) {
        const px = -38 + ((i * 17) % 52);
        const py = -16 + ((i * 23) % 32);
        ctx.beginPath();
        ctx.arc(px, py, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // cabine
    ctx.fillStyle = "#e8b800";
    ctx.beginPath();
    ctx.roundRect(18, -22, 26, 44, 7);
    ctx.fill();
    ctx.fillStyle = "#1d2530";
    ctx.beginPath();
    ctx.roundRect(23, -17, 16, 34, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(125,211,252,0.55)";
    ctx.beginPath();
    ctx.roundRect(25, -14, 12, 28, 4);
    ctx.fill();

    // phares
    ctx.fillStyle = "#fff6c2";
    ctx.beginPath(); ctx.roundRect(43, -18, 4, 8, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(43, 10, 4, 8, 2); ctx.fill();

    // bande tricolore sur la benne
    ctx.fillStyle = "#d11231"; ctx.fillRect(-16, -24, 5, 48);
    ctx.fillStyle = "#f5cf1b"; ctx.fillRect(-11, -24, 5, 48);
    ctx.fillStyle = "#009a44"; ctx.fillRect(-6, -24, 5, 48);

    ctx.restore();
  }

  function dessinerGuide() {
    const c = etat.camion;
    const plein = etat.charge >= capaciteMax() - 0.01;
    const cible = plein ? site.tremie : (etat.gazole < 18 ? site.pompe : site.pelle);
    const d = dist(c, cible);
    if (d < 320) return;

    const a = Math.atan2(cible.y - c.y, cible.x - c.x);
    const r = 92;
    const x = c.x + Math.cos(a) * r;
    const y = c.y + Math.sin(a) * r;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.globalAlpha = 0.75 + Math.sin(etat.temps * 4) * 0.2;
    ctx.fillStyle = plein ? "#35d07f" : "#ffd700";
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ------------------------------- minimap ------------------------------ */
  const mini = $("#mini");
  const mctx = mini.getContext("2d");
  let miniTaille = 0;

  function dessinerMini() {
    const t = mini.clientWidth;
    if (!t) return;
    if (miniTaille !== t) {
      miniTaille = t;
      mini.width = Math.round(t * 2);
      mini.height = Math.round(t * 2);
      mctx.setTransform(2, 0, 0, 2, 0, 0);
    }
    const M = site.monde;
    const k = t / M;
    mctx.clearRect(0, 0, t, t);
    mctx.fillStyle = "#1b1410";
    mctx.fillRect(0, 0, t, t);

    const pt = (p, coul, r) => {
      mctx.fillStyle = coul;
      mctx.beginPath();
      mctx.arc(p.x * k, p.y * k, r, 0, Math.PI * 2);
      mctx.fill();
    };
    pt(site.pelle, "#ffd700", 3);
    pt(site.tremie, "#35d07f", 3);
    pt(site.pompe, "#7dd3fc", 2.6);

    mctx.fillStyle = "#ffffff";
    mctx.beginPath();
    mctx.arc(etat.camion.x * k, etat.camion.y * k, 3.4, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = "rgba(255,255,255,0.55)";
    mctx.lineWidth = 1.4;
    mctx.beginPath();
    mctx.moveTo(etat.camion.x * k, etat.camion.y * k);
    mctx.lineTo(etat.camion.x * k + Math.cos(etat.camion.angle) * 7, etat.camion.y * k + Math.sin(etat.camion.angle) * 7);
    mctx.stroke();
  }

  /* --------------------------------- HUD -------------------------------- */
  const hud = {
    argent: $("#hud-argent"), site: $("#hud-site"),
    charge: $("#txt-charge"), barCharge: $("#bar-charge"),
    gaz: $("#txt-gazole"), barGaz: $("#bar-gazole"),
    objectif: $("#txt-objectif"), barObjectif: $("#bar-objectif"),
  };
  const bulleEl = $("#bulle");
  let msgActuel = "";

  function bulle(txt) {
    if (txt === msgActuel) return;
    msgActuel = txt;
    if (!txt) { bulleEl.classList.add("cache"); return; }
    bulleEl.textContent = txt;
    bulleEl.classList.remove("cache");
  }

  let dernierHud = 0;
  function majHud(force) {
    if (!force && etat.temps - dernierHud < 0.12) return;
    dernierHud = etat.temps;
    hud.argent.textContent = euros(etat.argent);
    hud.site.textContent = site.nom + " · " + site.minerai;
    hud.charge.textContent = Math.floor(etat.charge) + " / " + capaciteMax() + " t";
    hud.barCharge.style.width = (etat.charge / capaciteMax()) * 100 + "%";
    const gazPct = etat.gazole / reservoirMax();
    hud.gaz.textContent = Math.round(gazPct * 100) + " %";
    hud.barGaz.style.width = gazPct * 100 + "%";
    hud.barGaz.parentElement.classList.toggle("vide", gazPct < 0.18);
    hud.objectif.textContent = euros(etat.gainSite) + " / " + euros(site.objectif);
    hud.barObjectif.style.width = Math.min(100, (etat.gainSite / site.objectif) * 100) + "%";
  }

  /* --------------------------------- boucle ----------------------------- */
  let dernier = 0;
  function boucle(ts) {
    if (!dernier) dernier = ts;
    let dt = (ts - dernier) / 1000;
    dernier = ts;
    dt = Math.min(dt, 0.05);

    mettreAJour(dt);
    if (etat.ecran === "jeu") { dessiner(); majHud(false); }
    requestAnimationFrame(boucle);
  }

  /* ------------------------------- ecrans ------------------------------- */
  function afficher(id) {
    document.querySelectorAll(".ecran").forEach((e) => e.classList.toggle("actif", e.id === id));
    etat.ecran = id;
  }

  function ouvrirJeu(i) {
    preparerSite(i);
    afficher("jeu");
    redimensionner();
    majHud(true);
    etat.enPause = false;
    audioInit();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
  }

  function basculerPause() {
    if (etat.ecran !== "jeu") return;
    etat.enPause = !etat.enPause;
    $("#voile-pause").classList.toggle("cache", !etat.enPause);
    if (audio.gainMoteur) audio.gainMoteur.gain.setTargetAtTime(0.005, audio.ctx.currentTime, 0.1);
  }

  function ouvrirGarage() {
    if (etat.ecran !== "jeu") return;
    etat.enPause = true;
    $("#voile-garage").classList.remove("cache");
    dessinerGarage();
  }
  function fermerGarage() {
    $("#voile-garage").classList.add("cache");
    etat.enPause = false;
  }

  function dessinerGarage() {
    $("#garage-argent").textContent = euros(sauvegarde.argent);
    const zone = $("#liste-ameliorations");
    zone.innerHTML = "";
    AMELS.forEach((a) => {
      const niv = niveau(a.cle);
      const max = niv >= a.valeurs.length - 1;
      const cout = max ? 0 : a.couts[niv];
      const div = document.createElement("div");
      div.className = "amelioration" + (max ? " max" : "");
      div.innerHTML =
        '<div><span class="nom">' + a.nom + '</span>' +
        '<span class="niveau">' + a.detail(a.valeurs[niv]) + (max ? " · au maximum" : "") + "</span></div>";
      const b = document.createElement("button");
      b.textContent = max ? "MAX" : euros(cout);
      b.disabled = max || sauvegarde.argent < cout;
      b.addEventListener("click", () => {
        if (sauvegarde.argent < cout) return;
        sauvegarde.argent -= cout;
        sauvegarde.amels[a.cle] = niv + 1;
        etat.argent = sauvegarde.argent;
        enregistrer();
        bip(720, 0.1, "sine", 0.14);
        setTimeout(() => bip(980, 0.14, "sine", 0.14), 90);
        if (a.cle === "reservoir") etat.gazole = Math.min(reservoirMax(), etat.gazole + 0);
        if (a.cle === "capacite") etat.charge = Math.min(etat.charge, capaciteMax());
        dessinerGarage();
        majHud(true);
      });
      div.appendChild(b);
      zone.appendChild(div);
    });
  }

  function ouvrirFinSite() {
    etat.enPause = true;
    const suivant = SITES[etat.siteIndex + 1];
    $("#site-titre").textContent = site.nom + " terminé";
    $("#site-texte").textContent = suivant
      ? "Objectif atteint : " + euros(site.objectif) + ". Tu débloques " + suivant.nom + ", " + suivant.minerai + "."
      : "Objectif atteint sur les quatre sites. Tu es le meilleur conducteur de Guinée.";
    const btn = $("#btn-site-suivant");
    btn.textContent = suivant ? "Aller à " + suivant.nom : "Rejouer Banankoro";
    btn.onclick = () => {
      $("#voile-site").classList.add("cache");
      ouvrirJeu(suivant ? etat.siteIndex + 1 : etat.siteIndex);
      enregistrer();
    };
    $("#voile-site").classList.remove("cache");
    if (audio.ctx) {
      bip(660, 0.14, "sine", 0.15);
      setTimeout(() => bip(880, 0.16, "sine", 0.15), 130);
      setTimeout(() => bip(1100, 0.22, "sine", 0.15), 270);
    }
  }

  function dessinerAccueil() {
    $("#acc-argent").textContent = euros(sauvegarde.argent);
    $("#acc-livr").textContent = sauvegarde.livraisons;
    $("#acc-site").textContent = SITES[Math.min(sauvegarde.site, SITES.length - 1)].nom;

    const zone = $("#liste-sites");
    zone.innerHTML = "";
    SITES.forEach((s, i) => {
      const fini = sauvegarde.termines.indexOf(s.id) !== -1;
      const dispo = i === 0 || sauvegarde.termines.indexOf(SITES[i - 1].id) !== -1;
      const d = document.createElement("div");
      d.className = "site-carte" + (fini ? " fini" : "") + (dispo ? "" : " verrou");
      d.innerHTML =
        '<span class="pastille" style="background:' + s.couleur + ";color:" + s.couleur + '"></span>' +
        "<div><b>" + s.nom + "</b><em>" + s.minerai + " · " + s.prix + " €/t" + (fini ? " · terminé ✓" : dispo ? "" : " · verrouillé") + "</em></div>";
      zone.appendChild(d);
    });
  }

  /* ------------------------------- boutons ------------------------------ */
  function brancherBoutons() {
    $("#btn-jouer").addEventListener("click", () => {
      audioInit();
      if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
      const i = Math.min(sauvegarde.site, SITES.length - 1);
      // reprendre au premier site non termine
      let depart = 0;
      for (let k = 0; k < SITES.length; k++) {
        if (sauvegarde.termines.indexOf(SITES[k].id) === -1) { depart = k; break; }
        depart = k;
      }
      ouvrirJeu(depart);
    });

    $("#btn-reset").addEventListener("click", () => {
      if (!confirm("Effacer la progression et repartir de zéro ?")) return;
      sauvegarde = { ...DEFAUT, amels: { ...DEFAUT.amels }, termines: [] };
      enregistrer();
      dessinerAccueil();
    });

    $("#btn-pause").addEventListener("click", basculerPause);
    $("#btn-frein").addEventListener("pointerdown", (e) => { input.frein = true; e.preventDefault(); });
    $("#btn-frein").addEventListener("pointerup", () => { input.frein = false; });
    $("#btn-frein").addEventListener("pointerleave", () => { input.frein = false; });
    $("#btn-garage").addEventListener("click", ouvrirGarage);
    $("#fermer-garage").addEventListener("click", fermerGarage);

    $("#reprendre").addEventListener("click", basculerPause);
    $("#vers-accueil").addEventListener("click", () => {
      $("#voile-pause").classList.add("cache");
      etat.enPause = false;
      sauvegarde.site = etat.siteIndex;
      enregistrer();
      dessinerAccueil();
      afficher("accueil");
    });
    $("#btn-rester").addEventListener("click", () => {
      $("#voile-site").classList.add("cache");
      etat.enPause = false;
    });

    $("#btn-son").addEventListener("click", () => {
      sauvegarde.son = !sauvegarde.son;
      enregistrer();
      $("#btn-son").textContent = sauvegarde.son ? "🔊" : "🔇";
      if (!sauvegarde.son && audio.gainMoteur) audio.gainMoteur.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.1);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && etat.ecran === "jeu" && !etat.enPause) basculerPause();
    });
  }

  /* -------------------------------- init -------------------------------- */
  function demarrer() {
    $("#btn-son").textContent = sauvegarde.son ? "🔊" : "🔇";
    redimensionner();
    brancherJoystick();
    brancherClavier();
    brancherBoutons();
    dessinerAccueil();
    preparerSite(Math.min(sauvegarde.site, SITES.length - 1));
    afficher("accueil");
    requestAnimationFrame(boucle);

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
