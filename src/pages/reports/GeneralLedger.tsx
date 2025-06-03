import React, { useState, useEffect, useRef } from 'react';
import { format, subDays, subMonths, startOfDay, endOfDay, isValid } from 'date-fns';
import { Download, Printer, FileSpreadsheet, FileText, Calendar, Search, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { AppLogo } from '../../components/AppLogo';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { formatAmount } from '../../lib/format';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ResizableHeader } from '../../components/ResizableHeader';
import '../../styles/resizable.css';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { generatePrintLogoHTML, printLogoCSS } from '../../lib/printLogo';
import html2pdf from 'html2pdf.js';


interface Account {
  id: string;
  code: string;
  name: string;
}

interface Currency {
  id: string;
  code: string;
  name: string;
  exchange_rate_note: 'multiply' | 'divide';
  rate: number;
  is_base: boolean;
}

interface Transaction {
  date: string;
  transaction_type: string;
  narration: string;
  document_currency_amount: number;
  currency_code: string;
  exchange_rate: number;
  debit: number;
  credit: number;
  debit_doc_currency: number;
  credit_doc_currency: number;
  running_balance: number;
  running_balance_doc: number;
}

type DateRange = 'last_week' | 'last_month' | 'custom';
type SearchColumn = 'all' | 'date' | 'type' | 'narration' | 'currency' | 'amount';
type SortColumn = 'date' | 'type' | 'narration' | 'currency' | 'rate' | 'debit' | 'credit' | 'balance';
type SortDirection = 'asc' | 'desc';
type DisplayMode = 'local' | 'document';

interface ColumnFilter {
  column: string;
  value: string;
}

interface OpeningBalance {
  debit: number;
  credit: number;
  balance: number;
}

export default function GeneralLedger() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange>('last_month');
  const [customStartDate, setCustomStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [displayMode, setDisplayMode] = useState<DisplayMode>('local');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchColumn, setSearchColumn] = useState<SearchColumn>('all');
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<{ id: string; code: string }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<OpeningBalance>({ debit: 0, credit: 0, balance: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [totals, setTotals] = useState<{ debit: number; credit: number }>({ debit: 0, credit: 0 });
  const [isReportGenerated, setIsReportGenerated] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const {
    columnWidths,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    isResizing
  } = useResizableColumns({
    date: 100,
    type: 150,
    narration: 300,
    docAmount: 120,
    currency: 100,
    rate: 100,
    debit: 120,
    credit: 120,
    balance: 120
  });

  // Filter accounts based on search
  const filteredAccounts = accounts.filter(account => {
    const search = searchTerm.toLowerCase();
    return (
      account.code.toLowerCase().includes(search) ||
      account.name.toLowerCase().includes(search)
    );
  });

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      document.body.classList.add('resizing');
    } else {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      document.body.classList.remove('resizing');
    }
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      document.body.classList.remove('resizing');
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  useEffect(() => {
    loadAccounts();
    loadCurrencies();
  }, []);

  const handleGenerateReport = () => {
    if (selectedAccount) {
      fetchTransactions();
      setIsReportGenerated(true);
    } else {
      toast.error('Please select an account first');
    }
  };

  useEffect(() => {
    const filtered = filterAndSortTransactions();
    setFilteredTransactions(filtered);
  }, [searchText, searchColumn, transactions, sortColumn, sortDirection, columnFilters]);

  // Reset report generated state when account or date range changes
  useEffect(() => {
    setIsReportGenerated(false);
  }, [selectedAccount, dateRange, customStartDate, customEndDate]);

  const loadAccounts = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error loading accounts:', error);
      toast.error('Failed to load accounts');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCurrencies = async () => {
    try {
      const { data, error } = await supabase
        .from('currencies')
        .select('id, code')
        .order('code');

      if (error) throw error;
      setCurrencies(data || []);
    } catch (error) {
      console.error('Error loading currencies:', error);
      toast.error('Failed to load currencies');
    }
  };

  const getCurrencyCode = (currencyId: string): string => {
    const currency = currencies.find(c => c.id === currencyId);
    return currency?.code || '';
  };

  const checkReportGenerated = () => {
    if (!isReportGenerated) {
      setShowErrorModal(true);
      return false;
    }
    return true;
  };

  const handlePrintWithCheck = () => {
    if (checkReportGenerated()) {
      handlePrint();
    }
  };

  const handleExcelWithCheck = () => {
    if (checkReportGenerated()) {
      exportToExcel();
    }
  };

  const handlePDFWithCheck = () => {
    if (checkReportGenerated()) {
      exportToPDF();
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
        totalDebit += Number(transaction.debit) || 0;
        totalCredit += Number(transaction.credit) || 0;
      });

      const balance = totalDebit - totalCredit;

      setOpeningBalance({
        debit: totalDebit,
        credit: totalCredit,
        balance: balance
      });

      return balance;
    } catch (error) {
      console.error('Error fetching opening balance:', error);
      toast.error('Failed to fetch opening balance');
      return 0;
    }
  };

  const fetchTransactions = async () => {
    try {
      if (!selectedAccount) {
        setTransactions([]);
        setOpeningBalance({ debit: 0, credit: 0, balance: 0 });
        setTotals({ debit: 0, credit: 0 }); // Reset totals when no account is selected
        return;
      }

      setIsLoading(true);
      setError(null);

      const { start, end } = getDateRange();
      
      if (!isValid(start) || !isValid(end)) {
        throw new Error('Invalid date range');
      }

      // First fetch the opening balance
      const openingBalanceAmount = await fetchOpeningBalance(selectedAccount, start);

      const { data: headerData, error: headerError } = await supabase
        .from('gl_headers')
        .select(`
          id,
          transaction_date,
          type_id,
          description,
          tbl_trans_type!inner(
            transaction_type_code,
            description
          )
        `)
        .gte('transaction_date', format(start, 'yyyy-MM-dd'))
        .lte('transaction_date', format(end, 'yyyy-MM-dd'))
        .order('transaction_date', { ascending: true });

      if (headerError) throw headerError;

      if (!headerData?.length) {
        setTransactions([]);
        setTotals({ debit: 0, credit: 0 }); // Reset totals if no transactions
        return;
      }

      const { data: transactionData, error: transactionError } = await supabase
        .from('gl_transactions')
        .select(`
          id,
          header_id,
          debit,
          credit,
          debit_doc_currency,
          credit_doc_currency,
          exchange_rate,
          currency_id,
          description
        `)
        .eq('account_id', selectedAccount)
        .in('header_id', headerData.map(h => h.id));

      if (transactionError) throw transactionError;

      // First map transactions to our format without calculating running balance
      const mappedTransactions = transactionData
        .map(transaction => {
          const header = headerData.find(h => h.id === transaction.header_id);
          if (!header) return null;

          const debit = Number(transaction.debit) || 0;
          const credit = Number(transaction.credit) || 0;
          const debit_doc = Number(transaction.debit_doc_currency) || 0;
          const credit_doc = Number(transaction.credit_doc_currency) || 0;
          
          return {
            date: format(new Date(header.transaction_date), 'dd/MM/yyyy'),
            rawDate: new Date(header.transaction_date), // Store raw date for sorting
            transaction_type: header.tbl_trans_type.description,
            narration: transaction.description || header.description,
            document_currency_amount: debit_doc > 0 ? debit_doc : -credit_doc,
            currency_code: getCurrencyCode(transaction.currency_id),
            exchange_rate: Number(transaction.exchange_rate) || 1,
            debit,
            credit,
            debit_doc_currency: debit_doc,
            credit_doc_currency: credit_doc,
            running_balance: 0, // Will be calculated after sorting
            running_balance_doc: 0 // Will be calculated after sorting
          };
        })
        .filter((t): t is (Transaction & { rawDate: Date }) => t !== null);

      // Sort by date first using the raw Date object
      mappedTransactions.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
      
      // Now calculate running balances on the sorted data
      let runningBalance = openingBalanceAmount;
      let runningBalanceDoc = 0;
      
      const formattedTransactions = mappedTransactions.map(t => {
        runningBalance += t.debit - t.credit;
        runningBalanceDoc += t.debit_doc_currency - t.credit_doc_currency;
        
        return {
          ...t,
          running_balance: runningBalance,
          running_balance_doc: runningBalanceDoc
        };
      });

      // Remove the temporary rawDate property
      const finalTransactions = formattedTransactions.map(({ rawDate, ...rest }) => rest);

      // Calculate totals including opening balance
      const transactionTotals = finalTransactions.reduce(
        (acc, t) => ({
          debit: acc.debit + t.debit,
          credit: acc.credit + t.credit
        }),
        { debit: 0, credit: 0 }
      );
      
      // Add opening balance to totals
      const newTotals = {
        debit: transactionTotals.debit + (openingBalanceAmount > 0 ? openingBalanceAmount : 0),
        credit: transactionTotals.credit + (openingBalanceAmount < 0 ? Math.abs(openingBalanceAmount) : 0)
      };

      setTransactions(finalTransactions);
      setTotals(newTotals); // Update totals state
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setError('Failed to fetch transactions. Please ensure all dates are valid.');
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndSortTransactions = () => {
    let filtered = [...transactions];

    // Apply search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(transaction => {
        if (searchColumn === 'all') {
          return (
            transaction.date.toLowerCase().includes(searchLower) ||
            transaction.transaction_type.toLowerCase().includes(searchLower) ||
            transaction.narration.toLowerCase().includes(searchLower) ||
            transaction.currency_code.toLowerCase().includes(searchLower) ||
            transaction.debit.toString().includes(searchLower) ||
            transaction.credit.toString().includes(searchLower)
          );
        }

        switch (searchColumn) {
          case 'date':
            return transaction.date.toLowerCase().includes(searchLower);
          case 'type':
            return transaction.transaction_type.toLowerCase().includes(searchLower);
          case 'narration':
            return transaction.narration.toLowerCase().includes(searchLower);
          case 'currency':
            return transaction.currency_code.toLowerCase().includes(searchLower);
          case 'amount':
            return (
              transaction.debit.toString().includes(searchLower) ||
              transaction.credit.toString().includes(searchLower)
            );
          default:
            return true;
        }
      });
    }

    // Apply column filters
    columnFilters.forEach(filter => {
      filtered = filtered.filter(transaction => {
        const value = transaction[filter.column as keyof Transaction];
        return value?.toString().toLowerCase().includes(filter.value.toLowerCase());
      });
    });

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'date':
          // Parse dd/MM/yyyy format correctly
          const parseDate = (dateStr: string) => {
            const [day, month, year] = dateStr.split('/');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          };
          comparison = parseDate(a.date).getTime() - parseDate(b.date).getTime();
          break;
        case 'type':
          comparison = a.transaction_type.localeCompare(b.transaction_type);
          break;
        case 'narration':
          comparison = a.narration.localeCompare(b.narration);
          break;
        case 'currency':
          comparison = a.currency_code.localeCompare(b.currency_code);
          break;
        case 'rate':
          comparison = a.exchange_rate - b.exchange_rate;
          break;
        case 'debit':
          comparison = a.debit - b.debit;
          break;
        case 'credit':
          comparison = a.credit - b.credit;
          break;
        case 'balance':
          comparison = a.running_balance - b.running_balance;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const exportToExcel = () => {
    try {
      // Get the correct date range
      const currentDateRange = getDateRange();
      
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      
      // Helper function to parse date from dd/MM/yyyy format
      const parseExcelDate = (dateStr: string) => {
        const [day, month, year] = dateStr.split('/');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      };
      
      // Prepare header information with logo placeholder
      const headerData = [
        ['🏢 FinTrack Pro - Financial Management System'], // Added emoji as logo placeholder
        ['General Ledger Report'],
        [''],
        [`Account: ${selectedAccount ? (accounts.find(a => a.id === selectedAccount)?.code + ' - ' + accounts.find(a => a.id === selectedAccount)?.name) || 'All Accounts' : 'All Accounts'}`],
        [`Period: ${format(currentDateRange.start, 'dd/MM/yyyy')} to ${format(currentDateRange.end, 'dd/MM/yyyy')}`],
        [`Print Date & Time: ${getCurrentDateTimeFormatted()}`],
        [''],
        [''] // Extra space before table
      ];
      
      // Prepare table headers
      const tableHeaders = displayMode === 'document' 
        ? ['Date', 'Type', 'Description', 'Currency', 'Rate', 'Doc Amount', 'Debit', 'Credit', 'Balance']
        : ['Date', 'Type', 'Description', 'Debit', 'Credit', 'Balance'];
      
      // Prepare data for export including opening balance
      const exportData = [];
      
      // Add opening balance row with proper number formatting
      const openingBalanceRow = displayMode === 'document'
        ? [
            'Opening Balance', '', '', '', '', '',
            openingBalance.balance > 0 ? openingBalance.balance : 0,
            openingBalance.balance < 0 ? Math.abs(openingBalance.balance) : 0,
            openingBalance.balance
          ]
        : [
            'Opening Balance', '', '',
            openingBalance.balance > 0 ? openingBalance.balance : 0,
            openingBalance.balance < 0 ? Math.abs(openingBalance.balance) : 0,
            openingBalance.balance
          ];
      
      exportData.push(openingBalanceRow);
      
      // Add transaction rows with proper data types
      filteredTransactions.forEach(t => {
        if (displayMode === 'document') {
          exportData.push([
            parseExcelDate(t.date), // Convert to Date object
            t.transaction_type,
            t.narration,
            t.currency_code,
            t.exchange_rate, // Keep as number
            t.document_currency_amount, // Keep as number
            t.debit, // Keep as number
            t.credit, // Keep as number
            t.running_balance // Keep as number
          ]);
        } else {
          exportData.push([
            parseExcelDate(t.date), // Convert to Date object
            t.transaction_type,
            t.narration,
            t.debit, // Keep as number
            t.credit, // Keep as number
            t.running_balance // Keep as number
          ]);
        }
      });
      
      // Add totals row with proper number formatting
      const totalsRow = displayMode === 'document'
        ? [
            'Total / Closing Balance', '', '', '', '', '',
            totals.debit,
            totals.credit,
            totals.debit - totals.credit
          ]
        : [
            'Total / Closing Balance', '', '',
            totals.debit,
            totals.credit,
            totals.debit - totals.credit
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
      const colWidths = displayMode === 'document'
        ? [{ wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]
        : [{ wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      
      ws['!cols'] = colWidths;
      
      // Style the header rows
      const headerRowCount = headerData.length;
      const tableHeaderRow = headerRowCount;
      const openingBalanceRowIndex = headerRowCount + 1;
      const totalsRowIndex = headerRowCount + 1 + exportData.length - 1;
      
      // Apply styles to specific cells
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      
      // Style company name (first row) - LEFT ALIGNED
      if (ws['A1']) {
        ws['A1'].s = {
          font: { bold: true, sz: 16 },
          alignment: { horizontal: 'left' } // Changed from center to left
        };
      }
      
      // Style report title (second row) - LEFT ALIGNED
      if (ws['A2']) {
        ws['A2'].s = {
          font: { bold: true, sz: 14 },
          alignment: { horizontal: 'left' } // Changed from center to left
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
      const dateFormat = 'dd/mm/yyyy';
      
      // Get column indices for different data types
      const dateColIndex = 0;
      const debitColIndex = displayMode === 'document' ? 6 : 3;
      const creditColIndex = displayMode === 'document' ? 7 : 4;
      const balanceColIndex = displayMode === 'document' ? 8 : 5;
      const rateColIndex = displayMode === 'document' ? 4 : -1;
      const docAmountColIndex = displayMode === 'document' ? 5 : -1;
      
      // Style opening balance row with number formatting
      for (let col = 0; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: openingBalanceRowIndex, c: col });
        if (ws[cellAddress]) {
          const baseStyle = {
            font: { bold: true },
            fill: { fgColor: { rgb: 'F9F9F9' } },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            }
          };
          
          // Add number formatting for financial columns
          if (col === debitColIndex || col === creditColIndex || col === balanceColIndex || 
              (displayMode === 'document' && (col === rateColIndex || col === docAmountColIndex))) {
            ws[cellAddress].s = { ...baseStyle, numFmt: currencyFormat };
          } else {
            ws[cellAddress].s = baseStyle;
          }
        }
      }
      
      // Style totals row with number formatting
      for (let col = 0; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: totalsRowIndex, c: col });
        if (ws[cellAddress]) {
          const baseStyle = {
            font: { bold: true },
            fill: { fgColor: { rgb: 'E6F3FF' } },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            }
          };
          
          // Add number formatting for financial columns
          if (col === debitColIndex || col === creditColIndex || col === balanceColIndex || 
              (displayMode === 'document' && (col === rateColIndex || col === docAmountColIndex))) {
            ws[cellAddress].s = { ...baseStyle, numFmt: currencyFormat };
          } else {
            ws[cellAddress].s = baseStyle;
          }
        }
      }
      
      // Add borders and formatting to all data cells
      for (let row = tableHeaderRow + 1; row < totalsRowIndex; row++) {
        for (let col = 0; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          if (ws[cellAddress]) {
            const baseStyle = {
              border: {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
              }
            };
            
            // Add specific formatting based on column type
            if (col === dateColIndex) {
              // Date formatting
              ws[cellAddress].s = { ...baseStyle, numFmt: dateFormat };
            } else if (col === debitColIndex || col === creditColIndex || col === balanceColIndex || 
                      (displayMode === 'document' && (col === rateColIndex || col === docAmountColIndex))) {
              // Number formatting for financial columns
              ws[cellAddress].s = { ...baseStyle, numFmt: currencyFormat };
            } else {
              // Default formatting for text columns
              ws[cellAddress].s = baseStyle;
            }
          }
        }
      }
      
      // Generate filename with account and date range
      const filename = `General_Ledger_${selectedAccount ? accounts.find(a => a.id === selectedAccount)?.code || 'All' : 'All'}_${format(currentDateRange.start, 'ddMMyyyy')}_${format(currentDateRange.end, 'ddMMyyyy')}.xlsx`;
      
      XLSX.utils.book_append_sheet(wb, ws, 'General Ledger');
      XLSX.writeFile(wb, filename);

      toast.success('Report exported to Excel successfully');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('Failed to export to Excel');
    }
  };

  const exportToPDF = async () => {
    try {
      // Get the correct date range
      const currentDateRange = getDateRange();
      
      // Create HTML content for PDF
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #000; background: white; padding: 20px;">
          <!-- Header Section -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #333;">
            <div style="flex: 1; display: flex; align-items: center;">
              ${generatePrintLogoHTML()}
            </div>
            <div style="flex: 2; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; color: #000;">General Ledger Report</div>
            </div>
            <div style="flex: 1; text-align: right;">
              <div style="font-size: 10px; color: #666;">Print Date & Time: ${getCurrentDateTimeFormatted()}</div>
            </div>
          </div>
          
          <!-- Report Info -->
          <div style="margin-bottom: 15px; font-size: 12px;">
            <p style="margin: 3px 0; color: #000;">Account: ${selectedAccount ? (accounts.find(a => a.id === selectedAccount)?.code + ' - ' + accounts.find(a => a.id === selectedAccount)?.name) || 'All Accounts' : 'All Accounts'}</p>
            <p style="margin: 3px 0; color: #000;">Period: ${format(currentDateRange.start, 'dd/MM/yyyy')} to ${format(currentDateRange.end, 'dd/MM/yyyy')}</p>
          </div>
          
          <!-- Transaction Table -->
          <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin: 0;">
            <thead>
              <tr>
                ${displayMode === 'document' 
                  ? '<th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Date</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Type</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Description</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Currency</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Rate</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Doc Amount</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Debit</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Credit</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Balance</th>'
                  : '<th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Date</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Type</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Description</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Debit</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Credit</th><th style="border: 1px solid #333; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Balance</th>'
                }
              </tr>
            </thead>
            <tbody>
              <tr style="background-color: #f9f9f9;">
                <td style="border: 1px solid #333; padding: 6px; font-weight: bold;">Opening Balance</td>
                <td style="border: 1px solid #333; padding: 6px;"></td>
                <td style="border: 1px solid #333; padding: 6px;"></td>
                ${displayMode === 'document' ? '<td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td><td style="border: 1px solid #333; padding: 6px;"></td>' : ''}
                <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${openingBalance.balance > 0 ? formatAmount(openingBalance.balance) : ''}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${openingBalance.balance < 0 ? formatAmount(Math.abs(openingBalance.balance)) : ''}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(openingBalance.balance)}</td>
              </tr>
              ${filteredTransactions.map(t => `
                <tr>
                  <td style="border: 1px solid #333; padding: 6px;">${t.date}</td>
                  <td style="border: 1px solid #333; padding: 6px;">${t.transaction_type}</td>
                  <td style="border: 1px solid #333; padding: 6px;">${t.narration}</td>
                  ${displayMode === 'document' 
                    ? `<td style="border: 1px solid #333; padding: 6px;">${t.currency_code}</td><td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(t.exchange_rate)}</td><td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(t.document_currency_amount)}</td>`
                    : ''
                  }
                  <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(t.debit)}</td>
                  <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(t.credit)}</td>
                  <td style="border: 1px solid #333; padding: 6px; text-align: right;">${formatAmount(t.running_balance)}</td>
                </tr>
              `).join('')}
              <tr style="background-color: #e6f3ff;">
                <td colspan="${displayMode === 'document' ? '6' : '3'}" style="border: 1px solid #333; padding: 6px; font-weight: bold;">Total / Closing Balance</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(totals.debit)}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(totals.credit)}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: right; font-weight: bold;">${formatAmount(totals.debit - totals.credit)}</td>
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
        margin: [0.5, 0.75, 0.5, 0.75],
        filename: `General_Ledger_${selectedAccount ? accounts.find(a => a.id === selectedAccount)?.code || 'All' : 'All'}_${format(currentDateRange.start, 'ddMMyyyy')}_${format(currentDateRange.end, 'ddMMyyyy')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff'
        },
        jsPDF: { 
          unit: 'in', 
          format: 'a4', 
          orientation: 'landscape'
        }
      };
      
      // Generate and download PDF
      await html2pdf().set(options).from(htmlContent).save();
      
      toast.success('PDF exported successfully!');
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
      // Get the correct date range
      const currentDateRange = getDateRange();
      
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
              <div class="print-report-title">General Ledger Report</div>
            </div>
            <div class="print-right-section">
              <div class="print-date">Print Date & Time: ${getCurrentDateTimeFormatted()}</div>
            </div>
          </div>
        </div>
        <div class="print-main-content">
          <div class="print-report-info">
            <p>Account: ${selectedAccount ? (accounts.find(a => a.id === selectedAccount)?.code + ' - ' + accounts.find(a => a.id === selectedAccount)?.name) || 'All Accounts' : 'All Accounts'}</p>
            <p>Period: ${format(currentDateRange.start, 'dd/MM/yyyy')} to ${format(currentDateRange.end, 'dd/MM/yyyy')}</p>
          </div>
          <table class="print-table">
            <thead>
              <tr>
                ${displayMode === 'document' 
                  ? '<th>Date</th><th>Type</th><th>Description</th><th>Currency</th><th>Rate</th><th>Doc Amount</th><th class="number">Debit</th><th class="number">Credit</th><th class="number">Balance</th>'
                  : '<th>Date</th><th>Type</th><th>Description</th><th class="number">Debit</th><th class="number">Credit</th><th class="number">Balance</th>'
                }
              </tr>
            </thead>
            <tbody>
              <tr class="opening-balance-row">
                <td>Opening Balance</td>
                <td></td>
                <td></td>
                ${displayMode === 'document' ? '<td></td><td></td><td></td>' : ''}
                <td class="number">${openingBalance.balance > 0 ? formatAmount(openingBalance.balance) : ''}</td>
                <td class="number">${openingBalance.balance < 0 ? formatAmount(Math.abs(openingBalance.balance)) : ''}</td>
                <td class="number">${formatAmount(openingBalance.balance)}</td>
              </tr>
              ${filteredTransactions.map(t => `
                <tr>
                  <td>${t.date}</td>
                  <td>${t.transaction_type}</td>
                  <td>${t.narration}</td>
                  ${displayMode === 'document' 
                    ? `<td>${t.currency_code}</td><td class="number">${formatAmount(t.exchange_rate)}</td><td class="number">${formatAmount(t.document_currency_amount)}</td>`
                    : ''
                  }
                  <td class="number">${formatAmount(t.debit)}</td>
                  <td class="number">${formatAmount(t.credit)}</td>
                  <td class="number">${formatAmount(t.running_balance)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="${displayMode === 'document' ? '6' : '3'}"><strong>Total / Closing Balance</strong></td>
                <td class="number"><strong>${formatAmount(totals.debit)}</strong></td>
                <td class="number"><strong>${formatAmount(totals.credit)}</strong></td>
                <td class="number"><strong>${formatAmount(totals.debit - totals.credit)}</strong></td>
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
            size: A4 landscape;
            margin: 0.5in 0.75in 0.5in 0.75in; /* Reduced top margin for header */
            
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
            margin-top: 0.2in; /* Reduced space after the running header */
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
          .print-table .total-row {
            font-weight: bold;
            background-color: #f9f9f9 !important;
            -webkit-print-color-adjust: exact !important;
          }
          .print-table .opening-balance-row {
            font-weight: bold;
            background-color: #f0f9ff !important;
            -webkit-print-color-adjust: exact !important;
          }
          .print-table tr {
            page-break-inside: avoid;
            background: white !important;
          }
          .print-table tbody {
            background: white !important;
          }
        }
      `;
      
      // Add styles to document head
      document.head.appendChild(printStyles);
      
      // Add print container to body
      document.body.appendChild(printContainer);
      
      // Trigger print
      window.print();
      
      // Clean up after printing
      setTimeout(() => {
        document.body.removeChild(printContainer);
        document.head.removeChild(printStyles);
      }, 1000);
      
      toast.success('Print dialog opened successfully');
    } catch (error) {
      console.error('Error printing report:', error);
      toast.error('Failed to open print preview');
    }
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

  if (isLoading) {
    return <LoadingSpinner title="Loading General Ledger..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">General Ledger</h1>
        <div className="flex gap-2">
          <button
            onClick={handlePrintWithCheck}
            disabled={!isReportGenerated}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 ${
              isReportGenerated
                ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-blue-800 hover:border-blue-900'
                : 'bg-gray-400 text-gray-200 cursor-not-allowed border-gray-500'
            }`}
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={handleExcelWithCheck}
            disabled={!isReportGenerated}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 ${
              isReportGenerated
                ? 'bg-green-600 text-white hover:bg-green-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-green-800 hover:border-green-900'
                : 'bg-gray-400 text-gray-200 cursor-not-allowed border-gray-500'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
          <button
            onClick={handlePDFWithCheck}
            disabled={!isReportGenerated}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transform transition-all duration-200 shadow-lg border-b-4 ${
              isReportGenerated
                ? 'bg-red-600 text-white hover:bg-red-700 hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-red-800 hover:border-red-900'
                : 'bg-gray-400 text-gray-200 cursor-not-allowed border-gray-500'
            }`}
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow">
        <div className="p-6">
          {/* Row 1: Account Field (Full Width) */}
          <div className="grid grid-cols-1 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Account
              </label>
              <div className="relative" ref={dropdownRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5 pointer-events-none" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder={selectedAccount ? accounts.find(a => a.id === selectedAccount)?.name || "Search accounts..." : "Search accounts..."}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <ChevronDown 
                    className="absolute right-3 top-2.5 text-gray-400 w-5 h-5 pointer-events-none"
                    style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none' }}
                  />
                </div>
                {isDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-card text-card-foreground rounded-lg shadow-lg border dark:border-gray-700 max-h-60 overflow-auto">
                    {filteredAccounts.length > 0 ? (
                      filteredAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="px-4 py-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-black dark:hover:text-black transition-colors duration-150 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                          onClick={() => {
                            setSelectedAccount(account.id);
                            setSearchTerm('');
                            setIsDropdownOpen(false);
                          }}
                        >
                          <div className="font-medium">{account.name}</div>
                          <div className="text-xs opacity-70">{account.code}</div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-gray-500 dark:text-gray-400">
                        No accounts found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Date Range Fields with Generate Button */}
          <div className={`grid gap-4 mb-4 ${dateRange === 'custom' ? 'grid-cols-1 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'}`}>
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

            {/* Generate Button */}
            <div className="flex items-end">
              <button
                onClick={handleGenerateReport}
                disabled={!selectedAccount}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transform transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-b-4 border-blue-800 hover:border-blue-900 disabled:transform-none disabled:shadow-none disabled:border-b-4 disabled:border-gray-500 flex items-center justify-center gap-2"
              >
                <Filter className="w-4 h-4" />
                 Generate
              </button>
            </div>
          </div>

          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search transactions..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={searchColumn}
              onChange={(e) => setSearchColumn(e.target.value as SearchColumn)}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Columns</option>
              <option value="date">Date</option>
              <option value="type">Type</option>
              <option value="narration">Description</option>
              <option value="currency">Currency</option>
              <option value="amount">Amount</option>
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-foreground mb-2">
              Currency Display:
            </label>
            <div className="flex gap-6">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  className="form-radio h-4 w-4 text-blue-600 transition duration-150 ease-in-out"
                  name="currencyDisplay"
                  value="local"
                  checked={displayMode === 'local'}
                  onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}
                />
                <span className="ml-2 text-foreground">
                  Display without document currency
                </span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  className="form-radio h-4 w-4 text-blue-600 transition duration-150 ease-in-out"
                  name="currencyDisplay"
                  value="document"
                  checked={displayMode === 'document'}
                  onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}
                />
                <span className="ml-2 text-foreground">
                  Display with document currency
                </span>
              </label>
            </div>
          </div>



          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'date')}
                    width={columnWidths.date}
                    className="pb-3 font-semibold"
                  >
                    <span>Date</span>
                  </ResizableHeader>

                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'type')}
                    width={columnWidths.type}
                    className="pb-3 font-semibold"
                  >
                    <span>Type</span>
                  </ResizableHeader>

                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'narration')}
                    width={columnWidths.narration}
                    className="pb-3 font-semibold"
                  >
                    <span>Description</span>
                  </ResizableHeader>

                  {displayMode === 'document' && (
                    <>
                      <ResizableHeader
                        onResizeStart={(e) => handleResizeStart(e, 'docAmount')}
                        width={columnWidths.docAmount}
                        className="pb-3 font-semibold text-right"
                      >
                        <span>Doc. Amount</span>
                      </ResizableHeader>

                      <ResizableHeader
                        onResizeStart={(e) => handleResizeStart(e, 'currency')}
                        width={columnWidths.currency}
                        className="pb-3 font-semibold"
                      >
                        <span>Currency</span>
                      </ResizableHeader>

                      <ResizableHeader
                        onResizeStart={(e) => handleResizeStart(e, 'rate')}
                        width={columnWidths.rate}
                        className="pb-3 font-semibold text-right"
                      >
                        <span>Rate</span>
                      </ResizableHeader>
                    </>
                  )}

                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'debit')}
                    width={columnWidths.debit}
                    className="pb-3 font-semibold text-right"
                  >
                    <span>Debit</span>
                  </ResizableHeader>

                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'credit')}
                    width={columnWidths.credit}
                    className="pb-3 font-semibold text-right"
                  >
                    <span>Credit</span>
                  </ResizableHeader>

                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'balance')}
                    width={columnWidths.balance}
                    className="pb-3 font-semibold text-right"
                  >
                    <span>Balance</span>
                  </ResizableHeader>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {/* Opening Balance Row */}
                {selectedAccount && (
                  <tr>
                    <td className="py-3 font-medium" style={{ width: columnWidths.date }}>
                      Opening Balance
                    </td>
                    <td className="py-3" style={{ width: columnWidths.type }}></td>
                    <td className="py-3" style={{ width: columnWidths.narration }}></td>
                    {displayMode === 'document' && (
                      <>
                        <td className="py-3" style={{ width: columnWidths.docAmount }}></td>
                        <td className="py-3" style={{ width: columnWidths.currency }}></td>
                        <td className="py-3" style={{ width: columnWidths.rate }}></td>
                      </>
                    )}
                    <td className="py-3 text-right font-medium" style={{ width: columnWidths.debit }}>
                      {openingBalance.balance > 0 ? formatAmount(openingBalance.balance) : ''}
                    </td>
                    <td className="py-3 text-right font-medium" style={{ width: columnWidths.credit }}>
                      {openingBalance.balance < 0 ? formatAmount(Math.abs(openingBalance.balance)) : ''}
                    </td>
                    <td className="py-3 text-right font-medium" style={{ width: columnWidths.balance }}>
                      {formatAmount(openingBalance.balance)}
                    </td>
                  </tr>
                )}

                {filteredTransactions.map((transaction, index) => (
                  <tr key={index}>
                    <td className="py-3" style={{ width: columnWidths.date }}>
                      {transaction.date}
                    </td>
                    <td className="py-3" style={{ width: columnWidths.type }}>
                      {transaction.transaction_type}
                    </td>
                    <td className="py-3" style={{ width: columnWidths.narration }}>
                      {transaction.narration}
                    </td>
                    {displayMode === 'document' && (
                      <>
                        <td className="py-3 text-right" style={{ width: columnWidths.docAmount }}>
                          {formatAmount(transaction.document_currency_amount)}
                        </td>
                        <td className="py-3" style={{ width: columnWidths.currency }}>
                          {transaction.currency_code}
                        </td>
                        <td className="py-3 text-right" style={{ width: columnWidths.rate }}>
                          {transaction.exchange_rate.toFixed(4)}
                        </td>
                      </>
                    )}
                    <td className="py-3 text-right" style={{ width: columnWidths.debit }}>
                      {formatAmount(transaction.debit)}
                    </td>
                    <td className="py-3 text-right" style={{ width: columnWidths.credit }}>
                      {formatAmount(transaction.credit)}
                    </td>
                    <td className="py-3 text-right" style={{ width: columnWidths.balance }}>
                      {formatAmount(transaction.running_balance)}
                    </td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && !selectedAccount && (
                  <tr>
                    <td
                      colSpan={displayMode === 'document' ? 9 : 6}
                      className="py-4 text-center text-gray-500 dark:text-gray-400"
                    >
                      Please select an account to view transactions
                    </td>
                  </tr>
                )}
                {filteredTransactions.length === 0 && selectedAccount && (
                  <tr>
                    <td
                      colSpan={displayMode === 'document' ? 9 : 6}
                      className="py-4 text-center text-gray-500 dark:text-gray-400"
                    >
                      No transactions found for the selected date range
                    </td>
                  </tr>
                )}
              </tbody>
              {/* Closing Balance Row */}
              {selectedAccount && (filteredTransactions.length > 0 || openingBalance.balance !== 0) && (
  <tfoot>
  <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
    <td className="py-3 whitespace-nowrap" style={{ width: columnWidths.date }}>
      Total / Closing Balance
    </td>
    <td className="py-3" style={{ width: columnWidths.type }}></td>
    <td className="py-3" style={{ width: columnWidths.narration }}></td>
    {displayMode === 'document' && (
      <>
        <td className="py-3" style={{ width: columnWidths.docAmount }}></td>
        <td className="py-3" style={{ width: columnWidths.currency }}></td>
        <td className="py-3" style={{ width: columnWidths.rate }}></td>
      </>
    )}
    <td className="py-3 text-right" style={{ width: columnWidths.debit }}>
      {formatAmount(totals.debit)}
    </td>
    <td className="py-3 text-right" style={{ width: columnWidths.credit }}>
      {formatAmount(totals.credit)}
    </td>
    <td className="py-3 text-right" style={{ width: columnWidths.balance }}>
      {formatAmount(totals.debit - totals.credit)}
    </td>
  </tr>
</tfoot>
)}
            </table>
          </div>
        </div>
      </div>

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Report Not Generated</h3>
                <p className="text-gray-600 dark:text-gray-300 mt-1">Please generate the report first before trying to print, export to Excel, or export to PDF.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowErrorModal(false)}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowErrorModal(false);
                  if (selectedAccount) {
                    handleGenerateReport();
                  }
                }}
                disabled={!selectedAccount}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Generate Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}