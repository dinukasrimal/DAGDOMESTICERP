import jsPDF from 'jspdf';
import { shareOrDownloadPdf } from '@/lib/pdfUtils';

interface TargetData {
  product_category: string;
  quantity: number;
  value: number;
  initial_quantity?: number;
  initial_value?: number;
}

interface SavedTarget {
  id: string;
  customer_name: string;
  target_year: string;
  target_months: string[];
  base_year: string;
  target_data: TargetData[];
  initial_total_qty: number;
  initial_total_value: number;
  adjusted_total_qty: number;
  adjusted_total_value: number;
  percentage_increase: number;
  created_at: string;
}

const months = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export const generateTargetPDF = async (target: SavedTarget): Promise<void> => {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  let currentY = margin;

  // Helper function to add text with automatic wrapping
  const addText = (text: string, x: number, y: number, fontSize: number = 10, fontStyle: string = 'normal'): number => {
    pdf.setFontSize(fontSize);
    pdf.setFont(undefined, fontStyle);
    const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin);
    pdf.text(lines, x, y);
    return y + (lines.length * fontSize * 0.6);
  };

  // Helper function to check if we need a new page
  const checkNewPage = (requiredHeight: number): number => {
    if (currentY + requiredHeight > pageHeight - margin) {
      pdf.addPage();
      return margin;
    }
    return currentY;
  };

  // Company Header
  pdf.setFillColor(59, 130, 246); // Blue color
  pdf.rect(0, 0, pageWidth, 40, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(20);
  pdf.setFont(undefined, 'bold');
  pdf.text('Sales Target Report', margin, 25);
  
  // Reset text color
  pdf.setTextColor(0, 0, 0);
  currentY = 50;

  // Target Header Information
  currentY = addText(`Customer: ${target.customer_name}`, margin, currentY, 16, 'bold');
  currentY = addText(`Target Year: ${target.target_year}`, margin, currentY + 5, 14, 'bold');
  currentY = addText(`Base Year: ${target.base_year}`, margin, currentY + 5, 12);
  
  // Target Months
  const monthNames = target.target_months
    .map(value => months.find(m => m.value === value)?.label)
    .filter(Boolean)
    .join(', ');
  currentY = addText(`Target Months: ${monthNames}`, margin, currentY + 5, 12);
  currentY += 10;

  // Summary Section
  currentY = checkNewPage(50);
  pdf.setFillColor(248, 250, 252); // Light gray
  pdf.rect(margin, currentY, pageWidth - 2 * margin, 40, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.rect(margin, currentY, pageWidth - 2 * margin, 40, 'S');
  
  currentY = addText('TARGET SUMMARY', margin + 10, currentY + 15, 14, 'bold');
  const summaryLeftCol = margin + 10;
  const summaryRightCol = pageWidth / 2 + 10;
  
  let summaryY = currentY + 5;
  summaryY = addText(`Target Quantity: ${target.adjusted_total_qty.toLocaleString()}`, summaryLeftCol, summaryY, 12, 'bold');
  
  summaryY = currentY + 5;
  summaryY = addText(`Target Value: LKR ${Math.round(target.adjusted_total_value).toLocaleString()}`, summaryRightCol, summaryY, 12, 'bold');
  
  currentY += 50;

  // Monthly Breakdown Section
  currentY = checkNewPage(100);
  currentY = addText('MONTHLY BREAKDOWN', margin, currentY, 14, 'bold');
  currentY += 10;

  // Calculate monthly breakdown
  const monthCount = target.target_months.length;
  const monthlyQty = Math.round(target.adjusted_total_qty / monthCount);
  const monthlyValue = Math.round(target.adjusted_total_value / monthCount);

  // Create table for monthly breakdown
  const tableStartY = currentY;
  const colWidth = (pageWidth - 2 * margin) / 3;
  
  // Table headers
  pdf.setFillColor(59, 130, 246);
  pdf.rect(margin, currentY, pageWidth - 2 * margin, 15, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont(undefined, 'bold');
  pdf.text('Month', margin + 5, currentY + 10);
  pdf.text('Target Quantity', margin + colWidth + 5, currentY + 10);
  pdf.text('Target Value (LKR)', margin + 2 * colWidth + 5, currentY + 10);
  
  // Reset text color
  pdf.setTextColor(0, 0, 0);
  currentY += 15;

  // Monthly data rows
  target.target_months.forEach((monthValue, index) => {
    const monthName = months.find(m => m.value === monthValue)?.label || monthValue;
    const isLastMonth = index === target.target_months.length - 1;
    
    // Calculate quantities for this month (ensure total adds up correctly)
    let thisMonthQty = monthlyQty;
    let thisMonthValue = monthlyValue;
    
    if (isLastMonth) {
      // Adjust last month to ensure total adds up exactly
      const totalSoFar = monthlyQty * (monthCount - 1);
      const valueSoFar = monthlyValue * (monthCount - 1);
      thisMonthQty = target.adjusted_total_qty - totalSoFar;
      thisMonthValue = target.adjusted_total_value - valueSoFar;
    }

    currentY = checkNewPage(20);
    
    // Alternate row colors
    if (index % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, currentY, pageWidth - 2 * margin, 15, 'F');
    }
    
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.text(monthName, margin + 5, currentY + 10);
    pdf.text(thisMonthQty.toLocaleString(), margin + colWidth + 5, currentY + 10);
    pdf.text(Math.round(thisMonthValue).toLocaleString(), margin + 2 * colWidth + 5, currentY + 10);
    
    currentY += 15;
  });

  // Total row
  pdf.setFillColor(34, 197, 94); // Green color
  pdf.rect(margin, currentY, pageWidth - 2 * margin, 15, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont(undefined, 'bold');
  pdf.text('TOTAL', margin + 5, currentY + 10);
  pdf.text(target.adjusted_total_qty.toLocaleString(), margin + colWidth + 5, currentY + 10);
  pdf.text(Math.round(target.adjusted_total_value).toLocaleString(), margin + 2 * colWidth + 5, currentY + 10);
  
  currentY += 25;

  // Category Breakdown Section
  currentY = checkNewPage(100);
  pdf.setTextColor(0, 0, 0);
  currentY = addText('CATEGORY BREAKDOWN', margin, currentY, 14, 'bold');
  currentY += 10;

  // Category table headers
  pdf.setFillColor(59, 130, 246);
  pdf.rect(margin, currentY, pageWidth - 2 * margin, 15, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont(undefined, 'bold');
  pdf.text('Product Category', margin + 5, currentY + 10);
  pdf.text('Target Quantity', margin + colWidth + 5, currentY + 10);
  pdf.text('Target Value (LKR)', margin + 2 * colWidth + 5, currentY + 10);
  
  // Reset text color
  pdf.setTextColor(0, 0, 0);
  currentY += 15;

  // Category data rows
  target.target_data.forEach((item, index) => {
    currentY = checkNewPage(20);
    
    // Alternate row colors
    if (index % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, currentY, pageWidth - 2 * margin, 15, 'F');
    }
    
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.text(item.product_category, margin + 5, currentY + 10);
    pdf.text(item.quantity.toLocaleString(), margin + colWidth + 5, currentY + 10);
    pdf.text(Math.round(item.value).toLocaleString(), margin + 2 * colWidth + 5, currentY + 10);
    
    currentY += 15;
  });

  // Footer
  currentY = checkNewPage(40);
  currentY = pageHeight - 30;
  pdf.setFillColor(59, 130, 246);
  pdf.rect(0, currentY, pageWidth, 30, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, margin, currentY + 15);
  pdf.text('Flow Planner - Sales Target Management System', margin, currentY + 22);

  // Save the PDF
  const fileName = `Target_${target.customer_name}_${target.target_year}.pdf`;
  await shareOrDownloadPdf(pdf, fileName, {
    title: `Target ${target.customer_name}`,
    text: `${target.customer_name} sales target ${target.target_year}`,
  });
};
