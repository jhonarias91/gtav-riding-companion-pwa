// Only documented settings are written. Unrelated lines and sections are preserved.
export function readIni(text) {
  const sections = Object.create(null); let section = '';
  for (const line of text.split(/\r?\n/)) {
    const s = line.match(/^\s*\[([^\]]+)\]/);
    if(s){section=s[1].toUpperCase(); sections[section]??=Object.create(null); continue;}
    const kv = line.match(/^\s*([^;#=]+?)\s*=\s*(.*?)\s*$/);
    if(kv){sections[section]??=Object.create(null); sections[section][kv[1].toUpperCase()] = kv[2].replace(/\s+[;#].*$/, '').trim();}
  }
  return sections;
}
export function patchIni(text, updates) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text ? text.split(/\r?\n/) : [];
  for (const [section, entries] of Object.entries(updates)) {
    let start=lines.findIndex(l=>l.match(/^\s*\[([^\]]+)\]/)?.[1].toUpperCase()===section.toUpperCase());
    if(start<0){if(lines.length&&lines.at(-1)!=='')lines.push('');start=lines.length;lines.push(`[${section}]`);}
    let end=start+1; while(end<lines.length&&!/^\s*\[/.test(lines[end]))end++;
    for(const [key,value] of Object.entries(entries)) {
      let found=false;
      for(let i=start+1;i<end;i++) {
        const m=lines[i].match(/^(\s*)([^;#=]+?)(\s*=\s*)(.*)$/);
        if(m&&m[2].trim().toUpperCase()===key.toUpperCase()){
          const comment=m[4].match(/(\s+[;#].*)$/)?.[1]??'';
          lines[i]=`${m[1]}${m[2]}${m[3]}${value}${comment}`;found=true;
        }
      }
      if(!found){lines.splice(end,0,`${key}=${value}`);end++;}
    }
  }
  return lines.join(eol).replace(/(?:\r?\n)*$/,'')+eol;
}
export function settingsToIni(s) {
  return {MAIN:{SelectedBike:s.bike,BotDefinition:s.bots.join(','),ChangeCarsForBikes:`${s.traffic},${s.behavior}`},USER:{UserWeightKg:s.weight,UserFTP:s.ftp},DEVICES:{TrainerDifficulty:s.resistance===false?255:s.difficulty,...s.devices}};
}
export function applyIni(text, old) {
  const ini=readIni(text);const s=structuredClone(old);
  const number=(v,min,max,fallback)=>{const n=Number(v);return v!==undefined&&v!==''&&Number.isFinite(n)&&n>=min&&n<=max?n:fallback;};
  s.weight=number(ini.USER?.USERWEIGHTKG,25,250,s.weight);s.ftp=number(ini.USER?.USERFTP,50,600,s.ftp);
  s.difficulty=number(ini.DEVICES?.TRAINERDIFFICULTY,0,100,s.difficulty);
  if(ini.DEVICES?.TRAINERDIFFICULTY!==undefined)s.resistance=Number(ini.DEVICES.TRAINERDIFFICULTY)!==255;
  const bike=ini.MAIN?.SELECTEDBIKE; if(['Mountain','Tribike','Gravel','Road','Fixie','Commuter','BMX'].includes(bike))s.bike=bike;
  if(ini.MAIN?.BOTDEFINITION!==undefined){const bots=ini.MAIN.BOTDEFINITION.split(',').map(x=>x.trim()).filter(Boolean);if(bots.length<=5&&bots.every(x=>/^[0-4]$/.test(x)))s.bots=bots.map(Number);}
  const traffic=ini.MAIN?.CHANGECARSFORBIKES?.split(',');
  if(traffic){s.traffic=number(traffic[0],0,100,s.traffic);if(['NORMAL','AGRESSIVE','BREAKLAWS'].includes(traffic[1]?.trim().toUpperCase()))s.behavior=traffic[1].trim().toUpperCase();}
  for(const key of Object.keys(s.devices)){const v=ini.DEVICES?.[key.toUpperCase()];if(v!==undefined&&(/^(\d{1,5})$/.test(v)&&Number(v)<=65535||/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(v)))s.devices[key]=v;}
  return s;
}
