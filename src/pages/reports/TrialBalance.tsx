import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, ChevronDown, ChevronUp, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatAmount } from '../../lib/format';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface Account {
  code: string;
  name: string;
  subcategory: string;
  debit: number;
  credit: number;
}

interface Currency {
  code: string;
  name: string;
}

type SortColumn = 'code' | 'name' | 'subcategory' | 'debit' | 'credit';
type SortDirection = 'asc' | 'desc';

export default function TrialBalance() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filteredAccounts, setFilteredAccounts] = useState<Account[]>([]);
  const [baseCurrency, setBaseCurrency] = useState<Currency | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchBaseCurrency();
    fetchTrialBalance();
  }, [selectedDate]);

  useEffect(() => {
    const filtered = filterAndSortAccounts();
    setFilteredAccounts(filtered);
  }, [searchTerm, accounts, sortColumn, sortDirection]);

  const fetchBaseCurrency = async () => {
    try {
      const { data, error } = await supabase
        .from('currencies')
        .select('code, name')
        .eq('is_base', true)
        .single();

      if (error) throw error;
      setBaseCurrency(data);
    } catch (error) {
      console.error('Error fetching base currency:', error);
      toast.error('Failed to fetch base currency');
    }
  };

  const filterAndSortAccounts = () => {
    let filtered = [...accounts];

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(account =>
        account.code.toLowerCase().includes(searchLower) ||
        account.name.toLowerCase().includes(searchLower) ||
        account.subcategory.toLowerCase().includes(searchLower)
      );
    }

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'subcategory':
          comparison = a.subcategory.localeCompare(b.subcategory);
          break;
        case 'code':
          comparison = a.code.localeCompare(b.code);
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'debit':
          comparison = a.debit - b.debit;
          break;
        case 'credit':
          comparison = a.credit - b.credit;
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

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ChevronDown className="w-4 h-4 opacity-0 group-hover:opacity-50" />;
    }
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4 text-blue-500" /> : 
      <ChevronDown className="w-4 h-4 text-blue-500" />;
  };

  const renderColumnHeader = (column: SortColumn, label: string) => (
    <div 
      className="flex items-center gap-1 cursor-pointer group"
      onClick={() => handleSort(column)}
    >
      <span>{label}</span>
      {getSortIcon(column)}
    </div>
  );

  const fetchTrialBalance = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          code,
          name,
          subcategories (
            name
          ),
          gl_transactions (
            debit,
            credit,
            header:gl_headers!inner (
              status,
              transaction_date
            )
          )
        `)
        .order('code');

      if (error) throw error;

      const formattedAccounts = data.map(account => {
        const transactions = account.gl_transactions.filter(t => 
          (['draft', 'posted'].includes(t.header.status)) &&
          t.header.transaction_date <= selectedDate
        );

        const totalDebit = transactions.reduce((sum, t) => sum + (t.debit || 0), 0);
        const totalCredit = transactions.reduce((sum, t) => sum + (t.credit || 0), 0);

        return {
          code: account.code,
          name: account.name,
          subcategory: account.subcategories?.name || '-',
          debit: totalDebit > totalCredit ? totalDebit - totalCredit : 0,
          credit: totalCredit > totalDebit ? totalCredit - totalDebit : 0
        };
      }).filter(account => account.debit > 0 || account.credit > 0);

      setAccounts(formattedAccounts);
    } catch (error) {
      console.error('Error fetching trial balance:', error);
      setError('Failed to fetch trial balance data');
    } finally {
      setIsLoading(false);
    }
  };

  const exportToExcel = () => {
    try {
      const exportData = accounts.map(account => ({
        'Sub Category': account.subcategory,
        'Account Code': account.code,
        'Account Name': account.name,
        'Debit': formatAmount(account.debit),
        'Credit': formatAmount(account.credit)
      }));

      exportData.push({
        'Sub Category': '',
        'Account Code': '',
        'Account Name': 'Total',
        'Debit': formatAmount(totals.debit),
        'Credit': formatAmount(totals.credit)
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');
      XLSX.writeFile(wb, 'trial_balance.xlsx');

      toast.success('Exported to Excel successfully');
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
      doc.text('Trial Balance', 14, 15);
      
      doc.setFontSize(10);
      doc.text(`As of ${new Date(selectedDate).toLocaleDateString()}`, 14, 25);
      if (baseCurrency) {
        doc.text(`Currency: ${baseCurrency.code} - ${baseCurrency.name}`, 14, 30);
      }

      const headers = [['Sub Category', 'Account Code', 'Account Name', 'Debit', 'Credit']];
      const data = accounts.map(account => [
        account.subcategory,
        account.code,
        account.name,
        formatAmount(account.debit),
        formatAmount(account.credit)
      ]);

      data.push([
        '',
        '',
        'Total',
        formatAmount(totals.debit),
        formatAmount(totals.credit)
      ]);

      (doc as any).autoTable({
        startY: 35,
        head: headers,
        body: data,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak',
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [71, 85, 105],
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'left',
          textColor: [255, 255, 255],
        },
        columnStyles: {
          0: { cellWidth: 40, halign: 'left' },
          1: { cellWidth: 30, halign: 'left' },
          2: { cellWidth: 80, halign: 'left' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' },
        },
        didParseCell: function(data) {
          const col = data.column.index;
          if (col >= 3) {
            data.cell.styles.halign = 'right';
          }
          
          if (col !== 2) {
            data.cell.styles.overflow = 'visible';
            data.cell.styles.cellWidth = 'wrap';
            data.cell.styles.whiteSpace = 'nowrap';
          }
        },
        margin: { left: 10, right: 10 },
      });

      doc.save('trial_balance.pdf');
      toast.success('Exported to PDF successfully');
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      toast.error('Failed to export to PDF');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totals = {
    debit: accounts.reduce((sum, account) => sum + account.debit, 0),
    credit: accounts.reduce((sum, account) => sum + account.credit, 0)
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
        <div>
          <h1 className="text-2xl font-semibold">Trial Balance</h1>
          {baseCurrency && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Currency: {baseCurrency.code} - {baseCurrency.name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
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

      <div className="bg-card rounded-lg shadow">
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search accounts..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">
                    {renderColumnHeader('subcategory', 'Sub Category')}
                  </th>
                  <th className="pb-3 font-semibold">
                    {renderColumnHeader('code', 'Account Code')}
                  </th>
                  <th className="pb-3 font-semibold">
                    {renderColumnHeader('name', 'Account Name')}
                  </th>
                  <th className="pb-3 font-semibold w-48">
                    <div className="text-right">
                      {renderColumnHeader('debit', 'Debit')}
                    </div>
                  </th>
                  <th className="pb-3 font-semibold w-48">
                    <div className="text-right">
                      {renderColumnHeader('credit', 'Credit')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {filteredAccounts.map((account) => (
                  <tr key={account.code}>
                    <td className="py-3">{account.subcategory}</td>
                    <td className="py-3">{account.code}</td>
                    <td className="py-3">{account.name}</td>
                    <td className="py-3 text-right">{formatAmount(account.debit)}</td>
                    <td className="py-3 text-right">{formatAmount(account.credit)}</td>
                  </tr>
                ))}
                {filteredAccounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-500 dark:text-gray-400">
                      No accounts found
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredAccounts.length > 0 && (
                <tfoot>
                  <tr className="border-t dark:border-gray-700 font-semibold">
                    <td colSpan={3} className="py-3 text-right">Total:</td>
                    <td className="py-3 text-right">{formatAmount(totals.debit)}</td>
                    <td className="py-3 text-right">{formatAmount(totals.credit)}</td>
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