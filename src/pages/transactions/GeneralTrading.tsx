import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatAmount } from '../../lib/format';
import DateFilter from '../../components/DateFilter';
import EditTransactionModal from '../../components/EditTransactionModal';

interface Currency {
  id: string;
  code: string;
  name: string;
  exchange_rate_note: 'multiply' | 'divide';
  rate: number;
  is_base: boolean;
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

function GeneralTrading() {
  const navigate = useNavigate();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);
  const [customer, setCustomer] = useState<BusinessPartner | null>(null);
  const [supplier, setSupplier] = useState<BusinessPartner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactionTypeId, setTransactionTypeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [limit, setLimit] = useState(20);
  const [commissionAccountId, setCommissionAccountId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    narration: '',
    amount: '',
    sellingRate: '',
    purchaseRate: '',
    commission: '0'
  });

  // Calculate commission when values change
  useEffect(() => {
    const amount = parseFloat(formData.amount);
    const sellingRate = parseFloat(formData.sellingRate);
    const purchaseRate = parseFloat(formData.purchaseRate);

    if (!isNaN(amount) && !isNaN(sellingRate) && !isNaN(purchaseRate) && selectedCurrency) {
      let commission = 0;

      if (selectedCurrency.exchange_rate_note === 'divide') {
        // For divide method, commission is based on the difference in reciprocal rates
        commission = amount * (1/sellingRate - 1/purchaseRate);
        //commission = Math.abs(amount * (1/purchaseRate - 1/sellingRate));
      } else {
        // For multiply method, commission is based on the difference in rates
        commission = amount * (sellingRate - purchaseRate);
        //commission = Math.abs(amount * (sellingRate - purchaseRate));
      }
      setFormData(prev => ({ ...prev, commission: commission.toFixed(2) }));
    }
  }, [formData.amount, formData.sellingRate, formData.purchaseRate, selectedCurrency]);

  useEffect(() => {
    const initializeComponent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get base currency ID
        const { data: baseCurrency, error: currencyError } = await supabase
          .from('currencies')
          .select('id')
          .eq('is_base', true)
          .single();

        if (currencyError) throw currencyError;

        // Fetch currencies
        const { data: currencyData, error: currenciesError } = await supabase
          .from('currencies')
          .select('id, code, name, exchange_rate_note, rate, is_base')
          .order('code');

        if (currenciesError) {
          console.error('Error fetching currencies:', currenciesError);
          toast.error('Failed to fetch currencies');
          return;
        }

        setCurrencies(currencyData || []);

        // Fetch transaction types
        const { data: types, error: typeError } = await supabase
          .from('tbl_trans_type')
          .select('type_id, transaction_type_code, description')
          .eq('transaction_type_code', 'GENT')
          .single();

        if (typeError) throw typeError;
        const typeId = types.type_id;
        setTransactionTypeId(typeId);
        
        // Fetch transactions for this type
        await fetchTransactionsForType(typeId);

        // Fetch commission account ID
        const { data: commissionAccount, error: commissionError } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', '0000000005')
          .single();

        if (commissionError) throw commissionError;
        setCommissionAccountId(commissionAccount.id);

        await fetchBusinessPartners();
      } catch (error) {
        console.error('Error initializing component:', error);
        setError('Failed to initialize form');
      } finally {
        setIsLoading(false);
      }
    };

    initializeComponent();
  }, []);

  const fetchBusinessPartners = async () => {
    try {
      const { data: subcategories, error: subcatError } = await supabase
        .from('subcategories')
        .select('id')
        .eq('name', 'Business Partner')
        .single();

      if (subcatError) {
        console.error('Error fetching subcategory:', subcatError);
        toast.error('Failed to fetch business partners');
        return;
      }

      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          code,
          name
        `)
        .eq('is_active', true)
        .eq('subcategory_id', subcategories.id)
        .order('name');

      if (error) throw error;
      setBusinessPartners(data || []);
    } catch (error) {
      console.error('Error fetching business partners:', error);
      toast.error('Failed to fetch business partners');
    }
  };

  const fetchTransactionsForType = async (typeId: string) => {
    try {
      if (!typeId) {
        setTransactions([]);
        return;
      }

      setIsLoading(true);
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
        .eq('type_id', typeId)
        .in('status', ['draft', 'posted'])
        .order('transaction_date', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to fetch transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactions = () => {
    if (transactionTypeId) {
      fetchTransactionsForType(transactionTypeId);
    }
  };

  // Function to calculate base amount based on exchange rate note
  const calculateBaseAmount = (docAmount: number, rate: number, method: 'multiply' | 'divide' | null): number => {
    if (method === 'divide') {
      return docAmount / rate;
    } else {
      return docAmount * rate;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customer || !supplier) {
      toast.error('Please select both customer and supplier');
      return;
    }

    if (customer.id === supplier.id) {
      toast.error('Customer and supplier cannot be the same');
      return;
    }

    if (!transactionTypeId) {
      toast.error('Transaction type not configured');
      return;
    }

    if (!commissionAccountId) {
      toast.error('Commission account not configured');
      return;
    }

    if (!selectedCurrency) {
      toast.error('Please select a currency');
      return;
    }

    try {
      const amount = parseFloat(formData.amount);
      const sellingRate = parseFloat(formData.sellingRate);
      const purchaseRate = parseFloat(formData.purchaseRate);
      const commission = parseFloat(formData.commission);

      if (isNaN(amount) || amount <= 0) {
        toast.error('Please enter a valid amount');
        return;
      }

      if (isNaN(sellingRate) || isNaN(purchaseRate)) {
        toast.error('Please enter valid rates');
        return;
      }

      if (isNaN(commission)) {
        toast.error('Invalid commission calculation');
        return;
      }
      if (commission < 0) {
        toast.error('Commission cannot be negative');
        return;
      }

      // Calculate base currency amounts based on exchange_rate_note
      const customerDebit = calculateBaseAmount(amount, sellingRate, selectedCurrency.exchange_rate_note);
      const supplierCredit = calculateBaseAmount(amount, purchaseRate, selectedCurrency.exchange_rate_note);
      const commissionBase = calculateBaseAmount(commission, sellingRate, selectedCurrency.exchange_rate_note);

      // Create header
      const { data: header, error: headerError } = await supabase
        .from('gl_headers')
        .insert({
          transaction_date: formData.date,
          type_id: transactionTypeId,
          description: formData.narration.toUpperCase(),
          status: 'posted'
        })
        .select()
        .single();

      if (headerError) throw headerError;

      // Create transactions array
      const transactions = [
        {
          header_id: header.id,
          account_id: customer.id,
          debit: customerDebit,
          credit: 0,
          debit_doc_currency: amount,
          credit_doc_currency: 0,
          exchange_rate: sellingRate,
          currency_id: selectedCurrency.id,
          description: formData.narration.toUpperCase(),
          amount: amount
        },
        {
          header_id: header.id,
          account_id: supplier.id,
          debit: 0,
          credit: supplierCredit,
          debit_doc_currency: 0,
          credit_doc_currency: amount,
          exchange_rate: purchaseRate,
          currency_id: selectedCurrency.id,
          description: formData.narration.toUpperCase(),
          amount: amount
        }
      ];

      // Add commission transaction if applicable
      if (commission > 0) {
        transactions.push({
          header_id: header.id,
          account_id: commissionAccountId,
          debit: 0,
          credit: commission,
          debit_doc_currency: 0,
          credit_doc_currency: commission,
          exchange_rate: sellingRate,
          currency_id: selectedCurrency.id,
          description: `COMMISSION FOR ${formData.narration.toUpperCase()}`,
          amount: commission
        });
      }

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

      toast.success('Transaction saved successfully');
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        narration: '',
        amount: '',
        sellingRate: '',
        purchaseRate: '',
        commission: '0'
      });
      setSelectedCurrency(null);
      setCustomer(null);
      setSupplier(null);

      // Refresh transactions
      fetchTransactions();
    } catch (error) {
      console.error('Error saving transaction:', error);
      toast.error('Failed to save transaction');
    }
  };

  const handleCancel = () => {
    if (formData.narration || formData.amount || formData.sellingRate || formData.purchaseRate || customer || supplier) {
      if (confirm('Are you sure you want to clear the form?')) {
        setFormData({
          date: new Date().toISOString().split('T')[0],
          narration: '',
          amount: '',
          sellingRate: '',
          purchaseRate: '',
          commission: '0'
        });
        setSelectedCurrency(null);
        setCustomer(null);
        setSupplier(null);
      }
    }
  };

  const handleEdit = (transactionId: string) => {
    if (transactionId) {
      navigate(`/transactions/trading/edit/${transactionId}`);
    } else {
      toast.error('Invalid transaction ID');
    }
  };

  // Helper function to get transaction details for debugging
  const logTransactionDetails = (transaction: Transaction) => {
    const customerTrans = transaction.gl_transactions.find(t => t.debit > 0);
    const supplierTrans = transaction.gl_transactions.find(t => t.credit > 0 && t.account_id !== commissionAccountId);
    const commissionTrans = transaction.gl_transactions.find(t => t.account_id === commissionAccountId);
    
    console.log('Transaction Details:', {
      id: transaction.id,
      date: transaction.transaction_date,
      description: transaction.description,
      currency: customerTrans ? getCurrencyCode(customerTrans.currency_id) : 'Unknown',
      customer: customerTrans?.account.name,
      supplier: supplierTrans?.account.name,
      amount: customerTrans?.debit_doc_currency,
      commission: commissionTrans?.credit
    });
  };

  const getTransactionAmount = (transaction: Transaction): number => {
    const customerTransaction = transaction.gl_transactions.find(t => 
      t.account.id !== commissionAccountId && t.debit_doc_currency > 0
    );
    
    return customerTransaction?.debit_doc_currency || 0;
  };

  const getCustomerName = (transaction: Transaction): string => {
    const customerTransaction = transaction.gl_transactions.find(t => 
      t.account.id !== commissionAccountId && t.debit > 0
    );
    
    return customerTransaction?.account.name || 'Unknown Customer';
  };

  const getSupplierName = (transaction: Transaction): string => {
    const supplierTransaction = transaction.gl_transactions.find(t => 
      t.account.id !== commissionAccountId && t.credit > 0 && 
      t.credit_doc_currency === getTransactionAmount(transaction)
    );
    
    return supplierTransaction?.account.name || 'Unknown Supplier';
  };

  const getCommissionAmount = (transaction: Transaction): number => {
    const commissionTransaction = transaction.gl_transactions.find(t => 
      t.account.id === commissionAccountId
    );
    
    return commissionTransaction?.credit_doc_currency || 0;
  };

  const getCurrencyCode = (currencyId: string): string => {
    const currency = currencies.find(c => c.id === currencyId);
    return currency?.code || '';
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
        <h1 className="text-2xl font-semibold">General Trading</h1>
      </div>

      <div className="bg-card rounded-lg shadow">
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  max={new Date().toISOString().split('T')[0]}
                  min={new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Currency
                </label>
                <select
                  value={selectedCurrency?.id || ''}
                  onChange={(e) => {
                    const currency = currencies.find(c => c.id === e.target.value);
                    setSelectedCurrency(currency || null);
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
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer
                </label>
                <select
                  value={customer?.id || ''}
                  onChange={(e) => {
                    const partner = businessPartners.find(bp => bp.id === e.target.value);
                    setCustomer(partner || null);
                  }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select Customer</option>
                  {businessPartners.map(bp => (
                    <option key={bp.id} value={bp.id}>
                      {bp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Supplier
                </label>
                <select
                  value={supplier?.id || ''}
                  onChange={(e) => {
                    const partner = businessPartners.find(bp => bp.id === e.target.value);
                    setSupplier(partner || null);
                  }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select Supplier</option>
                  {businessPartners.map(bp => (
                    <option key={bp.id} value={bp.id}>
                      {bp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Narration
                </label>
                <input
                  type="text"
                  value={formData.narration}
                  onChange={(e) => setFormData({ ...formData, narration: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={100}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Amount
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Selling Rate
                </label>
                <input
                  type="number"
                  value={formData.sellingRate}
                  onChange={(e) => setFormData({ ...formData, sellingRate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.0001"
                  min="0.0001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Purchase Rate
                </label>
                <input
                  type="number"
                  value={formData.purchaseRate}
                  onChange={(e) => setFormData({ ...formData, purchaseRate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.0001"
                  min="0.0001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Commission
                </label>
                <input
                  type="text"
                  value={formData.commission}
                  className="w-full px-3 py-2 border rounded-lg bg-gray-100 dark:bg-gray-600 dark:border-gray-500"
                  readOnly
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
              onClick={fetchTransactions}
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
                  <th className="pb-3 font-semibold">Customer</th>
                  <th className="pb-3 font-semibold">Supplier</th>
                  <th className="pb-3 font-semibold">Currency</th>
                  <th className="pb-3 font-semibold text-right">Amount</th>
                  <th className="pb-3 font-semibold text-right">Commission</th>
                  <th className="pb-3 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y dark:divide-gray-700 ${isLoading ? 'opacity-50' : ''}`}>
                {transactions
                  .filter(transaction => {
                    if (!searchTerm) return true;
                    const searchLower = searchTerm.toLowerCase();
                    const customerName = getCustomerName(transaction).toLowerCase();
                    const supplierName = getSupplierName(transaction).toLowerCase();
                    const voucherNo = transaction.voucher_no.toLowerCase();
                    const description = transaction.description.toLowerCase();
                    const currencyCode = getCurrencyCode(transaction.gl_transactions[0]?.currency_id || '').toLowerCase();
                    
                    return customerName.includes(searchLower) || 
                           supplierName.includes(searchLower) || 
                           voucherNo.includes(searchLower) ||
                           description.includes(searchLower) ||
                           currencyCode.includes(searchLower);
                  })
                  .map((transaction) => {
                  const amount = getTransactionAmount(transaction);
                  const customerName = getCustomerName(transaction);
                  const supplierName = getSupplierName(transaction);
                  const commission = getCommissionAmount(transaction);
                  const currencyCode = transaction.gl_transactions[0] ? 
                    getCurrencyCode(transaction.gl_transactions[0].currency_id) : '';
                  return (
                    <tr key={transaction.id}>
                      <td className="py-3">
{new Date(transaction.transaction_date).toLocaleDateString('en-GB', {
  day: '2-digit',
  month: 'short',
  year: '2-digit'
}).replace(/ /g, '-')}
                      </td>
                      <td className="py-3">{transaction.voucher_no}</td>
                      <td className="py-3">{customerName}</td>
                      <td className="py-3">{supplierName}</td>
                      <td className="py-3">{currencyCode}</td>
                      <td className="py-3 text-right">
                        {formatAmount(amount)}
                      </td>
                      <td className="py-3 text-right">
                        {commission > 0 ? formatAmount(commission) : '-'}
                      </td>
                      <td className="py-3 text-center">
                        {transaction.id && (
                          <button
                            onClick={() => handleEdit(transaction.id)}
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
                    <td colSpan={8} className="py-8 text-center text-gray-500 dark:text-gray-400">
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
                  fetchTransactions();
                }}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GeneralTrading;