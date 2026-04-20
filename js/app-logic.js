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
  if (isNaN(birthDate.getTime())) return "—";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age + "y";
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
      Promise.all([window.loadStaff(), window.loadPatients(), window.loadAppointments()]);
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
      const age = window.calculateAge(t.dob);
      const gender = (t.gender || "—").charAt(0).toUpperCase();
      return `<tr>
        <td style="font-weight: 600;">${p.fname} ${p.lname}</td>
        <td>${t.phone || "—"}</td>
        <td><span style="font-size:11px; padding:4px 8px; border-radius:6px; background:var(--group-bg); font-weight:700;">${status}</span></td>
        <td>${age} (${gender})</td>
        <td>${t.address || "—"}</td>
        <td style="text-align: right;"><button class="btn" style="padding:8px 16px; font-size:12px;" onclick="window.openPatient('${p.id}')">View Profile</button></td>
      </tr>`;
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
  
  let html = '<div style="display: grid; grid-template-columns: repeat(16, 1fr); gap: 2px; background: var(--border); border: 1px solid var(--border); padding: 1px;">';
  // Upper Teeth (1-16)
  for(let i=1; i<=16; i++) {
    html += `<div style="background: var(--white); padding: 4px; text-align: center;">
      <div style="font-size: 9px; font-weight: 800; color: var(--text-muted); margin-bottom: 2px;">${i}</div>
      <input type="number" value="${perio[i]||''}" style="width: 100%; padding: 4px; font-size: 12px; text-align: center; margin: 0; border-radius: 4px;" onblur="window.savePerioValue(${i}, this.value)">
    </div>`;
  }
  // Lower Teeth (17-32)
  for(let i=17; i<=32; i++) {
    html += `<div style="background: var(--white); padding: 4px; text-align: center;">
      <input type="number" value="${perio[i]||''}" style="width: 100%; padding: 4px; font-size: 12px; text-align: center; margin: 0; border-radius: 4px;" onblur="window.savePerioValue(${i}, this.value)">
      <div style="font-size: 9px; font-weight: 800; color: var(--text-muted); margin-top: 2px;">${i}</div>
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
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
window.changeWeek = function(offset) {
  if (offset === 0) currentWeekStart = new Date();
  else currentWeekStart.setDate(currentWeekStart.getDate() + (offset * 7));
  
  // Align to Sunday
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
  currentWeekStart.setHours(0,0,0,0);
  window.renderScheduler();
};

window.loadAppointments = async function() {
  flashSync("Loading Schedule...");
  const { data, error } = await _supabase.from('appointments').select('*');
  if (error) console.error("Appointments fetch error:", error);
  if (data) appointments = data;
  window.renderScheduler();
};

window.renderScheduler = function() {
  const grid = document.getElementById('scheduler-grid');
  const rangeDisplay = document.getElementById('scheduler-date-range');
  const dentistFilter = document.getElementById('scheduler-dentist-filter').value;
  if(!grid) return;

  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  if (rangeDisplay) {
    rangeDisplay.innerText = `${currentWeekStart.toLocaleDateString(undefined, {month:'short', day:'numeric'})} - ${weekEnd.toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}`;
  }

  // Populate Dentist Filter if empty (other than 'all')
  const filterSelect = document.getElementById('scheduler-dentist-filter');
  if (filterSelect && filterSelect.options.length <= 1) {
    const emails = new Set(appointments.map(a => a.dentist_email));
    emails.forEach(e => {
      if (e) {
        const opt = document.createElement('option');
        opt.value = e;
        opt.text = staff[e] || e;
        filterSelect.add(opt);
      }
    });
  }

  const hours = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  let html = `<div style="background:var(--card-muted); padding:10px; font-weight:800; text-align:center; border-bottom:2px solid var(--border);">Time</div>`;
  for(let i=0; i<7; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    const isToday = d.toDateString() === new Date().toDateString();
    html += `<div style="background:${isToday ? 'var(--group-bg)' : 'var(--card-muted)'}; padding:10px; text-align:center; border-bottom:2px solid var(--border);">
      <div style="font-size:10px; text-transform:uppercase; color:var(--text-muted);">${dayNames[i]}</div>
      <div style="font-weight:800; color:${isToday ? 'var(--primary-light)' : 'inherit'}">${d.getDate()}</div>
    </div>`;
  }

  hours.forEach(h => {
    const displayHour = h + (h < 8 || h === 12 ? (h === 12 ? ' PM' : ' PM') : ' AM');
    html += `<div style="background:var(--card-muted); padding:10px; font-weight:700; font-size:11px; text-align:center; border-right:1px solid var(--border); border-bottom:1px solid var(--border);">${displayHour}</div>`;
    
    for(let i=0; i<7; i++) {
      const dayDate = new Date(currentWeekStart);
      dayDate.setDate(dayDate.getDate() + i);
      const dateStr = dayDate.toISOString().split('T')[0];
      
      const slotApps = appointments.filter(a => {
        const matchDate = a.date === dateStr;
        const matchHour = parseInt(a.hour) === h;
        const matchDentist = dentistFilter === 'all' || a.dentist_email === dentistFilter;
        return matchDate && matchHour && matchDentist;
      });

      html += `<div class="scheduler-slot" style="min-height:80px; background:var(--white); border-right:1px solid var(--border); border-bottom:1px solid var(--border); padding:4px; overflow-y:auto;">`;
      slotApps.forEach(app => {
        const p = patients.find(x => x.id === app.patient_id) || {fname:'Unknown', lname:'Patient'};
        html += `<div onclick="window.openAppointmentModal('${app.id}')" style="background:var(--primary-light); color:white; padding:6px; border-radius:8px; font-size:10px; font-weight:700; margin-bottom:4px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1); border-left:4px solid var(--primary);">
          <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.fname} ${p.lname}</div>
          <div style="opacity:0.8; font-weight:500;">${app.procedure || 'Consultation'}</div>
        </div>`;
      });
      // Empty slot click to add
      if(slotApps.length === 0) {
        html += `<div onclick="window.openNewAppointment('${dateStr}', ${h})" style="height:100%; width:100%; cursor:pointer; opacity:0; transition:opacity 0.2s;" onmouseover="this.style.opacity=0.1; this.style.background='var(--primary)'" onmouseout="this.style.opacity=0"></div>`;
      }
      html += `</div>`;
    }
  });
  grid.innerHTML = html;
};

window.openNewAppointment = function(date, hour) {
  currentId = null; // Reusing for appt id
  document.getElementById('app-modal-title').innerText = "Schedule New Appointment";
  document.getElementById('app-patient-id').innerHTML = patients.map(p => `<option value="${p.id}">${p.fname} ${p.lname}</option>`).join('');
  document.getElementById('app-date').value = date || new Date().toISOString().split('T')[0];
  document.getElementById('app-hour').value = hour || 8;
  document.getElementById('app-procedure').value = "";
  document.getElementById('app-delete-btn').style.display = 'none';
  window.toggleAppointmentModal(true);
};

window.openAppointmentModal = function(appId) {
  const app = appointments.find(a => a.id === appId);
  if(!app) return;
  currentId = appId;
  document.getElementById('app-modal-title').innerText = "Edit Appointment";
  document.getElementById('app-patient-id').innerHTML = patients.map(p => `<option value="${p.id}" ${p.id === app.patient_id ? 'selected' : ''}>${p.fname} ${p.lname}</option>`).join('');
  document.getElementById('app-date').value = app.date;
  document.getElementById('app-hour').value = app.hour;
  document.getElementById('app-procedure').value = app.procedure || "";
  document.getElementById('app-delete-btn').style.display = 'block';
  window.toggleAppointmentModal(true);
};

window.toggleAppointmentModal = function(show) {
  const modal = document.getElementById('appointment-modal');
  if(modal) {
    modal.style.display = show ? 'flex' : 'none';
    modal.classList.toggle('hidden', !show);
  }
};

window.processAppointment = async function() {
  const patient_id = document.getElementById('app-patient-id').value;
  const date = document.getElementById('app-date').value;
  const hour = document.getElementById('app-hour').value;
  const procedure = document.getElementById('app-procedure').value;
  const { data: { user } } = await _supabase.auth.getUser();

  const appData = {
    patient_id, date, hour, procedure,
    dentist_email: user ? user.email : 'General'
  };

  flashSync("Saving Appointment...");
  if (currentId && typeof currentId === 'string' && currentId.length > 10) { // Check if it's a UUID
      await _supabase.from('appointments').update(appData).eq('id', currentId);
  } else {
      await _supabase.from('appointments').insert([appData]);
  }
  
  window.toggleAppointmentModal(false);
  window.loadAppointments();
};

window.deleteAppointment = async function() {
  if(!confirm("Delete this appointment?")) return;
  await _supabase.from('appointments').delete().eq('id', currentId);
  window.toggleAppointmentModal(false);
  window.loadAppointments();
};

// --- ANALYTICS ---
window.loadAnalytics = function() {
  const summary = document.getElementById('analytics-summary');
  const statusChart = document.getElementById('status-chart');
  const workloadList = document.getElementById('workload-list');
  if(!summary || !statusChart) return;

  // Summary Stats
  const activeCount = patients.filter(p => (p.teeth && p.teeth.status) === 'Active').length;
  const newThisMonth = patients.filter(p => {
      // Assuming we have a created_at or using lastvisit as proxy for now
      if(!p.created_at) return false;
      const d = new Date(p.created_at);
      return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
  }).length;

  summary.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Patients</div><div class="stat-value">${patients.length}</div></div>
    <div class="stat-card"><div class="stat-label">Active Cases</div><div class="stat-value">${activeCount}</div></div>
    <div class="stat-card"><div class="stat-label">Appointments</div><div class="stat-value">${appointments.length}</div></div>
    <div class="stat-card"><div class="stat-label">New This Month</div><div class="stat-value">${newThisMonth}</div></div>
  `;

  // Status Breakdown Chart
  const statuses = ['Active', 'Inactive', 'Completed', 'Emergency'];
  const statusData = statuses.map(s => ({
    label: s,
    count: patients.filter(p => (p.teeth && p.teeth.status) === s).length
  }));
  const maxStatus = Math.max(...statusData.map(d => d.count)) || 1;

  statusChart.innerHTML = statusData.map(d => `
    <div class="bar-wrapper">
      <div class="bar" style="height: ${(d.count/maxStatus)*100}%; background: var(--primary-light);">
        <div class="bar-tooltip">${d.count} Patients</div>
      </div>
      <div class="bar-label">${d.label}</div>
    </div>
  `).join('');

  // Dental Health Findings Chart
  const findingsChart = document.getElementById('findings-chart');
  if (findingsChart) {
    const totalTeeth = patients.length * 32;
    let decayCount = 0, filledCount = 0;
    patients.forEach(p => {
      if (p.teeth) {
        for (let i = 1; i <= 32; i++) {
          if (p.teeth[i] === 'decay') decayCount++;
          if (p.teeth[i] === 'filled') filledCount++;
        }
      }
    });
    
    const findingsData = [
      { label: 'Decay', count: decayCount, color: '#ef4444' },
      { label: 'Filled', count: filledCount, color: 'var(--primary-light)' }
    ];
    const maxFinding = Math.max(...findingsData.map(d => d.count)) || 1;
    
    findingsChart.innerHTML = findingsData.map(d => `
      <div class="bar-wrapper">
        <div class="bar" style="height: ${(d.count/maxFinding)*100}%; background: ${d.color};">
          <div class="bar-tooltip">${d.count} Teeth</div>
        </div>
        <div class="bar-label">${d.label}</div>
      </div>
    `).join('');
  }

  // Dentist Workload
  const workload = appointments.reduce((acc, a) => {
    acc[a.dentist_email] = (acc[a.dentist_email] || 0) + 1;
    return acc;
  }, {});

  workloadList.innerHTML = Object.entries(workload).map(([email, count]) => `
    <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border);">
      <span style="font-weight:600;">${staff[email] || email}</span>
      <span style="color:var(--primary-light); font-weight:800;">${count} Appts</span>
    </div>
  `).join('') || '<p style="padding:20px; color:var(--text-muted);">No appointment data available.</p>';
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
  if (v === 'analytics') window.loadAnalytics();
  if (v === 'scheduler') window.renderScheduler();
  if (v === 'list') window.renderPatientList();
  
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
