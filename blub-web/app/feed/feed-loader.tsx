export function FeedLoader({ done, total }: { done: number; total?: number }) {
  return <div className="feed-loader">
    <img src="/blub-icon.png" alt="" width="64" height="64"/>
    <progress aria-label="Loading feed and photos" value={total ? done : undefined} max={total || 1}/>
  </div>;
}
