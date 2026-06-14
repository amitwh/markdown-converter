import { useAppStore } from '@/stores/app-store';
import { AboutDialog } from './AboutDialog';
import { BatchMediaConverterDialog } from './BatchMediaConverterDialog';
import { AsciiGeneratorDialog } from './AsciiGeneratorDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { CrashReportModal } from './CrashReportModal';
import { ExportBatchDialog } from './ExportBatchDialog';
import { ExportDocxDialog } from './ExportDocxDialog';
import { ExportHtmlDialog } from './ExportHtmlDialog';
import { ExportPdfDialog } from './ExportPdfDialog';
import { ExportRevealjsDialog } from './ExportRevealjsDialog';
import { FindInFilesDialog } from './FindInFilesDialog';
import { HeaderFooterDialog } from './HeaderFooterDialog';
import { SettingsSheet } from './SettingsSheet';
import { TableGeneratorDialog } from './TableGeneratorDialog';
import { UniversalConverterDialog } from './UniversalConverterDialog';
import { WelcomeDialog } from './WelcomeDialog';
import { WordExportDialog } from './WordExportDialog';
import { WritingAnalyticsDialog } from './WritingAnalyticsDialog';
import { PdfEditorDialog } from './PdfEditorDialog';

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
    case 'export-revealjs':
      return <ExportRevealjsDialog sourcePath={modal.props.sourcePath} />;
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
    case 'pdf-editor':
      return (
        <PdfEditorDialog
          onClose={useAppStore.getState().closeModal}
          initialFilePath={modal.props?.filePath}
        />
      );
    case 'universal-converter':
      return <UniversalConverterDialog />;
    case 'header-footer':
      return <HeaderFooterDialog />;
    case 'batch-media-converter':
      return <BatchMediaConverterDialog />;
  }
}
