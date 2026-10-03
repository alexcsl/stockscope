"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function LandingMotion() {
  const scope = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [canPlay, setCanPlay] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 760px)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const update = () => setCanPlay(!reduced.matches && !narrow.matches && !connection?.saveData);
    update();
    reduced.addEventListener("change", update);
    narrow.addEventListener("change", update);
    return () => { reduced.removeEventListener("change", update); narrow.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    const media = video.current;
    if (!media || !canPlay || videoFailed) { media?.pause(); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void media.play().catch(() => setVideoFailed(true));
      else media.pause();
    }, { threshold: .2 });
    observer.observe(media);
    return () => { observer.disconnect(); media.pause(); };
  }, [canPlay, videoFailed]);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(min-width: 761px) and (prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(".landing-film-frame", { clipPath: "inset(8% 12% round 4px)", scale: .93 }, { clipPath: "inset(0% 0% round 0px)", scale: 1, ease: "none", scrollTrigger: { trigger: scope.current, start: "top bottom", end: "center center", scrub: .45 } });
      gsap.fromTo(".landing-film-caption", { y: 35, opacity: .35 }, { y: 0, opacity: 1, ease: "none", scrollTrigger: { trigger: scope.current, start: "top 70%", end: "center center", scrub: .45 } });
    });
    return () => media.revert();
  }, { scope });

  return <section className="landing-film" ref={scope} aria-labelledby="film-title"><div className="landing-film-frame"><div className="landing-film-media"><video ref={video} muted loop playsInline preload="none" poster="/media/stockscope-poster.webp" aria-hidden="true" onError={() => setVideoFailed(true)}>{canPlay && !videoFailed ? <source src="/media/stockscope-film.mp4" type="video/mp4" /> : null}</video><span className="landing-film-grid" aria-hidden="true" /></div><div className="landing-film-caption"><span className="section-kicker">THE RESEARCH SEQUENCE</span><h2 id="film-title">From a token address<br />to a decision you can inspect.</h2><p>Illustrative product film. It contains no market prices, live quotes, or trade approval.</p></div></div></section>;
}
