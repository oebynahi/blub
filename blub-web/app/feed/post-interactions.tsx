"use client";

import { useRef, useState, type FormEvent } from "react";
import { preload } from "react-dom";
import { Heart, MessageCircle, Trash2 } from "lucide-react";

import { Avatar } from "./avatar";

export type Post = { name: string; handle: string; author: string; avatar?: string | null; created_at: number; id: string; caption: string; liked: number; like_count: number; comment_count: number };
type Comment = { id: number; handle: string; body: string };
type Props = {
  post: Post;
  busy: boolean;
  onDelete?: () => void;
  onPhotoSettled?: () => void;
  act: (body: Record<string, string>) => Promise<boolean>;
};

export function PostInteractions({ post, busy, act, onPhotoSettled, onDelete }: Props) {
  preload("/chrome-heart.png", { as: "image" });
  const [pulse, setPulse] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const requestId = useRef("");
  const locked = busy || loading;

  async function like(remove: boolean) {
    if (locked) return;
    if (!remove) setPulse(previous => previous + 1);
    if (remove || !post.liked) {
      const saved = await act({ action: remove ? "unlike" : "like", id: post.id });
      if (!saved) setPulse(0);
    }
  }

  async function readComments(before?: number) {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ action: "comments", id: post.id });
      if (before) query.set("before", String(before));
      const response = await fetch("/api/blub?" + query);
      const page = await response.json() as { comments: Comment[]; more: boolean; error?: string };
      if (!response.ok || !page.comments) throw Error(page.error || "Couldn’t load comments.");
      setComments(previous => before ? [...page.comments, ...previous] : page.comments);
      setMore(page.more);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (locked || !draft.trim()) return;
    requestId.current ||= crypto.randomUUID();
    if (await act({ action: "comment", id: post.id, body: draft, requestId: requestId.current })) {
      setDraft("");
      requestId.current = "";
      await readComments();
    }
  }

  return <article className="post photo-card">
    <div className="post-media" onDoubleClick={() => like(false)}>
      <img className="post-photo" src={"/api/blub?action=photo&id=" + post.id}
        alt={post.caption || "Photo shared with friends"} loading={onPhotoSettled ? "eager" : "lazy"} onLoad={onPhotoSettled} onError={onPhotoSettled}/>
      <div className="photo-byline"><b>{post.name}</b></div>
      {pulse > 0 && <img key={pulse} className="like-pulse" src="/chrome-heart.png" alt=""
        onAnimationEnd={() => setPulse(0)}/>}
    </div>
    <div className="photo-toolbar">
      <Avatar name={post.name} id={post.author} avatar={post.avatar}/>
      <div className="photo-credit"><b>@{post.handle}</b>
        <time dateTime={new Date(post.created_at).toISOString()}>{new Date(post.created_at).toLocaleDateString(undefined, {month:"short",day:"numeric"})} · Friends only</time>
      </div>
      <div className="post-actions">
      <button type="button" aria-label="Like post" aria-pressed={Boolean(post.liked)} disabled={locked}
        onClick={() => like(Boolean(post.liked))}><Heart size={19} fill={post.liked ? "currentColor" : "none"}/> {post.like_count}</button>
      <button type="button" aria-label={"Comments (" + post.comment_count + ")"} aria-expanded={open} disabled={locked} onClick={() => {
        setOpen(!open);
        if (!open) void readComments();
      }}><MessageCircle size={18}/> {post.comment_count}</button>
    </div>
      {onDelete && <button type="button" className="icon-button" aria-label="Delete post" onClick={onDelete} disabled={busy}><Trash2 size={16}/></button>}
    </div>
    {post.caption && <p className="caption">{post.caption}</p>}
    {open && <section className="post-comments" aria-label="Post comments">
      {more && <button className="text-button" disabled={locked} onClick={() => readComments(comments[0].id)}>Earlier comments</button>}
      {comments.map(comment => <p key={comment.id}><b>@{comment.handle}</b> {comment.body}</p>)}
      {loading && <p role="status">Loading comments…</p>}
      {error && <p role="alert">{error} <button className="text-button" onClick={() => readComments()}>Retry</button></p>}
      <form onSubmit={send}>
        <input aria-label="Add a comment" placeholder="Add a comment…" value={draft} maxLength={1000} disabled={locked}
          onChange={event => { setDraft(event.target.value); requestId.current = ""; }}/>
        <button className="small-button" disabled={locked || !draft.trim()}>Send</button>
      </form>
    </section>}
  </article>;
}
