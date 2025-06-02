import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, ChevronDown, ChevronUp, FileSpreadsheet, FileText, Printer, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatAmount } from '../../lib/format';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { LoadingSpinner } from '../../components/LoadingSpinner';

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
      printContainer.innerHTML = `
        <div class="print-running-header">
          <div class="print-header-content">
            <div class="print-left-section">
              <div class="print-logo-container">
                <div class="print-logo-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="2" x2="12" y2="22"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                </div>
                <div class="print-company-info">
                  <div class="print-logo-title">FinTrack Pro</div>
                  <div class="print-logo-subtitle">Financial Management</div>
                </div>
              </div>
            </div>
            <div class="print-center-section">
              <div class="print-report-title">Trial Balance</div>
            </div>
            <div class="print-right-section">
              <div class="print-date">Print Date & Time: ${getCurrentDateTimeFormatted()}</div>
            </div>
          </div>
        </div>
        <div class="print-main-content">
          <div class="print-report-info">
            <p>Report Date: ${formatDateForPrint(selectedDate)}</p>
            ${baseCurrency ? `<p>Currency: ${baseCurrency.code} - ${baseCurrency.name}</p>` : ''}
          </div>
          <table class="print-table">
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Sub Category</th>
                <th class="number">Debit</th>
                <th class="number">Credit</th>
              </tr>
            </thead>
            <tbody>
              ${filteredAccounts.map(account => `
                <tr>
                  <td>${account.code}</td>
                  <td>${account.name}</td>
                  <td>${account.subcategory}</td>
                  <td class="number">${formatAmount(account.debit)}</td>
                  <td class="number">${formatAmount(account.credit)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3"><strong>Total</strong></td>
                <td class="number"><strong>${formatAmount(totals.debit)}</strong></td>
                <td class="number"><strong>${formatAmount(totals.credit)}</strong></td>
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
          .print-table .total-row {
            font-weight: bold;
            background-color: #f9f9f9 !important;
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
    return <LoadingSpinner title="Loading Trial Balance..." />;
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
                    <td className="py-3">{account.code}</td>
                    <td className="py-3">{account.name}</td>
                    <td className="py-3">{account.subcategory}</td>
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