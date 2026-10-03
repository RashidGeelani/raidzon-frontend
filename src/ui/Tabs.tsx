import { useEffect, useRef, useState } from 'react';

/**
 * Underlined tab strip. Scrolls sideways when the tabs do not fit, with a fade on the side
 * that has more tabs so people can tell there is more.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className = '',
}: {
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const update = () =>
      setMore({
        start: element.scrollLeft > 2,
        end: element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
      });
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [items.length]);
  // Keep the selected tab in view when it changes.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value]);
  return (
    <div className="ui-tabs-wrap" data-more-start={more.start || undefined} data-more-end={more.end || undefined}>
      <div ref={strip} className={`list-filter-tabs ${className}`} role="tablist" aria-label={label}>
        {items.map((item) => (
          <button
            type="button"
            role="tab"
            key={item.value}
            aria-selected={value === item.value}
            className={value === item.value ? 'active' : ''}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
