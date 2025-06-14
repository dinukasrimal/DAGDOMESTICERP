
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
