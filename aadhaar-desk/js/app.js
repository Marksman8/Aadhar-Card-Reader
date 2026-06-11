// ── STATE ──────────────────────────────────────────────────
let frontB64 = null;
let backB64  = null;
let camStream = null;
let camSide   = null;
let db = JSON.parse(localStorage.getItem('aadhaar_reg') || '[]');

// ── CLOCK ──────────────────────────────────────────────────
function tickClock() {
  document.getElementById('clockEl').textContent =
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(tickClock, 1000);
tickClock();

// ── STATS ──────────────────────────────────────────────────
function getTodayCount() {
  const today = new Date().toLocaleDateString('en-IN');
  return db.filter(r => r.date === today).length;
}

function refreshStats() {
  const n = getTodayCount();
  document.getElementById('todayCount').textContent = n;
  document.getElementById('recordCount').textContent = n + ' record' + (n !== 1 ? 's' : '');
}

// ── FILE UPLOAD ─────────────────────────────────────────────
function handleFile(e, side) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => setCardImage(side, ev.target.result, file.name);
  reader.readAsDataURL(file);
}

function setCardImage(side, b64, name) {
  if (side === 'front') frontB64 = b64;
  else backB64 = b64;

  // Update thumbnail
  const thumb = document.getElementById(side + 'Thumb');
  thumb.innerHTML = `<img src="${b64}" alt="${side}">`;

  // Update meta text
  const meta = document.getElementById(side + 'Meta');
  meta.textContent = '✓ ' + (name || 'Image loaded').substring(0, 24);

  // Mark zone as filled
  const zone = document.getElementById(side + 'Zone');
  zone.classList.add('filled');
  zone.onclick = null; // prevent re-click once filled

  document.getElementById(side + 'Check').style.display = 'block';
  checkReady();
}

function checkReady() {
  const ready = frontB64 && backB64;
  document.getElementById('scanBtn').disabled = !ready;
  setStatus(
    ready ? 'ready' : '',
    ready ? 'Ready to scan' : 'Upload both sides to begin'
  );
}

function setStatus(type, text) {
  const bar = document.getElementById('statusBar');
  bar.className = 'status-bar ' + type;
  document.getElementById('statusText').textContent = text;
}

// ── CAMERA ─────────────────────────────────────────────────
async function openCamera(side) {
  camSide = side;
  document.getElementById('camModalLabel').textContent =
    side === 'front' ? '📷 Capture Front Side' : '📷 Capture Back Side';

  // Reset modal UI
  document.getElementById('camLoading').style.display = 'flex';
  document.getElementById('camError').style.display   = 'none';
  document.getElementById('camFeed').style.display    = 'none';
  document.getElementById('captureBtn').style.display = 'none';
  document.getElementById('camModal').classList.add('active');

  // Block: camera doesn't work on file://
  if (location.protocol === 'file:') {
    showCamErr('Camera requires a web server (http/https).<br>Run <code>python -m http.server 8080</code> in this folder, then open <strong>localhost:8080</strong>.<br>Or use <strong>"Choose from Files"</strong> below.');
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showCamErr('Camera API not supported in this browser. Use "Choose from Files" below.');
    return;
  }

  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
    });
    const vid = document.getElementById('camFeed');
    vid.srcObject = camStream;
    vid.style.display = 'block';
    vid.onloadedmetadata = () => {
      document.getElementById('camLoading').style.display = 'none';
      document.getElementById('captureBtn').style.display = 'flex';
    };
    // Fallback: hide spinner after 2.5s regardless
    setTimeout(() => {
      document.getElementById('camLoading').style.display = 'none';
      document.getElementById('captureBtn').style.display = 'flex';
    }, 2500);
  } catch (err) {
    let msg = 'Camera error. Use "Choose from Files" below.';
    if (err.name === 'NotAllowedError')  msg = 'Permission denied. Allow camera in browser settings, or use <strong>"Choose from Files"</strong>.';
    if (err.name === 'NotFoundError')    msg = 'No camera detected on this device. Use <strong>"Choose from Files"</strong> below.';
    if (err.name === 'NotReadableError') msg = 'Camera is busy (another app is using it). Use <strong>"Choose from Files"</strong> below.';
    showCamErr(msg);
  }
}

function showCamErr(msg) {
  document.getElementById('camLoading').style.display = 'none';
  document.getElementById('camFeed').style.display    = 'none';
  document.getElementById('captureBtn').style.display = 'none';
  const el = document.getElementById('camError');
  el.innerHTML = '⚠️ ' + msg;
  el.style.display = 'block';
}

function captureSnap() {
  const vid = document.getElementById('camFeed');
  if (!vid.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width  = vid.videoWidth;
  canvas.height = vid.videoHeight;
  canvas.getContext('2d').drawImage(vid, 0, 0);
  setCardImage(camSide, canvas.toDataURL('image/jpeg', 0.92), camSide + '_capture.jpg');
  closeCamera();
}

function handleGallery(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { setCardImage(camSide, ev.target.result, file.name); closeCamera(); };
  reader.readAsDataURL(file);
}

function closeCamera() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  document.getElementById('camModal').classList.remove('active');
}

// ── SCAN ───────────────────────────────────────────────────
async function doScan() {
  hide('emptyState');
  hide('formArea');
  document.getElementById('formArea').classList.remove('active');
  show('scanOverlay');
  document.getElementById('scanOverlay').classList.add('active');
  setStatus('scanning', 'AI scanning card…');

  animSteps();

  try {
    const data = await callClaude(frontB64, backB64);
    await delay(400);
    populateForm(data);
    hide('scanOverlay');
    document.getElementById('scanOverlay').classList.remove('active');
    show('formArea');
    document.getElementById('formArea').classList.add('active');
    setStatus('done', 'Extraction complete — review and save');
  } catch (err) {
    hide('scanOverlay');
    document.getElementById('scanOverlay').classList.remove('active');
    show('emptyState');
    setStatus('error', '⚠️ ' + err.message);
  }
}

function animSteps() {
  const ids = ['ss1', 'ss2', 'ss3', 'ss4', 'ss5'];
  ids.forEach((id, i) => {
    setTimeout(() => {
      if (i > 0) document.getElementById(ids[i - 1]).className = 'scan-step done';
      document.getElementById(id).className = 'scan-step active';
    }, i * 900);
  });
}

// ── CLAUDE API ─────────────────────────────────────────────
async function callClaude(front, back) {
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ front, back })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Scan failed — check server configuration');
  }

  return data;
}

// ── POPULATE FORM ──────────────────────────────────────────
function populateForm(d) {
  document.getElementById('f_name').value    = d.name    || '';
  document.getElementById('f_dob').value     = d.dob     || '';
  document.getElementById('f_phone').value   = d.phone   || '';
  document.getElementById('f_address').value = d.address || '';
  document.getElementById('f_pincode').value = d.pincode || '';
  document.getElementById('f_aadhaar').value = d.aadhaarMasked || '';

  const g = (d.gender || '').toLowerCase();
  document.getElementById('f_gender').value =
    g === 'male' ? 'Male' : g === 'female' ? 'Female' : g === 'transgender' ? 'Transgender' : '';

  document.getElementById('ftName').textContent    = d.name || '—';
  document.getElementById('ftAadhaar').textContent = d.aadhaarMasked || 'XXXX XXXX ????';

  const pill = document.getElementById('confPill');
  if (d.confidence === 'high') {
    pill.textContent = '● High confidence';
    pill.className   = 'confidence-pill high';
  } else {
    pill.textContent = '● Review needed';
    pill.className   = 'confidence-pill medium';
  }
}

// ── SAVE RECORD ────────────────────────────────────────────
function saveRecord() {
  const vals = {
    name:    document.getElementById('f_name').value.trim(),
    dob:     document.getElementById('f_dob').value.trim(),
    gender:  document.getElementById('f_gender').value,
    aadhaar: document.getElementById('f_aadhaar').value.trim(),
    phone:   document.getElementById('f_phone').value.trim(),
    address: document.getElementById('f_address').value.trim(),
    pincode: document.getElementById('f_pincode').value.trim(),
  };

  if (!vals.name || !vals.dob || !vals.gender || !vals.aadhaar || !vals.pincode) {
    showToast('⚠️ Fill all required fields first.');
    return;
  }

  const today = new Date().toLocaleDateString('en-IN');
  const time  = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  db.unshift({ ...vals, date: today, time, id: 'R' + Date.now().toString().slice(-5) });
  localStorage.setItem('aadhaar_reg', JSON.stringify(db));

  refreshStats();
  renderTable();
  showToast(vals.name + ' registered successfully!');
  setTimeout(() => resetAll(), 1800);
}

// ── RENDER TABLE ───────────────────────────────────────────
function renderTable() {
  const today = new Date().toLocaleDateString('en-IN');
  const rows  = db.filter(r => r.date === today);
  const tbody = document.getElementById('recordsBody');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--label);padding:20px;font-size:12px;">No registrations yet today</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td style="color:var(--label);">${i + 1}</td>
      <td><strong>${r.name}</strong></td>
      <td>${r.dob}</td>
      <td>${r.gender}</td>
      <td><span class="mono-sm">${r.aadhaar}</span></td>
      <td>${r.pincode}</td>
      <td style="color:var(--label);">${r.time}</td>
    </tr>
  `).join('');
}

// ── RESET ──────────────────────────────────────────────────
function resetAll() {
  frontB64 = null;
  backB64  = null;

  ['front', 'back'].forEach(side => {
    document.getElementById(side + 'Thumb').innerHTML =
      side === 'front' ? '🪪' : '🗺️';
    document.getElementById(side + 'Meta').textContent =
      side === 'front' ? 'Name · DOB · Gender · Aadhaar No.' : 'Address · Pincode';
    document.getElementById(side + 'Check').style.display = 'none';

    const zone = document.getElementById(side + 'Zone');
    zone.classList.remove('filled');
    zone.onclick = () => document.getElementById(side + 'FileInput').click();
  });

  document.getElementById('scanBtn').disabled = true;
  hide('formArea');
  hide('scanOverlay');
  document.getElementById('formArea').classList.remove('active');
  document.getElementById('scanOverlay').classList.remove('active');
  show('emptyState');
  setStatus('', 'Upload both sides to begin');
}

// ── TOAST ──────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── HELPERS ────────────────────────────────────────────────
function show(id) { document.getElementById(id).style.display = ''; }
function hide(id) { document.getElementById(id).style.display = 'none'; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── INIT ───────────────────────────────────────────────────
refreshStats();
renderTable();
