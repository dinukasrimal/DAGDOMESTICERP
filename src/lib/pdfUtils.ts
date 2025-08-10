
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import 'jspdf-autotable';

export const downloadElementAsPdf = async (elementId: string, fileName: string): Promise<void> => {
  const input = document.getElementById(elementId);
  if (!input) {
    console.error(`Element with ID ${elementId} not found.`);
    return;
  }

  try {
    const canvas = await html2canvas(input, { scale: 2 }); // Increase scale for better quality
    const imgData = canvas.toDataURL('image/png');
    
    const pdf = new jsPDF({
      orientation: 'landscape', // 'portrait' or 'landscape'
      unit: 'pt', // points, pixels won't work well
      format: 'a4',
    });

    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    // Calculate the aspect ratio
    const imgWidth = imgProps.width;
    const imgHeight = imgProps.height;
    const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);

    // Calculate the new dimensions for the image to fit within the PDF page
    const newImgWidth = imgWidth * ratio;
    const newImgHeight = imgHeight * ratio;

    // Calculate position to center the image (optional)
    const x = (pdfWidth - newImgWidth) / 2;
    const y = (pdfHeight - newImgHeight) / 2;

    pdf.addImage(imgData, 'PNG', x, y, newImgWidth, newImgHeight);
    pdf.save(`${fileName}.pdf`);
  } catch (error) {
    console.error('Error generating PDF:', error);
  }
};

// Type definitions for jspdf-autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export const generatePlanningReportPdf = async (
  data: any[],
  selectedMonths: string,
  salesQtyPercent: number,
  categoryFilters: string[]
): Promise<void> => {
  try {
    console.log('Starting PDF generation with data:', data.length, 'categories');
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    console.log('PDF instance created successfully');

    // Title and header
    pdf.setFontSize(18);
    pdf.text(`${selectedMonths} Month Planning Analysis`, 20, 20);
    
    pdf.setFontSize(10);
    pdf.text(`Complete inventory planning report | Generated on ${new Date().toLocaleDateString()}`, 20, 30);
    pdf.text(`Sales Qty Adjustment: ${salesQtyPercent > 0 ? '+' : ''}${salesQtyPercent}%`, 20, 35);
    pdf.text(`Filters: ${categoryFilters.length === 0 ? 'All categories' : `${categoryFilters.length} categories selected`}`, 20, 40);
    
    console.log('PDF header added successfully');

    let yPosition = 50;

    // Generate tables for each category
    data.forEach((categoryData, categoryIndex) => {
      const { category, products } = categoryData;
      
      // Category header
      if (yPosition > 250) { // Check if we need a new page
        pdf.addPage();
        yPosition = 20;
      }
      
      pdf.setFontSize(14);
      pdf.setFillColor(59, 130, 246); // Blue background
      pdf.setTextColor(255, 255, 255); // White text
      pdf.rect(20, yPosition - 5, 170, 8, 'F');
      pdf.text(category, 22, yPosition);
      
      pdf.setTextColor(0, 0, 0); // Reset to black
      yPosition += 15;
      
      // Summary info
      pdf.setFontSize(9);
      const planningCount = products.filter((p: any) => p.needsPlanning > 0).length;
      pdf.text(`${products.length} products | ${planningCount} requiring planning`, 22, yPosition);
      yPosition += 10;

      // Table data
      const tableData = products.map((product: any) => [
        product.product_name,
        product.quantity_on_hand.toString(),
        product.salesQty.toString(),
        product.availableIncoming.toString(),
        product.stockWithIncoming.toString(),
        product.needsPlanning > 0 ? product.needsPlanning.toString() : 'OK'
      ]);

      console.log(`Generating table for category: ${category} with ${products.length} products`);
      console.log('Table data sample:', tableData.slice(0, 2));
      
      try {
        // Generate table with autoTable
        (pdf as any).autoTable({
          startY: yPosition,
          head: [['Product Name', 'Current Stock', `Sales Qty (${selectedMonths}M)`, 'Incoming', 'Stock + Incoming', 'Needs Planning']],
          body: tableData,
          theme: 'striped',
          styles: {
            fontSize: 8,
            cellPadding: 3,
            overflow: 'linebreak',
            valign: 'middle',
          },
          headStyles: {
            fillColor: [75, 85, 99], // Gray background
            textColor: [255, 255, 255], // White text
            fontStyle: 'bold',
            halign: 'center',
          },
          columnStyles: {
            0: { cellWidth: 60, halign: 'left' }, // Product Name
            1: { cellWidth: 25, halign: 'right' }, // Current Stock
            2: { cellWidth: 25, halign: 'right' }, // Sales Qty
            3: { cellWidth: 25, halign: 'right' }, // Incoming
            4: { cellWidth: 25, halign: 'right' }, // Stock + Incoming
            5: { cellWidth: 25, halign: 'right' }, // Needs Planning
          },
          didParseCell: function (data: any) {
            // Highlight rows that need planning
            const rowIndex = data.row.index;
            if (data.row.section === 'body' && products[rowIndex]?.needsPlanning > 0) {
              if (data.column.index === 5) { // Needs Planning column
                data.cell.styles.textColor = [220, 38, 38]; // Red text
                data.cell.styles.fontStyle = 'bold';
              }
              data.cell.styles.fillColor = [254, 242, 242]; // Light red background
            }
          },
          margin: { left: 15, right: 15 },
          pageBreak: 'auto',
          rowPageBreak: 'avoid',
        });

        yPosition = (pdf as any).lastAutoTable.finalY + 15;
        console.log('Table generated successfully, new yPosition:', yPosition);
        
      } catch (error) {
        console.error('Error generating autoTable, using fallback:', error);
        
        // Fallback: Create manual table
        pdf.setFontSize(8);
        let textY = yPosition;
        
        // Draw table border
        pdf.setLineWidth(0.5);
        pdf.rect(15, textY - 5, 180, 10); // Header box
        
        // Header
        pdf.setFillColor(75, 85, 99);
        pdf.rect(15, textY - 5, 180, 10, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.text('Product Name', 17, textY);
        pdf.text('Stock', 80, textY);
        pdf.text('Sales', 105, textY);
        pdf.text('Incoming', 130, textY);
        pdf.text('Planning', 165, textY);
        
        pdf.setTextColor(0, 0, 0);
        textY += 15;
        
        // Products rows
        products.forEach((product: any, index: number) => {
          // Alternate row colors
          if (index % 2 === 0) {
            pdf.setFillColor(249, 250, 251);
            pdf.rect(15, textY - 5, 180, 10, 'F');
          }
          
          // Highlight planning needed
          if (product.needsPlanning > 0) {
            pdf.setFillColor(254, 242, 242);
            pdf.rect(15, textY - 5, 180, 10, 'F');
          }
          
          // Product data
          pdf.text(product.product_name.substring(0, 25), 17, textY);
          pdf.text(product.quantity_on_hand.toString(), 80, textY);
          pdf.text(product.salesQty.toString(), 105, textY);
          pdf.text(product.availableIncoming.toString(), 130, textY);
          
          if (product.needsPlanning > 0) {
            pdf.setTextColor(220, 38, 38);
            pdf.text(product.needsPlanning.toString(), 165, textY);
            pdf.setTextColor(0, 0, 0);
          } else {
            pdf.text('OK', 165, textY);
          }
          
          textY += 10;
          
          if (textY > 270) { // Check for page break
            pdf.addPage();
            textY = 20;
          }
        });
        
        // Draw table border
        pdf.setLineWidth(0.5);
        pdf.rect(15, yPosition - 5, 180, textY - yPosition + 5);
        
        yPosition = textY + 10;
      }

      // Category summary (common for both autoTable and fallback)
      const totalPlanning = products.reduce((sum: number, p: any) => sum + p.needsPlanning, 0);
      const totalSales = products.reduce((sum: number, p: any) => sum + p.salesQty, 0);
      
      pdf.setFontSize(8);
      pdf.setFillColor(249, 250, 251); // Light gray background
      pdf.rect(20, yPosition, 170, 10, 'F');
      pdf.text(`Summary: ${products.length} products | ${totalPlanning} total planning needed | ${totalSales} total sales forecast`, 22, yPosition + 6);
      
      yPosition += 20;
    });

    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(107, 114, 128); // Gray text
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.text('Note: This report shows products that require planning based on sales forecast.', 20, pageHeight - 20);
    pdf.text('Only purchase orders not on hold are included in incoming calculations.', 20, pageHeight - 15);

    console.log('PDF content generation completed, starting download...');
    
    const fileName = `${selectedMonths}_Month_Planning_Analysis.pdf`;
    console.log('Downloading PDF as:', fileName);
    
    pdf.save(fileName);
    
    console.log('PDF download initiated successfully');
  } catch (error) {
    console.error('Error generating planning report PDF:', error);
    throw error; // Re-throw so calling code can handle it
  }
};
