import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Heart, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import api from "@/lib/api";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signUpSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Please enter a valid email").max(255),
  phone: z.string().min(10, "Phone number must be at least 10 digits").max(20),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  role: z.enum(["patient", "doctor"]),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignInFormData = z.infer<typeof signInSchema>;
type SignUpFormData = z.infer<typeof signUpSchema>;

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, role, login, register, loginWithGoogle } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [activeTab, setActiveTab] = useState(
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  );

  const defaultRole = searchParams.get("role") as "patient" | "doctor" | null;

  const signInForm = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: defaultRole || "patient",
    },
  });

  useEffect(() => {
    if (isAuthenticated && role) {
      if (role === "admin") {
        navigate("/admin");
      } else if (role === "patient") {
        navigate("/dashboard");
      }
      // Doctors are NOT auto-navigated here.
      // handleGoogleSignIn and handleSignUp manage doctor navigation
      // explicitly (→ /doctor/register or → /doctor).
    }
  }, [isAuthenticated, role, navigate]);

  const handleSignIn = async (data: SignInFormData) => {
    setIsLoading(true);
    try {
      await login({ email: data.email.trim().toLowerCase(), password: data.password });
      toast.success("Welcome back!");
      // Navigation will happen via useEffect
    } catch (error: any) {
      const message = error?.message || "";
      if (message.includes("Invalid login credentials") || message.includes("Invalid email or password")) {
        toast.error("Invalid email or password");
      } else {
        toast.error(message || "Failed to sign in");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async (selectedRole: "patient" | "doctor") => {
    setIsLoading(true);
    try {
      await loginWithGoogle(selectedRole);
      
      if (selectedRole === "doctor") {
        toast.success("Account linked! Please complete your doctor registration.");
        navigate("/doctor/register");
      } else {
        toast.success("Welcome! Successfully signed in with Google.");
        // Navigation via useEffect
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in with Google");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (data: SignUpFormData) => {
    setIsLoading(true);
    try {
      // Pass individual fields as my signUp function expects args, but wait,
      // my useAuth calls signUp(userData).
      // Let's check matching.
      // useAuth register calls signUp(userData).
      // auth.ts signUp expects (userData: any) ? No wait.
      // Let's check auth.ts signature: `export const signUp = async (userData: any)`?
      // No, let's check auth.ts content I viewed earlier.
      // Line 5: export const signUp = async (userData: any) => { ... }
      // OK, it takes one object.
      // But Auth.tsx line 105 was calling: `await signUp(data.email, data.password, data.fullName, data.phone, data.role);`
      // This indicates an outdated signup signature; the current `signUp` expects a single object for the MERN/MongoDB backend, so pass an object instead of multiple args.
      // Let's check `src/lib/auth.ts` again in my view history.
      // It says: `export const signUp = async (userData: any) => { ... api.post('/auth/register', userData) ... }`
      // So it expects an OBJECT.
      // But Auth.tsx line 105 was passing multiple args!
      // That explains why it might have been failing too.

      await register({
        email: data.email,
        password: data.password,
        full_name: data.fullName, // Backend expects full_name? Let's check User model. User.js.
        // User.js: full_name: { type: String ... }
        phone: data.phone,
        role: data.role
      });

      if (data.role === "doctor") {
        toast.success("Account created! Please complete your doctor registration.");
        navigate("/doctor/register");
      } else {
        toast.success("Account created successfully!");
        // Navigation via useEffect
      }
    } catch (error: any) {
      if (error.message?.includes("User already registered")) {
        toast.error("This email is already registered. Please sign in.");
      } else {
        toast.error(error.message || "Failed to create account");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MainLayout showFooter={false}>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="flex items-center gap-2 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Heart className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="font-heading text-2xl font-bold">MediConnect</span>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <Card>
                <CardHeader>
                  <CardTitle>Welcome back</CardTitle>
                  <CardDescription>
                    Sign in to your account to continue
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        {...signInForm.register("email")}
                      />
                      {signInForm.formState.errors.email && (
                        <p className="text-sm text-destructive">
                          {signInForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          {...signInForm.register("password")}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                      {signInForm.formState.errors.password && (
                        <p className="text-sm text-destructive">
                          {signInForm.formState.errors.password.message}
                        </p>
                      )}
                      <div className="flex justify-end mt-1">
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={async () => {
                            const email = signInForm.getValues("email");
                            if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
                              toast.error("Please enter a valid email address first.");
                              return;
                            }
                            try {
                              setIsLoading(true);
                              await api.post("/auth/forgot-password", { email });
                              toast.info("If an account exists, a reset link has been sent to your email.");
                            } catch (err) {
                              toast.error("Failed to send reset email.");
                            } finally {
                              setIsLoading(false);
                            }
                          }}
                        >
                          Forgot Password?
                        </button>
                      </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sign In
                    </Button>

                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or continue with
                        </span>
                      </div>
                    </div>

                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full" 
                      disabled={isLoading}
                      onClick={() => handleGoogleSignIn("patient")}
                    >
                      <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                        <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                      </svg>
                      Google
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="signup">
              <Card>
                <CardHeader>
                  <CardTitle>Create an account</CardTitle>
                  <CardDescription>
                    Join MediConnect as a patient or doctor
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        placeholder="John Doe"
                        {...signUpForm.register("fullName")}
                      />
                      {signUpForm.formState.errors.fullName && (
                        <p className="text-sm text-destructive">
                          {signUpForm.formState.errors.fullName.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signupEmail">Email</Label>
                      <Input
                        id="signupEmail"
                        type="email"
                        placeholder="you@example.com"
                        {...signUpForm.register("email")}
                      />
                      {signUpForm.formState.errors.email && (
                        <p className="text-sm text-destructive">
                          {signUpForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="9682000334"
                        {...signUpForm.register("phone")}
                      />
                      {signUpForm.formState.errors.phone && (
                        <p className="text-sm text-destructive">
                          {signUpForm.formState.errors.phone.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signupPassword">Password</Label>
                      <div className="relative">
                        <Input
                          id="signupPassword"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          {...signUpForm.register("password")}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                      {signUpForm.formState.errors.password && (
                        <p className="text-sm text-destructive">
                          {signUpForm.formState.errors.password.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="••••••••"
                          {...signUpForm.register("confirmPassword")}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                      {signUpForm.formState.errors.confirmPassword && (
                        <p className="text-sm text-destructive">
                          {signUpForm.formState.errors.confirmPassword.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-3">
                      <Label>I want to join as</Label>
                      <RadioGroup
                        value={signUpForm.watch("role")}
                        onValueChange={(value: "patient" | "doctor") =>
                          signUpForm.setValue("role", value)
                        }
                        className="grid grid-cols-2 gap-4"
                      >
                        <div>
                          <RadioGroupItem
                            value="patient"
                            id="patient"
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor="patient"
                            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                          >
                            <span className="text-2xl mb-2">👤</span>
                            <span className="font-medium">Patient</span>
                          </Label>
                        </div>
                        <div>
                          <RadioGroupItem
                            value="doctor"
                            id="doctor"
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor="doctor"
                            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                          >
                            <span className="text-2xl mb-2">👨‍⚕️</span>
                            <span className="font-medium">Doctor</span>
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Account
                    </Button>

                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or sign up with
                        </span>
                      </div>
                    </div>

                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full" 
                      disabled={isLoading}
                      onClick={() => handleGoogleSignIn(signUpForm.watch("role") as "patient" | "doctor")}
                    >
                      <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                        <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                      </svg>
                      Google
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}
