/* =============================================
   InvoiceNG — PDF Generator
   Professional PDF invoices with jsPDF
   ============================================= */

const PDFGenerator = {

  // Color palette
  colors: {
    green: [0, 135, 81],
    greenLight: [0, 168, 107],
    dark: [26, 26, 46],
    text: [55, 55, 80],
    textLight: [120, 120, 150],
    tableBg: [248, 248, 253],
    tableHeader: [240, 240, 248],
    border: [220, 220, 235],
    white: [255, 255, 255],
    danger: [220, 50, 70],
  },

  /**
   * Generate a professional A4 PDF invoice.
   * @param {Object} invoiceData — the JSON from InvoiceEngine.buildInvoiceJSON()
   * @param {string|null} logoBase64 — base64 data URL of the logo image
   * @returns {jsPDF} — the PDF document
   */
  generate(invoiceData, logoBase64) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = 210;
    const margin = 18;
    const contentW = pageW - margin * 2;
    let y = 0;

    // --- Header Bar ---
    doc.setFillColor(...this.colors.green);
    doc.rect(0, 0, pageW, 42, 'F');

    // Subtle gradient overlay
    doc.setFillColor(...this.colors.greenLight);
    doc.setGState(new doc.GState({ opacity: 0.3 }));
    doc.rect(pageW * 0.5, 0, pageW * 0.5, 42, 'F');
    doc.setGState(new doc.GState({ opacity: 1 }));

    // Logo
    let headerTextX = margin;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'AUTO', margin, 8, 26, 26, undefined, 'FAST');
        headerTextX = margin + 32;
      } catch (e) {
        console.warn('Could not add logo to PDF:', e);
      }
    }

    // Seller name in header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...this.colors.white);
    const sellerName = invoiceData.parties.seller.name || 'Untitled';
    doc.text(sellerName, headerTextX, 20);

    // Seller address in header
    if (invoiceData.parties.seller.address) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255, 180);
      const addrLines = doc.splitTextToSize(invoiceData.parties.seller.address, contentW - (headerTextX - margin) - 70);
      doc.text(addrLines.slice(0, 2), headerTextX, 27);
    }

    // Invoice type + number (right side of header)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...this.colors.white);
    const invType = (invoiceData.invoice_header.type || 'INVOICE').toUpperCase();
    doc.text(invType, pageW - margin, 16, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255, 200);
    doc.text(invoiceData.invoice_header.number || '', pageW - margin, 23, { align: 'right' });

    // Dates in header
    doc.setFontSize(7.5);
    const issueDate = invoiceData.invoice_header.issue_date || '';
    const dueDate = invoiceData.invoice_header.due_date || '';
    doc.text(`Issued: ${issueDate}`, pageW - margin, 30, { align: 'right' });
    doc.text(`Due: ${dueDate}`, pageW - margin, 35, { align: 'right' });

    y = 52;

    // --- Parties Section ---
    const halfW = (contentW - 12) / 2;

    // FROM
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...this.colors.green);
    doc.text('FROM', margin, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...this.colors.dark);
    doc.text(invoiceData.parties.seller.name, margin, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...this.colors.text);
    if (invoiceData.parties.seller.address) {
      const fromAddr = doc.splitTextToSize(invoiceData.parties.seller.address, halfW);
      doc.text(fromAddr, margin, y);
      y += fromAddr.length * 4;
    }

    if (invoiceData.parties.seller.rc_bn) {
      doc.setFontSize(7.5);
      doc.setTextColor(...this.colors.textLight);
      doc.text(`RC/BN: ${invoiceData.parties.seller.rc_bn}`, margin, y + 2);
      y += 5;
    }
    if (invoiceData.parties.seller.tin) {
      doc.setFontSize(7.5);
      doc.setTextColor(...this.colors.textLight);
      doc.text(`TIN: ${invoiceData.parties.seller.tin}`, margin, y + 2);
      y += 5;
    }

    // TO (right column, same vertical level as FROM)
    let yTo = 52;
    const rightX = margin + halfW + 12;

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...this.colors.green);
    doc.text('TO', rightX, yTo);
    yTo += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...this.colors.dark);
    doc.text(invoiceData.parties.buyer.name, rightX, yTo);
    yTo += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...this.colors.text);
    if (invoiceData.parties.buyer.address) {
      const toAddr = doc.splitTextToSize(invoiceData.parties.buyer.address, halfW);
      doc.text(toAddr, rightX, yTo);
      yTo += toAddr.length * 4;
    }

    y = Math.max(y, yTo) + 10;

    // --- Divider ---
    doc.setDrawColor(...this.colors.border);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 8;

    // --- Line Items Table ---
    const items = invoiceData.line_items || [];
    const tableData = items.map((item, idx) => [
      idx + 1,
      item.description || '',
      item.qty,
      InvoiceEngine.formatCurrency(item.rate),
      InvoiceEngine.formatCurrency(item.amount)
    ]);

    doc.autoTable({
      startY: y,
      head: [['#', 'Description', 'Qty', 'Rate', 'Amount']],
      body: tableData,
      theme: 'plain',
      margin: { left: margin, right: margin },
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
        textColor: this.colors.text,
        lineColor: this.colors.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: this.colors.tableHeader,
        textColor: this.colors.textLight,
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
      },
      alternateRowStyles: {
        fillColor: this.colors.tableBg,
      },
    });

    y = doc.lastAutoTable.finalY + 10;

    // --- Financial Summary ---
    const summaryX = pageW - margin - 80;
    const fs = invoiceData.financial_summary;

    const summaryRows = [
      { label: 'Subtotal', value: InvoiceEngine.formatCurrency(fs.subtotal), bold: false },
    ];

    if (fs.vat_amount > 0) {
      summaryRows.push({ label: 'VAT (7.5%)', value: InvoiceEngine.formatCurrency(fs.vat_amount), bold: false });
    }

    if (fs.wht_deduction > 0) {
      summaryRows.push({ label: 'WHT (5%)', value: `- ${InvoiceEngine.formatCurrency(fs.wht_deduction)}`, bold: false, negative: true });
    }

    summaryRows.push({ label: 'Total Payable', value: InvoiceEngine.formatCurrency(fs.total_payable), bold: true, isTotal: true });

    if (fs.amount_paid_upfront > 0) {
      summaryRows.push({ label: 'Paid Upfront', value: InvoiceEngine.formatCurrency(fs.amount_paid_upfront), bold: false });
      summaryRows.push({ label: 'Balance Remaining', value: InvoiceEngine.formatCurrency(fs.balance_remaining), bold: true });
    }

    summaryRows.forEach(row => {
      if (row.isTotal) {
        doc.setDrawColor(...this.colors.green);
        doc.setLineWidth(0.5);
        doc.line(summaryX, y - 1, pageW - margin, y - 1);
        y += 3;
      }

      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      doc.setFontSize(row.isTotal ? 10 : 8.5);
      doc.setTextColor(...(row.negative ? this.colors.danger : (row.bold ? this.colors.dark : this.colors.text)));
      doc.text(row.label, summaryX, y);
      doc.text(row.value, pageW - margin, y, { align: 'right' });
      y += row.isTotal ? 7 : 5;
    });

    y += 5;

    // --- Payment Details ---
    const payment = invoiceData.payment;
    const hasPaymentInfo = payment.bank_name || payment.account_no || payment.payment_link;

    if (hasPaymentInfo) {
      // Check if we need a new page
      if (y > 240) {
        doc.addPage();
        y = 20;
      }

      doc.setDrawColor(...this.colors.border);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 8;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...this.colors.green);
      doc.text('PAYMENT DETAILS', margin, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...this.colors.text);

      if (payment.bank_name) {
        doc.setFont('helvetica', 'bold');
        doc.text('Bank:', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(payment.bank_name, margin + 20, y);
        y += 5;
      }

      if (payment.account_no) {
        doc.setFont('helvetica', 'bold');
        doc.text('Account:', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(payment.account_no, margin + 20, y);
        y += 5;
      }

      if (payment.payment_link) {
        doc.setFont('helvetica', 'bold');
        doc.text('Pay Online:', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 100, 200);
        doc.textWithLink(payment.payment_link, margin + 24, y, { url: payment.payment_link });
        y += 5;
      }
    }

    // --- Footer ---
    const footerY = 282;
    doc.setDrawColor(...this.colors.border);
    doc.setLineWidth(0.2);
    doc.line(margin, footerY - 4, pageW - margin, footerY - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...this.colors.textLight);
    doc.text('Generated by InvoiceNG — Tax-Compliant Invoice Generator for Nigerian Freelancers', margin, footerY);
    doc.text(new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }), pageW - margin, footerY, { align: 'right' });

    return doc;
  },

  /**
   * Generate and trigger download.
   */
  downloadPDF(invoiceData, logoBase64) {
    const doc = this.generate(invoiceData, logoBase64);
    const filename = `${invoiceData.invoice_header.number || 'invoice'}.pdf`;
    doc.save(filename);
    return filename;
  }
};
