import test from 'node:test';
import assert from 'node:assert/strict';
import { Encoder, Profile } from '@garmin/fitsdk';
import { parseActivity } from '../dist/fit-import.js';
import { readIni, patchIni, applyIni, settingsToIni } from '../dist/config.js';
import {writeFile,mkdir} from 'node:fs/promises';
import {plans,intervalTarget} from '../dist/training.js';

test('workouts match advertised duration and interval counts at the correct FTP',()=>{
 assert.deepEqual(plans.map(p=>p.reduce((sum,[duration])=>sum+duration,0)),[2700,3600,2100,0]);
 assert.equal(plans[0].filter(([duration,ratio])=>duration===480&&ratio===.88).length,3);
 assert.equal(plans[2].filter(([duration,ratio])=>duration===180&&ratio===1.15).length,5);
 assert.equal(intervalTarget(0,299,240),120);assert.equal(intervalTarget(0,300,240),211);assert.equal(intervalTarget(3,100,240),null);
});

test('INI export preserves unknown sections, comments, CRLF, and updates keys without duplication',()=>{
 const input='; archivo original\r\n[USER]\r\nUserWeightKg = 70 ; peso\r\nUserFTP=200\r\n[KEYS]\r\nMenuKey=F5\r\n';
 const output=patchIni(input,{USER:{UserWeightKg:77.5,UserFTP:250},MAIN:{BotDefinition:''}});
 assert.equal(readIni(output).USER.USERWEIGHTKG,'77.5');assert.match(output,/UserWeightKg = 77.5 ; peso/);assert.match(output,/\[KEYS\]\r\nMenuKey=F5/);assert.equal(output.match(/UserFTP/g).length,1);assert.equal(readIni(output).MAIN.BOTDEFINITION,'');assert.equal(output.replaceAll('\r\n','').includes('\n'),false);
});
test('INI supports disabled resistance and zero bots, and rejects malformed device identifiers',()=>{
 const defaults={weight:75,ftp:240,difficulty:100,bike:'Road',bots:[1,0,0],traffic:50,behavior:'NORMAL',devices:{FECDeviceId:'0',BFTMSDeviceAddr:'0'}};
 const s=applyIni('[MAIN]\nSelectedBike=Gravel\nBotDefinition=\nChangeCarsForBikes=75,BREAKLAWS\n[USER]\nUserFTP=280\n[DEVICES]\nTrainerDifficulty=255\nFECDeviceId=99999\nBFTMSDeviceAddr=AA:BB:CC:DD:EE:FF\n',defaults);
 assert.equal(s.ftp,280);assert.equal(s.bike,'Gravel');assert.deepEqual(s.bots,[]);assert.equal(s.traffic,75);assert.equal(s.behavior,'BREAKLAWS');assert.equal(s.devices.FECDeviceId,'0');assert.equal(settingsToIni(s).DEVICES.TrainerDifficulty,255);assert.equal(s.devices.BFTMSDeviceAddr,'AA:BB:CC:DD:EE:FF');
});
function fixture(){const encoder=new Encoder();const start=new Date('2026-11-04T12:00:00Z');encoder.onMesg(Profile.MesgNum.FILE_ID,{manufacturer:'development',product:1,timeCreated:start,type:'activity'});for(let i=0;i<=10;i++)encoder.onMesg(Profile.MesgNum.RECORD,{timestamp:new Date(+start+i*1000),power:180+i,cadence:88,heartRate:142,distance:i*10});encoder.onMesg(Profile.MesgNum.SESSION,{timestamp:new Date(+start+10000),startTime:start,sport:'cycling',totalTimerTime:10,totalElapsedTime:10,totalDistance:100,totalAscent:2,avgPower:185,maxPower:190});return encoder.close();}
test('real binary FIT decode returns correctly scaled distance, duration, watts and chart records',async()=>{
 const bytes=fixture();const a=parseActivity(bytes.buffer,'Prueba de importación.fit');assert.equal(a.distance,.1);assert.equal(a.seconds,10);assert.equal(a.power,185);assert.equal(a.maxPower,190);assert.equal(a.points.length,11);assert.equal(a.ascent,2);assert.equal(a.date,'2026-11-04T12:00:00.000Z');assert.equal(a.name,'Prueba de importación');await mkdir(new URL('./fixtures/',import.meta.url),{recursive:true});await writeFile(new URL('./fixtures/companion-test.fit',import.meta.url),bytes);
});
test('corrupted FIT is rejected before saving an activity',()=>{const bytes=fixture();bytes[bytes.length-1]^=255;assert.throws(()=>parseActivity(bytes.buffer),/integridad/);});
