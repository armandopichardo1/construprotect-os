import { useRef, useState, useCallback, type ReactNode, type TouchEvent } from 'react';
import { cn } from '@/lib/utils';

export interface SwipeAction {
  icon: ReactNode;
  label: string;
  color: string; // tailwind bg class e.g. 'bg-destructive'
  textColor?: string;
  onClick: () => void;
}

interface SwipeableRowProps {
  children: ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  className?: string;
  threshold?: number;
}

const ACTION_WIDTH = 72; // px per action button

export function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
  className,
  threshold = 40,
}: SwipeableRowProps) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const locked = useRef(false); // axis lock
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const maxLeft = leftActions.length * ACTION_WIDTH;
  const maxRight = rightActions.length * ACTION_WIDTH;

  const onTouchStart = useCallback((e: TouchEvent) => {
    setTransitioning(false);
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = offset;
    swiping.current = true;
    locked.current = false;
  }, [offset]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!swiping.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Lock axis after small movement
    if (!locked.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      locked.current = true;
      if (Math.abs(dy) > Math.abs(dx)) {
        // Vertical scroll - bail
        swiping.current = false;
        return;
      }
    }
    if (!locked.current) return;

    // Prevent vertical scroll while swiping horizontally
    e.preventDefault();

    let raw = currentX.current + dx;
    // Clamp
    if (leftActions.length === 0 && raw > 0) raw = 0;
    if (rightActions.length === 0 && raw < 0) raw = 0;
    raw = Math.max(-maxRight, Math.min(maxLeft, raw));
    // Rubber-band beyond max
    setOffset(raw);
  }, [leftActions.length, rightActions.length, maxLeft, maxRight]);

  const onTouchEnd = useCallback(() => {
    swiping.current = false;
    setTransitioning(true);

    // Snap to open or closed
    if (offset > threshold && leftActions.length > 0) {
      setOffset(maxLeft);
    } else if (offset < -threshold && rightActions.length > 0) {
      setOffset(-maxRight);
    } else {
      setOffset(0);
    }
  }, [offset, threshold, leftActions.length, rightActions.length, maxLeft, maxRight]);

  const close = useCallback(() => {
    setTransitioning(true);
    setOffset(0);
  }, []);

  const handleAction = (action: SwipeAction) => {
    close();
    // Small delay so animation finishes
    setTimeout(() => action.onClick(), 200);
  };

  return (
    <div className={cn('relative overflow-hidden md:overflow-visible', className)}>
      {/* Left actions (revealed when swiping right) */}
      {leftActions.length > 0 && (
        <div className="absolute inset-y-0 left-0 flex md:hidden" style={{ width: maxLeft }}>
          {leftActions.map((action, i) => (
            <button
              key={i}
              onClick={() => handleAction(action)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 text-[9px] font-medium',
                action.color, action.textColor || 'text-white'
              )}
              style={{ width: ACTION_WIDTH }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Right actions (revealed when swiping left) */}
      {rightActions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex md:hidden" style={{ width: maxRight }}>
          {rightActions.map((action, i) => (
            <button
              key={i}
              onClick={() => handleAction(action)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 text-[9px] font-medium',
                action.color, action.textColor || 'text-white'
              )}
              style={{ width: ACTION_WIDTH }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Main content */}
      <div
        className={cn('relative bg-card z-10', transitioning && 'transition-transform duration-200 ease-out')}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>

      {/* Tap overlay to close when open */}
      {offset !== 0 && (
        <div
          className="absolute inset-0 z-20 md:hidden"
          onClick={close}
          onTouchStart={close}
        />
      )}
    </div>
  );
}
