"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";

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

export function OpenBlubLink({ className }: { className?: string }) {
  const [burst, setBurst] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    if (timer.current !== undefined) return;
    const href = event.currentTarget.href;
    setBurst(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setBurst(false);
      window.location.assign(href);
    }, 380);
  }

  return (
    <a className={["reaction-link", className].filter(Boolean).join(" ")} href="/feed" onClick={open}>
      Open Blub
      {burst && <span className="reaction-burst" aria-hidden="true"><i>❤️</i><i>😍</i><i>😂</i></span>}
    </a>
  );
}
