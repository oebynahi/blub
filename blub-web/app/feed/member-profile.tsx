"use client";

import {createContext, useContext, useEffect, useRef, useState} from "react";
import {Avatar} from "./avatar";
import {ProfileGrid} from "./profile-grid";

type Member = {id:string; name:string; handle:string; bio:string; avatar?:string|null; can_view:number};
export const VisitProfile = createContext<(handle:string)=>void>(()=>{});
export function Handle({handle}:{handle:string}) {
  const visit = useContext(VisitProfile);
  return <button type="button" className="profile-handle" aria-label={"View @"+handle+"’s profile"} onClick={()=>visit(handle)}>@{handle}</button>;
}

export function MemberDialog({handle, me, close, act, busy}:{handle:string; me:Omit<Member,"can_view">; close:()=>void;
  act:(body:Record<string,string>)=>Promise<boolean>; busy:boolean}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [member,setMember]=useState<Member|null>(null), [error,setError]=useState(""), [attempt,retry]=useState(0);
  useEffect(()=>{
    const el=dialog.current!;
    el.showModal();
    return ()=>el.close();
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    setError("");
    (async()=>{
      const res=await fetch("/api/blub?"+new URLSearchParams({action:"member",handle}),{signal:controller.signal});
      const person=await res.json() as Member & {error?:string};
      if(!res.ok || !person.id)throw Error(person.error || "Profile unavailable.");
      setMember(person);
    })().catch(e=>{if(!controller.signal.aborted)setError(e.message)});
    return ()=>controller.abort();
  },[handle,attempt]);
  return <dialog ref={dialog} className="member-dialog" aria-label={"Profile of @"+handle} onCancel={close}>
    <button className="text-button" onClick={close}>Back</button>
    {error?<p role="alert">{error} <button className="text-button" onClick={()=>retry(n=>n+1)}>Retry</button></p>:!member?<p role="status">Loading profile…</p>:<>
      <div className="profile-card"><Avatar {...member} size="large"/><div><h2>{member.name}</h2><p>@{member.handle}</p>{member.bio&&<p>{member.bio}</p>}</div></div>
      {member.can_view?<ProfileGrid member={member} me={me} act={act} busy={busy}/>:<p className="muted">Photos are shared with friends.</p>}
    </>}
  </dialog>;
}
