"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import TravelPlanDisplay from "@/components/results/TravelPlanDisplay";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2, Share2, Calendar } from "lucide-react";
import Link from "next/link";

export default function ResultsPage() {
  const [plan, setPlan] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const storedPlan = sessionStorage.getItem("travelPlan");
    if (storedPlan) {
      try {
        setPlan(JSON.parse(storedPlan));
      } catch (error) {
        console.error("Failed to parse travel plan:", error);
        router.push("/plan");
      }
    } else {
      router.push("/plan");
    }
  }, [router]);

  const handleExportPDF = async () => {
    if (!plan) return;

    setIsExporting(true);
    try {
      // Use browser's native print functionality
      // Users can save as PDF through print dialog
      setTimeout(() => {
        window.print();
        setIsExporting(false);
      }, 100); // Small delay to show loading state
    } catch (error: any) {
      console.error("Export error:", error);
      alert("Failed to export PDF. Please try again or use your browser's print function (Ctrl+P).");
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    if (!plan) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Travel Plan to ${plan.destination || 'destination'}`,
          text: `Check out my travel plan to ${plan.destination || 'destination'}!`,
          url: window.location.href,
        });
      } else {
        // Fallback: Copy to clipboard
        await navigator.clipboard.writeText(window.location.href);
        alert("Link copied to clipboard!");
      }
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  if (!plan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-purple-500" />
          <p className="text-muted-foreground">Loading your travel plan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 relative overflow-hidden">
      {/* Enhanced Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMyMCAwIDM2IDE2IDM2IDM2cy0xNiAzNi0zNiAzNi0zNi0xNi0zNi0zNiAxNi0zNiAzNi0zNnoiIHN0cm9rZT0iIzhCNUNGNiIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30" />
      
      <div className="container relative z-10 mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
            <div className="flex-1">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-block mb-3"
              >
                <span className="text-purple-600 dark:text-purple-400 font-bold text-sm tracking-widest uppercase">
                  Your Journey
                </span>
              </motion.div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-3 leading-tight">
                Your <span className="gradient-text">Perfect Trip</span> Awaits!
              </h1>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
                <p className="text-base md:text-lg text-muted-foreground flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Created by 6 AI agents working in harmony
                </p>
                {plan.generated_at && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {new Date(plan.generated_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 no-print">
              <Link href="/plan">
                <Button 
                  variant="outline" 
                  className="gap-2 h-11 px-5 border-2 hover:border-purple-400 rounded-xl font-semibold transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  New Plan
                </Button>
              </Link>
              
              <Button 
                onClick={handleShare}
                variant="outline"
                className="gap-2 h-11 px-5 border-2 hover:border-blue-400 rounded-xl font-semibold transition-all"
              >
                <Share2 className="w-4 h-4" />
                Share
              </Button>

              <Button 
                onClick={handleExportPDF}
                disabled={isExporting}
                className="gap-2 h-11 px-5 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export PDF
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Trip Summary Card */}
          {plan.query && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-6 rounded-2xl mb-8 border-2 border-purple-200/20"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Destination</p>
                  <p className="font-bold text-lg">{plan.query.destination || plan.destination}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Duration</p>
                  <p className="font-bold text-lg">{plan.query.duration || plan.duration} days</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Budget</p>
                  <p className="font-bold text-lg">${plan.query.budget || plan.budget}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Travelers</p>
                  <p className="font-bold text-lg">{plan.query.travelers || plan.travelers} {(plan.query.travelers || plan.travelers) === 1 ? 'person' : 'people'}</p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>

        <TravelPlanDisplay plan={plan} />
      </div>
    </div>
  );
}
