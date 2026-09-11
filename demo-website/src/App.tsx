import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Footer } from '@/components/Footer';
import { Navbar } from '@/components/Navbar';
import { MfaGate, ProtectedRoute, PublicOnlyRoute } from '@/components/ProtectedRoute';
import { AuthProvider } from '@/context/AuthProvider';
import { Dashboard } from '@/pages/Dashboard';
import { Home } from '@/pages/Home';
import { Login } from '@/pages/Login';
import { MFASetup } from '@/pages/MFASetup';
import { NotFound } from '@/pages/NotFound';
import { Register } from '@/pages/Register';
import { VerifyMfa } from '@/pages/VerifyMfa';

/**
 * Application shell and routing.
 *
 * `AuthProvider` wraps the router so that the navbar, the route guards, and
 * every page read the same sign-in state from one subscription.
 *
 * Routes come in three groups:
 *
 *   - public:       /
 *   - public-only:  /login, /register  (redirect away once signed in)
 *   - protected:    /dashboard, /mfa-setup
 *
 * The guards are a convenience for the user, not a security boundary. What
 * actually stops one account reading another's data is `firestore.rules`.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="flex min-h-screen flex-col">
          {/* First tab stop, for keyboard users who do not want to walk the nav. */}
          <a
            href="#main"
            className="sr-only rounded bg-accent-600 px-3 py-2 text-sm text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100]"
          >
            Skip to content
          </a>

          <Navbar />

          <main id="main" className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />

              <Route element={<PublicOnlyRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>

              <Route element={<ProtectedRoute />}>
                {/* Signed in, but the second factor is still owed. */}
                <Route path="/verify" element={<VerifyMfa />} />

                {/* Signed in AND past the second factor. */}
                <Route element={<MfaGate />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/mfa-setup" element={<MFASetup />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>

          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
