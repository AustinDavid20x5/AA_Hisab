import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Auth from './pages/Auth';
import { useThemeStore } from './lib/store';

// Pages
import Dashboard from './pages/Dashboard';
import Currency from './pages/master/Currency';
import ChartOfAccounts from './pages/master/ChartOfAccounts';
import Categories from './pages/master/Categories';
import SubCategories from './pages/master/SubCategories';
import TransactionType from './pages/master/TransactionType';

import CashEntry from './pages/transactions/CashEntry';
import EditCashEntry from './pages/transactions/EditCashEntry';
import InterpartyTransfer from './pages/transactions/InterpartyTransfer';
import EditInterpartyTransfer from './pages/transactions/EditInterpartyTransfer';
import BankTransfer from './pages/transactions/BankTransfer';
import EditBankTransfer from './pages/transactions/EditBankTransfer';
import GeneralTrading from './pages/transactions/GeneralTrading';
import EditGeneralTrading from './pages/transactions/EditGeneralTrading';
import JournalVoucher from './pages/transactions/JournalVoucher';
import EditJournalVoucher from './pages/transactions/EditJournalVoucher';

import UserProfiles from './pages/users/UserProfiles';
import RolesManagement from './pages/users/RolesManagement';
import GeneralLedger from './pages/reports/GeneralLedger';
import TrialBalance from './pages/reports/TrialBalance';
import CashBook from './pages/reports/CashBook';
import CommissionReport from './pages/reports/CommissionReport';

const NotFound = () => <div>404 - Page Not Found</div>;

function App() {
  const { isDarkMode } = useThemeStore();

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              
              {/* Master Forms */}
              <Route path="/master/currency" element={<Currency />} />
              <Route path="/master/coa" element={<ChartOfAccounts />} />
              <Route path="/master/categories" element={<Categories />} />
              <Route path="/master/subcategories" element={<SubCategories />} />
              <Route path="/master/transaction-types" element={<TransactionType />} />
              
              {/* Transactions */}
              <Route path="/transactions/cash" element={<CashEntry />} />
              <Route path="/transactions/cash/edit/:id" element={<EditCashEntry />} />
              
              <Route path="/transactions/ipt" element={<InterpartyTransfer />} />
              <Route path="/transactions/ipt/edit/:id" element={<EditInterpartyTransfer />} />
              
              <Route path="/transactions/bank" element={<BankTransfer />} />
              <Route path="/transactions/bank/edit/:id" element={<EditBankTransfer />} />
              
              <Route path="/transactions/trading" element={<GeneralTrading />} />
              <Route path="/transactions/trading/edit/:id" element={<EditGeneralTrading />} />
              
              <Route path="/transactions/jv" element={<JournalVoucher />} />
              <Route path="/transactions/jv/edit/:id" element={<EditJournalVoucher />} />
              
              {/* Reports */}
              <Route path="/reports/gl" element={<GeneralLedger />} />
              <Route path="/reports/trial-balance" element={<TrialBalance />} />
              <Route path="/reports/cash-book" element={<CashBook />} />
              <Route path="/reports/commission" element={<CommissionReport />} />
              
              {/* User Management */}
              <Route path="/users/profiles" element={<UserProfiles />} />
              <Route path="/users/roles" element={<RolesManagement />} />
              
              {/* Catch all */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </div>
    </div>
  );
}

export default App;