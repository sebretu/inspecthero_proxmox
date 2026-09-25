"use client";
import { useEffect, useRef } from "react";

export interface AntiGravityOptions {
  maxRotation?: number; // max degrees e.g. 6
  perspective?: number; // e.g. 1200
  enableShine?: boolean;
}

export function useAntiGravity3D<T extends HTMLElement = HTMLDivElement>(
  options: AntiGravityOptions = {}
) {
  const ref = useRef<T | null>(null);
  const { maxRotation = 6, perspective = 1200, enableShine = true } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Check if touch device or reduced motion is preferred
    const isTouch =
      typeof window !== "undefined" &&
      (window.matchMedia("(hover: none)").matches ||
        window.matchMedia("(pointer: coarse)").matches ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    if (isTouch) {
      // Touch devices: no mouse tilt to preserve 100% native scrolling
      return;
    }

    let targetRotX = 0;
    let targetRotY = 0;
    let currentRotX = 0;
    let currentRotY = 0;
    let rafId: number | null = null;
    let isHovered = false;

    // Ensure parent container has perspective
    el.style.transformStyle = "preserve-3d";

    const parent = el.parentElement;
    if (parent && !parent.style.perspective) {
      parent.style.perspective = `${perspective}px`;
    }

    // Create or find shine element
    let shineEl = el.querySelector<HTMLDivElement>(".card-shine");
    if (!shineEl && enableShine) {
      shineEl = document.createElement("div");
      shineEl.className = "card-shine";
      el.appendChild(shineEl);
    }

    const updateMotion = () => {
      // Smooth lerp (interpolation)
      const ease = isHovered ? 0.12 : 0.08;
      currentRotX += (targetRotX - currentRotX) * ease;
      currentRotY += (targetRotY - currentRotY) * ease;

      const rotXClamped = Math.max(-maxRotation, Math.min(maxRotation, currentRotX));
      const rotYClamped = Math.max(-maxRotation, Math.min(maxRotation, currentRotY));

      el.style.transform = `rotateX(${rotXClamped.toFixed(2)}deg) rotateY(${rotYClamped.toFixed(2)}deg)`;

      // Continue animation loop until settled
      if (
        isHovered ||
        Math.abs(targetRotX - currentRotX) > 0.01 ||
        Math.abs(targetRotY - currentRotY) > 0.01
      ) {
        rafId = requestAnimationFrame(updateMotion);
      } else {
        el.style.transform = "rotateX(0deg) rotateY(0deg)";
        rafId = null;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const normX = (x / rect.width) * 2 - 1; // -1 to +1
      const normY = (y / rect.height) * 2 - 1; // -1 to +1

      targetRotX = -normY * maxRotation;
      targetRotY = normX * maxRotation;

      if (shineEl) {
        const shineX = (x / rect.width) * 100;
        const shineY = (y / rect.height) * 100;
        shineEl.style.background = `radial-gradient(circle at ${shineX}% ${shineY}%, rgba(255, 255, 255, 0.12) 0%, transparent 60%)`;
        shineEl.style.opacity = "1";
      }

      if (!rafId) {
        rafId = requestAnimationFrame(updateMotion);
      }
    };

    const handlePointerEnter = () => {
      isHovered = true;
      el.style.transition = "none";
      if (!rafId) {
        rafId = requestAnimationFrame(updateMotion);
      }
    };

    const handlePointerLeave = () => {
      isHovered = false;
      targetRotX = 0;
      targetRotY = 0;
      if (shineEl) {
        shineEl.style.opacity = "0";
      }
      if (!rafId) {
        rafId = requestAnimationFrame(updateMotion);
      }
    };

    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerenter", handlePointerEnter);
    el.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerenter", handlePointerEnter);
      el.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [maxRotation, perspective, enableShine]);

  return ref;
}
