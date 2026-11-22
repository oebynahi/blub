import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
export const dynamic="force-dynamic";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const db=()=>env.DB!;
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
 if(action==="comments"){
   const id=url.searchParams.get("id"), before=Number(url.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER);
   if(!Number.isSafeInteger(before)||before<1)return json({error:"Invalid comment cursor"},400);
   const access=[id,u.userId,u.userId,u.userId,u.userId];
   const [post,page]=await db().batch([
     db().prepare(`SELECT p.id FROM posts p WHERE p.id=? AND ${visible}`).bind(...access),
     db().prepare(`SELECT c.id,c.body,u.handle FROM posts p JOIN comments c ON c.post=p.id
       JOIN users u ON u.id=c.author WHERE p.id=? AND ${visible} AND c.id<? ORDER BY c.id DESC LIMIT 31`).bind(...access,before)
   ]);
   if(!post.results.length)return json({error:"Post not found"},404);
   return json({comments:page.results.slice(0,30).reverse(),more:page.results.length>30});
 }
 if(action==="search"){const q=(url.searchParams.get("q")||"").replace(/^@/,"").toLowerCase();if(q.length<2)return json({users:[]});const rows=await db().prepare("SELECT id,name,handle,bio,avatar FROM users WHERE id!=? AND substr(handle,1,length(?))=? LIMIT 20").bind(u.userId,q,q).all();return json({users:rows.results});}
 // Read only the two newest comments for each visible feed post using the post/id index.
 const previewField=action==="mine"?"":`(SELECT json_group_array(json_object('id',id,'handle',handle,'body',body))
   FROM (SELECT c.id, u.handle, substr(c.body,1,180) AS body FROM comments c JOIN users u ON u.id=c.author
         WHERE c.post=p.id ORDER BY c.id DESC LIMIT 2)) AS previews_json,`;
 const postFields=`SELECT ${previewField} p.id,p.caption,p.created_at,u.name,u.handle,u.avatar,p.author,
   (SELECT count(*) FROM likes WHERE post=p.id) AS like_count,
   EXISTS(SELECT 1 FROM likes WHERE post=p.id AND author=?) AS liked,
   (SELECT count(*) FROM comments WHERE post=p.id) AS comment_count FROM posts p JOIN users u ON u.id=p.author`;
 if(action==="mine"){
   const cursor=Number(url.searchParams.get("time")??Number.MAX_SAFE_INTEGER);
   if(!Number.isSafeInteger(cursor))return json({error:"Invalid cursor"},400);
   const page=await db().prepare(`${postFields} WHERE p.author=? AND (p.created_at,p.id)<(?,?) ORDER BY p.created_at DESC,p.id DESC LIMIT 31`)
     .bind(u.userId,u.userId,cursor,url.searchParams.get("before")??"").all();
   return json({posts:page.results.slice(0,30),more:page.results.length>30});
 }
 const feed=await db().prepare(`${postFields} WHERE ${visible} ORDER BY p.created_at DESC,p.id DESC LIMIT 100`).bind(u.userId,u.userId,u.userId,u.userId,u.userId).all();
 const friends=await db().prepare("SELECT f.*,u.name,u.handle,u.bio,u.avatar FROM friendships f JOIN users u ON u.id=CASE WHEN f.sender=? THEN f.recipient ELSE f.sender END WHERE f.sender=? OR f.recipient=? ORDER BY f.created_at DESC").bind(u.userId,u.userId,u.userId).all();
 const posts=feed.results.map(({previews_json,...post})=>({...post,preview_comments:JSON.parse(String(previews_json)).reverse()}));
 return json({authenticated:true,me,posts,friends:friends.results});
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
   const [post]=await db().batch([db().prepare(`SELECT p.id ${allowed}`).bind(...access),write]);
   return post.results.length?json({ok:true}):json({error:"Post not found"},404);
 }
 if(data.action==="request"){
 if(data.user===u.userId)return json({error:"That's you!"},400);
 if(!await db().prepare("SELECT id FROM users WHERE id=?").bind(data.user).first())return json({error:"Person not found"},404);
 const pair=[u.userId,data.user].sort().join(":");
 await db().prepare("INSERT OR IGNORE INTO friendships (id,sender,recipient,status,created_at) VALUES (?,?,?,'pending',?)").bind(pair,u.userId,data.user,Date.now()).run();return json({ok:true});
 }
 if(data.action==="accept")await db().prepare("UPDATE friendships SET status='accepted' WHERE id=? AND recipient=? AND status='pending'").bind(data.id,u.userId).run();
 else if(data.action==="remove")await db().prepare("DELETE FROM friendships WHERE id=? AND (sender=? OR recipient=?)").bind(data.id,u.userId,u.userId).run();
 else if(data.action==="delete"){
 const post=await db().prepare("SELECT photo FROM posts WHERE id=? AND author=?").bind(data.id,u.userId).first<{photo:string}>();if(!post)return json({error:"Post not found"},404);
 await db().prepare("DELETE FROM posts WHERE id=? AND author=?").bind(data.id,u.userId).run();await env.BUCKET!.delete(post.photo);
 }else return json({error:"Unknown action"},400);
 return json({ok:true});
 }catch(e){console.error(e);return json({error:"Couldn't save that. Please try again."},500)}}
