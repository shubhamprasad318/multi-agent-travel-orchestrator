"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import PlanForm from "@/components/plan/PlanForm";
import { Loader2, AlertCircle } from "lucide-react";

export default function PlanPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  const agentSteps = [
    { icon: "🔍", text: "Researching destination...", duration: 15000 },
    { icon: "🌤️", text: "Analyzing weather forecasts...", duration: 10000 },
    { icon: "🎯", text: "Curating activities...", duration: 12000 },
    { icon: "📅", text: "Optimizing itinerary...", duration: 20000 },
    { icon: "✈️", text: "Finding best bookings...", duration: 15000 },
    { icon: "✅", text: "Validating your plan...", duration: 8000 },
  ];

  const handleSubmit = async (formData: any) => {
    setIsLoading(true);
    setError(null);
    setCurrentStep(0);

    // Progress through steps
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < agentSteps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 15000);
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      clearInterval(stepInterval);

      if (response.ok) {
        const data = await response.json();
        
        if (!data || typeof data !== 'object') {
          throw new Error("Invalid response from server");
        }

        sessionStorage.setItem("travelPlan", JSON.stringify({
          ...data,
          generated_at: new Date().toISOString(),
          query: formData
        }));
        
        setCurrentStep(agentSteps.length - 1);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        router.push("/results");
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }
    } catch (error: any) {
      clearInterval(stepInterval);
      console.error("Error:", error);
      
      let errorMessage = "Failed to create travel plan. ";
      
      if (error.message.includes("Failed to fetch")) {
        errorMessage += "Unable to reach the server. Please check your internet connection.";
      } else if (error.message.includes("timeout")) {
        errorMessage += "Request timed out. The server might be busy. Please try again.";
      } else {
        errorMessage += error.message || "Please try again.";
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setCurrentStep(0);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-16 relative overflow-hidden">
      {/* Enhanced Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMyMCAwIDM2IDE2IDM2IDM2cy0xNiAzNi0zNiAzNi0zNi0xNi0zNi0zNiAxNi0zNiAzNi0zNnoiIHN0cm9rZT0iIzhCNUNGNiIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30" />
      
      <div className="container relative z-10 mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-block mb-4"
            >
              <span className="text-purple-600 dark:text-purple-400 font-bold text-sm tracking-widest uppercase">
                Start Your Journey
              </span>
            </motion.div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold mb-6 leading-tight">
              Plan Your <span className="gradient-text">Perfect Trip</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Tell us about your dream destination and let our 6 specialized AI agents create
              the perfect itinerary tailored just for you
            </p>
          </div>

          {/* Error Alert - Custom Design */}
          {error && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              </div>
            </motion.div>
          )}

          {isLoading ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-dark p-8 md:p-16 rounded-3xl text-center shadow-2xl border-2 border-purple-200/20"
            >
              <div className="relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full blur-2xl opacity-30 animate-pulse" />
                </div>
                <Loader2 className="w-16 h-16 md:w-20 md:h-20 animate-spin mx-auto mb-6 text-purple-500 relative z-10" />
              </div>
              
              <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-3 text-white">
                AI Agents Are Working Their Magic...
              </h3>
              <p className="text-white/80 text-base md:text-lg mb-8 md:mb-10">
                This usually takes 60-90 seconds ⏱️
              </p>
              
              {/* Progress bar */}
              <div className="max-w-md mx-auto mb-8">
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    initial={{ width: "0%" }}
                    animate={{ width: `${((currentStep + 1) / agentSteps.length) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className="text-white/60 text-sm mt-2">
                  Step {currentStep + 1} of {agentSteps.length}
                </p>
              </div>
              
              <div className="max-w-md mx-auto space-y-3 md:space-y-4">
                {agentSteps.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ 
                      opacity: i <= currentStep ? 1 : 0.4, 
                      x: 0,
                      scale: i === currentStep ? 1.02 : 1
                    }}
                    transition={{ 
                      delay: i * 0.1, 
                      duration: 0.5,
                      scale: { duration: 0.3 }
                    }}
                    className={`flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border transition-all ${
                      i === currentStep 
                        ? 'bg-white/20 border-white/30 shadow-lg' 
                        : i < currentStep
                        ? 'bg-white/10 border-white/10'
                        : 'bg-white/5 border-white/5'
                    }`}
                  >
                    <span className="text-xl md:text-2xl">{step.icon}</span>
                    <span className={`font-medium text-left text-sm md:text-base ${
                      i <= currentStep ? 'text-white' : 'text-white/50'
                    }`}>
                      {step.text}
                    </span>
                    {i < currentStep && (
                      <span className="ml-auto text-green-400">✓</span>
                    )}
                    {i === currentStep && (
                      <Loader2 className="ml-auto w-4 h-4 animate-spin text-purple-400" />
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Tips section */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 5 }}
                className="mt-8 p-4 bg-white/5 rounded-lg border border-white/10"
              >
                <p className="text-white/60 text-sm">
                  💡 <strong className="text-white/80">Tip:</strong> Our AI is analyzing live data 
                  from multiple sources to create the best plan for you
                </p>
              </motion.div>
            </motion.div>
          ) : (
            <PlanForm onSubmit={handleSubmit} />
          )}
        </motion.div>
      </div>
    </div>
  );
}
