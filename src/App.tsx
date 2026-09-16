import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ProductionBoard from './pages/ProductionBoard';
import MilkReceiving from './pages/MilkReceiving';
import Inventory from './pages/Inventory';
import ColdChain from './pages/ColdChain';
import WasteAndYield from './pages/WasteAndYield';
import Handover from './pages/Handover';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/production-board" element={<ProductionBoard />} />
          <Route path="/milk-receiving" element={<MilkReceiving />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/cold-chain" element={<ColdChain />} />
          <Route path="/waste" element={<WasteAndYield />} />
          <Route path="/handover" element={<Handover />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
