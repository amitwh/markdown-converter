import { toast as sonnerToast } from 'sonner';

/**
 * Typed wrappers over sonner's toast API. Centralizing the import gives us
 * a single surface to evolve (e.g., add brand colors, action buttons,
 * analytics) without touching every call site.
 */
export const toast = {
  success: (message: string) => sonnerToast.success(message),
  error: (message: string) => sonnerToast.error(message),
  info: (message: string) => sonnerToast.info(message),
  warning: (message: string) => sonnerToast.warning(message),
  promise: <T>(
    promise: Promise<T>,
    msgs: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    }
  ) => sonnerToast.promise(promise, msgs),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};
