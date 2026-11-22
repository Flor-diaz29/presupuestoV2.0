const $ = id => document.getElementById(id);

const DEF_SHORT = [
  {desc:'Instalación de boca de luz', qty:1, price:15000},
  {desc:'Instalación de toma corriente', qty:1, price:12000},
  {desc:'Instalación de interruptor simple', qty:1, price:10000},
  {desc:'Tablero seccional (mano de obra)', qty:1, price:80000},
  {desc:'Cañería embutida (por metro)', qty:1, price:3500},
  {desc:'Cable 2,5 mm² (por metro)', qty:1, price:2800},
  {desc:'Mano de obra (hora)', qty:1, price:12000},
  {desc:'Revisión / diagnóstico', qty:1, price:20000}
];

const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){ toast('No se pudo guardar en este dispositivo'); } }
};

const money = n => '$ ' + (Number(n)||0).toLocaleString('es-AR',{minimumFractionDigits:2, maximumFractionDigits:2});
const num4 = n => String(n).padStart(4,'0');
const today = () => new Date().toLocaleDateString('es-AR');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toNum = v => parseFloat(String(v).replace(',','.')) || 0;
const subtotal = it => (Number(it.qty)||0) * (Number(it.price)||0);
const total = () => state.items.reduce((a,it) => a + subtotal(it), 0);

function newState(){
  return {cliente:{nombre:'', tel:'', email:'', dir:''}, items:[], validez:'7 días', obs:'', num:counter, emitted:false};
}

let profile = store.get('presu_profile', null);
let shortcuts = store.get('presu_shortcuts', DEF_SHORT);
let counter = store.get('presu_counter', 1);
let state = store.get('presu_draft', null) || newState();
let editingP = false;
let pendingLogo = '';
let scDraft = [];
let pdfCache = null, pdfTimer = null;

function toast(m){
  const el = $('toast'); el.textContent = m; el.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 2800);
}

/* ---------- MIS DATOS ---------- */
function renderProfile(){
  const p = profile;
  $('hdrLogo').classList.toggle('hidden', !(p && p.logo));
  if(p && p.logo) $('hdrLogo').src = p.logo;
  const showForm = !p || editingP;
  $('profileForm').classList.toggle('hidden', !showForm);
  $('profileView').classList.toggle('hidden', showForm);
  $('btnCancelP').classList.toggle('hidden', !p);
  if(p){
    $('pvText').innerHTML = '<strong style="font-size:16px">'+esc(p.nombre)+'</strong><br>'
      + (p.cuil ? 'CUIL: '+esc(p.cuil)+'<br>' : '')
      + 'Tel: '+esc(p.tel)+'<br>'
      + (p.email ? esc(p.email)+'<br>' : '')
      + (p.mat ? 'Matrícula: '+esc(p.mat)+'<br>' : '');
    $('pvLogo').src = p.logo || '';
    $('pvLogo').classList.toggle('hidden', !p.logo);
  }
}
function openProfile(edit){
  if(edit && profile){
    $('pNombre').value = profile.nombre||''; $('pCuil').value = profile.cuil||'';
    $('pTel').value = profile.tel||''; $('pEmail').value = profile.email||'';
    $('pMat').value = profile.mat||'';
    pendingLogo = profile.logo || '';
  } else {
    pendingLogo = profile ? (profile.logo||'') : '';
  }
  editingP = edit || !profile;
  refreshLogoPrev();
  renderProfile();
  window.scrollTo({top:0, behavior:'smooth'});
}
function refreshLogoPrev(){
  $('pLogoPrev').src = pendingLogo || '';
  $('pLogoPrev').classList.toggle('hidden', !pendingLogo);
  $('btnLogoRm').classList.toggle('hidden', !pendingLogo);
}
function resizeImage(file, max){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0,0,c.width,c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = rej; img.src = r.result;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

$('btnProfile').onclick = () => openProfile(true);
$('btnEditP').onclick = () => openProfile(true);
$('btnCancelP').onclick = () => { editingP = false; renderProfile(); };
$('pLogo').onchange = async e => {
  const f = e.target.files[0]; if(!f) return;
  try { pendingLogo = await resizeImage(f, 400); refreshLogoPrev(); }
  catch(err){ toast('No se pudo leer la imagen'); }
};
$('btnLogoRm').onclick = () => { pendingLogo = ''; refreshLogoPrev(); };
$('profileForm').onsubmit = e => {
  e.preventDefault();
  profile = {
    nombre:$('pNombre').value.trim(), cuil:$('pCuil').value.trim(),
    tel:$('pTel').value.trim(), email:$('pEmail').value.trim(),
    mat:$('pMat').value.trim(), logo:pendingLogo
  };
  store.set('presu_profile', profile);
  editingP = false;
  renderProfile(); refresh();
  toast('Datos guardados');
};

/* ---------- CLIENTE Y VALIDEZ ---------- */
[['cNombre','nombre'],['cTel','tel'],['cEmail','email'],['cDir','dir']].forEach(([id,k]) => {
  $(id).addEventListener('input', e => { state.cliente[k] = e.target.value; refresh(); });
});
$('validez').onchange = e => { state.validez = e.target.value; refresh(); };
$('obs').addEventListener('input', e => { state.obs = e.target.value; refresh(); });

/* ---------- ÍTEMS ---------- */
function renderItems(){
  $('items').innerHTML = state.items.length ? state.items.map((it,i) => `
    <div class="item">
      <label>Descripción</label>
      <input data-i="${i}" data-f="desc" value="${esc(it.desc)}" placeholder="Ej: Instalación de tomas">
      <div class="item-nums">
        <div><label>Cant.</label><input data-i="${i}" data-f="qty" inputmode="decimal" value="${esc(it.qty)}"></div>
        <div><label>Precio unit.</label><input data-i="${i}" data-f="price" inputmode="decimal" value="${esc(it.price)}"></div>
        <div class="sub">${money(subtotal(it))}</div>
        <button class="del" data-del="${i}" aria-label="Eliminar ítem">✕</button>
      </div>
    </div>`).join('')
    : '<p class="muted">Sin ítems todavía. Tocá un atajo o agregá uno manual.</p>';
  refresh();
}
$('items').addEventListener('input', e => {
  const t = e.target, i = +t.dataset.i, f = t.dataset.f;
  if(isNaN(i) || !f || !state.items[i]) return;
  state.items[i][f] = f === 'desc' ? t.value : toNum(t.value);
  const row = t.closest('.item');
  if(row) row.querySelector('.sub').textContent = money(subtotal(state.items[i]));
  refresh();
});
$('items').addEventListener('click', e => {
  const b = e.target.closest('[data-del]'); if(!b) return;
  state.items.splice(+b.dataset.del, 1); renderItems();
});
$('btnAddItem').onclick = () => {
  state.items.push({desc:'', qty:1, price:0}); renderItems();
  const inputs = $('items').querySelectorAll('input[data-f="desc"]');
  if(inputs.length) inputs[inputs.length-1].focus();
};

/* ---------- ATAJOS ---------- */
function renderChips(){
  $('chips').innerHTML = shortcuts.map((s,i) =>
    `<button class="chip" data-sc="${i}">${esc(s.desc)}<small>${money(s.price)}</small></button>`).join('');
}
$('chips').onclick = e => {
  const b = e.target.closest('[data-sc]'); if(!b) return;
  const s = shortcuts[+b.dataset.sc];
  state.items.push({desc:s.desc, qty:Number(s.qty)||1, price:Number(s.price)||0});
  renderItems(); toast('Agregado: ' + s.desc);
};
function drawShort(){
  $('shortList').innerHTML = scDraft.map((s,i) => `
    <div class="item">
      <label>Descripción</label>
      <input data-s="${i}" data-f="desc" value="${esc(s.desc)}" placeholder="Descripción">
      <div class="sc-nums">
        <div><label>Cant.</label><input data-s="${i}" data-f="qty" inputmode="decimal" value="${esc(s.qty)}"></div>
        <div><label>Precio unit.</label><input data-s="${i}" data-f="price" inputmode="decimal" value="${esc(s.price)}"></div>
        <button class="del" data-sdel="${i}" aria-label="Quitar atajo">✕</button>
      </div>
    </div>`).join('') || '<p class="muted">No hay atajos. Agregá uno.</p>';
}
function openShort(){ scDraft = JSON.parse(JSON.stringify(shortcuts)); drawShort(); $('modalShort').classList.remove('hidden'); }
$('btnManageShort').onclick = openShort;
$('closeShort').onclick = () => $('modalShort').classList.add('hidden');
$('addShort').onclick = () => { scDraft.push({desc:'', qty:1, price:0}); drawShort(); };
$('shortList').addEventListener('input', e => {
  const t = e.target, i = +t.dataset.s, f = t.dataset.f;
  if(isNaN(i) || !f) return;
  scDraft[i][f] = f === 'desc' ? t.value : toNum(t.value);
});
$('shortList').addEventListener('click', e => {
  const b = e.target.closest('[data-sdel]'); if(!b) return;
  scDraft.splice(+b.dataset.sdel, 1); drawShort();
});
$('saveShort').onclick = () => {
  shortcuts = scDraft.filter(s => String(s.desc).trim());
  store.set('presu_shortcuts', shortcuts);
  renderChips(); $('modalShort').classList.add('hidden'); toast('Atajos guardados');
};
$('restoreShort').onclick = () => { scDraft = JSON.parse(JSON.stringify(DEF_SHORT)); drawShort(); };

/* ---------- VISTA PREVIA ---------- */
function renderPreview(){
  const p = profile || {}; const c = state.cliente;
  const rows = state.items.map(it => `<tr>
      <td>${esc(it.desc) || '<span class="muted">(sin descripción)</span>'}</td>
      <td class="r">${esc(it.qty)}</td>
      <td class="r">${money(it.price)}</td>
      <td class="r">${money(subtotal(it))}</td></tr>`).join('');
  $('paper').innerHTML = `
    <div class="doc-head">
      <div>${p.logo ? `<img class="doc-logo" src="${p.logo}" alt="Logo">` : '<div class="muted">(Logo)</div>'}</div>
      <div class="doc-title"><h3>PRESUPUESTO</h3>N° ${num4(state.num)}<br>Fecha de emisión: ${today()}<br>Validez: ${esc(state.validez)}</div>
    </div>
    <div class="doc-info-box">
      <div class="doc-info-title">Electricista</div>
      <div class="doc-info-grid">
        <div class="doc-info-field"><strong>Nombre:</strong><span>${esc(p.nombre || 'Completá tus datos')}</span></div>
        <div class="doc-info-field"><strong>Tel:</strong><span>${esc(p.tel || '-')}</span></div>
        <div class="doc-info-field"><strong>Mail:</strong><span>${esc(p.email || '-')}</span></div>
        <div class="doc-info-field"><strong>CUIL:</strong><span>${esc(p.cuil || '-')}</span></div>
        ${p.mat ? `<div class="doc-info-field"><strong>Matrícula:</strong><span>${esc(p.mat)}</span></div>` : ''}
      </div>
    </div>
    <div class="doc-info-box">
      <div class="doc-info-title">Cliente</div>
      <div class="doc-info-grid">
        <div class="doc-info-field"><strong>Nombre:</strong><span>${esc(c.nombre || '-')}</span></div>
        <div class="doc-info-field"><strong>Tel:</strong><span>${esc(c.tel || '-')}</span></div>
        <div class="doc-info-field"><strong>Mail:</strong><span>${esc(c.email || '-')}</span></div>
        <div class="doc-info-field"><strong>Dirección:</strong><span>${esc(c.dir || '-')}</span></div>
      </div>
    </div>
    <table>
      <colgroup><col style="width:46%"><col style="width:10%"><col style="width:22%"><col style="width:22%"></colgroup>
      <thead><tr><th>Descripción</th><th class="r">Cant.</th><th class="r">P. unit.</th><th class="r">Subtotal</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">Sin ítems</td></tr>'}</tbody>
    </table>
    <div class="doc-total"><span>TOTAL</span><strong>${money(total())}</strong></div>
    <div class="doc-block"><small>OBSERVACIONES</small><div class="obs-box">${esc(state.obs)}</div></div>`;
}

function saveDraft(){ store.set('presu_draft', state); }
function refresh(){
  saveDraft();
  $('total').textContent = money(total());
  renderPreview();
  clearTimeout(pdfTimer);
  pdfTimer = setTimeout(async () => { pdfCache = await makePdfFile().catch(() => null); }, 400);
}

/* ---------- PDF (generado en canvas y envuelto en PDF) ---------- */
function loadImg(src){
  return new Promise((res, rej) => {
    if(!src) return res(null);
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
  });
}
function wrap(g, text, maxW){
  const words = String(text||'').split(/\s+/).filter(Boolean);
  const out = []; let line = '';
  for(const w of words){
    const t = line ? line + ' ' + w : w;
    if(g.measureText(t).width > maxW && line){ out.push(line); line = w; }
    else line = t;
  }
  if(line) out.push(line);
  return out.length ? out : [''];
}
function drawLines(g, x, y, title, arr){
  g.fillStyle = '#6b7787'; g.font = 'bold 22px Arial'; g.fillText(title, x, y); y += 40;
  arr.filter(Boolean).forEach((t,i) => {
    g.fillStyle = '#1d2733';
    g.font = i === 0 ? 'bold 30px Arial' : '28px Arial';
    g.fillText(t, x, y); y += 40;
  });
  return y;
}
async function buildCanvas(){
  const W = 1240, H = 1754, M = 80;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0,0,W,H);
  const p = profile || {}, cl = state.cliente;
  let logo = null; try { logo = await loadImg(p.logo); } catch(e){}
  if(logo){
    const k = Math.min(480/logo.width, 250/logo.height);
    g.drawImage(logo, M, M, logo.width*k, logo.height*k);
  }
  g.textAlign = 'right';
  g.fillStyle = '#0f3d6e'; g.font = 'bold 58px Arial'; g.fillText('PRESUPUESTO', W-M, M+60);
  g.fillStyle = '#1d2733'; g.font = '28px Arial';
  g.fillText('N° ' + num4(state.num), W-M, M+110);
  g.fillText('Fecha de emisión: ' + today(), W-M, M+150);
  g.fillText('Validez: ' + state.validez, W-M, M+190);
  g.textAlign = 'left';

  let y = M + 260;
  const boxX = M, boxW = W - 2*M, labelW = 150, colW = (boxW - 60) / 2;
  function drawInfoBox(title, fields) {
    const rows = Math.ceil(fields.length / 2);
    const boxH = 58 + rows * 48 + 20;
    g.strokeStyle = '#cfd8e3'; g.lineWidth = 2;
    g.strokeRect(boxX, y, boxW, boxH);
    g.fillStyle = '#0f3d6e'; g.font = 'bold 28px Arial';
    g.fillText(title, boxX + 20, y + 36);
    fields.forEach((field, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = boxX + 20 + col * (colW + 20);
      const fy = y + 82 + row * 48;
      g.fillStyle = '#1d2733'; g.font = 'bold 23px Arial';
      g.fillText(field[0], x, fy);
      const labelWidth = g.measureText(field[0]).width + 8;
      g.font = '23px Arial';
      const valueLines = wrap(g, field[1] || '-', colW - labelWidth - 8);
      valueLines.slice(0, 2).forEach((line, lineIndex) => {
        g.fillText(line, x + labelWidth, fy + lineIndex * 26);
      });
    });
    y += boxH + 14;
  }
  drawInfoBox('ELECTRICISTA', [
    ['Nombre:', p.nombre || 'Completá tus datos'],
    ['Tel:', p.tel || '-'],
    ['Mail:', p.email || '-'],
    ['CUIL:', p.cuil || '-'],
    ...(p.mat ? [['Matrícula:', p.mat]] : [])
  ]);
  drawInfoBox('CLIENTE', [
    ['Nombre:', cl.nombre || '-'],
    ['Tel:', cl.tel || '-'],
    ['Mail:', cl.email || '-'],
    ['Dirección:', cl.dir || '-']
  ]);
  y += 6;
  g.strokeStyle = '#cfd8e3'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(M,y); g.lineTo(W-M,y); g.stroke();

  // Tabla
  const ty = y + 30, tW = W - 2*M;
  g.fillStyle = '#0f3d6e'; g.fillRect(M, ty, tW, 56);
  g.fillStyle = '#fff'; g.font = 'bold 26px Arial';
  g.fillText('Descripción', M+20, ty+37);
  g.textAlign = 'right';
  g.fillText('Cant.', 790, ty+37); g.fillText('P. unit.', 960, ty+37); g.fillText('Subtotal', W-M-20, ty+37);
  g.textAlign = 'left';
  let ry = ty + 56;
  g.font = '26px Arial';
  if(!state.items.length){
    g.fillStyle = '#6b7787'; g.fillText('Sin ítems', M+20, ry+40); ry += 70;
  }
  state.items.forEach(it => {
    const lines = wrap(g, it.desc || '(sin descripción)', 640);
    const rh = Math.max(lines.length*34, 34) + 22;
    g.fillStyle = '#1d2733';
    lines.forEach((ln,i) => g.fillText(ln, M+20, ry+34+i*34));
    g.textAlign = 'right';
    g.fillText(String(it.qty), 790, ry+34);
    g.fillText(money(it.price), 960, ry+34);
    g.fillText(money(subtotal(it)), W-M-20, ry+34);
    g.textAlign = 'left';
    ry += rh;
    g.strokeStyle = '#e5eaf0'; g.beginPath(); g.moveTo(M,ry); g.lineTo(W-M,ry); g.stroke();
  });

  // Total
  ry += 20;
  g.fillStyle = '#0f3d6e'; g.font = 'bold 36px Arial'; g.fillText('TOTAL', M+20, ry+40);
  g.textAlign = 'right'; g.fillText(money(total()), W-M-20, ry+40); g.textAlign = 'left';
  ry += 80;
  g.strokeStyle = '#0f3d6e'; g.lineWidth = 3; g.beginPath(); g.moveTo(M,ry); g.lineTo(W-M,ry); g.stroke();

  // Observaciones
  ry += 40;
  g.fillStyle = '#6b7787'; g.font = 'bold 22px Arial'; g.fillText('OBSERVACIONES', M, ry);
  ry += 16;
  const boxH = 220;
  g.strokeStyle = '#cfd8e3'; g.lineWidth = 2; g.strokeRect(M, ry, W-2*M, boxH);
  g.fillStyle = '#1d2733'; g.font = '26px Arial';
  let oy = ry + 44;
  String(state.obs||'').split('\n').forEach(par => {
    wrap(g, par, W-2*M-40).forEach(ln => { if(oy < ry+boxH-10){ g.fillText(ln, M+20, oy); oy += 34; } });
  });

  return c;
}
function b64ToBytes(d){
  const bin = atob(d.split(',')[1]); const u = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i);
  return u;
}
function makePdf(jpg, w, h){
  const enc = new TextEncoder();
  const parts = []; const offs = []; let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const content = 'q 595 0 0 842 0 0 cm /Im1 Do Q';
  push('%PDF-1.4\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
    null,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  for(let i=0;i<5;i++){
    offs.push(len); push(`${i+1} 0 obj\n`);
    if(i === 3){
      push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
      push(jpg); push('\nendstream');
    } else push(objs[i]);
    push('\nendobj\n');
  }
  const xref = len;
  let xr = 'xref\n0 6\n0000000000 65535 f \n';
  offs.forEach(o => xr += String(o).padStart(10,'0') + ' 00000 n \n');
  push(xr);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, {type:'application/pdf'});
}
async function makePdfFile(){
  const c = await buildCanvas();
  const jpg = b64ToBytes(c.toDataURL('image/jpeg', 0.92));
  const blob = makePdf(jpg, c.width, c.height);
  return new File([blob], `Presupuesto_${num4(state.num)}.pdf`, {type:'application/pdf'});
}
function download(file){
  const a = document.createElement('a');
  const url = URL.createObjectURL(file);
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

/* ---------- ACCIONES ---------- */
function checkProfile(){
  if(!profile || !profile.nombre || !profile.tel){
    toast('Primero completá tus datos en "Mis datos"');
    openProfile(true); return false;
  }
  return true;
}
function checkItems(){
  if(!state.items.some(it => String(it.desc).trim() || it.price)){
    toast('Agregá al menos un ítem'); return false;
  }
  return true;
}
function checkClientPhone(){
  if(!String(state.cliente.tel).trim()){
    toast('Ingresá el teléfono del cliente'); $('cTel').focus(); return false;
  }
  return true;
}
function emit(){
  if(!state.emitted){
    counter++; store.set('presu_counter', counter);
    state.emitted = true; saveDraft();
  }
}
function waNumber(t){
  let d = String(t).replace(/\D/g,'');
  if(d.startsWith('00')) d = d.slice(2);
  if(!d.startsWith('54')) d = '54' + d.replace(/^0+/,'');
  if(d.startsWith('54') && d[2] !== '9') d = '549' + d.slice(2);
  return d;
}
function waText(withPdf){
  const p = profile;
  let t = `Hola${state.cliente.nombre ? ' ' + state.cliente.nombre : ''}! Te envío el presupuesto N° ${num4(state.num)} de ${p.nombre}.\n`;
  if(!withPdf){
    t += '\n' + state.items.map(it => `• ${it.desc || '(sin descripción)'} x${it.qty} = ${money(subtotal(it))}`).join('\n') + '\n';
  }
  t += `\nTotal: ${money(total())}\nFecha de emisión: ${today()}\nValidez: ${state.validez}`;
  if(state.obs.trim()) t += `\n\nObservaciones: ${state.obs.trim()}`;
  if(withPdf) t += '\n\n(Te adjunto el presupuesto en PDF)';
  return t;
}
function openWa(text){
  window.open('https://wa.me/' + waNumber(state.cliente.tel) + '?text=' + encodeURIComponent(text), '_blank');
}

$('btnPdf').onclick = async () => {
  if(!checkProfile() || !checkItems()) return;
  emit();
  const file = pdfCache || await makePdfFile();
  download(file);
  toast('PDF descargado');
};

$('btnWaText').onclick = () => {
  if(!checkProfile() || !checkItems() || !checkClientPhone()) return;
  emit(); refresh();
  openWa(waText(false));
};

$('btnWaPdf').onclick = async () => {
  if(!checkProfile() || !checkItems() || !checkClientPhone()) return;
  emit(); refresh();
  const file = pdfCache || await makePdfFile();
  const text = waText(true);
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try {
      await navigator.share({files:[file], title: file.name, text});
      return;
    } catch(e){
      if(e && e.name === 'AbortError') return;
    }
  }
  download(file);
  openWa(text);
  toast('PDF descargado. Adjuntalo en el chat de WhatsApp.');
};

/* ---------- NUEVO ---------- */
function fillFields(){
  $('cNombre').value = state.cliente.nombre; $('cTel').value = state.cliente.tel;
  $('cEmail').value = state.cliente.email; $('cDir').value = state.cliente.dir;
  $('validez').value = state.validez; $('obs').value = state.obs;
}
$('btnNew').onclick = () => {
  if(state.items.length || state.cliente.nombre || state.cliente.tel || state.obs){
    if(!confirm('¿Empezar un presupuesto nuevo? Se borran los datos del cliente, ítems y observaciones actuales.')) return;
  }
  state = newState();
  fillFields(); renderItems();
  toast('Presupuesto nuevo N° ' + num4(state.num));
};

/* ---------- INICIO ---------- */
renderProfile();
renderChips();
fillFields();
renderItems();
if(!profile) openProfile(true);
