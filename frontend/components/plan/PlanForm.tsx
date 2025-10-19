"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, DollarSign, Users, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PlanFormProps {
  onSubmit: (data: any) => void;
}

export default function PlanForm({ onSubmit }: PlanFormProps) {
  const [formData, setFormData] = useState({
    destination: "",
    start_date: "",
    end_date: "",
    budget: 2000,
    travelers: 1,
    preferences: {
      interests: [] as string[],
      pace: "moderate",
      accommodation_type: "hotel",
    },
  });

  const interestOptions = [
    "Culture", "Food", "Adventure", "Relaxation", "Nature",
    "Shopping", "History", "Technology", "Art", "Beach"
  ];

  const toggleInterest = (interest: string) => {
    const interests = formData.preferences.interests;
    const newInterests = interests.includes(interest)
      ? interests.filter((i) => i !== interest)
      : [...interests, interest];
    setFormData({
      ...formData,
      preferences: {
        ...formData.preferences,
        interests: newInterests,
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    onSubmit({
      ...formData,
      duration,
      preferences: {
        ...formData.preferences,
        interests: formData.preferences.interests.map(i => i.toLowerCase()),
      },
    });
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
    >
      <Card className="p-10 md:p-12 shadow-2xl border-2 border-slate-800 bg-gradient-to-br from-blue-950/70 via-gray-900/80 to-slate-900/90 backdrop-blur-xl rounded-3xl overflow-hidden">
        <div className="space-y-10">
          {/* Destination */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <Label htmlFor="destination" className="text-xl font-bold mb-3 block text-yellow-300">
              🌍 Where do you want to go?
            </Label>
            <Input
              id="destination"
              placeholder="e.g., Tokyo, Japan"
              value={formData.destination}
              onChange={e => setFormData({ ...formData, destination: e.target.value })}
              className="mt-3 h-14 text-lg border-2 border-yellow-400 focus:border-yellow-600 rounded-xl shadow-sm bg-transparent text-white placeholder:text-yellow-100"
              required
            />
          </motion.div>

          {/* Dates */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { id: "start_date", label: "Start Date" },
              { id: "end_date", label: "End Date" }
            ].map(({ id, label }) => (
              <div key={id}>
                <Label htmlFor={id} className="text-lg font-bold flex items-center mb-3 text-yellow-300">
                  <Calendar className="w-5 h-5 mr-2 text-yellow-400" />
                  {label}
                </Label>
                <Input
                  id={id}
                  type="date"
                  value={(formData as any)[id]}
                  onChange={e => setFormData({ ...formData, [id]: e.target.value })}
                  className="h-14 border-2 border-yellow-400 focus:border-yellow-600 rounded-xl bg-transparent text-white"
                  required
                />
              </div>
            ))}
          </motion.div>

          {/* Budget and Travelers */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="budget" className="text-lg font-bold flex items-center mb-3 text-green-300">
                <DollarSign className="w-5 h-5 mr-2 text-green-300" />
                Budget (USD)
              </Label>
              <Input
                id="budget"
                type="number"
                min={500}
                step={100}
                value={formData.budget}
                onChange={e => setFormData({ ...formData, budget: +e.target.value })}
                className="h-14 border-2 border-yellow-400 focus:border-yellow-600 rounded-xl bg-transparent text-white"
                required
              />
            </div>
            <div>
              <Label htmlFor="travelers" className="text-lg font-bold flex items-center mb-3 text-blue-200">
                <Users className="w-5 h-5 mr-2 text-blue-300" />
                Number of Travelers
              </Label>
              <Input
                id="travelers"
                type="number"
                min={1}
                max={10}
                value={formData.travelers}
                onChange={e => setFormData({ ...formData, travelers: +e.target.value })}
                className="h-14 border-2 border-yellow-400 focus:border-yellow-600 rounded-xl bg-transparent text-white"
                required
              />
            </div>
          </motion.div>

          {/* Interests */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
            <Label className="text-xl font-bold flex items-center mb-5 text-pink-400">
              <Heart className="w-5 h-5 mr-2 text-pink-400" />
              Your Interests
            </Label>
            <div className="flex flex-wrap gap-3">
              {interestOptions.map((interest, idx) => (
                <motion.div key={interest}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + idx * 0.05 }}
                >
                  <Badge
                    variant={formData.preferences.interests.includes(interest) ? "default" : "outline"}
                    className={`cursor-pointer text-sm px-5 py-2.5 rounded-full font-semibold
                      ${formData.preferences.interests.includes(interest)
                        ? "bg-gradient-to-r from-yellow-400 to-pink-400 text-white border-0 shadow-lg"
                        : "border-2 border-yellow-400 hover:border-yellow-600 bg-transparent text-yellow-200"}`}
                    onClick={() => toggleInterest(interest)}
                  >
                    {interest}
                  </Badge>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Trip Pace */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
            <Label className="text-xl font-bold mb-5 block text-yellow-200">⚡ Trip Pace</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { value: "relaxed", emoji: "🌴", desc: "Take it easy" },
                { value: "moderate", emoji: "🚶", desc: "Balanced" },
                { value: "fast-paced", emoji: "🏃", desc: "See it all" },
              ].map((pace) => (
                <motion.div key={pace.value} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
                  <Card
                    className={`p-6 cursor-pointer text-center hover:shadow-xl transition-all border-2 
                    ${formData.preferences.pace === pace.value
                      ? "border-yellow-400 bg-gradient-to-br from-yellow-900/60 to-pink-900/50 shadow-lg"
                      : "hover:border-yellow-300 bg-transparent text-yellow-200"
                    }`}
                    onClick={() =>
                      setFormData({
                        ...formData,
                        preferences: {
                          ...formData.preferences,
                          pace: pace.value,
                        },
                      })
                    }
                  >
                    <div className="text-3xl mb-2">{pace.emoji}</div>
                    <span className="capitalize font-bold text-lg block mb-1">{pace.value}</span>
                    <span className="text-sm text-yellow-200">{pace.desc}</span>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Submit Button */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <Button
              type="submit"
              size="lg"
              className="w-full bg-gradient-to-r from-yellow-400 to-pink-500 hover:from-yellow-500 hover:to-pink-600 text-white font-bold py-8 text-xl rounded-2xl shadow-2xl hover:shadow-glow-hover transform hover:scale-[1.02] transition-all"
            >
              Generate My Travel Plan ✨
            </Button>
          </motion.div>
        </div>
      </Card>
    </motion.form>
  );
}
