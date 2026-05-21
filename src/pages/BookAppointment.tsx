import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { useAuthContext } from "@/contexts/AuthContext";
import { useAssistantStore } from "@/store/assistantStore";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { format, addDays, isBefore, startOfToday, isToday } from "date-fns";
import {
  Clock,
  IndianRupee,
  Calendar as CalendarIcon,
  AlertTriangle,
  CheckCircle2,
  Zap,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";

interface Doctor {
  id: string;
  user_id: string;
  specialization: string;
  experience_years: number;
  consultation_fee: number;
  emergency_fee: number;
  bio: string | null;
  profile: {
    full_name: string;
    email: string;
  } | null;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

const generateTimeSlots = (): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  for (let hour = 9; hour <= 20; hour++) {
    slots.push({ time: `${hour.toString().padStart(2, "0")}:00`, available: true });
    if (hour < 20) {
      slots.push({ time: `${hour.toString().padStart(2, "0")}:30`, available: true });
    }
  }
  return slots;
};

export default function BookAppointment() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading, role } = useAuthContext();
  const { uiBookingDate, uiBookingTime, triggerBookingSubmit } = useAssistantStore();

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [appointmentType, setAppointmentType] = useState<"scheduled" | "emergency">("scheduled");
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(generateTimeSlots());
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [platformFee, setPlatformFee] = useState(0);

  // Derived boolean to avoid repeated find calls and ensure consistent checks
  const selectedSlot = useMemo(() => timeSlots.find((s) => s.time === selectedTime) ?? null, [timeSlots, selectedTime]);
  const isSlotAvailable = useMemo(() => {
    if (!selectedSlot) return false;
    if (appointmentType === 'emergency') return true; // emergency can preempt
    return selectedSlot.available === true;
  }, [selectedSlot, appointmentType]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/auth");
      return;
    }
    // Only patients can book appointments (doctors and admins cannot)
    if (!authLoading && role && role !== "patient") {
      toast.error("Only patients can book appointments");
      navigate("/doctors");
      return;
    }
  }, [authLoading, isAuthenticated, role, navigate]);

  useEffect(() => {
    async function fetchDoctor() {
      if (!doctorId) return;

      try {
        // Fetch doctor by ID but using our doctors endpoint.
        // We might need to expose a public "get doctor by id" route.
        // I have /api/doctors/user/:userId but not /api/doctors/:id in doctors.js?
        // Let's check doctors.js. "Get doctor by user ID" is what I marked.
        // I need get doctor by doctor ID.
        // I'll add that route to doctors.js as well.
        // api.get(`/doctors/${doctorId}`)
        const { data: doctorData } = await api.get(`/doctors/${doctorId}`);

        if (!doctorData) {
          toast.error("Doctor not found");
          navigate("/doctors");
          return;
        }

        // Map profile
        const doctorWithProfile = {
          ...doctorData,
          id: doctorData._id,
          profile: doctorData.user_id ? {
            full_name: doctorData.user_id.full_name,
            email: doctorData.user_id.email
          } : null
        };

        setDoctor(doctorWithProfile);
      } catch (error) {
        console.error("Error fetching doctor", error);
        toast.error("Doctor not found");
        navigate("/doctors");
      } finally {
        setLoading(false);
      }
    }

    fetchDoctor();
  }, [doctorId, navigate]);

  useEffect(() => {
    async function fetchPlatformFee() {
      try {
        const { data } = await api.get('/platform-settings/public');
        setPlatformFee(Number(data?.platform_fee || 0));
      } catch (error) {
        console.error('Failed to fetch platform fee', error);
        setPlatformFee(0);
      }
    }

    fetchPlatformFee();
  }, []);

  useEffect(() => {
    async function fetchBookedSlotsAndAvailability() {
      if (!doctorId || !selectedDate) return;

      try {
        // Fetch appointments for this doctor and date
        const { data: appointments } = await api.get(`/appointments/doctor/${doctorId}?date=${format(selectedDate, "yyyy-MM-dd")}`);
        const booked = (appointments || [])
          .filter((a: any) => a.status !== 'cancelled')
          .map((a: any) => a.appointment_time.slice(0, 5));
        setBookedSlots(booked);

        // Fetch availability for the selected doctor and day
        const { data: availability } = await api.get(`/availability/${doctorId}`);
        const dayOfWeek = selectedDate.getDay();
        const daySlot = (availability || []).find((s: any) => s.day_of_week === dayOfWeek);

        const allSlots = generateTimeSlots();

        if (!daySlot || !daySlot.is_available) {
          // No availability that day: no slots available (unless emergency)
          setTimeSlots(allSlots.map((s) => ({ ...s, available: false })));
        } else {
          // Filter slots within availability window
          const toMinutes = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + m;
          };

          const startMin = toMinutes(daySlot.start_time);
          const endMin = toMinutes(daySlot.end_time);

          const now = new Date();
          const isTodaySelected = isToday(selectedDate);
          const currentMinutes = now.getHours() * 60 + now.getMinutes();

          const filtered = allSlots.map((s) => {
            const mins = toMinutes(s.time);
            const inRange = mins >= startMin && mins < endMin;
            const alreadyBooked = booked.includes(s.time);
            const isPast = isTodaySelected && mins <= currentMinutes;
            return { time: s.time, available: inRange && !alreadyBooked && !isPast };
          });

          setTimeSlots(filtered);
        }
      } catch (error) {
        console.error("Error fetching slots", error);
      }
    }

    fetchBookedSlotsAndAvailability();
  }, [doctorId, selectedDate]);

  // Sync Voice Assistant selections to local component state
  useEffect(() => {
    if (uiBookingDate) {
      setSelectedDate(new Date(uiBookingDate)); // Ensure it's a fresh Date object
    }
  }, [uiBookingDate]);

  useEffect(() => {
    if (uiBookingTime) {
      setSelectedTime(uiBookingTime);
    }
  }, [uiBookingTime]);

  // Auto-trigger booking when confirmed via Voice Assistant
  useEffect(() => {
    if (triggerBookingSubmit) {
      handleBookAppointment();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerBookingSubmit]);

  const handleBookAppointment = async () => {
    // More specific validation helps avoid the generic error when something else is missing
    const currentUser = getCurrentUser();
    if (!isAuthenticated && !currentUser) {
      toast.error("You must be logged in to book an appointment");
      return;
    }
    if (!doctor) {
      toast.error("Doctor information is missing");
      return;
    }
    if (!selectedDate || !selectedTime) {
      toast.error("Please select a date and time");
      return;
    }
    if (appointmentType === 'scheduled' && !isSlotAvailable) {
      toast.error("Selected slot is unavailable. Please choose another time.");
      return;
    }

    setSubmitting(true);

    try {
      // Fetch existing appointments for the doctor on this date to check availability
      // We can reuse the appointments endpoint with query params? 
      // My endpoints are role based. I might need a public/patient endpoint to check doctor slots?
      // Actually, patients can fetch appointments. But usually they only fetch THEIR appointments.
      // I need to fetch bookings for a doctor to block slots.
      // Security-wise, I should probably expose a "availability" endpoint.
      // For MVP MERN migration, let's assume I can query appointments by doctor_id.
      // But my current /api/appointments filters by logged in user!
      // I need a new endpoint: /api/appointments/doctor/:doctorId/date/:date

      // I'll add this endpoint to appointments.js later. For now I'll stub it or use what I have.
      // Let's use api.get(`/appointments/doctor/${doctor.id}?date=${format(selectedDate, "yyyy-MM-dd")}`)
      // I will add this route.
      const { data: existingAppts } = await api.get(`/appointments/doctor/${doctor.id}?date=${format(selectedDate, "yyyy-MM-dd")}`);

      const existing = existingAppts.find((a: any) => a.appointment_time === selectedTime && a.status !== "cancelled");

      if (existing && appointmentType !== "emergency") {
        toast.error("This slot has just been booked. Please select another.");
        setBookedSlots([...bookedSlots, selectedTime]);
        setSubmitting(false);
        return;
      }

      if (existing && appointmentType === "emergency") {
        toast.warn("Emergency booking: this will preempt an existing appointment at this time.");
      }

      const doctorFee = appointmentType === "emergency" ? doctor.emergency_fee : doctor.consultation_fee;
      const totalAmount = Number((doctorFee + platformFee).toFixed(2));

      const { data: appointment } = await api.post('/appointments', {
        patient_id: (currentUser && (currentUser._id || currentUser.id)) || (user && (user._id || user.id)),
        doctor_id: doctor.id,
        appointment_date: format(selectedDate, "yyyy-MM-dd"),
        appointment_time: selectedTime,
        appointment_type: appointmentType,
        amount: totalAmount,
        doctor_fee: doctorFee,
        platform_fee: platformFee,
      });

      // Send email notification (fire and forget)
      // I don't have an email service in MERN yet, so I'll skip or log
      console.log("Email notification would be sent here");

      // If server already confirmed and marked paid (happens for emergency bookings that auto-preempt), skip payment
      if (appointment.status === 'confirmed' && appointment.payment_status === 'paid') {
        toast.success("Appointment confirmed successfully!");
        navigate('/appointments');
        return;
      }

      toast.success("Appointment created! Redirecting to payment...");
      navigate(`/payment/${appointment._id}`);

    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to book appointment");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <MainLayout>
        <div className="container py-8 max-w-4xl mx-auto">
          <Skeleton className="h-8 w-64 mb-8" />
          <div className="grid md:grid-cols-2 gap-8">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!doctor) return null;

  const doctorFee = appointmentType === "emergency" ? doctor.emergency_fee : doctor.consultation_fee;
  const totalFee = Number((doctorFee + platformFee).toFixed(2));

  return (
    <MainLayout>
      <div className="container py-8 max-w-4xl mx-auto">
        <Link
          to="/doctors"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to doctors
        </Link>

        <h1 className="font-heading text-3xl font-bold mb-8">Book Appointment</h1>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Doctor Info & Type Selection */}
          <div className="md:col-span-1 space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-primary/10 text-primary text-xl">
                      {doctor.profile?.full_name?.charAt(0) || "D"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-heading font-semibold">
                      Dr. {doctor.profile?.full_name}
                    </h3>
                    <Badge variant="secondary">{doctor.specialization}</Badge>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{doctor.experience_years} years experience</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Appointment Type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <button
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${appointmentType === "scheduled"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                    }`}
                  onClick={() => setAppointmentType("scheduled")}
                >
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Scheduled</p>
                      <p className="text-sm text-muted-foreground">
                        ₹{doctor.consultation_fee}
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${appointmentType === "emergency"
                    ? "border-warning bg-warning/5"
                    : "border-border hover:border-warning/50"
                    }`}
                  onClick={() => setAppointmentType("emergency")}
                >
                  <div className="flex items-center gap-3">
                    <Zap className="h-5 w-5 text-warning" />
                    <div>
                      <p className="font-medium">Emergency</p>
                      <p className="text-sm text-muted-foreground">
                        ₹{doctor.emergency_fee}
                      </p>
                    </div>
                  </div>
                </button>
                {appointmentType === "emergency" && (
                  <div className="p-3 rounded-lg bg-warning/10 text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                      <p className="text-warning-foreground">
                        Emergency appointments unlock chat & video immediately after payment.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Date & Time Selection */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Select Date</CardTitle>
                <CardDescription>Choose your preferred appointment date</CardDescription>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => isBefore(date, startOfToday())}
                  className="rounded-md border"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Select Time</CardTitle>
                <CardDescription>
                  {selectedDate
                    ? `Available slots for ${format(selectedDate, "EEEE, MMMM d, yyyy")}`
                    : "Select a date first"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {timeSlots.map((slot) => {
                    const isSelected = selectedTime === slot.time;
                    const isDisabled = !slot.available && appointmentType !== 'emergency';
                    const isBooked = bookedSlots.includes(slot.time);

                    return (
                      <button
                        key={slot.time}
                        disabled={isDisabled}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${isDisabled
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary hover:bg-primary/10"
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{slot.time}</span>
                          {isBooked && <span className="text-xs text-muted-foreground">(booked)</span>}
                          {appointmentType === 'emergency' && isBooked && (
                            <span className="text-xs text-warning">(will preempt)</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Summary & Book */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="font-heading text-3xl font-bold flex items-center">
                      <IndianRupee className="h-6 w-6" />
                      {totalFee}
                    </p>
                  </div>
                  {selectedDate && selectedTime && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Appointment</p>
                      <p className="font-medium">
                        {format(selectedDate, "MMM d")} at {selectedTime}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-1 mb-4 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Doctor Fee</span>
                    <span>₹{doctorFee}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Platform Fee</span>
                    <span>₹{platformFee}</span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  disabled={!selectedDate || !selectedTime || submitting || (appointmentType === 'scheduled' && !isSlotAvailable)}
                  onClick={handleBookAppointment}
                >
                  {submitting ? (
                    "Processing..."
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Proceed to Payment
                    </>
                  )}
                </Button>
                {appointmentType === 'scheduled' && selectedTime && (!timeSlots.find(s => s.time === selectedTime) || !timeSlots.find(s => s.time === selectedTime)?.available) && (
                  <p className="text-sm text-destructive mt-2">Selected slot is unavailable. Please choose another time.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
