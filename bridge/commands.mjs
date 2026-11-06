import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ApiError} from './config-store.mjs';
import {gameUi} from './game-ui.mjs';
export function validateCommand(body){
 const key=v=>typeof v==='string'&&v.length>0&&v.length<=120;
 if(body?.action==='open-menu'&&['main','routes','user','devices','workouts','about','sensors','multiplayer'].includes(body.menu))return {action:body.action,menu:body.menu};
 if(body?.action==='close-menu')return {action:body.action};
 if(body?.action==='browse-course'&&key(body.expectedKey)){
  if(body.direction===-1||body.direction===1)return {action:body.action,direction:body.direction,expectedKey:body.expectedKey};
  if(Number.isInteger(body.index)&&body.index>=0&&body.index<=10000&&key(body.key))return {action:body.action,index:body.index,key:body.key,expectedKey:body.expectedKey};
 }
 if(body?.action==='course-options'&&key(body.expectedKey)&&(['loop','reverse'].some(k=>typeof body[k]==='boolean'))){const result={action:body.action,expectedKey:body.expectedKey};for(const k of ['loop','reverse'])if(typeof body[k]==='boolean')result[k]=body[k];return result;}
 if(body?.action==='select-course'&&key(body.expectedKey))return {action:body.action,expectedKey:body.expectedKey};
 if(body?.action==='game-toggle'&&['autopilot','obstacles','road-feel'].includes(body.name)&&typeof body.enabled==='boolean')return {action:body.action,name:body.name,enabled:body.enabled};
 if(body?.action==='game-option'&&['bike','character','difficulty','gearing'].includes(body.name)&&Number.isInteger(body.index)&&body.index>=0&&body.index<64&&typeof body.label==='string'&&body.label.length<=80)return {action:body.action,name:body.name,index:body.index,label:body.label};
 if(body?.action==='game-profile'&&typeof body.weight==='number'&&Number.isFinite(body.weight)&&body.weight>=40&&body.weight<=150&&typeof body.ftp==='number'&&Number.isFinite(body.ftp)&&body.ftp>=50&&body.ftp<=500)return {action:body.action,weight:body.weight,ftp:body.ftp};
 if(body?.action==='erg'&&typeof body.enabled==='boolean'&&Number.isInteger(body.targetPower)&&body.targetPower>=50&&body.targetPower<=600)return {action:'erg',enabled:body.enabled,targetPower:body.targetPower};
 if(body?.action==='target-power'&&Number.isInteger(body.watts)&&body.watts>=50&&body.watts<=600)return {action:'target-power',watts:body.watts};
 if(body?.action==='activate'&&typeof body.enabled==='boolean')return {action:'activate',enabled:body.enabled};
 if(body?.action==='save-activity')return {action:'save-activity'};
 throw new ApiError(400,'Orden o parámetros no válidos. Actualiza la pantalla y revisa los valores.');
}
export class CommandQueue {
 constructor(stateDirectory){this.directory=resolve(stateDirectory,'commands');this.busy=false;}
 async send(body,telemetry){const payload=validateCommand(body);if(!telemetry.adapterConnected||!telemetry.adapterId)throw new ApiError(409,'El adaptador del juego no está conectado.');if(!telemetry.commands.includes(payload.action))throw new ApiError(501,'Esta orden no está disponible en el adaptador.');if(this.busy)throw new ApiError(409,'Espera la respuesta de la orden anterior.');this.busy=true;const id=randomUUID(),path=resolve(this.directory,id+'.json'),ack=resolve(this.directory,id+'.ack.json'),temp=resolve(this.directory,id+'.tmp');
 try{await mkdir(this.directory,{recursive:true});await writeFile(temp,JSON.stringify({id,adapterId:telemetry.adapterId,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3000).toISOString(),...payload}),{flag:'wx'});await rename(temp,path);const deadline=Date.now()+3500;while(Date.now()<deadline){try{const stat=JSON.parse(await readFile(ack,'utf8'));if(stat.id!==id||stat.adapterId!==telemetry.adapterId)throw new ApiError(502,'La respuesta del adaptador no coincide.');if(!stat.ok)throw new ApiError(409,String(stat.error??'El mod rechazó la orden.').slice(0,250));return {ok:true,message:'Orden confirmada por el mod.',result:stat.result?.gameUi?{...stat.result,gameUi:gameUi(stat.result.gameUi)}:stat.result};}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,75));}throw new ApiError(504,'No llegó confirmación del juego. Revisa su estado antes de repetir la orden.');}
 finally{this.busy=false;for(const file of [path,ack,temp])await unlink(file).catch(()=>{});}
 }
}
