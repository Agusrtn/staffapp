const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.static("public"));
app.use(express.json());

const DATA_FILE = "data.json";

// crear archivos si no existen
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    users: [],
    tasks: [],
    messages: [],
    accessRequests: []
  }, null, 2));
}

// cargar datos
function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

// guardar datos
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let { users, tasks, messages, accessRequests } = loadData();
let connectedUsers = new Map();
let io = null;

// ADMIN
const ADMIN_USER = {
  user: "Agustinson",
  password: "Maragus2417",
  roles: ["Director", "Administrador"], // Cambiar a array
  approved: true,
  profilePic: "https://i.pravatar.cc/150?u=Agustinson"
};

// agregar admin si no existe
if (!users.find(u => u.user === ADMIN_USER.user)) {
  users.push(ADMIN_USER);
  saveData({ users, tasks, messages, accessRequests });
}

const ROLES = ["Director", "Co Director", "Supervisor Staff", "Senior Staff", "Staff", "Administrador"];


// ================= LOGIN =================
app.post("/login",(req,res)=>{

  const {user,password} = req.body;

  const found = users.find(u => u.user === user && u.password === password);

  if(found && found.approved){
    res.json({
      success:true,
      roles:found.roles || ["Staff"], // Cambiar a roles array
      profilePic:found.profilePic
    });
  }
  else if(found && !found.approved){
    res.json({
      success:false,
      message:"Cuenta pendiente de aprobación"
    });
  }
  else{
    res.json({
      success:false,
      message:"Usuario o contraseña incorrectos"
    });
  }

});


// ================= REGISTER =================
app.post("/register",(req,res)=>{

  const {user,password} = req.body;

  if(users.find(u=>u.user===user)){
    return res.json({success:false,message:"Usuario ya existe"});
  }

  const request={
    id:Date.now(),
    type:"register",
    user,
    password,
    roles:["Staff"], // Asignar rol por defecto
    status:"pending",
    timestamp:new Date(),
    profilePic:`https://i.pravatar.cc/150?u=${user}`
  };

  accessRequests.push(request);
  saveData({users,tasks,messages,accessRequests});

  if(io) io.emit("new_access_request",request);

  res.json({success:true,message:"Solicitud enviada al administrador"});
});


// ================= USERS =================
app.get("/users",(req,res)=>{
  res.json(users.map(u=>({
    user:u.user,
    roles:u.roles || ["Staff"], // Cambiar a roles
    profilePic:u.profilePic,
    approved:u.approved
  })));
});


// ================= REQUESTS =================
app.get("/admin/requests",(req,res)=>{
  res.json(accessRequests);
});


app.post("/admin/request/:id/approve",(req,res)=>{

  const id=parseInt(req.params.id);
  const request=accessRequests.find(r=>r.id===id);

  if(!request) return res.json({success:false});

  users.push({
    user:request.user,
    password:request.password,
    roles:request.roles || ["Staff"], // Usar roles del request
    approved:true,
    profilePic:request.profilePic
  });

  request.status="approved";

  saveData({users,tasks,messages,accessRequests});

  if(io) io.emit("request_approved",{user:request.user});

  res.json({success:true});
});


app.post("/admin/request/:id/deny",(req,res)=>{

  const id=parseInt(req.params.id);
  const request=accessRequests.find(r=>r.id===id);

  if(!request) return res.json({success:false});

  request.status="denied";

  saveData({users,tasks,messages,accessRequests});

  if(io) io.emit("request_denied",{user:request.user});

  res.json({success:true});
});


// ================= CHANGE USER ROLES =================
app.post("/admin/user/:user/role",(req,res)=>{
  const {user} = req.params;
  const {role, action} = req.body; // action: 'add', 'remove', 'set'

  const foundUser = users.find(u => u.user === user);
  if(!foundUser) return res.json({success:false, message:"Usuario no encontrado"});

  if(!foundUser.roles) foundUser.roles = ["Staff"];

  if(action === 'add' && !foundUser.roles.includes(role)){
    foundUser.roles.push(role);
  }
  else if(action === 'remove'){
    foundUser.roles = foundUser.roles.filter(r => r !== role);
  }
  else if(action === 'set'){
    foundUser.roles = [role];
  }

  // Asegurar que tenga al menos un rol
  if(foundUser.roles.length === 0) foundUser.roles = ["Staff"];

  saveData({users,tasks,messages,accessRequests});

  if(io) io.emit("user_role_updated", {user, roles: foundUser.roles});

  res.json({success:true, roles: foundUser.roles});
});

// ================= UPDATE PROFILE PICTURE =================
app.post("/user/:user/profile-pic",(req,res)=>{
  const {user} = req.params;
  const {profilePic} = req.body;

  const foundUser = users.find(u => u.user === user);
  if(!foundUser) return res.json({success:false, message:"Usuario no encontrado"});

  foundUser.profilePic = profilePic;
  saveData({users,tasks,messages,accessRequests});

  if(io) io.emit("user_profile_updated", { user, profilePic });

  res.json({success:true, profilePic});
});

// ================= DISABLE / ENABLE USER ACCESS =================
app.post("/admin/user/:user/access",(req,res)=>{
  const {user} = req.params;
  const {action} = req.body; // 'disable' | 'enable'

  console.log(`[ADMIN] access change request: user=${user} action=${action}`);

  const foundUser = users.find(u => u.user === user);
  if(!foundUser) {
    console.warn(`[ADMIN] user not found: ${user}`);
    return res.status(404).json({success:false, message:"Usuario no encontrado"});
  }

  if(action === 'disable') {
    foundUser.approved = false;

    // Si el usuario está conectado, desconectarlo forzadamente
    if(io) {
      for (const [socketId, username] of connectedUsers.entries()) {
        if (username === user) {
          io.to(socketId).emit('force_logout');
          io.sockets.sockets.get(socketId)?.disconnect(true);
        }
      }
    }
  } else if(action === 'enable') {
    foundUser.approved = true;
  } else {
    console.warn(`[ADMIN] invalid action: ${action}`);
    return res.status(400).json({success:false, message:"Acción inválida"});
  }

  saveData({users,tasks,messages,accessRequests});

  if(io) io.emit("user_access_changed", { user, approved: foundUser.approved });

  res.json({success:true, approved: foundUser.approved});
});

// ================= RESET PASSWORD =================
app.post("/admin/user/:user/reset-password", (req, res) => {
  const {user} = req.params;

  const foundUser = users.find(u => u.user === user);
  if(!foundUser) return res.json({success:false, message:"Usuario no encontrado"});

  // Reiniciar contraseña a un valor seguro por defecto (puede cambiarse)
  const defaultPassword = "1234";
  foundUser.password = defaultPassword;

  saveData({users,tasks,messages,accessRequests});

  res.json({success:true, password: defaultPassword});
});

// ================= FORCE LOGOUT =================
app.post("/admin/user/:user/force-logout", (req, res) => {
  const {user} = req.params;

  const foundUser = users.find(u => u.user === user);
  if(!foundUser) return res.json({success:false, message:"Usuario no encontrado"});

  if(io) {
    for (const [socketId, username] of connectedUsers.entries()) {
      if (username === user) {
        io.to(socketId).emit('force_logout');
        io.sockets.sockets.get(socketId)?.disconnect(true);
      }
    }
  }

  res.json({success:true});
});

// ================= CLEAR USERS (KEEP AGUSTINSON) =================
app.post("/admin/users/clear", (req, res) => {
  const originalCount = users.length;
  users = users.filter(u => u.user === ADMIN_USER.user);

  if (!users.find(u => u.user === ADMIN_USER.user)) {
    users.push(ADMIN_USER);
  }

  saveData({users,tasks,messages,accessRequests});

  if(io) {
    // Force logout everyone else
    for (const [socketId, username] of connectedUsers.entries()) {
      if (username !== ADMIN_USER.user) {
        io.to(socketId).emit('force_logout');
        io.sockets.sockets.get(socketId)?.disconnect(true);
      }
    }
    io.emit("update_members", [{ user: ADMIN_USER.user, roles: ADMIN_USER.roles, profilePic: ADMIN_USER.profilePic }]);
  }

  res.json({success:true, removed: originalCount - users.length});
});


// ================= TASKS =================
app.get("/tasks",(req,res)=>{
  res.json(tasks);
});

app.post("/tasks",(req,res)=>{

  tasks.push(req.body);

  saveData({users,tasks,messages,accessRequests});

  res.json(tasks);

});


// ================= SERVER =================

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

io = new Server(server,{
  cors:{
    origin:"*",
    methods:["GET","POST"]
  }
});


// ================= SOCKET =================

io.on("connection",(socket)=>{

  console.log("Usuario conectado:",socket.id);

  socket.on("user_joined",(data)=>{

    connectedUsers.set(socket.id,data.user);

    const onlineUsers = users
      .filter(u => Array.from(connectedUsers.values()).includes(u.user))
      .map(u => ({
        user:u.user,
        roles:u.roles || ["Staff"], // Cambiar a roles
        profilePic:u.profilePic
      }));

    io.emit("update_members",onlineUsers);

  });


  socket.on("chat_message",(msg)=>{

    messages.push(msg);

    saveData({users,tasks,messages,accessRequests});

    io.emit("chat_message",msg);

  });


  socket.on("disconnect",()=>{

    const user=connectedUsers.get(socket.id);

    connectedUsers.delete(socket.id);

    if(user){
      io.emit("user_left",{user});
    }

  });

});


server.listen(PORT,()=>{
  console.log("Servidor iniciado en puerto "+PORT);
});