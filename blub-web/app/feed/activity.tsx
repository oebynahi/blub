"use client";
import { useEffect,useState } from "react";
import { Handle } from "./member-profile";
import { PostInteractions, type Post } from "./post-interactions";

type Item={id:number;kind:string;post:string|null;handle:string;total:number;seen:number};
type Page={items:Item[];more:boolean;email:boolean};

export function Activity({me,act,busy,friends,read}:{me:string;busy:boolean;
  act:(body:Record<string,string>)=>Promise<boolean>;friends:()=>void;read:()=>void}) {
  const [items,setItems]=useState<Item[]>([]),[more,setMore]=useState(false),[email,setEmail]=useState(false);
  const [detail,setDetail]=useState<Post|null>(null),[thread,setThread]=useState(false);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  async function page(before?:number,signal?:AbortSignal){
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/blub?action=activity"+(before?"&before="+before:""),{signal});
      const data=await r.json() as Page;
      if(!r.ok||!data.items)throw Error("Couldn’t load activity.");
      setItems(rows=>before?[...rows,...data.items]:data.items);setMore(data.more);setEmail(data.email);
      const ids=data.items.filter(item=>!item.seen).map(item=>item.id);
      if(ids.length){
        const marked=await fetch("/api/blub",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"readActivity",ids:ids.join(",")}),signal});
        if(!marked.ok)throw Error("Couldn’t mark activity as read.");
      }
      read();
    }catch(e){if(!signal?.aborted)setError((e as Error).message);}
    finally{if(!signal?.aborted)setLoading(false);}
  }
  useEffect(()=>{const controller=new AbortController();void page(undefined,controller.signal);return ()=>controller.abort();},[]);
  async function show(id:string){
    setError("");
    const r=await fetch("/api/blub?action=post&id="+encodeURIComponent(id));
    const post=await r.json() as Post;
    if(!r.ok||!post.id){setDetail(null);throw Error("This post is no longer available.");}
    setDetail(post);
  }
  if(detail)return <><button className="text-button" onClick={()=>{setDetail(null);void page();}}>Back to activity</button>
    <PostInteractions key={detail.id} me={me} initialThread={thread} post={detail} busy={busy} act={async body=>{
      const ok=await act(body);if(ok)await show(detail.id).catch(e=>setError(e.message));return ok;
    }}/>{error&&<p role="alert">{error}</p>}</>;
  return <section className="activity-list">
    <label><input type="checkbox" checked={email} disabled={busy||loading} onChange={async e=>{
      const checked=e.target.checked;if(await act({action:"digest",value:checked?"on":"off"}))setEmail(checked);
    }}/> Email me about unread activity at most once a week</label>
    {items.map(item=><div className="activity-row" key={item.id}><Handle handle={item.handle}/>{" "}<button disabled={loading} onClick={()=>{
      if(!item.post){friends();return;}setThread(item.kind==="comment");void show(item.post).catch(e=>setError(e.message));
    }}>{item.kind==="request"?"sent you a friend request":item.kind==="accepted"?"accepted your friend request":item.kind==="comment"?"commented on your photo":(item.total>1?"and "+(item.total-1)+" more liked your photo":"liked your photo")}</button></div>)}
    {loading?<p role="status">Loading activity…</p>:!items.length&&!error&&<p className="muted">No activity yet.</p>}
    {error&&<p role="alert">{error} <button onClick={()=>page()}>Refresh</button></p>}
    {more&&<button disabled={loading} onClick={()=>page(items[items.length-1].id)}>Earlier activity</button>}
  </section>;
}
