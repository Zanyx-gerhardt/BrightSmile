// --- GLOBAL STATE ---
let patients = [];
let staff = {}; // email -> name mapping
let appointments = [];
let currentWeekStart = new Date();
currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
currentWeekStart.setHours(0, 0, 0, 0);

let currentId = null;
let isDrawing = false;
let sketchColor = '#ef4444';
let ctx = null;
let history = [];
let historyIndex = -1;
let currentSketchTarget = 'teeth';

// --- UTILS ---
const flashSync = (text = "✨ Changes Synced") => {
  const el = document.getElementById('status-sync');
  if (el) {
    el.innerText = text;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 2000);
  }
};

window.calculateAge = function(dob) {
  if(!dob) return "—";
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age + " years old";
};

// --- AUTH & SESSION ---
window.checkSession = async function() {
  window.initTheme();
  try {
    const { data: { user }, error } = await _supabase.auth.getUser();
    if (user) {
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('app').style.display = 'grid';
      document.getElementById('current-user-email').innerText = user.email;
      Promise.all([window.loadStaff(), window.loadPatients()]);
    }
  } catch (e) {
    console.error("Session check failed", e);
  }
};

window.handleLogin = async function() {
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-pass');
  const btn = document.getElementById('login-btn');
  const spinner = document.getElementById('login-spinner');
  const text = document.getElementById('login-btn-text');
  const errEl = document.getElementById('auth-error');

  const email = emailInput.value.trim();
  const password = passInput.value.trim();

  if(!email || !password) return alert("Enter email and password");

  if(text) text.classList.add('hidden');
  if(spinner) spinner.classList.remove('hidden');
  if(errEl) errEl.style.display = 'none';

  try {
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if(text) text.classList.remove('hidden');
      if(spinner) spinner.classList.add('hidden');
      if(errEl) { errEl.innerText = error.message; errEl.style.display = 'block'; }
    } else {
      window.checkSession();
    }
  } catch (e) {
    console.error("Login Error", e);
    if(text) text.classList.remove('hidden');
    if(spinner) spinner.classList.add('hidden');
    alert("System Error: " + e.message);
  }
};

window.handleLogout = async function() {
  await _supabase.auth.signOut();
  location.reload();
};

// --- PATIENT MANAGEMENT ---
window.loadPatients = async function() {
  const body = document.getElementById('table-body');
  const { data } = await _supabase.from('patients').select('*').order('lname');
  if (data) {
    patients = data;
    window.renderPatientList(patients);
  }
};

window.filterPatients = function() {
  const query = document.getElementById('patient-search').value.toLowerCase();
  const filtered = patients.filter(p => {
    const t = p.teeth || {};
    const fullName = (p.fname + " " + p.lname).toLowerCase();
    const phone = (t.phone || "").toLowerCase();
    return fullName.includes(query) || phone.includes(query);
  });
  window.renderPatientList(filtered);
};

window.renderPatientList = function(listToRender) {
  const body = document.getElementById('table-body');
  const list = listToRender || patients;
  if (!body) return;

  const grouped = list.reduce((acc, p) => {
    const t = p.teeth || {};
    const email = t.dentist_email || 'General / Unassigned';
    if (!acc[email]) acc[email] = [];
    acc[email].push(p);
    return acc;
  }, {});

  const currentUserEmail = document.getElementById('current-user-email').innerText;
  const sortedEmails = Object.keys(grouped).sort((a, b) => {
    if (a === currentUserEmail) return -1;
    if (b === currentUserEmail) return 1;
    return a.localeCompare(b);
  });

  if (list.length === 0) {
    body.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">No records found.</td></tr>';
    return;
  }

  body.innerHTML = sortedEmails.map(email => {
    const groupList = grouped[email];
    const displayName = staff[email] || email;
    const headerRow = `<tr style="background: var(--card-muted);"><td colspan="5" style="padding: 12px; font-weight: 700;">👨‍⚕️ Dentist: <span style="color: var(--primary-light);">${displayName}</span></td></tr>`;
    const rows = groupList.map(p => {
      const t = p.teeth || {}, status = t.status || 'Active';
      return `<tr><td style="font-weight: 600;">${p.fname} ${p.lname}</td><td>${t.phone || "—"}</td><td>${status}</td><td>${t.address || "—"}</td><td style="text-align: right;"><button class="btn" onclick="window.openPatient('${p.id}')">View</button></td></tr>`;
    }).join('');
    return headerRow + rows;
  }).join('');
};

window.openPatient = function(id) {
  currentId = id;
  const p = patients.find(x => x.id === id);
  const t = p.teeth || {};

  document.getElementById('det-name').innerText = p.fname + " " + p.lname;
  document.getElementById('edit-fname').value = p.fname;
  document.getElementById('edit-lname').value = p.lname;

  const alertBanner = document.getElementById('medical-alert-banner');
  const alertText = document.getElementById('alert-text-banner');
  if (t.medical_alerts && t.medical_alerts.trim() !== "") {
    alertBanner.classList.remove('hidden'); alertBanner.style.display = 'flex'; alertText.innerText = t.medical_alerts;
  } else { alertBanner.classList.add('hidden'); alertBanner.style.display = 'none'; }

  const dentistSelect = document.getElementById('det-dentist-select');
  const currentUserEmail = document.getElementById('current-user-email').innerText;
  const emails = new Set(patients.map(x => (x.teeth && x.teeth.dentist_email) || 'General / Unassigned'));
  emails.add(currentUserEmail); emails.add('General / Unassigned');
  dentistSelect.innerHTML = Array.from(emails).map(e => `<option value="${e}" ${t.dentist_email === e ? 'selected' : ''}>${staff[e] || e}</option>`).join('');

  document.getElementById('det-phone').value = t.phone || "";
  document.getElementById('det-dob').value = t.dob || "";
  document.getElementById('det-age-display').innerText = window.calculateAge(t.dob);
  document.getElementById('det-gender').value = t.gender || "";
  document.getElementById('det-civil-status').value = t.civil_status || "";
  document.getElementById('det-address').value = t.address || "";
  document.getElementById('det-occupation').value = t.occupation || "";
  document.getElementById('det-complaint').value = t.complaint || "";
  document.getElementById('det-alerts').value = t.medical_alerts || "";
  document.getElementById('det-status').value = t.status || 'Active';
  document.getElementById('det-lastvisit').value = t.lastvisit || "";
  document.getElementById('det-reason').value = t.reason || "";
  document.getElementById('det-notes').value = t.notes || "";

  window.renderImages(p);
  window.toggleEditName(false);
  window.renderOdontogram(p);
  window.renderTreatmentHistory(p);
  window.renderPerioChart(p);
  window.showView('detail');
};

window.createPatient = async function() {
  const fname = document.getElementById('new-fname').value;
  const lname = document.getElementById('new-lname').value;
  if(!fname || !lname) return alert("First and Last Name are required");
  
  const { data: { user } } = await _supabase.auth.getUser();
  const clinicalData = {
    status: 'Active',
    phone: document.getElementById('new-phone').value,
    dob: document.getElementById('new-dob').value,
    gender: document.getElementById('new-gender').value,
    civil_status: document.getElementById('new-civil-status').value,
    address: document.getElementById('new-address').value,
    occupation: document.getElementById('new-occupation').value,
    complaint: document.getElementById('new-complaint').value,
    medical_alerts: document.getElementById('new-alerts').value,
    lastvisit: document.getElementById('new-lastvisit').value,
    reason: document.getElementById('new-reason').value,
    notes: document.getElementById('new-notes').value,
    dentist_email: user ? user.email : 'General',
    images: []
  };

  flashSync("Creating Record...");
  const { error } = await _supabase.from('patients').insert([{ fname, lname, teeth: clinicalData }]);
  if (error) alert("Error: " + error.message);
  else { window.showView('list'); window.loadPatients(); }
};

window.deletePatient = async function(id) {
  if(!confirm("Are you sure?")) return;
  flashSync();
  await _supabase.from('patients').delete().eq('id', id);
  window.showView('list'); window.loadPatients();
};

window.toggleEditName = function(edit) {
  document.getElementById('det-name-display').classList.toggle('hidden', edit);
  document.getElementById('det-name-edit').classList.toggle('hidden', !edit);
};

window.saveName = async function() {
  const fname = document.getElementById('edit-fname').value;
  const lname = document.getElementById('edit-lname').value;
  flashSync();
  await _supabase.from('patients').update({ fname, lname }).eq('id', currentId);
  const p = patients.find(x => x.id === currentId);
  p.fname = fname; p.lname = lname;
  document.getElementById('det-name').innerText = fname + " " + lname;
  window.toggleEditName(false); window.loadPatients();
};

window.updateClinicalField = async function(field, value) {
  if(!currentId) return;
  const p = patients.find(x => x.id === currentId);
  if(!p) return;
  if(!p.teeth) p.teeth = {};
  p.teeth[field] = value;
  if (field === 'dob') document.getElementById('det-age-display').innerText = window.calculateAge(value);
  flashSync();
  await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
};

// --- CLINICAL TOOLS ---
window.renderOdontogram = function(p) {
  const upper = document.getElementById('jaw-upper');
  const lower = document.getElementById('jaw-lower');
  if(!upper || !lower) return;
  upper.innerHTML = ''; lower.innerHTML = '';
  const shapes = {
    molar: '<path d="M5,10 Q5,5 10,5 L22,5 Q27,5 27,10 L28,25 Q28,35 22,45 L10,45 Q4,35 4,25 Z M10,5 L10,15 M22,5 L22,15 M5,20 L27,20" />',
    premolar: '<path d="M7,12 Q7,5 12,5 L20,5 Q25,5 25,12 L26,25 Q26,35 20,45 L12,45 Q6,35 6,25 Z M16,5 L16,15" />',
    canine: '<path d="M8,15 Q16,2 24,15 L25,30 Q25,48 16,48 Q7,48 7,30 Z" />',
    incisor: '<path d="M8,8 L24,8 L25,30 Q25,48 16,48 Q7,48 7,30 Z" />'
  };
  const getToothType = (n) => [1,2,3,14,15,16,17,18,19,30,31,32].includes(n) ? 'molar' : [4,5,12,13,20,21,28,29].includes(n) ? 'premolar' : [6,11,22,27].includes(n) ? 'canine' : 'incisor';
  const getCoords = (n) => {
    const cx = 50; let angle, rx = 42, ry = 80;
    if (n <= 16) { angle = ((n-1)/15)*Math.PI; return { x: cx + rx * Math.cos(angle + Math.PI), y: 90 - ry * Math.sin(angle), size: [1,2,3,14,15,16].includes(n) ? 42 : 32 }; }
    else { angle = ((32-n)/15)*Math.PI; return { x: cx + rx * Math.cos(angle + Math.PI), y: 10 + ry * Math.sin(angle), size: [17,18,19,30,31,32].includes(n) ? 42 : 32 }; }
  };
  for(let i=1; i<=32; i++) {
    const coords = getCoords(i), div = document.createElement('div'), status = (p.teeth && p.teeth[i]) || '', type = getToothType(i);
    div.className = 'tooth-cell ' + status;
    div.style.left = coords.x + '%'; div.style.top = coords.y + '%'; div.style.width = coords.size + 'px'; div.style.height = (coords.size * 1.4) + 'px';
    div.style.transform = 'translate(-50%, -50%) rotate(' + (i <= 16 ? (i-8.5)*12 : (24.5-i)*12) + 'deg)';
    div.innerHTML = '<span>' + i + '</span><svg class="tooth-svg" viewBox="0 0 32 50">' + shapes[type] + '</svg>';
    div.onclick = () => {
      const cycle = ['', 'decay', 'filled'], next = cycle[(cycle.indexOf(status) + 1) % cycle.length];
      if(!p.teeth) p.teeth = {}; p.teeth[i] = next; window.renderOdontogram(p);
      _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
    };
    (i <= 16 ? upper : lower).appendChild(div);
  }
};

window.renderPerioChart = function(p) {
  const container = document.getElementById('perio-visual-container'); if(!container) return;
  const perio = (p.teeth && p.teeth.perio) || {};
  container.innerHTML = '<div style="display: grid; grid-template-columns: repeat(16, 1fr); gap: 5px;">' + 
    Array.from({length: 32}, (_, i) => `<input type="number" value="${perio[i+1]||''}" style="width:100%;" onblur="window.savePerioValue(${i+1}, this.value)">`).join('') + '</div>';
};

window.savePerioValue = async function(tooth, val) {
  const p = patients.find(x => x.id === currentId);
  if(!p.teeth) p.teeth = {}; if(!p.teeth.perio) p.teeth.perio = {};
  p.teeth.perio[tooth] = val;
  await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
};

window.toggleSketchMode = function(target = 'teeth') {
  const canvas = document.getElementById('sketch-canvas'), toolbar = document.getElementById('sketch-toolbar');
  if(!canvas) return;
  if (canvas.style.display !== 'block') {
    const container = document.querySelector(target === 'teeth' ? '.odontogram-wrapper' : '.perio-wrapper');
    container.appendChild(canvas); canvas.style.display = 'block'; if(toolbar) toolbar.style.display = 'flex';
    canvas.width = container.offsetWidth; canvas.height = container.offsetHeight;
    window.initSketchEngine();
  } else { canvas.style.display = 'none'; if(toolbar) toolbar.style.display = 'none'; }
};

window.initSketchEngine = function() {
  const canvas = document.getElementById('sketch-canvas'); ctx = canvas.getContext('2d');
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  const getPos = (e) => { const rect = canvas.getBoundingClientRect(); return { x: (e.clientX || e.touches[0].clientX) - rect.left, y: (e.clientY || e.touches[0].clientY) - rect.top }; };
  canvas.onmousedown = (e) => { isDrawing = true; const pos = getPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); };
  canvas.onmousemove = (e) => { if (!isDrawing) return; const pos = getPos(e); ctx.strokeStyle = sketchColor; ctx.lineTo(pos.x, pos.y); ctx.stroke(); };
  canvas.onmouseup = () => isDrawing = false;
};

window.setSketchColor = function(color, el) {
  sketchColor = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  if(el) el.classList.add('active');
};

window.saveSketch = async function() {
  const canvas = document.getElementById('sketch-canvas');
  const p = patients.find(x => x.id === currentId);
  if(!p.teeth) p.teeth = {};
  p.teeth.sketch = canvas.toDataURL();
  flashSync("Sketch Saved");
  await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
};

window.clearSketch = function() { if(ctx) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); };

// --- IMAGES ---
window.renderImages = function(p) {
  const gallery = document.getElementById('image-gallery'), images = (p.teeth && p.teeth.images) || [];
  if(!gallery) return;
  gallery.innerHTML = images.map((img, i) => `<div class="card" style="padding:5px;"><img src="${typeof img === 'string' ? img : img.data}" style="width:100%;"><button onclick="window.deletePhoto(${i})">X</button></div>`).join('');
};

window.processPhotoUpload = async function() {
  const file = document.getElementById('photo-file').files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const p = patients.find(x => x.id === currentId);
    if(!p.teeth) p.teeth = {}; if(!p.teeth.images) p.teeth.images = [];
    p.teeth.images.push({ data: e.target.result, category: 'General', date: new Date().toLocaleDateString() });
    flashSync();
    await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
    window.renderImages(p);
  };
  reader.readAsDataURL(file);
};

window.deletePhoto = async function(i) {
  const p = patients.find(x => x.id === currentId);
  p.teeth.images.splice(i, 1);
  await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
  window.renderImages(p);
};

// --- TREATMENT ---
window.renderTreatmentHistory = function(p) {
  const timeline = document.getElementById('treatment-timeline'), history = (p.teeth && p.teeth.history) || [];
  if(!timeline) return;
  timeline.innerHTML = history.map(h => `<div style="border-bottom:1px solid #ddd; padding:10px;"><b>${h.date}</b>: ${h.procedure}</div>`).join('');
};

window.addTreatmentEntry = async function() {
  const date = document.getElementById('treat-date').value, proc = document.getElementById('treat-procedure').value;
  const p = patients.find(x => x.id === currentId);
  if(!p.teeth) p.teeth = {}; if(!p.teeth.history) p.teeth.history = [];
  p.teeth.history.push({ date, procedure: proc, dentist: document.getElementById('current-user-email').innerText });
  await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
  window.renderTreatmentHistory(p);
};

// --- SCHEDULER ---
window.loadAppointments = async function() {
  const { data } = await _supabase.from('appointments').select('*');
  if (data) appointments = data; window.renderScheduler();
};

window.renderScheduler = function() {
  const grid = document.getElementById('scheduler-grid'); if(!grid) return;
  const hours = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
  let html = '<div>Time</div><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>';
  hours.forEach(h => {
    html += `<div>${h}</div>` + Array.from({length: 7}, (_, i) => `<div style="min-height:50px; border:1px solid #eee;"></div>`).join('');
  });
  grid.innerHTML = html;
};

// --- ANALYTICS ---
window.loadAnalytics = function() {
  const summary = document.getElementById('analytics-summary'); if(!summary) return;
  summary.innerHTML = `<div class="stat-card">Total: ${patients.length}</div>`;
};

// --- STAFF ---
window.loadStaff = async function() {
  const { data } = await _supabase.from('staff').select('*');
  if (data) staff = data.reduce((acc, s) => { acc[s.email] = s.name; return acc; }, {});
  const body = document.getElementById('staff-table-body');
  if(body) body.innerHTML = Object.entries(staff).map(([e, n]) => `<tr><td>${e}</td><td>${n}</td></tr>`).join('');
};

window.saveStaffName = async function() {
  const e = document.getElementById('staff-email').value, n = document.getElementById('staff-name').value;
  await _supabase.from('staff').upsert([{ email: e, name: n }]);
  window.loadStaff();
};

// --- THEME & NAV ---
window.showView = function(v) {
  ['list', 'scheduler', 'add', 'staff', 'detail', 'analytics', 'solitaire'].forEach(id => {
    const el = document.getElementById('view-' + id); if (el) el.classList.toggle('hidden', id !== v);
    const nav = document.getElementById('nav-' + id); if (nav) nav.classList.toggle('active', id === v);
  });
};

window.toggleTheme = function() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

window.initTheme = function() {
  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
};

window.toggleMenu = function(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('sidebar-overlay').classList.toggle('active', open);
};

document.addEventListener('DOMContentLoaded', () => {
  window.checkSession();
  if(window.lucide) lucide.createIcons();
});
