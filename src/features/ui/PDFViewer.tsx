import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from '../../components/icons';
import styles from './PDFViewer.module.css';

// Set watcher for pdf
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
    fileUrl: string;
    fileName: string;
    onClose: () => void;
}

export const PDFViewer = ({ fileUrl, fileName, onClose }: PDFViewerProps) => {
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
    }

    const changePage = (offset: number) => {
        setPageNumber(prevPageNumber => prevPageNumber + offset);
    };

    const previousPage = () => changePage(-1);
    const nextPage = () => changePage(1);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.container} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>{fileName}</h3>
                    <div className={styles.controls}>
                        <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className={styles.controlBtn}>
                            <ZoomOut size={20} />
                        </button>
                        <span className={styles.scaleText}>{Math.round(scale * 100)}%</span>
                        <button onClick={() => setScale(s => Math.min(2.5, s + 0.1))} className={styles.controlBtn}>
                            <ZoomIn size={20} />
                        </button>
                        <div className={styles.divider} />
                        <button disabled={pageNumber <= 1} onClick={previousPage} className={styles.controlBtn}>
                            <ChevronLeft size={20} />
                        </button>
                        <span className={styles.pageInfo}>
                            {pageNumber} / {numPages || '--'}
                        </span>
                        <button disabled={pageNumber >= (numPages || 1)} onClick={nextPage} className={styles.controlBtn}>
                            <ChevronRight size={20} />
                        </button>
                        <div className={styles.divider} />
                        <button onClick={onClose} className={styles.closeBtn}>
                            <X size={20} />
                        </button>
                    </div>
                </div>
                <div className={styles.content}>
                    <Document
                        file={fileUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        className={styles.document}
                    >
                        <Page
                            pageNumber={pageNumber}
                            scale={scale}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                        />
                    </Document>
                </div>
            </div>
        </div>
    );
};
