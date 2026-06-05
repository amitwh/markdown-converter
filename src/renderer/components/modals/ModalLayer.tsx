import { useAppStore } from '@/stores/app-store';
import { AboutDialog } from './AboutDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { ExportBatchDialog } from './ExportBatchDialog';
import { ExportDocxDialog } from './ExportDocxDialog';
import { ExportHtmlDialog } from './ExportHtmlDialog';
import { ExportPdfDialog } from './ExportPdfDialog';
import { SettingsSheet } from './SettingsSheet';
import { WelcomeDialog } from './WelcomeDialog';

export function ModalLayer() {
  const modal = useAppStore((s) => s.modal);
  switch (modal.kind) {
    case null:
      return null;
    case 'export-pdf':
      return <ExportPdfDialog sourcePath={modal.props.sourcePath} />;
    case 'export-docx':
      return <ExportDocxDialog sourcePath={modal.props.sourcePath} />;
    case 'export-html':
      return <ExportHtmlDialog sourcePath={modal.props.sourcePath} />;
    case 'export-batch':
      return <ExportBatchDialog sourcePaths={modal.props.sourcePaths} />;
    case 'settings':
      return <SettingsSheet />;
    case 'about':
      return <AboutDialog />;
    case 'welcome':
      return <WelcomeDialog />;
    case 'confirm':
      return <ConfirmDialog {...modal.props} />;
  }
}