import React, { useState, useEffect, useRef } from 'react';
import { format, subDays, subMonths, startOfDay, endOfDay, isValid } from 'date-fns';
import { Download, Printer, FileSpreadsheet, FileText, Calendar, Search, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { formatAmount } from '../../lib/format';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ResizableHeader } from '../../components/ResizableHeader';
import '../../styles/resizable.css';

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
  const [dateRange, setDateRange] = useState<DateRange>('custom');
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
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<{ id: string; code: string }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<OpeningBalance>({ debit: 0, credit: 0, balance: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [totals, setTotals] = useState<{ debit: number; credit: number }>({ debit: 0, credit: 0 });
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

  useEffect(() => {
    if (selectedAccount) {
      fetchTransactions();
    }
  }, [selectedAccount, dateRange, customStartDate, customEndDate, displayMode]);

  useEffect(() => {
    const filtered = filterAndSortTransactions();
    setFilteredTransactions(filtered);
  }, [searchText, searchColumn, transactions, sortColumn, sortDirection, columnFilters]);

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

      let runningBalance = openingBalanceAmount;
      let runningBalanceDoc = 0;
      const formattedTransactions = transactionData
        .map(transaction => {
          const header = headerData.find(h => h.id === transaction.header_id);
          if (!header) return null;

          const debit = Number(transaction.debit) || 0;
          const credit = Number(transaction.credit) || 0;
          const debit_doc = Number(transaction.debit_doc_currency) || 0;
          const credit_doc = Number(transaction.credit_doc_currency) || 0;
          
          runningBalance += debit - credit;
          runningBalanceDoc += debit_doc - credit_doc;

          return {
            date: format(new Date(header.transaction_date), 'dd/MM/yyyy'),
            transaction_type: header.tbl_trans_type.description,
            narration: transaction.description || header.description,
            document_currency_amount: debit_doc > 0 ? debit_doc : -credit_doc,
            currency_code: getCurrencyCode(transaction.currency_id),
            exchange_rate: Number(transaction.exchange_rate) || 1,
            debit,
            credit,
            debit_doc_currency: debit_doc,
            credit_doc_currency: credit_doc,
            running_balance: runningBalance,
            running_balance_doc: runningBalanceDoc
          };
        })
        .filter((t): t is Transaction => t !== null)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate totals
    const newTotals = formattedTransactions.reduce(
      (acc, t) => ({
        debit: acc.debit + t.debit,
        credit: acc.credit + t.credit
      }),
      { debit: 0, credit: 0 }
    );

      setTransactions(formattedTransactions);
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
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
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
      // Prepare data for export including opening balance
      const exportData = [];
      
      // Add opening balance row
      exportData.push({
        Date: 'Opening Balance',
        'Transaction Type': '',
        Description: '',
        ...(displayMode === 'document' ? {
          Currency: '',
          'Exchange Rate': '',
          'Doc. Amount': '',
        } : {}),
        Debit: openingBalance.balance > 0 ? formatAmount(openingBalance.balance) : '',
        Credit: openingBalance.balance < 0 ? formatAmount(Math.abs(openingBalance.balance)) : '',
        Balance: formatAmount(openingBalance.balance)
      });
      
      // Add transaction rows
      filteredTransactions.forEach(t => {
        const baseData = {
          Date: t.date,
          'Transaction Type': t.transaction_type,
          Description: t.narration,
          Debit: t.debit > 0 ? formatAmount(t.debit) : '',
          Credit: t.credit > 0 ? formatAmount(t.credit) : '',
          Balance: formatAmount(t.running_balance)
        };

        if (displayMode === 'document') {
          exportData.push({
            ...baseData,
            Currency: t.currency_code,
            'Exchange Rate': t.exchange_rate.toFixed(4),
            'Doc. Amount': formatAmount(t.document_currency_amount),
          });
        } else {
          exportData.push(baseData);
        }
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'General Ledger');
      XLSX.writeFile(wb, 'general_ledger.xlsx');

      toast.success('Report exported to Excel successfully');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('Failed to export to Excel');
    }
  };

  const exportToPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      doc.setFontSize(16);
      doc.text('General Ledger Report', 14, 15);

      doc.setFontSize(10);
      const selectedAccountData = accounts.find(a => a.id === selectedAccount);
      if (selectedAccountData) {
        doc.text(`Account: ${selectedAccountData.code} - ${selectedAccountData.name}`, 14, 25);
      }

      const { start, end } = getDateRange();
      doc.text(`Period: ${format(start, 'dd/MM/yyyy')} to ${format(end, 'dd/MM/yyyy')}`, 14, 30);
      doc.text(`Opening Balance: ${formatAmount(openingBalance.balance)}`, 14, 35);

      const columns = displayMode === 'document' 
        ? ['Date', 'Type', 'Description', 'Currency', 'Rate', 'Doc. Amount', 'Debit', 'Credit', 'Balance']
        : ['Date', 'Type', 'Description', 'Debit', 'Credit', 'Balance'];

      // Prepare data for PDF including opening balance
      const data = [];
      
      // Add opening balance row
      data.push([
        'Opening Balance',
        '',
        '',
        ...(displayMode === 'document' ? ['', '', ''] : []),
        openingBalance.balance > 0 ? formatAmount(openingBalance.balance) : '',
        openingBalance.balance < 0 ? formatAmount(Math.abs(openingBalance.balance)) : '',
        formatAmount(openingBalance.balance)
      ]);
      
      // Add transaction rows
      filteredTransactions.forEach(t => {
        const baseData = [
          t.date,
          t.transaction_type,
          t.narration,
          formatAmount(t.debit),
          formatAmount(t.credit),
          formatAmount(t.running_balance)
        ];

        if (displayMode === 'document') {
          data.push([
            t.date,
            t.transaction_type,
            t.narration,
            t.currency_code,
            t.exchange_rate.toFixed(4),
            formatAmount(t.document_currency_amount),
            formatAmount(t.debit),
            formatAmount(t.credit),
            formatAmount(t.running_balance)
          ]);
        } else {
          data.push(baseData);
        }
      });

      (doc as any).autoTable({
        startY: 40,
        head: [columns],
        body: data,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: displayMode === 'document' ? 25 : 30 },
          2: { cellWidth: displayMode === 'document' ? 40 : 60 },
          ...(displayMode === 'document' ? {
            3: { cellWidth: 15 },
            4: { cellWidth: 15, halign: 'right' },
            5: { cellWidth: 20, halign: 'right' },
            6: { cellWidth: 20, halign: 'right' },
            7: { cellWidth: 20, halign: 'right' },
            8: { cellWidth: 20, halign: 'right' }
          } : {
            3: { cellWidth: 25, halign: 'right' },
            4: { cellWidth: 25, halign: 'right' },
            5: { cellWidth: 25, halign: 'right' }
          })
        }
      });

      doc.save('general_ledger.pdf');
      toast.success('Report exported to PDF successfully');
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      toast.error('Failed to export to PDF');
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
    return (
      <div className="p-4 text-center">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mx-auto mb-4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">General Ledger</h1>
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Account
              </label>
              <div className="relative" ref={dropdownRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5 pointer-events-none" />
                  <input
      type="text"
      value={
        searchTerm || 
        (selectedAccount && accounts.find(a => a.id === selectedAccount)?.name) || 
        ''
      }
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder="Search accounts..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <ChevronDown 
                    className="absolute right-3 top-2.5 text-gray-400 w-5 h-5 pointer-events-none"
                    style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none' }}
                  />
                </div>
                {isDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 max-h-60 overflow-auto">
                    {filteredAccounts.length > 0 ? (
                      filteredAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => {
                            setSelectedAccount(account.id);
                            setSearchTerm('');
                            setIsDropdownOpen(false);
                          }}
                        >
                          {account.name}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                <span className="ml-2 text-gray-700 dark:text-gray-300">
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
                <span className="ml-2 text-gray-700 dark:text-gray-300">
                  Display with document currency
                </span>
              </label>
            </div>
          </div>

          {/* Opening Balance Section */}
          {selectedAccount && (
            <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300">Opening Balance</h3>
                <span className="text-lg font-bold text-blue-800 dark:text-blue-300">
                  {formatAmount(openingBalance.balance)}
                </span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'date')}
                    width={columnWidths.date}
                    className="pb-3 font-semibold"
                  >
                    <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('date')}>
                      <span>Date</span>
                      {sortColumn === 'date' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </ResizableHeader>

                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'type')}
                    width={columnWidths.type}
                    className="pb-3 font-semibold"
                  >
                    <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('type')}>
                      <span>Type</span>
                      {sortColumn === 'type' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </ResizableHeader>

                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'narration')}
                    width={columnWidths.narration}
                    className="pb-3 font-semibold"
                  >
                    <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('narration')}>
                      <span>Description</span>
                      {sortColumn === 'narration' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
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
                        <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('currency')}>
                          <span>Currency</span>
                          {sortColumn === 'currency' && (
                            sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </ResizableHeader>

                      <ResizableHeader
                        onResizeStart={(e) => handleResizeStart(e, 'rate')}
                        width={columnWidths.rate}
                        className="pb-3 font-semibold text-right"
                      >
                        <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('rate')}>
                          <span>Rate</span>
                          {sortColumn === 'rate' && (
                            sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </ResizableHeader>
                    </>
                  )}

                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'debit')}
                    width={columnWidths.debit}
                    className="pb-3 font-semibold text-right"
                  >
                    <div className="flex items-center justify-end gap-1 cursor-pointer" onClick={() => handleSort('debit')}>
                      <span>Debit</span>
                      {sortColumn === 'debit' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </ResizableHeader>

                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'credit')}
                    width={columnWidths.credit}
                    className="pb-3 font-semibold text-right"
                  >
                    <div className="flex items-center justify-end gap-1 cursor-pointer" onClick={() => handleSort('credit')}>
                      <span>Credit</span>
                      {sortColumn === 'credit' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </ResizableHeader>

                  <ResizableHeader
                    onResizeStart={(e) => handleResizeStart(e, 'balance')}
                    width={columnWidths.balance}
                    className="pb-3 font-semibold text-right"
                  >
                    <div className="flex items-center justify-end gap-1 cursor-pointer" onClick={() => handleSort('balance')}>
                      <span>Balance</span>
                      {sortColumn === 'balance' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </ResizableHeader>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {/* Opening Balance Row */}
                {selectedAccount && (
                  <tr className="bg-blue-50 dark:bg-blue-900/10">
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
      {formatAmount(filteredTransactions.length > 0 
        ? filteredTransactions[filteredTransactions.length - 1].running_balance 
        : openingBalance.balance)}
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