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
const flashSync = () => {
  const el = document.getElementById('status-sync');
  if (el) {
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
  const { data: { user } } = await _supabase.auth.getUser();
  if (user) {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    document.getElementById('current-user-email').innerText = user.email;
    Promise.all([window.loadStaff(), window.loadPatients()]);
  }
};

window.handleLogin = async function() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-pass').value;
  const btn = document.getElementById('login-btn');
  const spinner = document.getElementById('login-spinner');
  const text = document.getElementById('login-btn-text');

  if(text) text.classList.add('hidden');
  if(spinner) spinner.classList.remove('hidden');

  const { error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if(text) text.classList.remove('hidden');
    if(spinner) spinner.classList.add('hidden');
    const errEl = document.getElementById('auth-error');
    errEl.innerText = error.message;
    errEl.style.display = 'block';
  } else {
    window.checkSession();
  }
};

window.handleLogout = async function() {
  await _supabase.auth.signOut();
  location.reload();
};

// --- PATIENT MANAGEMENT ---
window.loadPatients = async function() {
  const body = document.getElementById('table-body');
  if (body && patients.length === 0) {
    body.innerHTML = '<tr><td colspan="5"><div class="loading-container"><div class="spinner"></div>Fetching clinical records...</div></td></tr>';
  }
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

  const currentUserEmailEl = document.getElementById('current-user-email');
  const currentUserEmail = currentUserEmailEl ? currentUserEmailEl.innerText : '';
  const sortedEmails = Object.keys(grouped).sort((a, b) => {
    if (a === currentUserEmail) return -1;
    if (b === currentUserEmail) return 1;
    return a.localeCompare(b);
  });

  if (list.length === 0) {
    body.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">No patients found matching your search.</td></tr>';
    return;
  }

  body.innerHTML = sortedEmails.map(email => {
    const groupList = grouped[email];
    const displayName = staff[email] || email;
    const headerRow = `<tr style="background: var(--card-muted);"><td colspan="5" style="padding: 12px; font-weight: 700; color: var(--text-main); border-bottom: 2px solid var(--border);">👨‍⚕️ Dentist: <span style="color: var(--primary-light);">${email === currentUserEmail ? displayName + ' (You)' : displayName}</span></td></tr>`;
    const rows = groupList.map(p => {
      const statusColors = { 'Active': '#22c55e', 'Inactive': '#94a3b8', 'Completed': '#3b82f6', 'Emergency': '#ef4444' };
      const t = p.teeth || {}, status = t.status || 'Active';
      return `<tr><td style="font-weight: 600; padding-left: 24px;">${p.fname} ${p.lname}</td><td style="font-weight: 500; color: var(--primary-light);">${t.phone || "—"}</td><td><span style="background: ${statusColors[status] || '#f1f5f9'}; color: white; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">${status.toUpperCase()}</span></td><td style="color: var(--text-muted); font-size: 13px;">${t.address || "—"}</td><td style="text-align: right;"><button class="btn" style="padding: 6px 16px; font-size: 13px;" onclick="window.openPatient('${p.id}')">View Chart</button></td></tr>`;
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
    alertBanner.style.display = 'flex'; alertText.innerText = t.medical_alerts;
  } else { alertBanner.style.display = 'none'; }

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
  document.getElementById('det-concern').value = t.concern || "";
  document.getElementById('det-notes').value = t.notes || "";

  window.renderImages(p);
  window.renderOdontogram(p);
  window.renderTreatmentHistory(p);
  window.renderPerioChart(p);
  window.showView('detail');
};

// --- CLINICAL TOOLS ---
window.renderOdontogram = function(p) {
  const upper = document.getElementById('jaw-upper'), lower = document.getElementById('jaw-lower');
  upper.innerHTML = ''; lower.innerHTML = '';
  const shapes = {
    molar: `<path d="M5,10 Q5,5 10,5 L22,5 Q27,5 27,10 L28,25 Q28,35 22,45 L10,45 Q4,35 4,25 Z M10,5 L10,15 M22,5 L22,15 M5,20 L27,20" />`,
    premolar: `<path d="M7,12 Q7,5 12,5 L20,5 Q25,5 25,12 L26,25 Q26,35 20,45 L12,45 Q6,35 6,25 Z M16,5 L16,15" />`,
    canine: `<path d="M8,15 Q16,2 24,15 L25,30 Q25,48 16,48 Q7,48 7,30 Z" />`,
    incisor: `<path d="M8,8 L24,8 L25,30 Q25,48 16,48 Q7,48 7,30 Z" />`
  };
  const getCoords = (n) => {
    const cx = 50; let angle, rx = 42, ry = 80, tx, ty;
    if (n <= 16) { angle = ((n-1)/15)*Math.PI; tx = cx + rx * Math.cos(angle + Math.PI); ty = 90 - ry * Math.sin(angle); }
    else { angle = ((32-n)/15)*Math.PI; tx = cx + rx * Math.cos(angle + Math.PI); ty = 10 + ry * Math.sin(angle); }
    return { x: tx, y: ty, size: (n<=3 || (n>=14 && n<=19) || n>=30) ? 42 : 32 };
  };
  for(let i=1; i<=32; i++) {
    const coords = getCoords(i), div = document.createElement('div'), status = (p.teeth && p.teeth[i]) || '';
    div.className = `tooth-cell ${status}`;
    div.style.left = `${coords.x}%`; div.style.top = `${coords.y}%`; div.style.width = `${coords.size}px`; div.style.height = `${coords.size * 1.4}px`;
    div.style.transform = `translate(-50%, -50%) rotate(${i <= 16 ? (i-8.5)*12 : (24.5-i)*12}deg)`;
    div.innerHTML = `<span>${i}</span><svg class="tooth-svg" viewBox="0 0 32 50">${shapes[[1,2,3,14,15,16,17,18,19,30,31,32].includes(i)?'molar':[4,5,12,13,20,21,28,29].includes(i)?'premolar':[6,11,22,27].includes(i)?'canine':'incisor']}</svg>`;
    div.onclick = () => {
      const cycle = ['', 'decay', 'filled'], next = cycle[(cycle.indexOf(status) + 1) % cycle.length];
      if(!p.teeth) p.teeth = {}; p.teeth[i] = next; window.renderOdontogram(p);
      _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
    };
    (i <= 16 ? upper : lower).appendChild(div);
  }
};

window.renderTreatmentHistory = function(p) {
  const timeline = document.getElementById('treatment-timeline'), msg = document.getElementById('no-treatment-msg'), history = (p.teeth && p.teeth.history) || [];
  timeline.innerHTML = '<div style="position: absolute; left: 10px; top: 0; bottom: 0; width: 2px; background: var(--border);"></div>';
  if (history.length === 0) { msg.style.display = 'block'; timeline.style.display = 'none'; }
  else {
    msg.style.display = 'none'; timeline.style.display = 'block';
    [...history].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach((entry, idx) => {
      const div = document.createElement('div');
      div.style = 'position: relative; margin-bottom: 30px; padding-left: 10px;';
      div.innerHTML = `<div style="position: absolute; left: -25px; top: 5px; width: 12px; height: 12px; border-radius: 50%; background: var(--primary-light); border: 3px solid var(--white);"></div><h4 style="margin: 0;">${entry.procedure}</h4><p style="font-size: 12px; color: var(--text-muted);">${entry.date} | ${staff[entry.dentist] || entry.dentist}</p><p style="font-size: 13px;">${entry.notes || ''}</p>`;
      timeline.appendChild(div);
    });
  }
};

window.addTreatmentEntry = async function() {
  const date = document.getElementById('treat-date').value, procedure = document.getElementById('treat-procedure').value, notes = document.getElementById('treat-notes').value;
  if (!date || !procedure) return alert("Required fields missing");
  const p = patients.find(x => x.id === currentId);
  if(!p.teeth) p.teeth = {}; if(!p.teeth.history) p.teeth.history = [];
  p.teeth.history.push({ date, procedure, notes, dentist: document.getElementById('current-user-email').innerText });
  flashSync();
  await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
  window.renderTreatmentHistory(p);
};

window.renderPerioChart = function(p) {
  const container = document.getElementById('perio-visual-container'), perio = (p.teeth && p.teeth.perio) || {};
  container.innerHTML = '<h4>Pocket Depths (mm)</h4><div style="display:grid; grid-template-columns: repeat(16, 1fr); gap: 5px;">' + 
    Array.from({length: 32}, (_, i) => `<input type="number" value="${perio[i+1]||''}" style="width:100%; text-align:center;" onblur="window.savePerioValue(${i+1}, this.value)">`).join('') + '</div>';
};

window.savePerioValue = async function(tooth, val) {
  const p = patients.find(x => x.id === currentId);
  if(!p.teeth) p.teeth = {}; if(!p.teeth.perio) p.teeth.perio = {};
  p.teeth.perio[tooth] = val;
  await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
};

window.renderImages = function(p) {
  const gallery = document.getElementById('image-gallery'), images = (p.teeth && p.teeth.images) || [];
  gallery.innerHTML = images.map(img => `<div class="card" style="padding: 5px;"><img src="${typeof img === 'string' ? img : img.data}" style="width:100%; border-radius: 8px;"></div>`).join('');
};

// --- SCHEDULER ---
window.loadAppointments = async function() {
  const { data } = await _supabase.from('appointments').select('*');
  if (data) appointments = data;
  window.renderScheduler();
};

window.renderScheduler = function() {
  const grid = document.getElementById('scheduler-grid'), days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], hours = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
  let html = '<div style="background: var(--card-muted); padding: 10px; border: 1px solid var(--border);">Time</div>' + days.map(d => `<div style="background: var(--card-muted); padding: 10px; border: 1px solid var(--border);">${d}</div>`).join('');
  hours.forEach(h => {
    html += `<div style="padding: 10px; border: 1px solid var(--border);">${h}</div>` + Array.from({length: 7}, (_, i) => {
      const d = new Date(currentWeekStart); d.setDate(d.getDate() + i);
      const slotApps = appointments.filter(a => a.date === d.toISOString().split('T')[0] && a.hour === h);
      return `<div style="padding: 10px; border: 1px solid var(--border); min-height: 50px;">${slotApps.map(a => `<div style="background: var(--primary-light); color: white; padding: 2px; border-radius: 4px; font-size: 10px;">${a.procedure}</div>`).join('')}</div>`;
    }).join('');
  });
  grid.innerHTML = html;
};

// --- STAFF ---
window.loadStaff = async function() {
  const { data } = await _supabase.from('staff').select('*');
  if (data) staff = data.reduce((acc, s) => { acc[s.email] = s.name; return acc; }, {});
  window.renderStaffList();
};

window.renderStaffList = function() {
  const body = document.getElementById('staff-table-body');
  if(body) body.innerHTML = Object.entries(staff).map(([email, name]) => `<tr><td>${email}</td><td>${name}</td><td><button onclick="window.deleteStaff('${email}')">Delete</button></td></tr>`).join('');
};

window.saveStaffName = async function() {
  const email = document.getElementById('staff-email').value, name = document.getElementById('staff-name').value;
  await _supabase.from('staff').upsert([{ email, name }]);
  window.loadStaff();
};

window.deleteStaff = async function(email) {
  await _supabase.from('staff').delete().eq('email', email);
  window.loadStaff();
};

// --- UI NAVIGATION ---
window.showView = function(v) {
  ['list', 'scheduler', 'add', 'staff', 'detail', 'analytics', 'solitaire'].forEach(id => {
    const el = document.getElementById('view-' + id); if (el) el.classList.toggle('hidden', id !== v);
  });
  ['list', 'scheduler', 'add', 'staff', 'analytics', 'solitaire'].forEach(id => {
    const el = document.getElementById('nav-' + id); if (el) el.classList.toggle('active', id === v);
  });
};

window.toggleTheme = function() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  window.updateThemeUI(isDark);
};

window.updateThemeUI = function(isDark) {
  const icon = isDark ? 'sun' : 'moon';
  document.getElementById('theme-icon').innerHTML = `<i data-lucide="${icon}"></i>`;
  document.getElementById('theme-text').innerText = isDark ? 'Light Mode' : 'Dark Mode';
  if(window.lucide) lucide.createIcons();
};

window.initTheme = function() {
  const savedTheme = localStorage.getItem('theme'), isDark = savedTheme === 'dark';
  if (isDark) document.body.classList.add('dark-mode');
  window.updateThemeUI(isDark);
};

window.toggleMenu = function(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('sidebar-overlay').classList.toggle('active', open);
};

// Init
document.addEventListener('DOMContentLoaded', () => {
  if(window.lucide) lucide.createIcons();
  window.checkSession();
});
