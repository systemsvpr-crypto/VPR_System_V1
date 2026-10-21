"use client";

import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import { loginUser } from "../redux/slice/loginSlice";
import { useMagicToast } from "../context/MagicToastContext";
import { useTheme } from "../context/ThemeContext";
import supabase from "../SupabaseClient";
import { sendPasswordResetOTP } from "../services/whatsappService";
import {
  KeyRound,
  ShieldCheck,
  User as UserIcon,
  ArrowLeft,
  RefreshCw,
  Smartphone,
  Eye,
  EyeOff,
  Sun,
  Moon,
} from "lucide-react";
import logo from "../../../assets/vpr_logo.png";

const LoginPage = () => {
  const navigate = useNavigate();
  const { isLoggedIn, userData, error } = useSelector((state) => state.login);
  const dispatch = useDispatch();
  const { showToast } = useMagicToast();

  const { isDark, toggleTheme } = useTheme();

  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });

  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState("username"); // 'username', 'otp', 'reset'
  const [forgotData, setForgotData] = useState({
    username: "",
    otp: "",
    newPassword: "",
    confirmPassword: "",
    generatedOtp: "",
  });
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoginLoading(true);
    dispatch(loginUser(formData));
  };

  // Ensure mobile browser UI adopts primary brand color (Light: Blue #2563eb, Dark: Purple #9333ea) on phones
  useEffect(() => {
    const updateThemeColor = () => {
      const isMobile =
        window.innerWidth < 768 ||
        /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      const activeColor = isMobile ? (isDark ? "#9333ea" : "#2563eb") : "#ffffff";
      metas.forEach((m) => m.setAttribute("content", activeColor));
    };

    updateThemeColor();
    window.addEventListener("resize", updateThemeColor);
    return () => {
      window.removeEventListener("resize", updateThemeColor);
    };
  }, [isDark]);

  useEffect(() => {
    const handleLoginSuccess = async () => {
      if (isLoggedIn && userData) {
        console.log("User Data received:", userData); // Debug log

        let designation = userData.Designation || userData.designation || "";

        // If designation is missing, try fetching it explicitly
        if (!designation && userData.user_name) {
          try {
            const { data } = await supabase
              .from("checklist_users")
              .select("Designation")
              .eq("user_name", userData.user_name || userData.username)
              .single();
            if (data) {
              designation = data.Designation || "";
            }
          } catch (err) {
            console.error("Error fetching designation:", err);
          }
        }

        // Store required identity keys in localStorage
        const userName = userData.user_name || userData.username || "";
        if (userName) localStorage.setItem("user-name", userName);
        if (userData.id) localStorage.setItem("user-id", String(userData.id));
        if (userData.role) localStorage.setItem("role", userData.role);

        if (designation) localStorage.setItem("designation", designation);
        else localStorage.removeItem("designation");

        if (userData.profile_image) localStorage.setItem("profile_image", userData.profile_image);
        else localStorage.removeItem("profile_image");

        if (userData.department) localStorage.setItem("department", userData.department);
        else localStorage.removeItem("department");

        if (userData.division) localStorage.setItem("division", userData.division);
        else localStorage.removeItem("division");

        if (userData.user_access) localStorage.setItem("user_access", userData.user_access);
        else localStorage.removeItem("user_access");

        if (userData.page_access) localStorage.setItem("page_access", userData.page_access);
        else localStorage.removeItem("page_access");

        // Purge sensitive / redundant credentials
        localStorage.removeItem("email_id");
        localStorage.removeItem("phone");
        localStorage.removeItem("contact");
        localStorage.removeItem("can_self_assign");
        localStorage.removeItem("password");
        localStorage.removeItem("password_hash");
        localStorage.removeItem("token");

        showToast(
          `Welcome back, ${userData.user_name || userData.username}!`,
          "success",
        );
        navigate("/checklist/portal");
      } else if (error) {
        showToast(error, "error");
        setIsLoginLoading(false);
      }
    };

    handleLoginSuccess();
  }, [isLoggedIn, userData, error, navigate, showToast]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="flex flex-col min-h-screen min-h-[100dvh] justify-between bg-gradient-to-br from-blue-50/50 via-slate-50 to-blue-50/60 dark:from-slate-950 dark:via-slate-900/95 dark:to-slate-950 font-sans transition-colors duration-300 overflow-y-auto">
      {/* Theme Toggle Button in Top Corner */}
      <div className="fixed sm:absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
        <button
          onClick={toggleTheme}
          className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-2 sm:p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 transition-all shadow-[0_4px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-md cursor-pointer"
          title="Toggle theme"
        >
          {isDark ? (
            <Sun className="h-5 w-5 text-amber-500" />
          ) : (
            <Moon className="h-5 w-5 text-slate-700" />
          )}
        </button>
      </div>

      {/* Spacer/Wrapper to center the login card dynamically */}
      <div className="flex-1 flex items-center justify-center w-full px-4 sm:px-6 md:px-8 py-6 sm:py-10 my-auto min-h-0">
        <div className="w-full max-w-[clamp(300px,min(92vw,28rem),520px)] 2xl:max-w-[clamp(360px,26vw,560px)] bg-white dark:bg-slate-900 rounded-[28px] sm:rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.15)] border border-slate-100 dark:border-slate-800 p-6 sm:p-8 space-y-5 sm:space-y-6 transition-all duration-300">
          {/* Logo and Header Block */}
          <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
            <div className="flex items-center justify-center border border-slate-100 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm w-24 sm:w-28 2xl:w-32 aspect-[1280/905] overflow-hidden transition-all">
              <img
                src={logo}
                alt="Nutech Pipes Logo"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-[26px] 2xl:text-[28px] font-black tracking-wide bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent">
                Nutech Pipes
              </h2>
              <p className="text-xs sm:text-sm font-semibold text-slate-400 dark:text-slate-500">
                Master System Platform
              </p>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* Username Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-[11px] font-extrabold tracking-wider text-slate-500 dark:text-slate-400 uppercase"
              >
                Username
              </label>
              <div className="relative">
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Enter your username"
                  required
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full pl-11 pr-4 py-2.5 sm:py-3 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 text-sm transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-800 dark:text-slate-100"
                />
                <UserIcon
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  size={18}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[11px] font-extrabold tracking-wider text-slate-500 dark:text-slate-400 uppercase"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full pl-11 pr-11 py-2.5 sm:py-3 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 text-sm transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-800 dark:text-slate-100"
                />
                <KeyRound
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  size={18}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col gap-3 sm:gap-4">
              <button
                type="submit"
                className="w-full py-2.5 sm:py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-600 text-white rounded-2xl font-bold hover:opacity-90 transition-all shadow-[0_4px_12px_rgba(99,102,241,0.15)] active:scale-[0.98] disabled:opacity-50 text-sm sm:text-base cursor-pointer"
                disabled={isLoginLoading}
              >
                {isLoginLoading ? "Logging in..." : "Login"}
              </button>

              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors text-center self-center cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Powered by footer pinned to bottom of viewport */}
      <div className="w-full bg-white dark:bg-slate-950 border-t border-slate-200/60 dark:border-slate-800 py-3 sm:py-4 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors duration-300 flex-shrink-0">
        Powered by{" "}
        <a
          href="https://www.botivate.in/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-slate-800 dark:text-slate-300 hover:text-slate-950 dark:hover:white transition-colors no-underline"
        >
          Botivate
        </a>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => !isForgotLoading && setShowForgotModal(false)}
          ></div>
          <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-[clamp(300px,90vw,440px)] my-auto overflow-hidden animate-in zoom-in-95 duration-200 border border-blue-50 dark:border-slate-800">
            <div className="bg-gradient-to-br from-blue-50 to-white dark:from-slate-850 dark:to-slate-900 px-6 py-6 text-center">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                {forgotStep === "username" && (
                  <UserIcon className="text-blue-600" size={32} />
                )}
                {forgotStep === "otp" && (
                  <ShieldCheck className="text-blue-600" size={32} />
                )}
                {forgotStep === "reset" && (
                  <KeyRound className="text-blue-600" size={32} />
                )}
              </div>
              <h3 className="text-xl font-black text-gray-900 dark:text-slate-100 leading-tight">
                {forgotStep === "username" && "Find Your Account"}
                {forgotStep === "otp" && "Verify Identity"}
                {forgotStep === "reset" && "Set New Password"}
              </h3>
            </div>

            <div className="px-6 pb-8 space-y-4">
              {forgotStep === "username" && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center px-2">
                    Enter your username. An OTP will be sent to the Admin for
                    verification.
                  </p>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Username"
                      value={forgotData.username}
                      onChange={(e) =>
                        setForgotData({
                          ...forgotData,
                          username: e.target.value,
                        })
                      }
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-850 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                    />
                    <UserIcon
                      className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500"
                      size={18}
                    />
                  </div>
                  <button
                    onClick={async () => {
                      if (!forgotData.username)
                        return showToast("Please enter username", "error");
                      setIsForgotLoading(true);
                      try {
                        const { data, error } = await supabase
                          .from("checklist_users")
                          .select("user_name")
                          .eq("user_name", forgotData.username)
                          .single();
                        if (error || !data)
                          return showToast("User not found", "error");

                        const otp = Math.floor(
                          100000 + Math.random() * 900000,
                        ).toString();
                        await sendPasswordResetOTP(forgotData.username, otp);
                        setForgotData({ ...forgotData, generatedOtp: otp });
                        setForgotStep("otp");
                        showToast("OTP sent to Admin", "success");
                      } catch {
                        showToast("Error processing request", "error");
                      } finally {
                        setIsForgotLoading(false);
                      }
                    }}
                    disabled={isForgotLoading}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isForgotLoading ? (
                      <RefreshCw className="animate-spin" size={18} />
                    ) : (
                      "Send OTP"
                    )}
                  </button>
                  <button
                    onClick={() => setShowForgotModal(false)}
                    className="w-full py-2 text-xs font-bold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {forgotStep === "otp" && (
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3 flex gap-2">
                    <Smartphone
                      className="text-amber-600 dark:text-amber-405 flex-shrink-0"
                      size={16}
                    />
                    <p className="text-[10px] text-amber-800 dark:text-amber-300 font-medium">
                      OTP has been sent to the admin number (). Please contact
                      them for the code.
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Enter 6-digit OTP"
                      value={forgotData.otp}
                      onChange={(e) =>
                        setForgotData({ ...forgotData, otp: e.target.value })
                      }
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-850 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm text-center tracking-[0.5em] font-black text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                      maxLength={6}
                    />
                    <ShieldCheck
                      className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500"
                      size={18}
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (forgotData.otp === forgotData.generatedOtp) {
                        setForgotStep("reset");
                      } else {
                        showToast("Invalid OTP", "error");
                      }
                    }}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
                  >
                    Verify OTP
                  </button>
                  <button
                    onClick={() => setForgotStep("username")}
                    className="w-full py-2 text-xs font-bold text-blue-600 flex items-center justify-center gap-1"
                  >
                    <ArrowLeft size={12} /> Back to Username
                  </button>
                </div>
              )}

              {forgotStep === "reset" && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (forgotData.newPassword !== forgotData.confirmPassword)
                      return showToast("Passwords don't match", "error");
                    if (forgotData.newPassword.length < 4)
                      return showToast("Password too short", "error");

                    setIsForgotLoading(true);
                    try {
                      const { error } = await supabase
                        .from("checklist_users")
                        .update({ password: forgotData.newPassword })
                        .eq("user_name", forgotData.username);
                      if (error) throw error;
                      showToast("Password reset successfully!", "success");
                      setShowForgotModal(false);
                      setForgotStep("username");
                      setForgotData({
                        username: "",
                        otp: "",
                        newPassword: "",
                        confirmPassword: "",
                        generatedOtp: "",
                      });
                    } catch {
                      showToast("Error resetting password", "error");
                    } finally {
                      setIsForgotLoading(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="New Password"
                      required
                      value={forgotData.newPassword}
                      onChange={(e) =>
                        setForgotData({
                          ...forgotData,
                          newPassword: e.target.value,
                        })
                      }
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-850 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                    />
                    <KeyRound
                      className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500"
                      size={18}
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="Confirm New Password"
                      required
                      value={forgotData.confirmPassword}
                      onChange={(e) =>
                        setForgotData({
                          ...forgotData,
                          confirmPassword: e.target.value,
                        })
                      }
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-850 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                    />
                    <ShieldCheck
                      className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500"
                      size={18}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isForgotLoading}
                    className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                  >
                    {isForgotLoading ? (
                      <RefreshCw className="animate-spin" size={18} />
                    ) : (
                      "Update Password"
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
