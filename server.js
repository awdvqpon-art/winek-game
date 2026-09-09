const express=require("express");
const http=require("http");
const path=require("path");
const {Server}=require("socket.io");
const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*"}});
const PORT=process.env.PORT||3000;
app.use(express.static(path.join(__dirname,"../client")));
const rooms=new Map();
const W=1280,H=720,SPEED=18;
function makeCode(){return Math.random().toString(36).slice(2,7).toUpperCase()}
function makePlayer(name,role){
 return {name:(name||"لاعب").slice(0,12),x:W/2+(Math.random()*120-60),y:H/2+(Math.random()*100-50),
 color:role==="seeker"?"#00bfa5":"#ff7043",hidden:false,caught:false,role};
}
function payload(r){
 const players={};for(const [id,p] of r.players)players[id]=p;
 return {time:r.time,players};
}
function broadcast(r){io.to(r.code).emit("state",payload(r))}
function startTimer(r){
 if(r.timer)return;
 r.timer=setInterval(()=>{
  if(r.players.size<2)return;
  r.time--;
  if(r.time<=0){
   r.time=0;broadcast(r);
   io.to(r.code).emit("gameOver",{winner:"hiders",text:"انتهى الوقت! المختبئون يفوزون."});
   clearInterval(r.timer);r.timer=null;r.finished=true;
  }else broadcast(r);
 },1000);
}
function endIfAllCaught(r){
 const h=[...r.players.values()].filter(p=>p.role==="hider");
 if(h.length>0&&h.every(p=>p.caught)){
  io.to(r.code).emit("gameOver",{winner:"seekers",text:"الباحث أمسك كل المختبئين!"});
  clearInterval(r.timer);r.timer=null;r.finished=true;return true;
 }
 return false;
}
io.on("connection",socket=>{
 socket.on("createRoom",({name})=>{
  let code=makeCode();while(rooms.has(code))code=makeCode();
  const r={code,time:180,players:new Map(),timer:null,finished:false};
  r.players.set(socket.id,makePlayer(name,"seeker"));rooms.set(code,r);
  socket.join(code);socket.room=code;socket.emit("created",{code});socket.emit("joined",{id:socket.id,code});
  broadcast(r);startTimer(r);
 });
 socket.on("joinRoom",({name,code})=>{
  const r=rooms.get(String(code||"").toUpperCase());
  if(!r)return socket.emit("errorMsg","الغرفة غير موجودة");
  if(r.finished)return socket.emit("errorMsg","هذه الجولة انتهت");
  if(r.players.size>=8)return socket.emit("errorMsg","الغرفة ممتلئة (8 لاعبين)");
  const role=[...r.players.values()].some(p=>p.role==="seeker")?"hider":"seeker";
  r.players.set(socket.id,makePlayer(name,role));socket.join(r.code);socket.room=r.code;
  socket.emit("joined",{id:socket.id,code:r.code});io.to(r.code).emit("notice",(name||"لاعب")+" دخل الغرفة");broadcast(r);startTimer(r);
 });
 socket.on("move",({dx,dy})=>{
  const r=rooms.get(socket.room),p=r?.players.get(socket.id);if(!p||p.caught||r.finished)return;
  const x=Number(dx)||0,y=Number(dy)||0;
  p.x=Math.max(25,Math.min(W-25,p.x+x*SPEED));p.y=Math.max(90,Math.min(H-30,p.y+y*SPEED));
  broadcast(r);
 });
 socket.on("hide",h=>{
  const r=rooms.get(socket.room),p=r?.players.get(socket.id);if(!p||p.role!=="hider"||p.caught||r.finished)return;
  p.hidden=!!h;broadcast(r);
 });
 socket.on("capture",()=>{
  const r=rooms.get(socket.room),seeker=r?.players.get(socket.id);if(!r||!seeker||seeker.role!=="seeker"||r.finished)return;
  let target=null,best=Infinity;
  for(const [id,p] of r.players){if(p.role!=="hider"||p.caught||p.hidden)continue;const d=Math.hypot(seeker.x-p.x,seeker.y-p.y);if(d<best){best=d;target=id}}
  if(target&&best<=100){r.players.get(target).caught=true;io.to(target).emit("caught",{id:target});broadcast(r);endIfAllCaught(r)}
  else socket.emit("notice","اقترب أكثر من اللاعب المختبئ");
 });
 socket.on("disconnect",()=>{
  const r=rooms.get(socket.room);if(!r)return;r.players.delete(socket.id);
  if(r.players.size===0){clearInterval(r.timer);rooms.delete(r.code)}else broadcast(r);
 });
});
app.get("/health",(req,res)=>res.json({ok:true,game:"Winek V3"}));
server.listen(PORT,()=>console.log("Winek V3 server listening on "+PORT));