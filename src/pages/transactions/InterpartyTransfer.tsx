import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatAmount } from '../../lib/format';
import DateFilter from '../../components/DateFilter';
import EditTransactionModal from '../../components/EditTransactionModal';

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

export default function InterpartyTransfer() {
  const navigate = useNavigate();
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fromPartner, setFromPartner] = useState<BusinessPartner | null>(null);
  const [toPartner, setToPartner] = useState<BusinessPartner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactionTypeId, setTransactionTypeId] = useState<{
    ipt: string | null;
    iptc: string | null;
  }>({ ipt: null, iptc: null });
  const [commissionAccountId, setCommissionAccountId] = useState<string | null>(null);
  const [baseCurrencyId, setBaseCurrencyId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [limit, setLimit] = useState(20);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    narration: '',
    amount: '',
    commission: ''
  });

  useEffect(() => {
    const initializeComponent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const { data: baseCurrency, error: currencyError } = await supabase
          .from('currencies')
          .select('id')
          .eq('is_base', true)
          .single();

        if (currencyError) throw currencyError;
        setBaseCurrencyId(baseCurrency.id);

        const { data: types, error: typeError } = await supabase
          .from('tbl_trans_type')
          .select('type_id, transaction_type_code, description')
          .in('transaction_type_code', ['IPT', 'IPTC']);

        if (typeError) throw typeError;
        
        const iptType = types.find(t => t.transaction_type_code === 'IPT');
        const iptcType = types.find(t => t.transaction_type_code === 'IPTC');
        
        if (!iptType || !iptcType) {
          throw new Error('Required transaction types not found');
        }
        
        setTransactionTypeId({
          ipt: iptType.type_id,
          iptc: iptcType.type_id
        });

        const { data: commissionAccount, error: commissionError } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', '0000000005')
          .single();

        if (commissionError) throw commissionError;
        setCommissionAccountId(commissionAccount.id);

        await fetchBusinessPartners();
        await fetchTransactionsForTypes(iptType.type_id, iptcType.type_id);
      } catch (error) {
        console.error('Error initializing component:', error);
        setError('Failed to initialize form');
      } finally {
        setIsLoading(false);
      }
    };

    initializeComponent();
  }, []);

  useEffect(() => {
    if (transactionTypeId.ipt && transactionTypeId.iptc) {
      fetchTransactions();
    }
  }, [startDate, endDate]);

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

  const fetchTransactionsForTypes = async (iptTypeId: string, iptcTypeId: string) => {
    try {
      if (!iptTypeId || !iptcTypeId) {
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
            amount,
            account:chart_of_accounts (
              id,
              name
            )
          )
        `)
        .in('type_id', [iptTypeId, iptcTypeId])
        .in('status', ['draft', 'posted'])
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
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
    if (transactionTypeId.ipt && transactionTypeId.iptc) {
      fetchTransactionsForTypes(transactionTypeId.ipt, transactionTypeId.iptc);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fromPartner || !toPartner) {
      toast.error('Please select both partners');
      return;
    }

    if (fromPartner.id === toPartner.id) {
      toast.error('From and To partners cannot be the same');
      return;
    }

    if (!transactionTypeId.ipt || !transactionTypeId.iptc) {
      toast.error('Transaction types not configured');
      return;
    }

    if (!commissionAccountId) {
      toast.error('Commission account not configured');
      return;
    }

    if (!baseCurrencyId) {
      toast.error('Base currency not configured');
      return;
    }

    try {
      const amount = Number(formData.amount?.trim() || 0);
      const commission = Number(formData.commission?.trim() || 0);

      if (isNaN(amount) || amount <= 0) {
        toast.error('Please enter a valid amount');
        return;
      }

      if (isNaN(commission)) {
        toast.error('Invalid commission calculation');
        return;
      }

      const { data: header, error: headerError } = await supabase
        .from('gl_headers')
        .insert({
          transaction_date: formData.date,
          type_id: commission > 0 ? transactionTypeId.iptc : transactionTypeId.ipt,
          description: formData.narration.toUpperCase(),
          status: 'posted'
        })
        .select()
        .single();

      if (headerError) throw headerError;

      const transactions = [];

      // Commission transaction first
      if (commission > 0) {
        transactions.push({
          header_id: header.id,
          account_id: commissionAccountId,
          debit: 0,
          credit: commission * 2,
          debit_doc_currency: 0,
          credit_doc_currency: commission * 2,
          exchange_rate: 1,
          currency_id: baseCurrencyId,
          description: `COMMISSION AGST TRANSFER FROM ${fromPartner.name.toUpperCase()} TO ${toPartner.name.toUpperCase()}`,
          amount: amount
        });
      }

      // From partner transaction
      transactions.push({
        header_id: header.id,
        account_id: fromPartner.id,
        debit: 0,
        credit: amount - commission,
        debit_doc_currency: 0,
        credit_doc_currency: amount - commission,
        exchange_rate: 1,
        currency_id: baseCurrencyId,
        description: `TRANSFER ${fromPartner.name.toUpperCase()} TO ${toPartner.name.toUpperCase()}`,
        amount: amount
      });

      // To partner transaction
      transactions.push({
        header_id: header.id,
        account_id: toPartner.id,
        debit: amount + commission,
        credit: 0,
        debit_doc_currency: amount + commission,
        credit_doc_currency: 0,
        exchange_rate: 1,
        currency_id: baseCurrencyId,
        description: `TRANSFER ${fromPartner.name.toUpperCase()} TO ${toPartner.name.toUpperCase()}`,
        amount: amount
      });

      const { error: transError } = await supabase
        .from('gl_transactions')
        .insert(transactions);

      if (transError) {
        await supabase
          .from('gl_headers')
          .delete()
          .eq('id', header.id);
        throw transError;
      }

      toast.success('Transaction saved successfully');
      
      setFormData({
        date: new Date().toISOString().split('T')[0],
        narration: '',
        amount: '',
        commission: ''
      });
      setFromPartner(null);
      setToPartner(null);

      fetchTransactions();
    } catch (error) {
      console.error('Error saving transaction:', error);
      toast.error('Failed to save transaction');
    }
  };

  const handleCancel = () => {
    if (formData.narration || formData.amount || formData.commission || fromPartner || toPartner) {
      if (confirm('Are you sure you want to clear the form?')) {
        setFormData({
          date: new Date().toISOString().split('T')[0],
          narration: '',
          amount: '',
          commission: ''
        });
        setFromPartner(null);
        setToPartner(null);
      }
    }
  };

  const handleEdit = (transactionId: string) => {
    navigate(`/transactions/ipt/edit/${transactionId}`);
  };

  const handleSaveEdit = () => {
    fetchTransactions();
  };

  const getTransactionAmount = (transaction: Transaction): number => {
    const fromTransaction = transaction.gl_transactions.find(t => 
      t.account.id !== commissionAccountId && t.credit > 0
    );
    
    return fromTransaction?.amount || 0;
  };

  const getFromPartnerName = (transaction: Transaction): string => {
    const fromTransaction = transaction.gl_transactions.find(t => 
      t.account.id !== commissionAccountId && t.credit > 0
    );
    
    return fromTransaction?.account.name || 'Unknown Partner';
  };

  const getToPartnerName = (transaction: Transaction): string => {
    const toTransaction = transaction.gl_transactions.find(t => 
      t.account.id !== commissionAccountId && t.debit > 0
    );
    
    return toTransaction?.account.name || 'Unknown Partner';
  };

  const getCommissionAmount = (transaction: Transaction): number => {
    const commissionTransaction = transaction.gl_transactions.find(t => 
      t.account.id === commissionAccountId
    );
    
    return commissionTransaction ? commissionTransaction.credit / 2 : 0;
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
        <h1 className="text-2xl font-semibold">Interparty Transfer</h1>
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
                  From Partner
                </label>
                <select
                  value={fromPartner?.id || ''}
                  onChange={(e) => {
                    const partner = businessPartners.find(bp => bp.id === e.target.value);
                    setFromPartner(partner || null);
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
                  To Partner
                </label>
                <select
                  value={toPartner?.id || ''}
                  onChange={(e) => {
                    const partner = businessPartners.find(bp => bp.id === e.target.value);
                    setToPartner(partner || null);
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
                  //onChange={(e) => setFormData({ ...formData, narration: e.target.value.toUpperCase() })}
                  disabled
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
                  type="text"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value.replace(/[^\d.]/g, '') })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Commission (Optional)
                </label>
                <input
                  type="text"
                  value={formData.commission}
                  onChange={(e) => setFormData({ ...formData, commission: e.target.value.replace(/[^\d.]/g, '') })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold">Recent Transactions</h2>
            <div className="flex gap-4 items-center">
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
              <DateFilter
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
              <button
                onClick={fetchTransactions}
                className="px-4 py-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Voucher No</th>
                  <th className="pb-3 font-semibold">From Partner</th>
                  <th className="pb-3 font-semibold">To Partner</th>
                  <th className="pb-3 font-semibold text-right">Amount</th>
                  <th className="pb-3 font-semibold text-right">Commission</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {transactions
                  .filter(transaction => {
                    if (!searchTerm) return true;
                    const searchLower = searchTerm.toLowerCase();
                    const fromPartnerName = getFromPartnerName(transaction).toLowerCase();
                    const toPartnerName = getToPartnerName(transaction).toLowerCase();
                    const voucherNo = transaction.voucher_no.toLowerCase();
                    const description = transaction.description.toLowerCase();
                    
                    return fromPartnerName.includes(searchLower) || 
                           toPartnerName.includes(searchLower) || 
                           voucherNo.includes(searchLower) ||
                           description.includes(searchLower);
                  })
                  .map((transaction) => {
                  const baseAmount = getTransactionAmount(transaction);
                  const commission = getCommissionAmount(transaction);
                  const amount = baseAmount;
                  const fromPartnerName = getFromPartnerName(transaction);
                  const toPartnerName = getToPartnerName(transaction);
                  
                  return (
                    <tr key={transaction.id}>
                      <td className="py-3">
                        {new Date(transaction.transaction_date).toLocaleDateString()}
                      </td>
                      <td className="py-3">{transaction.voucher_no}</td>
                      <td className="py-3">{fromPartnerName}</td>
                      <td className="py-3">{toPartnerName}</td>
                      <td className="py-3 text-right">
                        {formatAmount(amount)}
                      </td>
                      <td className="py-3 text-right">
                      {commission > 0 ? formatAmount(commission * 2) : '-'}
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

      <EditTransactionModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        transaction={editingTransaction}
        onSave={handleSaveEdit}
      />
    </div>
  );
}