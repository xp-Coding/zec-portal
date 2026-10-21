import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { FeeInvoice, CollegeSettings } from '../types';

export interface PrintChallanData {
  invoice: FeeInvoice;
  college: CollegeSettings;
  items?: Array<{ fee_head: string; description: string; amount: number }>;
}

export interface PrintReceiptData {
  receipt_no: string;
  challan_no: string;
  student_name: string;
  roll_number: string;
  father_name?: string;
  class_name?: string;
  amount: number;
  payment_method: string;
  reference_no?: string;
  payment_date: string;
  cashier_name?: string;
  workstation_id?: string;
  remaining_invoice_balance: number;
  total_package_fee: number;
  remaining_package_balance: number;
  college?: CollegeSettings;
}

/**
 * Generate 3-Copy A4 Landscape Challan PDF (Bank Copy, Office Copy, Student Copy)
 */
export function generateChallanPDF(data: PrintChallanData): jsPDF {
  const { invoice, college } = data;
  
  // A4 Landscape: 297mm width x 210mm height
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageHeight = 210;
  const colWidth = 92; // 3 columns = 276mm + margins
  const marginX = 8;
  const gap = 3.5;

  const copies = [
    { title: 'BANK COPY', subtitle: 'To be retained by receiving bank' },
    { title: 'OFFICE COPY', subtitle: 'To be submitted to college accounts' },
    { title: 'STUDENT COPY', subtitle: 'To be retained by student as proof' },
  ];

  copies.forEach((copy, index) => {
    const startX = marginX + index * (colWidth + gap);

    // Draw Column Border
    doc.setDrawColor(79, 70, 229); // Indigo border
    doc.setLineWidth(0.4);
    doc.rect(startX, 8, colWidth, pageHeight - 16);

    // Header Background
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(startX + 0.4, 8.4, colWidth - 0.8, 16, 'F');

    // College Name & Crest
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(college.college_name.toUpperCase(), startX + colWidth / 2, 13.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(226, 232, 240);
    doc.text(`${college.address} | Ph: ${college.phone}`, startX + colWidth / 2, 17.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(253, 224, 71); // Gold
    doc.text(copy.title, startX + colWidth / 2, 22, { align: 'center' });

    // Challan No and Date Bar
    doc.setFillColor(241, 245, 249); // Slate-100
    doc.rect(startX + 2, 26, colWidth - 4, 11, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(startX + 2, 26, colWidth - 4, 11);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(`Challan #: ${invoice.challan_no}`, startX + 4, 30.5);
    doc.text(`Issue Date: ${invoice.issue_date}`, startX + colWidth - 4, 30.5, { align: 'right' });

    doc.setTextColor(185, 28, 28); // Red
    doc.text(`Due Date: ${invoice.due_date}`, startX + colWidth - 4, 35, { align: 'right' });
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${invoice.billing_period} (${invoice.billing_mode.toUpperCase()})`, startX + 4, 35);

    // Student Information Box
    let y = 41;
    doc.setFillColor(248, 250, 252);
    doc.rect(startX + 2, y, colWidth - 4, 21, 'F');
    doc.rect(startX + 2, y, colWidth - 4, 21);

    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Roll Number:', startX + 4, y + 4);
    doc.text('Student Name:', startX + 4, y + 8);
    doc.text('Father Name:', startX + 4, y + 12);
    doc.text('Program / Class:', startX + 4, y + 16);
    doc.text('Academic Session:', startX + 4, y + 20);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.roll_number || 'N/A', startX + 27, y + 4);
    doc.text((invoice.full_name || 'N/A').toUpperCase(), startX + 27, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.father_name || 'N/A', startX + 27, y + 12);
    doc.text(invoice.class_name || 'N/A', startX + 27, y + 16);
    doc.text(invoice.session_name || '2025-2026', startX + 27, y + 20);

    // ==========================================
    // THE 3 MANDATORY FINANCIAL FIGURES BANNER
    // ==========================================
    y = 65;
    doc.setFillColor(238, 242, 255); // Indigo-50
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.3);
    doc.rect(startX + 2, y, colWidth - 4, 22, 'F');
    doc.rect(startX + 2, y, colWidth - 4, 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(67, 56, 202); // Indigo-700
    doc.text('MANDATORY FEE DISCLOSURE (PKR)', startX + colWidth / 2, y + 3.5, { align: 'center' });

    // 3 Boxes inside banner
    const boxW = (colWidth - 8) / 3;
    const boxY = y + 5;

    // Box A: Total Academic / Package Fee
    doc.setFillColor(255, 255, 255);
    doc.rect(startX + 3, boxY, boxW, 14.5, 'F');
    doc.rect(startX + 3, boxY, boxW, 14.5);
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text('A. TOTAL PACKAGE', startX + 3 + boxW / 2, boxY + 4, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Rs. ${Number(invoice.total_package_fee).toLocaleString()}`, startX + 3 + boxW / 2, boxY + 10, { align: 'center' });

    // Box B: Remaining Package Fee
    doc.rect(startX + 3 + boxW + 1, boxY, boxW, 14.5, 'F');
    doc.rect(startX + 3 + boxW + 1, boxY, boxW, 14.5);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('B. REMAINING BAL.', startX + 3 + boxW + 1 + boxW / 2, boxY + 4, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(217, 119, 6); // Amber
    doc.text(`Rs. ${Number(invoice.package_balance_before).toLocaleString()}`, startX + 3 + boxW + 1 + boxW / 2, boxY + 10, { align: 'center' });

    // Box C: Current Monthly / Installment Fee
    doc.rect(startX + 3 + (boxW + 1) * 2, boxY, boxW, 14.5, 'F');
    doc.rect(startX + 3 + (boxW + 1) * 2, boxY, boxW, 14.5);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('C. CURRENT CHARGE', startX + 3 + (boxW + 1) * 2 + boxW / 2, boxY + 4, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229); // Indigo
    doc.text(`Rs. ${Number(invoice.current_cycle_fee).toLocaleString()}`, startX + 3 + (boxW + 1) * 2 + boxW / 2, boxY + 10, { align: 'center' });

    // ==========================================
    // Financial Breakdown Table
    // ==========================================
    y = 90;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);

    const breakdownItems = [
      { label: 'Current Cycle Fee:', val: invoice.current_cycle_fee },
      { label: 'Arrears Carried Forward:', val: invoice.arrears_carried_forward },
      { label: 'Scholarship / Concession:', val: -invoice.discount_amount },
      { label: 'Late Fine (if after due date):', val: invoice.late_fine },
    ];

    breakdownItems.forEach((item, idx) => {
      const lineY = y + idx * 5;
      doc.text(item.label, startX + 4, lineY);
      const formattedVal = item.val < 0 ? `- Rs. ${Math.abs(item.val).toLocaleString()}` : `Rs. ${item.val.toLocaleString()}`;
      doc.text(formattedVal, startX + colWidth - 4, lineY, { align: 'right' });
    });

    // Net Payable Banner
    const payableY = y + 22;
    doc.setFillColor(15, 23, 42); // Slate-900
    doc.rect(startX + 2, payableY, colWidth - 4, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('NET AMOUNT PAYABLE NOW:', startX + 4, payableY + 6.5);
    doc.setTextColor(74, 222, 128); // Emerald Green
    doc.text(`Rs. ${Number(invoice.net_payable).toLocaleString()}`, startX + colWidth - 4, payableY + 6.5, { align: 'right' });

    // Projected remaining balance note
    const projectedBalance = Math.max(0, invoice.package_balance_before - (invoice.current_cycle_fee - invoice.discount_amount));
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text(`* Projected remaining package balance after full payment: Rs. ${projectedBalance.toLocaleString()}`, startX + 3, payableY + 13.5);

    // Bank Payment Instructions Box
    const bankY = payableY + 16;
    doc.setFillColor(241, 245, 249);
    doc.rect(startX + 2, bankY, colWidth - 4, 28, 'F');
    doc.rect(startX + 2, bankY, colWidth - 4, 28);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);
    doc.text('BANK DEPOSIT INSTRUCTIONS', startX + 4, bankY + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(51, 65, 85);
    doc.text(`Bank: ${college.bank_name}`, startX + 4, bankY + 8);
    doc.text(`Branch: ${college.bank_branch}`, startX + 4, bankY + 12);
    doc.text(`A/C Title: ${college.bank_account_title}`, startX + 4, bankY + 16);
    doc.setFont('helvetica', 'bold');
    doc.text(`A/C No: ${college.bank_account_no}`, startX + 4, bankY + 20);
    doc.setFont('helvetica', 'normal');
    doc.text(`IBAN: ${college.bank_iban || 'N/A'}`, startX + 4, bankY + 24);

    // Signatures / Stamps
    const sigY = bankY + 31;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(startX + 4, sigY + 12, startX + 38, sigY + 12);
    doc.line(startX + colWidth - 38, sigY + 12, startX + colWidth - 4, sigY + 12);

    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('College Accounts Officer', startX + 21, sigY + 15, { align: 'center' });
    doc.text('Bank Cashier / Receiving Stamp', startX + colWidth - 21, sigY + 15, { align: 'center' });

    doc.setFontSize(5);
    doc.setTextColor(148, 163, 184);
    doc.text('ZEC Portal • Official College Management System', startX + colWidth / 2, pageHeight - 10, { align: 'center' });

    // Vertical Dotted Divider between copies
    if (index < 2) {
      doc.setDrawColor(148, 163, 184);
      doc.setLineDashPattern([1.5, 1.5], 0);
      const lineX = startX + colWidth + gap / 2;
      doc.line(lineX, 5, lineX, pageHeight - 5);
      doc.setLineDashPattern([], 0); // Reset
    }
  });

  return doc;
}

/**
 * Generate 80mm Thermal Cashier Payment Receipt
 */
export function generateReceiptPDF(receipt: PrintReceiptData): jsPDF {
  // 80mm thermal receipt: 80mm width, 180mm height
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 190],
  });

  const collegeName = receipt.college?.college_name || 'Zakariya Educational Complex';
  const collegePhone = receipt.college?.phone || '+92-61-111-222-333';

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(collegeName.toUpperCase(), 40, 10, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('OFFICIAL FEE PAYMENT RECEIPT', 40, 14, { align: 'center' });
  doc.text(`Ph: ${collegePhone}`, 40, 18, { align: 'center' });

  doc.setDrawColor(203, 213, 225);
  doc.line(5, 21, 75, 21);

  let y = 26;
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Receipt #: ${receipt.receipt_no}`, 5, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${receipt.payment_date}`, 75, y, { align: 'right' });

  y += 5;
  doc.text(`Challan #: ${receipt.challan_no}`, 5, y);

  y += 6;
  doc.line(5, y, 75, y);

  y += 5;
  doc.text(`Roll Number:`, 5, y);
  doc.setFont('helvetica', 'bold');
  doc.text(receipt.roll_number, 32, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Student Name:`, 5, y);
  doc.setFont('helvetica', 'bold');
  doc.text(receipt.student_name.toUpperCase(), 32, y);

  if (receipt.class_name) {
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`Class:`, 5, y);
    doc.text(receipt.class_name, 32, y);
  }

  y += 6;
  doc.line(5, y, 75, y);

  // Amount Paid Banner
  y += 6;
  doc.setFillColor(241, 245, 249);
  doc.rect(5, y - 4, 70, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('AMOUNT RECEIVED:', 7, y + 3);
  doc.setTextColor(16, 185, 129); // Green
  doc.text(`Rs. ${receipt.amount.toLocaleString()}`, 73, y + 3, { align: 'right' });

  y += 14;
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(`Payment Method:`, 5, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(receipt.payment_method.toUpperCase(), 75, y, { align: 'right' });

  if (receipt.reference_no) {
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Ref / Cheque #:`, 5, y);
    doc.text(receipt.reference_no, 75, y, { align: 'right' });
  }

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Remaining Invoice Balance:`, 5, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(receipt.remaining_invoice_balance > 0 ? 220 : 16, 38, 38);
  doc.text(`Rs. ${receipt.remaining_invoice_balance.toLocaleString()}`, 75, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Remaining Package Balance:`, 5, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Rs. ${receipt.remaining_package_balance.toLocaleString()}`, 75, y, { align: 'right' });

  y += 8;
  doc.line(5, y, 75, y);

  y += 5;
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Cashier: ${receipt.cashier_name || 'Counter Staff'}`, 5, y);
  doc.text(`Workstation: ${receipt.workstation_id || 'WS-1'}`, 75, y, { align: 'right' });

  y += 8;
  doc.setFontSize(6);
  doc.text('Thank you! Computer-generated verifiable receipt.', 40, y, { align: 'center' });
  doc.text('ZEC Portal • Zakariya Educational Complex', 40, y + 3.5, { align: 'center' });

  return doc;
}
