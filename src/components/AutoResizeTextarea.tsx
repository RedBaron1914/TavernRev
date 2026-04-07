import React, { useRef, useLayoutEffect } from 'react';

interface Props extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

export const AutoResizeTextarea: React.FC<Props> = ({ value, className, ...props }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (node) {
      // Save cursor position
      const selectionStart = node.selectionStart;
      const selectionEnd = node.selectionEnd;

      // Find the nearest scrollable parent to freeze its scroll position
      let scrollParent: HTMLElement | null = node.parentElement;
      while (scrollParent) {
        if (scrollParent.scrollHeight > scrollParent.clientHeight && 
           (window.getComputedStyle(scrollParent).overflowY === 'auto' || window.getComputedStyle(scrollParent).overflowY === 'scroll')) {
          break;
        }
        scrollParent = scrollParent.parentElement;
      }
      
      const prevScrollTop = scrollParent ? scrollParent.scrollTop : window.scrollY;

      node.style.overflow = 'hidden';
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
      node.style.overflow = 'auto';

      // Restore scroll position to prevent jumping
      if (scrollParent) {
        scrollParent.scrollTop = prevScrollTop;
      } else {
        window.scrollTo(window.scrollX, prevScrollTop);
      }
      
      // Attempt to restore cursor if it was lost
      if (document.activeElement === node) {
          node.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      className={`${className} resize-none custom-scrollbar`}
      rows={1}
      {...props}
    />
  );
};
