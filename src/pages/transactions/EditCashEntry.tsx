import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

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

export default function EditCashEntry() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [cashBooks, setCashBooks] = useState<CashBook[]>([]);
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [selectedCashBook, setSelectedCashBook] = useState<CashBook | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<BusinessPartner | null>(null);
  const [cashBookBalance, setCashBookBalance] = useState<Balance[]>([]);
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
      navigate('/transactions/cash');
      return;
    }

    const initializeComponent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get CASH transaction type ID
        const { data: cashType, error: typeError } = await supabase
          .from('tbl_trans_type')
          .select('type_id')
          .eq('transaction_type_code', 'CASH')
          .single();

        if (typeError) throw typeError;

        // Fetch cash books and business partners in parallel
        const [cashBooksResponse, partnersResponse] = await Promise.all([
          supabase
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
            .eq('is_active', true),
          supabase
            .from('chart_of_accounts')
            .select(`
              id,
              code,
              name
            `)
            .eq('is_active', true)
            .order('name')
        ]);

        if (cashBooksResponse.error) throw cashBooksResponse.error;
        if (partnersResponse.error) throw partnersResponse.error;

        const cashBooksData = cashBooksResponse.data || [];
        const partnersData = partnersResponse.data || [];
        
        setCashBooks(cashBooksData);
        setBusinessPartners(partnersData);
        
        // Fetch transaction data
        await fetchTransaction(id, cashBooksData, partnersData);
      } catch (error) {
        console.error('Error initializing component:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize form';
        setError(errorMessage);
        toast.error(errorMessage);
        navigate('/transactions/cash');
      } finally {
        setIsLoading(false);
      }
    };

    initializeComponent();
  }, [id, navigate]);

  useEffect(() => {
    if (selectedCashBook) {
      fetchCashBookBalance(selectedCashBook.id);
    }
  }, [selectedCashBook]);

  const fetchCashBookBalance = async (accountId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('get_cash_book_doc_balance', {
          p_account_id: accountId
        });

      if (error) throw error;
      setCashBookBalance(data || []);
    } catch (error) {
      console.error('Error fetching balance:', error);
      toast.error('Failed to fetch balance');
      setCashBookBalance([{
        balance: 0,
        currency_id: selectedCashBook?.currency.id || '',
        currency_code: selectedCashBook?.currency.code || ''
      }]);
    }
  };

  const fetchTransaction = async (transactionId: string, cashBooksData: CashBook[], partnersData: BusinessPartner[]) => {
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
      
      if (!data) {
        throw new Error('Transaction not found');
      }
      
      setTransaction(data);
      setVoucherNo(data.voucher_no);
      
      // Find cash book and partner transactions
      const cashTransaction = data.gl_transactions.find(t => {
        const cashBook = cashBooksData.find(cb => cb.id === t.account_id);
        return !!cashBook;
      });
      
      const partnerTransaction = data.gl_transactions.find(t => {
        return t.account_id !== cashTransaction?.account_id;
      });
      
      if (!cashTransaction || !partnerTransaction) {
        throw new Error('Invalid cash transaction structure');
      }
      
      // Set selected cash book
      const cashBook = cashBooksData.find(cb => cb.id === cashTransaction.account_id);
      setSelectedCashBook(cashBook || null);
      
      // Set selected partner
      const partner = partnersData.find(p => p.id === partnerTransaction.account_id);
      setSelectedPartner(partner || null);
      
      // Determine document amount (positive for debit, negative for credit)
      let documentAmount = 0;
      if (cashTransaction.debit_doc_currency > 0) {
        documentAmount = cashTransaction.debit_doc_currency;
      } else if (cashTransaction.credit_doc_currency > 0) {
        documentAmount = -cashTransaction.credit_doc_currency;
      }

      // Set form data
      setFormData({
        date: data.transaction_date,
        narration: data.description,
        documentAmount: documentAmount.toString(),
        exchangeRate: cashTransaction.exchange_rate.toFixed(4)
      });
      
      setDataInitialized(true);
    } catch (error) {
      console.error('Error fetching transaction:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transaction) {
      toast.error('Transaction not found');
      return;
    }

    if (!selectedCashBook || !selectedPartner) {
      toast.error('Please select cash book and business partner');
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

      // Update header
      const { error: headerError } = await supabase
        .from('gl_headers')
        .update({
          transaction_date: formData.date,
          description: formData.narration.toUpperCase(),
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      if (headerError) throw headerError;

      // Delete existing transactions
      const { error: deleteError } = await supabase
        .from('gl_transactions')
        .delete()
        .eq('header_id', transaction.id);

      if (deleteError) throw deleteError;

      // Create transactions array
      const transactions = [
        {
          header_id: transaction.id,
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
          header_id: transaction.id,
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

      // Insert transactions
      const { error: transError } = await supabase
        .from('gl_transactions')
        .insert(transactions);

      if (transError) throw transError;

      toast.success('Transaction updated successfully');
      navigate('/transactions/cash');
    } catch (error) {
      console.error('Error updating transaction:', error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to update transaction');
      }
    }
  };

  const handleCancel = () => {
    navigate('/transactions/cash');
  };

  const formatBalanceDisplay = (balance: Balance) => {
    const amount = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(balance.balance));
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

  if (isLoading || !dataInitialized) {
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
        <h1 className="text-2xl font-semibold">Edit Cash Entry</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Voucher No: <span className="font-medium">{voucherNo}</span>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow">
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Currency
              </label>
              <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                {selectedCashBook?.currency.code || '-'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
    </div>
  );
}