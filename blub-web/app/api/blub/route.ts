import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { eventWrites, inbox, setDigest } from "../../../lib/activity";
export const dynamic="force-dynamic";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const db=()=>env.DB!;
const prompts = [
 {id:"risk",prompt:"What's the biggest risk you've taken?"},
 {id:"proud",prompt:"What's something you're really proud of?"},
 {id:"self",prompt:"Tell us about yourself in one photo."},
];
function imageType(b:Uint8Array){
 let mime="";
 if(b[0]===255&&b[1]===216&&b[2]===255)mime="image/jpeg";
 if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)mime="image/png";
 if(String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP")mime="image/webp";
 return mime;
}
async function profile(){const u=await getChatGPTUser();return {u,me:u?await db().prepare("SELECT * FROM users WHERE id=?").bind(u.userId).first():null};}
const visible=`(p.author=? OR p.author IN (SELECT CASE WHEN sender=? THEN recipient ELSE sender END FROM friendships WHERE (sender=? OR recipient=?) AND status='accepted'))`;
export async function GET(req:Request){try{
 const {u,me}=await profile();if(!u)return json({authenticated:false});
 const url=new URL(req.url);const action=url.searchParams.get("action");
 if(action==="avatar"){
   if(!me)return json({error:"Create your profile first"},403);
   const version=url.searchParams.get("v");
   if(!version||!/^[-a-f0-9]{36}$/.test(version))return json({error:"Picture not found"},404);
   const row=await db().prepare("SELECT avatar FROM users WHERE id=? AND avatar=?").bind(url.searchParams.get("id"),version).first();
   if(!row)return json({error:"Picture not found"},404);
   const image=await env.BUCKET!.get("avatars/"+version);
   if(!image)return json({error:"Picture not found"},404);
   return new Response(image.body,{headers:{"Content-Type":image.httpMetadata?.contentType||"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }
 if(action==="photo"){
 const post=await db().prepare(`SELECT p.photo FROM posts p WHERE p.id=? AND ${visible}`).bind(url.searchParams.get("id"),u.userId,u.userId,u.userId,u.userId).first<{photo:string}>();
 if(!post)return json({error:"Photo not found"},404);const image=await env.BUCKET!.get(post.photo);if(!image)return json({error:"Photo not found"},404);
 return new Response(image.body,{headers:{"Content-Type":image.httpMetadata?.contentType||"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }
 if(!me)return json({authenticated:true,me:null});
 if(action==="highlights"){
   const owner=url.searchParams.get("id");
   const rows=await db().prepare(`SELECT p.id,p.slot FROM highlights p WHERE p.author=? AND ${visible}`)
     .bind(owner,u.userId,u.userId,u.userId,u.userId).all<{id:string;slot:string}>();
   const slots=prompts.map(prompt=>({...prompt,photo:rows.results.find(r=>r.slot===prompt.id)?.id??null}));
   return json(owner===u.userId?slots:slots.filter(s=>s.photo));
 }
 if(action==="highlightPhoto"){
   const row=await db().prepare(`SELECT p.id FROM highlights p WHERE p.id=? AND ${visible}`)
     .bind(url.searchParams.get("id"),u.userId,u.userId,u.userId,u.userId).first<{id:string}>();
   const object=row && await env.BUCKET!.get("highlights/"+row.id);
   if(!object)return json({error:"Photo not found"},404);
   return new Response(object.body,{headers:{"Content-Type":object.httpMetadata?.contentType||"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }
 if(action==="activityItem"){
   const item=await db().prepare(`SELECT a.id,a.kind,a.post,u.handle,1 total,a.seen FROM activity a JOIN users u ON u.id=a.actor
     WHERE a.id=? AND a.recipient=? AND a.hidden=0`).bind(url.searchParams.get("id"),u.userId).first();
   return item?json(item):json({error:"Activity no longer available"},404);
 }
 if(action==="badge")return json({unread:!!await db().prepare("SELECT 1 FROM activity WHERE recipient=? AND hidden=0 AND seen=0 LIMIT 1").bind(u.userId).first()});
 if(action==="activity"){
   const before=Number(url.searchParams.get("before")??Number.MAX_SAFE_INTEGER);
   if(!Number.isSafeInteger(before)||before<1)return json({error:"Invalid cursor"},400);
   return json(await inbox(db(),u.userId,before));
 }
 if(action==="comments"){
   const id=url.searchParams.get("id"), before=Number(url.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER);
   if(!Number.isSafeInteger(before)||before<1)return json({error:"Invalid comment cursor"},400);
   const access=[id,u.userId,u.userId,u.userId,u.userId];
   const [post,page]=await db().batch([
     db().prepare(`SELECT p.id FROM posts p WHERE p.id=? AND ${visible}`).bind(...access),
     db().prepare(`SELECT c.id,c.body,u.handle,c.author FROM posts p JOIN comments c ON c.post=p.id
       JOIN users u ON u.id=c.author WHERE p.id=? AND ${visible} AND c.id<? ORDER BY c.id DESC LIMIT 31`).bind(...access,before)
   ]);
   if(!post.results.length)return json({error:"Post not found"},404);
   return json({comments:page.results.slice(0,30).reverse(),more:page.results.length>30});
 }
 if(action==="member"){
   const member=await db().prepare(`SELECT id,name,handle,bio,avatar,
     (id=? OR EXISTS(SELECT 1 FROM friendships WHERE status='accepted'
       AND ((sender=? AND recipient=users.id) OR (recipient=? AND sender=users.id)))) AS can_view
     FROM users WHERE handle=?`).bind(u.userId,u.userId,u.userId,url.searchParams.get("handle")).first();
   return member?json(member):json({error:"Profile not found"},404);
 }
 if(action==="search"){const q=(url.searchParams.get("q")||"").replace(/^@/,"").toLowerCase();if(q.length<2)return json({users:[]});const rows=await db().prepare("SELECT id,name,handle,bio,avatar FROM users WHERE id!=? AND substr(handle,1,length(?))=? LIMIT 20").bind(u.userId,q,q).all();return json({users:rows.results});}
 // Read only the two newest comments for each visible feed post using the post/id index.
 const profilePhotos=action==="mine" || action==="memberPhotos";
 const previewField=profilePhotos?"":`(SELECT json_group_array(json_object('id',id,'handle',handle,'body',body))
   FROM (SELECT c.id, u.handle, substr(c.body,1,180) AS body FROM comments c JOIN users u ON u.id=c.author
         WHERE c.post=p.id ORDER BY c.id DESC LIMIT 2)) AS previews_json,`;
 const postFields=`SELECT ${previewField} p.id,p.caption,p.created_at,u.name,u.handle,u.avatar,p.author,
   (SELECT count(*) FROM likes WHERE post=p.id) AS like_count,
   EXISTS(SELECT 1 FROM likes WHERE post=p.id AND author=?) AS liked,
   (SELECT count(*) FROM comments WHERE post=p.id) AS comment_count FROM posts p JOIN users u ON u.id=p.author`;
 if(action==="post"){
   const post=await db().prepare(`${postFields} WHERE p.id=? AND ${visible}`).bind(u.userId,url.searchParams.get("id"),u.userId,u.userId,u.userId,u.userId).first();
   if(!post)return json({error:"Post no longer available"},404);
   const {previews_json,...fields}=post;
   return json({...fields,preview_comments:JSON.parse(String(previews_json)).reverse()});
 }
 if(profilePhotos){
   const cursor=Number(url.searchParams.get("time")??Number.MAX_SAFE_INTEGER);
   if(!Number.isSafeInteger(cursor))return json({error:"Invalid cursor"},400);
   const page=await db().prepare(`${postFields} WHERE p.author=? AND ${visible} AND (p.created_at,p.id)<(?,?) ORDER BY p.created_at DESC,p.id DESC LIMIT 31`)
     .bind(u.userId,action==="mine"?u.userId:url.searchParams.get("id"),u.userId,u.userId,u.userId,u.userId,cursor,url.searchParams.get("before")??"").all();
   return json({posts:page.results.slice(0,30),more:page.results.length>30});
 }
 const feed=await db().prepare(`${postFields} WHERE ${visible} ORDER BY p.created_at DESC,p.id DESC LIMIT 100`).bind(u.userId,u.userId,u.userId,u.userId,u.userId).all();
 const friends=await db().prepare("SELECT f.*,u.name,u.handle,u.bio,u.avatar FROM friendships f JOIN users u ON u.id=CASE WHEN f.sender=? THEN f.recipient ELSE f.sender END WHERE f.sender=? OR f.recipient=? ORDER BY f.created_at DESC").bind(u.userId,u.userId,u.userId).all();
 const posts=feed.results.map(({previews_json,...post})=>({...post,preview_comments:JSON.parse(String(previews_json)).reverse()}));
 const unread=!!await db().prepare("SELECT 1 FROM activity WHERE recipient=? AND hidden=0 AND seen=0 LIMIT 1").bind(u.userId).first();
 return json({authenticated:true,me,posts,friends:friends.results,unread});
 }catch(e){console.error(e);return json({error:"Couldn't load Blub. Please try again."},500)}}
export async function POST(req:Request){try{
 const origin=req.headers.get("origin");if(origin&&origin!==new URL(req.url).origin)return json({error:"Request not allowed"},403);
 const {u,me}=await profile();if(!u)return json({error:"Sign in to continue"},401);
 const type=req.headers.get("content-type")||"";
 let form:FormData|undefined;
 if(type.includes("multipart/form-data")){
 if(Number(req.headers.get("content-length"))>9*1024*1024)return json({error:"Choose a photo smaller than 8 MB"},400);
 form=await req.formData();
 }
 if(form && form.get("action")!=="profile"){
 if(!me)return json({error:"Create your profile first"},400);
 const photo=form.get("photo");const caption=String(form.get("caption")||"").trim();
 if(!(photo instanceof File)||!photo.size||photo.size>8*1024*1024||caption.length>1500)return json({error:"Add a photo up to 8 MB and a caption up to 1,500 characters"},400);
 const b=new Uint8Array(await photo.arrayBuffer());const mime=imageType(b);
 if(!mime)return json({error:"Choose a JPEG, PNG, or WebP photo"},400);
 if(form.get("action")==="highlight"){
   const slot=String(form.get("slot"));
   if(!prompts.some(p=>p.id===slot))return json({error:"Unknown prompt"},400);
   const id=crypto.randomUUID(),key="highlights/"+id;
   await env.BUCKET!.put(key,b,{httpMetadata:{contentType:mime}});
   let previous;
   try{
     [previous]=await db().batch<{id:string}>([
       db().prepare("SELECT id FROM highlights WHERE author=? AND slot=?").bind(u.userId,slot),
       db().prepare("INSERT INTO highlights(id,author,slot) VALUES(?,?,?) ON CONFLICT(author,slot) DO UPDATE SET id=excluded.id").bind(id,u.userId,slot)
     ]);
   }catch(e){await env.BUCKET!.delete(key);throw e;}
   if(previous.results.length)await env.BUCKET!.delete("highlights/"+previous.results[0].id);
   return json({ok:true});
 }
 const id=crypto.randomUUID(),key=`photos/${u.userId}/${id}`;
 await env.BUCKET!.put(key,b,{httpMetadata:{contentType:mime}});
 try{await db().prepare("INSERT INTO posts (id,author,caption,photo,created_at) VALUES (?,?,?,?,?)").bind(id,u.userId,caption,key,Date.now()).run();}catch(e){await env.BUCKET!.delete(key);throw e;}
 return json({ok:true});
 }
 const data=(form ? Object.fromEntries(form) : await req.json()) as Record<string,string>;
 if(data.action==="profile"){
 const name=String(data.name||"").trim(),handle=String(data.handle||"").trim().toLowerCase(),bio=String(data.bio||"").trim();
 if(!name||name.length>50||!/^([a-z0-9_]{3,24})$/.test(handle)||bio.length>200)return json({error:"Use a name up to 50 characters and a handle with 3–24 letters, numbers, or underscores"},400);
 const exists=await db().prepare("SELECT id FROM users WHERE handle=? AND id!=?").bind(handle,u.userId).first();if(exists)return json({error:"That handle is taken. Try another."},409);
 const avatar=form?.get("avatar");
 if(avatar instanceof File && avatar.size){
   if(avatar.size>1024*1024)return json({error:"Choose a profile picture under 1 MB"},400);
   const bytes=new Uint8Array(await avatar.arrayBuffer());
   const mime=imageType(bytes);
   if(!mime)return json({error:"Choose a JPEG, PNG, or WebP profile picture"},400);
   const version=crypto.randomUUID(), key="avatars/"+version;
   await env.BUCKET!.put(key,bytes,{httpMetadata:{contentType:mime}});
   let saved;
   try{
     saved=await db().prepare(`INSERT INTO users(id,name,handle,bio,created_at,avatar) VALUES(?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name,handle=excluded.handle,bio=excluded.bio,avatar=excluded.avatar
       WHERE users.avatar IS ?`).bind(u.userId,name,handle,bio,Date.now(),version,me?.avatar??null).run();
   }catch(e){await env.BUCKET!.delete(key);throw e;}
   if(!saved.meta.changes){await env.BUCKET!.delete(key);return json({error:"Profile changed. Please try again."},409);}
   if(me?.avatar)await env.BUCKET!.delete("avatars/"+me.avatar);
   return json({ok:true});
 }
 await db().prepare("INSERT INTO users (id,name,handle,bio,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,handle=excluded.handle,bio=excluded.bio").bind(u.userId,name,handle,bio,Date.now()).run();return json({ok:true});
 }
 if(!me)return json({error:"Create your profile first"},400);
 if(data.action==="removeHighlight"){
   const row=await db().prepare("DELETE FROM highlights WHERE author=? AND id=? RETURNING id").bind(u.userId,data.id).first<{id:string}>();
   if(!row)return json({error:"Answer not found"},404);
   await env.BUCKET!.delete("highlights/"+row.id);
   return json({ok:true});
 }
 if(data.action==="deleteComment"){
   const result=await db().prepare("DELETE FROM comments WHERE id=? AND post=? AND author=?").bind(data.commentId,data.id,u.userId).run();
   return result.meta.changes?json({ok:true}):json({error:"Comment not found"},404);
 }
 if(data.action==="readActivity"){
   const ids=String(data.ids??"").split(",").map(Number);
   if(ids.length>40||ids.some(id=>!Number.isSafeInteger(id)||id<1))return json({error:"Invalid activity"},400);
   await db().prepare(`WITH opened AS MATERIALIZED (
     SELECT id,kind,post FROM activity WHERE recipient=? AND id IN (SELECT value FROM json_each(?))
   ) UPDATE activity SET seen=1 WHERE recipient=? AND seen=0 AND
     (id IN (SELECT id FROM opened) OR (kind='like' AND EXISTS(
       SELECT 1 FROM opened o WHERE o.kind='like' AND o.post=activity.post AND o.id>=activity.id)))`)
     .bind(u.userId,JSON.stringify(ids),u.userId).run();
   return json({ok:true});
 }
 if(data.action==="digest"){
   if(!["on","off"].includes(data.value))return json({error:"Invalid preference"},400);
   return await setDigest(db(),u.userId,u.email,data.value==="on")?json({ok:true}):json({error:"Your account needs a verified email"},400);
 }
 if(data.action==="device"||data.action==="detach"){
   if(!/^[a-f0-9]{32,512}$/.test(data.token??""))return json({error:"Invalid device token"},400);
   if(data.action==="detach")await db().prepare("DELETE FROM notification_devices WHERE token=? AND owner=?").bind(data.token,u.userId).run();
   else {
     if(!["sandbox","production"].includes(data.environment))return json({error:"Invalid push environment"},400);
     await db().batch([db().prepare("DELETE FROM notification_devices WHERE token=? AND (owner<>? OR environment<>?)").bind(data.token,u.userId,data.environment),
       db().prepare("INSERT OR IGNORE INTO notification_devices(token,owner,environment,since) VALUES(?,?,?,?)").bind(data.token,u.userId,data.environment,Date.now())]);
   }
   return json({ok:true});
 }
 if(["like","unlike","comment"].includes(data.action)){
   if(typeof data.id!=="string")return json({error:"Post not found"},404);
   const access=[data.id,u.userId,u.userId,u.userId,u.userId];
   const allowed=`FROM posts p WHERE p.id=? AND ${visible}`;
   let write;
   if(data.action==="comment"){
     const body=typeof data.body==="string"?data.body.trim():"";
     if(!body||body.length>1000)return json({error:"Write a comment of up to 1,000 characters"},400);
     if(typeof data.requestId!=="string"||!/^[-a-zA-Z0-9]{1,64}$/.test(data.requestId))return json({error:"Invalid comment request"},400);
     write=db().prepare(`INSERT INTO comments(post,author,body,request_id) SELECT p.id,?,?,? ${allowed}
       ON CONFLICT(post,author,request_id) DO NOTHING`).bind(u.userId,body,data.requestId,...access);
   }else if(data.action==="like"){
     write=db().prepare(`INSERT INTO likes(post,author) SELECT p.id,? ${allowed}
       ON CONFLICT(post,author) DO NOTHING`).bind(u.userId,...access);
   }else{
     write=db().prepare(`DELETE FROM likes WHERE author=? AND post IN (SELECT p.id ${allowed})`).bind(u.userId,...access);
   }
   const kind=data.action==="comment"?"comment":"like";
   const key=JSON.stringify([kind,data.id,u.userId,kind==="comment"?data.requestId:""]);
   const activity=data.action==="unlike"?[db().prepare("UPDATE activity SET hidden=1,seen=1 WHERE event_key=? AND actor=?").bind(key,u.userId)]:
     eventWrites(db(),key,db().prepare(`INSERT INTO activity(event_key,recipient,actor,friendship,kind,post,comment,created)
       SELECT ?,p.author,?,f.id,?,p.id,c.id,? FROM posts p JOIN friendships f
       ON ((f.sender=p.author AND f.recipient=?) OR (f.recipient=p.author AND f.sender=?)) AND f.status='accepted'
       LEFT JOIN comments c ON c.post=p.id AND c.author=? AND c.request_id=?
       WHERE p.id=? AND p.author<>? AND (?='like' OR c.id IS NOT NULL)
       ON CONFLICT(event_key) DO UPDATE SET hidden=0`).bind(key,u.userId,kind,Date.now(),u.userId,u.userId,u.userId,kind==="comment"?data.requestId:null,data.id,u.userId,kind),kind==="comment");
   const [post]=await db().batch([db().prepare(`SELECT p.id ${allowed}`).bind(...access),write,...activity]);
   return post.results.length?json({ok:true}):json({error:"Post not found"},404);
 }
 if(data.action==="request"){
 if(data.user===u.userId)return json({error:"That's you!"},400);
 if(!await db().prepare("SELECT id FROM users WHERE id=?").bind(data.user).first())return json({error:"Person not found"},404);
 const pair=[u.userId,data.user].sort().join(":");
 const key="request:"+pair;
 await db().batch([db().prepare("INSERT OR IGNORE INTO friendships (id,sender,recipient,status,created_at) VALUES (?,?,?,'pending',?)").bind(pair,u.userId,data.user,Date.now()),
   ...eventWrites(db(),key,db().prepare(`INSERT OR IGNORE INTO activity(event_key,recipient,actor,friendship,kind,created)
   SELECT ?,recipient,sender,id,'request',created_at FROM friendships WHERE id=? AND sender=? AND status='pending'`).bind(key,pair,u.userId),true)]);
 return json({ok:true});
 }
 if(data.action==="accept")await db().batch([
   db().prepare(`INSERT OR IGNORE INTO activity(event_key,recipient,actor,friendship,kind,created)
     SELECT ?,sender,recipient,id,'accepted',? FROM friendships WHERE id=? AND recipient=? AND status='pending'`).bind("accepted:"+data.id,Date.now(),data.id,u.userId),
   db().prepare("DELETE FROM activity WHERE friendship=? AND kind='request' AND recipient=?").bind(data.id,u.userId),
   db().prepare("UPDATE friendships SET status='accepted' WHERE id=? AND recipient=? AND status='pending'").bind(data.id,u.userId)]);
 else if(data.action==="remove")await db().prepare("DELETE FROM friendships WHERE id=? AND (sender=? OR recipient=?)").bind(data.id,u.userId,u.userId).run();
 else if(data.action==="delete"){
 const post=await db().prepare("SELECT photo FROM posts WHERE id=? AND author=?").bind(data.id,u.userId).first<{photo:string}>();if(!post)return json({error:"Post not found"},404);
 await db().prepare("DELETE FROM posts WHERE id=? AND author=?").bind(data.id,u.userId).run();await env.BUCKET!.delete(post.photo);
 }else return json({error:"Unknown action"},400);
 return json({ok:true});
 }catch(e){console.error(e);return json({error:"Couldn't save that. Please try again."},500)}}
