import http from 'node:http';
import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,sep,extname,relative} from 'node:path';
import {ConfigStore,ApiError} from './config-store.mjs';
import {Pairing,hash,privateAddress,lanAddresses} from './security.mjs';
import {CommandQueue} from './commands.mjs';
import {GAME_COMMANDS,gameUi} from './game-ui.mjs';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const ranges={powerW:[0,5000],speedKph:[0,400],cadenceRpm:[0,254],heartRateBpm:[1,254],distanceKm:[0,100000],elapsedSeconds:[0,1e8],ascentM:[0,1e7]};
export async function readTelemetry(stateDir,now=Date.now()){
 try{const file=resolve(stateDir,'telemetry.json');if((await lstat(file)).size>65536)throw Error();const t=JSON.parse(await readFile(file,'utf8'));const age=now-Date.parse(t.capturedAt);if(t.version!==1||t.source!=='gtbikev-shvdn'||!Number.isFinite(age)||age< -5000||age>5000)throw Error();const metrics={};for(const [key,[min,max]]of Object.entries(ranges)){const v=t.metrics?.[key];metrics[key]=typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null;}return {adapterConnected:true,adapterId:/^[a-f0-9-]{36}$/i.test(t.adapterId??'')?t.adapterId:null,modLoaded:t.modLoaded===true,trainerConnected:t.trainerConnected===true,capturedAt:t.capturedAt,metrics,gameUi:gameUi(t.gameUi),commands:Array.isArray(t.commands)?t.commands.filter(c=>GAME_COMMANDS.includes(c)):[],ergMode:['Off','Engaged','Disengaged','FreeRide','Unavailable'].includes(t.ergMode)?t.ergMode:null,targetPowerW:Number.isInteger(t.targetPowerW)&&t.targetPowerW>=0&&t.targetPowerW<=32767?t.targetPowerW:null,bindingStatus:typeof t.bindingStatus==='string'?t.bindingStatus.slice(0,150):'unknown'};}
 catch{return {adapterConnected:false,modLoaded:false,trainerConnected:false,capturedAt:null,metrics:Object.fromEntries(Object.keys(ranges).map(k=>[k,null])),commands:[],bindingStatus:'waiting-for-game-adapter'};}
}
export function createBridge({iniPath,fitDirectory,stateDirectory,staticDirectory=resolve(import.meta.dirname,'../dist'),pairing=new Pairing(),allowedAddresses=lanAddresses()}){
 const config=new ConfigStore(iniPath,stateDirectory);const queue=new CommandQueue(stateDirectory);const hosts=new Set(['127.0.0.1','localhost','[::1]',...allowedAddresses]);const clients=new Set();
 async function fits(){let found=[];const root=await realpath(fitDirectory).catch(()=>null);if(!root)return [];async function scan(dir,depth){for(const entry of await readdir(dir,{withFileTypes:true})){if(found.length>=500)return;if(entry.isSymbolicLink())continue;const path=resolve(dir,entry.name);if(entry.isDirectory()&&depth<2)await scan(path,depth+1);if(entry.isFile()&&/\.fit$/i.test(entry.name)){const canonical=await realpath(path);if(!canonical.startsWith(root+sep))continue;const stat=await lstat(path);if(stat.size<=20*1024*1024)found.push({id:hash(relative(root,path)),name:entry.name,size:stat.size,modifiedAt:stat.mtime.toISOString(),path});}}}await scan(root,0);return found.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));}
 async function jsonBody(req){if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new ApiError(415,'Se requiere JSON.');let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw new ApiError(413,'Solicitud demasiado grande.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'JSON no válido.');}}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  function send(status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
  try{
   if(!privateAddress(req.socket.remoteAddress))throw new ApiError(403,'Solo se permiten conexiones de la red privada.');
   const authority=req.headers.host;if(!authority)throw new ApiError(400,'Falta Host.');let hostUrl;try{hostUrl=new URL('http://'+authority);}catch{throw new ApiError(400,'Host no válido.');}if(!hosts.has(hostUrl.hostname)||hostUrl.username||hostUrl.password||hostUrl.port!==String(server.address().port))throw new ApiError(403,'Host no permitido. Usa la dirección que aparece en el PC.');
   const origin=`http://${authority}`;if(req.headers.origin&&req.headers.origin!==origin)throw new ApiError(403,'Origen no permitido. Abre Companion desde el puente local.');
   const url=new URL(req.url,origin);if(url.origin!==origin)throw new ApiError(400,'URL no válida.');
   if(url.pathname==='/api/health'&&req.method==='GET')return send(200,{service:'gtbikev-companion-bridge',version:1});
   if(req.method==='POST'&&url.pathname==='/api/pair'){if(req.headers.origin!==origin)throw new ApiError(403,'El emparejamiento debe hacerse desde la interfaz local.');const body=await jsonBody(req);const result=pairing.pair(req.socket.remoteAddress,body.pin);return send(result.status??200,result);}
   if(url.pathname.startsWith('/api/')){
    const token=req.headers.authorization?.replace(/^Bearer /,'');if(!pairing.valid(token))throw new ApiError(401,'Empareja este dispositivo con el código del PC.');
    if(req.method!=='GET'&&req.headers.origin!==origin)throw new ApiError(403,'Origen no permitido.');
    if(url.pathname==='/api/unpair'&&req.method==='POST'){pairing.revoke(token);return send(200,{ok:true});}
    if(url.pathname==='/api/state'&&req.method==='GET'){const telemetry=await readTelemetry(stateDirectory);let configAvailable=true;try{await config.read();}catch{configAvailable=false;}return send(200,{bridgeConnected:true,...telemetry,capabilities:{configuration:configAvailable,fit:true,commands:telemetry.commands}});}
    if(url.pathname==='/api/config'&&req.method==='GET'){const c=await config.read();return send(200,{text:c.text,revision:c.revision});}
    if(url.pathname==='/api/config'&&req.method==='PUT'){const body=await jsonBody(req);return send(200,await config.save(body.settings,body.revision));}
    if(url.pathname==='/api/activities'&&req.method==='GET')return send(200,{activities:(await fits()).map(({path,...item})=>item)});
    if(url.pathname.startsWith('/api/activities/')&&req.method==='GET'){const id=url.pathname.slice('/api/activities/'.length);const item=(await fits()).find(f=>f.id===id);if(!item)throw new ApiError(404,'No se encontró la actividad.');const stat=await lstat(item.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>20*1024*1024)throw new ApiError(413,'Actividad no compatible.');const root=await realpath(fitDirectory),canonical=await realpath(item.path);if(!canonical.startsWith(root+sep))throw new ApiError(403,'Ruta no permitida.');const file=await readFile(canonical);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(item.name)});res.end(file);return;}
    if(url.pathname==='/api/commands'&&req.method==='POST')return send(200,await queue.send(await jsonBody(req),await readTelemetry(stateDirectory)));
    throw new ApiError(404,'Ruta API no disponible.');
   }
   if(req.method!=='GET'&&req.method!=='HEAD')throw new ApiError(405,'Método no permitido.');
   let requested;try{requested=decodeURIComponent(url.pathname);}catch{throw new ApiError(400,'Ruta no válida.');}const file=resolve(staticDirectory,'.'+(requested==='/'?'/index.html':requested));if(!file.startsWith(resolve(staticDirectory)+sep))throw new ApiError(403,'Ruta no permitida.');const canonical=await realpath(file);if(!canonical.startsWith(await realpath(staticDirectory)+sep))throw new ApiError(403,'Ruta no permitida.');let bytes=await readFile(canonical);if(file===resolve(staticDirectory,'index.html'))bytes=Buffer.from(bytes.toString('utf8').replace('</head>','<meta name="gtbv-bridge" content="1"></head>'));res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(e){if(!res.headersSent)send(e.status??(e.code==='ENOENT'?404:500),{error:e.status?e.message:e.code==='ENOENT'?'Archivo no encontrado.':'No se pudo completar la operación. Revisa el puente en el PC.'});else res.end();}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;server.maxConnections=50;server.on('connection',socket=>{clients.add(socket);socket.on('close',()=>clients.delete(socket));});
 return {server,pairing,config,close:()=>new Promise(resolve=>{server.close(resolve);for(const client of clients)client.destroy();})};
}
