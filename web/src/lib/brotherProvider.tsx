import { pdf } from '@react-pdf/renderer';
import React from 'react';
import BrotherPdfDocument from '@/app/reports/BrotherPdfDocument';

/**
 * BrotherProvider - Specialized driver for Brother PT-E550W and similar raster printers.
 * Generates high-DPI bitmaps (300dpi) instead of standard PDFs for pixel-perfect printing.
 * Uses a PDF wrapper to ensure the browser print engine respects the dimensions.
 */
export class BrotherProvider {
    static async generateLabels(items: any[], tapeWidth: 18 | 24) {
        const response = await fetch('/api/labels/brother', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, tape_width: tapeWidth })
        });

        if (!response.ok) {
            throw new Error('Failed to generate Brother labels');
        }

        const data = await response.json();
        return data.items; // Array of { pngBase64, width_px, height_px }
    }

    static async printLabels(items: any[], tapeWidth: 18 | 24) {
        try {
            const labels = await this.generateLabels(items, tapeWidth);
            if (!labels || labels.length === 0) return;

            // Generate a PDF blob using our specialized Brother template
            // This is the most robust way to ensure physical dimensions are respected
            const doc = React.createElement(BrotherPdfDocument, { items: labels });
            const blob = await (pdf as any)(doc).toBlob();

            const url = URL.createObjectURL(blob);
            const printWindow = window.open(url, '_blank');
            
            // We don't try to auto-print for PDF blobs as it's often blocked
            // The user will see the PDF with perfect dimensions and can click print.
            
            if (!printWindow) {
                // Fallback for popup blockers: trigger download
                const link = document.createElement('a');
                link.href = url;
                link.download = `brother_labels_${Date.now()}.pdf`;
                link.click();
            }
        } catch (error) {
            console.error('Brother printing error:', error);
            alert('Błąd podczas przygotowywania wydruku Brother.');
        }
    }
}
