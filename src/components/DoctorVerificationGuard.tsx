/**
 * DoctorVerificationGuard
 *
 * Wraps any route that a doctor might access.
 * If the authenticated user is a doctor but has NOT yet been verified,
 * they are redirected to /doctor (the DoctorDashboard) which already
 * renders the "Verification Pending / Rejected" screen.
 *
 * This prevents unverified doctors from reaching pages like
 * /appointments, /chat, /prescriptions, /messages, etc.
 */
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { getDoctorProfile } from "@/lib/auth";

interface Props {
  children: React.ReactNode;
}

export function DoctorVerificationGuard({ children }: Props) {
  const { user, role, isAuthenticated, isLoading } = useAuthContext();
  const [checking, setChecking] = useState(true);
  const [isVerified, setIsVerified] = useState(true); // optimistic

  useEffect(() => {
    if (isLoading) return;

    // Only enforce for authenticated doctors
    if (!isAuthenticated || role !== "doctor") {
      setChecking(false);
      return;
    }

    const userId = user?._id || user?.id;
    if (!userId) {
      setChecking(false);
      return;
    }

    getDoctorProfile(userId).then((data) => {
      if (data) {
        setIsVerified(data.is_verified === true);
      }
      setChecking(false);
    });
  }, [isLoading, isAuthenticated, role, user]);

  // While auth is loading or the verification check is running, render nothing
  if (isLoading || checking) return null;

  // Unverified doctor → send them back to DoctorDashboard which shows the gate UI
  if (isAuthenticated && role === "doctor" && !isVerified) {
    return <Navigate to="/doctor" replace />;
  }

  return <>{children}</>;
}
