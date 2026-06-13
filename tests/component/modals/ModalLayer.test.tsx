import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModalLayer } from '@/components/modals/ModalLayer';
import { useAppStore } from '@/stores/app-store';

describe('ModalLayer', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ modal: { kind: null } } as any);
  });

  it('renders nothing when modal is null', () => {
    const { container } = render(<ModalLayer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders AboutDialog when kind is "about"', () => {
    useAppStore.getState().openModal('about');
    render(<ModalLayer />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('switches from about to settings when modal kind changes', () => {
    useAppStore.getState().openModal('about');
    const { rerender } = render(<ModalLayer />);
    expect(screen.getByText(/about markdownconverter/i)).toBeInTheDocument();
    useAppStore.getState().openModal('settings');
    rerender(<ModalLayer />);
    expect(screen.queryByText(/about markdownconverter/i)).not.toBeInTheDocument();
    expect(screen.getByText(/settings/i)).toBeInTheDocument();
  });

  it('renders BatchMediaConverterDialog when kind is "batch-media-converter"', () => {
    useAppStore.getState().openModal('batch-media-converter');
    render(<ModalLayer />);
    expect(screen.getByText(/batch media converter/i)).toBeInTheDocument();
  });
});
