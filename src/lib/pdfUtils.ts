
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import type { GoodsIssue } from '@/services/goodsIssueService';

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
        autoTable(pdf, {
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

// (generateGoodsIssuePdf detailed version defined below)

export const generateGoodsIssuePdf = (
  issue: GoodsIssue,
  supplierName?: string,
  issuedSoFarByMaterial?: Record<string, number>,
  materialNameById?: Record<string, string>,
  categoryNameById?: Record<string, string>,
  categoryRequirementByName?: Record<string, number>,
  weightKgByMaterial?: Record<string, number>
) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // Optional: parse embedded category totals from issue notes for post-refresh accuracy
  const parsedCategoryTotals: Record<string, number> = {};
  const normalize = (s: string) => {
    const t = (s || '').toString().toLowerCase();
    return t
      .replace(/^📁\s*/, '')
      .replace(/\(category\)/g, '')
      .replace(/category$/g, '')
      .replace(/[^a-z0-9&]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  try {
    const notes = (issue.notes || '').toString();
    const m = notes.match(/CATEGORY_TOTALS\s*:\s*([^\n]+)/i);
    if (m && m[1]) {
      const parts = m[1].split(/[;|]/);
      for (const p of parts) {
        const kv = p.split('=');
        if (kv.length === 2) {
          const key = kv[0].trim();
          const val = parseFloat(kv[1]);
          if (key && !isNaN(val)) parsedCategoryTotals[key] = val;
        }
      }
    }
  } catch {}

  // Build normalized lookup maps
  const normalizedExplicit: Record<string, number> = {};
  if (categoryRequirementByName) {
    for (const [k, v] of Object.entries(categoryRequirementByName)) {
      normalizedExplicit[normalize(k)] = Number(v || 0);
    }
  }
  const normalizedParsed: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsedCategoryTotals)) {
    normalizedParsed[normalize(k)] = Number(v || 0);
  }

  // Header band with company name
  pdf.setFillColor(239, 68, 68); // red
  pdf.rect(0, 0, pageWidth, 38, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont(undefined, 'bold');
  pdf.text('DAG Clothing Pvt Ltd', margin, 14);
  pdf.setFontSize(18);
  pdf.text('GOODS ISSUE NOTE', margin, 28);

  // Reset
  pdf.setTextColor(0, 0, 0);
  y = 45;

  // Header details
  const addRow = (label: string, value: string) => {
    pdf.setFontSize(11);
    pdf.setFont(undefined, 'bold');
    pdf.text(`${label}:`, margin, y);
    pdf.setFont(undefined, 'normal');
    pdf.text(value || '—', margin + 35, y);
    y += 7;
  };

  addRow('Issue No', issue.issue_number || '—');
  addRow('Issue Date', new Date(issue.issue_date).toLocaleDateString());
  addRow('Type', (issue.issue_type || '').toString());
  if (supplierName) addRow('Supplier', supplierName);
  if (issue.notes) addRow('Notes', issue.notes);

  y += 3;
  // Group lines by category
  type CatItem = { po: string, mat: string, matId: string, reqNum: number, reqStr: string, issuedSoFar: number, issuedQty: number, issuedKg: number };
  const groups = new Map<string, CatItem[]>();
  for (const l of (issue.lines || [])) {
    const idStr = String(l.raw_material_id);
    const cat = (categoryNameById && categoryNameById[idStr]) || 'Uncategorized';
    const matName = (materialNameById && materialNameById[idStr]) || l.raw_material?.name || idStr;
    const notesStr = (l.notes || '').toString();
    const reqMatch = notesStr.match(/Total required:\s*([\d.]+)/i);
    let kgVal = 0;
    const kgAlt = notesStr.match(/Issued via alt unit:\s*([\d.]+)\s*kg/i);
    const kgWeight = notesStr.match(/Weight\s*\(?(?:kg)?\)?\s*[:=]\s*([\d.]+)/i);
    if (kgAlt && kgAlt[1]) kgVal = parseFloat(kgAlt[1]) || 0;
    else if (kgWeight && kgWeight[1]) kgVal = parseFloat(kgWeight[1]) || 0;
    // Prefer explicit map passed in from DB rows if available
    if (weightKgByMaterial && Object.prototype.hasOwnProperty.call(weightKgByMaterial, idStr)) {
      const dbKg = Number(weightKgByMaterial[idStr] || 0);
      if (!isNaN(dbKg) && dbKg > 0) kgVal = dbKg;
    }
    const issuedKg = kgVal;
    const reqNum = reqMatch ? parseFloat(reqMatch[1]) || 0 : 0;
    const requirement = reqMatch ? reqMatch[1] : '-';
    const issuedSoFar = issuedSoFarByMaterial ? (issuedSoFarByMaterial[idStr] || 0) : 0;
    const issuedQty = Number(l.quantity_issued || 0);
    const item: CatItem = {
      po: issue.reference_number || '-',
      mat: matName,
      matId: idStr,
      reqNum,
      reqStr: requirement,
      issuedSoFar,
      issuedQty,
      issuedKg,
    };
    const arr = groups.get(cat) || [];
    arr.push(item);
    groups.set(cat, arr);
  }

  const head = [['PO Number', 'Material', 'Requirement', 'Issued So Far', 'Issued Qty', 'Issued Kg']];
  // Render each category section
  for (const [catName, items] of groups.entries()) {
    // Category header band
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(59, 130, 246);
    pdf.text(catName, margin, y);
    pdf.setTextColor(0, 0, 0);
    y += 6;

    // Category totals
    // Prefer explicit category requirement passed from the issue screen context
    // Try exact and normalized matches
    let explicitCategoryReq: number | undefined = undefined;
    if (categoryRequirementByName && Object.prototype.hasOwnProperty.call(categoryRequirementByName, catName)) {
      explicitCategoryReq = Number(categoryRequirementByName[catName] || 0);
    }
    if (explicitCategoryReq === undefined) {
      const kn = normalize(catName);
      if (Object.prototype.hasOwnProperty.call(normalizedExplicit, kn)) {
        explicitCategoryReq = Number(normalizedExplicit[kn] || 0);
      } else if (Object.prototype.hasOwnProperty.call(normalizedParsed, kn)) {
        explicitCategoryReq = Number(normalizedParsed[kn] || 0);
      }
    }
    const totalReq = explicitCategoryReq !== undefined
      ? explicitCategoryReq
      : items.reduce((s, it) => s + (it.reqNum || 0), 0);
    const totalIssuedKg = items.reduce((s, it) => s + (it.issuedKg || 0), 0);
    const totalIssuedSoFar = items.reduce((s, it) => s + (it.issuedSoFar || 0), 0);
    const balance = Math.max(0, totalReq - totalIssuedSoFar);
    pdf.setFontSize(9);
    pdf.text(`Totals — Requirement: ${totalReq.toLocaleString()}  |  Issued So Far: ${totalIssuedSoFar.toLocaleString()}  |  Balance: ${balance.toLocaleString()}  |  Total Kg: ${totalIssuedKg.toFixed(3)}`, margin, y);
    y += 5;

    const body = items.map(it => [it.po, it.mat, it.reqStr, it.issuedSoFar.toLocaleString(), it.issuedQty.toLocaleString(), (it.issuedKg || 0).toFixed(3)]);
    autoTable(pdf, {
      startY: y,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 25 }, // PO
        1: { cellWidth: 65 }, // Material
        2: { halign: 'right', cellWidth: 28 }, // Requirement
        3: { halign: 'right', cellWidth: 28 }, // Issued So Far
        4: { halign: 'right', cellWidth: 24 }, // Issued Qty
        5: { halign: 'right', cellWidth: 24 }, // Issued Kg
      },
      margin: { left: margin, right: margin },
    });
    // @ts-ignore
    y = (pdf as any).lastAutoTable?.finalY + 10;
  }

  const afterTableY = (pdf as any).lastAutoTable.finalY || y + 10;

  // Signature area
  const sigTop = afterTableY + 15;
  pdf.setFontSize(11);
  pdf.text('Authorized Signature:', margin, sigTop);
  pdf.line(margin + 45, sigTop, pageWidth - margin, sigTop);

  pdf.text('Name:', margin, sigTop + 12);
  pdf.line(margin + 15, sigTop + 12, pageWidth / 2, sigTop + 12);

  pdf.text('Date:', margin, sigTop + 24);
  pdf.line(margin + 15, sigTop + 24, pageWidth / 2, sigTop + 24);

  // Footer
  pdf.setFontSize(8);
  pdf.text(`Generated on ${new Date().toLocaleString()}`, margin, 290);

  pdf.save(`${issue.issue_number || 'Goods_Issue'}.pdf`);
};

type RequirementItem = {
  material_name: string;
  required_quantity: number;
  issued_so_far: number;
  unit: string;
  category_id?: number;
};

export const generateRequirementsPdf = (
  poNumber: string,
  requirements: RequirementItem[],
  supplierName?: string,
  bomName?: string
) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // Header band with company
  pdf.setFillColor(59, 130, 246); // blue
  pdf.rect(0, 0, pageWidth, 38, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont(undefined, 'bold');
  pdf.text('DAG Clothing Pvt Ltd', margin, 14);
  pdf.setFontSize(18);
  pdf.text('MATERIAL REQUIREMENTS', margin, 28);

  // Reset
  pdf.setTextColor(0, 0, 0);
  y = 45;
  pdf.setFontSize(11);
  pdf.text(`PO Number: ${poNumber}`, margin, y);
  if (supplierName) pdf.text(`Supplier: ${supplierName}`, margin + 80, y);
  if (bomName) pdf.text(`BOM: ${bomName}`, margin, y + 6);
  y += bomName ? 12 : 8;

  // Group by category (detect by prefix '📁 ')
  type CatGroup = { name: string, items: RequirementItem[] };
  const groupsMap = new Map<string, RequirementItem[]>();
  for (const r of requirements) {
    const isCat = r.material_name.startsWith('📁 ');
    const catName = isCat ? r.material_name.replace(/^📁\s*/, '').replace(/\s*\(Category\)\s*$/, '') : 'Materials';
    const arr = groupsMap.get(catName) || [];
    arr.push(r);
    groupsMap.set(catName, arr);
  }

  const head = [['Item', 'Requirement', 'Issued So Far', 'Balance']];
  for (const [catName, items] of groupsMap.entries()) {
    // Category title
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(59, 130, 246);
    pdf.text(catName, margin, y);
    pdf.setTextColor(0, 0, 0);
    y += 6;

    const body = items.map(r => {
      const isCat = r.material_name.startsWith('📁 ');
      const label = isCat ? catName : r.material_name;
      const req = Number(r.required_quantity || 0);
      const issued = Number(r.issued_so_far || 0);
      const bal = Math.max(0, req - issued);
      return [label, `${req.toFixed(3)} ${r.unit}`, `${issued.toFixed(3)} ${r.unit}`, `${bal.toFixed(3)} ${r.unit}`];
    });

    autoTable(pdf, {
      startY: y,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 80 }, // Item
        1: { halign: 'right', cellWidth: 35 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 35 },
      },
      margin: { left: margin, right: margin },
    });
    // @ts-ignore
    y = (pdf as any).lastAutoTable?.finalY + 10;
  }

  // Footer
  pdf.setFontSize(8);
  pdf.text(`Generated on ${new Date().toLocaleString()}`, margin, 290);

  pdf.save(`Material_Requirements_${poNumber}.pdf`);
};

export interface SupplierReturnLinePdf {
  material: string;
  unit: string;
  quantity: number;
  barcodes?: string[];
}

export const generateSupplierReturnPdf = (params: {
  poNumber: string;
  supplierName?: string;
  returnDate?: string;
  lines: SupplierReturnLinePdf[];
}) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // Header
  pdf.setFillColor(245, 158, 11); // amber
  pdf.rect(0, 0, pageWidth, 38, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont(undefined, 'bold');
  pdf.text('DAG Clothing Pvt Ltd', margin, 14);
  pdf.setFontSize(18);
  pdf.text('SUPPLIER RETURN NOTE', margin, 28);

  // Meta
  pdf.setTextColor(0, 0, 0);
  y = 45;
  pdf.setFontSize(11);
  const dateStr = params.returnDate || new Date().toISOString().slice(0, 10);
  pdf.text(`PO Number: ${params.poNumber}`, margin, y);
  if (params.supplierName) pdf.text(`Supplier: ${params.supplierName}`, margin + 80, y);
  pdf.text(`Date: ${dateStr}`, margin, y + 6);
  y += 12;

  // Lines table
  const head = [['Material', 'Quantity', 'Unit', 'Barcodes']];
  const body = params.lines.map((l) => [
    l.material,
    (l.quantity || 0).toFixed((l.unit || 'kg').toLowerCase().includes('kg') ? 3 : 2),
    l.unit || '',
    (l.barcodes || []).join(', '),
  ]);

  autoTable(pdf, {
    startY: y,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { halign: 'right', cellWidth: 28 },
      2: { cellWidth: 20 },
      3: { cellWidth: 70 },
    },
    margin: { left: margin, right: margin },
  });
  // @ts-ignore
  y = (pdf as any).lastAutoTable?.finalY + 10;

  // Totals
  const totalQty = params.lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  pdf.setFontSize(10);
  pdf.setFont(undefined, 'bold');
  pdf.text(`Total Quantity: ${totalQty.toFixed(3)}`, margin, y);
  pdf.setFont(undefined, 'normal');

  // Footer
  pdf.setFontSize(8);
  pdf.text(`Generated on ${new Date().toLocaleString()}`, margin, 290);

  const fileName = `Supplier_Return_${params.poNumber}_${dateStr}.pdf`;
  pdf.save(fileName);
};

export interface MarkerReturnLinePdf {
  material: string;
  unit: string;
  quantity: number;
  barcodes?: string[];
}

export const generateMarkerReturnPdf = (params: {
  markerNumber: string;
  poNumber?: string;
  returnDate?: string;
  lines: MarkerReturnLinePdf[];
}) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  pdf.setFillColor(91, 33, 182); // purple
  pdf.rect(0, 0, pageWidth, 38, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont(undefined, 'bold');
  pdf.text('DAG Clothing Pvt Ltd', margin, 14);
  pdf.setFontSize(18);
  pdf.text('MARKER RETURN NOTE', margin, 28);

  pdf.setTextColor(0, 0, 0);
  y = 45;
  const dateStr = params.returnDate || new Date().toISOString().slice(0, 10);
  pdf.setFontSize(11);
  pdf.text(`Marker: ${params.markerNumber}`, margin, y);
  if (params.poNumber) pdf.text(`PO: ${params.poNumber}`, margin + 80, y);
  pdf.text(`Date: ${dateStr}`, margin, y + 6);
  y += 12;

  const head = [['Material', 'Quantity', 'Unit', 'Barcodes']];
  const body = params.lines.map((l) => [
    l.material,
    (l.quantity || 0).toFixed((l.unit || 'kg').toLowerCase().includes('kg') ? 3 : 2),
    l.unit || '',
    (l.barcodes || []).join(', '),
  ]);

  autoTable(pdf, {
    startY: y,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [91, 33, 182], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { halign: 'right', cellWidth: 28 },
      2: { cellWidth: 20 },
      3: { cellWidth: 70 },
    },
    margin: { left: margin, right: margin },
  });
  // @ts-ignore
  y = (pdf as any).lastAutoTable?.finalY + 10;

  const totalQty = params.lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  pdf.setFontSize(10);
  pdf.setFont(undefined, 'bold');
  pdf.text(`Total Quantity: ${totalQty.toFixed(3)}`, margin, y);

  pdf.setFontSize(8);
  pdf.text(`Generated on ${new Date().toLocaleString()}`, margin, 290);

  const fileName = `Marker_Return_${params.markerNumber}_${dateStr}.pdf`;
  pdf.save(fileName);
};
