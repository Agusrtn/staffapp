// Base URL for backend API (adjust for local development)
// Use relative paths for local development (localhost / 127.0.0.1 / file://) so we don't accidentally point to a deployed URL.
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.protocol === 'file:';
const API_BASE = window.API_BASE || (isLocalhost ? '' : 'https://staffapp-p0jo.onrender.com');

// Initialize Socket.io (connect to backend)
const socket = io(API_BASE);

console.log('Connecting to socket at:', API_BASE);

// Global state
let currentUser = localStorage.getItem('currentUser') || 'Usuario';
let currentRoles = JSON.parse(localStorage.getItem('currentRoles')) || ['Staff']; // Cambiar a array
let currentProfilePic = localStorage.getItem('currentProfilePic') || `https://i.pravatar.cc/150?u=${currentUser}`;
let members = [];
let messages = JSON.parse(localStorage.getItem('messages')) || [];
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
let files = JSON.parse(localStorage.getItem('files')) || [];
let currentDate = new Date();
let allUsers = [];

// Helper function to check if user has a specific role
function hasRole(role) {
    return currentRoles.includes(role);
}

// Helper function to check if user is admin (Director or Administrador)
function isAdmin() {
    return hasRole('Director') || hasRole('Administrador') || currentUser === 'Agustinson';
}

// Get profile picture for a user (falls back to pravatar if missing)
function getProfilePic(user) {
    const u = allUsers.find(u => u.user === user);
    return u?.profilePic || `https://i.pravatar.cc/150?u=${user}`;
}

// Initialize dashboard on load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard loading...');
    console.log('Current user from localStorage:', localStorage.getItem('currentUser'));
    console.log('Current roles from localStorage:', localStorage.getItem('currentRoles'));

    document.getElementById('currentUser').textContent = currentUser;
    document.getElementById('profilePic').src = currentProfilePic;
    document.getElementById('modalProfilePic').src = currentProfilePic;

    // Show admin button if user is admin
    if (isAdmin()) {
        console.log('User is admin, showing admin button');
        document.getElementById('adminBtn').style.display = 'flex';
    } else {
        console.log('User is not admin, hiding admin button');
    }

    socket.emit('user_joined', { user: currentUser, roles: currentRoles }); // Cambiar a roles
    loadMessages();
    loadTasks();
    loadFiles();
    renderCalendar();
    loadMembers();
    loadAllUsers();

    // If admin, load access requests and users
    if (isAdmin()) {
        loadAccessRequests();
        loadUsersRoles();
    }
});

// ==================== TAB SWITCHING ====================
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Refresh content if needed
    if (tabName === 'calendar') renderCalendar();
    if (tabName === 'members') loadMembers();
}

// ==================== NOTIFICATIONS ====================
function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationsContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

// ==================== CHAT ====================
function sendMessage() {
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    
    if (!msg) return;
    
    const messageObj = {
        user: currentUser,
        text: msg,
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        profilePic: currentProfilePic
    };
    
    socket.emit('chat_message', messageObj);
    input.value = '';
}

socket.on('chat_message', (messageObj) => {
    messages.push(messageObj);
    localStorage.setItem('messages', JSON.stringify(messages));
    displayMessage(messageObj);
});

function displayMessage(messageObj) {
    const messagesArea = document.getElementById('messagesArea');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    const avatar = getProfilePic(messageObj.user);
    messageDiv.innerHTML = `
        <img src="${avatar}" alt="Avatar" class="message-avatar">
        <div class="message-content">
            <div class="message-header">
                <span class="message-author">${messageObj.user}</span>
                <span class="message-time">${messageObj.timestamp}</span>
            </div>
            <p class="message-text">${escapeHtml(messageObj.text)}</p>
        </div>
    `;
    messagesArea.appendChild(messageDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function loadMessages() {
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.innerHTML = '';
    messages.forEach(msg => displayMessage(msg));
}

// ==================== MEMBERS ====================
socket.on('update_members', (membersList) => {
    members = membersList;
    loadMembers();
    if (isAdmin()) loadAdminMembers();
});

socket.on('user_joined', (data) => {
    showNotification(`${data.user} se unió al chat`, 'success');
});

socket.on('user_left', (data) => {
    showNotification(`${data.user} salió del chat`, 'error');
});

function loadMembers() {
    const grid = document.getElementById('membersGrid');
    grid.innerHTML = '';
    
    if (allUsers.length === 0) {
        allUsers = [{
            user: currentUser,
            roles: currentRoles,
            profilePic: currentProfilePic,
            approved: true
        }];
    }
    
    allUsers.forEach(user => {
        const card = document.createElement('div');
        card.className = 'member-card';
        const isOnline = members.some(m => m.user === user.user || m === user.user);
        const statusClass = isOnline ? '' : 'offline';
        const statusText = isOnline ? 'Activo' : 'Inactivo';
        
        // Mostrar el rol principal o todos los roles
        const primaryRole = user.roles && user.roles.length > 0 ? user.roles[0] : 'Staff';
        const allRolesText = user.roles && user.roles.length > 1 ? user.roles.join(', ') : primaryRole;
        const roleClass = `role-${primaryRole.replace(/\s+/g, '')}`;
        
        // Si es admin, mostrar roles gestionables
        let rolesHtml = '';
        if (isAdmin() && user.user !== currentUser) {
            // Mostrar roles existentes como clickeables para quitar
            const userRoles = user.roles || ['Staff'];
            rolesHtml = '<div class="member-roles">';
            userRoles.forEach(role => {
                const roleClassName = `role-${role.replace(/\s+/g, '')}`;
                rolesHtml += `<span class="role-tag ${roleClassName} clickable-role" onclick="removeUserRole('${user.user}', '${role}')" title="Click para quitar rol">${role} ×</span>`;
            });
            // Botón para agregar nuevo rol
            rolesHtml += `<span class="add-role-btn" onclick="showAddRoleModal('${user.user}')" title="Agregar rol">+</span>`;
            rolesHtml += '</div>';
        } else {
            // Vista normal para no-admins
            rolesHtml = `<span class="role-tag ${roleClass}" title="${allRolesText}">${primaryRole}</span>`;
        }
        
        const avatar = getProfilePic(user.user);
        card.innerHTML = `
            <img src="${avatar}" alt="Avatar" class="member-avatar">
            <p class="member-name">${user.user}</p>
            ${rolesHtml}
            <p class="member-status ${statusClass}"><span class="status-dot ${statusClass}"></span> ${statusText}</p>
        `;
        grid.appendChild(card);
    });
}

// ==================== CALENDAR ====================
function renderCalendar() {
    const monthYear = document.getElementById('monthYear');
    const calendarDays = document.getElementById('calendarDays');
    
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    
    monthYear.textContent = new Date(year, month).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    
    calendarDays.innerHTML = '';
    
    // Previous month days
    const prevMonth = new Date(year, month, 0);
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const day = document.createElement('div');
        day.className = 'day other-month';
        day.textContent = prevMonth.getDate() - i;
        calendarDays.appendChild(day);
    }
    
    // Current month days
    const today = new Date();
    for (let i = 1; i <= daysInMonth; i++) {
        const day = document.createElement('div');
        day.className = 'day';
        
        // Check if there are tasks for this day
        const dayTasks = tasks.filter(t => {
            if (t.completed || !t.date) return false;
            const taskDate = new Date(t.date);
            return taskDate.getDate() === i && taskDate.getMonth() === month && taskDate.getFullYear() === year;
        });
        
        if (dayTasks.length > 0) {
            day.innerHTML = `<div><strong>${i}</strong><br><small style="font-size:10px;color:var(--primary);">${dayTasks.length} tarea${dayTasks.length > 1 ? 's' : ''}</small></div>`;
        } else {
            day.textContent = i;
        }
        
        if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) {
            day.classList.add('today');
        }
        
        day.addEventListener('click', () => {
            const dayDate = new Date(year, month, i);
            const dayTasks = tasks.filter(t => {
                if (t.completed || !t.date) return false;
                const taskDate = new Date(t.date);
                return taskDate.getDate() === i && taskDate.getMonth() === month && taskDate.getFullYear() === year;
            });
            showDayEvents(dayDate, dayTasks);
        });
        calendarDays.appendChild(day);
    }
    
    // Next month days
    const remainingCells = 42 - (startingDayOfWeek + daysInMonth);
    for (let i = 1; i <= remainingCells; i++) {
        const day = document.createElement('div');
        day.className = 'day other-month';
        day.textContent = i;
        calendarDays.appendChild(day);
    }
}

function showDayEvents(date, dayTasks) {
    const panel = document.getElementById('dayEventsPanel');
    const title = document.getElementById('dayEventsTitle');
    const list = document.getElementById('dayEventsList');

    title.textContent = `Eventos del ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    list.innerHTML = '';

    if (!dayTasks || dayTasks.length === 0) {
        list.innerHTML = '<p class="no-events">Este día no tiene eventos fijados</p>';
    } else {
        dayTasks.forEach(task => {
            const item = document.createElement('div');
            item.className = 'day-event-item';
            item.innerHTML = `
                <div class="event-title">${escapeHtml(task.title)}</div>
                <div class="event-desc">${escapeHtml(task.description || '')}</div>
            `;
            list.appendChild(item);
        });
    }

    panel.classList.add('active');
}

function closeDayEvents() {
    document.getElementById('dayEventsPanel').classList.remove('active');
}

function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}

// ==================== TASKS ====================
function addTask() {
    const titleInput = document.getElementById('taskTitleInput');
    const descInput = document.getElementById('taskDescInput');
    const dateInput = document.getElementById('taskDateInput');
    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const date = dateInput.value;
    
    if (!title) {
        showNotification('Escribe un título para la tarea', 'error');
        return;
    }
    if (!date) {
        showNotification('Selecciona una fecha para la tarea', 'error');
        return;
    }
    
    const task = {
        id: Date.now(),
        title,
        description,
        date,
        completed: false
    };
    
    tasks.push(task);
    localStorage.setItem('tasks', JSON.stringify(tasks));
    
    fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
    });
    
    titleInput.value = '';
    descInput.value = '';
    dateInput.value = '';
    loadTasks();
    showNotification('Tarea agregada', 'success');
}

function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    localStorage.setItem('tasks', JSON.stringify(tasks));
    loadTasks();
    showNotification('Tarea eliminada', 'success');
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        localStorage.setItem('tasks', JSON.stringify(tasks));
        loadTasks();
    }
}

function loadTasks() {
    // try to sync with server first
    fetch(`${API_BASE}/tasks`)
        .then(res => res.json())
        .then(data => {
            // merge server tasks, prioritizing newest entries by id
            tasks = data;
            localStorage.setItem('tasks', JSON.stringify(tasks));
            renderTasksList();
        })
        .catch(() => {
            // fallback to local version if server unavailable
            renderTasksList();
        });
}

function renderTasksList() {
    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '';
    
    tasks.forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = `task-item ${task.completed ? 'completed' : ''}`;
        taskItem.innerHTML = `
            <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id})">
            <div class="task-details">
                <span class="task-title">${task.title}</span>
                <span class="task-desc">${escapeHtml(task.description)}</span>
                <span class="task-date">${task.date}</span>
            </div>
            <button class="task-delete" onclick="deleteTask(${task.id})">Eliminar</button>
        `;
        tasksList.appendChild(taskItem);
    });
}

// ==================== FILES ====================
function handleFileUpload(event) {
    const fileList = event.target.files;
    
    Array.from(fileList).forEach(file => {
        const fileObj = {
            id: Date.now(),
            name: file.name,
            size: (file.size / 1024).toFixed(2) + ' KB',
            type: getFileType(file.name)
        };
        
        files.push(fileObj);
        
        // Simulate file upload
        const formData = new FormData();
        formData.append('file', file);
        
        fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        }).then(() => {
            showNotification(`${file.name} subido correctamente`, 'success');
        }).catch(() => {
            showNotification(`Error al subir ${file.name}`, 'error');
        });
    });
    
    localStorage.setItem('files', JSON.stringify(files));
    loadFiles();
    document.getElementById('fileInput').value = '';
}

function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'xls': 'fa-file-excel',
        'xlsx': 'fa-file-excel',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'gif': 'fa-file-image',
        'zip': 'fa-file-archive',
        'rar': 'fa-file-archive'
    };
    return icons[ext] || 'fa-file';
}

function loadFiles() {
    const filesList = document.getElementById('filesList');
    filesList.innerHTML = '';
    
    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-icon">
                <i class="fas ${file.type}"></i>
            </div>
            <p class="file-name">${file.name}</p>
            <p class="file-size">${file.size}</p>
        `;
        filesList.appendChild(fileItem);
    });
}

// ==================== UTILITIES ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== PROFILE MODAL ====================
function openProfileModal() {
    document.getElementById('profileModal').classList.add('show');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('show');
}

function updateProfilePic() {
    const fileInput = document.getElementById('profileFileInput');
    const urlInput = document.getElementById('profileUrlInput').value.trim();

    // Si el usuario sube un archivo, lo usamos como primera opción
    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = () => saveProfilePic(reader.result);
        reader.onerror = () => showNotification('No se pudo leer el archivo', 'error');
        reader.readAsDataURL(file);
        return;
    }

    if (!urlInput) {
        showNotification('Selecciona una imagen o pega una URL', 'error');
        return;
    }

    saveProfilePic(urlInput);
}

function saveProfilePic(newPic) {
    currentProfilePic = newPic;
    localStorage.setItem('currentProfilePic', newPic);
    document.getElementById('profilePic').src = newPic;
    document.getElementById('modalProfilePic').src = newPic;

    // Actualizar mensajes locales para que reflejen el nuevo avatar
    messages = messages.map(m => m.user === currentUser ? { ...m, profilePic: newPic } : m);
    localStorage.setItem('messages', JSON.stringify(messages));

    // Actualizar en backend para que se refleje en otros usuarios
    fetch(`${API_BASE}/user/${encodeURIComponent(currentUser)}/profile-pic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profilePic: newPic })
    }).catch(() => {
        // no hacemos nada si falla, la foto se mantiene en el cliente
    });

    // Refrescar el chat para que los mensajes antiguos usen la nueva foto
    loadMessages();

    showNotification('Foto actualizada', 'success');
    closeProfileModal();
}

// ==================== ADMIN FUNCTIONS ====================
function loadAllUsers() {
    fetch(`${API_BASE}/users`)
        .then(res => res.json())
        .then(users => {
            allUsers = users;

            // Si hay datos del backend, sincronizar el perfil actual
            const me = allUsers.find(u => u.user === currentUser);
            if (me) {
                if (me.profilePic) {
                    currentProfilePic = me.profilePic;
                    localStorage.setItem('currentProfilePic', me.profilePic);
                    document.getElementById('profilePic').src = me.profilePic;
                    document.getElementById('modalProfilePic').src = me.profilePic;
                }
                if (me.roles && Array.isArray(me.roles)) {
                    currentRoles = me.roles;
                    localStorage.setItem('currentRoles', JSON.stringify(currentRoles));
                }
            }

            if (isAdmin()) {
                loadMembers();
                loadAdminMembers();
            }
        });
}

function loadAdminMembers() {
    const container = document.getElementById('onlineMembers');
    if (!container) return;

    container.innerHTML = '';

    if (allUsers.length === 0) {
        container.innerHTML = '<p style="color: var(--secondary);">No hay miembros registrados</p>';
        return;
    }

    const onlineSet = new Set(members.map(m => (typeof m === 'string' ? m : m.user)));

    allUsers.forEach(user => {
        const isOnline = onlineSet.has(user.user);
        const statusText = isOnline ? 'Activo' : 'Inactivo';
        const statusClass = isOnline ? '' : 'offline';
        const avatar = getProfilePic(user.user);
        const isMe = user.user === currentUser;

        const card = document.createElement('div');
        card.className = 'member-card admin-online';

        const avatarEl = document.createElement('img');
        avatarEl.src = avatar;
        avatarEl.alt = 'Avatar';
        avatarEl.className = 'member-avatar';

        const infoEl = document.createElement('div');
        infoEl.style.flex = '1';
        infoEl.innerHTML = `
            <p class="member-name">${user.user}${isMe ? ' (yo)' : ''}</p>
            <p class="member-status ${statusClass}"><span class="status-dot ${statusClass}"></span> ${statusText}</p>
        `;

        const actions = document.createElement('div');
        actions.className = 'admin-actions';

        const accessBtn = document.createElement('button');
        accessBtn.className = 'remove-access-btn';
        accessBtn.title = user.approved ? 'Revocar acceso' : 'Habilitar acceso';
        accessBtn.disabled = isMe;
        accessBtn.innerHTML = `<i class="fas fa-${user.approved ? 'minus' : 'plus'}"></i>`;
        accessBtn.addEventListener('click', () => setUserAccess(user.user, user.approved ? 'disable' : 'enable'));

        const passBtn = document.createElement('button');
        passBtn.className = 'remove-access-btn';
        passBtn.title = 'Reiniciar contraseña';
        passBtn.disabled = isMe;
        passBtn.innerHTML = '<i class="fas fa-key"></i>';
        passBtn.addEventListener('click', () => resetUserPassword(user.user));

        const reconnectBtn = document.createElement('button');
        reconnectBtn.className = 'remove-access-btn';
        reconnectBtn.title = 'Forzar reconexión';
        reconnectBtn.disabled = isMe;
        reconnectBtn.innerHTML = '<i class="fas fa-sync"></i>';
        reconnectBtn.addEventListener('click', () => forceUserReconnect(user.user));

        actions.appendChild(accessBtn);
        actions.appendChild(passBtn);
        actions.appendChild(reconnectBtn);

        card.appendChild(avatarEl);
        card.appendChild(infoEl);
        card.appendChild(actions);

        container.appendChild(card);
    });
}

function resetUserPassword(user) {
    if (!confirm(`¿Reiniciar contraseña de ${user} a "1234"?`)) return;

    fetch(`${API_BASE}/admin/user/${encodeURIComponent(user)}/reset-password`, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`Contraseña de ${user} reiniciada a "1234"`, 'success');
        } else {
            showNotification('No se pudo reiniciar la contraseña', 'error');
        }
    })
    .catch(() => showNotification('Error de conexión', 'error'));
}

function forceUserReconnect(user) {
    if (!confirm(`¿Forzar reconexión de ${user}?`)) return;

    fetch(`${API_BASE}/admin/user/${encodeURIComponent(user)}/force-logout`, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`Se forzó reconexión de ${user}`, 'success');
        } else {
            showNotification('No se pudo forzar reconexión', 'error');
        }
    })
    .catch(() => showNotification('Error de conexión', 'error'));
}

function clearConnectedMembers() {
    if (!confirm('¿Eliminar todos los miembros conectados (dejando solo Agustinson)?')) return;

    fetch(`${API_BASE}/admin/users/clear-connected`, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`Miembros eliminados: ${data.removed}` + (data.removedUsers ? ` (${data.removedUsers.join(', ')})` : ''), 'success');
            loadAllUsers();
            loadMembers();
            loadAdminMembers();
        } else {
            showNotification('No se pudieron eliminar los miembros conectados', 'error');
        }
    })
    .catch(() => showNotification('Error de conexión', 'error'));
}

function setUserAccess(user, action) {
    if (user === currentUser) {
        showNotification('No puedes cambiar tu propio acceso desde aquí.', 'error');
        return;
    }

    const actionLabel = action === 'disable' ? 'revocar el acceso' : 'habilitar el acceso';
    if (!confirm(`¿Quieres ${actionLabel} a ${user}?`)) return;

    const url = `${API_BASE}/admin/user/${encodeURIComponent(user)}/access`;
    console.log('[ADMIN] setUserAccess', action, url);

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
    })
    .then(async res => {
        const text = await res.text().catch(() => '');
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            // no es JSON
        }

        if (!res.ok) {
            const message = data?.message || `${res.status} ${res.statusText}`;
            throw new Error(message);
        }

        if (!data || !data.success) {
            throw new Error(data?.message || 'Error en la respuesta');
        }

        showNotification(`${action === 'disable' ? 'Acceso revocado' : 'Acceso habilitado'} para ${user}`, 'success');
        loadAllUsers();
        loadMembers();
        loadAdminMembers();
    })
    .catch(err => {
        console.error('[ADMIN] setUserAccess error', err);
        showNotification(err?.message || 'Error de conexión', 'error');
    });
}

function loadAccessRequests() {
    fetch(`${API_BASE}/admin/requests`)
        .then(res => res.json())
        .then(requests => {
            displayAccessRequests(requests);
        });
}

function displayAccessRequests(requests) {
    const container = document.getElementById('accessRequests');
    container.innerHTML = '';
    
    const pending = requests.filter(r => r.status === 'pending');
    
    if (pending.length === 0) {
        container.innerHTML = '<p style="color: var(--secondary);">No hay solicitudes pendientes</p>';
        return;
    }
    
    pending.forEach(req => {
        const reqDiv = document.createElement('div');
        reqDiv.className = 'access-request';
        reqDiv.innerHTML = `
            <img src="${req.profilePic}" alt="Avatar" class="request-avatar">
            <div class="request-info">
                <div class="request-user">${req.user}</div>
                <div class="request-status">Solicitud de registro</div>
            </div>
            <div class="request-actions">
                <button class="approve-btn" onclick="approveRequest(${req.id})">Aprobar</button>
                <button class="deny-btn" onclick="denyRequest(${req.id})">Denegar</button>
            </div>
        `;
        container.appendChild(reqDiv);
    });
}

function approveRequest(id) {
    fetch(`${API_BASE}/admin/request/${id}/approve`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showNotification('Solicitud aprobada', 'success');
                loadAccessRequests();
                loadAllUsers();
            }
        });
}

function denyRequest(id) {
    fetch(`${API_BASE}/admin/request/${id}/deny`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showNotification('Solicitud denegada', 'error');
                loadAccessRequests();
            }
        });
}

function loadUsersRoles() {
    const container = document.getElementById('usersRoles');
    container.innerHTML = '';
    
    const ROLES = ['Director', 'Co Director', 'Supervisor Staff', 'Senior Staff', 'Staff', 'Administrador'];
    
    allUsers.filter(u => u.user !== 'Agustinson').forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-role-item';
        
        let roleButtons = '<div class="role-selector">';
        ROLES.forEach(role => {
            const isSelected = user.roles && user.roles.includes(role);
            const action = isSelected ? 'remove' : 'add';
            const buttonClass = isSelected ? 'selected' : '';
            roleButtons += `
                <button class="role-option ${buttonClass}" onclick="changeUserRole('${user.user}', '${role}', '${action}')">
                    ${role}
                </button>
            `;
        });
        roleButtons += '</div>';
        
        // Mostrar todos los roles del usuario
        const rolesText = user.roles && user.roles.length > 0 ? user.roles.join(', ') : 'Staff';
        const primaryRole = user.roles && user.roles.length > 0 ? user.roles[0] : 'Staff';
        const roleClass = `role-${primaryRole.replace(/\s+/g, '')}`;
        
        userDiv.innerHTML = `
            <div class="user-role-header">
                <img src="${user.profilePic}" alt="Avatar" class="user-role-avatar">
                <div>
                    <div class="user-role-name">${user.user}</div>
                    <div class="role-tag ${roleClass}" title="${rolesText}">${rolesText}</div>
                </div>
            </div>
            ${roleButtons}
        `;
        container.appendChild(userDiv);
    });
}

function removeUserRole(user, role) {
    if (!confirm(`¿Estás seguro de quitar el rol "${role}" a ${user}?`)) {
        return;
    }
    
    fetch(`${API_BASE}/admin/user/${user}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, action: 'remove' })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`Rol "${role}" removido de ${user}`, 'success');
            loadAllUsers();
            loadMembers();
        } else {
            showNotification('Error al remover rol', 'error');
        }
    })
    .catch(() => showNotification('Error de conexión', 'error'));
}

function showAddRoleModal(user) {
    const availableRoles = ['Director', 'Co Director', 'Supervisor Staff', 'Senior Staff', 'Staff', 'Administrador'];
    const userData = allUsers.find(u => u.user === user);
    const currentRoles = userData ? (userData.roles || []) : [];
    
    // Filtrar roles que no tenga el usuario
    const rolesToAdd = availableRoles.filter(role => !currentRoles.includes(role));
    
    if (rolesToAdd.length === 0) {
        showNotification(`${user} ya tiene todos los roles disponibles`, 'error');
        return;
    }
    
    // Crear modal simple
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content role-modal">
            <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <h3>Agregar rol a ${user}</h3>
            <div class="role-options">
                ${rolesToAdd.map(role => `
                    <button class="role-option-btn" onclick="addUserRole('${user}', '${role}'); this.parentElement.parentElement.parentElement.remove()">
                        ${role}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
}

function addUserRole(user, role) {
    fetch(`${API_BASE}/admin/user/${user}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, action: 'add' })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`Rol "${role}" agregado a ${user}`, 'success');
            loadAllUsers();
            loadMembers();
        } else {
            showNotification('Error al agregar rol', 'error');
        }
    })
    .catch(() => showNotification('Error de conexión', 'error'));
}

// ==================== SOCKET EVENTS ====================
socket.on('update_members', (membersList) => {
    members = membersList;
    loadMembers();
    if (isAdmin()) loadAdminMembers();
});

socket.on('user_joined', (data) => {
    showNotification(`${data.user} se unió al chat`, 'success');
});

socket.on('user_left', (data) => {
    showNotification(`${data.user} salió del chat`, 'error');
});

socket.on('new_access_request', (request) => {
    if (isAdmin()) {
        loadAccessRequests();
        showNotification(`Nueva solicitud de ${request.user}`, 'success');
    }
});

socket.on('user_role_updated', (data) => {
    if (data.user === currentUser) {
        currentRoles = data.roles;
        localStorage.setItem('currentRoles', JSON.stringify(data.roles));
        showNotification('Tus roles han sido actualizados', 'success');
        
        // Recargar la página para aplicar cambios de permisos
        setTimeout(() => location.reload(), 1000);
    }
});

socket.on('force_logout', () => {
    showNotification('Tu acceso fue revocado. Serás redirigido.', 'error');
    setTimeout(() => {
        localStorage.clear();
        window.location.href = 'index.html';
    }, 1500);
});

socket.on('user_profile_updated', (data) => {
    const user = allUsers.find(u => u.user === data.user);
    if (user) user.profilePic = data.profilePic;

    if (data.user === currentUser) {
        currentProfilePic = data.profilePic;
        localStorage.setItem('currentProfilePic', data.profilePic);
        document.getElementById('profilePic').src = data.profilePic;
        document.getElementById('modalProfilePic').src = data.profilePic;
    }

    loadMembers();
    loadAdminMembers();
});

socket.on('user_access_changed', (data) => {
    if (data.user === currentUser && !data.approved) {
        showNotification('Tu acceso fue revocado.', 'error');
        setTimeout(() => {
            localStorage.clear();
            window.location.href = 'index.html';
        }, 1500);
    }

    loadAllUsers();
    loadMembers();
    loadAdminMembers();
});