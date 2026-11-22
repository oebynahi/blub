"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";

import { createPortal } from "react-dom";

export function ReactiveLogoPreview({ children }: { children: ReactNode }) {
  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const surface = event.currentTarget;
    const bounds = surface.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    surface.style.setProperty("--follow-x", x * 70 + "px");
    surface.style.setProperty("--follow-y", y * 46 + "px");
    surface.style.setProperty("--pitch", (-y * 58) + "deg");
    surface.style.setProperty("--yaw", (x * 74) + "deg");
  }

  function reset(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.style.removeProperty("--follow-x");
    event.currentTarget.style.removeProperty("--follow-y");
    event.currentTarget.style.removeProperty("--pitch");
    event.currentTarget.style.removeProperty("--yaw");
  }

  return <div className="hero-visual" onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset}>{children}</div>;
}

const reactions = [
  "❤️", "😍", "😂", "💜", "🥰", "💖", "🤣", "🫶", "🥹", "🤭", "🤩", "😎",
  "🥳", "🫠", "😘", "🪩", "✨", "🫧", "🦋", "🌈", "🌟", "💫", "🍒", "🛸",
  "🐸", "🦄", "🪼", "👀", "🎉", "💕", "💌", "🩷", "🔥", "🤍", "💎", "🪐",
];
const emissionTime = 720;
const flightTime = 920;

function makeBurst() {
  const lanes = Math.min(42, Math.max(10, Math.ceil(window.innerWidth / 44)));
  return Array.from({ length: lanes * 6 }, (_, index) => ({
    emoji: reactions[Math.floor(Math.random() * reactions.length)],
    style: {
      left: ((index % lanes + Math.random()) / lanes * 100) + "%",
      fontSize: (1.4 + Math.random() * 3.3) + "rem",
      animationDelay: Math.random() * emissionTime + "ms",
      "--drift": (Math.random() * 8 - 4) + "vw",
      "--flight-time": flightTime + "ms",
    } as CSSProperties,
  }));
}

export function OpenBlubLink({ className }: { className?: string }) {
  const [burst, setBurst] = useState<ReturnType<typeof makeBurst>>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    if (timer.current !== undefined) return;
    const href = event.currentTarget.href;
    setBurst(makeBurst());
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setBurst([]);
      window.location.assign(href);
    }, emissionTime + flightTime + 40);
  }

  return (
    <a className={className} href="/feed" onClick={open}>
      Open Blub
      {burst.length > 0 && createPortal(
        <div className="reaction-burst" aria-hidden="true">
          {burst.map(({ emoji, style }, index) => <span key={index} style={style}>{emoji}</span>)}
        </div>,
        document.body
      )}
    </a>
  );
}
