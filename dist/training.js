// Durations in seconds; ratios are fractions of the user's FTP.
export const plans = [
  [[300,.5],[480,.88],[240,.55],[480,.88],[240,.55],[480,.88],[480,.5]],
  [[300,.5],[3000,.65],[300,.5]],
  [[480,.5],[180,1.15],[120,.5],[180,1.15],[120,.5],[180,1.15],[120,.5],[180,1.15],[120,.5],[180,1.15],[240,.5]],
  []
];
export function currentBlock(workout,seconds){let end=0;return plans[workout].findIndex(([duration])=>(end+=duration)>seconds);}
export function intervalTarget(workout,seconds,ftp){const index=currentBlock(workout,seconds);return index<0?null:Math.round(plans[workout][index][1]*ftp);}
