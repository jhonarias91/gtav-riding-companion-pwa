import { Decoder, Stream } from './fit-sdk.js';
export function parseActivity(buffer,name='Actividad FIT') {
  const decoder=new Decoder(Stream.fromArrayBuffer(buffer));
  if(!decoder.isFIT()||!decoder.checkIntegrity())throw Error('El archivo FIT está incompleto o su integridad no es válida.');
  const {messages,errors}=decoder.read();
  if(errors.length)throw Error('No se pudo decodificar el archivo FIT.');
  const records=messages.recordMesgs??[],sessions=messages.sessionMesgs??[];
  if(!records.length&&!sessions.length)throw Error('El FIT no contiene datos de actividad.');
  if(sessions.length>1)throw Error('Este FIT contiene varias sesiones. Importa cada actividad por separado.');
  const s=sessions[0]??{};
  const power=records.filter(r=>Number.isFinite(r.power)).map(r=>r.power);
  const start=s.startTime??records.find(r=>r.timestamp)?.timestamp??new Date();
  const firstTime=new Date(start).getTime();
  const end=records.filter(r=>r.timestamp).at(-1)?.timestamp;
  const points=records.filter(r=>r.timestamp&&Number.isFinite(r.power)).map(r=>({t:Math.max(0,(new Date(r.timestamp).getTime()-firstTime)/1000),p:r.power}));
  const lastDistance=records.filter(r=>Number.isFinite(r.distance)).at(-1)?.distance??0;
  const a={name:name.replace(/\.fit$/i,''),date:new Date(start).toISOString(),seconds:Math.round(s.totalTimerTime??(end?(new Date(end).getTime()-firstTime)/1000:0)),distance:(s.totalDistance??lastDistance)/1000,ascent:s.totalAscent??0,power:s.avgPower??(power.length?Math.round(power.reduce((a,b)=>a+b,0)/power.length):null),maxPower:s.maxPower??(power.length?power.reduce((a,b)=>Math.max(a,b),0):0),points:points.filter((_,i)=>i%Math.max(1,Math.ceil(points.length/600))===0),imported:true,demo:false};
  if(!Number.isFinite(a.distance)||!Number.isFinite(a.seconds)||a.seconds<0||a.distance<0)throw Error('La actividad contiene métricas no válidas.');
  return a;
}
