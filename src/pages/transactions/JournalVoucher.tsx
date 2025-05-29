import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Pencil, FileSpreadsheet, Download, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatAmount } from '../../lib/format';
import DateFilter from '../../components/DateFilter';
import EditTransactionModal from '../../components/EditTransactionModal';
import * as XLSX from 'xlsx';

interface Account {
  id: string;
  code: string;
  name: string;
  currency_id: string | null;
}

interface Currency {
  id: string;
  code: string;
  name: string;
  exchange_rate_note: 'multiply' | 'divide';
  rate: number;
  is_base: boolean;
}

interface TransactionLine {
  id: string;
  account: Account | null;
  currency: Currency | null;
  debit_doc: number;
  credit_doc: number;
  debit_local: number;
  credit_local: number;
  exchange_rate: number;
}

interface Transaction {
  id: string;
  voucher_no: string;
  transaction_date: string;
  description: string;
  status: string;
  gl_transactions: {
    id: string;
    debit: number;
    credit: number;
    debit_doc_currency: number;
    credit_doc_currency: number;
    exchange_rate: number;
    currency_id: string;
    account: {
      id: string;
      name: string;
    };
  }[];
}

export default function JournalVoucher() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [lines, setLines] = useState<TransactionLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState('');
  
  // Recent transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Excel import
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initializeComponent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch accounts and currencies in parallel
        const [accountsResponse, currenciesResponse] = await Promise.all([
          supabase
            .from('chart_of_accounts')
            .select('id, code, name, currency_id')
            .eq('is_active', true)
            .order('code'),
          supabase
            .from('currencies')
            .select('id, code, name, rate, is_base, exchange_rate_note')
            .order('code')
        ]);

        if (accountsResponse.error) throw accountsResponse.error;
        if (currenciesResponse.error) throw currenciesResponse.error;

        setAccounts(accountsResponse.data || []);
        setCurrencies(currenciesResponse.data || []);
        
        // Fetch recent transactions
        await fetchTransactions();

      } catch (error) {
        console.error('Error initializing component:', error);
        setError('Failed to initialize form');
      } finally {
        setIsLoading(false);
      }
    };

    initializeComponent();
  }, []);
  
  // Fetch transactions when date filter changes
  useEffect(() => {
    fetchTransactions();
  }, [startDate, endDate]);

  const fetchTransactions = async () => {
    try {
      // First get the JV transaction type
      const { data: transType, error: typeError } = await supabase
        .from('tbl_trans_type')
        .select('type_id')
        .eq('transaction_type_code', 'JV')
        .single();

      if (typeError) {
        console.error('Error fetching transaction type:', typeError);
        return;
      }

      if (!transType?.type_id) {
        console.error('Transaction type not found');
        return;
      }

      const { data, error } = await supabase
        .from('gl_headers')
        .select(`
          id,
          voucher_no,
          transaction_date,
          description,
          status,
          gl_transactions (
            id,
            debit,
            credit,
            debit_doc_currency,
            credit_doc_currency,
            exchange_rate,
            currency_id,
            account:chart_of_accounts (
              id,
              name
            )
          )
        `)
        .eq('type_id', transType.type_id)
        .eq('status', 'posted')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .order('transaction_date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to fetch transactions');
    }
  };

  const calculateLocalAmount = (
    amount: number,
    currency: Currency | null,
    exchangeRate: number
  ): number => {
    if (!currency || amount === 0) return 0;
    if (currency.is_base) return Math.round(amount);

    const local = currency.exchange_rate_note === 'multiply'
    ? amount * exchangeRate
    : amount / exchangeRate;

  return Math.round(local); // ✅ round to nearest integer
};

  const addLine = () => {
    const baseCurrency = currencies.find(c => c.is_base);
    if (!baseCurrency) {
      toast.error('Base currency not configured');
      return;
    }

    const newLine: TransactionLine = {
      id: crypto.randomUUID(),
      account: null,
      currency: baseCurrency,
      debit_doc: 0,
      credit_doc: 0,
      debit_local: 0,
      credit_local: 0,
      exchange_rate: baseCurrency.rate
    };
    setLines([...lines, newLine]);
  };

  const removeLine = (id: string) => {
    setLines(lines.filter(line => line.id !== id));
  };

  const updateLine = (id: string, updates: Partial<TransactionLine>) => {
    setLines(lines.map(line => {
      if (line.id === id) {
        const updatedLine = { ...line, ...updates };

        // If updating currency, update exchange rate
        if ('currency' in updates && updates.currency) {
          updatedLine.exchange_rate = updates.currency.rate;
        }

        // If updating debit_doc, calculate debit_local and clear credit
        if ('debit_doc' in updates) {
          updatedLine.debit_doc = updates.debit_doc || 0;
          updatedLine.debit_local = calculateLocalAmount(
            updatedLine.debit_doc,
            updatedLine.currency,
            updatedLine.exchange_rate
          );
          updatedLine.credit_doc = 0;
          updatedLine.credit_local = 0;
        }

        // If updating credit_doc, calculate credit_local and clear debit
        if ('credit_doc' in updates) {
          updatedLine.credit_doc = updates.credit_doc || 0;
          updatedLine.credit_local = calculateLocalAmount(
            updatedLine.credit_doc,
            updatedLine.currency,
            updatedLine.exchange_rate
          );
          updatedLine.debit_doc = 0;
          updatedLine.debit_local = 0;
        }

        // If updating exchange_rate, recalculate local amounts
        if ('exchange_rate' in updates) {
          if (updatedLine.debit_doc > 0) {
            updatedLine.debit_local = calculateLocalAmount(
              updatedLine.debit_doc,
              updatedLine.currency,
              updatedLine.exchange_rate
            );
          } else if (updatedLine.credit_doc > 0) {
            updatedLine.credit_local = calculateLocalAmount(
              updatedLine.credit_doc,
              updatedLine.currency,
              updatedLine.exchange_rate
            );
          }
        }
        console.log('Updated Line:', updatedLine);
        return updatedLine;
      }
      return line;
    }));
  };

  const handleSave = async () => {
    try {
      // First get the JV transaction type
      const { data: transType, error: typeError } = await supabase
        .from('tbl_trans_type')
        .select('type_id')
        .eq('transaction_type_code', 'JV')
        .single();

      if (typeError) {
        console.error('Error fetching transaction type:', typeError);
        toast.error('Failed to get transaction type');
        return;
      }

      if (!transType?.type_id) {
        toast.error('Transaction type not configured');
        return;
      }

      if (lines.length === 0) {
        toast.error('Please add at least one transaction line');
        return;
      }

      // Validate all required fields
      for (const line of lines) {
        if (!line.account) {
          toast.error('Please select an account for all lines');
          return;
        }

        if (!line.currency) {
          toast.error('Please select a currency for all lines');
          return;
        }

        if (line.debit_doc === 0 && line.credit_doc === 0) {
          toast.error('Please enter either debit or credit amount for all lines');
          return;
        }

        if (!line.exchange_rate || line.exchange_rate <= 0) {
          toast.error('Please enter a valid exchange rate for all lines');
          return;
        }
      }

      // Calculate totals in local currency
      const totalDebit = lines.reduce((sum, line) => sum + line.debit_local, 0);
      const totalCredit = lines.reduce((sum, line) => sum + line.credit_local, 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        toast.error('Total debit must equal total credit');
        return;
      }

      // Create header
      const { data: header, error: headerError } = await supabase
        .from('gl_headers')
        .insert({
          transaction_date: date,
          type_id: transType.type_id,
          description: narration.toUpperCase(),
          status: 'posted'
        })
        .select()
        .single();

      if (headerError) throw headerError;

      // Create transactions array
      const transactions = lines.map(line => {
        if (!line.account?.id || !line.currency?.id) {
          throw new Error('Invalid line data');
        }

        return {
          header_id: header.id,
          account_id: line.account.id,
          currency_id: line.currency.id,
          debit: line.debit_local,
          credit: line.credit_local,
          debit_doc_currency: line.debit_doc,
          credit_doc_currency: line.credit_doc,
          exchange_rate: line.exchange_rate,
          description: narration.toUpperCase()
        };
      });

      // Insert transactions
      const { error: transError } = await supabase
        .from('gl_transactions')
        .insert(transactions);

      if (transError) {
        // Rollback by deleting the header
        await supabase
          .from('gl_headers')
          .delete()
          .eq('id', header.id);
        throw transError;
      }

      toast.success('Journal voucher saved successfully');
      
      // Reset form
      setDate(new Date().toISOString().split('T')[0]);
      setNarration('');
      setLines([]);
      
      // Refresh transactions
      fetchTransactions();

    } catch (error) {
      console.error('Error saving journal voucher:', error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to save journal voucher');
      }
    }
  };

  const handleCancel = () => {
    if (narration || lines.length > 0) {
      if (confirm('Are you sure you want to clear the form?')) {
        setDate(new Date().toISOString().split('T')[0]);
        setNarration('');
        setLines([]);
      }
    }
  };
  
  const handleEdit = (transactionId: string) => {
    navigate(`/transactions/jv/edit/${transactionId}`);
  };

  const handleSaveEdit = () => {
    fetchTransactions();
  };
  
  const getTotalDebit = (transaction: Transaction): number => {
    return transaction.gl_transactions.reduce((sum, t) => sum + (t.debit || 0), 0);
  };
  
  const getTotalCredit = (transaction: Transaction): number => {
    return transaction.gl_transactions.reduce((sum, t) => sum + (t.credit || 0), 0);
  };
  
  const getAccountNames = (transaction: Transaction): string => {
    const accounts = transaction.gl_transactions.map(t => t.account.name);
    const uniqueAccounts = [...new Set(accounts)];
    
    if (uniqueAccounts.length <= 2) {
      return uniqueAccounts.join(', ');
    }
    
    return `${uniqueAccounts[0]}, ${uniqueAccounts[1]}, +${uniqueAccounts.length - 2} more`;
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const binaryStr = evt.target?.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
          toast.error('No data found in the Excel file');
          return;
        }

        // Process the imported data
        processImportedData(data);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        toast.error('Failed to parse Excel file');
      }
    };
    reader.readAsBinaryString(file);
  };

  const processImportedData = (data: any[]) => {
    try {
      // Clear existing lines
      setLines([]);
      
      // Set date and narration from first row if available
      if (data[0].Date) {
        // Convert Excel date to ISO string
        const excelDate = data[0].Date;
        let dateValue;
        
        if (typeof excelDate === 'number') {
          // Excel stores dates as days since 1900-01-01
          const excelEpoch = new Date(1899, 11, 30);
          dateValue = new Date(excelEpoch.getTime() + excelDate * 86400000);
        } else if (typeof excelDate === 'string') {
          dateValue = new Date(excelDate);
        }
        
        if (dateValue && !isNaN(dateValue.getTime())) {
          setDate(dateValue.toISOString().split('T')[0]);
        }
      }
      
      if (data[0].Narration) {
        setNarration(data[0].Narration);
      }
      
      // Process each row into a transaction line
      const newLines = data.map(row => {
        // Find account by name or code
        const account = accounts.find(a => 
          a.name.toLowerCase() === String(row.Account).toLowerCase() || 
          a.code === String(row.Account)
        );
        
        // Find currency by code
        const currency = currencies.find(c => 
          c.code.toLowerCase() === String(row.Currency).toLowerCase()
        ) || currencies.find(c => c.is_base);
        
        // Get exchange rate
        const exchangeRate = row['Currency Rate'] || currency?.rate || 1;
        
        // Get debit and credit amounts
        const debitDoc = parseFloat(row['Debit (Doc Currency)']) || 0;
        const creditDoc = parseFloat(row['Credit (Doc Currency)']) || 0;
        
        // Calculate local amounts
        const debitLocal = currency ? 
          calculateLocalAmount(debitDoc, currency, exchangeRate) : debitDoc;
        const creditLocal = currency ? 
          calculateLocalAmount(creditDoc, currency, exchangeRate) : creditDoc;
        
        return {
          id: crypto.randomUUID(),
          account,
          currency,
          debit_doc: debitDoc,
          credit_doc: creditDoc,
          debit_local: debitLocal,
          credit_local: creditLocal,
          exchange_rate: exchangeRate
        };
      });
      
      setLines(newLines);
      toast.success(`Imported ${newLines.length} lines from Excel`);
    } catch (error) {
      console.error('Error processing imported data:', error);
      toast.error('Failed to process imported data');
    }
  };

  const downloadTemplate = () => {
    try {
      // Create workbook with template structure
      const workbook = XLSX.utils.book_new();
      
      // Define template headers
      const headers = [
        'Date', 
        'Narration', 
        'Account', 
        'Currency', 
        'Currency Rate', 
        'Debit (Doc Currency)', 
        'Credit (Doc Currency)',
        'Debit (Local)',
        'Credit (Local)'
      ];
      
      // Create sample data
      const sampleData = [
        {
          'Date': new Date().toISOString().split('T')[0],
          'Narration': 'SAMPLE JOURNAL ENTRY',
          'Account': 'Cash',
          'Currency': 'AED',
          'Currency Rate': 1,
          'Debit (Doc Currency)': 1000,
          'Credit (Doc Currency)': 0,
          'Debit (Local)': 1000,
          'Credit (Local)': 0
        },
        {
          'Date': new Date().toISOString().split('T')[0],
          'Narration': 'SAMPLE JOURNAL ENTRY',
          'Account': 'Accounts Payable',
          'Currency': 'AED',
          'Currency Rate': 1,
          'Debit (Doc Currency)': 0,
          'Credit (Doc Currency)': 1000,
          'Debit (Local)': 0,
          'Credit (Local)': 1000
        }
      ];
      
      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Journal Voucher Template');
      
      // Generate Excel file
      XLSX.writeFile(workbook, 'journal_voucher_template.xlsx');
      
      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Failed to download template');
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
        <h1 className="text-2xl font-semibold">Journal Voucher</h1>
        <div className="flex gap-2">
          <button
            onClick={handleImportClick}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Import from Excel
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls"
            className="hidden"
          />
        </div>
      </div>
      
      <div className="flex justify-end">
        <a 
          href="#" 
          onClick={(e) => { e.preventDefault(); downloadTemplate(); }}
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 flex items-center gap-1"
        >
          <Download className="w-4 h-4" />
          Download Excel Template
        </a>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Narration
              </label>
              <input
                type="text"
                value={narration}
                onChange={(e) => setNarration(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                maxLength={100}
                required
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">Account</th>
                  <th className="pb-3 font-semibold">Currency</th>
                  <th className="pb-3 font-semibold text-right">Exchange Rate</th>
                  <th className="pb-3 font-semibold text-right">Debit (Doc)</th>
                  <th className="pb-3 font-semibold text-right">Credit (Doc)</th>
                  <th className="pb-3 font-semibold text-right">Debit (Local)</th>
                  <th className="pb-3 font-semibold text-right">Credit (Local)</th>
                  <th className="pb-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-3">
                      <select
                        value={line.account?.id || ''}
                        onChange={(e) => {
                          const account = accounts.find(a => a.id === e.target.value);
                          updateLine(line.id, { account });
                        }}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="">Select Account</option>
                        {accounts.map(account => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3">
                      <select
                        value={line.currency?.id || ''}
                        onChange={(e) => {
                          const currency = currencies.find(c => c.id === e.target.value);
                          updateLine(line.id, { currency });
                        }}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="">Select Currency</option>
                        {currencies.map(currency => (
                          <option key={currency.id} value={currency.id}>
                            {currency.code} - {currency.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        value={line.exchange_rate || ''}
                        onChange={(e) => updateLine(line.id, { exchange_rate: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                        step="0.0001"
                        min="0.0001"
                        required
                        disabled={line.currency?.is_base}
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        value={line.debit_doc || ''}
                        onChange={(e) => updateLine(line.id, { debit_doc: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                        step="0.01"
                        min="0"
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        value={line.credit_doc || ''}
                        onChange={(e) => updateLine(line.id, { credit_doc: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                        step="0.01"
                        min="0"
                      />
                    </td>
                    <td className="py-3 text-right">
                      {formatAmount(line.debit_local)}
                    </td>
                    <td className="py-3 text-right">
                      {formatAmount(line.credit_local)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => removeLine(line.id)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-gray-500 dark:text-gray-400">
                      No transactions added
                    </td>
                  </tr>
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr className="border-t dark:border-gray-700 font-semibold">
                    <td colSpan={5} className="py-3 text-right">Total:</td>
                    <td className="py-3 text-right">{formatAmount(lines.reduce((sum, line) => sum + line.debit_local, 0))}</td>
                    <td className="py-3 text-right">{formatAmount(lines.reduce((sum, line) => sum + line.credit_local, 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="mt-4 flex justify-between">
            <button
              onClick={addLine}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/50 dark:hover:bg-blue-900/75"
            >
              <Plus className="w-4 h-4" />
              Add Line
            </button>

            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Recent Transactions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold">Recent Transactions</h2>
            <DateFilter
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
            />
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Voucher No</th>
                  <th className="pb-3 font-semibold">Description</th>
                  <th className="pb-3 font-semibold">Accounts</th>
                  <th className="pb-3 font-semibold text-right">Debit</th>
                  <th className="pb-3 font-semibold text-right">Credit</th>
                  <th className="pb-3 font-semibold text-center">Status</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="py-3">
                      {new Date(transaction.transaction_date).toLocaleDateString()}
                    </td>
                    <td className="py-3">{transaction.voucher_no}</td>
                    <td className="py-3">{transaction.description}</td>
                    <td className="py-3">{getAccountNames(transaction)}</td>
                    <td className="py-3 text-right">{formatAmount(getTotalDebit(transaction))}</td>
                    <td className="py-3 text-right">{formatAmount(getTotalCredit(transaction))}</td>
                    <td className="py-3 text-center">
                      <span className={`
                        px-2 py-1 text-xs font-medium rounded-full
                        ${transaction.status === 'posted'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                        }
                      `}>
                        {transaction.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleEdit(transaction.id)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                      >
                        <Edit className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-gray-500 dark:text-gray-400">
                      No transactions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <EditTransactionModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        transaction={editingTransaction}
        onSave={handleSaveEdit}
      />
    </div>
  );
}