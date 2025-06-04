import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { AppLogo } from '../../components/AppLogo';
import * as XLSX from 'xlsx-js-style';
import { format, subDays, subMonths, startOfDay, endOfDay } from 'date-fns';
import toast from 'react-hot-toast';
import { getDateRange } from '../../lib/format';
import DateFilter from '../../components/DateFilter';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { Filter, Printer, FileSpreadsheet, FileText } from 'lucide-react';
import { generatePrintLogoHTML } from '../../lib/printLogo';

type DateRange = 'last_week' | 'last_month' | 'custom';

interface Transaction {
  date: string;
  transaction_type: string;
  transaction_type_code: string;
  customer: string;
  supplier: string;
  customer_currency_code: string;
  customer_amount: number;
  commission: number;
  currency_code: string;
}

const CommissionReport = () => {
  const [commissionAccountId, setCommissionAccountId] = useState<string | null>(null);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('last_month');
  const [customStartDate, setCustomStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [transactionType, setTransactionType] = useState<string>('all');
  const [selectedPartner, setSelectedPartner] = useState<string>('all');
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);

  // Get date range based on selection
  const getDateRangeValues = () => {
    const now = new Date();
    switch (dateRange) {
      case 'last_week':
        return {
          start: startOfDay(subDays(now, 7)),
          end: endOfDay(now)
        };
      case 'last_month':
        return {
          start: startOfDay(subMonths(now, 1)),
          end: endOfDay(now)
        };
      case 'custom':
        return {
          start: customStartDate ? startOfDay(new Date(customStartDate)) : startOfDay(subDays(now, 7)),
          end: customEndDate ? endOfDay(new Date(customEndDate)) : endOfDay(now)
        };
      default:
        return {
          start: startOfDay(subDays(now, 7)),
          end: endOfDay(now)
        };
    }
  };

  // Load all transactions on mount
  useEffect(() => {
    if (commissionAccountId) {
      fetchTransactions();
    }
  }, [dateRange, customStartDate, customEndDate, commissionAccountId]);

  // Filter transactions when type or partner changes
  useEffect(() => {
    if (allTransactions.length > 0) {
      let filtered = allTransactions;
      
      // Filter by transaction type
      if (transactionType !== 'all') {
        filtered = filtered.filter(t => t.transaction_type_code === transactionType);
      }
      
      // Filter by partner if a specific partner is selected
      if (selectedPartner !== 'all') {
        filtered = filtered.filter(t => 
          t.supplier === partners.find(p => p.id === selectedPartner)?.name ||
          t.customer === partners.find(p => p.id === selectedPartner)?.name
        );
      }
      
      setFilteredTransactions(filtered);
    }
  }, [transactionType, selectedPartner, allTransactions, partners]);
  
  // Fetch commission account ID
  useEffect(() => {
    const initializeCommissionAccount = async () => {
      try {
        setIsLoading(true);
        const { data: commissionAccount, error } = await supabase
          .from('chart_of_accounts')
          .select('id, is_active, name, currency_id')
          .eq('id', '3f6eece2-1b3a-4b0d-8499-81762e32ba6e')
          .single();
    
        if (error) {
          console.error('Error fetching commission account:', error);
          toast.error('Failed to fetch commission account');
          return;
        }

        if (!commissionAccount) {
          toast.error('Commission account not found');
          return;
        }

        if (!commissionAccount.is_active) {
          toast.error('Commission account is inactive');
          return;
        }
    
        setCommissionAccountId(commissionAccount.id);
        console.log(`Commission account initialized: ${commissionAccount.name}`);
      } catch (error) {
        console.error('Error initializing commission account:', error);
        toast.error('Failed to initialize commission account. Please check system configuration.');
      } finally {
        setIsLoading(false);
      }
    };
  
    initializeCommissionAccount();
  }, []);

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const { data, error } = await supabase
          .from('chart_of_accounts')
          .select('id, name')
          .eq('is_active', true)
          .order('name');
    
        if (error) {
          console.error('Error fetching partners:', error);
          toast.error('Failed to fetch partners');
          return;
        }
    
        setPartners(data || []);
      } catch (error) {
        console.error('Error fetching partners:', error);
        toast.error('Failed to fetch partners');
      }
    };
  
    fetchPartners();
  }, []);

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);

      // Validate commission account ID
      if (!commissionAccountId) {
        toast.error('Commission account not initialized. Please try again.');
        return;
      }

      const { start, end } = getDateRangeValues();
      const startDate = format(start, 'yyyy-MM-dd');
      const endDate = format(end, 'yyyy-MM-dd');

      let query = supabase
        .from('gl_headers')
        .select(`
          id, 
          transaction_date, 
          description, 
          tbl_trans_type!inner(transaction_type_code, description), 
          gl_transactions(
            id,
            amount,
            debit,
            credit,
            account_id,
            currency:currencies!gl_transactions_currency_id_fkey(code),
            account:chart_of_accounts!gl_transactions_account_id_fkey(id, name)
          )
        `)
        .eq('status', 'posted')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .in('tbl_trans_type.transaction_type_code', ['GENT', 'IPTC', 'MNGC', 'BNKT']);

      if (transactionType !== 'all') {
        query = query.eq('tbl_trans_type.transaction_type_code', transactionType);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Database query error:', error);
        if (error.code === 'PGRST116') {
          throw new Error('Invalid transaction type filter');
        } else if (error.code === 'PGRST109') {
          throw new Error('Database connection error. Please try again.');
        } else {
          throw new Error(`Database error: ${error.message || 'Unknown error'}`);
        }
      }

      if (!data || data.length === 0) {
        setAllTransactions([]);
        setFilteredTransactions([]);
        return;
      }

      if (!data || data.length === 0) {
        setAllTransactions([]);
        setFilteredTransactions([]);
        return;
      }

      const formattedTransactions = data.map(header => {
        // Find the customer transaction (debit > 0 and excluding commission account)
        const customerTransaction = header.gl_transactions.find(t => t.debit > 0 && t.account_id !== commissionAccountId);

        // Find the supplier transaction (credit > 0 and excluding commission account)
        const supplierTransaction = header.gl_transactions.find(t => t.credit > 0 && t.account_id !== commissionAccountId);

        // Find the commission transaction (using the account_id provided)
        const commissionTransaction = header.gl_transactions.find(t => t.account_id === commissionAccountId);

        // Only process if there is a valid customer transaction and commission transaction
        if (customerTransaction && commissionTransaction) {
          // For commission, we need to take the absolute value of either debit or credit, whichever is non-zero
          const commissionAmount = Math.abs(commissionTransaction.debit || commissionTransaction.credit || 0);
          // Use the amount field directly from gl_transactions for customer_amount
          const customerAmount = Math.abs(customerTransaction.amount);

          return {
            date: format(new Date(header.transaction_date), 'dd/MM/yyyy'),
            transaction_type: header.tbl_trans_type.description,
            transaction_type_code: header.tbl_trans_type.transaction_type_code, // Add this
            customer: customerTransaction?.account.name || '',
            supplier: supplierTransaction?.account.name || '',
            customer_currency_code: customerTransaction?.currency.code || '',
            customer_amount: customerAmount,
            commission: commissionAmount,
            currency_code: customerTransaction?.currency.code || ''
          };
        } else {
          // If no valid customer transaction or commission transaction, return null or handle appropriately
          return null;
        }
      }).filter(transaction => transaction !== null);  // Remove any null values in the final report

      setAllTransactions(formattedTransactions);
      setFilteredTransactions(formattedTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to fetch transactions: Unexpected error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);
  };

  const exportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const { start, end } = getDateRangeValues();
      const totalCommission = filteredTransactions.reduce((sum, t) => sum + t.commission, 0);
      
      // Helper function for date formatting
      const formatDateTimeDDMMYYYY = () => {
        const now = new Date();
        const day = now.getDate().toString().padStart(2, '0');
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const year = now.getFullYear();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
      };
      
      const formatDateDDMMYYYY = (date: Date) => {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      };
      
      // Prepare header information with logo placeholder
      const headerData = [
        ['🏢 FinTrack Pro - Financial Management System'], // Added emoji as logo placeholder
        ['Commission Report'],
        [''],
        [`Period: ${formatDateDDMMYYYY(start)} to ${formatDateDDMMYYYY(end)}`],
        ...(transactionType !== 'all' ? [[`Transaction Type: ${transactionType}`]] : []),
        ...(selectedPartner !== 'all' ? [[`Partner: ${partners.find(p => p.id === selectedPartner)?.name || 'N/A'}`]] : []),
        [`Print Date & Time: ${formatDateTimeDDMMYYYY()}`],
        [''],
        [''] // Extra space before table
      ];
      
      // Prepare table headers
      const tableHeaders = ['Date', 'Transaction Type', 'Customer', 'Supplier', 'Currency', 'Amount', 'Commission (AED)'];
      
      // Prepare data for export
      const exportData = [];
      
      // Add transaction rows with proper data types
      filteredTransactions.forEach(transaction => {
        exportData.push([
          transaction.date,
          transaction.transaction_type,
          transaction.customer,
          transaction.supplier,
          transaction.customer_currency_code,
          transaction.customer_amount, // Keep as number
          transaction.commission // Keep as number
        ]);
      });
      
      // Add totals row with proper number formatting
      const totalsRow = [
        '',
        '',
        '',
        '',
        '',
        'Total Commission',
        totalCommission
      ];
      
      exportData.push(totalsRow);
      
      // Combine all data
      const allData = [
        ...headerData,
        tableHeaders,
        ...exportData
      ];
      
      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(allData);
      
      // Set column widths
      const colWidths = [
        { wch: 12 }, // Date
        { wch: 20 }, // Transaction Type
        { wch: 25 }, // Customer
        { wch: 25 }, // Supplier
        { wch: 10 }, // Currency
        { wch: 15 }, // Amount
        { wch: 18 }  // Commission (AED)
      ];
      
      ws['!cols'] = colWidths;
      
      // Style the header rows
      const headerRowCount = headerData.length;
      const tableHeaderRow = headerRowCount;
      const totalsRowIndex = headerRowCount + 1 + exportData.length - 1;
      
      // Apply styles to specific cells
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      
      // Style company name (first row) - LEFT ALIGNED
      if (ws['A1']) {
        ws['A1'].s = {
          font: { bold: true, sz: 16 },
          alignment: { horizontal: 'left' }
        };
      }
      
      // Style report title (second row) - LEFT ALIGNED
      if (ws['A2']) {
        ws['A2'].s = {
          font: { bold: true, sz: 14 },
          alignment: { horizontal: 'left' }
        };
      }
      
      // Style table headers
      for (let col = 0; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: tableHeaderRow, c: col });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: 'F0F0F0' } },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            }
          };
        }
      }
      
      // Define number format for currency
      const currencyFormat = '#,##0.00';
      
      // Get column indices for different data types
      const amountColIndex = 5;  // Amount column (6th column)
      const commissionColIndex = 6; // Commission column (7th column)
      
      // Apply number formatting to data rows
      for (let row = headerRowCount + 1; row <= headerRowCount + exportData.length; row++) {
        // Format amount column
        const amountCellAddress = XLSX.utils.encode_cell({ r: row, c: amountColIndex });
        if (ws[amountCellAddress]) {
          ws[amountCellAddress].s = {
            numFmt: currencyFormat,
            alignment: { horizontal: 'right' }
          };
        }
        
        // Format commission column
        const commissionCellAddress = XLSX.utils.encode_cell({ r: row, c: commissionColIndex });
        if (ws[commissionCellAddress]) {
          ws[commissionCellAddress].s = {
            numFmt: currencyFormat,
            alignment: { horizontal: 'right' }
          };
        }
      }
      
      // Style totals row
      for (let col = 0; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: totalsRowIndex, c: col });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: 'E6F3FF' } },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            },
            numFmt: col >= amountColIndex ? currencyFormat : undefined,
            alignment: { horizontal: col >= amountColIndex ? 'right' : 'left' }
          };
        }
      }
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Commission Report');
      
      // Generate filename with date
      const filename = `Commission_Report_${format(start, 'ddMMyyyy')}_to_${format(end, 'ddMMyyyy')}.xlsx`;
      
      // Save the file
      XLSX.writeFile(wb, filename);
      
      toast.success('Exported to Excel successfully');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('Failed to export to Excel');
    }
  };

  const formatDateForPrint = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getCurrentDateTimeFormatted = () => {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const handlePrint = () => {
    try {
      // Create a temporary print container
      const printContainer = document.createElement('div');
      printContainer.id = 'print-container';
      const { start, end } = getDateRangeValues();
      const totalCommission = filteredTransactions.reduce((sum, t) => sum + t.commission, 0);
      
      printContainer.innerHTML = `
        <div class="print-running-header">
          <div class="print-header-content">
            <div class="print-left-section">
              ${generatePrintLogoHTML()}
            </div>
            <div class="print-center-section">
              <div class="print-report-title">Commission Report</div>
            </div>
            <div class="print-right-section">
              <div class="print-date">Print Date & Time: ${getCurrentDateTimeFormatted()}</div>
            </div>
          </div>
        </div>
        <div class="print-main-content">
          <div class="print-report-info">
            <p>Period: ${formatDateForPrint(format(start, 'yyyy-MM-dd'))} to ${formatDateForPrint(format(end, 'yyyy-MM-dd'))}</p>
            ${transactionType !== 'all' ? `<p>Transaction Type: ${transactionType}</p>` : ''}
            ${selectedPartner !== 'all' ? `<p>Partner: ${partners.find(p => p.id === selectedPartner)?.name || 'N/A'}</p>` : ''}
          </div>
          <table class="print-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction Type</th>
                <th>Customer</th>
                <th>Supplier</th>
                <th>Currency</th>
                <th class="number">Amount</th>
                <th class="number">Commission (AED)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredTransactions.map(transaction => `
                <tr>
                  <td>${formatDateForPrint(transaction.date)}</td>
                  <td>${transaction.transaction_type}</td>
                  <td>${transaction.customer}</td>
                  <td>${transaction.supplier}</td>
                  <td>${transaction.customer_currency_code}</td>
                  <td class="number">${formatAmount(transaction.customer_amount)}</td>
                  <td class="number">${formatAmount(transaction.commission)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="6"><strong>Total Commission</strong></td>
                <td class="number"><strong>${formatAmount(totalCommission)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      `;

      // Add print styles
      const printStyles = document.createElement('style');
      printStyles.id = 'print-styles';
      printStyles.innerHTML = `
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* Define the page layout with running header */
          @page {
            size: A4;
            margin: 1.5in 0.75in 0.5in 0.75in; /* Extra top margin for header */
            
            /* Explicitly remove browser default headers/footers */
            @top-left { content: none !important; }
            @top-center { content: none !important; }
            @top-right { content: none !important; }
            @bottom-left { content: none !important; }
            @bottom-center { content: none !important; }
            @bottom-right { content: none !important; }
            
            /* Define custom running header */
            @top {
              content: element(pageHeader);
            }
          }
          
          /* Hide everything except print container */
          html, body {
            width: 100%;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            overflow: visible !important;
          }
          
          body {
            background: white !important;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
          }
          
          body > *:not(#print-container) { 
            display: none !important; 
          }
          
          /* Main print container */
          #print-container {
            position: relative !important;
            width: 100% !important;
            height: auto !important;
            font-family: Arial, sans-serif;
            color: #000 !important;
            background: white !important;
            overflow: visible;
            padding: 0;
            margin: 0;
            box-sizing: border-box;
          }
          
          /* Running header that repeats on every page */
          .print-running-header {
            position: running(pageHeader) !important;
            width: 100% !important;
            padding-bottom: 15px;
            border-bottom: 2px solid #333 !important;
            margin-bottom: 20px;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .print-header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .print-left-section {
            display: flex;
            align-items: center;
            flex: 1;
          }
          .print-center-section {
            flex: 1;
            text-align: center;
          }
          .print-right-section {
            flex: 1;
            text-align: right;
          }
          .print-logo-container {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .print-logo-icon {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #22c55e 0%, #10b981 50%, #22c55e 100%) !important;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            -webkit-print-color-adjust: exact !important;
            box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3) !important;
            border: 1px solid rgba(34, 197, 94, 0.2) !important;
          }
          .print-logo-icon svg {
            color: white !important;
            stroke: white !important;
            fill: none !important;
            font-weight: bold;
          }
          .print-company-info {
            display: flex;
            flex-direction: column;
          }
          .print-logo-title {
            font-size: 14px;
            font-weight: bold;
            color: #000 !important;
            margin: 0;
            line-height: 1.2;
          }
          .print-logo-subtitle {
            font-size: 8px;
            color: #666 !important;
            margin: 0;
            line-height: 1.2;
          }
          .print-date {
            font-size: 9px;
            color: #666 !important;
            margin: 0;
          }
          .print-report-title {
            font-size: 16px;
            font-weight: bold;
            color: #000 !important;
            margin: 0;
          }
          .print-report-info {
            text-align: center;
            margin-bottom: 15px;
            font-size: 12px;
            color: #000 !important;
          }
          .print-report-info p {
            margin: 2px 0;
            color: #000 !important;
          }
          /* Main content area that starts after the header */
          .print-main-content {
            margin-top: 0.5in; /* Space after the running header */
            padding-top: 0;
            width: 100%;
          }
          .print-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 0;
            background: white !important;
            page-break-inside: auto;
            table-layout: fixed;
            border-spacing: 0;
          }
          .print-table thead {
            display: table-header-group !important;
            background: white !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            position: static !important;
          }
          .print-table thead tr {
            page-break-inside: avoid !important;
            page-break-after: avoid !important;
            break-inside: avoid !important;
            background: white !important;
            display: table-row !important;
          }
          .print-table th {
            border: 1px solid #333 !important;
            padding: 8px 6px;
            text-align: center;
            background: #f0f0f0 !important;
            font-weight: bold;
            font-size: 10px;
            color: #000 !important;
            -webkit-print-color-adjust: exact !important;
            page-break-inside: avoid !important;
          }
          .print-table td {
            border: 1px solid #333 !important;
            padding: 6px;
            font-size: 9px;
            color: #000 !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
          }
          .print-table .number {
            text-align: right;
          }
          .print-table .total-row {
            background: #e6f3ff !important;
            font-weight: bold;
            -webkit-print-color-adjust: exact !important;
          }
          .print-table .total-row td {
            background: #e6f3ff !important;
            font-weight: bold;
            -webkit-print-color-adjust: exact !important;
          }
          
          /* Prevent table rows from breaking across pages */
          tr {
            page-break-inside: avoid;
          }
        }
      `;

      // Remove existing print styles and add new ones
      const existingStyles = document.getElementById('print-styles');
      if (existingStyles) {
        existingStyles.remove();
      }
      document.head.appendChild(printStyles);

      // Remove existing print container and add new one
      const existingContainer = document.getElementById('print-container');
      if (existingContainer) {
        existingContainer.remove();
      }
      document.body.appendChild(printContainer);

      // Trigger print
      window.print();

      // Clean up after printing
      setTimeout(() => {
        if (printContainer && printContainer.parentNode) {
          printContainer.parentNode.removeChild(printContainer);
        }
        if (printStyles && printStyles.parentNode) {
          printStyles.parentNode.removeChild(printStyles);
        }
      }, 1000);

      toast.success('Print dialog opened successfully!');
    } catch (error) {
      console.error('Error printing:', error);
      toast.error('Failed to print report');
    }
  };

  const exportToPDF = () => {
    try {
      // Check if there are transactions to export
      if (!filteredTransactions || filteredTransactions.length === 0) {
        toast.error('No transactions found for the selected criteria');
        return;
      }

      // Import html2pdf dynamically
      import('html2pdf.js').then(async (html2pdf) => {
        const { generatePrintLogoHTML } = await import('../../lib/printLogo');
        
        // Get print logo CSS
        const printLogoCSS = `
          .print-logo-container {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .print-logo-icon {
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, #4ade80 0%, #10b981 50%, #22c55e 100%);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 16px;
          }
          .print-company-info {
            display: flex;
            flex-direction: column;
          }
          .print-logo-title {
            font-size: 16px;
            font-weight: bold;
            color: #000;
            line-height: 1.2;
          }
          .print-logo-subtitle {
            font-size: 10px;
            color: #666;
            line-height: 1.2;
          }
          
          /* Prevent table rows from breaking across pages */
          tr {
            page-break-inside: avoid;
          }
        `;
        
        const { start: startDate, end: endDate } = getDateRangeValues();
        const totalCommission = filteredTransactions.reduce((sum, t) => sum + t.commission, 0);
        
        // Helper function for date formatting
        const formatDateDDMMYYYY = (date: Date) => {
          const day = date.getDate().toString().padStart(2, '0');
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
        };
        
        // Create HTML content for PDF
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #000; background: white; padding: 20px;">
            <!-- Header Section -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #333;">
              <div style="flex: 1; display: flex; align-items: center;">
                ${generatePrintLogoHTML()}
              </div>
              <div style="flex: 2; text-align: center;">
                <div style="font-size: 18px; font-weight: bold; color: #000;">Commission Report</div>
              </div>
              <div style="flex: 1; text-align: right;">
                <div style="font-size: 10px; color: #666;">Print Date & Time: ${getCurrentDateTimeFormatted()}</div>
              </div>
            </div>
            
            <!-- Report Info -->
            <div style="margin-bottom: 15px; font-size: 12px;">
              <p style="margin: 3px 0; color: #000;">Period: ${formatDateDDMMYYYY(startDate)} to ${formatDateDDMMYYYY(endDate)}</p>
              ${transactionType !== 'all' ? `<p style="margin: 3px 0; color: #000;">Transaction Type: ${transactionType}</p>` : ''}
              ${selectedPartner !== 'all' ? `<p style="margin: 3px 0; color: #000;">Partner: ${partners.find(p => p.id === selectedPartner)?.name || 'N/A'}</p>` : ''}
            </div>
            
            <!-- Commission Report Table -->
            <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin: 0;">
              <thead>
                <tr>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Date</th>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Transaction Type</th>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Customer</th>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Supplier</th>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Currency</th>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Amount</th>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Commission (AED)</th>
                </tr>
              </thead>
              <tbody>
                ${filteredTransactions.map(transaction => `
                  <tr>
                    <td style="border: 1px solid #333; padding: 6px;">${formatDateForPrint(transaction.date)}</td>
                    <td style="border: 1px solid #333; padding: 6px;">${transaction.transaction_type}</td>
                    <td style="border: 1px solid #333; padding: 6px;">${transaction.customer}</td>
                    <td style="border: 1px solid #333; padding: 6px;">${transaction.supplier}</td>
                    <td style="border: 1px solid #333; padding: 6px;">${transaction.customer_currency_code}</td>
                    <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(transaction.customer_amount)}</td>
                    <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(transaction.commission)}</td>
                  </tr>
                `).join('')}
                <tr style="background-color: #e6f3ff;">
                  <td colspan="6" style="border: 1px solid #333; padding: 6px; font-weight: bold;">Total Commission</td>
                  <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(totalCommission)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <style>
            ${printLogoCSS}
          </style>
        `;
        
        // Configure html2pdf options with page numbering
        const options = {
          margin: [0.75, 0.75, 1, 0.75], // top, right, bottom, left
          filename: `Commission_Report_${format(startDate, 'ddMMyyyy')}_to_${format(endDate, 'ddMMyyyy')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { 
            unit: 'in', 
            format: 'a4', 
            orientation: 'landscape',
            putOnlyUsedFonts: true,
            floatPrecision: 16
          },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        // Generate PDF with custom page numbering
        const element = document.createElement('div');
        element.innerHTML = htmlContent;
        
        html2pdf.default()
          .set(options)
          .from(element)
          .toPdf()
          .get('pdf')
          .then((pdf) => {
            const totalPages = pdf.internal.getNumberOfPages();
            
            // Add page numbers to each page
            for (let i = 1; i <= totalPages; i++) {
              pdf.setPage(i);
              pdf.setFontSize(10);
              pdf.setTextColor(102, 102, 102); // Gray color
              const pageText = `Page ${i} of ${totalPages}`;
              const pageWidth = pdf.internal.pageSize.getWidth();
              const textWidth = pdf.getTextWidth(pageText);
              pdf.text(pageText, pageWidth - textWidth - 0.75, pdf.internal.pageSize.getHeight() - 0.5);
            }
            
            pdf.save(`Commission_Report_${format(startDate, 'ddMMyyyy')}_to_${format(endDate, 'ddMMyyyy')}.pdf`);
          });
        
        toast.success('PDF exported successfully!');
      }).catch(error => {
        console.error('Error loading html2pdf:', error);
        toast.error('Failed to load PDF library');
      });
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      toast.error('Failed to export to PDF');
    }
  };


  if (isLoading && filteredTransactions.length === 0) {
    return <LoadingSpinner title="Loading Commission Report..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Commission Report</h1>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 bg-blue-600 text-white hover:bg-blue-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-blue-800 hover:border-blue-900"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 bg-green-600 text-white hover:bg-green-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-green-800 hover:border-green-900"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 bg-red-600 text-white hover:bg-red-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-red-800 hover:border-red-900"
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow">
        <div className="p-6">
          {/* Date Range Fields */}
          <div className={`grid gap-4 mb-4 ${dateRange === 'custom' ? 'grid-cols-1 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'}`}>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Date Range
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="last_week">Last Week</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {dateRange === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Transaction Type
              </label>
              <select
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Types</option>
                <option value="GENT">General Trading</option>
                <option value="IPTC">Interparty Transfer with Commission</option>
                <option value="MNGC">Management Commission</option>
                <option value="BNKT">Bank Transfer</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                To Partner
              </label>
              <select
                value={selectedPartner}
                onChange={(e) => setSelectedPartner(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Partners</option>
                {partners.map(partner => (
                  <option key={partner.id} value={partner.id}>{partner.name}</option>
                ))}
              </select>
            </div>


          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold">Transaction Type</th>
                <th className="pb-3 font-semibold">Customer</th>
                <th className="pb-3 font-semibold">Supplier</th>
                <th className="pb-3 font-semibold">Currency</th>
                <th className="pb-3 font-semibold text-right">Amount</th>
                <th className="pb-3 font-semibold text-right">Commission (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {filteredTransactions.map((transaction, index) => (
                <tr key={index}>
                  <td className="py-3">{transaction.date}</td>
                  <td className="py-3">{transaction.transaction_type}</td>
                  <td className="py-3">{transaction.customer}</td>
                  <td className="py-3">{transaction.supplier}</td>
                  <td className="py-3">{transaction.customer_currency_code}</td>
                  <td className="py-3 text-right">
                    {formatAmount(transaction.customer_amount)}
                  </td>
                  <td className="py-3 text-right">
                    {formatAmount(transaction.commission)}
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-500 dark:text-gray-400">
                    No transactions found for the selected criteria
                  </td>
                </tr>
              )}
            </tbody>
            {filteredTransactions.length > 0 && (
              <tfoot>
                <tr className="border-t dark:border-gray-700 font-semibold">
                  <td colSpan={6} className="py-3 text-right">Total Commission (AED):</td>
                  <td className="py-3 text-right">
                    {formatAmount(
                      filteredTransactions.reduce((sum, t) => sum + t.commission, 0)
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default CommissionReport;