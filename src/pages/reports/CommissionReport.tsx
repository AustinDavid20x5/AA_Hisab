import { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { AppLogo } from '../../components/AppLogo';
import * as XLSX from 'xlsx-js-style';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getDateRange } from '../../lib/format';
import DateFilter from '../../components/DateFilter';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';

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
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [transactionType, setTransactionType] = useState<string>('all');
  const [selectedPartner, setSelectedPartner] = useState<string>('all');
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);

  // Load all transactions on mount
  useEffect(() => {
    if (commissionAccountId) {
      fetchTransactions();
    }
  }, [startDate, endDate, commissionAccountId]);

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
      const data = filteredTransactions.map(t => ({
        'Date': t.date,
        'Transaction Type': t.transaction_type,
        'Customer': t.customer,
        'Supplier': t.supplier,
        'Currency': t.customer_currency_code,
        'Amount': formatAmount(t.customer_amount),
        'Commission': formatAmount(t.commission)
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Commission Report');
      XLSX.writeFile(wb, 'commission_report.xlsx');

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

      // Add app logo (matching Layout.tsx gradient design)
      // Create gradient effect with multiple rectangles
      doc.setFillColor(74, 222, 128); // green-400
      doc.roundedRect(14, 8, 12, 12, 3, 3, 'F');
      doc.setFillColor(16, 185, 129); // emerald-500 overlay
      doc.roundedRect(14.5, 8.5, 11, 11, 2.5, 2.5, 'F');
      doc.setFillColor(34, 197, 94); // green-600 center
      doc.roundedRect(15, 9, 10, 10, 2, 2, 'F');
      
      // Add dollar sign
      doc.setTextColor(255, 255, 255); // White text
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('$', 18.5, 16);
      
      // Reset text color to black
      doc.setTextColor(0, 0, 0);
      
      // Add app name and header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('FinTrack Pro', 30, 14);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Financial Management System', 30, 19);
      
      // Add title and period info
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Commission Report', 14, 30);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Period: ${format(new Date(startDate), 'dd/MM/yyyy')} to ${format(new Date(endDate), 'dd/MM/yyyy')}`, 14, 38);

      const columns = [
        'Date',
        'Transaction Type',
        'Customer',
        'Supplier',
        'Currency',
        'Amount',
        'Commission'
      ];

      const data = filteredTransactions.map(t => [
        t.date,
        t.transaction_type,
        t.customer,
        t.supplier,
        t.customer_currency_code,
        formatAmount(t.customer_amount),
        formatAmount(t.commission)
      ]);

      (doc as any).autoTable({
        startY: 43,
        head: [columns],
        body: data,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 40 },
          2: { cellWidth: 60 },
          3: { cellWidth: 60 },
          4: { cellWidth: 20 },
          5: { cellWidth: 25, halign: 'right' },
          6: { cellWidth: 25, halign: 'right' }
        }
      });

      doc.save('commission_report.pdf');
      toast.success('Report exported to PDF successfully');
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
            onClick={exportToExcel}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Export to Excel
          </button>
          <button
            onClick={exportToPDF}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Export to PDF
          </button>
        </div>
      </div>

      <div className="bg-background rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <DateFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <th className="pb-3 font-semibold text-right">Commission</th>
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
                  <td colSpan={6} className="py-3 text-right">Total Commission:</td>
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