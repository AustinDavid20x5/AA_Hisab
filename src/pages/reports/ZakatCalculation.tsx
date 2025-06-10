import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { Search, Printer, FileSpreadsheet, FileText, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { formatAmount as formatAmountUtil } from '../../lib/format';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface Account {
  id: string;
  code: string;
  name: string;
  subcategory: string;
  balance: number;
}

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
}

type SortField = 'code' | 'name' | 'subcategory' | 'balance';
type SortDirection = 'asc' | 'desc';

export default function ZakatCalculation() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [baseCurrency, setBaseCurrency] = useState<Currency | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const errorShownRef = useRef(false);

  useEffect(() => {
    fetchBaseCurrency();
  }, []);

  useEffect(() => {
    if (baseCurrency) {
      fetchZakatEligibleAccounts();
    }
  }, [selectedDate, baseCurrency]);

  const filterAndSortAccounts = () => {
    let filtered = accounts.filter(account =>
      account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  };

  const filteredAccounts = useMemo(() => {
    return filterAndSortAccounts();
  }, [accounts, searchTerm, sortField, sortDirection]);

  const fetchBaseCurrency = async () => {
    try {
      const { data, error } = await supabase
        .from('currencies')
        .select('*')
        .eq('is_base', true)
        .single();

      if (error) throw error;
      setBaseCurrency(data);
    } catch (error) {
      console.error('Error fetching base currency:', error);
      toast.error('Failed to fetch base currency');
    }
  };

  const fetchZakatEligibleAccounts = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch zakat-eligible accounts with their balances as of the selected date
      const { data: accountsData, error: accountsError } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          code,
          name,
          subcategory:subcategories (
            name
          )
        `)
        .eq('zakat_eligible', true)
        .eq('is_active', true)
        .order('code');

      if (accountsError) throw accountsError;

      // Calculate balance for each account as of the selected date
      const accountsWithBalances = await Promise.all(
        accountsData.map(async (account) => {
          const { data: transactionData, error: transactionError } = await supabase
            .from('gl_transactions')
            .select(`
              debit,
              credit,
              gl_headers (
                transaction_date,
                status
              )
            `)
            .eq('account_id', account.id);

          if (transactionError) {
            console.error(`Error fetching transactions for account ${account.code}:`, transactionError);
            return {
              ...account,
              balance: 0
            };
          }

          // Filter transactions in JavaScript
          const filteredTransactions = transactionData.filter(transaction => {
            return transaction.gl_headers &&
                   transaction.gl_headers.status === 'posted' &&
                   new Date(transaction.gl_headers.transaction_date) <= new Date(selectedDate);
          });

          // Calculate balance: SUM(debit) - SUM(credit)
          const balance = filteredTransactions.reduce((sum, transaction) => {
            return sum + (transaction.debit || 0) - (transaction.credit || 0);
          }, 0);

          return {
            ...account,
            balance
          };
        })
      );

      setAccounts(accountsWithBalances);
    } catch (error) {
      console.error('Error fetching zakat eligible accounts:', error);
      setError('Failed to fetch zakat eligible accounts');
      // Only show toast error once to avoid duplicates in StrictMode
      if (!errorShownRef.current) {
        toast.error('Failed to fetch zakat eligible accounts');
        errorShownRef.current = true;
        // Reset the flag after a short delay
        setTimeout(() => {
          errorShownRef.current = false;
        }, 1000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderColumnHeader = (field: SortField, label: string) => {
    const isActive = sortField === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
      >
        {label}
        {isActive ? (
          sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
        ) : (
          <ArrowUpDown className="w-4 h-4 opacity-50" />
        )}
      </button>
    );
  };

  const formatAmount = (amount: number) => {
    if (!baseCurrency) return amount.toFixed(2);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const exportToExcel = () => {
    try {
      const totalBalance = filteredAccounts.reduce((sum, account) => sum + account.balance, 0);
      const zakatAmount = totalBalance * 0.025;

      const exportData = [
        // Header information
        ['Zakat Calculation Report'],
        [`As of Date: ${selectedDate}`],
        [`Currency: ${baseCurrency?.code} - ${baseCurrency?.name}`],
        [`Generated on: ${new Date().toLocaleString()}`],
        [''],
        // Table headers
        ['Account Code', 'Account Name', 'Sub Category', 'Balance'],
        // Account data
        ...filteredAccounts.map(account => [
          account.code,
          account.name,
          account.subcategory?.name || '',
          account.balance
        ]),
        [''],
        // Summary
        ['Summary'],
        ['Total Balance', '', '', totalBalance],
        ['Zakat (2.5%)', '', '', zakatAmount]
      ];

      const ws = XLSX.utils.aoa_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Zakat Calculation');
      XLSX.writeFile(wb, `Zakat_Calculation_${selectedDate}.xlsx`);
      toast.success('Excel file exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed.');
    }
  };

  const exportToPDF = () => {
    try {
      const doc = new jsPDF();
      const totalBalance = filteredAccounts.reduce((sum, account) => sum + account.balance, 0);
      const zakatAmount = totalBalance * 0.025;

      // Header
      doc.setFontSize(18);
      doc.text('Zakat Calculation Report', 14, 22);
      
      doc.setFontSize(10);
      doc.text(`As of Date: ${selectedDate}`, 14, 32);
      doc.text(`Currency: ${baseCurrency?.code} - ${baseCurrency?.name}`, 14, 38);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 44);

      // Table
      const tableData = filteredAccounts.map(account => [
        account.code,
        account.name,
        account.subcategory?.name || '',
        formatAmount(account.balance)
      ]);

      (doc as any).autoTable({
        head: [['Account Code', 'Account Name', 'Sub Category', 'Balance']],
        body: tableData,
        startY: 50,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] },
      });

      // Summary
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text('Summary:', 14, finalY);
      doc.setFontSize(10);
      doc.text(`Total Balance: ${formatAmount(totalBalance)}`, 14, finalY + 8);
      doc.text(`Zakat (2.5%): ${formatAmount(zakatAmount)}`, 14, finalY + 16);

      doc.save(`Zakat_Calculation_${selectedDate}.pdf`);
      toast.success('PDF exported successfully!');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('PDF export failed.');
    }
  };

  const handlePrint = () => {
    try {
      const totalBalance = filteredAccounts.reduce((sum, account) => sum + account.balance, 0);
      const zakatAmount = totalBalance * 0.025;

      const printContent = `
        <div class="print-page-header">
          <h1 style="margin: 0; font-size: 24px; font-weight: bold; text-align: center; margin-bottom: 20px;">Zakat Calculation Report</h1>
          <div class="print-report-info" style="margin-bottom: 20px; font-size: 12px;">
            <p><strong>As of Date:</strong> ${selectedDate}</p>
            <p><strong>Currency:</strong> ${baseCurrency?.code} - ${baseCurrency?.name}</p>
            <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
        
        <table class="print-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th>Account Code</th>
              <th>Account Name</th>
              <th>Sub Category</th>
              <th class="number">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${filteredAccounts.map(account => `
              <tr>
                <td>${account.code}</td>
                <td>${account.name}</td>
                <td>${account.subcategory?.name || ''}</td>
                <td class="number">${formatAmount(account.balance)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div style="margin-top: 30px; padding: 15px; border: 1px solid #333; background-color: #f9f9f9;">
          <h3 style="margin: 0 0 10px 0; font-size: 16px;">Summary</h3>
          <p style="margin: 5px 0; font-size: 14px;"><strong>Total Balance:</strong> ${formatAmount(totalBalance)}</p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>Zakat (2.5%):</strong> ${formatAmount(zakatAmount)}</p>
        </div>
      `;

      const printContainer = document.createElement('div');
      printContainer.id = 'print-container';
      printContainer.innerHTML = printContent;
      printContainer.style.display = 'none';

      const printStyles = document.createElement('style');
      printStyles.textContent = `
        @media print {
          body * {
            visibility: hidden;
          }
          #print-container, #print-container * {
            visibility: visible;
          }
          #print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            display: block !important;
            font-family: Arial, sans-serif;
            color: #000 !important;
            background: white !important;
            padding: 20px;
            box-sizing: border-box;
          }
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 0 !important;
            background: white !important;
            color: #000 !important;
            font-size: 11px !important;
            display: table !important;
          }
          .print-table thead {
            display: table-header-group !important;
            background: #f5f5f5 !important;
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

  const totalBalance = filteredAccounts.reduce((sum, account) => sum + account.balance, 0);
  const zakatAmount = totalBalance * 0.025;

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
    return <LoadingSpinner title="Loading Zakat Calculation..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Zakat Calculation</h1>
          {baseCurrency && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Currency: {baseCurrency.code} - {baseCurrency.name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transform transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-b-4 border-blue-800 hover:border-blue-900"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transform transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-b-4 border-green-800 hover:border-green-900"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transform transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 active:shadow-md border-b-4 border-red-800 hover:border-red-900"
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow">
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Account Selector
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search accounts..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                As of Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Summary Section */}
          {filteredAccounts.length > 0 && (
            <div className="mt-8 p-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Balance</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {baseCurrency?.symbol}{formatAmount(totalBalance)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Zakat (2.5%)</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {baseCurrency?.symbol}{formatAmount(zakatAmount)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">
                    {renderColumnHeader('code', 'Account Code')}
                  </th>
                  <th className="pb-3 font-semibold">
                    {renderColumnHeader('name', 'Account Name')}
                  </th>
                  <th className="pb-3 font-semibold">
                    {renderColumnHeader('subcategory', 'Sub Category')}
                  </th>
                  <th className="pb-3 font-semibold w-48">
                    <div className="text-right">
                      {renderColumnHeader('balance', 'Balance')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {filteredAccounts.map((account) => (
                  <tr key={account.code}>
                    <td className="py-3">{account.code}</td>
                    <td className="py-3">{account.name}</td>
                    <td className="py-3">{account.subcategory?.name || ''}</td>
                    <td className="py-3 text-right">{formatAmount(account.balance)}</td>
                  </tr>
                ))}
                {filteredAccounts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-500 dark:text-gray-400">
                      No zakat-eligible accounts found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>


        </div>
      </div>
    </div>
  );
}