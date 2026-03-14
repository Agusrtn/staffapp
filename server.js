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
  role: "Director",
  approved: true,
  profilePic: "https://i.pravatar.cc/150?u=Agustinson"
};

// agregar admin si no existe
if (!users.find(u => u.user === ADMIN_USER.user)) {
  users.push(ADMIN_USER);
  saveData({ users, tasks, messages, accessRequests });
}

const ROLES = ["Director", "Co Director", "Supervisor Staff", "Senior Staff", "Staff"];


// ================= LOGIN =================
app.post("/login",(req,res)=>{

  const {user,password} = req.body;

  const found = users.find(u => u.user === user && u.password === password);

  if(found && found.approved){
    res.json({
      success:true,
      role:found.role,
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
    role:u.role,
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
    role:"Staff",
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
        role:u.role,
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