/* =============================================
   InvoiceNG — Main Application
   Multi-step form, UI interactions, state mgmt
   ============================================= */

(function () {
  'use strict';

  // ========================
  //  Application State
  // ========================
  const state = {
    currentStep: 1,
    totalSteps: 5,
    seller: { name: '', address: '', rcBn: '', tin: '' },
    buyer: { name: '', address: '' },
    clientType: 'individual',
    lineItems: [{ description: '', qty: 1, rate: 0 }],
    invoiceNumber: '',
    invoiceType: 'Proforma',
    issueDate: todayISO(),
    dueDate: '',
    isVATRegistered: false,
    amountPaidUpfront: 0,
    payment: { bankName: '', accountNo: '', paymentLink: '' },
    logoBase64: null,
    generatedJSON: null,
  };

  function todayISO() {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }

  // ========================
  //  DOM References
  // ========================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ========================
  //  Initialization
  // ========================
  document.addEventListener('DOMContentLoaded', () => {
    loadSellerProfile();
    loadLogo();
    state.invoiceNumber = InvoiceEngine.peekNextInvoiceNumber();
    state.issueDate = todayISO();

    renderHistorySidebar();
    updatePreview();
    bindEvents();
    updateStepIndicator();
    setDateDefaults();

    // Set initial issue date
    const issueDateInput = $('#issue-date');
    if (issueDateInput) issueDateInput.value = state.issueDate;
  });

  // ========================
  //  Event Binding
  // ========================
  function bindEvents() {
    // Navigation
    $('#btn-next').addEventListener('click', nextStep);
    $('#btn-prev').addEventListener('click', prevStep);

    // New Invoice
    $('#btn-new-invoice').addEventListener('click', resetForm);

    // Logo Upload
    const logoArea = $('#logo-upload-area');
    const logoInput = $('#input-logo');
    logoArea.addEventListener('click', () => logoInput.click());
    logoInput.addEventListener('change', handleLogoUpload);
    $('#btn-remove-logo').addEventListener('click', (e) => {
      e.stopPropagation();
      removeLogo();
    });

    // Client Type Radio
    $$('input[name="client-type"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.clientType = e.target.value;
        updateWHTBanner();
        updatePreview();
      });
    });

    // VAT Toggle
    $('#vat-toggle').addEventListener('change', (e) => {
      state.isVATRegistered = e.target.checked;
      updatePreview();
    });

    // Add Line Item
    $('#btn-add-item').addEventListener('click', addLineItem);

    // Form field listeners for real-time preview
    bindFieldListeners();

    // Mobile toggles
    const togglePreview = $('#btn-toggle-preview');
    const toggleHistory = $('#btn-toggle-history');
    const overlay = $('#overlay');

    if (togglePreview) {
      togglePreview.addEventListener('click', () => {
        $('#preview-panel').classList.toggle('open');
        overlay.classList.toggle('active');
      });
    }

    if (toggleHistory) {
      toggleHistory.addEventListener('click', () => {
        $('#sidebar').classList.toggle('open');
        overlay.classList.toggle('active');
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        $('#preview-panel').classList.remove('open');
        $('#sidebar').classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  }

  function bindFieldListeners() {
    // Step 1: Seller
    bindInput('#seller-name', (v) => { state.seller.name = v; });
    bindInput('#seller-address', (v) => { state.seller.address = v; });
    bindInput('#seller-rcbn', (v) => { state.seller.rcBn = v; });
    bindInput('#seller-tin', (v) => { state.seller.tin = v; });

    // Step 2: Buyer
    bindInput('#buyer-name', (v) => { state.buyer.name = v; });
    bindInput('#buyer-address', (v) => { state.buyer.address = v; });

    // Step 4: Payment & Tax
    bindInput('#issue-date', (v) => { state.issueDate = v; });
    bindInput('#due-date', (v) => { state.dueDate = v; });
    bindInput('#amount-upfront', (v) => { state.amountPaidUpfront = parseFloat(v) || 0; });
    bindInput('#payment-bank', (v) => { state.payment.bankName = v; });
    bindInput('#payment-account', (v) => { state.payment.accountNo = v; });
    bindInput('#payment-link', (v) => { state.payment.paymentLink = v; });
  }

  function bindInput(selector, handler) {
    const el = $(selector);
    if (!el) return;
    const update = (e) => {
      handler(e.target.value);
      updatePreview();
    };
    el.addEventListener('input', update);
    el.addEventListener('change', update);
  }

  // ========================
  //  Step Navigation
  // ========================
  function nextStep() {
    // Sync state from form
    syncStateFromForm();

    // Validate current step
    const errors = InvoiceEngine.validateStep(state.currentStep, state);
    if (errors.length > 0) {
      showErrors(errors);
      return;
    }

    clearErrors();

    // Save seller profile after step 1
    if (state.currentStep === 1) {
      InvoiceEngine.saveSellerProfile(state.seller);
      if (state.logoBase64) InvoiceEngine.saveLogo(state.logoBase64);
    }

    if (state.currentStep < state.totalSteps) {
      // If moving to step 5 (review), prepare review
      if (state.currentStep === 4) {
        prepareReview();
      }
      state.currentStep++;
      showStep(state.currentStep);
      updateStepIndicator();
      updateNavButtons();
    }
  }

  function prevStep() {
    if (state.currentStep > 1) {
      state.currentStep--;
      showStep(state.currentStep);
      updateStepIndicator();
      updateNavButtons();
      clearErrors();
    }
  }

  function showStep(step) {
    $$('.form-step').forEach(el => el.classList.remove('active'));
    const target = $(`.form-step[data-step="${step}"]`);
    if (target) target.classList.add('active');
  }

  function updateStepIndicator() {
    $$('.step-indicator .step').forEach(el => {
      const s = parseInt(el.dataset.step);
      el.classList.remove('active', 'completed');
      if (s === state.currentStep) el.classList.add('active');
      else if (s < state.currentStep) el.classList.add('completed');
    });

    // Update step lines
    $$('.step-indicator .step-line').forEach((line, i) => {
      line.classList.toggle('completed', i + 1 < state.currentStep);
    });
  }

  function updateNavButtons() {
    const btnPrev = $('#btn-prev');
    const btnNext = $('#btn-next');

    btnPrev.disabled = state.currentStep === 1;

    if (state.currentStep === state.totalSteps) {
      btnNext.style.display = 'none';
    } else {
      btnNext.style.display = '';
      btnNext.textContent = state.currentStep === state.totalSteps - 1 ? 'Review Invoice →' : 'Continue →';
    }
  }

  // ========================
  //  Sync State from Form
  // ========================
  function syncStateFromForm() {
    // Step 1
    state.seller.name = $('#seller-name')?.value || '';
    state.seller.address = $('#seller-address')?.value || '';
    state.seller.rcBn = $('#seller-rcbn')?.value || '';
    state.seller.tin = $('#seller-tin')?.value || '';

    // Step 2
    state.buyer.name = $('#buyer-name')?.value || '';
    state.buyer.address = $('#buyer-address')?.value || '';

    const checkedType = $('input[name="client-type"]:checked');
    state.clientType = checkedType ? checkedType.value : 'individual';

    // Step 3 - Line Items
    syncLineItems();

    // Step 4
    state.issueDate = $('#issue-date')?.value || todayISO();
    state.dueDate = $('#due-date')?.value || '';
    state.isVATRegistered = $('#vat-toggle')?.checked || false;
    state.amountPaidUpfront = parseFloat($('#amount-upfront')?.value) || 0;
    state.payment.bankName = $('#payment-bank')?.value || '';
    state.payment.accountNo = $('#payment-account')?.value || '';
    state.payment.paymentLink = $('#payment-link')?.value || '';
  }

  function syncLineItems() {
    const cards = $$('.line-item-card');
    state.lineItems = [];
    cards.forEach(card => {
      state.lineItems.push({
        description: card.querySelector('.item-desc')?.value || '',
        qty: parseFloat(card.querySelector('.item-qty')?.value) || 0,
        rate: parseFloat(card.querySelector('.item-rate')?.value) || 0,
      });
    });
  }

  // ========================
  //  Line Items Management
  // ========================
  function renderLineItems() {
    const container = $('#line-items-container');
    container.innerHTML = '';
    state.lineItems.forEach((item, idx) => {
      container.appendChild(createLineItemCard(item, idx));
    });
    updateLineItemAmounts();
  }

  function createLineItemCard(item, index) {
    const card = document.createElement('div');
    card.className = 'line-item-card';
    card.dataset.index = index;

    card.innerHTML = `
      <div class="line-item-header">
        <span class="line-item-number">Item ${index + 1}</span>
        ${state.lineItems.length > 1 ? `<button type="button" class="btn-remove-item" title="Remove item">✕</button>` : ''}
      </div>
      <div class="line-item-fields">
        <div class="form-group">
          <label>Description <span class="required">*</span></label>
          <input type="text" class="item-desc" value="${escapeHTML(item.description)}" placeholder="e.g., Logo Design">
        </div>
        <div class="form-group">
          <label>Qty <span class="required">*</span></label>
          <input type="number" class="item-qty" value="${item.qty}" min="1" step="1">
        </div>
        <div class="form-group">
          <label>Rate (NGN) <span class="required">*</span></label>
          <input type="number" class="item-rate" value="${item.rate}" min="0" step="100">
        </div>
        <div class="form-group">
          <label>Amount</label>
          <div class="item-amount">${InvoiceEngine.formatCurrency(item.qty * item.rate)}</div>
        </div>
      </div>
    `;

    // Bind events
    const removeBtn = card.querySelector('.btn-remove-item');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => removeLineItem(index));
    }

    card.querySelector('.item-desc').addEventListener('input', () => { syncLineItems(); updatePreview(); });
    card.querySelector('.item-qty').addEventListener('input', () => { updateLineItemAmounts(); syncLineItems(); updatePreview(); });
    card.querySelector('.item-rate').addEventListener('input', () => { updateLineItemAmounts(); syncLineItems(); updatePreview(); });

    return card;
  }

  function addLineItem() {
    syncLineItems();
    state.lineItems.push({ description: '', qty: 1, rate: 0 });
    renderLineItems();
    updatePreview();

    // Focus the new item's description field
    const cards = $$('.line-item-card');
    const lastCard = cards[cards.length - 1];
    if (lastCard) lastCard.querySelector('.item-desc')?.focus();
  }

  function removeLineItem(index) {
    syncLineItems();
    state.lineItems.splice(index, 1);
    if (state.lineItems.length === 0) {
      state.lineItems.push({ description: '', qty: 1, rate: 0 });
    }
    renderLineItems();
    updatePreview();
  }

  function updateLineItemAmounts() {
    const cards = $$('.line-item-card');
    cards.forEach(card => {
      const qty = parseFloat(card.querySelector('.item-qty')?.value) || 0;
      const rate = parseFloat(card.querySelector('.item-rate')?.value) || 0;
      const amountEl = card.querySelector('.item-amount');
      if (amountEl) amountEl.textContent = InvoiceEngine.formatCurrency(qty * rate);
    });
  }

  // ========================
  //  Logo Upload
  // ========================
  function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (PNG, JPG)', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image must be under 2MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      state.logoBase64 = ev.target.result;
      showLogoPreview(state.logoBase64);
      updatePreview();
    };
    reader.readAsDataURL(file);
  }

  function showLogoPreview(src) {
    $('#logo-preview').src = src;
    $('#logo-preview').style.display = 'block';
    $('#logo-placeholder').style.display = 'none';
    $('#btn-remove-logo').style.display = 'flex';
  }

  function removeLogo() {
    state.logoBase64 = null;
    InvoiceEngine.removeLogo();
    $('#logo-preview').style.display = 'none';
    $('#logo-placeholder').style.display = 'flex';
    $('#btn-remove-logo').style.display = 'none';
    $('#input-logo').value = '';
    updatePreview();
  }

  function loadLogo() {
    const saved = InvoiceEngine.getLogo();
    if (saved) {
      state.logoBase64 = saved;
      showLogoPreview(saved);
    }
  }

  // ========================
  //  Seller Profile
  // ========================
  function loadSellerProfile() {
    const profile = InvoiceEngine.getSellerProfile();
    if (profile) {
      state.seller = { ...state.seller, ...profile };
      const nameInput = $('#seller-name');
      const addrInput = $('#seller-address');
      const rcbnInput = $('#seller-rcbn');
      const tinInput = $('#seller-tin');
      if (nameInput) nameInput.value = profile.name || '';
      if (addrInput) addrInput.value = profile.address || '';
      if (rcbnInput) rcbnInput.value = profile.rcBn || '';
      if (tinInput) tinInput.value = profile.tin || '';
    }
  }

  // ========================
  //  WHT Banner
  // ========================
  function updateWHTBanner() {
    const banner = $('#wht-banner');
    if (banner) {
      banner.classList.toggle('visible', state.clientType === 'company');
    }
  }

  // ========================
  //  Date Helpers
  // ========================
  function setDateDefaults() {
    const issueDate = $('#issue-date');
    if (issueDate) {
      issueDate.value = state.issueDate;
      // Set min for due date to be today
      const dueDate = $('#due-date');
      if (dueDate) dueDate.min = state.issueDate;
    }
  }

  // ========================
  //  Error Display
  // ========================
  function showErrors(errors) {
    errors.forEach(err => showToast(err, 'error'));
    // Also highlight first error field
    if (errors[0]) {
      const fields = $$('.form-step.active input, .form-step.active textarea');
      fields.forEach(f => f.classList.remove('error'));
      // Simple heuristic: mark empty required fields
      fields.forEach(f => {
        if (f.hasAttribute('required') || f.closest('.form-group')?.querySelector('.required')) {
          if (!f.value.trim()) f.classList.add('error');
        }
      });
    }
  }

  function clearErrors() {
    $$('input.error, textarea.error').forEach(f => f.classList.remove('error'));
  }

  // ========================
  //  Review Step
  // ========================
  function prepareReview() {
    syncStateFromForm();
    state.invoiceNumber = InvoiceEngine.peekNextInvoiceNumber();
    const json = InvoiceEngine.buildInvoiceJSON({
      ...state,
      invoiceNumber: state.invoiceNumber,
    });
    state.generatedJSON = json;

    // Render full review card
    renderReviewCard(json);

    // Render JSON preview
    const jsonPre = $('#json-output');
    if (jsonPre) jsonPre.textContent = JSON.stringify(json, null, 2);
  }

  function renderReviewCard(json) {
    const container = $('#review-invoice');
    if (!container) return;

    const fs = json.financial_summary;
    const items = json.line_items || [];

    let itemsHTML = items.map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(item.description)}</td>
        <td style="text-align:center">${item.qty}</td>
        <td style="text-align:right">${InvoiceEngine.formatCurrency(item.rate)}</td>
        <td style="text-align:right; font-weight:600">${InvoiceEngine.formatCurrency(item.amount)}</td>
      </tr>
    `).join('');

    let summaryHTML = `
      <div class="inv-summary-row"><span>Subtotal</span><span>${InvoiceEngine.formatCurrency(fs.subtotal)}</span></div>
    `;
    if (fs.vat_amount > 0) {
      summaryHTML += `<div class="inv-summary-row"><span>VAT (7.5%)</span><span>${InvoiceEngine.formatCurrency(fs.vat_amount)}</span></div>`;
    }
    if (fs.wht_deduction > 0) {
      summaryHTML += `<div class="inv-summary-row"><span>WHT (5%)</span><span style="color:var(--danger)">- ${InvoiceEngine.formatCurrency(fs.wht_deduction)}</span></div>`;
    }
    summaryHTML += `<div class="inv-summary-row inv-total"><span>Total Due</span><span>${InvoiceEngine.formatCurrency(fs.total_payable)}</span></div>`;
    if (fs.amount_paid_upfront > 0) {
      summaryHTML += `<div class="inv-summary-row"><span>Paid Upfront</span><span>${InvoiceEngine.formatCurrency(fs.amount_paid_upfront)}</span></div>`;
      summaryHTML += `<div class="inv-summary-row" style="font-weight:700"><span>Balance</span><span>${InvoiceEngine.formatCurrency(fs.balance_remaining)}</span></div>`;
    }

    container.innerHTML = `
      <div class="inv-header">
        <div class="inv-header-left">
          ${state.logoBase64 ? `<img src="${state.logoBase64}" class="inv-logo" alt="Logo">` : ''}
          <span class="inv-seller-name" style="font-size:0.9rem">${escapeHTML(json.parties.seller.name)}</span>
        </div>
        <div class="inv-header-right">
          <div class="inv-type" style="font-size:0.7rem">${json.invoice_header.type}</div>
          <div class="inv-number" style="font-size:0.75rem">${json.invoice_header.number}</div>
        </div>
      </div>
      <div class="inv-body" style="padding:20px 24px">
        <div class="inv-parties" style="margin-bottom:20px">
          <div>
            <div class="inv-party-label" style="font-size:0.6rem">FROM</div>
            <div class="inv-party-name" style="font-size:0.85rem">${escapeHTML(json.parties.seller.name)}</div>
            <div class="inv-party-address" style="font-size:0.75rem">${escapeHTML(json.parties.seller.address)}</div>
            ${json.parties.seller.rc_bn ? `<div class="inv-party-address" style="font-size:0.7rem; margin-top:2px">RC/BN: ${escapeHTML(json.parties.seller.rc_bn)}</div>` : ''}
            ${json.parties.seller.tin ? `<div class="inv-party-address" style="font-size:0.7rem">TIN: ${escapeHTML(json.parties.seller.tin)}</div>` : ''}
          </div>
          <div>
            <div class="inv-party-label" style="font-size:0.6rem">TO</div>
            <div class="inv-party-name" style="font-size:0.85rem">${escapeHTML(json.parties.buyer.name)}</div>
            <div class="inv-party-address" style="font-size:0.75rem">${escapeHTML(json.parties.buyer.address)}</div>
          </div>
        </div>
        <table class="inv-items-table" style="font-size:0.75rem">
          <thead>
            <tr>
              <th style="width:30px">#</th>
              <th>Description</th>
              <th style="text-align:center; width:50px">Qty</th>
              <th style="text-align:right; width:90px">Rate</th>
              <th style="text-align:right; width:100px">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsHTML}</tbody>
        </table>
        <div class="inv-summary" style="width:55%; margin-left:auto; font-size:0.8rem">
          ${summaryHTML}
        </div>
      </div>
      <div class="inv-footer" style="padding:14px 24px">
        <div class="inv-dates" style="font-size:0.65rem; gap:20px">
          <div class="inv-date-item">Issued: <span class="inv-date-value">${json.invoice_header.issue_date}</span></div>
          <div class="inv-date-item">Due: <span class="inv-date-value">${json.invoice_header.due_date}</span></div>
        </div>
        ${json.payment.bank_name ? `
          <div class="inv-bank" style="margin-top:8px; font-size:0.65rem">
            <strong>Bank:</strong> ${escapeHTML(json.payment.bank_name)}
            ${json.payment.account_no ? ` &middot; <strong>Acc:</strong> ${json.payment.account_no}` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  // ========================
  //  Live Preview (Right Panel)
  // ========================
  function updatePreview() {
    syncStateFromForm();

    const container = $('#invoice-preview');
    if (!container) return;

    const hasData = state.seller.name || state.buyer.name || state.lineItems.some(i => i.description);
    if (!hasData) {
      container.innerHTML = `
        <div class="preview-empty">
          <span class="preview-empty-icon">📋</span>
          <p>Start filling in your details to see a live preview of your invoice</p>
        </div>
      `;
      return;
    }

    const fs = InvoiceEngine.computeFinancials(
      state.lineItems, state.isVATRegistered, state.clientType, state.amountPaidUpfront
    );

    const itemRows = state.lineItems
      .filter(i => i.description || i.qty || i.rate)
      .map(item => `
        <tr>
          <td>${escapeHTML(item.description || '—')}</td>
          <td style="text-align:center">${item.qty || 0}</td>
          <td style="text-align:right">${InvoiceEngine.formatCurrency(item.rate || 0)}</td>
          <td style="text-align:right; font-weight:600">${InvoiceEngine.formatCurrency((item.qty || 0) * (item.rate || 0))}</td>
        </tr>
      `).join('');

    let summaryHTML = `<div class="inv-summary-row"><span>Subtotal</span><span>${InvoiceEngine.formatCurrency(fs.subtotal)}</span></div>`;
    if (fs.vat_amount > 0) {
      summaryHTML += `<div class="inv-summary-row"><span>VAT (7.5%)</span><span>${InvoiceEngine.formatCurrency(fs.vat_amount)}</span></div>`;
    }
    if (fs.wht_deduction > 0) {
      summaryHTML += `<div class="inv-summary-row"><span>WHT (5%)</span><span>- ${InvoiceEngine.formatCurrency(fs.wht_deduction)}</span></div>`;
    }
    summaryHTML += `<div class="inv-summary-row inv-total"><span>Total</span><span>${InvoiceEngine.formatCurrency(fs.total_payable)}</span></div>`;

    container.innerHTML = `
      <div class="inv-header">
        <div class="inv-header-left">
          ${state.logoBase64 ? `<img src="${state.logoBase64}" class="inv-logo" alt="Logo">` : ''}
          <span class="inv-seller-name">${escapeHTML(state.seller.name || 'Your Name')}</span>
        </div>
        <div class="inv-header-right">
          <div class="inv-type">${state.isVATRegistered ? 'Tax Invoice' : 'Proforma'}</div>
          <div class="inv-number">${state.invoiceNumber || 'INV-XXXX-XXX'}</div>
        </div>
      </div>
      <div class="inv-body">
        <div class="inv-parties">
          <div>
            <div class="inv-party-label">From</div>
            <div class="inv-party-name">${escapeHTML(state.seller.name || '—')}</div>
            <div class="inv-party-address">${escapeHTML(state.seller.address || '')}</div>
          </div>
          <div>
            <div class="inv-party-label">To</div>
            <div class="inv-party-name">${escapeHTML(state.buyer.name || '—')}</div>
            <div class="inv-party-address">${escapeHTML(state.buyer.address || '')}</div>
          </div>
        </div>
        ${itemRows ? `
          <table class="inv-items-table">
            <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
        ` : ''}
        <div class="inv-summary">${summaryHTML}</div>
      </div>
      <div class="inv-footer">
        <div class="inv-dates">
          <div class="inv-date-item">Issued: <span class="inv-date-value">${state.issueDate || '—'}</span></div>
          <div class="inv-date-item">Due: <span class="inv-date-value">${state.dueDate || '—'}</span></div>
        </div>
      </div>
    `;

    // Pulse animation
    container.classList.remove('updated');
    void container.offsetWidth; // force reflow
    container.classList.add('updated');
  }

  // ========================
  //  Invoice Generation
  // ========================
  window.generatePDF = function() {
    if (!state.generatedJSON) {
      showToast('Please complete all steps first.', 'error');
      return;
    }

    try {
      // Consume the invoice number (increment counter)
      state.invoiceNumber = InvoiceEngine.getNextInvoiceNumber();
      state.generatedJSON.invoice_header.number = state.invoiceNumber;

      // Save to history
      InvoiceEngine.saveInvoice(state.generatedJSON, state.logoBase64);

      // Generate PDF
      const filename = PDFGenerator.downloadPDF(state.generatedJSON, state.logoBase64);
      showToast(`Invoice ${filename} downloaded successfully! 🎉`, 'success');

      // Refresh sidebar
      renderHistorySidebar();
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('Failed to generate PDF. Please try again.', 'error');
    }
  };

  window.exportJSON = function() {
    if (!state.generatedJSON) {
      showToast('Please complete all steps first.', 'error');
      return;
    }

    try {
      const jsonStr = JSON.stringify(state.generatedJSON, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.generatedJSON.invoice_header.number || 'invoice'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('JSON exported successfully!', 'success');
    } catch (err) {
      showToast('Failed to export JSON.', 'error');
    }
  };

  window.copyJSON = function() {
    if (!state.generatedJSON) return;
    navigator.clipboard.writeText(JSON.stringify(state.generatedJSON, null, 2))
      .then(() => showToast('JSON copied to clipboard!', 'success'))
      .catch(() => showToast('Could not copy to clipboard.', 'error'));
  };

  window.toggleJSONPreview = function() {
    const jsonBlock = $('#json-block');
    if (jsonBlock) {
      const isHidden = jsonBlock.style.display === 'none';
      jsonBlock.style.display = isHidden ? 'block' : 'none';
    }
  };

  // ========================
  //  History Sidebar
  // ========================
  function renderHistorySidebar() {
    const list = $('#history-list');
    const count = $('#history-count');
    const history = InvoiceEngine.getInvoiceHistory();

    count.textContent = history.length;

    if (history.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📄</span>
          <p>No invoices yet</p>
          <p class="text-muted">Your generated invoices will appear here</p>
        </div>
      `;
      return;
    }

    list.innerHTML = history.map(inv => `
      <div class="history-item" onclick="viewHistoryInvoice(${inv.id})">
        <span class="history-item-number">${escapeHTML(inv.invoice_header?.number || '—')}</span>
        <span class="history-item-client">${escapeHTML(inv.parties?.buyer?.name || 'Unknown Client')}</span>
        <span class="history-item-amount">${InvoiceEngine.formatCurrency(inv.financial_summary?.total_payable || 0)}</span>
        <span class="history-item-date">${formatDate(inv.created_at)}</span>
      </div>
    `).join('');
  }

  window.viewHistoryInvoice = function(id) {
    const history = InvoiceEngine.getInvoiceHistory();
    const inv = history.find(h => h.id === id);
    if (!inv) return;

    // Re-download the PDF for this invoice
    try {
      PDFGenerator.downloadPDF(inv, inv.logo);
      showToast(`Re-downloaded ${inv.invoice_header.number}`, 'success');
    } catch (err) {
      showToast('Could not regenerate this invoice.', 'error');
    }
  };

  // ========================
  //  Reset / New Invoice
  // ========================
  function resetForm() {
    // Keep seller profile
    state.currentStep = 1;
    state.buyer = { name: '', address: '' };
    state.clientType = 'individual';
    state.lineItems = [{ description: '', qty: 1, rate: 0 }];
    state.invoiceNumber = InvoiceEngine.peekNextInvoiceNumber();
    state.issueDate = todayISO();
    state.dueDate = '';
    state.isVATRegistered = false;
    state.amountPaidUpfront = 0;
    state.payment = { bankName: '', accountNo: '', paymentLink: '' };
    state.generatedJSON = null;

    // Reset form fields (keep seller data)
    const buyerName = $('#buyer-name');
    const buyerAddr = $('#buyer-address');
    if (buyerName) buyerName.value = '';
    if (buyerAddr) buyerAddr.value = '';

    const individualRadio = $('#client-type-individual');
    if (individualRadio) individualRadio.checked = true;

    const vatToggle = $('#vat-toggle');
    if (vatToggle) vatToggle.checked = false;

    const issueDate = $('#issue-date');
    if (issueDate) issueDate.value = state.issueDate;

    const dueDate = $('#due-date');
    if (dueDate) dueDate.value = '';

    const upfront = $('#amount-upfront');
    if (upfront) upfront.value = '';

    const payBank = $('#payment-bank');
    const payAcc = $('#payment-account');
    const payLink = $('#payment-link');
    if (payBank) payBank.value = '';
    if (payAcc) payAcc.value = '';
    if (payLink) payLink.value = '';

    renderLineItems();
    showStep(1);
    updateStepIndicator();
    updateNavButtons();
    updateWHTBanner();
    updatePreview();
    clearErrors();

    showToast('New invoice started!', 'info');
  }

  // ========================
  //  Toast Notifications
  // ========================
  function showToast(message, type = 'info') {
    const container = $('#toast-container');
    if (!container) return;

    const icons = { success: '✅', error: '❌', info: '💡', warning: '⚠️' };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || '💡'}</span>
      <span class="toast-message">${escapeHTML(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ========================
  //  Utility
  // ========================
  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleDateString('en-NG', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch {
      return isoStr;
    }
  }

  // ========================
  //  Initialize Line Items on Step 3 first view
  // ========================
  // Observe step changes to render line items when step 3 is shown
  const observer = new MutationObserver(() => {
    const step3 = $(`.form-step[data-step="3"]`);
    if (step3 && step3.classList.contains('active')) {
      if (!step3.dataset.initialized) {
        renderLineItems();
        step3.dataset.initialized = 'true';
      }
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    const formSteps = $('#form-steps');
    if (formSteps) {
      observer.observe(formSteps, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  });

})();
