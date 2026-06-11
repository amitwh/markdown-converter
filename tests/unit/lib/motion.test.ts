import { describe, it, expect } from 'vitest';
import { fadeIn, slideInRight, modalPop, toastSpring, sidebarToggle } from '@/lib/motion';

describe('motion presets', () => {
  it('fadeIn is a valid transition object', () => {
    expect(fadeIn.duration).toBeGreaterThan(0);
    expect(fadeIn.ease).toBeDefined();
  });

  it('slideInRight uses translateX transform', () => {
    expect(slideInRight.x).toBe('100%');
  });

  it('modalPop uses scale and opacity', () => {
    expect(modalPop.scale).toBeDefined();
    expect(modalPop.opacity).toBeDefined();
  });

  it('toastSpring has spring physics', () => {
    expect(toastSpring.type).toBe('spring');
  });

  it('sidebarToggle animates width', () => {
    expect(sidebarToggle.width.duration).toBeGreaterThan(0);
  });
});
