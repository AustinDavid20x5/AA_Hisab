import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatAmount } from '../../lib/format';
import DateFilter from '../../components/DateFilter';
import EditTransactionModal from '../../components/EditTransactionModal';
import { LoadingSpinner } from '../../components/LoadingSpinner';

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

interface BusinessPartner {
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

export default function CashEntry() {
  const navigate = useNavigate();
  const [cashBooks, setCashBooks] = useState<CashBook[]>([]);
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [selectedCashBook, setSelectedCashBook] = useState<CashBook | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<BusinessPartner | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cashBookBalance, setCashBookBalance] = useState<Balance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [limit, setLimit] = useState(20);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [cashTypeId, setCashTypeId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    narration: '',
    documentAmount: '',
    exchangeRate: '1.0000'
  });

  useEffect(() => {
    if (selectedCashBook) {
      fetchCashBookBalance(selectedCashBook.id);
      fetchTransactions(selectedCashBook.id);
      setFormData(prev => ({
        ...prev,
        exchangeRate: selectedCashBook.currency.rate.toFixed(4)
      }));
    }
  }, [selectedCashBook, limit]);

  useEffect(() => {
    fetchCashBooks();
    fetchBusinessPartners();
    initializeCashType();
  }, []);

  const initializeCashType = async () => {
    try {
      const { data, error } = await supabase
        .from('tbl_trans_type')
        .select('type_id')
        .eq('transaction_type_code', 'CASH')
        .single();

      if (error) {
        console.error('Error fetching CASH transaction type:', error);
        toast.error('Error initializing cash transactions. Please contact support.');
        return;
      }

      if (!data) {
        toast.error('CASH transaction type not found. Please contact support.');
        return;
      }

      setCashTypeId(data.type_id);
    } catch (error) {
      console.error('Error initializing cash type:', error);
      toast.error('Failed to initialize cash transactions');
    }
  };

  const getCashTransactionType = async () => {
    if (!cashTypeId) {
      throw new Error('CASH transaction type not initialized');
    }
    return cashTypeId;
  };

  const fetchCashBooks = async () => {
    try {
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
        .eq('is_cashbook', true)
        .eq('is_active', true);

      if (error) throw error;
      setCashBooks(data || []);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching cash books:', error);
      toast.error('Failed to fetch cash books');
      setError('Failed to load cash books');
      setIsLoading(false);
    }
  };

  const fetchBusinessPartners = async () => {
    try {
      const { data: subcategories, error: subcatError } = await supabase
        .from('subcategories')
        .select('id')
        .eq('name', 'Business Partner')
        .limit(1);

      if (subcatError) {
        console.error('Error fetching subcategory:', subcatError);
        toast.error('Failed to fetch business partners');
        return;
      }

      // Handle case where no subcategory is found
      if (!subcategories?.length) {
        setBusinessPartners([]);
        return;
      }

      const subcategoryId = subcategories[0].id;
      
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          code,
          name
        `)
        .eq('is_active', true)
        .eq('subcategory_id', subcategoryId)
        .order('name');

      if (error) throw error;
      setBusinessPartners(data || []);
    } catch (error) {
      console.error('Error fetching business partners:', error);
      toast.error('Failed to fetch business partners');
    }
  };

  const fetchCashBookBalance = async (accountId: string) => {
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
            currency_id: selectedCashBook?.currency.id || '',
            currency_code: selectedCashBook?.currency.code || ''
          }];

      setCashBookBalance(processedData);
    } catch (error) {
      console.error('Error fetching balance:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch balance');
      setCashBookBalance([{
        balance: 0,
        currency_id: selectedCashBook?.currency.id || '',
        currency_code: selectedCashBook?.currency.code || ''
      }]);
    }
  };

  const fetchTransactions = async (accountId: string) => {
    try {
      setIsLoading(true);
      
      if (!cashTypeId) {
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
        .eq('type_id', cashTypeId)
        .in('status', ['draft', 'posted'])
        .order('transaction_date', { ascending: false })
        .limit(limit);

      if (error) throw error;
      
      // Filter transactions to only include those with the selected cash book account
      const filteredTransactions = (data || []).filter(transaction => {
        // Check if any transaction line involves the selected cash book
        return transaction.gl_transactions.some(t => t.account.id === accountId);
      });
      
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
    if (!selectedCashBook || !selectedPartner) {
      toast.error('Please select cash book and business partner');
      return;
    }

    if (!cashTypeId) {
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

      if (isNaN(exchangeRate) || exchangeRate <= 0) {
        toast.error('Please enter a valid exchange rate');
        return;
      }

      // Calculate base currency amounts based on exchange rate note
      let baseAmount;
      if (selectedCashBook.currency.exchange_rate_note === 'multiply') {
        baseAmount = Math.abs(amount) * exchangeRate;
      } else if (selectedCashBook.currency.exchange_rate_note === 'divide') {
        baseAmount = Math.abs(amount) / exchangeRate;
      } else {
        baseAmount = Math.abs(amount);
      }

      // Set document currency amounts (original amounts)
      const debitDocCurrency = amount > 0 ? Math.abs(amount) : 0;
      const creditDocCurrency = amount < 0 ? Math.abs(amount) : 0;

      // Set base currency amounts
      const debit = amount > 0 ? baseAmount : 0;
      const credit = amount < 0 ? baseAmount : 0;

      // Create transaction header
      const { data: header, error: headerError } = await supabase
        .from('gl_headers')
        .insert({
          transaction_date: formData.date,
          description: formData.narration.toUpperCase(),
          status: 'posted',
          type_id: cashTypeId
        })
        .select()
        .single();

      if (headerError) throw headerError;

      // Create transaction details
      const transactions = [
        {
          header_id: header.id,
          account_id: selectedCashBook.id,
          debit: debit,
          credit: credit,
          debit_doc_currency: debitDocCurrency,
          credit_doc_currency: creditDocCurrency,
          exchange_rate: exchangeRate,
          currency_id: selectedCashBook.currency.id,
          description: formData.narration.toUpperCase()
        },
        {
          header_id: header.id,
          account_id: selectedPartner.id,
          debit: credit,
          credit: debit,
          debit_doc_currency: creditDocCurrency,
          credit_doc_currency: debitDocCurrency,
          exchange_rate: exchangeRate,
          currency_id: selectedCashBook.currency.id,
          description: formData.narration.toUpperCase()
        }
      ];

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

      toast.success('Transaction saved successfully');
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        narration: '',
        documentAmount: '',
        exchangeRate: selectedCashBook.currency.rate.toFixed(4)
      });
      setSelectedPartner(null);

      // Refresh data immediately
      await Promise.all([
        fetchCashBookBalance(selectedCashBook.id),
        fetchTransactions(selectedCashBook.id)
      ]);

    } catch (error) {
      console.error('Error saving transaction:', error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to save transaction');
      }
    }
  };

  const formatBalanceDisplay = (balance: Balance) => {
    const amount = formatAmount(Math.abs(balance.balance));
    return `${balance.currency_code} ${balance.balance < 0 ? '-' : ''}${amount}`;
  };

  const handleEdit = (transaction: Transaction) => {
    if (transaction && transaction.id) {
      navigate(`/transactions/cash/edit/${transaction.id}`);
    } else {
      toast.error('Invalid transaction ID');
    }
  };

  const handleSaveEdit = () => {
    if (selectedCashBook) {
      // Refresh data immediately
      Promise.all([
        fetchCashBookBalance(selectedCashBook.id),
        fetchTransactions(selectedCashBook.id)
      ]).catch(error => {
        console.error('Error refreshing data:', error);
        toast.error('Failed to refresh data');
      });
    }
  };

  const getTransactionAmount = (transaction: Transaction): number => {
    const cashTransaction = transaction.gl_transactions.find(t => 
      t.account.id === selectedCashBook?.id
    );
    
    return cashTransaction?.debit_doc_currency || -cashTransaction?.credit_doc_currency || 0;
  };

  const getPartnerName = (transaction: Transaction): string => {
    const partnerTransaction = transaction.gl_transactions.find(t => 
      t.account.id !== selectedCashBook?.id
    );
    
    return partnerTransaction?.account.name || 'Unknown Partner';
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
    return <LoadingSpinner title="Loading Cash Entry..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Cash Entry</h1>
      </div>

      <div className="bg-card rounded-lg shadow">
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Cash Book
              </label>
              <select
                value={selectedCashBook?.id || ''}
                onChange={(e) => {
                  const cashBook = cashBooks.find(cb => cb.id === e.target.value);
                  setSelectedCashBook(cashBook || null);
                  if (cashBook) {
                    setFormData(prev => ({
                      ...prev,
                      exchangeRate: cashBook.currency.rate.toFixed(4)
                    }));
                  }
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
              <label className="block text-sm font-medium text-foreground mb-1">
                Currency
              </label>
              <div className="px-3 py-2 border rounded-lg bg-background dark:bg-gray-700 dark:border-gray-600">
                {selectedCashBook?.currency.code || '-'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Current Balance
              </label>
              <div className={`px-3 py-2 border rounded-lg font-mono text-lg ${
                cashBookBalance.length > 0 && cashBookBalance[0].balance < 0 
                  ? 'text-red-600 dark:text-red-400' 
                  : 'text-green-600 dark:text-green-400'
              }`}>
                {cashBookBalance.length > 0 
                  ? formatBalanceDisplay(cashBookBalance[0])
                  : selectedCashBook 
                    ? `${selectedCashBook.currency.code} 0.00` 
                    : '-'
                }
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Business Partner
                </label>
                <select
                  value={selectedPartner?.id || ''}
                  onChange={(e) => {
                    const partner = businessPartners.find(bp => bp.id === e.target.value);
                    setSelectedPartner(partner || null);
                  }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select Partner</option>
                  {businessPartners.map(bp => (
                    <option key={bp.id} value={bp.id}>
                      {bp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Narration
                </label>
                <input
                  type="text"
                  value={formData.narration}
                  onChange={(e) => setFormData({ ...formData, narration: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  placeholder="Enter transaction description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Amount
                </label>
                <input
                  type="number"
                  value={formData.documentAmount}
                  onChange={(e) => setFormData({ ...formData, documentAmount: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  step="0.01"
                  placeholder="Enter positive for Dr Cash, negative for Cr Cash"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Exchange Rate
                </label>
                <input
                  type="number"
                  value={formData.exchangeRate}
                  onChange={(e) => setFormData({ ...formData, exchangeRate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  step="0.0001"
                  min="0.0001"
                  disabled={selectedCashBook?.currency.is_base}
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
                    exchangeRate: selectedCashBook?.currency.rate.toFixed(4) || '1.0000'
                  });
                  setSelectedPartner(null);
                }}
                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                Clear
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
          
          <div className="mb-4 flex justify-between items-center">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search transactions..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={() => selectedCashBook && fetchTransactions(selectedCashBook.id)}
              className="px-4 py-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
            >
              Refresh
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Voucher No</th>
                  <th className="pb-3 font-semibold">Partner</th>
                  <th className="pb-3 font-semibold">Description</th>
                  <th className="pb-3 font-semibold text-right">Debit</th>
                  <th className="pb-3 font-semibold text-right">Credit</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y dark:divide-gray-700 ${isLoading ? 'opacity-50' : ''}`}>
                {transactions
                  .filter(transaction => {
                    if (!searchTerm) return true;
                    const searchLower = searchTerm.toLowerCase();
                    const partnerName = getPartnerName(transaction).toLowerCase();
                    const voucherNo = transaction.voucher_no.toLowerCase();
                    const description = transaction.description.toLowerCase();
                    
                    return partnerName.includes(searchLower) || 
                           voucherNo.includes(searchLower) ||
                           description.includes(searchLower);
                  })
                  .map((transaction) => {
                  const amount = getTransactionAmount(transaction);
                  const partnerName = getPartnerName(transaction);
                  
                  return (
                    <tr key={transaction.id}>
                      <td className="py-3">
                        {new Date(transaction.transaction_date).toLocaleDateString()}
                      </td>
                      <td className="py-3">{transaction.voucher_no}</td>
                      <td className="py-3">{partnerName}</td>
                      <td className="py-3">{transaction.description}</td>
                      <td className="py-3 text-right">
                        {amount > 0 ? formatAmount(amount) : ''}
                      </td>
                      <td className="py-3 text-right">
                        {amount < 0 ? formatAmount(Math.abs(amount)) : ''}
                      </td>
                      <td className="py-3 text-right">
                        {transaction.id && (
                          <button
                            onClick={() => handleEdit(transaction)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                          >
                            <Edit className="w-4 h-4 inline" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500 dark:text-gray-400">
                      {isLoading ? (
                        <div className="flex justify-center items-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                          <span className="ml-2">Loading transactions...</span>
                        </div>
                      ) : (
                        'No transactions found'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {transactions.length > 0 && (
            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing {transactions.length} transactions
              </p>
              <button
                onClick={() => {
                  setLimit(prev => prev + 20);
                  selectedCashBook && fetchTransactions(selectedCashBook.id);
                }}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
              >
                Load more
              </button>
            </div>
          )}
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