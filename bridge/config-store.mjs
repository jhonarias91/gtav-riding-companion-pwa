import {readFile,writeFile,mkdir,rename,unlink,open} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {patchIni,settingsToIni} from '../dist/config.js';
import {hash} from './security.mjs';
export class ApiError extends Error {constructor(status,message){super(message);this.status=status;}}
const deviceKeys=['FECDeviceId','PWRDeviceId','HRDeviceId','CADDeviceId','BFTMSDeviceAddr','BPWRDeviceAddr','BHRDeviceAddr','BCADDeviceAddr'];
export function validateSettings(s){
 if(!s||typeof s!=='object'||Array.isArray(s))throw new ApiError(400,'Configuración no válida.');
 const number=(name,min,max,integer=false)=>{if(typeof s[name]!=='number'||!Number.isFinite(s[name])||s[name]<min||s[name]>max||integer&&!Number.isInteger(s[name]))throw new ApiError(400,`Valor no válido: ${name}`);};
 number('weight',25,250);number('ftp',50,600,true);number('difficulty',0,100,true);number('traffic',0,100,true);
 if(typeof s.resistance!=='boolean'||!['Road','Gravel','Mountain','Tribike','Fixie','Commuter','BMX'].includes(s.bike)||!['NORMAL','AGRESSIVE','BREAKLAWS'].includes(s.behavior))throw new ApiError(400,'Bicicleta, tráfico o resistencia no válidos.');
 if(!Array.isArray(s.bots)||s.bots.length>5||s.bots.some(b=>!Number.isInteger(b)||b<0||b>4))throw new ApiError(400,'Bots no válidos.');
 if(!s.devices||typeof s.devices!=='object')throw new ApiError(400,'Faltan los sensores.');
 const devices={};for(const key of deviceKeys){const value=s.devices[key];if(typeof value!=='string'||(key.endsWith('Id')?!/^\d{1,5}$/.test(value)||Number(value)>65535:!(value==='0'||/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(value))))throw new ApiError(400,`Sensor no válido: ${key}`);devices[key]=value;}
 return {weight:s.weight,ftp:s.ftp,difficulty:s.difficulty,traffic:s.traffic,resistance:s.resistance,bike:s.bike,behavior:s.behavior,bots:[...s.bots],devices};
}
export function decodeIni(buffer){if(buffer[0]===255&&buffer[1]===254)return {text:buffer.subarray(2).toString('utf16le'),encoding:'utf16le',bom:true};if(buffer[0]===254&&buffer[1]===255)return {text:Buffer.from(buffer.subarray(2)).swap16().toString('utf16le'),encoding:'utf16be',bom:true};const bom=buffer.subarray(0,3).equals(Buffer.from([239,187,191]));const content=bom?buffer.subarray(3):buffer;const text=content.toString('utf8');if(!Buffer.from(text).equals(content))throw new ApiError(422,'Codificación INI no compatible. Usa UTF-8 o UTF-16.');return {text,encoding:'utf8',bom};}
function encodeIni(text,{encoding,bom}){if(encoding==='utf16le')return Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')]);if(encoding==='utf16be')return Buffer.concat([Buffer.from([254,255]),Buffer.from(text,'utf16le').swap16()]);return Buffer.concat([bom?Buffer.from([239,187,191]):Buffer.alloc(0),Buffer.from(text)]);}
export class ConfigStore {
 constructor(path,stateDir){this.path=resolve(path);this.backups=resolve(stateDir,'backups');}
 async read(){let bytes;try{bytes=await readFile(this.path);}catch(e){if(e.code==='ENOENT')throw new ApiError(404,'No se encontró GTBikeVConfig.ini. Inicia el puente con -IniPath apuntando al archivo real.');throw e;}if(bytes.length>1048576)throw new ApiError(413,'El INI supera 1 MB.');return {...decodeIni(bytes),revision:hash(bytes),bytes};}
 async save(settings,revision){const clean=validateSettings(settings);if(!/^[a-f0-9]{64}$/.test(revision??''))throw new ApiError(400,'Primero carga la configuración del PC.');const lockPath=this.path+'.companion.lock';let lock;try{lock=await open(lockPath,'wx');}catch(e){if(e.code==='EEXIST')throw new ApiError(409,'El INI está siendo actualizado. Vuelve a cargarlo.');throw e;}
 const temp=resolve(dirname(this.path),`.${basename(this.path)}.${randomUUID()}.tmp`);
 try{const current=await this.read();if(current.revision!==revision)throw new ApiError(409,'El INI cambió en el PC. Cárgalo de nuevo antes de guardar.');const nextText=patchIni(current.text,settingsToIni(clean));const next=encodeIni(nextText,current);await mkdir(this.backups,{recursive:true});const backupName=`GTBikeVConfig-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.ini`;await writeFile(resolve(this.backups,backupName),current.bytes,{flag:'wx'});await writeFile(temp,next,{flag:'wx'});if((await this.read()).revision!==revision)throw new ApiError(409,'El mod modificó el INI mientras se guardaba. Cárgalo otra vez.');await rename(temp,this.path);return {text:nextText,revision:hash(next),backupName,requiresRestart:true,appliedToRunningGame:false};}
 finally{await unlink(temp).catch(()=>{});await lock.close();await unlink(lockPath).catch(()=>{});}
 }
}
