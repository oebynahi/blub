"use client";
import {useEffect,useState,FormEvent} from 'react';
import {Bell,House,Users,Plus,Camera,Lock,Clock3,X,LogOut,ImagePlus,Check,Search,Sparkles,UserRound,Heart} from 'lucide-react';
import { Handle, VisitProfile, MemberDialog } from "./member-profile";
import { Activity } from "./activity";
import { FeedLoader } from "./feed-loader";
import { Avatar, resizeAvatar } from "./avatar";
import { ProfileGrid } from "./profile-grid";
import { PostInteractions, type Post } from "./post-interactions";
type Person={id:string;name:string;handle:string;bio:string;avatar?:string|null};
type Friendship={id:string;sender:string;recipient:string;status:string;name:string;handle:string;avatar?:string|null};
type ApiResult={error?:string;users?:Person[]} & Partial<Data>;
type Data={unread?:boolean;authenticated:boolean;me:Person|null;posts:Post[];friends:Friendship[]};
type PendingAction={action:string;id:string;title:string;description:string;label:string};
const initial:Data={authenticated:false,me:null,posts:[],friends:[]};
export default function Feed(){
 const [data,setData]=useState<Data>(initial),[loading,setLoading]=useState(true),[tab,setTab]=useState('feed'),[modal,setModal]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState<Person[]>([]),[preview,setPreview]=useState(''),[file,setFile]=useState<File|null>(null),[notice,setNotice]=useState(''),[pendingAction,setPendingAction]=useState<PendingAction|null>(null);
 const [pendingPhotos,setPendingPhotos]=useState<string[]>([]);
 const [visited,visit]=useState<string[]>([]);
 const handle=visited.at(-1);
 const [deleted,setDeleted]=useState("");
 const [photoTotal,setPhotoTotal]=useState(0);
 const showingLoader=loading || pendingPhotos.length>0;
 async function refreshBadge(){
   try{const r=await fetch("/api/blub?action=badge");const badge=await r.json() as {unread?:boolean};
     if(r.ok && typeof badge.unread==="boolean")setData(previous=>({...previous,unread:badge.unread}));
   }catch{/* The next refresh retries. */}
 }
 useEffect(()=>{
   if(!data.me?.id)return;
   if(new URLSearchParams(location.search).get("activity")==="1")setTab("activity");
   const visible=()=>{if(document.visibilityState==="visible")void refreshBadge();};
   const timer=window.setInterval(visible,45000);document.addEventListener("visibilitychange",visible);
   return ()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
 },[data.me?.id]);
 async function load(signal?:AbortSignal){
   const r=await fetch('/api/blub',{signal});
   const d=await r.json() as ApiResult;
   if(!r.ok)throw Error(d.error||"Something went wrong. Please try again.");
   if(!signal?.aborted)setData({...initial,...d});
   return d;
 }
 useEffect(()=>{
   const controller=new AbortController();
   const timeout=window.setTimeout(()=>controller.abort(),15000);
   let active=true;
   load(controller.signal).then(result=>{
     if(!active)return;
     const ids=(result.posts??[]).slice(0,2).map(post=>post.id);
     setPhotoTotal(ids.length);
     setPendingPhotos(ids);
   }).catch(e=>{
     if(active)setError(controller.signal.aborted?"The feed took too long to load. Refresh to try again.":e.message);
   }).finally(()=>{
     clearTimeout(timeout);
     if(active)setLoading(false);
   });
   return ()=>{active=false;clearTimeout(timeout);controller.abort();};
 },[]);
 useEffect(()=>{
   if(!photoTotal)return;
   // A slow photo can finish inline once the feed is usable.
   const timeout=window.setTimeout(()=>setPendingPhotos([]),2200);
   return ()=>clearTimeout(timeout);
 },[photoTotal]);
 function photoSettled(id:string){
   setPendingPhotos(ids=>ids.includes(id)?ids.filter(value=>value!==id):ids);
 }
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 useEffect(()=>{if(!modal)return;const previous=document.activeElement as HTMLElement;const element=document.querySelector('.modal') as HTMLElement;const controls=()=>Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea')).filter(x=>x.offsetParent!==null);controls()[1]?.focus();function key(e:KeyboardEvent){if(e.key==='Escape'&&!busy)setModal('');if(e.key==='Tab'){const list=controls(),first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}document.addEventListener('keydown',key);const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=old;previous?.focus()}},[modal,busy]);
 async function act(body:Record<string,string>){setBusy(true);setError('');try{const r=await fetch('/api/blub',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as ApiResult;if(!r.ok)throw Error(d.error||"Something went wrong. Please try again.");await load();return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false)}}
 function removePost(id:string){askConfirmation({action:'delete',id,title:'Delete this post?',description:'This photo, its likes and comments will be permanently removed.',label:'Delete post'});}
 function askConfirmation(action:PendingAction){setPendingAction(action);setError('');setModal('confirm')}
 function open(which:string){setError('');if(!data.authenticated){window.location.href='/signin-with-chatgpt?return_to=%2Ffeed';return}setModal(data.me?which:'profile')}
 async function saveProfile(e:FormEvent<HTMLFormElement>){
   e.preventDefault();
   const form=new FormData(e.currentTarget);
   form.set("action","profile");
   setBusy(true);setError("");
   try{
     const file=form.get("avatar");
     if(file instanceof File && file.size)form.set("avatar",await resizeAvatar(file),"avatar.jpg");
     else form.delete("avatar");
     const response=await fetch("/api/blub",{method:"POST",body:form});
     if(!response.ok)throw Error(((await response.json()) as ApiResult).error||"Couldn’t save your profile.");
     await load();setModal("");setNotice("Profile saved.");
   }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function publish(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!file)return;setBusy(true);setError('');const f=new FormData(e.currentTarget);f.set('photo',file);try{const r=await fetch('/api/blub',{method:'POST',body:f});const d=await r.json() as ApiResult;if(!r.ok)throw Error(d.error||"Something went wrong. Please try again.");await load();setModal('');setFile(null);setPreview('');setNotice('Photo posted.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function search(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/blub?action=search&q='+encodeURIComponent(query));const d=await r.json() as ApiResult;if(!r.ok)throw Error(d.error||"Something went wrong. Please try again.");setResults(d.users||[]);if(!d.users?.length)setNotice('No matching handles found.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const accepted=data.friends.filter(f=>f.status==='accepted'),incoming=data.friends.filter(f=>f.status==='pending'&&f.recipient===data.me?.id);
 return <VisitProfile.Provider value={next=>visit(stack=>stack.at(-1)===next?stack:[...stack,next])}>{showingLoader && <FeedLoader done={1+photoTotal-pendingPhotos.length} total={loading?undefined:1+photoTotal}/>}<div className="app-shell" inert={showingLoader}><header className="site-header"><div className="header-inner"><a className="wordmark" href="/" aria-label="Blub home"><img className="brand-symbol" src="/blub-icon.png" alt="" width="34" height="34"/>blub</a><nav className="desktop-nav" aria-label="Main navigation"><button className={tab==='feed'?'active':''} aria-current={tab==='feed'?'page':undefined} onClick={()=>setTab('feed')}><House size={17}/>Feed</button><button className={tab==='friends'?'active':''} aria-current={tab==='friends'?'page':undefined} onClick={()=>{if(data.me)setTab('friends');else open('profile')}}><Users size={17}/>Friends{incoming.length>0&&<span className="count">{incoming.length}</span>}</button><button className={tab==='profile'?'active':''} aria-current={tab==='profile'?'page':undefined} onClick={()=>{if(data.me)setTab('profile');else open('profile')}}><UserRound size={17}/>Profile</button></nav><div className="header-actions">{data.me&&<button className="activity-bell icon-button" aria-label={data.unread?"Activity, unread notifications":"Activity"} onClick={()=>setTab("activity")}><Bell size={20}/>{data.unread&&<i/>}</button>}<button className="primary header-share" onClick={()=>open('post')}><Plus size={17}/>Post a photo</button>{data.me?<button className="account-button" aria-label="Edit your profile" onClick={()=>open('profile')}><Avatar name={data.me.name} id={data.me.id} avatar={data.me.avatar}/></button>:<a className="signin-link" href="/signin-with-chatgpt?return_to=%2Ffeed" target="_top">Sign in</a>}</div></div></header>
 <main><div className="topbar"><span>Photos from friends</span><span className="private-label"><Lock size={13}/>Friends only</span></div><div className="content-grid"><section className="main-column"><div className="page-heading"><div><div className="eyebrow">{tab==='friends'?'FRIENDS':tab==='profile'?'PROFILE':'BLUB'}</div><h1>{tab==="activity"?"Activity":tab==='friends'?<>Your <span className="gradient-text">friends.</span></>:tab==='profile'?<>Your <span className="gradient-text">profile.</span></>:<>Your <span className="gradient-text">feed.</span></>}</h1><p>{tab==='activity'?'Requests and activity on your posts.':tab==='friends'?'Find friends and manage requests.':tab==='profile'?'Your profile and photos.':'Photos from you and your friends.'}</p></div><span className="heading-orbit" aria-hidden="true"><Sparkles size={26}/></span></div>
 {error&&<div className="alert" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
 {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
 {loading?null:tab==="activity"&&data.me?<Activity me={data.me.id} busy={busy} act={act} friends={()=>{setTab("friends");void load().catch(e=>setError(e.message));}} read={()=>void refreshBadge()}/>:tab==='friends'?<><div className="section-title"><h2>Find your friends</h2><span>By their Blub handle</span></div><form className="search-form" onSubmit={search}><Search size={20}/><input aria-label="Find by handle" placeholder="Search @handle" value={query} onChange={e=>setQuery(e.target.value)} minLength={2} required/><button disabled={busy}>Find</button></form>{results.map(p=>{const f=data.friends.find(f=>f.sender===p.id||f.recipient===p.id);return <div className="person-row" key={p.id}><Avatar name={p.name} id={p.id} avatar={p.avatar}/><div><b>{p.name}</b><small><Handle handle={p.handle}/></small></div>{f?<span className="pill">{f.status==='accepted'?'Friends':'Request pending'}</span>:<button disabled={busy} className="small-button" onClick={()=>act({action:'request',user:p.id})}>Add friend</button>}</div>})}<h2 className="list-heading">Friend requests {incoming.length>0&&`(${incoming.length})`}</h2>{incoming.length===0&&<p className="muted">No pending requests.</p>}{incoming.map(f=><div className="person-row" key={f.id}><Avatar name={f.name} id={f.sender===data.me?.id?f.recipient:f.sender} avatar={f.avatar}/><div><b>{f.name}</b><small><Handle handle={f.handle}/></small></div><button disabled={busy} className="small-button" onClick={()=>act({action:'accept',id:f.id})}>Accept</button><button disabled={busy} className="text-button" onClick={()=>act({action:'remove',id:f.id})}>Decline</button></div>)}<h2 className="list-heading">Friends · {accepted.length}</h2>{data.friends.filter(f=>!incoming.includes(f)).map(f=><div className="person-row" key={f.id}><Avatar name={f.name} id={f.sender===data.me?.id?f.recipient:f.sender} avatar={f.avatar}/><div><b>{f.name}</b><small><Handle handle={f.handle}/> · {f.status==='accepted'?'Friends':'Request sent'}</small></div><button disabled={busy} className="text-button" onClick={()=>{askConfirmation({action:'remove',id:f.id,title:f.status==='accepted'?'Remove this friend?':'Cancel this request?',description:f.status==='accepted'?'You’ll no longer see each other’s photos. You can send a new friend request later.':'They won’t be able to accept this request. You can send a new request later.',label:f.status==='accepted'?'Remove friend':'Cancel request'})}}>{f.status==='accepted'?'Remove':'Cancel'}</button></div>)}{!data.friends.length&&<div className="soft-card"><Users/><h3>No friends added yet.</h3><p>Ask a friend for their handle, then send a request above. Photos are shared only after they accept.</p></div>}</>:<>
 {tab==='profile'&&data.me&&<div className="profile-card"><Avatar name={data.me.name} id={data.me.id} avatar={data.me.avatar} size="large"/><div><h2>{data.me.name}</h2><p>@{data.me.handle}</p>{data.me.bio&&<p>{data.me.bio}</p>}</div><button className="text-button" onClick={()=>open('profile')}>Edit profile</button></div>}
 {tab==='feed'&&<button className="composer" onClick={()=>open('post')}><Avatar name={data.me?.name||'You'} id={data.me?.id} avatar={data.me?.avatar}/><span>Post a photo…</span><span className="composer-camera"><ImagePlus size={21}/></span></button>}
 <div className="feed-label"><h2>{tab==='profile'?'Your posts':'The latest'}</h2><span><Clock3 size={14}/>Newest first</span></div>
 {tab==='profile' && data.me ? <ProfileGrid me={data.me} act={act} busy={busy} remove={removePost} deleted={deleted}/> :
 <div className="feed-pages">{data.posts.map(p=><PostInteractions me={data.me?.id} key={p.id} post={p} act={act} busy={busy}
   onDelete={p.author===data.me?.id?()=>removePost(p.id):undefined}
   onPhotoSettled={pendingPhotos.includes(p.id)?()=>photoSettled(p.id):undefined}/>)}</div>}
 {tab==='feed'&&!data.posts.length&&<div className="welcome-card"><div className="welcome-art" aria-hidden="true"><span className="orbit orbit-one"/><span className="orbit orbit-two"/><span className="art-spark spark-one">✦</span><span className="art-spark spark-two">✧</span><div className="memory-card memory-back"><div className="memory-sunset"><span/></div><div className="memory-lines"><i/><i/></div></div><div className="memory-card memory-front"><div className="memory-flower"><span>●</span><i>●</i></div><div className="memory-lines"><i/><i/></div></div><span className="floating-heart"><Heart size={23} fill="currentColor"/></span></div><div className="welcome-copy"><span className="pill"><Lock size={13}/>Friends only</span><h2>No <span className="gradient-text">photos</span> yet.</h2><p>Post a photo or add friends to see their posts here.</p><button className="primary" onClick={()=>open('post')}><Plus size={18}/>{!data.authenticated?'Sign in to Blub':!data.me?'Create your profile':'Post your first photo'}</button><small>{!data.authenticated?'Use your ChatGPT account to sign in.':'Only accepted friends can see your photos.'}</small></div></div>}
 {tab==='feed'&&data.posts.length>0&&<div className="end-note"><p>{data.posts.length>=100?'Showing the latest 100 posts.':'End of feed.'}</p></div>}</>}
 </section><aside className="right-column"><div className="circle-card"><div className="section-title"><h3>Friends</h3><Users size={18}/></div><div className="circle-avatars">{accepted.length?accepted.slice(0,4).map(f=><Avatar name={f.name} id={f.sender===data.me?.id?f.recipient:f.sender} avatar={f.avatar} key={f.id}/>):<><span className="circle-placeholder"><UserRound size={19}/></span><span className="circle-placeholder"><UserRound size={19}/></span><span className="circle-placeholder"><UserRound size={19}/></span></>}<button aria-label="Find friends" onClick={()=>{if(data.me)setTab('friends');else open('profile')}}><Plus size={19}/></button></div><p>{accepted.length?`${accepted.length} ${accepted.length===1?'friend':'friends'} added.`:'No friends added yet.'}</p><button className="secondary full" onClick={()=>{if(data.me)setTab('friends');else open('profile')}}>Find your friends</button></div>{(!data.me||!accepted.length||!data.posts.some(p=>p.author===data.me?.id))&&<div className="getting-started"><div className="section-title"><h3>Get started</h3><Sparkles size={17}/></div><button className="setup-step" onClick={()=>open('profile')}><span className={data.me?'step-icon complete':'step-icon'}>{data.me?<Check size={16}/>:<UserRound size={17}/>}</span><span><b>Create a profile</b><small>Choose your name and handle.</small></span></button><button className="setup-step" onClick={()=>{if(data.me)setTab('friends');else open('profile')}}><span className={accepted.length?'step-icon complete':'step-icon'}>{accepted.length?<Check size={16}/>:<Users size={17}/>}</span><span><b>Add a friend</b><small>Find them with their @handle.</small></span></button><button className="setup-step" onClick={()=>open('post')}><span className={data.posts.some(p=>p.author===data.me?.id)?'step-icon complete':'step-icon'}>{data.posts.some(p=>p.author===data.me?.id)?<Check size={16}/>:<Camera size={17}/>}</span><span><b>Post a photo</b><small>Choose a photo and add a caption.</small></span></button></div>}<div className="manifesto"><h3>Photo privacy</h3><p>Your photos are visible to you and accepted friends. Removing a friend ends their access to your posts.</p><div><Lock size={14}/>Friend requests must be accepted before photos are shared.</div></div><footer className="side-footer">blub <span>· Friends-only photos</span></footer></aside></div></main>
 <nav className="mobile-nav" aria-label="Mobile navigation"><button className={tab==='feed'?'selected':''} onClick={()=>setTab('feed')}><House/>Feed</button><button className={tab==='friends'?'selected':''} onClick={()=>{if(data.me)setTab('friends');else open('profile')}}><Users/>Friends</button><button className="mobile-add" aria-label="Post a photo" onClick={()=>open('post')}><Plus/></button><button className={tab==='profile'?'selected':''} onClick={()=>{if(data.me)setTab('profile');else open('profile')}}><Camera/>Profile</button></nav>
 {modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)setModal('')}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="close icon-button" aria-label="Close dialog" disabled={busy} onClick={()=>setModal('')}><X/></button><div className="eyebrow">BLUB</div><h2 id="modal-title">{modal==='confirm'?pendingAction?.title:modal==='profile'?(data.me?'Edit profile':'Create your profile'): 'New post'}</h2><p className="muted">{modal==='confirm'?pendingAction?.description:modal==='profile'?'Pick a handle so your friends can find you.':'Choose a photo and add an optional caption.'}</p>{error&&<p className="alert" role="alert">{error}</p>}{modal==='confirm'?<div className="confirm-actions"><button className="secondary" disabled={busy} onClick={()=>setModal('')}>{pendingAction?.action==='delete'?'Keep post':'Go back'}</button><button className="primary danger" disabled={busy} onClick={async()=>{if(pendingAction&&await act({action:pendingAction.action,id:pendingAction.id})){if(pendingAction.action==='delete')setDeleted(pendingAction.id);setModal('');setPendingAction(null)}}}>{busy?'Saving…':pendingAction?.label}</button></div>:modal==='profile'?<form onSubmit={saveProfile}><label>Profile picture<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp"/></label><small>Visible to people searching for your handle.</small><label>Your name<input name="name" defaultValue={data.me?.name} autoFocus required maxLength={50} autoComplete="name"/></label><label>Your handle<input name="handle" defaultValue={data.me?.handle} required pattern="[a-z0-9_]{3,24}" minLength={3} maxLength={24} placeholder="e.g. sunday_morning" autoCapitalize="none" autoComplete="off"/></label><small>3–24 lowercase letters, numbers, or underscores.</small><label>Bio<textarea name="bio" defaultValue={data.me?.bio} maxLength={200} rows={3} placeholder="Add a short bio (optional)"/></label><button className="primary full" disabled={busy}>{busy?'Saving…':'Save profile'}<Check size={18}/></button>{data.me&&<a className="signout" href="/signout-with-chatgpt?return_to=%2F" target="_top"><LogOut size={15}/>Sign out</a>}</form>:<form onSubmit={publish}><label className="upload">{preview?<img src={preview} alt="Photo preview"/>:<><ImagePlus size={34}/><b>Choose a photo</b><span>JPEG, PNG, or WebP · up to 8 MB</span></>}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose photo" onChange={e=>{const f=e.target.files?.[0];if(f){if(f.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type)){setFile(null);setPreview('');e.target.value='';setError('Choose a JPEG, PNG, or WebP photo smaller than 8 MB.');return}setFile(f);setPreview(URL.createObjectURL(f));setError('')}}}/></label><label>Caption<textarea name="caption" placeholder="Add a caption (optional)" maxLength={1500} rows={3}/></label><div className="privacy-note"><Lock size={14}/>Shared only with your accepted friends.</div><button className="primary full" disabled={busy||!file}>{busy?'Sharing…':'Post a photo'}<Plus size={18}/></button></form>}</section></div>}
 </div>{handle&&data.me&&<MemberDialog key={handle} handle={handle} me={data.me} busy={busy} act={act} close={()=>visit(stack=>stack.slice(0,-1))}/>}</VisitProfile.Provider>
}
