import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatAmount } from '../../lib/format';
import DateFilter from '../../components/DateFilter';
import EditTransactionModal from '../../components/EditTransactionModal';
import { LoadingSpinner } from '../../components/LoadingSpinner';

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

interface Account {
  id: string;
  code: string;
  name: string;
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

interface Balance {
  balance: number;
  currency_id: string;
  currency_code: string;
}

export default function BankEntry() {
  const navigate = useNavigate();
  const [bankBooks, setBankBooks] = useState<BankBook[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedBankBook, setSelectedBankBook] = useState<BankBook | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bankBookBalance, setBankBookBalance] = useState<Balance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [limit, setLimit] = useState(20);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [bankTypeId, setBankTypeId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    narration: '',
    documentAmount: '',
    exchangeRate: '1.0000'
  });

  useEffect(() => {
    if (selectedBankBook) {
      fetchBankBookBalance(selectedBankBook.id);
      fetchTransactions(selectedBankBook.id);
      setFormData(prev => ({
        ...prev,
        exchangeRate: selectedBankBook.currency?.rate?.toFixed(4) || '1.0000'
      }));
      setSelectedAccount(null); // Reset account dropdown
    }
  }, [selectedBankBook, limit]);

  useEffect(() => {
    fetchBankBooks();
    fetchAccounts();
    initializeBankType();
  }, []);

  const initializeBankType = async () => {
    try {
      const { data, error } = await supabase
        .from('tbl_trans_type')
        .select('type_id')
        .eq('transaction_type_code', 'BANK') // ✅ properly chained
        .single();
  
      if (error) {
        console.error('Error fetching BANK transaction type:', error);
        toast.error('Failed to initialize bank transaction type');
        return;
      }
  
      setBankTypeId(data.type_id); // ✅ corrected field
    } catch (error) {
      console.error('Error initializing bank type:', error);
      toast.error('Failed to initialize system');
    }
  };
  

  const getBankTransactionType = async () => {
    if (!bankTypeId) {
      throw new Error('BANK transaction type not initialized');
    }
    return bankTypeId;
  };

  const fetchBankBooks = async () => {
    try {
      // First get the Bank subcategory ID
      const { data: subcategoryData, error: subcategoryError } = await supabase
        .from('subcategories')
        .select('id')
        .eq('name', 'Bank')
        .single();

      if (subcategoryError) {
        console.error('Error fetching Bank subcategory:', subcategoryError);
        toast.error('Failed to fetch Bank subcategory');
        setIsLoading(false);
        return;
      }

      // Then get accounts with that subcategory
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          code,
          name,
          currency:currencies (
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
      
      // Filter out accounts with missing currency data and add fallbacks
      const validBankBooks = (data || []).map(account => ({
        ...account,
        currency: account.currency || {
          id: '',
          code: 'AED',
          rate: 1,
          is_base: true,
          exchange_rate_note: null
        }
      })).filter(account => account.currency);
      
      setBankBooks(validBankBooks);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching bank books:', error);
      toast.error('Failed to fetch bank books');
      setError('Failed to load bank books. Please refresh the page.');
      setIsLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id, code, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Failed to fetch accounts');
    }
  };

  const fetchBankBookBalance = async (accountId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('get_cash_book_doc_balance', {
          p_account_id: accountId
        });

      if (error) {
        console.error('RPC Error:', error);
        throw new Error(error.message);
      }

      // Ensure data is properly formatted
      if (!data || !Array.isArray(data)) {
        throw new Error('Invalid balance data format');
      }

      // Process balance data
      const processedData = data.length > 0 
        ? data 
        : [{
            balance: 0,
            currency_id: selectedBankBook?.currency?.id || '',
            currency_code: selectedBankBook?.currency?.code || 'AED'
          }];

      setBankBookBalance(processedData);
    } catch (error) {
      console.error('Error fetching balance:', error);
      toast.error('Failed to fetch balance');
      setBankBookBalance([{
        balance: 0,
        currency_id: selectedBankBook?.currency?.id || '',
        currency_code: selectedBankBook?.currency?.code || 'AED'
      }]);
    }
  };

  const fetchTransactions = async (accountId: string) => {
    try {
      setIsLoading(true);
      
      if (!bankTypeId) {
        toast.error('System not properly initialized');
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
        .eq('type_id', bankTypeId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Filter transactions that involve the selected bank book
      const filteredTransactions = (data || []).filter(transaction => 
        transaction.gl_transactions.some(gl => gl.account.id === accountId)
      );

      setTransactions(filteredTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to fetch transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBankBook || !selectedAccount) {
      toast.error('Please select bank book and account');
      return;
    }

    if (!bankTypeId) {
      toast.error('System not properly initialized. Please refresh the page.');
      return;
    }

    try {
      const amount = parseFloat(formData.documentAmount);
      const exchangeRate = parseFloat(formData.exchangeRate);

      if (isNaN(amount)) {
        toast.error('Please enter a valid amount');
        return;
      }

      if (amount <= 0) {
        toast.error('Amount must be greater than zero');
        return;
      }

      // Calculate base currency amount
      let baseAmount: number;
      if (selectedBankBook.currency?.exchange_rate_note === 'multiply') {
        baseAmount = amount * exchangeRate;
      } else if (selectedBankBook.currency?.exchange_rate_note === 'divide') {
        baseAmount = amount / exchangeRate;
      } else {
        baseAmount = amount; // Base currency
      }

      // Create GL Header
      const { data: headerData, error: headerError } = await supabase
        .from('gl_headers')
        .insert({
          transaction_date: formData.date,
          description: formData.narration || 'Bank Entry',
          type_id: bankTypeId,
          status: 'posted'
        })
        .select()
        .single();

      if (headerError) throw headerError;

      // Create GL Transactions
      const glTransactions = [
        {
          header_id: headerData.id,
          account_id: selectedBankBook.id,
          debit: amount > 0 ? baseAmount : 0,
          credit: amount < 0 ? Math.abs(baseAmount) : 0,
          debit_doc_currency: amount > 0 ? amount : 0,
          credit_doc_currency: amount < 0 ? Math.abs(amount) : 0,
          exchange_rate: exchangeRate,
          currency_id: selectedBankBook.currency?.id || ''
        },
        {
          header_id: headerData.id,
          account_id: selectedAccount.id,
          debit: amount < 0 ? Math.abs(baseAmount) : 0,
          credit: amount > 0 ? baseAmount : 0,
          debit_doc_currency: amount < 0 ? Math.abs(amount) : 0,
          credit_doc_currency: amount > 0 ? amount : 0,
          exchange_rate: exchangeRate,
          currency_id: selectedBankBook.currency?.id || ''
        }
      ];

      const { error: transactionError } = await supabase
        .from('gl_transactions')
        .insert(glTransactions);

      if (transactionError) {
        // Rollback header if transaction insertion fails
        await supabase.from('gl_headers').delete().eq('id', headerData.id);
        throw transactionError;
      }

      toast.success('Bank entry created successfully');
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        narration: '',
        documentAmount: '',
        exchangeRate: selectedBankBook.currency?.rate?.toFixed(4) || '1.0000'
      });
      setSelectedAccount(null);
      
      // Refresh data
      if (selectedBankBook) {
        fetchBankBookBalance(selectedBankBook.id);
        fetchTransactions(selectedBankBook.id);
      }
    } catch (error) {
      console.error('Error creating bank entry:', error);
      toast.error('Failed to create bank entry');
    }
  };

  const formatBalanceDisplay = (balance: Balance) => {
    const amount = formatAmount(Math.abs(balance.balance));
    return `${balance.currency_code} ${balance.balance < 0 ? '-' : ''}${amount}`;
  };

  const handleEdit = (transaction: Transaction) => {
    if (transaction && transaction.id) {
      navigate(`/transactions/bank-entry/edit/${transaction.id}`);
    } else {
      toast.error('Invalid transaction ID');
    }
  };

  const handleSaveEdit = async (updatedTransaction: Transaction) => {
    try {
      // Implementation for saving edited transaction
      toast.success('Transaction updated successfully');
      setIsEditModalOpen(false);
      setEditingTransaction(null);
      
      // Refresh transactions
      if (selectedBankBook) {
        fetchTransactions(selectedBankBook.id);
        fetchBankBookBalance(selectedBankBook.id);
      }
    } catch (error) {
      console.error('Error updating transaction:', error);
      toast.error('Failed to update transaction');
    }
  };

  const getTransactionAmount = (transaction: Transaction): number => {
    const bankTransaction = transaction.gl_transactions.find(t => 
      t.account.id === selectedBankBook?.id
    );
    
    return bankTransaction?.debit_doc_currency || -bankTransaction?.credit_doc_currency || 0;
  };

  const getAccountName = (transaction: Transaction): string => {
    const accountTransaction = transaction.gl_transactions.find(t => 
      t.account.id !== selectedBankBook?.id
    );
    
    return accountTransaction?.account.name || 'Unknown Account';
  };

  const filteredTransactions = transactions.filter(transaction =>
    transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transaction.voucher_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getAccountName(transaction).toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading && bankBooks.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bank Entry</h1>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Bank Book Selection */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Select Bank Book</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Bank Book
            </label>
            <select
              value={selectedBankBook?.id || ''}
              onChange={(e) => {
                const bankBook = bankBooks.find(cb => cb.id === e.target.value);
                setSelectedBankBook(bankBook || null);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select a bank book...</option>
              {bankBooks.map((bankBook) => (
                <option key={bankBook.id} value={bankBook.id}>
                  {bankBook.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedBankBook && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Currency
              </label>
              <p className="text-sm text-gray-900 dark:text-white">
                {selectedBankBook.currency?.code || 'AED'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Current Balance
              </label>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {bankBookBalance.length > 0 ? formatBalanceDisplay(bankBookBalance[0]) : 'Loading...'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Form */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">New Bank Entry</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Date
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                disabled={!selectedBankBook}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Account
              </label>
              <select
                value={selectedAccount?.id || ''}
                onChange={(e) => {
                  const account = accounts.find(acc => acc.id === e.target.value);
                  setSelectedAccount(account || null);
                }}
                disabled={!selectedBankBook}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
                required
              >
                <option value="">Select an account...</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Narration
            </label>
            <input
              type="text"
              value={formData.narration}
              onChange={(e) => setFormData(prev => ({ ...prev, narration: e.target.value }))}
              disabled={!selectedBankBook}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
              placeholder="Enter transaction description"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Amount ({selectedBankBook?.currency?.code || 'AED'})
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.documentAmount}
                onChange={(e) => setFormData(prev => ({ ...prev, documentAmount: e.target.value }))}
                disabled={!selectedBankBook}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Exchange Rate
              </label>
              <input
                type="number"
                step="0.0001"
                value={formData.exchangeRate}
                onChange={(e) => setFormData(prev => ({ ...prev, exchangeRate: e.target.value }))}
                disabled={!selectedBankBook}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFormData({
                  date: new Date().toISOString().split('T')[0],
                  narration: '',
                  documentAmount: '',
                  exchangeRate: selectedBankBook?.currency?.rate?.toFixed(4) || '1.0000'
                });
                setSelectedAccount(null);
              }}
              disabled={!selectedBankBook}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={!selectedBankBook}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </form>
      </div>

      {/* Recent Transactions */}
      {selectedBankBook && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Recent Transactions</h2>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search transactions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <button
                  onClick={() => selectedBankBook && fetchTransactions(selectedBankBook.id)}
                  className="px-4 py-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Voucher No
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center">
                      <LoadingSpinner size="sm" />
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      No transactions found
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {new Date(transaction.transaction_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {transaction.voucher_no}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {getAccountName(transaction)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                        {transaction.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className={`font-medium ${
                          getTransactionAmount(transaction) >= 0 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {formatAmount(getTransactionAmount(transaction))}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                        <button
                          onClick={() => handleEdit(transaction)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                        >
                          <Edit className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredTransactions.length >= limit && (
            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing {filteredTransactions.length} transactions
              </p>
              <button
                onClick={() => setLimit(prev => prev + 20)}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {/* Edit Transaction Modal */}
      {isEditModalOpen && editingTransaction && (
        <EditTransactionModal
          transaction={editingTransaction}
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingTransaction(null);
          }}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}