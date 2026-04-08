/* =============================================
   InvoiceNG — Invoice Engine
   Tax calculations, validation, data management
   ============================================= */

const InvoiceEngine = {

  // ========================
  //  Sequential Numbering
  // ========================

  /**
   * Returns the next invoice number without incrementing the counter.
   */
  peekNextInvoiceNumber() {
    const year = new Date().getFullYear();
    const key = `invoiceng_counter_${year}`;
    const counter = parseInt(localStorage.getItem(key) || '0', 10) + 1;
    return `INV-${year}-${String(counter).padStart(3, '0')}`;
  },

  /**
   * Consumes and returns the next sequential invoice number.
   * FIRS requires an unbroken sequence — gaps are red flags during audits.
   */
  getNextInvoiceNumber() {
    const year = new Date().getFullYear();
    const key = `invoiceng_counter_${year}`;
    const counter = parseInt(localStorage.getItem(key) || '0', 10) + 1;
    localStorage.setItem(key, counter.toString());
    return `INV-${year}-${String(counter).padStart(3, '0')}`;
  },

  // ========================
  //  Tax Calculations (CoT)
  // ========================

  /**
   * Subtotal = Σ(Qty × Rate)
   */
  calculateSubtotal(lineItems) {
    if (!lineItems || !lineItems.length) return 0;
    return lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.qty) || 0;
      const rate = parseFloat(item.rate) || 0;
      return sum + (qty * rate);
    }, 0);
  },

  /**
   * VAT = Subtotal × 0.075 (7.5%)
   * Only applied if turnover > ₦25M or voluntarily registered.
   */
  calculateVAT(subtotal, isVATRegistered) {
    if (!isVATRegistered) return 0;
    return Math.round(subtotal * 0.075 * 100) / 100;
  },

  /**
   * WHT = Subtotal × 0.05 (5%)
   * Standard deduction at source for consultancy/professional services
   * by corporate clients. Only applies when client is a company.
   */
  calculateWHT(subtotal, clientType) {
    if (clientType !== 'company') return 0;
    return Math.round(subtotal * 0.05 * 100) / 100;
  },

  /**
   * Total Payable = (Subtotal + VAT) − WHT
   */
  calculateTotal(subtotal, vat, wht) {
    return Math.round((subtotal + vat - wht) * 100) / 100;
  },

  /**
   * Full financial summary computation (Chain-of-Thought).
   */
  computeFinancials(lineItems, isVATRegistered, clientType, amountPaidUpfront) {
    const subtotal = this.calculateSubtotal(lineItems);
    const vat = this.calculateVAT(subtotal, isVATRegistered);
    const wht = this.calculateWHT(subtotal, clientType);
    const total = this.calculateTotal(subtotal, vat, wht);
    const upfront = parseFloat(amountPaidUpfront) || 0;
    const balance = Math.round((total - upfront) * 100) / 100;

    return {
      subtotal,
      vat_amount: vat,
      wht_deduction: wht,
      total_payable: total,
      amount_paid_upfront: upfront,
      balance_remaining: balance
    };
  },

  // ========================
  //  Currency Formatting
  // ========================

  formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return 'NGN ' + num.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  // ========================
  //  Validation
  // ========================

  /**
   * Validates a 10-digit NUBAN account number.
   */
  validateNUBAN(accountNo) {
    if (!accountNo) return true; // optional
    return /^\d{10}$/.test(accountNo.trim());
  },

  /**
   * Validates the complete invoice data object.
   * Returns an array of error strings. Empty = valid.
   */
  validateStep(step, data) {
    const errors = [];

    switch (step) {
      case 1: // Seller Details
        if (!data.seller?.name?.trim()) errors.push('Your name or business name is required.');
        if (!data.seller?.address?.trim()) errors.push('Your address is required.');
        break;

      case 2: // Client Details
        if (!data.buyer?.name?.trim()) errors.push('Client name is required.');
        if (!data.buyer?.address?.trim()) errors.push('Client address is required.');
        break;

      case 3: // Line Items
        if (!data.lineItems?.length) {
          errors.push('Add at least one line item.');
        } else {
          data.lineItems.forEach((item, i) => {
            if (!item.description?.trim()) errors.push(`Item ${i + 1}: description is required.`);
            if (!item.qty || parseFloat(item.qty) <= 0) errors.push(`Item ${i + 1}: quantity must be greater than 0.`);
            if (!item.rate || parseFloat(item.rate) <= 0) errors.push(`Item ${i + 1}: rate must be greater than 0.`);
          });
        }
        break;

      case 4: // Payment & Tax
        if (!data.dueDate) errors.push('A specific due date is required (no "On Delivery").');
        if (data.payment?.accountNo && !this.validateNUBAN(data.payment.accountNo)) {
          errors.push('Account number must be exactly 10 digits (NUBAN format).');
        }
        break;
    }

    return errors;
  },

  /**
   * Validates entire invoice.
   */
  validateAll(data) {
    let errors = [];
    for (let step = 1; step <= 4; step++) {
      errors = errors.concat(this.validateStep(step, data));
    }
    return errors;
  },

  // ========================
  //  JSON Builder
  // ========================

  /**
   * Builds the complete invoice JSON per the output schema.
   * Missing optional fields → null (not placeholders).
   */
  buildInvoiceJSON(formData) {
    const financials = this.computeFinancials(
      formData.lineItems,
      formData.isVATRegistered,
      formData.clientType,
      formData.amountPaidUpfront
    );

    return {
      status: 'extraction_complete',
      invoice_header: {
        type: formData.isVATRegistered ? 'Tax Invoice' : 'Proforma',
        number: formData.invoiceNumber,
        issue_date: formData.issueDate,
        due_date: formData.dueDate
      },
      parties: {
        seller: {
          name: formData.seller.name.trim(),
          address: formData.seller.address.trim(),
          rc_bn: formData.seller.rcBn?.trim() || null,
          tin: formData.seller.tin?.trim() || null
        },
        buyer: {
          name: formData.buyer.name.trim(),
          address: formData.buyer.address.trim()
        }
      },
      line_items: formData.lineItems.map(item => ({
        description: item.description.trim(),
        qty: parseFloat(item.qty),
        rate: parseFloat(item.rate),
        amount: Math.round(parseFloat(item.qty) * parseFloat(item.rate) * 100) / 100
      })),
      financial_summary: financials,
      payment: {
        bank_name: formData.payment?.bankName?.trim() || null,
        account_no: formData.payment?.accountNo?.trim() || null,
        payment_link: formData.payment?.paymentLink?.trim() || null
      }
    };
  },

  // ========================
  //  LocalStorage Helpers
  // ========================

  saveInvoice(invoiceJSON, logoBase64) {
    const history = this.getInvoiceHistory();
    const entry = {
      ...invoiceJSON,
      id: Date.now(),
      logo: logoBase64 || null,
      created_at: new Date().toISOString()
    };
    history.unshift(entry);
    // Keep last 50 invoices to avoid localStorage bloat
    if (history.length > 50) history.length = 50;
    localStorage.setItem('invoiceng_history', JSON.stringify(history));
    return entry;
  },

  getInvoiceHistory() {
    try {
      return JSON.parse(localStorage.getItem('invoiceng_history') || '[]');
    } catch {
      return [];
    }
  },

  saveSellerProfile(seller) {
    localStorage.setItem('invoiceng_seller', JSON.stringify(seller));
  },

  getSellerProfile() {
    try {
      return JSON.parse(localStorage.getItem('invoiceng_seller') || 'null');
    } catch {
      return null;
    }
  },

  saveLogo(base64) {
    if (base64) {
      localStorage.setItem('invoiceng_logo', base64);
    }
  },

  getLogo() {
    return localStorage.getItem('invoiceng_logo') || null;
  },

  removeLogo() {
    localStorage.removeItem('invoiceng_logo');
  }
};
