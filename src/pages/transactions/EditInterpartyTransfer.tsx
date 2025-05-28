import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

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
    amount: number;
    debit_doc_currency: number;
    credit_doc_currency: number;
    exchange_rate: number;
    currency_id: string;
    account_id: string;
    account: {
      id: string;
      name: string;
    };
  }[];
}

export default function EditInterpartyTransfer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [fromPartner, setFromPartner] = useState<BusinessPartner | null>(null);
  const [toPartner, setToPartner] = useState<BusinessPartner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voucherNo, setVoucherNo] = useState<string>('');
  const [transactionTypeId, setTransactionTypeId] = useState<{
    ipt: string | null;
    iptc: string | null;
  }>({ ipt: null, iptc: null });
  const [commissionAccountId, setCommissionAccountId] = useState<string | null>(null);
  const [baseCurrencyId, setBaseCurrencyId] = useState<string | null>(null);

  // Form state
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

        // Fetch commission account ID
        const { data: commissionAccount, error: commissionError } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', '0000000005')
          .single();

        if (commissionError) throw commissionError;
        setCommissionAccountId(commissionAccount.id);

        // Fetch business partners and transaction data in parallel
        await Promise.all([
          fetchBusinessPartners(),
          id ? fetchTransaction(id) : Promise.resolve()
        ]);
      } catch (error) {
        console.error('Error initializing component:', error);
        setError('Failed to initialize form');
      } finally {
        setIsLoading(false);
      }
    };

    initializeComponent();
  }, [id]);

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

  const fetchTransaction = async (transactionId: string) => {
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
            amount,
            debit_doc_currency,
            credit_doc_currency,
            exchange_rate,
            currency_id,
            account_id,
            account:chart_of_accounts (
            code,  
            id,
              name
            )
          )
        `)
        .eq('id', transactionId)
        .single();

      if (error) throw error;

      setTransaction(data);
      setVoucherNo(data.voucher_no);

      // Find from and to partner transactions
      const fromTrans = data.gl_transactions.find(t =>
        t.credit > 0 && t.account?.code !== '0000000005'

        
      );

      const toTrans = data.gl_transactions.find(t =>
        t.debit > 0 && t.account_id !== commissionAccountId
        
      );

      const commissionTrans = data.gl_transactions.find(t => {
        return (t.description && t.description.toLowerCase().includes('commission')) ||
               (t.account && t.account.name.toLowerCase().includes('commission')) &&
               t.credit > 0;
      });

      if (fromTrans) {
        setFromPartner({
          id: fromTrans.account_id,
          code: '',
          name: fromTrans.account.name
        });
      }

      if (toTrans) {
        setToPartner({
          id: toTrans.account_id,
          code: '',
          name: toTrans.account.name
        });
      }

      // Safely handle amount calculation
      const amount = fromTrans?.amount || 0;

      // Safely handle commission calculation
      const commission = commissionTrans?.credit ? (commissionTrans.credit / 2) : 0;

      setFormData({
        date: data.transaction_date,
        narration: data.description || '',
        amount: amount.toFixed(2),
        commission: commission.toFixed(2)
      });

    } catch (error) {
      console.error('Error fetching transaction:', error);
      toast.error('Failed to fetch transaction details');
      navigate('/transactions/ipt');
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

    if (!transaction?.type_id) {
      toast.error('Transaction type not configured');
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
      const amount = parseFloat(formData.amount);
      // Ensure commission is properly parsed as a number
      const commission = parseFloat(formData.commission || '0') || 0;

      if (isNaN(amount) || amount <= 0) {
        toast.error('Please enter a valid amount');
        return;
      }

      if (isNaN(commission)) {
        toast.error('Invalid commission calculation');
        return;
      }

      // Update header
      const { error: headerError } = await supabase
        .from('gl_headers')
        .update({
          transaction_date: formData.date,
          description: formData.narration.toUpperCase(),
          type_id: commission > 0 ? transactionTypeId.iptc : transactionTypeId.ipt,
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

      // Create new transactions array
      const transactions = [];

      // Commission transaction first if applicable
      if (commission > 0) {
        transactions.push({
          header_id: transaction.id,
          account_id: commissionAccountId,
          debit: 0,
          credit: commission * 2,
          debit_doc_currency: 0,
          credit_doc_currency: commission * 2,
          exchange_rate: 1,
          currency_id: baseCurrencyId,
          description: `COMMISSION AGST TRANSFER FROM ${fromPartner.name.toUpperCase()} TO ${toPartner.name.toUpperCase()}`,
          amount: commission * 2
        });
      }

      // From partner transaction
      transactions.push({
        header_id: transaction.id,
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
        header_id: transaction.id,
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

      // Insert transactions
      const { error: transError } = await supabase
        .from('gl_transactions')
        .insert(transactions);

      if (transError) throw transError;

      toast.success('Transaction updated successfully');
      navigate('/transactions/ipt');
    } catch (error) {
      console.error('Error updating transaction:', error);
      toast.error('Failed to update transaction');
    }
  };

  const handleCancel = () => {
    navigate('/transactions/ipt');
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
        <h1 className="text-2xl font-semibold">Edit Interparty Transfer</h1>
      </div>
      
      {voucherNo && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <p className="text-lg font-medium text-blue-800 dark:text-blue-300">
            Voucher No: {voucherNo}
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
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
                  //required
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
                  Commission (Optional)
                </label>
                <input
                  type="number"
                  value={formData.commission}
                  onChange={(e) => setFormData({ ...formData, commission: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.01"
                  min="0"
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