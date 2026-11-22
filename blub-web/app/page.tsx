import { Camera, Check, Clock3, Sparkles, Lock, Plus, Users } from "lucide-react";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";

import { OpenBlubLink, ReactiveLogoPreview } from "./home-interactions";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const user = await getChatGPTUser();
  const start = user ? "/feed" : chatGPTSignInPath("/feed");

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="landing-header">
        <a className="wordmark" href="/" aria-label="Blub home"><img className="brand-symbol" src="/blub-icon.png" alt="" width="34" height="34"/>blub</a>
        <nav className="landing-links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <OpenBlubLink className="secondary"/>
      </header>

      <main className="landing-main" id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="hero-copy">
            <span className="landing-kicker"><Sparkles size={16}/>A friends-only photo app</span>
            <h1 id="landing-title">Your photos.<br/><span>Your friends.</span></h1>
            <p>Ditch the algorithm and connect for real.</p>
            <div className="hero-actions">
              <a className="primary" href={start} target={user ? undefined : "_top"}>{user ? "Go to your feed" : "Get started"}<Plus size={18}/></a>
              <a className="hero-secondary" href="#how-it-works">A look inside</a>
            </div>
            <span className="hero-auth-note">{user ? "Your feed is ready." : "Sign in with your ChatGPT account."}</span>
            <div className="hero-footnote"><Lock size={14}/>Your photos stay between accepted friends.</div>
          </div>

          <ReactiveLogoPreview>
            <div className="preview-card">
              <div className="preview-header"><span className="preview-avatar">Y</span><span><b>Your photo</b><small>Post preview</small></span><Lock size={15}/></div>
              <div className="preview-art" aria-hidden="true"><img className="chrome-sculpture" src="/chrome-mark.png" alt="" width="600" height="600"/></div>
              <div className="preview-caption"><span>Shared with friends</span><Check size={16}/></div>
            </div>
          </ReactiveLogoPreview>
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
      <footer className="landing-footer"><a className="wordmark" href="/" aria-label="Blub home"><img className="brand-symbol" src="/blub-icon.png" alt="" width="34" height="34"/>blub</a><span>Photos with friends.</span><OpenBlubLink/></footer>
    </div>
  );
}
