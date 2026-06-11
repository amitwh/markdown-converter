import { useAppStore } from '@/stores/app-store';
import { AboutDialog } from './AboutDialog';
import { AsciiGeneratorDialog } from './AsciiGeneratorDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { CrashReportModal } from './CrashReportModal';
import { ExportBatchDialog } from './ExportBatchDialog';
import { ExportDocxDialog } from './ExportDocxDialog';
import { ExportHtmlDialog } from './ExportHtmlDialog';
import { ExportPdfDialog } from './ExportPdfDialog';
import { FindInFilesDialog } from './FindInFilesDialog';
import { SettingsSheet } from './SettingsSheet';
import { TableGeneratorDialog } from './TableGeneratorDialog';
import { WelcomeDialog } from './WelcomeDialog';
import { WordExportDialog } from './WordExportDialog';
import { WritingAnalyticsDialog } from './WritingAnalyticsDialog';

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
    case 'export-word':
      return <WordExportDialog sourcePath={modal.props.sourcePath} />;
    case 'ascii-generator':
      return <AsciiGeneratorDialog />;
    case 'table-generator':
      return <TableGeneratorDialog />;
    case 'find-in-files':
      return <FindInFilesDialog />;
    case 'crashReports':
      return <CrashReportModal onClose={useAppStore.getState().closeModal} />;
    case 'writing-analytics':
      return <WritingAnalyticsDialog />;
  }
}
