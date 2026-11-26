import { useEffect, useState } from "react";
import { PostInteractions, type Post } from "./post-interactions";

async function getPage(after?: Post, signal?: AbortSignal, memberId?:string) {
  const query = new URLSearchParams(memberId ? {action:"memberPhotos",id:memberId} : {action:"mine"});
  if (after) { query.set("before", after.id); query.set("time", String(after.created_at)); }
  const response = await fetch("/api/blub?" + query, {signal});
  const result = await response.json() as { posts: Post[]; more: boolean; error?: string };
  if (!response.ok || !Array.isArray(result.posts)) throw Error(result.error || "Couldn’t load your photos.");
  return result as { posts: Post[]; more: boolean };
}

export function ProfileGrid({ busy, act, remove, deleted, me, member }: {
  busy: boolean; act: (body: Record<string,string>) => Promise<boolean>;
  remove?: (id:string) => void; deleted?: string; member?: {id:string;name:string;handle:string;avatar?:string|null}; me: {id:string;name:string;handle:string;avatar?:string|null};
}) {
  const [posts,setPosts] = useState<Post[]>([]);
  const [more,setMore] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [selected,setSelected] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    getPage(undefined,controller.signal,member?.id).then(page => {
      setPosts(page.posts); setMore(page.more);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[member?.id]);
  useEffect(() => { setPosts(rows => rows.filter(p => p.id !== deleted)); },[deleted]);
  const detail = posts.find(p => p.id === selected);
  async function next() {
    setError(""); setLoading(true);
    try {
      const page = await getPage(posts.at(-1),undefined,member?.id);
      setPosts(rows => [...rows,...page.posts]); setMore(page.more);
    } catch(e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  if (detail) return <>
    <button className="text-button grid-back" onClick={() => setSelected("")}>Back to grid</button>
    <PostInteractions me={me.id} post={{...detail,name:(member??me).name,handle:(member??me).handle,avatar:(member??me).avatar}} busy={busy} onDelete={remove && (() => remove(detail.id))}
      act={async body => {
        const ok = await act(body);
        if (ok) setPosts(rows => rows.map(p => {
          if (p.id !== detail.id) return p;
          if (body.action === "comment") return {...p, comment_count:p.comment_count+1};
          if (body.action === "deleteComment") return {...p,comment_count:Math.max(0,p.comment_count-1)};
          const liked = Number(body.action === "like");
          return {...p, liked, like_count:p.like_count + liked - p.liked};
        }));
        return ok;
      }}/>
  </>;
  return <>
    <div className="profile-grid">{posts.map(p => <button key={p.id} onClick={() => setSelected(p.id)}
      aria-label={"Open photo: " + (p.caption || new Date(p.created_at).toLocaleDateString())}>
      <img src={"/api/blub?action=photo&id="+p.id} alt={p.caption} loading="lazy"/>
    </button>)}</div>
    {!loading && !posts.length && !error && <p className="muted">{member ? "No photos yet." : "Your photos will appear here."}</p>}
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Loading photos…</p> : (more || error) && <button className="secondary" onClick={next}>{error ? "Retry" : "More photos"}</button>}
  </>;
}
