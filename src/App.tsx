import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppUpdateDialog } from "./components/AppUpdateDialog";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import "./index.css";

function Shell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-ab-bg font-sans text-ab-tertiary">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user?.accessToken) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <>
      <AppUpdateDialog />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="h-full min-h-0">
          <Shell />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
