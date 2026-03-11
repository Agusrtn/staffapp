const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const fs = require("fs")
const path = require("path")

const app = express()

app.use(express.static("public"))
app.use(express.json())

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads')
}

let users = []
let tasks = []
let messages = []
let connectedUsers = new Map()
let accessRequests = []
let io = null

// Initialize admin user
const ADMIN_USER = {
  user: "Agustinson",
  password: "Maragus2417",
  role: "Director",
  approved: true,
  profilePic: "https://i.pravatar.cc/150?u=Agustinson"
}

// Roles disponibles
const ROLES = ["Director", "Co Director", "Supervisor Staff", "Senior Staff", "Staff"]

// Inicializar admin
users.push(ADMIN_USER)

// =============== AUTHENTICATION ===============
app.post("/register", (req,res)=>{
  const {user,password} = req.body
  
  if (users.find(u => u.user === user)) {
    return res.json({ success: false, message: "Usuario ya existe" })
  }
  
  // Agregar solicitud de acceso
  const request = {
    id: Date.now(),
    type: 'register',
    user,
    password,
    status: 'pending',
    timestamp: new Date(),
    profilePic: `https://i.pravatar.cc/150?u=${user}`
  }
  
  accessRequests.push(request)
  
  // Notificar al admin
  if (io) io.emit('new_access_request', request)
  
  res.json({ success: true, message: "Solicitud enviada al administrador" })
})

app.post("/login",(req,res)=>{
  const {user,password} = req.body
  const found = users.find(u => u.user === user && u.password === password)
  
  if (found && found.approved) {
    res.json({success:true, role: found.role, profilePic: found.profilePic})
  } else if (found && !found.approved) {
    res.json({success:false, message: "Tu cuenta aún no ha sido aprobada"})
  } else {
    res.json({success:false, message: "Usuario o contraseña incorrectos"})
  }
})

// =============== ACCESS REQUESTS (ADMIN) ===============
app.get("/admin/requests", (req, res) => {
  res.json(accessRequests)
})

app.post("/admin/request/:id/approve", (req, res) => {
  const requestId = parseInt(req.params.id)
  const request = accessRequests.find(r => r.id === requestId)
  
  if (!request) {
    return res.json({ success: false })
  }
  
  if (request.type === 'register') {
    users.push({
      user: request.user,
      password: request.password,
      role: "Staff",
      approved: true,
      profilePic: request.profilePic
    })
  }
  
  request.status = 'approved'
  if (io) io.emit('request_approved', { user: request.user })
  res.json({ success: true })
})

app.post("/admin/request/:id/deny", (req, res) => {
  const requestId = parseInt(req.params.id)
  const request = accessRequests.find(r => r.id === requestId)
  
  if (!request) {
    return res.json({ success: false })
  }
  
  request.status = 'denied'
  if (io) io.emit('request_denied', { user: request.user })
  res.json({ success: true })
})

// =============== ROLES (ADMIN) ===============
app.post("/admin/user/:user/role", (req, res) => {
  const { role } = req.body
  const foundUser = users.find(u => u.user === req.params.user)
  
  if (!foundUser || !ROLES.includes(role)) {
    return res.json({ success: false })
  }
  
  foundUser.role = role
  if (io) io.emit('user_role_updated', { user: foundUser.user, role })
  res.json({ success: true })
})

app.get("/users", (req, res) => {
  res.json(users.map(u => ({ user: u.user, role: u.role, profilePic: u.profilePic, approved: u.approved })))
})

// =============== TASKS ===============
app.get("/tasks",(req,res)=>{
  res.json(tasks)
})

app.post("/tasks",(req,res)=>{
  tasks.push(req.body)
  res.json(tasks)
})

// =============== FILES ===============
app.post("/upload", (req, res) => {
  if (!req.files) {
    return res.status(400).json({ error: "No file uploaded" })
  }
  res.json({ success: true })
})


const START_PORT = parseInt(process.env.PORT, 10) || 3000;

function startServer(port) {
  const server = http.createServer(app);
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // =============== SOCKET.IO ===============
  io.on("connection", (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);
    
    // User joined
    socket.on("user_joined", (data) => {
      connectedUsers.set(socket.id, data.user);
      const usersList = users.filter(u => connectedUsers.values().toArray().includes(u.user)).map(u => ({ user: u.user, role: u.role, profilePic: u.profilePic }));
      io.emit("update_members", usersList);
      io.emit("user_joined", data);
    });
    
    // Chat message
    socket.on("chat_message", (messageObj) => {
      messages.push(messageObj);
      io.emit("chat_message", messageObj);
    });
    
    // User disconnected
    socket.on("disconnect", () => {
      const user = connectedUsers.get(socket.id);
      connectedUsers.delete(socket.id);
      console.log(`Usuario desconectado: ${user}`);
      io.emit("update_members", Array.from(connectedUsers.values()));
      if (user) {
        io.emit("user_left", { user });
      }
    });
  });

  server.listen(port, () => {
    console.log(`Servidor iniciado en http://localhost:${port}`);
  }).on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Puerto ${port} ocupado, intentando ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error("Error del servidor:", err);
      process.exit(1);
    }
  });
}

startServer(START_PORT);