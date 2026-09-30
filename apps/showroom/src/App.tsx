import { Link, Route, Routes } from 'react-router-dom';
import { DemoToolbar } from './components/demo/DemoToolbar';
import { EnquirySheet } from './components/enquiry/EnquirySheet';
import { Home } from './pages/Home';
import { ModelDetail } from './pages/ModelDetail';
import { NotFound } from './pages/NotFound';
import { ThankYou } from './pages/ThankYou';
import { EnquiryProvider } from './state';

export function App() {
  return (
    <EnquiryProvider>
      <DemoToolbar />
      <header className="site-header">
        <Link to="/" className="brand">
          EuroDrive Motors
        </Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/models/:slug" element={<ModelDetail />} />
          <Route path="/thank-you" element={<ThankYou />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <EnquirySheet />
    </EnquiryProvider>
  );
}
