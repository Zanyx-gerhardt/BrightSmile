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
    const blood = (t.bloodtype || "").toLowerCase();
    return fullName.includes(query) || phone.includes(query) || blood.includes(query);
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

  const currentUserEmailNode = document.getElementById('current-user-email');
  const currentUserEmail = currentUserEmailNode ? currentUserEmailNode.innerText : '';
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
    alertBanner.classList.remove('hidden');
    alertBanner.style.display = 'flex';
    alertText.innerText = t.medical_alerts;
  } else {
    alertBanner.classList.add('hidden');
    alertBanner.style.display = 'none';
  }

  const dentistSelect = document.getElementById('det-dentist-select');
  const currentUserEmail = document.getElementById('current-user-email').innerText;
  const emails = new Set(patients.map(x => (x.teeth && x.teeth.dentist_email) || 'General / Unassigned'));
  emails.add(currentUserEmail);
  emails.add('General / Unassigned');
  dentistSelect.innerHTML = Array.from(emails).map(e => `<option value="${e}" ${t.dentist_email === e || (!t.dentist_email && e === 'General / Unassigned') ? 'selected' : ''}>${staff[e] || e}</option>`).join('');

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

  const canvas = document.getElementById('sketch-canvas');
  const toolbar = document.getElementById('sketch-toolbar');
  if (canvas) { canvas.style.display = 'none'; toolbar.style.display = 'none'; if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }

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
    concern: document.getElementById('new-concern').value,
    notes: document.getElementById('new-notes').value,
    dentist_email: user ? user.email : 'General',
    images: []
  };

  const save = async (data) => {
    flashSync();
    const { error } = await _supabase.from('patients').insert([{ fname, lname, teeth: data }]);
    if (error) alert("Error creating record: " + error.message);
    else { 
      window.showView('list'); 
      window.loadPatients(); 
      document.querySelectorAll('#view-add input, #view-add select, #view-add textarea').forEach(el => el.value = "");
    }
  };

  const imageInput = document.getElementById('new-image');
  if (imageInput.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => { clinicalData.images.push({ data: e.target.result, category: 'Initial', note: 'Admission Photo', date: new Date().toLocaleDateString() }); save(clinicalData); };
    reader.readAsDataURL(imageInput.files[0]);
  } else { save(clinicalData); }
};

window.deletePatient = async function(id) {
  if(!confirm("Are you sure you want to delete this patient? This action cannot be undone.")) return;
  flashSync();
  const { error } = await _supabase.from('patients').delete().eq('id', id);
  if (error) alert("Error deleting patient: " + error.message);
  else { window.showView('list'); window.loadPatients(); }
};

window.toggleEditName = function(edit) {
  document.getElementById('det-name-display').classList.toggle('hidden', edit);
  document.getElementById('det-name-edit').classList.toggle('hidden', !edit);
};

window.saveName = async function() {
  const fname = document.getElementById('edit-fname').value;
  const lname = document.getElementById('edit-lname').value;
  if(!fname || !lname) return alert("Names cannot be empty");
  flashSync();
  const { error } = await _supabase.from('patients').update({ fname, lname }).eq('id', currentId);
  if (error) alert("Error updating name: " + error.message);
  else {
    const p = patients.find(x => x.id === currentId);
    p.fname = fname; p.lname = lname;
    document.getElementById('det-name').innerText = fname + " " + lname;
    window.toggleEditName(false); window.loadPatients();
  }
};

window.updateClinicalField = async function(field, value) {
  if(!currentId) return;
  const p = patients.find(x => x.id === currentId);
  if(!p) return;
  if(!p.teeth) p.teeth = {};
  if(p.teeth[field] === value) return;
  p.teeth[field] = value;

  if (field === 'medical_alerts') {
    const alertBanner = document.getElementById('medical-alert-banner');
    const alertText = document.getElementById('alert-text-banner');
    if (value && value.trim() !== "") { alertBanner.classList.remove('hidden'); alertBanner.style.display = 'flex'; alertText.innerText = value; }
    else { alertBanner.classList.add('hidden'); alertBanner.style.display = 'none'; }
  }
  if (field === 'dob') document.getElementById('det-age-display').innerText = window.calculateAge(value);
  
  window.renderPatientList();
  flashSync();
  const { error } = await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
  if (error) alert("Error updating field: " + error.message);
};

// --- CLINICAL TOOLS ---
window.renderOdontogram = function(p) {
  const upper = document.getElementById('jaw-upper');
  const lower = document.getElementById('jaw-lower');
  if(!upper || !lower) return;
  upper.innerHTML = ''; lower.innerHTML = '';

  const shapes = {
    molar: '<path d=\"M5,10 Q5,5 10,5 L22,5 Q27,5 27,10 L28,25 Q28,35 22,45 L10,45 Q4,35 4,25 Z M10,5 L10,15 M22,5 L22,15 M5,20 L27,20\" />',
    premolar: '<path d=\"M7,12 Q7,5 12,5 L20,5 Q25,5 25,12 L26,25 Q26,35 20,45 L12,45 Q6,35 6,25 Z M16,5 L16,15\" />',
    canine: '<path d=\"M8,15 Q16,2 24,15 L25,30 Q25,48 16,48 Q7,48 7,30 Z\" />',
    incisor: '<path d=\"M8,8 L24,8 L25,30 Q25,48 16,48 Q7,48 7,30 Z\" />'
  };

  const getToothType = (n) => {
    if ([1,2,3,14,15,16,17,18,19,30,31,32].includes(n)) return 'molar';
    if ([4,5,12,13,20,21,28,29].includes(n)) return 'premolar';
    if ([6,11,22,27].includes(n)) return 'canine';
    return 'incisor';
  };

  const getCoords = (n) => {
    const cx = 50; let angle, rx = 42, ry = 80, tx, ty;
    if (n <= 16) { angle = ((n-1)/15)*Math.PI; tx = cx + rx * Math.cos(angle + Math.PI); ty = 90 - ry * Math.sin(angle); return { x: tx, y: ty, size: [1,2,3,14,15,16].includes(n) ? 42 : 32 }; }
    else { angle = ((32-n)/15)*Math.PI; tx = cx + rx * Math.cos(angle + Math.PI); ty = 10 + ry * Math.sin(angle); return { x: tx, y: ty, size: [17,18,19,30,31,32].includes(n) ? 42 : 32 }; }
  };

  for(let i=1; i<=32; i++) {
    const coords = getCoords(i), div = document.createElement('div'), status = (p.teeth && p.teeth[i]) || '', type = getToothType(i);
    div.className = 'tooth-cell ' + status;
    div.style.left = coords.x + '%'; div.style.top = coords.y + '%'; div.style.width = coords.size + 'px'; div.style.height = (coords.size * 1.4) + 'px';
    div.style.transform = 'translate(-50%, -50%) rotate(' + (i <= 16 ? (i-8.5)*12 : (24.5-i)*12) + 'deg)';
    div.innerHTML = '<span>' + i + '</span><svg class=\"tooth-svg\" viewBox=\"0 0 32 50\">' + shapes[type] + '</svg>';
    div.onclick = () => {
      const cycle = ['', 'decay', 'filled'], next = cycle[(cycle.indexOf(status) + 1) % cycle.length];
      if(!p.teeth) p.teeth = {}; p.teeth[i] = next; window.renderOdontogram(p);
      flashSync(); _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
    };
    (i <= 16 ? upper : lower).appendChild(div);
  }
};

window.renderPerioChart = function(p) {
  const container = document.getElementById('perio-visual-container');
  if(!container) return;
  const perio = (p.teeth && p.teeth.perio) || {};
  const shapes = { molar: '<path d=\"M5,10 Q5,5 10,5 L22,5 Q27,5 27,10 L28,25 Q28,35 22,45 L10,45 Q4,35 4,25 Z M10,5 L10,15 M22,5 L22,15 M5,20 L27,20\" />', premolar: '<path d=\"M7,12 Q7,5 12,5 L20,5 Q25,5 25,12 L26,25 Q26,35 20,45 L12,45 Q6,35 6,25 Z M16,5 L16,15\" />', canine: '<path d=\"M8,15 Q16,2 24,15 L25,30 Q25,48 16,48 Q7,48 7,30 Z\" />', incisor: '<path d=\"M8,8 L24,8 L25,30 Q25,48 16,48 Q7,48 7,30 Z\" />' };
  const getToothType = (n) => [1,2,3,14,15,16,17,18,19,30,31,32].includes(n) ? 'molar' : [4,5,12,13,20,21,28,29].includes(n) ? 'premolar' : [6,11,22,27].includes(n) ? 'canine' : 'incisor';

  const createSection = (title, range) => {
    let html = '<div><h4 style=\"font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 15px;\">' + title + '</h4><div style=\"display: grid; grid-template-columns: repeat(16, 1fr); gap: 10px; overflow-x: auto; padding-bottom: 10px;\">';
    range.forEach(i => {
      const type = getToothType(i), ufVal = perio['uf-'+i] || '', lfVal = perio['lf-'+i] || '';
      html += '<div style=\"display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 45px;\"><span style=\"font-size: 10px; font-weight: 800; color: var(--text-muted);\">' + i + '</span><input type=\"number\" id=\"perio-uf-' + i + '\" value=\"' + ufVal + '\" placeholder=\"B\" style=\"width: 100%; height: 28px; padding: 2px; margin: 0; text-align: center; font-size: 11px; border-radius: 4px; border: 1px solid var(--border);\" min=\"0\" max=\"15\"><svg class=\"tooth-svg\" viewBox=\"0 0 32 50\" style=\"width: 20px; height: 32px; opacity: 0.5;\">' + shapes[type] + '</svg><input type=\"number\" id=\"perio-lf-' + i + '\" value=\"' + lfVal + '\" placeholder=\"L\" style=\"width: 100%; height: 28px; padding: 2px; margin: 0; text-align: center; font-size: 11px; border-radius: 4px; border: 1px solid var(--border);\" min=\"0\" max=\"15\"></div>';
    });
    return html + '</div></div>';
  };
  container.innerHTML = createSection('Upper Teeth (Maxillary)', [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]) + createSection('Lower Teeth (Mandibular)', [32,31,30,29,28,27,26,25,24,23,22,21,20,19,18,17]);
  container.querySelectorAll('input').forEach(input => {
    const updateStyle = (val) => { const v = parseInt(val); input.style.color = v > 3 ? '#ef4444' : 'var(--text-main)'; input.style.background = v > 5 ? '#fee2e2' : 'var(--white)'; input.style.fontWeight = v > 5 ? '800' : '500'; input.style.borderColor = v > 3 ? '#ef4444' : 'var(--border)'; };
    updateStyle(input.value); input.oninput = (e) => updateStyle(e.target.value);
  });
};

window.savePerioData = async function() {
  const p = patients.find(x => x.id === currentId);
  if (!p.teeth) p.teeth = {}; if (!p.teeth.perio) p.teeth.perio = {};
  const inputs = document.getElementById('perio-visual-container').querySelectorAll('input');
  inputs.forEach(input => { p.teeth.perio[input.id.replace('perio-', '')] = input.value; });
  flashSync(\"✨ Perio Record Saved\");
  await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
};

// --- SKETCHING ENGINE ---
window.toggleSketchMode = function(target = 'teeth') {
  const canvas = document.getElementById('sketch-canvas'), toolbar = document.getElementById('sketch-toolbar');
  if(!canvas || !toolbar) return;
  const isActive = canvas.style.display === 'block' && currentSketchTarget === target;
  if (!isActive) {
    currentSketchTarget = target;
    const container = document.querySelector(target === 'teeth' ? '.odontogram-wrapper' : '.perio-wrapper');
    container.appendChild(canvas);
    container.closest('.card').querySelector('div').after(toolbar);
    canvas.style.display = 'block'; toolbar.style.display = 'flex';
    canvas.width = container.offsetWidth; canvas.height = container.offsetHeight;
    window.initSketchEngine();
    const p = patients.find(x => x.id === currentId);
    if (p && p.teeth) {
      const sketchData = target === 'teeth' ? p.teeth.sketch : p.teeth.perio_sketch;
      if (sketchData) { const img = new Image(); img.onload = () => { ctx.drawImage(img, 0, 0); history = [canvas.toDataURL()]; historyIndex = 0; }; img.src = sketchData; }
      else { ctx.clearRect(0, 0, canvas.width, canvas.height); history = [canvas.toDataURL()]; historyIndex = 0; }
    }
  } else { canvas.style.display = 'none'; toolbar.style.display = 'none'; }
};

window.saveSketch = async function() {
  const canvas = document.getElementById('sketch-canvas');
  const p = patients.find(x => x.id === currentId);
  if(!p.teeth) p.teeth = {};
  if (currentSketchTarget === 'teeth') p.teeth.sketch = canvas.toDataURL('image/png', 0.5);
  else p.teeth.perio_sketch = canvas.toDataURL('image/png', 0.5);
  flashSync(\"✨ Clinical Notes Saved\");
  await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
};

window.initSketchEngine = function() {
  const canvas = document.getElementById('sketch-canvas'); ctx = canvas.getContext('2d');
  ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const getPos = (e) => { const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX, clientY = e.touches ? e.touches[0].clientY : e.clientY; return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) }; };
  const start = (e) => { isDrawing = true; const pos = getPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); };
  const draw = (e) => { if (!isDrawing) return; const pos = getPos(e); ctx.strokeStyle = sketchColor; ctx.lineTo(pos.x, pos.y); ctx.stroke(); };
  const stop = () => { if (isDrawing) { isDrawing = false; historyIndex++; history.splice(historyIndex); history.push(canvas.toDataURL()); if (history.length > 20) { history.shift(); historyIndex--; } } };
  canvas.onmousedown = start; canvas.onmousemove = draw; canvas.onmouseup = stop;
  canvas.ontouchstart = (e) => { e.preventDefault(); start(e); }; canvas.ontouchmove = (e) => { e.preventDefault(); draw(e); }; canvas.ontouchend = (e) => { e.preventDefault(); stop(); };
};

window.setSketchColor = function(color, el) {
  if (color === 'erase') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 10; }
  else { ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 3; sketchColor = color; }
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active')); el.classList.add('active');
};

window.undoSketch = function() {
  if (historyIndex > 0) {
    historyIndex--; const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(img, 0, 0); if (document.querySelector('.color-swatch[onclick*=\"erase\"]').classList.contains('active')) ctx.globalCompositeOperation = 'destination-out'; };
    img.src = history[historyIndex];
  } else if (historyIndex === 0) { historyIndex = -1; ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
};

window.redoSketch = function() {
  if (historyIndex < history.length - 1) {
    historyIndex++; const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(img, 0, 0); if (document.querySelector('.color-swatch[onclick*=\"erase\"]').classList.contains('active')) ctx.globalCompositeOperation = 'destination-out'; };
    img.src = history[historyIndex];
  }
};

window.clearSketch = function() { if(confirm(\"Clear all drawing notes?\")) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); };


// --- DOCUMENTATION & IMAGING ---
let currentEditIndex = null;
window.renderImages = function(p) {
  const gallery = document.getElementById('image-gallery'), msg = document.getElementById('no-images-msg'), images = (p.teeth && p.teeth.images) || [];
  if(!gallery) return;
  gallery.innerHTML = '';
  if (images.length === 0) msg.style.display = 'block';
  else {
    msg.style.display = 'none';
    images.forEach((imgObj, index) => {
      const isLegacy = typeof imgObj === 'string', data = isLegacy ? imgObj : imgObj.data, category = isLegacy ? 'Uncategorized' : imgObj.category, note = isLegacy ? '' : imgObj.note, date = isLegacy ? 'Legacy' : imgObj.date;
      const div = document.createElement('div');
      div.style = 'background: white; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow);';
      div.innerHTML = '<div style=\"aspect-ratio: 16/9; overflow: hidden; background: #000; cursor: pointer;\" onclick=\"window.openFullImage(\\''+data+'\\', \\''+category+'\\', \\''+(note||'').replace(/'/g, \"\\\\'\")+'\\')\"><img src=\"'+data+'\" style=\"width: 100%; height: 100%; object-fit: contain;\"></div><div style=\"padding: 15px;\"><div style=\"display: flex; justify-content: space-between;\"><span style=\"font-size: 10px; font-weight: 800; color: var(--primary-light);\">'+category+'</span><span style=\"font-size: 10px; color: var(--text-muted);\">'+date+'</span></div><p style=\"font-size: 13px; margin: 5px 0;\">'+(note || 'No notes.')+'</p><div style=\"display: flex; gap: 10px; border-top: 1px solid var(--border); padding-top: 10px;\"><button onclick=\"window.editPhoto('+index+')\" style=\"background: none; border: none; color: var(--primary-light); font-size: 11px; cursor: pointer;\">Edit</button><button onclick=\"window.deletePhoto('+index+')\" style=\"background: none; border: none; color: #ef4444; font-size: 11px; cursor: pointer;\">Remove</button></div></div>';
      gallery.appendChild(div);
    });
  }
};

window.openFullImage = function(src, category, note) {
  const viewer = document.getElementById('image-viewer'), img = document.getElementById('viewer-img'), catEl = document.getElementById('viewer-category'), noteEl = document.getElementById('viewer-note');
  img.src = src; catEl.innerText = category; noteEl.innerText = note || \"No notes.\";
  viewer.style.display = 'flex'; viewer.classList.remove('hidden'); document.body.style.overflow = 'hidden';
};

window.closeImageViewer = function() {
  const viewer = document.getElementById('image-viewer'); viewer.style.display = 'none'; viewer.classList.add('hidden'); document.body.style.overflow = 'auto';
};

window.editPhoto = function(index) {
  const p = patients.find(x => x.id === currentId), imgObj = p.teeth.images[index];
  currentEditIndex = index;
  const isLegacy = typeof imgObj === 'string';
  document.getElementById('edit-photo-category').value = isLegacy ? 'Other' : imgObj.category;
  document.getElementById('edit-photo-note').value = isLegacy ? '' : (imgObj.note || '');
  const modal = document.getElementById('edit-photo-modal'); modal.style.display = 'flex'; modal.classList.remove('hidden');
};

window.closePhotoEdit = function() {
  const modal = document.getElementById('edit-photo-modal'); modal.style.display = 'none'; modal.classList.add('hidden'); currentEditIndex = null;
};

window.savePhotoEdit = async function() {
  if (currentEditIndex === null) return;
  const p = patients.find(x => x.id === currentId), imgObj = p.teeth.images[currentEditIndex], category = document.getElementById('edit-photo-category').value, note = document.getElementById('edit-photo-note').value.trim(), fileInput = document.getElementById('edit-photo-file'), newFile = fileInput.files[0];
  const finalize = async (imageData) => {
    if (typeof imgObj === 'string') p.teeth.images[currentEditIndex] = { data: imageData || imgObj, category, note, date: 'Updated' };
    else { if (imageData) imgObj.data = imageData; imgObj.category = category; imgObj.note = note; if (imageData) imgObj.date = new Date().toLocaleDateString() + ' (Updated)'; }
    flashSync(); await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
    fileInput.value = ''; window.closePhotoEdit(); window.renderImages(p);
  };
  if (newFile) { const reader = new FileReader(); reader.onload = (e) => finalize(e.target.result); reader.readAsDataURL(newFile); }
  else finalize();
};

window.processPhotoUpload = async function() {
  const fileInput = document.getElementById('photo-file'), categoryInput = document.getElementById('photo-category'), noteInput = document.getElementById('photo-note'), file = fileInput.files[0];
  if (!file || !currentId) return alert(\"Select an image file.\");
  const p = patients.find(x => x.id === currentId), reader = new FileReader();
  reader.onload = async (e) => {
    const newPhoto = { data: e.target.result, category: categoryInput.value, note: noteInput.value.trim(), date: new Date().toLocaleDateString() };
    if (!p.teeth) p.teeth = {}; if (!p.teeth.images) p.teeth.images = [];
    p.teeth.images.unshift(newPhoto); flashSync();
    await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
    fileInput.value = ''; noteInput.value = ''; document.getElementById('photo-upload-container').classList.add('hidden'); window.renderImages(p);
  };
  reader.readAsDataURL(file);
};

window.deletePhoto = async function(index) {
  if (!confirm(\"Remove image?\")) return;
  const p = patients.find(x => x.id === currentId); p.teeth.images.splice(index, 1);
  flashSync(); await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId); window.renderImages(p);
};

// --- TREATMENT HISTORY ---
window.renderTreatmentHistory = function(p) {
  const timeline = document.getElementById('treatment-timeline'), msg = document.getElementById('no-treatment-msg'), history = (p.teeth && p.teeth.history) || [], dentistSelect = document.getElementById('treat-dentist');
  const currentUserEmail = document.getElementById('current-user-email').innerText;
  const emails = new Set(patients.map(x => (x.teeth && x.teeth.dentist_email) || 'General / Unassigned')); emails.add(currentUserEmail);
  if(dentistSelect) dentistSelect.innerHTML = Array.from(emails).map(e => '<option value=\"'+e+'\" '+(currentUserEmail === e ? 'selected' : '')+'>'+(staff[e] || e)+'</option>').join('');
  if(!timeline) return;
  timeline.innerHTML = '<div style=\"position: absolute; left: 10px; top: 0; bottom: 0; width: 2px; background: var(--border);\"></div>';
  if (history.length === 0) { msg.style.display = 'block'; timeline.style.display = 'none'; }
  else {
    msg.style.display = 'none'; timeline.style.display = 'block';
    [...history].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((entry, idx) => {
      const div = document.createElement('div'); div.style = 'position: relative; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid var(--border);';
      div.innerHTML = '<div style=\"position: absolute; left: -25px; top: 5px; width: 12px; height: 12px; border-radius: 50%; background: var(--primary-light); border: 3px solid var(--white);\"></div><div style=\"display: flex; justify-content: space-between;\"><div><span style=\"font-size: 12px; font-weight: 800; color: var(--primary-light);\">'+entry.date+'</span><h4 style=\"margin: 4px 0;\">'+entry.procedure+'</h4></div><span style=\"font-size: 12px;\">'+(staff[entry.dentist] || entry.dentist)+'</span></div><div style=\"display: flex; gap: 20px; font-size: 13px; font-weight: 700;\"><span>Fee: ₱'+(entry.debit||0)+'</span><span>Paid: ₱'+(entry.credit||0)+'</span></div><p style=\"font-size: 14px; margin-top: 10px;\">'+(entry.notes||'')+'</p><button onclick=\"window.deleteTreatmentEntry('+idx+')\" style=\"background: none; border: none; color: #ef4444; font-size: 11px; cursor: pointer;\">Remove</button>';
      timeline.appendChild(div);
    });
    if(window.lucide) lucide.createIcons();
  }
};

window.addTreatmentEntry = async function() {
  const date = document.getElementById('treat-date').value, time = document.getElementById('treat-time').value, procedure = document.getElementById('treat-procedure').value, dentist = document.getElementById('treat-dentist').value, notes = document.getElementById('treat-notes').value, debit = document.getElementById('treat-debit').value, credit = document.getElementById('treat-credit').value, balance = document.getElementById('treat-balance').value;
  if (!date || !procedure) return alert(\"Date and Procedure are required\");
  const p = patients.find(x => x.id === currentId); if (!p.teeth) p.teeth = {}; if (!p.teeth.history) p.teeth.history = [];
  p.teeth.history.push({ date, time, procedure, dentist, notes, debit, credit, balance });
  flashSync(); await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId);
  document.getElementById('treatment-form-container').classList.add('hidden'); window.renderTreatmentHistory(p);
};

window.deleteTreatmentEntry = async function(index) {
  if (!confirm(\"Delete treatment entry?\")) return;
  const p = patients.find(x => x.id === currentId), hist = [...p.teeth.history].sort((a, b) => new Date(b.date) - new Date(a.date));
  const origIdx = p.teeth.history.findIndex(e => e === hist[index]); p.teeth.history.splice(origIdx, 1);
  flashSync(); await _supabase.from('patients').update({ teeth: p.teeth }).eq('id', currentId); window.renderTreatmentHistory(p);
};

// --- SCHEDULER ---
window.loadAppointments = async function() {
  const { data } = await _supabase.from('appointments').select('*');
  if (data) appointments = data; window.renderScheduler();
};

window.changeWeek = function(dir) {
  if (dir === 0) { currentWeekStart = new Date(); currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay()); }
  else currentWeekStart.setDate(currentWeekStart.getDate() + (dir * 7));
  currentWeekStart.setHours(0, 0, 0, 0); window.renderScheduler();
};

window.renderScheduler = function() {
  const grid = document.getElementById('scheduler-grid'), range = document.getElementById('scheduler-date-range'), filter = document.getElementById('scheduler-dentist-filter').value;
  if(!grid) return;
  const weekEnd = new Date(currentWeekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  range.innerText = currentWeekStart.toLocaleDateString() + ' - ' + weekEnd.toLocaleDateString();
  const emails = new Set(patients.map(x => (x.teeth && x.teeth.dentist_email) || 'General / Unassigned'));
  document.getElementById('scheduler-dentist-filter').innerHTML = '<option value=\"all\">All Dentists</option>' + Array.from(emails).map(e => '<option value=\"'+e+'\" '+(filter === e ? 'selected' : '')+'>'+(staff[e] || e)+'</option>').join('');
  let html = '<div style=\"background: var(--card-muted); padding: 15px; border-bottom: 1px solid var(--border);\">Time</div>';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart); d.setDate(d.getDate() + i);
    html += '<div style=\"background: var(--card-muted); padding: 15px; text-align: center; border-bottom: 1px solid var(--border);\"><div style=\"font-size: 11px;\">'+days[i]+'</div><div style=\"font-size: 18px; font-weight: 800;\">'+d.getDate()+'</div></div>';
  }
  const hours = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
  hours.forEach(h => {
    html += '<div style=\"padding: 15px; font-size: 12px; background: var(--white); border-bottom: 1px solid var(--border);\">'+h+' '+(h>=8&&h<12?'AM':'PM')+'</div>';
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart); d.setDate(d.getDate() + i); const dateStr = d.toISOString().split('T')[0];
      const slotApps = appointments.filter(a => a.date === dateStr && a.hour === h && (filter === 'all' || a.dentist_email === filter));
      html += '<div style=\"background: var(--white); min-height: 80px; padding: 5px; border-bottom: 1px solid var(--border);\">'+slotApps.map(a => {
        const pat = patients.find(x => x.id === a.patient_id) || { fname: 'Unknown', lname: '' };
        return '<div onclick=\"window.openEditAppointment(\\''+a.id+'\\')\" style=\"background: var(--primary-light); color: white; padding: 6px; border-radius: 8px; font-size: 11px; cursor: pointer;\">'+pat.fname+' '+pat.lname.charAt(0)+'.<br>'+(a.procedure||'')+'</div>';
      }).join('')+'<button onclick=\"window.openAppointmentAt(\\''+dateStr+'\\', '+h+')\" style=\"width: 100%; background: transparent; border: 1px dashed var(--border); cursor: pointer;\">+</button></div>';
    }
  });
  grid.innerHTML = html;
};

let currentAppId = null;
window.openNewAppointment = function() {
  currentAppId = null; document.getElementById('app-modal-title').innerText = \"Schedule New Appointment\"; document.getElementById('app-delete-btn').style.display = 'none';
  document.getElementById('app-patient-id').innerHTML = patients.map(p => '<option value=\"'+p.id+'\">'+p.fname+' '+p.lname+'</option>').join('');
  document.getElementById('app-date').value = new Date().toISOString().split('T')[0]; document.getElementById('app-hour').value = \"8\"; document.getElementById('app-procedure').value = \"\";
  window.toggleAppointmentModal(true);
};

window.openAppointmentAt = function(date, hour) { window.openNewAppointment(); document.getElementById('app-date').value = date; document.getElementById('app-hour').value = hour; };

window.openEditAppointment = function(id) {
  const app = appointments.find(a => a.id === id); if (!app) return;
  currentAppId = id; document.getElementById('app-modal-title').innerText = \"Edit Appointment\"; document.getElementById('app-delete-btn').style.display = 'block';
  document.getElementById('app-patient-id').innerHTML = patients.map(p => '<option value=\"'+p.id+'\" '+(p.id===app.patient_id?'selected':'')+'>'+p.fname+' '+p.lname+'</option>').join('');
  document.getElementById('app-date').value = app.date; document.getElementById('app-hour').value = app.hour; document.getElementById('app-procedure').value = app.procedure || \"\";
  window.toggleAppointmentModal(true);
};

window.toggleAppointmentModal = function(show) { const modal = document.getElementById('appointment-modal'); if(modal) { modal.style.display = show ? 'flex' : 'none'; modal.classList.toggle('hidden', !show); } };

window.processAppointment = async function() {
  const patient_id = document.getElementById('app-patient-id').value, date = document.getElementById('app-date').value, hour = parseInt(document.getElementById('app-hour').value), procedure = document.getElementById('app-procedure').value;
  const { data: { user } } = await _supabase.auth.getUser(); const appData = { patient_id, date, hour, procedure, dentist_email: user.email };
  if (currentAppId) await _supabase.from('appointments').update(appData).eq('id', currentAppId);
  else await _supabase.from('appointments').insert([appData]);
  window.toggleAppointmentModal(false); window.loadAppointments();
};

window.deleteAppointment = async function() {
  if (!confirm(\"Cancel appointment?\")) return;
  await _supabase.from('appointments').delete().eq('id', currentAppId);
  window.toggleAppointmentModal(false); window.loadAppointments();
};


// --- ANALYTICS ---
window.loadAnalytics = function() {
  const summary = document.getElementById('analytics-summary'), sChart = document.getElementById('status-chart'), fChart = document.getElementById('findings-chart'), wList = document.getElementById('workload-list');
  if(!summary) return;
  const total = patients.length, active = patients.filter(p => (p.teeth && p.teeth.status) === 'Active').length, completed = patients.filter(p => (p.teeth && p.teeth.status) === 'Completed').length, alerts = patients.filter(p => p.teeth && p.teeth.medical_alerts && p.teeth.medical_alerts.trim() !== \"\").length;
  summary.innerHTML = '<div class=\"stat-card\"><span class=\"stat-label\">Total Patients</span><span class=\"stat-value\">'+total+'</span></div><div class=\"stat-card\"><span class=\"stat-label\">Active Cases</span><span class=\"stat-value\" style=\"color: #22c55e;\">'+active+'</span></div><div class=\"stat-card\"><span class=\"stat-label\">Completed</span><span class=\"stat-value\" style=\"color: #3b82f6;\">'+completed+'</span></div><div class=\"stat-card\"><span class=\"stat-label\">Medical Alerts</span><span class=\"stat-value\" style=\"color: #ef4444;\">'+alerts+'</span></div>';
  const statuses = ['Active', 'Inactive', 'Completed', 'Emergency'], sCounts = statuses.map(s => patients.filter(p => (p.teeth && p.teeth.status) === s).length), sMax = Math.max(...sCounts) || 1;
  sChart.innerHTML = statuses.map((s, i) => '<div class=\"bar-wrapper\"><div class=\"bar\" style=\"height: '+(sCounts[i]/sMax*100)+'%; background: var(--primary-light);\"><div class=\"bar-tooltip\">'+sCounts[i]+' Patients</div></div><span class=\"bar-label\">'+s+'</span></div>').join('');
  let dCount = 0, fCount = 0; patients.forEach(p => { if (p.teeth) Object.values(p.teeth).forEach(v => { if (v === 'decay') dCount++; if (v === 'filled') fCount++; }); });
  const fMax = Math.max(dCount, fCount) || 1;
  fChart.innerHTML = '<div class=\"bar-wrapper\"><div class=\"bar\" style=\"height: '+(dCount/fMax*100)+'%; background: #ef4444;\"><div class=\"bar-tooltip\">'+dCount+' Decay</div></div><span class=\"bar-label\">Decay</span></div><div class=\"bar-wrapper\"><div class=\"bar\" style=\"height: '+(fCount/fMax*100)+'%; background: #3b82f6;\"><div class=\"bar-tooltip\">'+fCount+' Filled</div></div><span class=\"bar-label\">Filled</span></div>';
  const workload = patients.reduce((acc, p) => { const e = (p.teeth && p.teeth.dentist_email) || 'General'; acc[e] = (acc[e] || 0) + 1; return acc; }, {});
  const sortedW = Object.entries(workload).sort((a, b) => b[1] - a[1]), wMax = sortedW[0] ? sortedW[0][1] : 1;
  wList.innerHTML = sortedW.map(([e, c]) => '<div style=\"display: flex; flex-direction: column; gap: 8px;\"><div style=\"display: flex; justify-content: space-between;\"><span>'+(staff[e]||e)+'</span><span>'+c+' Patients</span></div><div style=\"width: 100%; height: 8px; background: var(--card-muted); border-radius: 4px; overflow: hidden;\"><div style=\"width: '+(c/wMax*100)+'%; height: 100%; background: var(--primary-light);\"></div></div></div>').join('');
};

// --- STAFF ---
window.loadStaff = async function() {
  const { data } = await _supabase.from('staff').select('*');
  if (data) { staff = data.reduce((acc, s) => { acc[s.email] = s.name; return acc; }, {}); window.renderStaffList(); }
};

window.renderStaffList = function() {
  const body = document.getElementById('staff-table-body'); if(!body) return;
  body.innerHTML = Object.entries(staff).map(([e, n]) => '<tr><td>'+e+'</td><td style=\"font-weight: 600; color: var(--primary);\">'+n+'</td><td style=\"text-align: right;\"><button class=\"btn\" style=\"background: #ef4444; padding: 4px 10px; font-size: 11px;\" onclick=\"window.deleteStaff(\\''+e+'\\')\">Remove</button></td></tr>').join('');
};

window.saveStaffName = async function() {
  const email = document.getElementById('staff-email').value.trim(), name = document.getElementById('staff-name').value.trim();
  if (!email || !name) return alert(\"Required fields missing\");
  flashSync(); await _supabase.from('staff').upsert([{ email, name }], { onConflict: 'email' });
  document.getElementById('staff-email').value = ''; document.getElementById('staff-name').value = ''; await window.loadStaff(); window.renderPatientList();
};

window.deleteStaff = async function(email) {
  if (!confirm(\"Remove staff?\")) return; flashSync(); await _supabase.from('staff').delete().eq('email', email); await window.loadStaff(); window.renderPatientList();
};

// --- UI & THEME ---
window.toggleTheme = function() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light'); window.updateThemeUI(isDark);
};

window.updateThemeUI = function(isDark) {
  const icon = isDark ? 'sun' : 'moon';
  document.getElementById('theme-icon').innerHTML = '<i data-lucide=\"'+icon+'\"></i>';
  document.getElementById('theme-text').innerText = isDark ? 'Light Mode' : 'Dark Mode';
  if(window.lucide) lucide.createIcons();
};

window.initTheme = function() {
  const saved = localStorage.getItem('theme'), isDark = saved === 'dark';
  if (isDark) document.body.classList.add('dark-mode'); window.updateThemeUI(isDark);
};

window.showView = function(v) {
  ['list', 'scheduler', 'add', 'staff', 'detail', 'analytics', 'solitaire'].forEach(id => { const el = document.getElementById('view-' + id); if (el) el.classList.toggle('hidden', id !== v); });
  ['list', 'scheduler', 'add', 'staff', 'analytics', 'solitaire'].forEach(id => { const el = document.getElementById('nav-' + id); if (el) el.classList.toggle('active', id === v); });
  if (window.innerWidth <= 1024) window.toggleMenu(false);
  if (v === 'list') { window.loadStaff().then(() => { window.renderPatientList(); window.loadPatients(); }); }
  if (v === 'scheduler') window.loadAppointments();
  if (v === 'staff') window.loadStaff();
  if (v === 'analytics') window.loadAnalytics();
};

window.toggleMenu = function(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('sidebar-overlay').classList.toggle('active', open);
  document.getElementById('close-menu-btn').style.display = open ? 'block' : 'none';
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => { if(window.lucide) lucide.createIcons(); window.checkSession(); });

