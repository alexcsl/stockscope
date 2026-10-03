"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function LandingScroll() {
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(".landing-story-progress", { scaleY: 0 }, { scaleY: 1, transformOrigin: "top", ease: "none", scrollTrigger: { trigger: ".landing-hero", start: "top top", end: "bottom top", scrub: true } });
      gsap.fromTo(".landing-thesis .section-kicker, .landing-thesis h2, .landing-thesis p", { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: .13, ease: "back.out(1.25)", scrollTrigger: { trigger: ".landing-thesis", start: "top 78%", toggleActions: "play none none none" } });
      gsap.fromTo(".landing-method li", { y: 30, opacity: .35 }, { y: 0, opacity: 1, duration: .75, stagger: .12, ease: "back.out(1.35)", scrollTrigger: { trigger: ".landing-method", start: "top 78%", toggleActions: "play none none none" } });
      gsap.fromTo(".landing-preview > div:first-child > *, .landing-preview-panel", { y: 42, opacity: 0 }, { y: 0, opacity: 1, duration: .85, stagger: .1, ease: "back.out(1.2)", scrollTrigger: { trigger: ".landing-preview", start: "top 76%", toggleActions: "play none none none" } });
      gsap.fromTo(".landing-preview-row", { x: 22, opacity: 0 }, { x: 0, opacity: 1, duration: .55, stagger: .09, ease: "power2.out", scrollTrigger: { trigger: ".landing-preview", start: "top 68%", toggleActions: "play none none none" } });
      gsap.fromTo(".landing-final .section-kicker, .landing-final h2, .landing-final .landing-primary", { y: 44, opacity: 0 }, { y: 0, opacity: 1, duration: .85, stagger: .12, ease: "back.out(1.3)", scrollTrigger: { trigger: ".landing-final", start: "top 78%", toggleActions: "play none none none" } });
    });
    return () => media.revert();
  });

  return null;
}
