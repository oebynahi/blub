"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";

import { createPortal } from "react-dom";

export function TiltPreview({ children }: { children: ReactNode }) {
  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const surface = event.currentTarget;
    const bounds = surface.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    surface.style.setProperty("--pitch", (-y * 12) + "deg");
    surface.style.setProperty("--yaw", (x * 16) + "deg");
  }

  function reset(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.style.removeProperty("--pitch");
    event.currentTarget.style.removeProperty("--yaw");
  }

  return <div className="hero-visual" onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset}>{children}</div>;
}

const reactions = ["❤️", "😍", "😂", "💜", "🥰", "💖", "🤣", "🫶"];
const burstDuration = 1050;

function makeBurst() {
  const columns = window.innerWidth < 650 ? 10 : 16;
  return Array.from({ length: columns * 3 }, (_, index) => {
    const wave = Math.floor(index / columns);
    const column = index % columns;
    return {
      emoji: reactions[Math.floor(Math.random() * reactions.length)],
      style: {
        left: ((column + 0.15 + Math.random() * 0.7) / columns * 100) + "%",
        top: (28 + wave * 30 + Math.random() * 16) + "%",
        fontSize: (1.6 + Math.random() * 2.6) + "rem",
        animationDelay: (wave * 85 + Math.random() * 55) + "ms",
        animationDuration: (650 + Math.random() * 150) + "ms",
        "--drift": (Math.random() * 14 - 7) + "vw",
        "--spin": (Math.random() * 60 - 30) + "deg",
      } as CSSProperties,
    };
  });
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
    }, burstDuration);
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
