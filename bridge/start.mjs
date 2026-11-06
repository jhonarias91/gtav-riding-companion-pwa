import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createBridge} from './server.mjs';
import {lanAddresses} from './security.mjs';
const options={};for(let i=2;i<process.argv.length;i+=2){if(!['--ini','--fit-directory','--state-directory','--host','--port'].includes(process.argv[i])||!process.argv[i+1])throw Error('Argumentos no válidos. Ver bridge/README.md');options[process.argv[i]]=process.argv[i+1];}
let documents=join(homedir(),'Documents');if(process.platform==='win32')try{documents=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetFolderPath('MyDocuments')"],{encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,'').trim()||documents;}catch{}
const gameData=join(documents,'Rockstar Games','GTA V');const stateDirectory=resolve(options['--state-directory']??join(process.env.LOCALAPPDATA??homedir(),'GTBikeVCompanion'));
const port=Number(options['--port']??8787);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('El puerto debe estar entre 1024 y 65535.');const host=options['--host']??'0.0.0.0';if(host!=='0.0.0.0'&&host!=='127.0.0.1'&&!lanAddresses().includes(host))throw Error('Selecciona 0.0.0.0, 127.0.0.1 o una IPv4 privada del PC.');
await mkdir(stateDirectory,{recursive:true});const bridge=createBridge({iniPath:options['--ini']??join(gameData,'ModSettings','GTBikeVConfig.ini'),fitDirectory:options['--fit-directory']??gameData,stateDirectory});
bridge.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`El puerto ${port} está ocupado. Usa -Port con otro puerto.`:e.message);process.exitCode=1;});
bridge.server.listen(port,host,()=>{console.log('\nGTBikeV Companion · Puente Wi-Fi\n');console.log('En este PC: http://127.0.0.1:'+port);for(const address of host==='127.0.0.1'?[]:host==='0.0.0.0'?lanAddresses():[host])console.log('En el celular: http://'+address+':'+port);console.log('\nCódigo para emparejar: '+bridge.pairing.pin);console.log('\nINI: '+bridge.config.path);console.log('Datos del adaptador: '+stateDirectory);console.log('\nMantén esta ventana abierta. Ctrl+C para detener.');});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await bridge.close();process.exit(0);});
