"use client";
import {useEffect,useRef,useState} from "react";

type Slot={id:string;prompt:string;photo:string|null};
export function Highlights({owner,editable}:{owner:string;editable:boolean}) {
  const [slots,setSlots]=useState<Slot[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [playing,setPlaying]=useState(false),[editing,setEditing]=useState(false);
  const answers=slots.filter(slot=>slot.photo);
  async function load(signal?:AbortSignal){
    const response=await fetch("/api/blub?"+new URLSearchParams({action:"highlights",id:owner}),{signal});
    const rows=await response.json();
    if(!response.ok||!Array.isArray(rows))throw Error("Couldn’t load highlights.");
    setSlots(rows);
  }
  useEffect(()=>{
    const controller=new AbortController();
    load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message)});
    return ()=>controller.abort();
  },[owner]);
  async function save(slot:Slot,file?:File){
    if(busy || (!file && !window.confirm("Remove this photo answer?")))return;
    setBusy(true);setError("");
    try {
      if(file && file.size>8*1024*1024)throw Error("Choose a photo up to 8 MB.");
      const form=new FormData();
      if(file){form.set("action","highlight");form.set("slot",slot.id);form.set("photo",file);}
      const response=await fetch("/api/blub",file?{method:"POST",body:form}:{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"removeHighlight",id:slot.photo})
      });
      if(!response.ok)throw Error(((await response.json()) as {error:string}).error);
      await load();
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <>{slots.length>0&&<section className="highlights" aria-label="Highlights"><h2>Highlights</h2>
    {answers.length>0&&<button type="button" className="reel-cover" onClick={()=>setPlaying(true)}>
      <img src={photoUrl(answers[0])} alt=""/><span><strong>Play highlights</strong><small>{answers.length} {answers.length===1?"photo":"photos"}</small></span><span aria-hidden="true">▶</span>
    </button>}
    {editable&&answers.length>0&&<button type="button" className="text-button" aria-expanded={editing} onClick={()=>setEditing(!editing)}>{editing?"Done editing":"Edit highlights"}</button>}
    {playing&&answers.length>0&&<Reel answers={answers} close={()=>setPlaying(false)}/>}
    {editable&&(editing||!answers.length)&&<div className="highlight-cards">{slots.map(slot=><article key={slot.id}>
      <h3>{slot.prompt}</h3>
      {slot.photo&&<img loading="lazy" src={"/api/blub?action=highlightPhoto&id="+slot.photo} alt={"Photo answer to “"+slot.prompt+"”"}/>}
      {editable&&<div><label className="highlight-picker">{slot.photo?"Change photo":"Add photo"}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-label={"Choose a photo for "+slot.prompt}
          onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void save(slot,file)}}/>
      </label>{slot.photo&&<button className="text-button" disabled={busy} onClick={()=>save(slot)}>Remove</button>}</div>}
    </article>)}</div>}</section>}
    {busy&&<p role="status">Saving answer…</p>}
    {error&&<p role="alert">{error} <button onClick={()=>load().then(()=>setError("")).catch(e=>setError(e.message))}>Refresh</button></p>}
  </>;
}

function photoUrl(slot:Slot){return "/api/blub?action=highlightPhoto&id="+slot.photo}

function Reel({answers,close}:{answers:Slot[];close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [index,go]=useState(0),[ready,setReady]=useState(""),[failed,setFailed]=useState("");
  const [paused,setPaused]=useState(()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const slot=answers[index],last=index===answers.length-1;
  useEffect(()=>{
    const el=dialog.current!;
    el.showModal();
    return ()=>el.close();
  },[]);
  useEffect(()=>{
    if(paused||last||ready!==slot.photo)return;
    let timer:number;
    function schedule(){
      clearTimeout(timer);
      if(!document.hidden)timer=window.setTimeout(()=>go(index+1),7000);
    }
    schedule();
    document.addEventListener("visibilitychange",schedule);
    return ()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",schedule)};
  },[index,last,paused,ready,slot.photo]);
  return <dialog ref={dialog} className="reel-dialog" aria-label="Highlight reel" onCancel={e=>{e.preventDefault();close()}} onKeyDown={e=>{
    if(e.key==="ArrowLeft"||e.key==="ArrowRight"){
      e.preventDefault();go(Math.max(0,Math.min(answers.length-1,index+(e.key==="ArrowLeft"?-1:1))));
    }
  }}>
    <div className="reel-stage"><div className="reel-progress" aria-hidden="true">{answers.map((s,i)=><i key={s.id} className={i<=index?"seen":""}/>)}</div>
      <header><span>Highlights · {index+1} of {answers.length}</span><button onClick={close}>Close</button></header>
      <h2 aria-live="polite">{slot.prompt}</h2>
      <div className="reel-photo"><img key={slot.photo} src={photoUrl(slot)} alt={"Photo answer to “"+slot.prompt+"”"}
        onLoad={()=>setReady(slot.photo!)} onError={()=>setFailed(slot.photo!)}/>
        {failed===slot.photo&&<p role="alert">Couldn’t load this photo.</p>}</div>
      <footer><button disabled={!index} onClick={()=>go(index-1)}>Back</button>
        {!last&&<button onClick={()=>setPaused(!paused)}>{paused?"Play":"Pause"}</button>}
        <button onClick={()=>last?close():go(index+1)}>{last?"Done":"Next"}</button></footer>
    </div>
  </dialog>;
}
