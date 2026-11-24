const week = 7*86400_000;
export function eventWrites(db:D1Database, key:string, insert:D1PreparedStatement, push:boolean) {
  const statements=[insert];
  if(push) statements.push(db.prepare(`INSERT OR IGNORE INTO push_deliveries(event,token,due)
    SELECT a.id,d.token,a.created FROM activity a JOIN notification_devices d ON d.owner=a.recipient
    WHERE a.event_key=? AND d.since<=a.created AND a.seen=0 AND a.hidden=0`).bind(key));
  return statements;
}
export async function inbox(db:D1Database,owner:string,before:number) {
  const page=await db.prepare(`WITH grouped AS (
    SELECT max(id) id,count(*) total,min(seen) seen FROM activity WHERE recipient=? AND hidden=0
    GROUP BY CASE WHEN kind='like' THEN post ELSE id END HAVING max(id)<? ORDER BY id DESC LIMIT 41)
    SELECT g.id,g.total,g.seen,a.kind,a.post,u.handle FROM grouped g JOIN activity a ON a.id=g.id
    JOIN users u ON u.id=a.actor ORDER BY g.id DESC`).bind(owner,before).all();
  const email=await db.prepare("SELECT 1 FROM digest_settings WHERE owner=?").bind(owner).first();
  return {items:page.results.slice(0,40),more:page.results.length>40,email:!!email};
}
export async function setDigest(db:D1Database,id:string,email:string,enabled:boolean){
  if(enabled) {
    if(!email.includes("@"))return false;
    const now=Date.now();
    await db.prepare("INSERT INTO digest_settings(owner,email,since,due) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET email=excluded.email").bind(id,email,now,now+week).run();
  } else await db.prepare("DELETE FROM digest_settings WHERE owner=?").bind(id).run();
  return true;
}
