"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  Brain,
  Sparkles,
  Calendar,
  MapPin,
  DollarSign,
  CloudSun,
} from "lucide-react";
import { Card } from "@/components/ui/card";

export default function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const features = [
    {
      icon: Brain,
      title: "AI Research Agent",
      description:
        "Comprehensive destination research with real-time data and cultural insights",
      gradient: "from-purple-500 to-pink-500",
    },
    {
      icon: Calendar,
      title: "Smart Itinerary Planning",
      description:
        "Optimized day-by-day schedules that maximize experiences and minimize travel time",
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      icon: DollarSign,
      title: "Booking Optimization",
      description:
        "Compare flights and hotels to find the best deals within your budget",
      gradient: "from-green-500 to-emerald-500",
    },
    {
      icon: CloudSun,
      title: "Weather Integration",
      description:
        "Real-time weather forecasts with activity recommendations and packing lists",
      gradient: "from-yellow-500 to-orange-500",
    },
    {
      icon: MapPin,
      title: "Activity Curation",
      description:
        "Discover hidden gems and unique experiences tailored to your interests",
      gradient: "from-red-500 to-pink-500",
    },
    {
      icon: Sparkles,
      title: "Quality Validation",
      description:
        "AI-powered validation ensures your plan is feasible, safe, and optimized",
      gradient: "from-indigo-500 to-purple-500",
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <section ref={ref} className="py-32 bg-gradient-to-br from-slate-50 via-white to-purple-50" id="features">
      <div className="container mx-auto px-4">
        {/* Modern Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="inline-block mb-4"
          >
            <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent font-bold text-sm tracking-widest uppercase">
              Features
            </span>
          </motion.div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 leading-tight">
            Powered by{" "}
            <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600 bg-clip-text text-transparent">
              6 Specialized AI Agents
            </span>
          </h2>
          <p className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed font-light">
            Each agent is an expert in their domain, working together to create
            your perfect travel experience
          </p>
        </motion.div>

        {/* Modern Features Grid - Much smaller width */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto"
        >
          {features.map((feature, index) => (
            <motion.div 
              key={index} 
              variants={itemVariants}
              whileHover={{ y: -8, scale: 1.02 }}
              className="group"
            >
              <div className="relative h-full">
                {/* Glow Effect */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} rounded-2xl blur-lg opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />
                
                {/* Card - Much smaller width */}
                <Card className="relative p-5 h-full bg-white/90 backdrop-blur-xl border border-slate-200/50 hover:border-purple-300/50 transition-all duration-500 shadow-lg hover:shadow-xl rounded-2xl overflow-hidden max-w-sm mx-auto">
                  {/* Background Pattern */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="relative z-10 text-center">
                    {/* Modern Icon Container - Smaller */}
                    <div className="relative mb-6 flex justify-center">
                      <div className="relative">
                        {/* Icon Glow */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} rounded-2xl blur-md opacity-30 group-hover:opacity-50 transition-opacity duration-300`} />
                        
                        {/* Icon - Smaller */}
                        <div
                          className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-xl`}
                        >
                          <feature.icon className="w-8 h-8 text-white" />
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <h3 className="text-xl font-bold mb-3 text-slate-800 group-hover:bg-gradient-to-r group-hover:from-purple-600 group-hover:to-pink-600 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
                      {feature.title}
                    </h3>
                    <p className="text-slate-600 leading-relaxed text-sm font-light">
                      {feature.description}
                    </p>
                  </div>
                </Card>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
