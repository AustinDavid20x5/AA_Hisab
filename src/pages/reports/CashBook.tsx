import React, { useState, useEffect } from 'react';
import { format, subDays, subMonths, startOfDay, endOfDay } from 'date-fns';
import { FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { formatAmount } from '../../lib/format';

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
  const [dateRange, setDateRange] = useState<DateRange>('last_week');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
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

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // Add title and header info
      doc.setFontSize(16);
      doc.text('Cash Book Report', 14, 15);

      doc.setFontSize(10);
      doc.text(`Cash Book: ${selectedCashBook.code} - ${selectedCashBook.name}`, 14, 25);
      doc.text(`Currency: ${selectedCashBook.currency.code}`, 14, 30);

      const { start, end } = getDateRange();
      doc.text(`Period: ${format(start, 'dd/MM/yyyy')} to ${format(end, 'dd/MM/yyyy')}`, 14, 35);

      // Show opening balances
      let yPos = 40;
      openingBalance.forEach((balance) => {
        doc.text(`Opening Balance (${balance.currency_code}): ${formatAmount(balance.balance)}`, 14, yPos);
        yPos += 5;
      });

      // Define columns based on currency
      const isBase = selectedCashBook.currency.is_base;
      const columns = isBase
        ? ['Date', 'Narration', 'Debit', 'Credit', 'Balance']
        : ['Date', 'Narration', 'Doc. Amount', 'Currency', 'Rate', 'Debit', 'Credit', 'Balance'];

      // Prepare data for PDF including opening balance
      const data = [];
      
      // Add opening balance row
      data.push([
        'Opening Balance',
        '',
        ...(isBase ? [] : ['', '', '']),
        openingBalance[0]?.balance > 0 ? formatAmount(openingBalance[0].balance) : '',
        openingBalance[0]?.balance < 0 ? formatAmount(Math.abs(openingBalance[0].balance)) : '',
        formatAmount(openingBalance[0]?.balance || 0)
      ]);
      
      // Add transaction rows
      transactions.forEach(t => {
        const baseData = [
          t.date,
          t.narration,
          formatAmount(t.debit),
          formatAmount(t.credit),
          formatAmount(t.balance)
        ];

        if (isBase) {
          data.push(baseData);
        } else {
          data.push([
            t.date,
            t.narration,
            formatAmount(t.document_amount),
            t.currency_code,
            t.exchange_rate.toFixed(4),
            formatAmount(t.debit),
            formatAmount(t.credit),
            formatAmount(t.balance)
          ]);
        }
      });

      // Add totals row
      data.push([
        'Totals',
        '',
        ...(isBase ? [] : [
          formatAmount(totals.docAmount),
          '',
          ''
        ]),
        formatAmount(totals.debit),
        formatAmount(totals.credit),
        ''
      ]);

      // Add closing balance row
      data.push([
        'Closing Balance',
        '',
        ...(isBase ? [] : ['', '', '']),
        '',
        '',
        formatAmount(closingBalance[0]?.balance || 0)
      ]);

      // Generate table
      (doc as any).autoTable({
        startY: yPos + 5,
        head: [columns],
        body: data,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 20 }, // Date
          1: { cellWidth: isBase ? 100 : 60 }, // Narration
          ...(isBase ? {} : {
            2: { cellWidth: 25, halign: 'right' }, // Doc Amount
            3: { cellWidth: 20 }, // Currency
            4: { cellWidth: 20, halign: 'right' } // Rate
          }),
          [isBase ? 2 : 5]: { cellWidth: 25, halign: 'right' }, // Debit
          [isBase ? 3 : 6]: { cellWidth: 25, halign: 'right' }, // Credit
          [isBase ? 4 : 7]: { cellWidth: 25, halign: 'right' } // Balance
        }
      });

      doc.save('cash_book_report.pdf');
      toast.success('Report exported successfully');
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      toast.error('Failed to export report');
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
        <h1 className="text-2xl font-semibold">Cash Book Report</h1>
        <button
          onClick={exportToPDF}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!selectedCashBook || transactions.length === 0}
        >
          <FileText className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <tr className="bg-blue-50 dark:bg-blue-900/10">
                    <td className="py-3 font-medium">Opening Balance</td>
                    <td className="py-3"></td>
                    {!selectedCashBook.currency.is_base && (
                      <>
                        <td className="py-3"></td>
                        <td className="py-3"></td>
                        <td className="py-3"></td>
                      </>
                    )}
                    <td className="py-3 text-right font-medium">
                      {openingBalance[0]?.balance > 0 ? formatAmount(openingBalance[0].balance) : ''}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {openingBalance[0]?.balance < 0 ? formatAmount(Math.abs(openingBalance[0].balance)) : ''}
                    </td>
                    <td className="py-3 text-right font-medium">
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
              {/* Closing Balance Row */}
              {selectedCashBook && (transactions.length > 0 || openingBalance[0]?.balance !== 0) && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 font-semibold">
                    <td className="py-3">Totals</td>
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
                    <td className="py-3 text-right"></td>
                  </tr>
                  <tr className="border-t border-gray-300 dark:border-gray-600 font-semibold">
                    <td className="py-3">Closing Balance</td>
                    <td className="py-3"></td>
                    {!selectedCashBook.currency.is_base && (
                      <>
                        <td className="py-3"></td>
                        <td className="py-3"></td>
                        <td className="py-3"></td>
                      </>
                    )}
                    <td className="py-3"></td>
                    <td className="py-3"></td>
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