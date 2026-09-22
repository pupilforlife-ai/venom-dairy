import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ProductionBoard from './pages/ProductionBoard';
import MilkReceiving from './pages/MilkReceiving';
import Inventory from './pages/Inventory';
import Cutting from './pages/Cutting';
import Packing from './pages/Packing';
import ColdChain from './pages/ColdChain';
import WasteAndYield from './pages/WasteAndYield';
import Utilities from './pages/Utilities';
import Handover from './pages/Handover';
import Reconciliation from './pages/Reconciliation';
import Settings from './pages/Settings';

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/production-board" element={<ProductionBoard />} />
              <Route path="/milk-receiving" element={<MilkReceiving />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/cutting" element={<Cutting />} />
              <Route path="/packing" element={<Packing />} />
              <Route path="/cold-chain" element={<ColdChain />} />
              <Route path="/waste" element={<WasteAndYield />} />
              <Route path="/utilities" element={<Utilities />} />
              <Route path="/handover" element={<Handover />} />
              <Route path="/reconciliation" element={<Reconciliation />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}
