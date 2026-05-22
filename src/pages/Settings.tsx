import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuthContext } from "@/contexts/AuthContext";
import { getDoctorProfile } from "@/lib/auth";
import api from "@/lib/api";
import { uploadToS3 } from "@/lib/s3-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Loader2, User, Phone, Mail, ArrowLeft, Camera, Stethoscope, IndianRupee, Briefcase, FileText, Zap, MapPin, Bell, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemoryLoader } from "@/hooks/useMemoryLoader";


const profileSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(100),
  phone: z.string().min(10, "Phone number must be at least 10 digits").max(20),
});

const doctorProfileSchema = profileSchema.extend({
  bio: z.string().max(1000, "Bio must be less than 1000 characters").optional(),
  specialization: z.string().min(2, "Specialization is required").max(100),
  experienceYears: z.number().min(0, "Experience must be 0 or more").max(70),
  consultationFee: z.number().min(0, "Fee must be 0 or more"),
  emergencyFee: z.number().min(0, "Fee must be 0 or more"),
  state: z.string().min(1, "State is required").max(100),
  location: z.string().max(200, "Location must be less than 200 characters").optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;
type DoctorProfileFormData = z.infer<typeof doctorProfileSchema>;
interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
}

interface DoctorData {
  id: string;
  _id?: string;
  bio: string;
  specialization: string;
  experience_years: number;
  consultation_fee: number;
  emergency_fee: number;
  profile_image_url: string | null;
}

function NotificationPreferences() {
  const [preferences, setPreferences] = useState({
    email: true,
    push: true,
    video_calls: true,
    appointments: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const { data } = await api.get('/notifications/preferences');
      setPreferences(data);
    } catch (error) {
      console.error('Error fetching preferences:', error);
      toast.error('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (key: string, value: boolean) => {
    setSaving(true);
    try {
      const { data } = await api.put('/notifications/preferences', { [key]: value });
      setPreferences(data);
      toast.success('Notification preferences updated');
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast.error('Failed to update notification preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-32" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="email-notifications" className="text-sm font-medium">
            Email Notifications
          </Label>
          <p className="text-xs text-muted-foreground">
            Receive email notifications for appointments and updates
          </p>
        </div>
        <Switch
          id="email-notifications"
          checked={preferences.email}
          onCheckedChange={(checked) => updatePreference('email', checked)}
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="push-notifications" className="text-sm font-medium">
            Push Notifications
          </Label>
          <p className="text-xs text-muted-foreground">
            Receive browser push notifications for important updates
          </p>
        </div>
        <Switch
          id="push-notifications"
          checked={preferences.push}
          onCheckedChange={(checked) => updatePreference('push', checked)}
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="video-call-notifications" className="text-sm font-medium">
            Video Call Notifications
          </Label>
          <p className="text-xs text-muted-foreground">
            Get notified when doctors enable video calls for your appointments
          </p>
        </div>
        <Switch
          id="video-call-notifications"
          checked={preferences.video_calls}
          onCheckedChange={(checked) => updatePreference('video_calls', checked)}
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="appointment-notifications" className="text-sm font-medium">
            Appointment Notifications
          </Label>
          <p className="text-xs text-muted-foreground">
            Receive notifications about appointment confirmations and reminders
          </p>
        </div>
        <Switch
          id="appointment-notifications"
          checked={preferences.appointments}
          onCheckedChange={(checked) => updatePreference('appointments', checked)}
          disabled={saving}
        />
      </div>
    </div>
  );
}

function AICompanionPreferences() {
  const { memoryProfile, isLoading, updateAIPreferences } = useMemoryLoader();
  const [saving, setSaving] = useState(false);

  if (isLoading && !memoryProfile) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const prefs = memoryProfile?.aiPreferences || {
    language: 'en-US',
    verbosity: 'normal',
    tone: 'friendly',
    preferVoice: false,
  };

  const handleUpdate = async (key: string, value: any) => {
    setSaving(true);
    try {
      await updateAIPreferences({ [key]: value });
      toast.success(`${key === 'preferVoice' ? 'Voice preference' : key.charAt(0).toUpperCase() + key.slice(1) + ' preference'} updated!`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update AI Companion preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Preferred Language */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-muted/35 border border-border/60 transition-all hover:bg-muted/65">
        <div>
          <Label className="text-sm font-semibold text-foreground">Preferred Language</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Understanding, transcription, and translation language for voice commands
          </p>
        </div>
        <select
          value={prefs.language}
          onChange={(e) => handleUpdate('language', e.target.value)}
          disabled={saving}
          className="bg-background border border-input rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-input min-w-[180px] cursor-pointer shadow-sm"
        >
          <option value="en-US">English (US)</option>
          <option value="hi-IN">Hindi (हिंदी / Hinglish)</option>
          <option value="es-ES">Spanish (Español)</option>
        </select>
      </div>

      {/* Voice Output Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-muted/35 border border-border/60 transition-all hover:bg-muted/65">
        <div>
          <Label htmlFor="voice-response" className="text-sm font-semibold text-foreground">
            Voice Responses
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Enable synthesized spoken responses from the AI companion
          </p>
        </div>
        <Switch
          id="voice-response"
          checked={prefs.preferVoice}
          onCheckedChange={(checked) => handleUpdate('preferVoice', checked)}
          disabled={saving}
        />
      </div>

      {/* AI Tone Choice - Segmented Control */}
      <div className="flex flex-col gap-3 p-4 rounded-xl bg-muted/35 border border-border/60 transition-all hover:bg-muted/65">
        <div>
          <Label className="text-sm font-semibold text-foreground">AI Personality Tone</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Adjust the warmth, language, and clinical precision of medical suggestions
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 bg-background p-1 rounded-lg border border-border">
          {(['friendly', 'formal', 'clinical'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleUpdate('tone', t)}
              disabled={saving}
              type="button"
              className={`py-1.5 px-3 rounded-md text-xs font-semibold capitalize tracking-wide transition-all duration-300 ${
                prefs.tone === t
                  ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-md font-bold scale-[1.01]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Detail Level Choice - Segmented Control */}
      <div className="flex flex-col gap-3 p-4 rounded-xl bg-muted/35 border border-border/60 transition-all hover:bg-muted/65">
        <div>
          <Label className="text-sm font-semibold text-foreground">AI Verbosity (Detail Level)</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Control the length and complexity of responses
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 bg-background p-1 rounded-lg border border-border">
          {(['brief', 'normal', 'detailed'] as const).map((v) => (
            <button
              key={v}
              onClick={() => handleUpdate('verbosity', v)}
              disabled={saving}
              type="button"
              className={`py-1.5 px-3 rounded-md text-xs font-semibold capitalize tracking-wide transition-all duration-300 ${
                prefs.verbosity === v
                  ? 'bg-violet-600 text-white dark:bg-violet-500 dark:text-slate-950 shadow-md font-bold scale-[1.01]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user, isLoading: authLoading, isAuthenticated, role } = useAuthContext();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [doctorData, setDoctorData] = useState<DoctorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const isDoctor = role === "doctor";

  const form = useForm<ProfileFormData | DoctorProfileFormData>({
    resolver: zodResolver(isDoctor ? doctorProfileSchema : profileSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      ...(isDoctor && {
        bio: "",
        specialization: "",
        experienceYears: 0,
        consultationFee: 0,
        emergencyFee: 0,
        state: "",
        location: "",
      }),
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/auth");
      return;
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const { data } = await api.get('/auth/profile');
        setProfile(data);

        const baseValues: any = {
          fullName: data.full_name,
          phone: data.phone || "",
        };

        // If user is a doctor, fetch doctor-specific data
        if (data.role === "doctor" && (user?.id || user?._id)) {
          try {
            const userId = user._id || user.id;
            const doctorProfile = await getDoctorProfile(userId);

            if (doctorProfile) {
              // Fetch full doctor data
              const { data: fullDoctorData } = await api.get(`/doctors/${doctorProfile.id || doctorProfile._id}`);
              setDoctorData(fullDoctorData);
              setPreviewImage(fullDoctorData.profile_image_url);

              baseValues.bio = fullDoctorData.bio || "";
              baseValues.specialization = fullDoctorData.specialization || "";
              baseValues.experienceYears = fullDoctorData.experience_years || 0;
              baseValues.consultationFee = fullDoctorData.consultation_fee || 0;
              baseValues.emergencyFee = fullDoctorData.emergency_fee || 0;
              baseValues.state = fullDoctorData.state || "";
              baseValues.location = fullDoctorData.location || "";
            }
          } catch (error) {
            console.error("Error fetching doctor data:", error);
          }
        }

        form.reset(baseValues);
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    }

    if (isAuthenticated) {
      fetchProfile();
    }
  }, [isAuthenticated, user, form]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !doctorData) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be less than 2MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    setUploadingPhoto(true);
    try {
      const url = await uploadToS3(file);

      if (url) {
        await api.put(`/doctors/${doctorData._id || doctorData.id}`, {
          profile_image_url: url
        });

        setDoctorData((prev) => prev ? { ...prev, profile_image_url: url } : null);
        setPreviewImage(url);
        toast.success("Profile photo updated!");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (data: ProfileFormData | DoctorProfileFormData) => {
    setSaving(true);
    try {
      // Update User model (full_name, phone)
      await api.put('/auth/profile', {
        full_name: data.fullName,
        phone: data.phone,
      });

      // If doctor, update Doctor model
      if (isDoctor && doctorData && 'bio' in data) {
        const doctorFormData = data as DoctorProfileFormData;
        await api.put(`/doctors/${doctorData._id || doctorData.id}`, {
          bio: doctorFormData.bio,
          specialization: doctorFormData.specialization,
          experience_years: doctorFormData.experienceYears,
          consultation_fee: doctorFormData.consultationFee,
          emergency_fee: doctorFormData.emergencyFee,
          state: doctorFormData.state,
          location: doctorFormData.location,
        });
      }

      toast.success("Profile updated successfully!");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <MainLayout>
        <div className="container py-8 max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 mb-8" />
          <Skeleton className="h-96" />
        </div>
      </MainLayout>
    );
  }

  const dashboardLink = isDoctor ? "/doctor" : "/dashboard";

  return (
    <MainLayout>
      <div className="container py-8 max-w-4xl mx-auto">
        <Link
          to={dashboardLink}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <h1 className="font-heading text-3xl font-bold mb-8">Account Settings</h1>

        <div className="space-y-6">
          {/* Profile Photo - Only for Doctors */}
          {isDoctor && doctorData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Profile Photo
                </CardTitle>
                <CardDescription>
                  Upload a professional photo for your profile
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="relative group">
                    <Avatar className="h-24 w-24 border-2 border-primary/20">
                      <AvatarImage
                        src={previewImage || undefined}
                        alt={profile?.full_name}
                        className="object-cover"
                      />
                      <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                        {profile?.full_name?.charAt(0) || "D"}
                      </AvatarFallback>
                    </Avatar>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      {uploadingPhoto ? (
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                      ) : (
                        <Camera className="h-6 w-6 text-white" />
                      )}
                    </button>
                  </div>
                  <div>
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                    >
                      {uploadingPhoto && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Upload New Photo
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      JPG, PNG or GIF. Max size 2MB.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Profile Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
              <CardDescription>
                Update your personal information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="Your full name"
                    {...form.register("fullName")}
                  />
                  {form.formState.errors.fullName && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.fullName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    Phone Number
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    {...form.register("phone")}
                  />
                  {form.formState.errors.phone && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.phone.message}
                    </p>
                  )}
                </div>

                {/* Doctor-specific fields */}
                {isDoctor && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="bio" className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        Bio
                      </Label>
                      <Textarea
                        id="bio"
                        placeholder="Tell patients about yourself, your approach to healthcare, and your experience..."
                        rows={5}
                        {...form.register("bio")}
                      />
                      {'bio' in form.formState.errors && form.formState.errors.bio && (
                        <p className="text-sm text-destructive">
                          {(form.formState.errors as any).bio?.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Maximum 1000 characters
                      </p>
                    </div>
                  </>
                )}

                <div className="pt-4">
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Professional Information - Only for Doctors */}
          {isDoctor && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5" />
                  Professional Information
                </CardTitle>
                <CardDescription>
                  Update your professional credentials and fees
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="specialization">Specialization</Label>
                    <Input
                      id="specialization"
                      placeholder="e.g., Cardiologist, Dermatologist"
                      {...form.register("specialization")}
                    />
                    {'specialization' in form.formState.errors && form.formState.errors.specialization && (
                      <p className="text-sm text-destructive">
                        {(form.formState.errors as any).specialization?.message}
                      </p>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="experienceYears" className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        Years of Experience
                      </Label>
                      <Input
                        id="experienceYears"
                        type="number"
                        min="0"
                        max="70"
                        {...form.register("experienceYears", { valueAsNumber: true })}
                      />
                      {'experienceYears' in form.formState.errors && form.formState.errors.experienceYears && (
                        <p className="text-sm text-destructive">
                          {(form.formState.errors as any).experienceYears?.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="consultationFee" className="flex items-center gap-2">
                        <IndianRupee className="h-4 w-4 text-muted-foreground" />
                        Consultation Fee (₹)
                      </Label>
                      <Input
                        id="consultationFee"
                        type="number"
                        min="0"
                        {...form.register("consultationFee", { valueAsNumber: true })}
                      />
                      {'consultationFee' in form.formState.errors && form.formState.errors.consultationFee && (
                        <p className="text-sm text-destructive">
                          {(form.formState.errors as any).consultationFee?.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="state" className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        State
                      </Label>
                      <Input id="state" placeholder="e.g. Karnataka" {...form.register("state")} />
                      {'state' in form.formState.errors && form.formState.errors.state && (
                        <p className="text-sm text-destructive">
                          {(form.formState.errors as any).state?.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Location (City / Address)</Label>
                      <Input id="location" placeholder="e.g. Bengaluru, Jayanagar" {...form.register("location")} />
                      {'location' in form.formState.errors && form.formState.errors.location && (
                        <p className="text-sm text-destructive">
                          {(form.formState.errors as any).location?.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emergencyFee" className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-warning" />
                      Emergency Fee (₹)
                    </Label>
                    <Input
                      id="emergencyFee"
                      type="number"
                      min="0"
                      {...form.register("emergencyFee", { valueAsNumber: true })}
                    />
                    {'emergencyFee' in form.formState.errors && form.formState.errors.emergencyFee && (
                      <p className="text-sm text-destructive">
                        {(form.formState.errors as any).emergencyFee?.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Higher fee for immediate appointments that bypass the schedule
                    </p>
                  </div>

                  <div className="pt-4">
                    <Button type="submit" disabled={saving}>
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Notification Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Choose how you want to be notified about appointments and updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationPreferences />
            </CardContent>
          </Card>

          {/* AI Companion Preferences */}
          <Card className="relative overflow-hidden transition-all duration-300 border-l-2 border-l-teal-500/70 shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-teal-500/5 to-violet-500/5 blur-2xl pointer-events-none rounded-full" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-teal-500 animate-pulse" />
                AI Companion Preferences
              </CardTitle>
              <CardDescription>
                Customize your medical AI assistant's voice, tone, detail level, and language
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AICompanionPreferences />
            </CardContent>
          </Card>

          {/* Account Security */}
          <Card>
            <CardHeader>
              <CardTitle>Account Security</CardTitle>
              <CardDescription>
                Manage your account security settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">Password</p>
                  <p className="text-sm text-muted-foreground">
                    Change your account password
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    toast.info("Password reset feature coming soon!");
                  }}
                >
                  Reset Password
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
