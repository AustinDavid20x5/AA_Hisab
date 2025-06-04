import React, { useState, useEffect } from 'react';
import { format, subDays, subMonths, startOfDay, endOfDay } from 'date-fns';
import { FileText, Printer, FileSpreadsheet } from 'lucide-react';
import { AppLogo } from '../../components/AppLogo';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';
import { formatAmount } from '../../lib/format';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { generatePrintLogoHTML } from '../../lib/printLogo';

interface CashBook {
  id: string;
  code: string;
  name: string;
  currency: {
    id: string;
    code: string;
    rate: number;
    is_base: boolean;
    exchange_rate_note: 'multiply' | 'divide' | null;
  };
}

interface Transaction {
  date: string;
  narration: string;
  document_amount: number;
  currency_code: string;
  exchange_rate: number;
  debit: number;
  credit: number;
  balance: number;
}

interface Balance {
  balance: number;
  currency_id: string;
  currency_code: string;
}

type DateRange = 'last_week' | 'last_month' | 'custom';

export default function CashBook() {
  const [cashBooks, setCashBooks] = useState<CashBook[]>([]);
  const [selectedCashBook, setSelectedCashBook] = useState<CashBook | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('custom');
  const [customStartDate, setCustomStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openingBalance, setOpeningBalance] = useState<Balance[]>([]);
  const [closingBalance, setClosingBalance] = useState<Balance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<{ debit: number; credit: number; docAmount: number }>({
    debit: 0,
    credit: 0,
    docAmount: 0
  });

  useEffect(() => {
    fetchCashBooks().catch(err => {
      console.error('Error in initial fetch:', err);
      setError('Failed to load cash books');
    });
  }, []);

  useEffect(() => {
    if (selectedCashBook) {
      fetchTransactions().catch(err => {
        console.error('Error fetching transactions:', err);
        setError('Failed to load transactions');
      });
    }
  }, [selectedCashBook, dateRange, customStartDate, customEndDate]);

  const fetchCashBooks = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          code,
          name,
          currency:currencies!chart_of_accounts_currency_id_fkey (
            id,
            code,
            rate,
            is_base,
            exchange_rate_note
          )
        `)
        .eq('is_cashbook', true)
        .eq('is_active', true);

      if (error) throw error;
      setCashBooks(data || []);
    } catch (error) {
      console.error('Error fetching cash books:', error);
      toast.error('Failed to fetch cash books');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const getDateRange = () => {
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

  const fetchOpeningBalance = async (accountId: string, startDate: Date) => {
    try {
      const { data, error } = await supabase
        .from('gl_transactions')
        .select(`
          id,
          debit,
          credit,
          header:gl_headers!inner(
            transaction_date,
            status
          )
        `)
        .eq('account_id', accountId)
        .eq('header.status', 'posted')
        .lt('header.transaction_date', format(startDate, 'yyyy-MM-dd'));

      if (error) throw error;

      let totalDebit = 0;
      let totalCredit = 0;

      data.forEach(transaction => {
        totalDebit += Number(transaction.debit_doc_currency) || 0; // Use debit_doc_currency
        totalCredit += Number(transaction.credit_doc_currency) || 0;
      });

      const balance = totalDebit - totalCredit;

      setOpeningBalance([{
        balance,
        currency_id: selectedCashBook?.currency.id || '',
        currency_code: selectedCashBook?.currency.code || ''
      }]);

      return balance;
    } catch (error) {
      console.error('Error fetching opening balance:', error);
      toast.error('Failed to fetch opening balance');
      return 0;
    }
  };

  const fetchTransactions = async () => {
    if (!selectedCashBook) return;

    try {
      setIsLoading(true);
      setError(null);

      const { start, end } = getDateRange();

      // Calculate opening balance based on transactions before the start date
      const openingBalanceAmount = await fetchOpeningBalance(selectedCashBook.id, start);

      const { data: headers, error: headersError } = await supabase
        .from('gl_headers')
        .select(`
          id,
          transaction_date,
          description
        `)
        .eq('status', 'posted')
        .gte('transaction_date', format(start, 'yyyy-MM-dd'))
        .lte('transaction_date', format(end, 'yyyy-MM-dd'))
        .order('transaction_date', { ascending: true });

      if (headersError) throw headersError;

      if (!headers?.length) {
        setTransactions([]);
        setClosingBalance([{
          balance: openingBalanceAmount,
          currency_id: selectedCashBook.currency.id,
          currency_code: selectedCashBook.currency.code
        }]);
        return;
      }

      // Get transactions for these headers
      const { data: transactions, error: transactionsError } = await supabase
        .from('gl_transactions')
        .select(`
          id,
          debit,
          credit,
          debit_doc_currency,
          credit_doc_currency,
          description,
          exchange_rate,
          currency:currencies!gl_transactions_currency_id_fkey (
            id,
            code,
            rate,
            exchange_rate_note
          ),
          header_id
        `)
        .eq('account_id', selectedCashBook.id)
        .in('header_id', headers.map(h => h.id));

      if (transactionsError) throw transactionsError;

      // Create a map of header data for quick lookup
      const headerMap = new Map(headers.map(h => [h.id, h]));

      // Initialize running balance from opening balance
      let runningBalance = openingBalanceAmount;

      const formattedTransactions = transactions
        .sort((a, b) => {
          const dateA = new Date(headerMap.get(a.header_id)?.transaction_date || '');
          const dateB = new Date(headerMap.get(b.header_id)?.transaction_date || '');
          return dateA.getTime() - dateB.getTime();
        })
        .map(transaction => {
          const header = headerMap.get(transaction.header_id);
          const debit = Number(transaction.debit_doc_currency) || 0;
          const credit = Number(transaction.credit_doc_currency) || 0;
          const document_amount = (Number(transaction.debit) || 0) - (Number(transaction.credit) || 0);
          
          runningBalance += debit - credit;

          return {
            date: format(new Date(header?.transaction_date || ''), 'dd/MM/yyyy'),
            narration: transaction.description || header?.description || '',
            document_amount,
            currency_code: transaction.currency.code,
            exchange_rate: transaction.exchange_rate || 1,
            debit,
            credit,
            balance: runningBalance
          };
        });

      // Calculate totals
      const newTotals = formattedTransactions.reduce((acc, t) => ({
        debit: acc.debit + t.debit,
        credit: acc.credit + t.credit,
        docAmount: acc.docAmount + t.document_amount
      }), { debit: 0, credit: 0, docAmount: 0 });

      setTotals(newTotals);
      setTransactions(formattedTransactions);
      
      // Set closing balance
      setClosingBalance([{
        balance: runningBalance,
        currency_id: selectedCashBook.currency.id,
        currency_code: selectedCashBook.currency.code
      }]);

    } catch (error) {
      console.error('Error fetching transactions:', error);
      setError('Failed to fetch transactions');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const exportToPDF = () => {
    try {
      if (!selectedCashBook || transactions.length === 0) {
        toast.error('No data to export');
        return;
      }

      // Import html2pdf dynamically
      import('html2pdf.js').then(async (html2pdf) => {
        const { generatePrintLogoHTML } = await import('../../lib/printLogo');
        
        const { start, end } = getDateRange();
        const isBase = selectedCashBook.currency.is_base;
        
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
        
        // Helper function for date formatting
        const formatDateDDMMYYYY = (date: Date) => {
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

        // Create HTML content for PDF
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #000; background: white; padding: 20px;">
            <!-- Header Section -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #333;">
              <div style="flex: 1; display: flex; align-items: center;">
                ${generatePrintLogoHTML()}
              </div>
              <div style="flex: 2; text-align: center;">
                <div style="font-size: 18px; font-weight: bold; color: #000;">Cash Book Report</div>
              </div>
              <div style="flex: 1; text-align: right;">
                <div style="font-size: 10px; color: #666;">Print Date & Time: ${getCurrentDateTimeFormatted()}</div>
              </div>
            </div>
            
            <!-- Report Info -->
            <div style="margin-bottom: 15px; font-size: 12px;">
              <p style="margin: 3px 0; color: #000;">Cash Book: ${selectedCashBook.code} - ${selectedCashBook.name}</p>
              <p style="margin: 3px 0; color: #000;">Currency: ${selectedCashBook.currency.code}</p>
              <p style="margin: 3px 0; color: #000;">Period: ${formatDateDDMMYYYY(start)} to ${formatDateDDMMYYYY(end)}</p>
            </div>
            
            <!-- Cash Book Table -->
            <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin: 0;">
              <thead>
                <tr>
                  ${isBase 
                    ? '<th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Date</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Narration</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Debit</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Credit</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Balance</th>'
                    : '<th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Date</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Narration</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Doc. Amount</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Currency</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Rate</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Debit</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Credit</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Balance</th>'
                  }
                </tr>
              </thead>
              <tbody>
                <tr style="background-color: #fff3e0;">
                  ${isBase
                    ? `<td style="border: 1px solid #333; padding: 6px; font-weight: bold;">Opening Balance</td><td style="border: 1px solid #333; padding: 6px;"></td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${openingBalance[0]?.balance > 0 ? formatAmount(openingBalance[0].balance) : ''}</td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${openingBalance[0]?.balance < 0 ? formatAmount(Math.abs(openingBalance[0].balance)) : ''}</td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(openingBalance[0]?.balance || 0)}</td>`
                    : `<td style="border: 1px solid #333; padding: 6px; font-weight: bold;">Opening Balance</td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${openingBalance[0]?.balance > 0 ? formatAmount(openingBalance[0].balance) : ''}</td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${openingBalance[0]?.balance < 0 ? formatAmount(Math.abs(openingBalance[0].balance)) : ''}</td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(openingBalance[0]?.balance || 0)}</td>`
                  }
                </tr>
                ${transactions.map(transaction => `
                  <tr>
                    ${isBase
                      ? `<td style="border: 1px solid #333; padding: 6px;">${transaction.date}</td>
                         <td style="border: 1px solid #333; padding: 6px;">${transaction.narration}</td>
                         <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(transaction.debit)}</td>
                         <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(transaction.credit)}</td>
                         <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(transaction.balance)}</td>`
                      : `<td style="border: 1px solid #333; padding: 6px;">${transaction.date}</td>
                         <td style="border: 1px solid #333; padding: 6px;">${transaction.narration}</td>
                         <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(transaction.document_amount)}</td>
                         <td style="border: 1px solid #333; padding: 6px; text-align: center;">${transaction.currency_code}</td>
                         <td style="border: 1px solid #333; padding: 6px; text-align: right;">${transaction.exchange_rate.toFixed(4)}</td>
                         <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(transaction.debit)}</td>
                         <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(transaction.credit)}</td>
                         <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(transaction.balance)}</td>`
                    }
                  </tr>
                `).join('')}
                <tr style="background-color: #e6f3ff;">
                  ${isBase
                    ? `<td style="border: 1px solid #333; padding: 6px; font-weight: bold;">Totals</td><td style="border: 1px solid #333; padding: 6px;"></td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(totals.debit)}</td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(totals.credit)}</td>
                       <td style="border: 1px solid #333; padding: 6px;"></td>`
                    : `<td style="border: 1px solid #333; padding: 6px; font-weight: bold;">Totals</td><td style="border: 1px solid #333; padding: 6px;"></td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(totals.docAmount)}</td>
                       <td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(totals.debit)}</td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(totals.credit)}</td>
                       <td style="border: 1px solid #333; padding: 6px;"></td>`
                  }
                </tr>
                <tr style="background-color: #e8f5e8;">
                  ${isBase
                    ? `<td style="border: 1px solid #333; padding: 6px; font-weight: bold;">Closing Balance</td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(closingBalance[0]?.balance || 0)}</td>`
                    : `<td style="border: 1px solid #333; padding: 6px; font-weight: bold;">Closing Balance</td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td>
                       <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(closingBalance[0]?.balance || 0)}</td>`
                  }
                </tr>
              </tbody>
            </table>
          </div>
          
          <style>
            ${printLogoCSS}
          </style>
        `;

        // Configure html2pdf options
        const options = {
          margin: [0.75, 0.75, 1, 0.75], // top, right, bottom, left
          filename: `Cash_Book_Report_${selectedCashBook.code}_${format(start, 'ddMMyyyy')}_to_${format(end, 'ddMMyyyy')}.pdf`,
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
            
            pdf.save(`Cash_Book_Report_${selectedCashBook.code}_${format(start, 'ddMMyyyy')}_to_${format(end, 'ddMMyyyy')}.pdf`);
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
      if (!selectedCashBook || transactions.length === 0) {
        toast.error('No data to print');
        return;
      }

      const { start, end } = getDateRange();
      const isBase = selectedCashBook.currency.is_base;
      
      // Create a temporary print container
      const printContainer = document.createElement('div');
      printContainer.id = 'print-container';
      printContainer.innerHTML = `
        <div class="print-running-header">
          <div class="print-header-content">
            <div class="print-left-section">
              ${generatePrintLogoHTML()}
            </div>
            <div class="print-center-section">
              <div class="print-report-title">Cash Book Report</div>
            </div>
            <div class="print-right-section">
              <div class="print-date">Print Date & Time: ${getCurrentDateTimeFormatted()}</div>
            </div>
          </div>
        </div>
        <div class="print-main-content">
          <div class="print-report-info">
            <p>Cash Book: ${selectedCashBook.code} - ${selectedCashBook.name}</p>
            <p>Currency: ${selectedCashBook.currency.code}</p>
            <p>Period: ${formatDateForPrint(format(start, 'yyyy-MM-dd'))} to ${formatDateForPrint(format(end, 'yyyy-MM-dd'))}</p>
          </div>
          <table class="print-table">
            <thead>
              <tr>
                ${isBase 
                  ? '<th>Date</th><th>Narration</th><th class="number">Debit</th><th class="number">Credit</th><th class="number">Balance</th>'
                  : '<th>Date</th><th>Narration</th><th class="number">Doc. Amount</th><th class="center">Currency</th><th class="number">Rate</th><th class="number">Debit</th><th class="number">Credit</th><th class="number">Balance</th>'
                }
              </tr>
            </thead>
            <tbody>
              <tr class="opening-row">
                ${isBase
                  ? `<td><strong>Opening Balance</strong></td><td></td>
                     <td class="number"><strong>${openingBalance[0]?.balance > 0 ? formatAmount(openingBalance[0].balance) : ''}</strong></td>
                     <td class="number"><strong>${openingBalance[0]?.balance < 0 ? formatAmount(Math.abs(openingBalance[0].balance)) : ''}</strong></td>
                     <td class="number"><strong>${formatAmount(openingBalance[0]?.balance || 0)}</strong></td>`
                  : `<td><strong>Opening Balance</strong></td><td></td><td class="number"></td><td class="center"></td><td class="number"></td>
                     <td class="number"><strong>${openingBalance[0]?.balance > 0 ? formatAmount(openingBalance[0].balance) : ''}</strong></td>
                     <td class="number"><strong>${openingBalance[0]?.balance < 0 ? formatAmount(Math.abs(openingBalance[0].balance)) : ''}</strong></td>
                     <td class="number"><strong>${formatAmount(openingBalance[0]?.balance || 0)}</strong></td>`
                }
              </tr>
              ${transactions.map(transaction => `
                <tr>
                  ${isBase
                    ? `<td>${transaction.date}</td>
                       <td>${transaction.narration}</td>
                       <td class="number">${formatAmount(transaction.debit)}</td>
                       <td class="number">${formatAmount(transaction.credit)}</td>
                       <td class="number">${formatAmount(transaction.balance)}</td>`
                    : `<td>${transaction.date}</td>
                       <td>${transaction.narration}</td>
                       <td class="number">${formatAmount(transaction.document_amount)}</td>
                       <td class="center">${transaction.currency_code}</td>
                       <td class="number">${transaction.exchange_rate.toFixed(4)}</td>
                       <td class="number">${formatAmount(transaction.debit)}</td>
                       <td class="number">${formatAmount(transaction.credit)}</td>
                       <td class="number">${formatAmount(transaction.balance)}</td>`
                  }
                </tr>
              `).join('')}
              <tr class="total-row">
                ${isBase
                  ? `<td colspan="2"><strong>Total</strong></td>
                     <td class="number"><strong>${formatAmount(totals.debit)}</strong></td>
                     <td class="number"><strong>${formatAmount(totals.credit)}</strong></td>
                     <td class="number"></td>`
                  : `<td colspan="2"><strong>Total</strong></td>
                     <td class="number"><strong>${formatAmount(totals.docAmount)}</strong></td>
                     <td class="center"></td><td class="number"></td>
                     <td class="number"><strong>${formatAmount(totals.debit)}</strong></td>
                     <td class="number"><strong>${formatAmount(totals.credit)}</strong></td>
                     <td class="number"></td>`
                }
              </tr>
              <tr class="closing-row">
                ${isBase
                  ? `<td colspan="2"><strong>Closing Balance</strong></td><td class="number"></td><td class="number"></td>
                     <td class="number"><strong>${formatAmount(closingBalance[0]?.balance || 0)}</strong></td>`
                  : `<td colspan="2"><strong>Closing Balance</strong></td><td class="number"></td><td class="center"></td><td class="number"></td><td class="number"></td><td class="number"></td>
                     <td class="number"><strong>${formatAmount(closingBalance[0]?.balance || 0)}</strong></td>`
                }
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
            text-align: left;
            font-size: 11px;
            color: #000 !important;
            background-color: #f5f5f5 !important;
            font-weight: bold;
            -webkit-print-color-adjust: exact !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: table-cell !important;
            vertical-align: middle;
          }
          .print-table tbody {
            display: table-row-group !important;
            background: white !important;
            page-break-after: auto;
          }
          .print-table td {
            border: 1px solid #333 !important;
            padding: 8px 6px;
            text-align: left;
            font-size: 11px;
            color: #000 !important;
            background: white !important;
            page-break-inside: avoid;
            display: table-cell !important;
            vertical-align: middle;
          }
          .print-table .number {
            text-align: right;
          }
          .print-table .center {
            text-align: center;
          }
          .print-table .total-row {
            font-weight: bold;
            background-color: #f9f9f9 !important;
            -webkit-print-color-adjust: exact !important;
          }
          .print-table .opening-row {
            font-weight: bold;
            background-color: #fff3e0 !important;
            -webkit-print-color-adjust: exact !important;
          }
          .print-table .closing-row {
            font-weight: bold;
            background-color: #e8f5e8 !important;
            -webkit-print-color-adjust: exact !important;
          }
          .print-table tr {
            page-break-inside: avoid;
            background: white !important;
          }
          .print-table tbody {
            background: white !important;
          }
          html, body {
            height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            max-height: none !important;
          }
          * {
            box-sizing: border-box !important;
          }
          #print-container {
            page-break-after: auto;
          }
          .print-table tbody {
            page-break-after: auto;
          }
          .print-page-header {
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          .print-report-info {
            page-break-after: avoid;
            page-break-inside: avoid;
            margin-bottom: 10px;
          }
          .print-table {
            page-break-before: avoid;
          }
          .print-table tbody tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          .print-table .total-row {
            page-break-before: avoid;
            page-break-after: auto;
          }
        }
      `;

      // Add elements to document
      document.head.appendChild(printStyles);
      document.body.appendChild(printContainer);

      // Print
      window.print();

      // Clean up
      setTimeout(() => {
        document.head.removeChild(printStyles);
        document.body.removeChild(printContainer);
      }, 1000);

    } catch (error) {
      console.error('Print error:', error);
      toast.error('Print failed.');
    }
  };

  const exportToExcel = () => {
    try {
      if (!selectedCashBook || transactions.length === 0) {
        toast.error('No data to export');
        return;
      }

      const wb = XLSX.utils.book_new();
      const { start, end } = getDateRange();
      const isBase = selectedCashBook.currency.is_base;
      
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
        ['Cash Book Report'],
        [''],
        [`Cash Book: ${selectedCashBook.code} - ${selectedCashBook.name}`],
        [`Currency: ${selectedCashBook.currency.code}`],
        [`Period: ${formatDateDDMMYYYY(start)} to ${formatDateDDMMYYYY(end)}`],
        [`Print Date & Time: ${formatDateTimeDDMMYYYY()}`],
        [''],
        [''] // Extra space before table
      ];
      
      // Prepare table headers
      const tableHeaders = isBase
        ? ['Date', 'Narration', 'Debit', 'Credit', 'Balance']
        : ['Date', 'Narration', 'Doc. Amount', 'Currency', 'Rate', 'Debit', 'Credit', 'Balance'];
      
      // Prepare data for export
      const exportData = [];
      
      // Add opening balance row
      const openingRow = isBase
        ? ['Opening Balance', '', 
           openingBalance[0]?.balance > 0 ? openingBalance[0].balance : '',
           openingBalance[0]?.balance < 0 ? Math.abs(openingBalance[0].balance) : '',
           openingBalance[0]?.balance || 0]
        : ['Opening Balance', '', '', '', '',
           openingBalance[0]?.balance > 0 ? openingBalance[0].balance : '',
           openingBalance[0]?.balance < 0 ? Math.abs(openingBalance[0].balance) : '',
           openingBalance[0]?.balance || 0];
      
      exportData.push(openingRow);
      
      // Add transaction rows with proper data types
      transactions.forEach(transaction => {
        if (isBase) {
          exportData.push([
            transaction.date,
            transaction.narration,
            transaction.debit, // Keep as number
            transaction.credit, // Keep as number
            transaction.balance // Keep as number
          ]);
        } else {
          exportData.push([
            transaction.date,
            transaction.narration,
            transaction.document_amount, // Keep as number
            transaction.currency_code,
            transaction.exchange_rate, // Keep as number
            transaction.debit, // Keep as number
            transaction.credit, // Keep as number
            transaction.balance // Keep as number
          ]);
        }
      });
      
      // Add totals row with proper number formatting
      const totalsRow = isBase
        ? ['Totals', '', totals.debit, totals.credit, '']
        : ['Totals', '', totals.docAmount, '', '', totals.debit, totals.credit, ''];
      
      exportData.push(totalsRow);
      
      // Add closing balance row
      const closingRow = isBase
        ? ['Closing Balance', '', '', '', closingBalance[0]?.balance || 0]
        : ['Closing Balance', '', '', '', '', '', '', closingBalance[0]?.balance || 0];
      
      exportData.push(closingRow);
      
      // Combine all data
      const allData = [
        ...headerData,
        tableHeaders,
        ...exportData
      ];
      
      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(allData);
      
      // Set column widths
      const colWidths = isBase
        ? [
            { wch: 12 }, // Date
            { wch: 40 }, // Narration
            { wch: 15 }, // Debit
            { wch: 15 }, // Credit
            { wch: 15 }  // Balance
          ]
        : [
            { wch: 12 }, // Date
            { wch: 30 }, // Narration
            { wch: 15 }, // Doc. Amount
            { wch: 10 }, // Currency
            { wch: 12 }, // Rate
            { wch: 15 }, // Debit
            { wch: 15 }, // Credit
            { wch: 15 }  // Balance
          ];
      
      ws['!cols'] = colWidths;
      
      // Style the header rows
      const headerRowCount = headerData.length;
      const tableHeaderRow = headerRowCount;
      const totalsRowIndex = headerRowCount + 1 + exportData.length - 2; // -2 because totals is second to last
      const closingRowIndex = headerRowCount + 1 + exportData.length - 1; // -1 because closing is last
      
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
      
      // Get column indices for different data types based on base currency
      const numberColumns = isBase
        ? [2, 3, 4] // Debit, Credit, Balance
        : [2, 4, 5, 6, 7]; // Doc Amount, Rate, Debit, Credit, Balance
      
      // Apply number formatting to data rows
      for (let row = headerRowCount + 1; row <= headerRowCount + exportData.length; row++) {
        numberColumns.forEach(colIndex => {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: colIndex });
          if (ws[cellAddress]) {
            ws[cellAddress].s = {
              numFmt: colIndex === 4 && !isBase ? '#,##0.0000' : currencyFormat, // Rate format for non-base
              alignment: { horizontal: 'right' }
            };
          }
        });
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
            numFmt: numberColumns.includes(col) ? (col === 4 && !isBase ? '#,##0.0000' : currencyFormat) : undefined,
            alignment: { horizontal: numberColumns.includes(col) ? 'right' : 'left' }
          };
        }
      }
      
      // Style closing balance row
      for (let col = 0; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: closingRowIndex, c: col });
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
            numFmt: numberColumns.includes(col) ? (col === 4 && !isBase ? '#,##0.0000' : currencyFormat) : undefined,
            alignment: { horizontal: numberColumns.includes(col) ? 'right' : 'left' }
          };
        }
      }
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Cash Book Report');
      
      // Generate filename with date
      const filename = `Cash_Book_Report_${selectedCashBook.code}_${format(start, 'ddMMyyyy')}_to_${format(end, 'ddMMyyyy')}.xlsx`;
      
      // Save the file
      XLSX.writeFile(wb, filename);
      
      toast.success('Exported to Excel successfully');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('Failed to export to Excel');
    }
  };

  const formatBalanceDisplay = (balance: Balance) => {
    const amount = formatAmount(Math.abs(balance.balance));
    return `${balance.currency_code} ${balance.balance < 0 ? '-' : ''}${amount}`;
  };

  if (error) {
    return (
      <div className="p-4 text-center">
        <div className="bg-red-50 dark:bg-red-900/50 p-4 rounded-lg">
          <p className="text-red-600 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading && !cashBooks.length) {
    return <LoadingSpinner title="Loading Cash Book Report..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Cash Book Report</h1>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 ${
              !selectedCashBook || transactions.length === 0
                ? 'bg-gray-400 text-gray-600 border-gray-500 cursor-not-allowed opacity-50'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-blue-800 hover:border-blue-900'
            }`}
            disabled={!selectedCashBook || transactions.length === 0}
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={exportToExcel}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 ${
              !selectedCashBook || transactions.length === 0
                ? 'bg-gray-400 text-gray-600 border-gray-500 cursor-not-allowed opacity-50'
                : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-green-800 hover:border-green-900'
            }`}
            disabled={!selectedCashBook || transactions.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
          <button
            onClick={exportToPDF}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 ${
              !selectedCashBook || transactions.length === 0
                ? 'bg-gray-400 text-gray-600 border-gray-500 cursor-not-allowed opacity-50'
                : 'bg-red-600 text-white hover:bg-red-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-red-800 hover:border-red-900'
            }`}
            disabled={!selectedCashBook || transactions.length === 0}
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow">
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Cash Book
              </label>
              <select
                value={selectedCashBook?.id || ''}
                onChange={(e) => {
                  const cashBook = cashBooks.find(cb => cb.id === e.target.value);
                  setSelectedCashBook(cashBook || null);
                }}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select Cash Book</option>
                {cashBooks.map(cb => (
                  <option key={cb.id} value={cb.id}>
                    {cb.name} ({cb.currency.code})
                  </option>
                ))}
              </select>
            </div>

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
          </div>

          {selectedCashBook && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Opening balance card */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div className="text-sm text-blue-600 dark:text-blue-300">
                  Opening Balance ({selectedCashBook.currency.code})
                </div>
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-200">
                  {formatAmount(openingBalance[0]?.balance || 0)}
                </div>
              </div>
              {/* Closing balance card */}
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <div className="text-sm text-green-600 dark:text-green-300">
                  Closing Balance ({selectedCashBook.currency.code})
                </div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-200">
                  {formatAmount(closingBalance[0]?.balance || 0)}
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Narration</th>
                  {!selectedCashBook?.currency.is_base && (
                    <>
                      <th className="pb-3 font-semibold text-right">Doc. Amount</th>
                      <th className="pb-3 font-semibold">Currency</th>
                      <th className="pb-3 font-semibold text-right">Rate</th>
                    </>
                  )}
                  <th className="pb-3 font-semibold text-right">Debit</th>
                  <th className="pb-3 font-semibold text-right">Credit</th>
                  <th className="pb-3 font-semibold text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {/* Opening Balance Row */}
                {selectedCashBook && (
                  <tr>
                    <td className="py-3">Opening Balance</td>
                    <td className="py-3"></td>
                    {!selectedCashBook.currency.is_base && (
                      <>
                        <td className="py-3"></td>
                        <td className="py-3"></td>
                        <td className="py-3"></td>
                      </>
                    )}
                    <td className="py-3 text-right">
                      {openingBalance[0]?.balance > 0 ? formatAmount(openingBalance[0].balance) : ''}
                    </td>
                    <td className="py-3 text-right">
                      {openingBalance[0]?.balance < 0 ? formatAmount(Math.abs(openingBalance[0].balance)) : ''}
                    </td>
                    <td className="py-3 text-right">
                      {formatAmount(openingBalance[0]?.balance || 0)}
                    </td>
                  </tr>
                )}

                {transactions.map((transaction, index) => (
                  <tr key={index}>
                    <td className="py-3">{transaction.date}</td>
                    <td className="py-3">{transaction.narration}</td>
                    {!selectedCashBook?.currency.is_base && (
                      <>
                        <td className="py-3 text-right">
                          {formatAmount(transaction.document_amount)}
                        </td>
                        <td className="py-3">{transaction.currency_code}</td>
                        <td className="py-3 text-right">
                          {transaction.exchange_rate.toFixed(4)}
                        </td>
                      </>
                    )}
                    <td className="py-3 text-right">{formatAmount(transaction.debit)}</td>
                    <td className="py-3 text-right">{formatAmount(transaction.credit)}</td>
                    <td className="py-3 text-right">{formatAmount(transaction.balance)}</td>
                  </tr>
                ))}
                {transactions.length === 0 && !selectedCashBook && (
                  <tr>
                    <td
                      colSpan={selectedCashBook?.currency.is_base ? 5 : 8}
                      className="py-4 text-center text-gray-500 dark:text-gray-400"
                    >
                      Please select a cash book to view transactions
                    </td>
                  </tr>
                )}
                {transactions.length === 0 && selectedCashBook && (
                  <tr>
                    <td
                      colSpan={selectedCashBook.currency.is_base ? 5 : 8}
                      className="py-4 text-center text-gray-500 dark:text-gray-400"
                    >
                      No transactions found for the selected date range
                    </td>
                  </tr>
                )}
              </tbody>
              {/* Total / Closing Balance Row */}
              {selectedCashBook && (transactions.length > 0 || openingBalance[0]?.balance !== 0) && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                    <td className="py-3">Total / Closing Balance</td>
                    <td className="py-3"></td>
                    {!selectedCashBook.currency.is_base && (
                      <>
                        <td className="py-3 text-right">{formatAmount(totals.docAmount)}</td>
                        <td className="py-3"></td>
                        <td className="py-3"></td>
                      </>
                    )}
                    <td className="py-3 text-right">{formatAmount(totals.debit)}</td>
                    <td className="py-3 text-right">{formatAmount(totals.credit)}</td>
                    <td className="py-3 text-right">
                      {formatAmount(closingBalance[0]?.balance || 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}