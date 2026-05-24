import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { AssistantButton } from "@/components/assistant/AssistantButton";
import { AssistantPopup } from "@/components/assistant/AssistantPopup";
import { VoiceCommandOverlay } from "@/components/assistant/VoiceCommandOverlay";
import { DoctorVerificationGuard } from "@/components/DoctorVerificationGuard";
import React from 'react';

const Index = React.lazy(() => import("./pages/Index"));
const Auth = React.lazy(() => import("./pages/Auth"));
const AdminPage = React.lazy(() => import("./pages/AdminPage"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const DoctorDashboard = React.lazy(() => import("./pages/DoctorDashboard"));
const DoctorRegister = React.lazy(() => import("./pages/DoctorRegister"));
const DoctorProfile = React.lazy(() => import("./pages/DoctorProfile"));
const AdminDashboard = React.lazy(() => import("./pages/AdminDashboard"));
const Doctors = React.lazy(() => import("./pages/Doctors"));
const BookAppointment = React.lazy(() => import("./pages/BookAppointment"));
const Payment = React.lazy(() => import("./pages/Payment"));
const Appointments = React.lazy(() => import("./pages/Appointments"));
const Chat = React.lazy(() => import("./pages/Chat"));
const Messages = React.lazy(() => import("./pages/Messages"));
const Prescriptions = React.lazy(() => import("./pages/Prescriptions"));
const NotificationsPage = React.lazy(() => import("./pages/Notifications"));
const Settings = React.lazy(() => import("./pages/Settings"));
const MedicalDocuments = React.lazy(() => import("./pages/MedicalDocuments"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const Specializations = React.lazy(() => import("./pages/Specializations"));
const AboutUs = React.lazy(() => import("./pages/AboutUs"));
const PastAppointments = React.lazy(() => import("./pages/PastAppointments"));
const Contact = React.lazy(() => import("./pages/Contact"));
const PrivacyPolicy = React.lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = React.lazy(() => import("./pages/TermsOfService"));
const Benefits = React.lazy(() => import("./pages/Benefits"));
const Faq = React.lazy(() => import("./pages/Faq"));

const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));

const queryClient = new QueryClient();

/**
 * MediAI Assistant overlay — rendered globally for authenticated users.
 * Must be inside both BrowserRouter (for useNavigate) and AuthProvider.
 */
function MediAIAssistant() {
  const { isAuthenticated } = useAuthContext();
  if (!isAuthenticated) return null;
  return (
    <>
      <AssistantButton />
      <AssistantPopup />
      <VoiceCommandOverlay />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <React.Suspense fallback={<div />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/home" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/register" element={<Navigate to="/auth?mode=signup" replace />} />
              <Route path="/adminpage" element={<AdminPage />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/patient-dashboard" element={<Dashboard />} />
              <Route path="/doctor" element={<DoctorDashboard />} />
              <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
              <Route path="/doctor/register" element={<DoctorRegister />} />
              <Route path="/doctor/past-appointments" element={<DoctorVerificationGuard><PastAppointments /></DoctorVerificationGuard>} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/doctors" element={<Doctors />} />
              <Route path="/book/:doctorId" element={<DoctorVerificationGuard><BookAppointment /></DoctorVerificationGuard>} />
              <Route path="/doctor/:doctorId" element={<DoctorProfile />} />
              <Route path="/payment/:appointmentId" element={<DoctorVerificationGuard><Payment /></DoctorVerificationGuard>} />
              <Route path="/appointments" element={<DoctorVerificationGuard><Appointments /></DoctorVerificationGuard>} />
              <Route path="/chat" element={<DoctorVerificationGuard><Messages /></DoctorVerificationGuard>} />
              <Route path="/chat/:appointmentId" element={<DoctorVerificationGuard><Chat /></DoctorVerificationGuard>} />
              <Route path="/messages" element={<DoctorVerificationGuard><Messages /></DoctorVerificationGuard>} />
              <Route path="/prescriptions" element={<DoctorVerificationGuard><Prescriptions /></DoctorVerificationGuard>} />
              <Route path="/medical-documents" element={<DoctorVerificationGuard><MedicalDocuments /></DoctorVerificationGuard>} />
              <Route path="/records" element={<DoctorVerificationGuard><MedicalDocuments /></DoctorVerificationGuard>} />
              <Route path="/notifications" element={<DoctorVerificationGuard><NotificationsPage /></DoctorVerificationGuard>} />
              <Route path="/settings" element={<DoctorVerificationGuard><Settings /></DoctorVerificationGuard>} />
              <Route path="/specializations" element={<Specializations />} />
              <Route path="/about" element={<AboutUs />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/benefits" element={<Benefits />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/join-as-doctor" element={<Navigate to="/auth?mode=signup&role=doctor" replace />} />

              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/doctor-benefits" element={<Benefits />} />
              <Route path="/doctor-faq" element={<Faq />} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </React.Suspense>

          {/* MediAI Assistant — global overlay for authenticated users */}
          <MediAIAssistant />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;