import { Camera, Check, Clock3, Leaf, Lock, Plus, Users } from "lucide-react";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const user = await getChatGPTUser();
  const start = user ? "/feed" : chatGPTSignInPath("/feed");

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="landing-header">
        <a className="wordmark" href="/" aria-label="Blub home"><Leaf className="brand-symbol" size={27} strokeWidth={1.6}/>blub</a>
        <nav className="landing-links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <a className="secondary" href="/feed">Open Blub</a>
      </header>

      <main className="landing-main" id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="hero-copy">
            <span className="landing-kicker"><Leaf size={16}/>A friends-only photo app</span>
            <h1 id="landing-title">Your photos.<br/><span>Your friends.</span></h1>
            <p>Share photos with the people you know.<br className="hero-break"/> See what they’ve posted, newest first.</p>
            <div className="hero-actions">
              <a className="primary" href={start} target={user ? undefined : "_top"}>{user ? "Go to your feed" : "Get started"}<Plus size={18}/></a>
              <a className="hero-secondary" href="#how-it-works">A look inside</a>
            </div>
            <span className="hero-auth-note">{user ? "Your feed is ready." : "Sign in with your ChatGPT account."}</span>
            <div className="hero-footnote"><Lock size={14}/>Your photos stay between accepted friends.</div>
          </div>

          <div className="hero-visual">
            <svg className="contour-lines" viewBox="0 0 540 600" fill="none" aria-hidden="true"><path d="M20 355C-60 195 80-40 288 35S550 185 493 350 234 660 77 510 342 130 420 283 144 585 94 377 198 62 355 137 518 459 310 521"/><path d="M41 349C-22 202 95-7 282 61S515 200 464 345 242 620 106 497 308 166 394 295 167 542 123 373 211 100 344 166 477 438 302 488"/><path d="M64 340C14 216 108 32 275 89S480 213 435 341 252 581 134 481 278 200 365 308 192 499 151 371 224 139 333 195 438 418 295 457"/></svg>
            <figure className="forest-frame">
              <img src="/images/forest.jpg" alt="Sunlight passing through branches in a green forest" width={1600} height={1067} fetchPriority="high"/>
              <figcaption><span><Leaf size={16}/>Outside for a while.</span><small>Sample photo</small></figcaption>
            </figure>
            <div className="photo-tag"><span className="tag-avatar">Y</span><div><b>You posted a photo</b><small>Visible to your friends</small></div><Check size={17}/></div>
            <div className="visual-caption"><span>blub / a place for your photos</span><span>Friends only <Lock size={12}/></span></div>
          </div>
        </section>

        <section className="how-section" id="how-it-works" aria-labelledby="how-title">
          <div className="how-intro"><span className="eyebrow">HOW IT WORKS</span><h2 id="how-title">Photos, without<br/>the public audience.</h2><p>Choose who you connect with.<br/>Post when you have something to share.</p></div>
          <div className="how-steps">
            <div className="how-step"><span><Users size={22}/></span><div><h3>Add your friends</h3><p>Find them by their handle and send a request. They’ll need to accept before you can see each other’s photos.</p></div></div>
            <div className="how-step"><span><Camera size={22}/></span><div><h3>Post a photo</h3><p>Choose a photo and add a caption if you want. Only you and your accepted friends can see it.</p></div></div>
            <div className="how-step"><span><Clock3 size={22}/></span><div><h3>Catch up in order</h3><p>Your feed shows your posts and your friends’ posts, newest first. No suggested posts or popularity ranking.</p></div></div>
          </div>
        </section>

        <section className="privacy-section" id="privacy" aria-labelledby="privacy-title">
          <div className="privacy-intro"><Lock size={25}/><span className="eyebrow">YOUR CHOICE</span><h2 id="privacy-title">Know who’s<br/>seeing your photos.</h2><p>Friendship on Blub goes both ways.<br/>Requests need to be accepted.</p><a className="primary" href={start} target={user ? undefined : "_top"}>{user ? "Open your feed" : "Create your profile"}</a></div>
          <div className="privacy-questions">
            <details open><summary>Who can see my posts?</summary><p>You and your accepted friends. A pending request doesn’t give someone access to your photos.</p></details>
            <details><summary>What happens when I remove a friend?</summary><p>They lose access to your posts in Blub, and you lose access to theirs. You can send a new friend request later. Removing access can’t erase copies someone has already saved.</p></details>
            <details><summary>What’s on my profile?</summary><p>Your name, handle, optional bio, and photos. Other signed-in users can search for your handle, but they need to become your friend to see your photos.</p></details>
          </div>
        </section>
      </main>
      <footer className="landing-footer"><a className="wordmark" href="/" aria-label="Blub home"><Leaf size={22} strokeWidth={1.6}/>blub</a><span>Photos with friends.</span><a href="/feed">Open Blub</a></footer>
    </div>
  );
}
