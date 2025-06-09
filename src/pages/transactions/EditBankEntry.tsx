import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

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
  type_id: string;
  gl_transactions: {
    id: string;
    debit: number;
    credit: number;
    debit_doc_currency: number;
    credit_doc_currency: number;
    exchange_rate: number;
    currency_id: string;
    account_id: string;
    account: {
      id: string;
      name: string;
      code: string;
    };
  }[];
}

interface Balance {
  balance: number;
  currency_id: string;
  currency_code: string;
}

export default function EditBankEntry() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [bankBooks, setBankBooks] = useState<BankBook[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedBankBook, setSelectedBankBook] = useState<BankBook | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [bankBookBalance, setBankBookBalance] = useState<Balance[]>([]);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voucherNo, setVoucherNo] = useState('');
  const [dataInitialized, setDataInitialized] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    narration: '',
    documentAmount: '',
    exchangeRate: '1.0000'
  });

  useEffect(() => {
    // Immediately redirect if no ID is provided
    if (!id) {
      toast.error('No transaction ID provided');
      navigate('/transactions/bank-entry');
      return;
    }

    const initializeComponent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch all required data in parallel
        const [bankBooksData, accountsData] = await Promise.all([
          fetchBankBooksData(),
          fetchAccountsData()
        ]);

        if (bankBooksData && accountsData) {
          // Fetch and populate transaction data
          await fetchTransaction(id, bankBooksData, accountsData);
          setDataInitialized(true);
        }
      } catch (error) {
        console.error('Error initializing component:', error);
        setError('Failed to load transaction data');
        toast.error('Failed to load transaction data');
      } finally {
        setIsLoading(false);
      }
    };

    initializeComponent();
  }, [id, navigate]);

  const fetchBankBooksData = async (): Promise<BankBook[] | null> => {
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
        return null;
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
      setBankBooks(data || []);
      return data || [];
    } catch (error) {
      console.error('Error fetching bank books:', error);
      toast.error('Failed to fetch bank books');
      return null;
    }
  };

  const fetchAccountsData = async (): Promise<Account[] | null> => {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id, code, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAccounts(data || []);
      return data || [];
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Failed to fetch accounts');
      return null;
    }
  };

  const fetchBankBookBalance = async (accountId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('get_cash_book_doc_balance', {
          p_account_id: accountId
        });

      if (error) throw error;
      setBankBookBalance(data || []);
    } catch (error) {
      console.error('Error fetching balance:', error);
      toast.error('Failed to fetch balance');
      setBankBookBalance([{
        balance: 0,
        currency_id: selectedBankBook?.currency.id || '',
        currency_code: selectedBankBook?.currency.code || ''
      }]);
    }
  };

  const fetchTransaction = async (transactionId: string, bankBooksData: BankBook[], accountsData: Account[]) => {
    try {
      const { data, error } = await supabase
        .from('gl_headers')
        .select(`
          id,
          voucher_no,
          transaction_date,
          description,
          status,
          type_id,
          gl_transactions (
            id,
            debit,
            credit,
            debit_doc_currency,
            credit_doc_currency,
            exchange_rate,
            currency_id,
            account_id,
            account:chart_of_accounts (
              id,
              name,
              code
            )
          )
        `)
        .eq('id', transactionId)
        .single();

      if (error) throw error;

      setTransaction(data);
      setVoucherNo(data.voucher_no);

      // Find bank book and account from the transaction
      const bankTransaction = data.gl_transactions.find(t => 
        bankBooksData.some(bb => bb.id === t.account_id)
      );
      const accountTransaction = data.gl_transactions.find(t => 
        !bankBooksData.some(bb => bb.id === t.account_id)
      );

      if (bankTransaction) {
        const bankBook = bankBooksData.find(bb => bb.id === bankTransaction.account_id);
        if (bankBook) {
          setSelectedBankBook(bankBook);
          fetchBankBookBalance(bankBook.id);
        }
      }

      if (accountTransaction) {
        const account = accountsData.find(acc => acc.id === accountTransaction.account_id);
        if (account) {
          setSelectedAccount(account);
        }
      }

      // Calculate the amount (positive for debit to bank, negative for credit to bank)
      const amount = bankTransaction ? 
        (bankTransaction.debit_doc_currency || -bankTransaction.credit_doc_currency) : 0;

      // Set form data
      setFormData({
        date: data.transaction_date,
        narration: data.description,
        documentAmount: Math.abs(amount).toString(),
        exchangeRate: bankTransaction?.exchange_rate.toFixed(4) || '1.0000'
      });

    } catch (error) {
      console.error('Error fetching transaction:', error);
      toast.error('Failed to fetch transaction');
      setError('Failed to fetch transaction');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transaction) {
      toast.error('Transaction not found');
      return;
    }

    if (!selectedBankBook || !selectedAccount) {
      toast.error('Please select bank book and account');
      return;
    }

    try {
      const amount = parseFloat(formData.documentAmount);
      const exchangeRate = parseFloat(formData.exchangeRate);

      if (isNaN(amount)) {
        toast.error('Please enter a valid amount');
        return;
      }

      //if (amount <= 0) {
        //toast.error('Amount must be greater than zero');
        //return;
      //}

      // Calculate base currency amount
      let baseAmount: number;
      if (selectedBankBook.currency.exchange_rate_note === 'multiply') {
        baseAmount = amount * exchangeRate;
      } else if (selectedBankBook.currency.exchange_rate_note === 'divide') {
        baseAmount = amount / exchangeRate;
      } else {
        baseAmount = amount; // Base currency
      }

      // Update GL Header
      const { error: headerError } = await supabase
        .from('gl_headers')
        .update({
          transaction_date: formData.date,
          description: formData.narration || 'Bank Entry'
        })
        .eq('id', transaction.id);

      if (headerError) throw headerError;

      // Delete existing GL transactions
      const { error: deleteError } = await supabase
        .from('gl_transactions')
        .delete()
        .eq('header_id', transaction.id);

      if (deleteError) throw deleteError;

      // Create new GL Transactions
      const glTransactions = [
        {
          header_id: transaction.id,
          account_id: selectedBankBook.id,
          debit: amount > 0 ? baseAmount : 0,
          credit: amount < 0 ? Math.abs(baseAmount) : 0,
          debit_doc_currency: amount > 0 ? amount : 0,
          credit_doc_currency: amount < 0 ? Math.abs(amount) : 0,
          exchange_rate: exchangeRate,
          currency_id: selectedBankBook.currency.id
        },
        {
          header_id: transaction.id,
          account_id: selectedAccount.id,
          debit: amount < 0 ? Math.abs(baseAmount) : 0,
          credit: amount > 0 ? baseAmount : 0,
          debit_doc_currency: amount < 0 ? Math.abs(amount) : 0,
          credit_doc_currency: amount > 0 ? amount : 0,
          exchange_rate: exchangeRate,
          currency_id: selectedBankBook.currency.id
        }
      ];

      const { error: transactionError } = await supabase
        .from('gl_transactions')
        .insert(glTransactions);

      if (transactionError) throw transactionError;

      toast.success('Bank entry updated successfully');
      navigate('/transactions/bank-entry');
    } catch (error) {
      console.error('Error updating bank entry:', error);
      toast.error('Failed to update bank entry');
    }
  };

  const handleCancel = () => {
    navigate('/transactions/bank-entry');
  };

  const formatBalanceDisplay = (balance: Balance) => {
    const amount = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(balance.balance));
    return `${balance.currency_code} ${balance.balance < 0 ? '-' : ''}${amount}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/transactions/bank-entry')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Bank Entry
          </button>
        </div>
      </div>
    );
  }

  if (!dataInitialized || !transaction) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-600 mb-4">Transaction Not Found</h2>
          <p className="text-gray-600 mb-4">The requested transaction could not be found.</p>
          <button
            onClick={() => navigate('/transactions/bank-entry')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Bank Entry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Bank Entry</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Voucher No: {voucherNo}
        </div>
      </div>

      {/* Bank Book Selection */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Bank Book Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Bank Book
            </label>
            <select
              value={selectedBankBook?.id || ''}
              onChange={(e) => {
                const bankBook = bankBooks.find(bb => bb.id === e.target.value);
                setSelectedBankBook(bankBook || null);
                if (bankBook) {
                  fetchBankBookBalance(bankBook.id);
                  setFormData(prev => ({
                    ...prev,
                    exchangeRate: bankBook.currency.rate.toFixed(4)
                  }));
                }
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
                {selectedBankBook.currency.code}
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
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Edit Bank Entry</h2>
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter transaction description"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Amount ({selectedBankBook?.currency.code || 'Currency'})
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.documentAmount}
                onChange={(e) => setFormData(prev => ({ ...prev, documentAmount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}