import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Auth from './pages/Auth';
import { ThemeProvider } from './components/theme-provider';

// Pages
import Dashboard from './pages/Dashboard';
import Currency from './pages/master/Currency';
import ChartOfAccounts from './pages/master/ChartOfAccounts';
import Categories from './pages/master/Categories';
import SubCategories from './pages/master/SubCategories';
import TransactionType from './pages/master/TransactionType';

import CashEntry from './pages/transactions/CashEntry';
import EditCashEntry from './pages/transactions/EditCashEntry';
import BankEntry from './pages/transactions/BankEntry';
import EditBankEntry from './pages/transactions/EditBankEntry';
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
import BankBook from './pages/reports/BankBook';
import CashBook from './pages/reports/CashBook';
import CommissionReport from './pages/reports/CommissionReport';
import ZakatCalculation from './pages/reports/ZakatCalculation';

const NotFound = () => <div>404 - Page Not Found</div>;

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="fintrack-ui-theme">
      <div className="min-h-screen bg-background text-foreground">
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
              
              <Route path="/transactions/bank-entry" element={<BankEntry />} />
            <Route path="/transactions/bank-entry/edit/:id" element={<EditBankEntry />} />
              
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
              <Route path="/reports/bank-book" element={<BankBook />} />
              <Route path="/reports/cash-book" element={<CashBook />} />
              <Route path="/reports/commission" element={<CommissionReport />} />
              <Route path="/reports/zakat-calculation" element={<ZakatCalculation />} />
              
              {/* User Management */}
              <Route path="/users/profiles" element={<UserProfiles />} />
              <Route path="/users/roles" element={<RolesManagement />} />
              
              {/* Catch all */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster 
          position="top-right"
          toastOptions={{
            className: 'bg-background text-foreground border border-border',
          }}
        />
      </div>
    </ThemeProvider>
  );
}

export default App;