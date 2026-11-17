import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Retain the last visible content until its exit finishes, including when a request clears it. */
export function NoticePresence({ visible, children, className = '' }: { visible: boolean; children: ReactNode; className?: string }) {
  const [content, setContent] = useState(visible ? children : null);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (visible) setContent(children);
  }, [visible, children]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !visible) return;
    // Absorb the surrounding gap while folding, so neighbouring content moves continuously.
    if (!getComputedStyle(node).getPropertyValue('--notice-gap').trim()) {
      const parentGap = node.parentElement ? getComputedStyle(node.parentElement).rowGap : '0px';
      node.style.setProperty('--notice-gap', parentGap !== 'normal' ? parentGap : '0px');
    }
  }, [visible, content !== null]);

  useEffect(() => {
    if (visible || content === null) return;
    // Also finishes exits when a transition is interrupted or the browser skips transitionend.
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400;
    const timer = setTimeout(() => setContent(null), duration);
    return () => clearTimeout(timer);
  }, [visible, content]);

  if (content === null) return null;
  return (
    <div ref={ref} className={`notice-motion min-w-0 ${className}`} data-leaving={!visible || undefined} aria-hidden={!visible || undefined} inert={!visible}
      onTransitionEnd={(event) => {
        if (!visible && event.target === event.currentTarget && event.propertyName === 'grid-template-rows') setContent(null);
      }}>
      <div className="min-h-0 overflow-hidden">{content}</div>
    </div>
  );
}
