"use client";
import {useEffect,useState} from "react";

type Slot={id:string;prompt:string;photo:string|null};
export function Highlights({owner,editable}:{owner:string;editable:boolean}) {
  const [slots,setSlots]=useState<Slot[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
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
    <div className="highlight-cards">{slots.map(slot=><article key={slot.id}>
      <h3>{slot.prompt}</h3>
      {slot.photo&&<img loading="lazy" src={"/api/blub?action=highlightPhoto&id="+slot.photo} alt={"Photo answer to “"+slot.prompt+"”"}/>}
      {editable&&<div><label className="highlight-picker">{slot.photo?"Change photo":"Add photo"}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-label={"Choose a photo for "+slot.prompt}
          onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void save(slot,file)}}/>
      </label>{slot.photo&&<button className="text-button" disabled={busy} onClick={()=>save(slot)}>Remove</button>}</div>}
    </article>)}</div></section>}
    {busy&&<p role="status">Saving answer…</p>}
    {error&&<p role="alert">{error} <button onClick={()=>load().then(()=>setError("")).catch(e=>setError(e.message))}>Refresh</button></p>}
  </>;
}
