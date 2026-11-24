const week = 7 * 86400_000;
const minute = 60_000;
const topic = "com.oebynahi.blub";
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
let bearer: {value:string; until:number; kid:string} | undefined;

async function appleBearer(env:Cloudflare.Env) {
  if(bearer && bearer.until>Date.now() && bearer.kid===env.APNS_KEY_ID)return bearer.value;
  const encode=(value:unknown)=>base64url(new TextEncoder().encode(JSON.stringify(value)));
  const jwt=encode({alg:"ES256",kid:env.APNS_KEY_ID})+"."+encode({iss:env.APNS_TEAM_ID,iat:Math.floor(Date.now()/1000)});
  const pem=env.APNS_PRIVATE_KEY!.replace(/-----[^-]+-----/g,"").replace(/\\n|\s/g,"");
  const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(jwt));
  const value=jwt+"."+base64url(new Uint8Array(signature));
  bearer={value,until:Date.now()+45*minute,kid:env.APNS_KEY_ID!};
  return value;
}

async function push(env:Cloudflare.Env) {
  const db=env.DB!, now=Date.now();
  const rows=await db.prepare(`SELECT j.event,j.token,j.attempts,d.environment,a.kind FROM push_deliveries j
    JOIN activity a ON a.id=j.event JOIN notification_devices d ON d.token=j.token AND d.owner=a.recipient
    WHERE j.due BETWEEN 0 AND ? AND a.seen=0 AND a.hidden=0 AND a.created>? ORDER BY j.due LIMIT 10`).bind(now,now-86400_000)
    .all<{event:number;token:string;attempts:number;environment:string;kind:string}>();
  if(!rows.results.length)return;
  const auth=await appleBearer(env);
  for(const row of rows.results){
    const lease=now+2*minute;
    const claim=await db.prepare(`UPDATE push_deliveries SET due=?,attempts=attempts+1 WHERE event=? AND token=? AND due BETWEEN 0 AND ?
      AND EXISTS(SELECT 1 FROM activity WHERE id=? AND seen=0 AND hidden=0)`).bind(lease,row.event,row.token,now,row.event).run();
    if(!claim.meta.changes)continue;
    const host=row.environment==="sandbox"?"api.sandbox.push.apple.com":"api.push.apple.com";
    const response=await fetch(`https://${host}/3/device/${row.token}`,{method:"POST",signal:AbortSignal.timeout(10000),
      headers:{authorization:"bearer "+auth,"apns-topic":topic,"apns-push-type":"alert","apns-priority":"10","apns-expiration":"0","apns-collapse-id":"blub-"+row.event},
      body:JSON.stringify({aps:{alert:{title:"Blub",body:row.kind==="request"?"You have a friend request.":"Someone commented on your photo."},sound:"default"},blubActivity:row.event})});
    if(response.status===410){
      await db.prepare("DELETE FROM notification_devices WHERE token=? AND since<=?").bind(row.token,now).run();
    } else {
      const retry=response.status===429||response.status>=500||response.status===403;
      const due=retry?now+Math.min(60,2**Math.min(row.attempts,6))*minute:-1;
      await db.prepare("UPDATE push_deliveries SET due=? WHERE event=? AND token=? AND due=?").bind(due,row.event,row.token,lease).run();
    }
  }
}

async function digest(env:Cloudflare.Env) {
  const db=env.DB!,now=Date.now();
  const rows=await db.prepare(`SELECT owner,email,since,due FROM digest_settings s WHERE due<=? AND EXISTS(
    SELECT 1 FROM activity WHERE recipient=s.owner AND created>=s.since AND seen=0 AND hidden=0) ORDER BY due LIMIT 5`).bind(now)
    .all<{owner:string;email:string;since:number;due:number}>();
  for(const row of rows.results){
    const lease=now+10*minute;
    const claimed=await db.prepare("UPDATE digest_settings SET due=? WHERE owner=? AND email=? AND since=? AND due=?")
      .bind(lease,row.owner,row.email,row.since,row.due).run();
    if(!claimed.meta.changes)continue;
    const fingerprint=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(row.owner+":"+row.since));
    const response=await fetch("https://api.resend.com/emails",{method:"POST",signal:AbortSignal.timeout(10000),
      headers:{Authorization:"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"blub-"+base64url(new Uint8Array(fingerprint))},
      body:JSON.stringify({from:env.BLUB_EMAIL_FROM,to:[row.email],subject:"Unread activity on Blub",
        text:"You have unread activity on Blub. Open your inbox: https://blub-friends.halecashew.chatgpt.site/feed?activity=1\n\nYou opted into occasional updates. Turn off weekly emails in Activity at the same link."})});
    if(response.ok)await db.prepare("UPDATE digest_settings SET since=?,due=? WHERE owner=? AND due=? AND since=?")
      .bind(now,now+week,row.owner,lease,row.since).run();
  }
}

export async function deliverNotifications(env:Cloudflare.Env) {
  if(!env.DB)return;
  const jobs=[];
  if(env.APNS_PRIVATE_KEY && env.APNS_TEAM_ID && env.APNS_KEY_ID)jobs.push(push(env));
  if(env.RESEND_API_KEY && env.BLUB_EMAIL_FROM)jobs.push(digest(env));
  for(const result of await Promise.allSettled(jobs)){
    if(result.status==="rejected")console.error("Blub notification delivery deferred");
  }
}
