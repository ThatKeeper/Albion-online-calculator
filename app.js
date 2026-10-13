"use strict";

const $ = id => document.getElementById(id);
const QA = s => [...document.querySelectorAll(s)];

const DEF = {
  name: "Capucha de acechador",
  tier: 5,
  ench: 1,
  price: 33000,
  rr: 25,
  extras: 500,
  tax: 0,
  share: 20,
  mats: [
    { n: "Cuero", t: "Normal", q: 8, p: 2640 },
    { n: "Visagra", t: "Artefacto", q: 1, p: 8900 }
  ],
  cities: ["Martlock", "Thetford", "Fort Sterling", "Lymhurst", "Bridgewatch"]
    .map(n => ({ n, v: n == "Lymhurst" ? 105 : 0 }))
};

const ld = k => {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch (e) {
    return null;
  }
};

let D = ld("albion:v2") || {
  recipes: ld("albion:recipes") || [],
  cur: ld("albion:cur"),
  inv: {},
  buy: {},
  plan: {},
  budget: 0,
  hist: []
};

let S = D.cur = D.cur || structuredClone(DEF);
let TAB = "calc";
let SORT = "roi";
let pend = null;

const save = () => {
  D.cur = S;
  try {
    localStorage.setItem("albion:v2", JSON.stringify(D));
  } catch (e) {
    toast("Almacenamiento lleno: exporta tus datos");
  }
};

const fm = n => "$" + Math.round(n).toLocaleString("es-DO");
const pc = n => (n * 100).toFixed(1) + "%";
const nf = n => Math.round(n).toLocaleString("es-DO");
const num = v => +v || 0;

const esc = s =>
  String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[c]));

const key = n => String(n).trim().toLowerCase();

const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 6e4)
    .toISOString()
    .slice(0, 10);

function toast(t, undo) {
  const e = $("toast");
  clearTimeout(toast.t);
  e.textContent = t;

  if (undo) {
    const b = document.createElement("button");
    b.textContent = "Deshacer";
    b.onclick = () => {
      undo();
      e.classList.remove("show");
    };
    e.append(b);
  }

  e.classList.add("show");
  toast.t = setTimeout(
    () => e.classList.remove("show"),
    undo ? 5000 : 1800
  );
}

const copy = async t => {
  try {
    await navigator.clipboard.writeText(t);
    toast("Copiado");
  } catch (e) {
    toast("No se pudo copiar");
  }
};

const CITY = {
  "Martlock": [
    "#4a86c5",
    '<path d="M6 17L11 8l3 5 2-3 3 7z"/>'
  ],
  "Thetford": [
    "#9a63c4",
    '<path d="M14 7a5 5 0 1 0 0 10 4 4 0 1 1 0-10z"/>'
  ],
  "Fort Sterling": [
    "#9fb4cc",
    '<path d="M12 6v12M6.8 9l10.4 6M6.8 15l10.4-6" stroke="#fff" stroke-width="1.6" fill="none"/>'
  ],
  "Lymhurst": [
    "#5ea84c",
    '<path d="M12 6c5 2 5 8 0 12-5-4-5-10 0-12z"/>'
  ],
  "Bridgewatch": [
    "#e0862b",
    '<circle cx="12" cy="12" r="3"/><path d="M12 5v2M12 17v2M5 12h2M17 12h2" stroke="#fff" stroke-width="1.6"/>'
  ]
};

const cityC = n => (CITY[n] || ["#8a7a5a"])[0];

const crest = n => {
  const c = CITY[n] || ["#8a7a5a", ""];

  return `<svg class="crest" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 1.5l9.5 3.5v7c0 5-4 9-9.5 11-5.5-2-9.5-6-9.5-11v-7z"
      fill="${c[0]}" stroke="rgba(0,0,0,.45)" stroke-width="1.2"/>
    <g fill="#fff" fill-opacity=".92">${c[1]}</g>
  </svg>`;
};

const slot = (img, kind, i) =>
  `<button class="slot" data-img="${kind}" data-i="${i}" title="Cambiar imagen">
    ${img
      ? `<img src="${img}" alt=""><i class="rm" title="Quitar imagen">×</i>`
      : "<span>+</span>"}
  </button>`;

const th = img => img
  ? `<img class="th" src="${img}" alt="">`
  : "";


/* ---------- Economía ---------- */

function eco(r) {
  const rr = num(r.rr) / 100;
  const tax = num(r.tax) / 100;

  let g = 0;
  let e = 0;
  let a = 0;

  r.mats.forEach(m => {
    const x = num(m.q) * num(m.p);
    g += x;
    e += x * (m.t == "Artefacto" ? 1 : 1 - rr);

    if (m.t == "Artefacto") a += x;
  });

  const ex = num(r.extras);
  const total = e + ex;
  const net = num(r.price) * (1 - tax);
  const profit = net - total;
  const vol = r.cities.reduce((s, c) => s + num(c.v), 0);

  return {
    g,
    e,
    a,
    ex,
    total,
    net,
    profit,
    vol,
    margin: net ? profit / net : 0,
    roi: total ? profit / total : 0,
    units: Math.round(vol * num(r.share) / 100),
    be: tax < 1 ? total / (1 - tax) : 0
  };
}

const verdict = (p, m) =>
  p <= 0
    ? ["NO RENTABLE", "neg"]
    : m < 0.05
      ? ["MARGEN MUY BAJO", "neg"]
      : m < 0.15
        ? ["MARGEN BAJO", "warn"]
        : ["RENTABLE", "pos"];

const recipes = () => {
  const l = [...D.recipes];

  if (S.name && !l.some(r => r.name == S.name)) {
    l.unshift({ ...S, _cur: 1 });
  }

  return l;
};

const rByName = n => recipes().find(r => r.name == n);

const row = (a, b) => `<dt>${a}</dt><dd>${b}</dd>`;


/* ---------- Calculadora ---------- */

const T = [
  "", "", "", "#8aa05a", "#4f8fd6",
  "#d65a4a", "#e8903a", "#e6c94a", "#f1f1f1"
];

const E = [
  "transparent", "#5cc46a", "#4f8fd6", "#a76be0", "#e3b04b"
];

$("tier").innerHTML = [3, 4, 5, 6, 7, 8]
  .map(t => `<option>${t}</option>`)
  .join("");

$("ench").innerHTML = [0, 1, 2, 3, 4]
  .map(t => `<option>${t}</option>`)
  .join("");

const PRE = [
  ["Base", 15.2],
  ["Bono de ciudad", 24.8],
  ["Con foco", 43.5],
  ["Foco + bono", 47.9]
];

$("presets").innerHTML = PRE
  .map(([n, v]) => `<button data-v="${v}">${n} ${v}%</button>`)
  .join("");

$("presets").onclick = e => {
  const v = e.target.dataset.v;

  if (v) {
    S.rr = +v;
    sync();
    calc();
  }
};

function calc() {
  const b = $("itemImg");
  const x = eco(S);

  $("hname").textContent = S.name || "Objeto sin nombre";
  $("hsub").textContent = `Tier ${S.tier} · Encantamiento ${S.ench}`;

  b.style.setProperty("--tc", T[S.tier] || "#888");
  b.style.setProperty("--ec", E[S.ench] || "transparent");

  b.innerHTML = S.img
    ? `<img src="${S.img}" alt=""><i class="rm" title="Quitar imagen">×</i>`
    : "<span>+</span>";

  S.mats.forEach((m, i) => {
    const r = document.querySelectorAll("#mats tr")[i];
    const g = num(m.q) * num(m.p);

    if (r) {
      r.querySelector(".g").textContent = fm(g);
      r.querySelector(".e").textContent = fm(
        g * (m.t == "Artefacto" ? 1 : 1 - num(S.rr) / 100)
      );
    }
  });

  const v = verdict(x.profit, x.margin);

  tween(x.profit);

  $("profit").className = x.profit > 0 ? "pos" : "neg";
  $("badge").textContent = v[0];
  $("badge").className = "badge " + v[1];

  $("res").innerHTML =
    row("Costo de materiales", fm(x.g)) +
    row("Valor del retorno", fm(x.g - x.e)) +
    row("Costo efectivo materiales", fm(x.e)) +
    row("Costo en artefactos", fm(x.a)) +
    row("Otros costos", fm(x.ex)) +
    row("Costo total del crafteo", fm(x.total)) +
    '<div class="sep"></div>' +
    row("Precio de venta neto", fm(x.net)) +
    row("Margen", pc(x.margin)) +
    row("ROI", pc(x.roi)) +
    row("Precio mínimo para no perder", fm(x.be));

  $("tv").textContent = nf(x.vol);
  $("tu").textContent = nf(x.units);

  QA("#cities tr").forEach((r, i) => {
    r.querySelector(".o").textContent =
      (num(S.cities[i].v) * num(S.share) / 100).toFixed(1);
  });

  const cap =
    S.mats.reduce((s, m) => s + num(m.q) * num(m.p), 0) * x.units +
    x.ex * x.units;

  const gp = x.profit * x.units;

  $("lot").innerHTML =
    row("Unidades a craftear", nf(x.units)) +
    row("Ingreso por ventas", fm(x.net * x.units)) +
    row("Costo efectivo total", fm(x.total * x.units)) +
    row(
      "Ganancia neta",
      `<b class="${gp > 0 ? "pos" : "neg"}">${fm(gp)}</b>`
    ) +
    row("Capital a tener a mano", fm(cap));

  save();
}

function sync() {
  ["name", "tier", "ench", "price", "rr", "extras", "tax", "share"]
    .forEach(k => $(k).value = S[k]);

  QA("#presets button").forEach(b =>
    b.classList.toggle("on", +b.dataset.v == +S.rr)
  );
}

function build() {
  $("mats").innerHTML = S.mats.map((m, i) => `
    <tr data-i="${i}">
      <td class="mn">
        ${slot(m.img, "mat", i)}
        <input data-k="n" value="${esc(m.n)}" aria-label="Material">
      </td>
      <td>
        <select data-k="t">
          <option${m.t == "Normal" ? " selected" : ""}>Normal</option>
          <option${m.t == "Artefacto" ? " selected" : ""}>Artefacto</option>
        </select>
      </td>
      <td>
        <input data-k="q" type="number" min="0" value="${m.q}" style="width:64px">
      </td>
      <td>
        <input data-k="p" type="number" min="0" value="${m.p}" style="width:100px">
      </td>
      <td class="r g"></td>
      <td class="r e"></td>
      <td>
        <button class="x" data-a="delmat" data-i="${i}" aria-label="Quitar">×</button>
      </td>
    </tr>
  `).join("");

  $("cities").innerHTML = S.cities.map((c, i) => `
    <tr data-i="${i}" style="--cc:${cityC(c.n)}">
      <td class="city">
        ${crest(c.n)}
        <span>${esc(c.n)}</span>
      </td>
      <td>
        <input data-k="v" type="number" min="0" value="${c.v}">
      </td>
      <td class="r o"></td>
    </tr>
  `).join("");

  sync();
  calc();
  renderSaved();
}

$("t-calc").addEventListener("input", e => {
  const t = e.target;
  const tr = t.closest("tr");

  if (tr && t.dataset.k) {
    (tr.parentNode.id == "mats" ? S.mats : S.cities)
      [+tr.dataset.i][t.dataset.k] =
        t.type == "number" ? +t.value : t.value;
  } else if (t.id && t.id in S && t.id != "img") {
    S[t.id] =
      t.type == "number" || ["tier", "ench", "tax"].includes(t.id)
        ? +t.value
        : t.value;

    if (t.id == "rr") sync();
  }

  calc();
});

function renderSaved() {
  $("saved").innerHTML = D.recipes.length
    ? D.recipes.map((r, i) => `
        <div class="saved">
          ${th(r.img) || '<i class="th"></i>'}
          <span>${esc(r.name || "Sin nombre")} T${r.tier}.${r.ench}</span>
          <button data-a="load" data-i="${i}">Cargar</button>
          <button class="x" data-a="dup" data-i="${i}" title="Duplicar" aria-label="Duplicar">⧉</button>
          <button class="x" data-a="del" data-i="${i}" aria-label="Borrar">×</button>
        </div>
      `).join("")
    : '<p class="note">Aún no hay recetas. Llena los datos y guarda la primera.</p>';
}


/* ---------- Comparador ---------- */

function renderComp() {
  const L = recipes()
    .map(r => ({ r, e: eco(r) }))
    .sort((a, b) => b.e[SORT] - a.e[SORT]);

  const H = (k, l) =>
    `<th class="r"><button data-a="sort" data-k="${k}">${l}${SORT == k ? " ▼" : ""}</button></th>`;

  $("comp").innerHTML = `
    <table style="min-width:760px">
      <thead>
        <tr>
          <th>Receta</th>
          ${H("total", "Costo")}
          ${H("net", "Venta neta")}
          ${H("profit", "Ganancia/u")}
          ${H("margin", "Margen")}
          ${H("roi", "ROI")}
          ${H("units", "Unid.")}
          <th class="r">Ganancia lote</th>
          <th></th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${L.map((o, i) => {
          const e = o.e;
          const v = verdict(e.profit, e.margin);

          return `
            <tr class="${i == 0 && e.profit > 0 ? "best" : ""}">
              <td class="mn">
                ${th(o.r.img)}
                ${esc(o.r.name || "Sin nombre")} T${o.r.tier}.${o.r.ench}
                ${o.r._cur ? " (sin guardar)" : ""}
              </td>
              <td class="r">${fm(e.total)}</td>
              <td class="r">${fm(e.net)}</td>
              <td class="r ${e.profit > 0 ? "pos" : "neg"}">${fm(e.profit)}</td>
              <td class="r">${pc(e.margin)}</td>
              <td class="r">${pc(e.roi)}</td>
              <td class="r">${nf(e.units)}</td>
              <td class="r">${fm(e.profit * e.units)}</td>
              <td><span class="badge ${v[1]}">${v[0]}</span></td>
              <td><button data-a="open" data-n="${esc(o.r.name)}">Abrir</button></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    <p class="note">La fila resaltada es la receta con mejor valor en la columna ordenada. Pulsa un encabezado para reordenar.</p>
  `;
}


/* ---------- Plan y compras ---------- */

function planCalc() {
  const need = {};
  const rows = [];

  let ex = 0;
  let profit = 0;
  let rev = 0;

  recipes().forEach(r => {
    const u = D.plan[r.name];
    if (!u) return;

    const e = eco(r);

    rows.push({ r, e, u });
    ex += e.ex * u;
    profit += e.profit * u;
    rev += e.net * u;

    r.mats.forEach(m => {
      const k = key(m.n);
      if (!k) return;

      const o = need[k] || (need[k] = {
        k,
        n: m.n,
        q: 0,
        p: num(m.p),
        img: m.img
      });

      o.q += num(m.q) * u;
    });
  });

  const items = Object.values(need).map(o => {
    const inv = num(D.inv[o.k]);
    const b = D.buy[o.k] || {};
    const buy = Math.max(0, o.q - inv);
    const price = b.price > 0 ? +b.price : o.p;

    return {
      ...o,
      inv,
      buy,
      price,
      cost: buy * price,
      done: !!b.done
    };
  });

  const cost = items.reduce((s, i) => s + i.cost, 0);

  return {
    rows,
    items,
    cost,
    ex,
    profit,
    rev,
    cap: cost + ex
  };
}

function renderPlan() {
  const P = planCalc();
  $("budget").value = D.budget || "";

  $("planrows").innerHTML = `
    <table style="min-width:420px">
      <thead>
        <tr>
          <th></th>
          <th>Receta</th>
          <th>Unidades</th>
          <th class="r">Ganancia</th>
        </tr>
      </thead>
      <tbody>
        ${recipes().map(r => {
          const u = D.plan[r.name] || "";
          const e = eco(r);

          return `
            <tr>
              <td>
                <input type="checkbox" data-c="pinc" data-n="${esc(r.name)}"${u ? " checked" : ""}>
              </td>
              <td class="mn">${th(r.img)}${esc(r.name)}</td>
              <td>
                <input type="number" min="0" data-c="punits" data-n="${esc(r.name)}" value="${u}" style="width:90px">
              </td>
              <td class="r ${e.profit > 0 ? "pos" : "neg"}">${u ? fm(e.profit * u) : "—"}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    <p class="note">Marca las recetas a fabricar. Al marcar se propone la cantidad del objetivo de mercado.</p>
  `;

  const fit = D.budget > 0 ? D.budget - P.cap : null;

  $("plansum").innerHTML =
    row("Recetas en el plan", P.rows.length) +
    row("Materiales a comprar", fm(P.cost)) +
    row("Otros costos", fm(P.ex)) +
    row("Capital necesario", fm(P.cap)) +
    (fit === null ? "" : row(
      "Presupuesto restante",
      `<b class="${fit >= 0 ? "pos" : "neg"}">${fm(fit)}</b>`
    )) +
    '<div class="sep"></div>' +
    row("Ingreso estimado", fm(P.rev)) +
    row(
      "Ganancia estimada",
      `<b class="${P.profit > 0 ? "pos" : "neg"}">${fm(P.profit)}</b>`
    );
}

function renderBuy() {
  const P = planCalc();
  const L = P.items.filter(i => i.buy > 0);
  const d = L.filter(i => i.done).length;

  $("buylist").innerHTML = L.length
    ? `
      <div class="prog"><i style="width:${d / L.length * 100}%"></i></div>
      <p class="note" style="margin:0 0 6px">${d} de ${L.length} comprados</p>
      <div class="sc">
        <table style="min-width:420px">
          <thead>
            <tr>
              <th></th>
              <th>Material</th>
              <th class="r">Cant.</th>
              <th>Precio real</th>
              <th class="r">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${L.map(i => `
              <tr class="${i.done ? "done" : ""}">
                <td><input type="checkbox" data-c="bdone" data-k="${esc(i.k)}"${i.done ? " checked" : ""}></td>
                <td class="mn">${th(i.img)}${esc(i.n)}</td>
                <td class="r">${nf(i.buy)}</td>
                <td>
                  <input type="number" min="0" data-c="bprice" data-k="${esc(i.k)}" value="${D.buy[i.k]?.price || ""}" placeholder="${Math.round(i.p)}" style="width:100px">
                </td>
                <td class="r">${fm(i.cost)}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4">Total</td>
              <td class="r">${fm(L.reduce((s, i) => s + i.cost, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="bar" style="margin-top:12px">
        <button class="pri" data-a="stock">Pasar lo comprado al inventario</button>
        <button data-a="shopcopy">Copiar lista</button>
      </div>
      <p class="note">El precio real reemplaza al estimado en el plan. La lista ya descuenta tu inventario.</p>
    `
    : '<p class="note">No hay nada por comprar. Arma un plan en la pestaña Plan o revisa tu inventario.</p>';

  const names = {};

  recipes().forEach(r => r.mats.forEach(m => {
    if (key(m.n)) names[key(m.n)] = m.n;
  }));

  $("inv").innerHTML = Object.keys(names).length
    ? `
      <table style="min-width:260px">
        <tbody>
          ${Object.entries(names).map(([k, n]) => `
            <tr>
              <td>${esc(n)}</td>
              <td>
                <input type="number" min="0" data-c="inv" data-k="${esc(k)}" value="${D.inv[k] || ""}" placeholder="0" style="width:110px">
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : '<p class="note">Agrega materiales a una receta para llevar su inventario.</p>';
}


/* ---------- Historial ---------- */

function renderHist() {
  const names = recipes().map(r => r.name);
  const v1 = $("h-name").value;
  const v2 = $("h-city").value;

  $("h-name").innerHTML = names
    .map(n => `<option>${esc(n)}</option>`)
    .join("");

  $("h-city").innerHTML =
    "<option value=''>—</option>" +
    S.cities.map(c => `<option>${esc(c.n)}</option>`).join("");

  $("h-name").value = v1;
  $("h-city").value = v2;

  if (!$("h-d").value) $("h-d").value = today();

  const st = {};

  D.hist.forEach(h => {
    if (h.type != "fab" && h.type != "venta") return;

    const s = st[h.name] || (st[h.name] = {
      f: 0,
      fc: 0,
      v: 0,
      vr: 0,
      city: {}
    });

    if (h.type == "fab") {
      s.f += h.q;
      s.fc += h.q * h.p;
    } else {
      s.v += h.q;
      s.vr += h.q * h.p;
      s.city[h.city || "—"] =
        (s.city[h.city || "—"] || 0) + h.q * h.p;
    }
  });

  let tp = 0;
  let te = 0;

  const rows = Object.entries(st).map(([n, s]) => {
    const r = rByName(n);
    const tax = r ? num(r.tax) / 100 : 0;
    const ac = s.f ? s.fc / s.f : r ? eco(r).total : 0;
    const ap = s.v ? s.vr / s.v : 0;
    const real = s.v ? s.v * (ap * (1 - tax) - ac) : 0;
    const est = r ? eco(r).profit * s.v : 0;

    tp += real;
    te += est;

    const best = Object.entries(s.city)
      .sort((a, b) => b[1] - a[1])[0];

    return `
      <tr>
        <td>${esc(n)}</td>
        <td class="r">${nf(s.f)}</td>
        <td class="r">${nf(s.v)}</td>
        <td class="r">${s.f ? fm(ac) : "—"}</td>
        <td class="r">${s.v ? fm(ap) : "—"}</td>
        <td class="r ${real >= 0 ? "pos" : "neg"}">${fm(real)}</td>
        <td class="r">${fm(est)}</td>
        <td class="r ${real - est >= 0 ? "pos" : "neg"}">${fm(real - est)}</td>
        <td>${best ? esc(best[0]) : "—"}</td>
      </tr>
    `;
  });

  $("stats").innerHTML = rows.length
    ? `
      <table style="min-width:720px">
        <thead>
          <tr>
            <th>Receta</th>
            <th class="r">Fabricadas</th>
            <th class="r">Vendidas</th>
            <th class="r">Costo prom.</th>
            <th class="r">Precio prom.</th>
            <th class="r">Ganancia real</th>
            <th class="r">Estimada</th>
            <th class="r">Diferencia</th>
            <th>Mejor ciudad</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
        <tfoot>
          <tr>
            <td colspan="5">Total</td>
            <td class="r ${tp >= 0 ? "pos" : "neg"}">${fm(tp)}</td>
            <td class="r">${fm(te)}</td>
            <td class="r ${tp - te >= 0 ? "pos" : "neg"}">${fm(tp - te)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <p class="note">Ganancia real = unidades vendidas × (precio promedio neto − costo promedio). La diferencia mide qué tan buena fue tu estimación.</p>
    `
    : '<p class="note">Registra una fabricación y una venta para ver tus resultados.</p>';

  const ft = $("h-f").value;

  const HL = D.hist
    .map((h, i) => ({ h, i }))
    .filter(o => !ft || o.h.type == ft)
    .reverse();

  $("hist").innerHTML = HL.length
    ? `
      <table style="min-width:640px">
        <tbody>
          ${HL.map(({ h, i }) => `
            <tr>
              <td>
                <input type="date" data-c="hedit" data-i="${i}" data-f="d" value="${h.d}" style="width:150px">
              </td>
              <td>${LB[h.type] || h.type}</td>
              <td>${esc(h.name)}${h.city ? " · " + esc(h.city) : ""}</td>
              <td class="r">
                <input type="number" min="0" data-c="hedit" data-i="${i}" data-f="q" value="${h.q}" style="width:70px">
                ×
                <input type="number" min="0" step="any" data-c="hedit" data-i="${i}" data-f="p" value="${h.p}" style="width:100px">
              </td>
              <td><button class="x" data-a="delh" data-i="${i}" aria-label="Borrar">×</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : '<p class="note">Sin movimientos todavía.</p>';
}


/* ---------- Acciones ---------- */

const ACT = {
  addmat() {
    S.mats.push({ n: "", t: "Normal", q: 1, p: 0 });
    build();
  },

  delmat(a) {
    S.mats.splice(+a.dataset.i, 1);
    build();
  },

  save() {
    if (!S.name) return toast("Ponle nombre a la receta");

    D.recipes = D.recipes.filter(r => r.name != S.name);
    D.recipes.unshift(structuredClone(S));

    save();
    renderSaved();
    toast("Receta guardada");
  },

  new() {
    S = {
      ...structuredClone(DEF),
      name: "",
      price: 0,
      extras: 0,
      mats: [{ n: "", t: "Normal", q: 1, p: 0 }]
    };

    build();
  },

  load(a) {
    S = structuredClone(D.recipes[+a.dataset.i]);
    build();
  },

  del(a) {
    const u = snap();

    D.recipes.splice(+a.dataset.i, 1);
    save();
    renderSaved();

    toast("Receta borrada", undoTo(u));
  },

  open(a) {
    const r = rByName(a.dataset.n);

    if (r) {
      S = structuredClone(r);
      delete S._cur;
      build();
      show("calc");
    }
  },

  sort(a) {
    SORT = a.dataset.k;
    renderComp();
  },

  fit() {
    const P = planCalc();

    if (!(D.budget > 0) || !P.cap) {
      return toast("Define un presupuesto y un plan");
    }

    const f = Math.min(1, D.budget / P.cap);

    Object.keys(D.plan).forEach(n => {
      D.plan[n] = Math.floor(D.plan[n] * f);
    });

    save();
    renderPlan();
    toast(f < 1 ? "Plan reducido a " + pc(f) : "Ya cabe en el presupuesto");
  },

  craft() {
    const P = planCalc();

    if (!P.rows.length) return toast("El plan está vacío");

    P.rows.forEach(({ r, e, u }) => {
      D.hist.push({
        d: today(),
        type: "fab",
        name: r.name,
        q: u,
        p: e.total
      });

      r.mats.forEach(m => {
        const k = key(m.n);

        if (k) {
          D.inv[k] = Math.max(
            0,
            num(D.inv[k]) - num(m.q) * u
          );
        }
      });
    });

    save();
    renderPlan();
    toast("Fabricación registrada");
  },

  stock() {
    const P = planCalc();

    P.items.filter(i => i.done && i.buy > 0).forEach(i => {
      D.inv[i.k] = num(D.inv[i.k]) + i.buy;

      D.hist.push({
        d: today(),
        type: "compra",
        name: i.n,
        q: i.buy,
        p: i.price
      });

      delete D.buy[i.k];
    });

    save();
    renderBuy();
    toast("Inventario actualizado");
  },

  shopcopy() {
    const P = planCalc();

    copy(
      P.items
        .filter(i => i.buy > 0)
        .map(i => `${i.done ? "[x]" : "[ ]"} ${i.n} ×${nf(i.buy)} (${fm(i.cost)})`)
        .join("\n")
    );
  },

  road() {
    const P = planCalc();

    if (!P.rows.length) return toast("El plan está vacío");

    const L = [
      `HOJA DE RUTA · ${today()}`,
      `Capital: ${fm(P.cap)}${D.budget > 0 ? " de " + fm(D.budget) : ""} | Ganancia estimada: ${fm(P.profit)}`,
      "",
      "1) COMPRAR",
      ...P.items
        .filter(i => i.buy > 0)
        .map(i => `- ${i.n} ×${nf(i.buy)} a ${fm(i.price)} = ${fm(i.cost)}`),
      "",
      "2) FABRICAR",
      ...P.rows.map(({ r, u }) => `- ${r.name} T${r.tier}.${r.ench} ×${nf(u)}`),
      "",
      "3) VENDER",
      ...P.rows.map(({ r, e, u }) => {
        const v = r.cities.filter(c => num(c.v) > 0);

        return `- ${r.name} a ${fm(r.price)}: ` +
          (v.length
            ? v.map(c => `${c.n} ${Math.round(u * c.v / e.vol)}`).join(", ")
            : "cualquier ciudad ×" + nf(u));
      })
    ];

    copy(L.join("\n"));
  },

  log() {
    const t = $("h-type").value;

    if (put(
      t,
      $("h-name").value,
      t == "precio" ? 1 : num($("h-q").value),
      $("h-p").value,
      $("h-city").value,
      $("h-d").value
    )) {
      renderHist();
      toast("Registrado");
    }
  },

  delh(a) {
    const u = snap();

    D.hist.splice(+a.dataset.i, 1);
    save();
    renderHist();

    toast("Movimiento borrado", undoTo(u));
  },

  dup(a) {
    const r = structuredClone(D.recipes[+a.dataset.i]);

    r.name += " (copia)";
    D.recipes.unshift(r);

    save();
    renderSaved();
    toast("Receta duplicada");
  },

  qs(a) {
    const n = a.dataset.n;
    const r = rByName(n);
    const s = stat(n);
    const q = +a.dataset.q;
    const u = snap();

    put("venta", n, q, s.last ?? num(r.price), s.city);
    renderPr();

    toast(`+${q} vendidas · ${n}`, undoTo(u));
  },

  qlog() {
    const t = $("q-t").value;

    if (put(
      t,
      cn(),
      t == "precio" ? 1 : num($("q-q").value) || 1,
      $("q-p").value,
      $("q-c").value,
      $("q-d").value
    )) {
      $("q-p").value = "";
      renderPr();
      toast("Registrado");
    }
  },

  rng(a) {
    const f = cf();

    f.days = +a.dataset.v;
    f.a = f.b = "";

    save();
    renderPr();
  },

  ser(a) {
    const f = cf();
    const k = a.dataset.v;

    f.s = f.s.includes(k) ? f.s.replace(k, "") : f.s + k;

    save();
    renderPr();
  },

  opt(a) {
    const f = cf();
    const k = a.dataset.v;

    f[k] = f[k] ? 0 : 1;

    save();
    renderPr();
  },

  applyp() {
    const n = cn();

    const L = D.hist
      .filter(h => h.name == n && (h.type == "venta" || h.type == "precio"))
      .sort((x, y) => x.d.localeCompare(y.d))
      .at(-1);

    if (!L) return toast("Aún no hay precios registrados");

    if (S.name == n) {
      S.price = L.p;
      sync();
      calc();
    }

    const q = D.recipes.find(x => x.name == n);

    if (q) q.price = L.p;

    save();
    toast("Precio de la receta: " + fm(L.p));
  },

  csv() {
    const L = [
      "fecha,tipo,receta,ciudad,cantidad,precio",
      ...D.hist.map(h => [
        h.d,
        h.type,
        '"' + h.name.replace(/"/g, '""') + '"',
        h.city || "",
        h.q,
        h.p
      ].join(","))
    ];

    const a = document.createElement("a");

    a.href = "data:text/csv;charset=utf-8," +
      encodeURIComponent("\ufeff" + L.join("\n"));

    a.download = "albion-historial.csv";
    a.click();
  }
};

const CH = {
  pinc(t) {
    const r = rByName(t.dataset.n);

    if (t.checked) {
      D.plan[t.dataset.n] = Math.max(1, eco(r).units);
    } else {
      delete D.plan[t.dataset.n];
    }

    save();
    renderPlan();
  },

  punits(t) {
    const u = Math.floor(num(t.value));

    if (u > 0) {
      D.plan[t.dataset.n] = u;
    } else {
      delete D.plan[t.dataset.n];
    }

    save();
    renderPlan();
  },

  budget(t) {
    D.budget = num(t.value);
    save();
    renderPlan();
  },

  bdone(t) {
    (D.buy[t.dataset.k] = D.buy[t.dataset.k] || {}).done = t.checked;
    save();
    renderBuy();
  },

  bprice(t) {
    (D.buy[t.dataset.k] = D.buy[t.dataset.k] || {}).price = num(t.value);
    save();
    renderBuy();
  },

  inv(t) {
    D.inv[t.dataset.k] = num(t.value);
    save();
    renderBuy();
  },

  hf: () => renderHist(),

  hedit(t) {
    const h = D.hist[+t.dataset.i];
    const f = t.dataset.f;

    if (f == "d" && !t.value) return;

    h[f] = f == "d" ? t.value : num(t.value);

    save();
    renderHist();
  },

  cf(t) {
    const f = cf();
    const k = t.dataset.k;

    f[k] = k == "g" || k == "days" ? num(t.value) : t.value;

    if (k == "days") f.a = f.b = "";

    save();
    renderPr();
  }
};

document.addEventListener("click", e => {
  const s = e.target.closest("[data-img]");

  if (s) {
    const tg = s.dataset.img == "item"
      ? S
      : S.mats[+s.dataset.i];

    if (e.target.classList.contains("rm")) {
      delete tg.img;
      build();
    } else {
      pend = tg;
      $("imgfile").click();
    }

    return;
  }

  const a = e.target.closest("[data-a]");

  if (a) ACT[a.dataset.a](a);
});

document.addEventListener("change", e => {
  const c = e.target.dataset.c;

  if (c) CH[c](e.target);
});

$("imgfile").onchange = e => {
  const f = e.target.files[0];

  e.target.value = "";

  if (!f || !pend) return;

  const u = URL.createObjectURL(f);
  const im = new Image();

  im.onload = () => {
    const c = document.createElement("canvas");

    c.width = c.height = 96;

    const s = Math.min(im.width, im.height);

    c.getContext("2d").drawImage(
      im,
      (im.width - s) / 2,
      (im.height - s) / 2,
      s,
      s,
      0,
      0,
      96,
      96
    );

    pend.img = c.toDataURL("image/webp", 0.85);
    pend = null;

    URL.revokeObjectURL(u);
    build();
  };

  im.src = u;
};

function show(t) {
  TAB = t;

  try {
    localStorage.setItem("albion:tab", t);
  } catch (e) {}

  QA("#nav button").forEach(b =>
    b.classList.toggle("on", b.dataset.t == t)
  );

  QA(".tab").forEach(s =>
    s.classList.toggle("on", s.id == "t-" + t)
  );

  ({
    comp: renderComp,
    plan: renderPlan,
    buy: renderBuy,
    hist: renderHist,
    pr: renderPr,
    calc() {}
  })[t]();
}

$("nav").onclick = e => {
  if (e.target.dataset.t) show(e.target.dataset.t);
};

$("thm").onclick = () => {
  const r = document.documentElement;
  const d = r.dataset.theme
    ? r.dataset.theme == "dark"
    : matchMedia("(prefers-color-scheme:dark)").matches;

  r.dataset.theme = d ? "light" : "dark";

  try {
    localStorage.setItem("albion:theme", r.dataset.theme);
  } catch (e) {}
};

$("rst").onclick = () => {
  if (confirm("¿Reiniciar la receta actual? El resto de tus datos se mantiene.")) {
    S = structuredClone(DEF);
    build();
  }
};

$("exp").onclick = () => {
  D.cur = S;

  const a = document.createElement("a");

  a.href = "data:application/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(D));

  a.download = "albion-crafteo.json";
  a.click();
};

$("imp").onclick = () => $("file").click();

$("file").onchange = e => {
  const f = e.target.files[0];

  if (!f) return;

  const r = new FileReader();

  r.onload = () => {
    try {
      const j = JSON.parse(r.result);

      D = {
        recipes: j.recipes || [],
        cur: j.cur || S,
        inv: j.inv || {},
        buy: j.buy || {},
        plan: j.plan || {},
        budget: j.budget || 0,
        hist: j.hist || [],
        cf: j.cf
      };

      S = D.cur;

      build();
      show(TAB);
      toast("Importado");
    } catch (x) {
      toast("Archivo inválido");
    }
  };

  r.readAsText(f);
  e.target.value = "";
};


/* ---------- Precios y ventas ---------- */

const LB = {
  fab: "Fabricación",
  venta: "Venta",
  compra: "Compra",
  precio: "Precio visto"
};

const DAY = s => Math.floor(Date.parse(s + "T00:00:00Z") / 864e5);
const DS = n => new Date(n * 864e5).toISOString().slice(0, 10);

const SER = {
  v: ["Precio de venta", "#2f9e44"],
  p: ["Precio visto", "#4f8fd6"],
  c: ["Costo", "#d6553f"],
  m: ["Mínimo para no perder", "#d08a00"],
  u: ["Unidades vendidas", "#b8861f"]
};

const cf = () => D.cf = D.cf || {
  r: "",
  c: "",
  a: "",
  b: "",
  g: 1,
  days: 90,
  s: "vpcmu",
  sm: 0,
  z: 0
};

const cn = () => {
  const f = cf();

  return f.r && rByName(f.r)
    ? f.r
    : (recipes()[0] || {}).name;
};

const snap = () => {
  D.cur = S;
  return JSON.stringify(D);
};

const undoTo = s => () => {
  D = JSON.parse(s);
  S = D.cur;

  build();
  show(TAB);
};

let tw = 0;
let pv = 0;

function tween(to) {
  const el = $("profit");
  const f = pv;
  const t0 = performance.now();

  cancelAnimationFrame(tw);

  const st = t => {
    const k = Math.min(1, (t - t0) / 350);

    pv = f + (to - f) * (1 - Math.pow(1 - k, 3));
    el.textContent = fm(pv);

    if (k < 1) tw = requestAnimationFrame(st);
  };

  tw = requestAnimationFrame(st);
}

const stat = n => {
  const s = {
    f: 0,
    v: 0,
    vr: 0,
    last: null,
    city: ""
  };

  D.hist.forEach(h => {
    if (h.name != n) return;

    if (h.type == "fab") s.f += h.q;

    if (h.type == "venta") {
      s.v += h.q;
      s.vr += h.q * h.p;
      s.last = h.p;
      s.city = h.city || "";
    }
  });

  return s;
};

function put(t, n, q, p, city, d) {
  const r = rByName(n);

  if (!r || q <= 0) {
    toast("Elige receta y cantidad");
    return;
  }

  p = num(p);

  if (t == "precio" && !p) {
    toast("Escribe el precio visto");
    return;
  }

  D.hist.push({
    d: d || today(),
    type: t,
    name: n,
    q,
    p: p || (t == "fab" ? eco(r).total : num(r.price)),
    city: t == "fab" ? "" : city
  });

  save();
  return 1;
}

function renderPr() {
  const f = cf();
  const n = cn();
  const co = S.cities
    .map(c => `<option>${esc(c.n)}</option>`)
    .join("");
  const qc = $("q-c").value;

  $("c-r").innerHTML = recipes()
    .map(r => `<option>${esc(r.name)}</option>`)
    .join("");

  $("c-r").value = n || "";

  $("c-c").innerHTML = "<option value=''>Todas</option>" + co;
  $("c-c").value = f.c || "";

  $("q-c").innerHTML = "<option value=''>—</option>" + co;
  $("q-c").value = qc;

  $("c-g").value = f.g;
  $("c-n").value = f.a || f.b ? "" : f.days || "";

  if (!$("q-d").value) $("q-d").value = today();

  $("c-rg").innerHTML = [
    [7, "7 días"],
    [30, "30 días"],
    [90, "90 días"],
    [365, "1 año"],
    [0, "Todo"]
  ].map(([v, l]) => `
    <button data-a="rng" data-v="${v}" class="${!f.a && !f.b && f.days == v ? "on" : ""}">${l}</button>
  `).join("");

  $("c-s").innerHTML = Object.entries(SER).map(([k, [l, c]]) => `
    <button data-a="ser" data-v="${k}" style="border-left:4px solid ${c}" class="${f.s.includes(k) ? "on" : ""}">${l}</button>
  `).join("") + `
    <button data-a="opt" data-v="sm" class="${f.sm ? "on" : ""}">Suavizar</button>
    <button data-a="opt" data-v="z" class="${f.z ? "on" : ""}">Eje desde cero</button>
  `;

  const R = recipes().map(r => ({ r, s: stat(r.name) }));

  $("sales").innerHTML = R.length
    ? `
      <table style="min-width:640px">
        <thead>
          <tr>
            <th>Receta</th>
            <th class="r">Fabricadas</th>
            <th class="r">Vendidas</th>
            <th class="r">En stock</th>
            <th>Vendido</th>
            <th class="r">Precio prom.</th>
            <th>Registrar venta</th>
          </tr>
        </thead>
        <tbody>
          ${R.map(({ r, s }) => `
            <tr>
              <td class="mn">${th(r.img)}${esc(r.name)}</td>
              <td class="r">${nf(s.f)}</td>
              <td class="r">${nf(s.v)}</td>
              <td class="r ${s.f - s.v < 0 ? "neg" : ""}">${nf(s.f - s.v)}</td>
              <td style="min-width:110px">
                <div class="prog">
                  <i style="width:${s.f ? Math.min(100, s.v / s.f * 100) : 0}%"></i>
                </div>
              </td>
              <td class="r">${s.v ? fm(s.vr / s.v) : "—"}</td>
              <td>
                ${[1, 5, 10].map(q => `
                  <button data-a="qs" data-n="${esc(r.name)}" data-q="${q}">+${q}</button>
                `).join(" ")}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : '<p class="note">Ponle nombre a una receta para registrar ventas.</p>';

  renderChart();
}

function renderChart() {
  const f = cf();
  const n = cn();
  const el = $("chart");

  if (!n) {
    el.innerHTML = "";
    $("c-sum").innerHTML = "";
    return;
  }

  const r = rByName(n);
  const g = +f.g || 1;

  const H = D.hist.filter(h =>
    h.name == n && (!f.c || h.type == "fab" || h.city == f.c)
  );

  let b = f.b ? DAY(f.b) : DAY(today());

  let a = f.a
    ? DAY(f.a)
    : f.days > 0
      ? b - f.days + 1
      : H.length
        ? Math.min(...H.map(h => DAY(h.d)))
        : b - 29;

  if (a > b) [a, b] = [b, a];

  a = Math.max(a, b - 3650);

  $("c-a").value = DS(a);
  $("c-b").value = DS(b);

  const nb = Math.floor((b - a) / g) + 1;

  const B = Array.from({ length: nb }, () => ({
    vq: 0,
    vs: 0,
    pn: 0,
    ps: 0,
    cq: 0,
    cs: 0
  }));

  H.forEach(h => {
    const d = DAY(h.d);

    if (d < a || d > b) return;

    const k = B[Math.floor((d - a) / g)];

    if (h.type == "venta") {
      k.vq += h.q;
      k.vs += h.q * h.p;
    } else if (h.type == "precio") {
      k.pn++;
      k.ps += h.p;
    } else if (h.type == "fab") {
      k.cq += h.q;
      k.cs += h.q * h.p;
    }
  });

  const P = {
    v: [],
    p: [],
    c: []
  };

  B.forEach((k, i) => {
    if (k.vq) P.v.push({ i, y: k.vs / k.vq });
    if (k.pn) P.p.push({ i, y: k.ps / k.pn });
    if (k.cq) P.c.push({ i, y: k.cs / k.cq });
  });

  const rv = P.v.map(p => p.y);
  const U = B.reduce((s, k) => s + k.vq, 0);
  const Rv = B.reduce((s, k) => s + k.vs, 0);

  if (f.sm) {
    for (const k in P) {
      P[k] = P[k].map((p, i, A) => {
        const w = A.slice(Math.max(0, i - 1), i + 2);

        return {
          ...p,
          y: w.reduce((s, q) => s + q.y, 0) / w.length
        };
      });
    }
  }

  const on = k => f.s.includes(k);
  const be = eco(r).be;
  const ys = [];

  ["v", "p", "c"].forEach(k => {
    if (on(k)) P[k].forEach(p => ys.push(p.y));
  });

  if (on("m")) ys.push(be);

  let lo = ys.length ? Math.min(...ys) : 0;
  let hi = ys.length ? Math.max(...ys) : 1;

  if (hi == lo) {
    hi += 1;
    lo -= 1;
  }

  const pd = (hi - lo) * 0.1;

  hi += pd;
  lo = f.z ? 0 : Math.max(0, lo - pd);

  const W = 760;
  const Ht = 320;
  const L = 70;
  const Rm = 16;
  const T = 14;
  const Bt = 34;
  const pw = W - L - Rm;
  const ph = Ht - T - Bt;

  const X = i => L + (nb > 1 ? i / (nb - 1) * pw : pw / 2);
  const Y = v => T + ph - (v - lo) / (hi - lo) * ph;

  const umax = Math.max(1, ...B.map(k => k.vq));
  const bw = Math.max(2, Math.min(30, pw / nb * 0.7));

  let s = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Gráfico de precios">`;

  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * i / 4;
    const y = Y(v);

    s += `
      <line class="gl" x1="${L}" x2="${W - Rm}" y1="${y}" y2="${y}"/>
      <text class="ax" x="${L - 8}" y="${y + 4}" text-anchor="end">${fm(v)}</text>
    `;
  }

  const st = Math.ceil(nb / 6);

  for (let i = 0; i < nb; i += st) {
    const d = DS(a + i * g);

    s += `
      <text class="ax" x="${X(i)}" y="${Ht - 10}" text-anchor="middle">${d.slice(8)}/${d.slice(5, 7)}</text>
    `;
  }

  if (on("u")) {
    B.forEach((k, i) => {
      if (k.vq) {
        const h = k.vq / umax * ph * 0.35;

        s += `
          <rect class="bc" x="${X(i) - bw / 2}" y="${T + ph - h}" width="${bw}" height="${h}" rx="2" fill="${SER.u[1]}"/>
        `;
      }
    });
  }

  if (on("m")) {
    s += `
      <line x1="${L}" x2="${W - Rm}" y1="${Y(be)}" y2="${Y(be)}" stroke="${SER.m[1]}" stroke-width="1.5" stroke-dasharray="6 4"/>
    `;
  }

  ["c", "p", "v"].forEach(k => {
    if (!on(k) || !P[k].length) return;

    const c = SER[k][1];

    s += P[k].length > 1
      ? `
        <path class="line" pathLength="1" stroke="${c}" d="${P[k].map((p, j) =>
          (j ? "L" : "M") +
          X(p.i).toFixed(1) + " " +
          Y(p.y).toFixed(1)
        ).join("")}"/>
      `
      : "";

    s += P[k].map(p => `
      <circle cx="${X(p.i)}" cy="${Y(p.y)}" r="3.5" fill="${c}" stroke="var(--pn)" stroke-width="1.5"/>
    `).join("");
  });

  s += `
    <rect class="zr" y="${T}" height="${ph}" fill="${SER.u[1]}" opacity="0"/>
    <line class="cur" y1="${T}" y2="${T + ph}" stroke="var(--mu)" stroke-dasharray="3 3" opacity="0"/>
    </svg>
    <div class="tip"></div>
  `;

  el.innerHTML = s;

  $("c-note").textContent = ys.length || U
    ? "Arrastra sobre el gráfico para acercar un rango. Las barras son las unidades vendidas por período."
    : "Sin datos en este rango. Anota ventas o precios abajo, o cambia el rango.";

  $("c-sum").innerHTML =
    row("Unidades vendidas", nf(U)) +
    row("Ingresos brutos", fm(Rv)) +
    row("Precio medio de venta", U ? fm(Rv / U) : "—") +
    (rv.length
      ? row("Mínimo / máximo", fm(Math.min(...rv)) + " / " + fm(Math.max(...rv)))
      : "") +
    (rv.length > 1 && rv[0] > 0
      ? row(
          "Variación en el rango",
          `<b class="${rv.at(-1) >= rv[0] ? "pos" : "neg"}">${pc(rv.at(-1) / rv[0] - 1)}</b>`
        )
      : "");

  const sv = el.firstChild;
  const tp = el.querySelector(".tip");
  const cu = sv.querySelector(".cur");
  const zr = sv.querySelector(".zr");

  let z0 = null;

  const ix = e => {
    const q = sv.getBoundingClientRect();

    return Math.max(
      0,
      Math.min(
        nb - 1,
        Math.round(
          ((e.clientX - q.left) / q.width * W - L) / pw * (nb - 1)
        ) || 0
      )
    );
  };

  sv.onpointermove = e => {
    const i = ix(e);
    const k = B[i];
    const x = X(i);

    cu.setAttribute("x1", x);
    cu.setAttribute("x2", x);
    cu.style.opacity = 1;

    if (z0 != null) {
      zr.setAttribute("x", X(Math.min(z0, i)));
      zr.setAttribute("width", Math.abs(X(i) - X(z0)));
      zr.style.opacity = 0.25;
    }

    const d = DS(a + i * g);

    tp.innerHTML = `
      <b>${g > 1 ? d + " → " + DS(Math.min(b, a + i * g + g - 1)) : d}</b>
    ` + (
      [
        ["v", k.vq && fm(k.vs / k.vq)],
        ["p", k.pn && fm(k.ps / k.pn)],
        ["c", k.cq && fm(k.cs / k.cq)],
        ["u", k.vq && nf(k.vq) + " u."]
      ]
        .filter(([q, v]) => v && on(q))
        .map(([q, v]) => `
          <div>
            <i style="background:${SER[q][1]}"></i>
            ${SER[q][0]}: <b>${v}</b>
          </div>
        `)
        .join("") || "<div>Sin datos</div>"
    );

    tp.style.display = "block";
    tp.style.left = x / W * 100 + "%";
    tp.classList.toggle("fl", x / W > 0.6);
  };

  sv.onpointerdown = e => {
    z0 = ix(e);
    sv.setPointerCapture(e.pointerId);
  };

  sv.onpointerup = e => {
    const i = ix(e);
    const z = z0;

    z0 = null;
    zr.style.opacity = 0;

    if (z != null && z != i) {
      f.a = DS(a + Math.min(z, i) * g);
      f.b = DS(Math.min(b, a + Math.max(z, i) * g + g - 1));

      save();
      renderPr();
    }
  };

  sv.onpointerleave = () => {
    cu.style.opacity = 0;
    tp.style.display = "none";
  };
}

document.addEventListener("focusin", e => {
  if (e.target.type == "number") e.target.select();
});

addEventListener("keydown", e => {
  const TB = ["calc", "comp", "plan", "buy", "hist", "pr"];
  const k = TB[+e.code.slice(5) - 1];

  if (e.altKey && k) {
    e.preventDefault();
    show(k);
  } else if ((e.ctrlKey || e.metaKey) && e.key == "s") {
    e.preventDefault();
    ACT.save();
  } else if (
    e.key == "Enter" &&
    e.target.closest &&
    e.target.closest("#qa") &&
    e.target.tagName == "INPUT"
  ) {
    ACT.qlog();
  }
});

try {
  const th0 = localStorage.getItem("albion:theme");

  if (th0) document.documentElement.dataset.theme = th0;
} catch (e) {}

let t0;

try {
  t0 = localStorage.getItem("albion:tab");
} catch (e) {}

build();
show(["calc", "comp", "plan", "buy", "hist", "pr"].includes(t0) ? t0 : "calc");