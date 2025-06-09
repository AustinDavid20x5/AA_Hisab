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

interface BankBook {
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

export default function BankBook() {
  const [bankBooks, setBankBooks] = useState<BankBook[]>([]);
  const [selectedBankBook, setSelectedBankBook] = useState<BankBook | null>(null);
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
    fetchBankBooks().catch(err => {
      console.error('Error in initial fetch:', err);
      setError('Failed to load bank books');
    });
  }, []);

  useEffect(() => {
    if (selectedBankBook) {
      fetchTransactions().catch(err => {
        console.error('Error fetching transactions:', err);
        setError('Failed to load transactions');
      });
    }
  }, [selectedBankBook, dateRange, customStartDate, customEndDate]);

  const fetchBankBooks = async () => {
    try {
      setIsLoading(true);
      
      // First, get the subcategory ID for 'Bank'
      const { data: subcategoryData, error: subcategoryError } = await supabase
        .from('subcategories')
        .select('id')
        .eq('name', 'Bank')
        .single();

      if (subcategoryError) throw subcategoryError;
      
      if (!subcategoryData) {
        throw new Error('Bank subcategory not found');
      }

      // Then use that ID to filter chart_of_accounts
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
        .eq('subcategory_id', subcategoryData.id)
        .eq('is_active', true);

      if (error) throw error;
      setBankBooks(data || []);
    } catch (error) {
      console.error('Error fetching bank books:', error);
      toast.error('Failed to fetch bank books');
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
        currency_id: selectedBankBook?.currency.id || '',
        currency_code: selectedBankBook?.currency.code || ''
      }]);

      return balance;
    } catch (error) {
      console.error('Error fetching opening balance:', error);
      toast.error('Failed to fetch opening balance');
      return 0;
    }
  };

  const fetchTransactions = async () => {
    if (!selectedBankBook) return;

    try {
      setIsLoading(true);
      setError(null);

      const { start, end } = getDateRange();

      // Calculate opening balance based on transactions before the start date
      const openingBalanceAmount = await fetchOpeningBalance(selectedBankBook.id, start);

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
          currency_id: selectedBankBook.currency.id,
          currency_code: selectedBankBook.currency.code
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
        .eq('account_id', selectedBankBook.id)
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
        currency_id: selectedBankBook.currency.id,
        currency_code: selectedBankBook.currency.code
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
      if (!selectedBankBook || transactions.length === 0) {
        toast.error('No data to export');
        return;
      }

      // Import html2pdf dynamically
      import('html2pdf.js').then(async (html2pdf) => {
        const { generatePrintLogoHTML } = await import('../../lib/printLogo');
        
        const { start, end } = getDateRange();
        const isBase = selectedBankBook.currency.is_base;
        
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
                <div style="font-size: 18px; font-weight: bold; color: #000;">Bank Book Report</div>
              </div>
              <div style="flex: 1; text-align: right;">
                <div style="font-size: 10px; color: #666;">Print Date & Time: ${getCurrentDateTimeFormatted()}</div>
              </div>
            </div>
            
            <!-- Report Info -->
            <div style="margin-bottom: 15px; font-size: 12px;">
              <p style="margin: 3px 0; color: #000;">Bank Book: ${selectedBankBook.code} - ${selectedBankBook.name}</p>
              <p style="margin: 3px 0; color: #000;">Currency: ${selectedBankBook.currency.code}</p>
              <p style="margin: 3px 0; color: #000;">Period: ${formatDateDDMMYYYY(start)} to ${formatDateDDMMYYYY(end)}</p>
            </div>
            
            <!-- Bank Book Table -->
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
                <!-- Opening Balance Row -->
                <tr>
                  <td style="border: 1px solid #333; padding: 4px; text-align: left;">Opening Balance</td>
                  <td style="border: 1px solid #333; padding: 4px; text-align: left;"></td>
                  ${!isBase 
                    ? '<td style="border: 1px solid #333; padding: 4px; text-align: right;"></td><td style="border: 1px solid #333; padding: 4px; text-align: left;"></td><td style="border: 1px solid #333; padding: 4px; text-align: right;"></td>'
                    : ''
                  }
                  <td style="border: 1px solid #333; padding: 4px; text-align: right;">${openingBalance[0]?.balance > 0 ? formatAmount(openingBalance[0].balance) : ''}</td>
                  <td style="border: 1px solid #333; padding: 4px; text-align: right;">${openingBalance[0]?.balance < 0 ? formatAmount(Math.abs(openingBalance[0].balance)) : ''}</td>
                  <td style="border: 1px solid #333; padding: 4px; text-align: right;">${formatAmount(openingBalance[0]?.balance || 0)}</td>
                </tr>
                
                ${transactions.map(transaction => `
                  <tr>
                    <td style="border: 1px solid #333; padding: 4px; text-align: left;">${transaction.date}</td>
                    <td style="border: 1px solid #333; padding: 4px; text-align: left;">${transaction.narration}</td>
                    ${!isBase 
                      ? `<td style="border: 1px solid #333; padding: 4px; text-align: right;">${formatAmount(transaction.document_amount)}</td><td style="border: 1px solid #333; padding: 4px; text-align: left;">${transaction.currency_code}</td><td style="border: 1px solid #333; padding: 4px; text-align: right;">${transaction.exchange_rate.toFixed(4)}</td>`
                      : ''
                    }
                    <td style="border: 1px solid #333; padding: 4px; text-align: right;">${formatAmount(transaction.debit)}</td>
                    <td style="border: 1px solid #333; padding: 4px; text-align: right;">${formatAmount(transaction.credit)}</td>
                    <td style="border: 1px solid #333; padding: 4px; text-align: right;">${formatAmount(transaction.balance)}</td>
                  </tr>
                `).join('')}
                
                <!-- Total / Closing Balance Row -->
                <tr style="font-weight: bold; background-color: #f0f0f0;">
                  <td style="border: 1px solid #333; padding: 4px; text-align: left;">Total / Closing Balance</td>
                  <td style="border: 1px solid #333; padding: 4px; text-align: left;"></td>
                  ${!isBase 
                    ? `<td style="border: 1px solid #333; padding: 4px; text-align: right;">${formatAmount(totals.docAmount)}</td><td style="border: 1px solid #333; padding: 4px; text-align: left;"></td><td style="border: 1px solid #333; padding: 4px; text-align: right;"></td>`
                    : ''
                  }
                  <td style="border: 1px solid #333; padding: 4px; text-align: right;">${formatAmount(totals.debit)}</td>
                  <td style="border: 1px solid #333; padding: 4px; text-align: right;">${formatAmount(totals.credit)}</td>
                  <td style="border: 1px solid #333; padding: 4px; text-align: right;">${formatAmount(closingBalance[0]?.balance || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;

        // Create a temporary element to hold the HTML content
        const tempElement = document.createElement('div');
        tempElement.innerHTML = htmlContent;
        
        // Add CSS styles
        const style = document.createElement('style');
        style.textContent = printLogoCSS;
        document.head.appendChild(style);
        
        // Append to body temporarily
        document.body.appendChild(tempElement);

        const options = {
          margin: [10, 10, 10, 10],
          filename: `Bank_Book_Report_${selectedBankBook.code}_${format(start, 'ddMMyyyy')}_to_${format(end, 'ddMMyyyy')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { 
            scale: 2,
            useCORS: true,
            letterRendering: true
          },
          jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'landscape'
          }
        };

        html2pdf.default().from(tempElement).set(options).save().then(() => {
          // Clean up
          document.body.removeChild(tempElement);
          document.head.removeChild(style);
          toast.success('PDF exported successfully');
        }).catch((error) => {
          console.error('PDF export error:', error);
          document.body.removeChild(tempElement);
          document.head.removeChild(style);
          toast.error('Failed to export PDF');
        });
      }).catch(error => {
        console.error('Error loading html2pdf:', error);
        toast.error('Failed to load PDF export library');
      });
    } catch (error) {
      console.error('Error in exportToPDF:', error);
      toast.error('Failed to export PDF');
    }
  };

  const handlePrint = () => {
    try {
      if (!selectedBankBook || transactions.length === 0) {
        toast.error('No data to print');
        return;
      }

      const { start, end } = getDateRange();
      const isBase = selectedBankBook.currency.is_base;
      
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

      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Bank Book Report</title>
          <style>
            @media print {
              @page {
                size: A4 landscape;
                margin: 0.5in;
              }
              body {
                font-family: Arial, sans-serif;
                font-size: 10px;
                color: #000;
                background: white;
                margin: 0;
                padding: 0;
              }
              .no-print {
                display: none;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                page-break-inside: auto;
              }
              tr {
                page-break-inside: avoid;
                page-break-after: auto;
              }
              th, td {
                border: 1px solid #333;
                padding: 4px;
                text-align: left;
              }
              th {
                background-color: #f0f0f0;
                font-weight: bold;
                text-align: center;
              }
              .text-right {
                text-align: right;
              }
              .text-center {
                text-align: center;
              }
              .font-bold {
                font-weight: bold;
              }
              .print-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                width: 100%;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 2px solid #333;
              }
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
              .print-report-title {
                font-size: 18px;
                font-weight: bold;
                color: #000;
                text-align: center;
                flex: 2;
              }
              .print-date {
                font-size: 10px;
                color: #666;
                text-align: right;
                flex: 1;
              }
              .report-info {
                margin-bottom: 15px;
                font-size: 12px;
              }
              .report-info p {
                margin: 3px 0;
                color: #000;
              }
            }
            
            body {
              font-family: Arial, sans-serif;
              font-size: 10px;
              color: #000;
              background: white;
              margin: 0;
              padding: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #333;
              padding: 4px;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
              font-weight: bold;
              text-align: center;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            .font-bold {
              font-weight: bold;
            }
            .print-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              width: 100%;
              margin-bottom: 20px;
              padding-bottom: 15px;
              border-bottom: 2px solid #333;
            }
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
            .print-report-title {
              font-size: 18px;
              font-weight: bold;
              color: #000;
              text-align: center;
              flex: 2;
            }
            .print-date {
              font-size: 10px;
              color: #666;
              text-align: right;
              flex: 1;
            }
            .report-info {
              margin-bottom: 15px;
              font-size: 12px;
            }
            .report-info p {
              margin: 3px 0;
              color: #000;
            }
          </style>
        </head>
        <body>
          <!-- Header Section -->
          <div class="print-header">
            <div style="flex: 1; display: flex; align-items: center;">
              ${generatePrintLogoHTML()}
            </div>
            <div class="print-report-title">Bank Book Report</div>
            <div class="print-date">Print Date & Time: ${getCurrentDateTimeFormatted()}</div>
          </div>
          
          <!-- Report Info -->
          <div class="report-info">
            <p>Bank Book: ${selectedBankBook.code} - ${selectedBankBook.name}</p>
            <p>Currency: ${selectedBankBook.currency.code}</p>
            <p>Period: ${formatDateDDMMYYYY(start)} to ${formatDateDDMMYYYY(end)}</p>
          </div>
          
          <!-- Bank Book Table -->
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Narration</th>
                ${!isBase ? '<th>Doc. Amount</th><th>Currency</th><th>Rate</th>' : ''}
                <th>Debit</th>
                <th>Credit</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              <!-- Opening Balance Row -->
              <tr>
                <td>Opening Balance</td>
                <td></td>
                ${!isBase ? '<td></td><td></td><td></td>' : ''}
                <td class="text-right">${openingBalance[0]?.balance > 0 ? formatAmount(openingBalance[0].balance) : ''}</td>
                <td class="text-right">${openingBalance[0]?.balance < 0 ? formatAmount(Math.abs(openingBalance[0].balance)) : ''}</td>
                <td class="text-right">${formatAmount(openingBalance[0]?.balance || 0)}</td>
              </tr>
              
              ${transactions.map(transaction => `
                <tr>
                  <td>${transaction.date}</td>
                  <td>${transaction.narration}</td>
                  ${!isBase ? `<td class="text-right">${formatAmount(transaction.document_amount)}</td><td>${transaction.currency_code}</td><td class="text-right">${transaction.exchange_rate.toFixed(4)}</td>` : ''}
                  <td class="text-right">${formatAmount(transaction.debit)}</td>
                  <td class="text-right">${formatAmount(transaction.credit)}</td>
                  <td class="text-right">${formatAmount(transaction.balance)}</td>
                </tr>
              `).join('')}
              
              <!-- Total / Closing Balance Row -->
              <tr class="font-bold" style="background-color: #f0f0f0;">
                <td>Total / Closing Balance</td>
                <td></td>
                ${!isBase ? `<td class="text-right">${formatAmount(totals.docAmount)}</td><td></td><td></td>` : ''}
                <td class="text-right">${formatAmount(totals.debit)}</td>
                <td class="text-right">${formatAmount(totals.credit)}</td>
                <td class="text-right">${formatAmount(closingBalance[0]?.balance || 0)}</td>
              </tr>
            </tbody>
          </table>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        
        // Wait for content to load before printing
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
        
        toast.success('Print dialog opened');
      } else {
        toast.error('Failed to open print dialog. Please check your popup blocker.');
      }
    } catch (error) {
      console.error('Error in handlePrint:', error);
      toast.error('Failed to print');
    }
  };

  const exportToExcel = () => {
    try {
      if (!selectedBankBook || transactions.length === 0) {
        toast.error('No data to export');
        return;
      }

      const { start, end } = getDateRange();
      const isBase = selectedBankBook.currency.is_base;
      
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

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      
      // Prepare data for Excel
      const excelData = [];
      
      // Add header information
      excelData.push(['Bank Book Report']);
      excelData.push([]);
      excelData.push([`Bank Book: ${selectedBankBook.code} - ${selectedBankBook.name}`]);
      excelData.push([`Currency: ${selectedBankBook.currency.code}`]);
      excelData.push([`Period: ${formatDateDDMMYYYY(start)} to ${formatDateDDMMYYYY(end)}`]);
      excelData.push([`Generated: ${getCurrentDateTimeFormatted()}`]);
      excelData.push([]);
      
      // Add table headers
      const headers = ['Date', 'Narration'];
      if (!isBase) {
        headers.push('Doc. Amount', 'Currency', 'Rate');
      }
      headers.push('Debit', 'Credit', 'Balance');
      excelData.push(headers);
      
      // Add opening balance row
      const openingRow = ['Opening Balance', ''];
      if (!isBase) {
        openingRow.push('', '', '');
      }
      openingRow.push(
        openingBalance[0]?.balance > 0 ? openingBalance[0].balance : '',
        openingBalance[0]?.balance < 0 ? Math.abs(openingBalance[0].balance) : '',
        openingBalance[0]?.balance || 0
      );
      excelData.push(openingRow);
      
      // Add transaction rows
      transactions.forEach(transaction => {
        const row = [transaction.date, transaction.narration];
        if (!isBase) {
          row.push(transaction.document_amount, transaction.currency_code, transaction.exchange_rate);
        }
        row.push(transaction.debit, transaction.credit, transaction.balance);
        excelData.push(row);
      });
      
      // Add total row
      const totalRow = ['Total / Closing Balance', ''];
      if (!isBase) {
        totalRow.push(totals.docAmount, '', '');
      }
      totalRow.push(totals.debit, totals.credit, closingBalance[0]?.balance || 0);
      excelData.push(totalRow);
      
      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      
      // Set column widths
      const colWidths = [{ wch: 12 }, { wch: 30 }]; // Date, Narration
      if (!isBase) {
        colWidths.push({ wch: 15 }, { wch: 10 }, { wch: 10 }); // Doc Amount, Currency, Rate
      }
      colWidths.push({ wch: 15 }, { wch: 15 }, { wch: 15 }); // Debit, Credit, Balance
      ws['!cols'] = colWidths;
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Bank Book Report');
      
      // Generate filename
      const filename = `Bank_Book_Report_${selectedBankBook.code}_${format(start, 'ddMMyyyy')}_to_${format(end, 'ddMMyyyy')}.xlsx`;
      
      // Save file
      XLSX.writeFile(wb, filename);
      toast.success('Excel file exported successfully');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('Failed to export Excel file');
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              fetchBankBooks();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading && !bankBooks.length) {
    return <LoadingSpinner title="Loading Bank Book Report..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Bank Book Report</h1>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 ${
              !selectedBankBook || transactions.length === 0
                ? 'bg-gray-400 text-gray-600 border-gray-500 cursor-not-allowed opacity-50'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-blue-800 hover:border-blue-900'
            }`}
            disabled={!selectedBankBook || transactions.length === 0}
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={exportToExcel}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 ${
              !selectedBankBook || transactions.length === 0
                ? 'bg-gray-400 text-gray-600 border-gray-500 cursor-not-allowed opacity-50'
                : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-green-800 hover:border-green-900'
            }`}
            disabled={!selectedBankBook || transactions.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
          <button
            onClick={exportToPDF}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 ${
              !selectedBankBook || transactions.length === 0
                ? 'bg-gray-400 text-gray-600 border-gray-500 cursor-not-allowed opacity-50'
                : 'bg-red-600 text-white hover:bg-red-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-red-800 hover:border-red-900'
            }`}
            disabled={!selectedBankBook || transactions.length === 0}
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
                Bank Book
              </label>
              <select
                value={selectedBankBook?.id || ''}
                onChange={(e) => {
                  const bankBook = bankBooks.find(bb => bb.id === e.target.value);
                  setSelectedBankBook(bankBook || null);
                }}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select Bank Book</option>
                {bankBooks.map(bb => (
                  <option key={bb.id} value={bb.id}>
                    {bb.name} ({bb.currency.code})
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

          {selectedBankBook && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Opening balance card */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div className="text-sm text-blue-600 dark:text-blue-300">
                  Opening Balance ({selectedBankBook.currency.code})
                </div>
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-200">
                  {formatAmount(openingBalance[0]?.balance || 0)}
                </div>
              </div>
              {/* Closing balance card */}
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <div className="text-sm text-green-600 dark:text-green-300">
                  Closing Balance ({selectedBankBook.currency.code})
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
                  {!selectedBankBook?.currency.is_base && (
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
                {selectedBankBook && (
                  <tr>
                    <td className="py-3">Opening Balance</td>
                    <td className="py-3"></td>
                    {!selectedBankBook.currency.is_base && (
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
                    {!selectedBankBook?.currency.is_base && (
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
                {transactions.length === 0 && !selectedBankBook && (
                  <tr>
                    <td
                      colSpan={selectedBankBook?.currency.is_base ? 5 : 8}
                      className="py-4 text-center text-gray-500 dark:text-gray-400"
                    >
                      Please select a bank book to view transactions
                    </td>
                  </tr>
                )}
                {transactions.length === 0 && selectedBankBook && (
                  <tr>
                    <td
                      colSpan={selectedBankBook.currency.is_base ? 5 : 8}
                      className="py-4 text-center text-gray-500 dark:text-gray-400"
                    >
                      No transactions found for the selected date range
                    </td>
                  </tr>
                )}
              </tbody>
              {/* Total / Closing Balance Row */}
              {selectedBankBook && (transactions.length > 0 || openingBalance[0]?.balance !== 0) && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                    <td className="py-3">Total / Closing Balance</td>
                    <td className="py-3"></td>
                    {!selectedBankBook.currency.is_base && (
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