// Base URL for backend API (adjust for local development)
const API_BASE = window.API_BASE || (window.location.hostname === 'localhost' ? '' : 'https://staffapp-p0jo.onrender.com');

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
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
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
    messageDiv.innerHTML = `
        <img src="https://i.pravatar.cc/36?u=${messageObj.user}" alt="Avatar" class="message-avatar">
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
        
        card.innerHTML = `
            <img src="${user.profilePic}" alt="Avatar" class="member-avatar">
            <p class="member-name">${user.user}</p>
            <span class="role-tag ${roleClass}" title="${allRolesText}">${primaryRole}</span>
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
            const dayTasks = tasks.filter(t => {
                if (t.completed || !t.date) return false;
                const taskDate = new Date(t.date);
                return taskDate.getDate() === i && taskDate.getMonth() === month && taskDate.getFullYear() === year;
            });
            if (dayTasks.length > 0) {
                const titles = dayTasks.map(t => t.title).join(', ');
                showNotification(`${dayTasks.length} tarea${dayTasks.length > 1 ? 's' : ''}: ${titles}`, 'success');
            } else {
                showNotification(`Día ${i} seleccionado`, 'success');
            }
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
    const input = document.getElementById('profileColorInput').value.trim();
    
    if (!input) {
        showNotification('Ingresa un valor para la foto', 'error');
        return;
    }
    
    const newPic = `https://i.pravatar.cc/150?u=${input}`;
    currentProfilePic = newPic;
    
    localStorage.setItem('currentProfilePic', newPic);
    document.getElementById('profilePic').src = newPic;
    document.getElementById('modalProfilePic').src = newPic;
    
    showNotification('Foto actualizada', 'success');
    closeProfileModal();
}

// ==================== ADMIN FUNCTIONS ====================
function loadAllUsers() {
    fetch(`${API_BASE}/users`)
        .then(res => res.json())
        .then(users => {
            allUsers = users;
            if (isAdmin()) {
                loadMembers();
            }
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

function changeUserRole(user, role, action) {
    fetch(`${API_BASE}/admin/user/${user}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, action })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`Rol ${action === 'add' ? 'agregado' : 'removido'}: ${role} para ${user}`, 'success');
            loadUsersRoles();
            loadAllUsers();
        }
    });
}

// ==================== SOCKET EVENTS ====================
socket.on('update_members', (membersList) => {
    members = membersList;
    loadMembers();
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
        loadAllUsers();
    }
});