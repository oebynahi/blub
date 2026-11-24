// Run with Node 24+ from blub-web. No network calls or provider credentials.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { deliverNotifications } from "../worker/notifications.ts";

const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const file of readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort())
  sql.exec(readFileSync("drizzle/"+file,"utf8"));
const db = { prepare(query) {
  const stmt=sql.prepare(query);
  return {bind(...args){return {
    async all(){return {results:stmt.all(...args)};},
    async run(){return {meta:{changes:stmt.run(...args).changes}};}
  };}};
}};
let now=Date.now();
Date.now=()=>now;
const week=7*86400_000;
sql.exec("INSERT INTO users VALUES ('a','A','aaa','',0,NULL),('b','B','bbb','',0,NULL)");
sql.exec("INSERT INTO friendships VALUES ('pair','a','b','pending',0)");
sql.prepare("INSERT INTO activity(event_key,recipient,actor,friendship,kind,created) VALUES('req','b','a','pair','request',?)").run(now);
sql.exec("INSERT INTO notification_devices VALUES('test','b','sandbox',0); INSERT INTO push_deliveries VALUES(1,'test',0,0)");
sql.prepare("INSERT INTO digest_settings VALUES('b','test@example.invalid',?,?)").run(now,now+week);
const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
const key=Buffer.from(await crypto.subtle.exportKey("pkcs8",pair.privateKey)).toString("base64");
const env={DB:db,APNS_PRIVATE_KEY:key,APNS_TEAM_ID:"test",APNS_KEY_ID:"test",RESEND_API_KEY:"test",BLUB_EMAIL_FROM:"test@example.invalid"};
let pushes=0,emails=0;
globalThis.fetch=async (url,options)=>{
  if(url.startsWith("https://api.sandbox.push.apple.com/")){
    pushes++; const payload=JSON.parse(options.body);
    assert.equal(payload.blubActivity,1);assert.equal(payload.aps.alert.body,"You have a friend request.");
    return new Response(null,{status:pushes===1?503:200});
  }
  assert.equal(url,"https://api.resend.com/emails");
  assert.ok(options.headers["Idempotency-Key"]);emails++;return new Response(null,{status:200});
};
await deliverNotifications(env);await deliverNotifications(env);
assert.equal(pushes,1);assert.equal(emails,0);
now+=60001;await deliverNotifications(env);await deliverNotifications(env);
assert.equal(pushes,2);
now+=week;await deliverNotifications(env);await deliverNotifications(env);
assert.equal(emails,1);
now+=week;await deliverNotifications(env);assert.equal(emails,1);
console.log("PASS: APNs retry, generic payload, duplicate suppression and weekly email eligibility.");
