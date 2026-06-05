import type { Transition, Variants } from 'motion/react';

export const fadeIn: Transition = {
  duration: 0.2,
  ease: 'easeOut',
};

export const slideInRight: Variants = {
  x: '100%',
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } },
};

export const modalPop: Variants = {
  scale: 0.96,
  opacity: 0,
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { scale: 0.96, opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
};

export const toastSpring: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
};

export const sidebarToggle: Transition = {
  duration: 0.25,
  ease: 'easeInOut',
  width: {
    duration: 0.25,
    ease: 'easeInOut',
  },
};

export const tabSwitch: Transition = {
  duration: 0.2,
  ease: 'easeOut',
};
