"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Calendar, 
  MapPin, 
  Cloud, 
  Compass, 
  Plane, 
  Hotel,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Sparkles,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TravelPlanDisplayProps {
  plan: any;
}

export default function TravelPlanDisplay({ plan }: TravelPlanDisplayProps) {
  const [activeTab, setActiveTab] = useState("itinerary");

  console.log("Full plan data:", plan);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-8"
    >
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ y: -5 }}
        >
          <Card className="p-6 border-2 hover:border-blue-300 transition-all hover:shadow-xl bg-gradient-to-br from-blue-50 to-cyan-50">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-600 mb-2">Destination</p>
                <p className="text-2xl font-extrabold text-blue-900">
                  {plan?.destination || plan?.query?.destination || 'N/A'}
                </p>
              </div>
              <div className="p-3 bg-blue-500 rounded-2xl shadow-lg">
                <MapPin className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ y: -5 }}
        >
          <Card className="p-6 border-2 hover:border-purple-300 transition-all hover:shadow-xl bg-gradient-to-br from-purple-50 to-pink-50">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-purple-600 mb-2">Duration</p>
                <p className="text-2xl font-extrabold text-purple-900">
                  {plan?.duration || plan?.query?.duration || 'N/A'} Days
                </p>
              </div>
              <div className="p-3 bg-purple-500 rounded-2xl shadow-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileHover={{ y: -5 }}
        >
          <Card className="p-6 border-2 hover:border-green-300 transition-all hover:shadow-xl bg-gradient-to-br from-green-50 to-emerald-50">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-green-600 mb-2">Budget</p>
                <p className="text-2xl font-extrabold text-green-900">
                  ${typeof plan?.budget === 'object' ? plan?.budget?.total : plan?.budget || plan?.query?.budget || 'N/A'}
                </p>
              </div>
              <div className="p-3 bg-green-500 rounded-2xl shadow-lg">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          whileHover={{ y: -5 }}
        >
          <Card className="p-6 border-2 hover:border-emerald-300 transition-all hover:shadow-xl bg-gradient-to-br from-emerald-50 to-teal-50">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-600 mb-2">Status</p>
                <Badge className="text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-500 border-0 px-4 py-1">
                  ✓ Ready
                </Badge>
              </div>
              <div className="p-3 bg-emerald-500 rounded-2xl shadow-lg">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Main Content Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 p-2 bg-white/80 backdrop-blur-sm h-auto gap-2 shadow-lg rounded-2xl">
            <TabsTrigger value="itinerary" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white font-semibold py-3 rounded-xl">
              📅 Itinerary
            </TabsTrigger>
            <TabsTrigger value="bookings" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white font-semibold py-3 rounded-xl">
              ✈️ Bookings
            </TabsTrigger>
            <TabsTrigger value="weather" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white font-semibold py-3 rounded-xl">
              🌤️ Weather
            </TabsTrigger>
            <TabsTrigger value="activities" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white font-semibold py-3 rounded-xl">
              🎯 Activities
            </TabsTrigger>
            <TabsTrigger value="validation" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white font-semibold py-3 rounded-xl">
              ✅ Validation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="itinerary" className="mt-8">
            <ItinerarySection data={plan?.itinerary} />
          </TabsContent>

          <TabsContent value="bookings" className="mt-8">
            <BookingsSection data={plan?.bookings} />
          </TabsContent>

          <TabsContent value="weather" className="mt-8">
            <WeatherSection data={plan?.weather_forecast || plan?.weather} />
          </TabsContent>

          <TabsContent value="activities" className="mt-8">
            <ActivitiesSection data={plan?.activities} research={plan?.research_data} />
          </TabsContent>

          <TabsContent value="validation" className="mt-8">
            <ValidationSection data={plan?.validation_results || plan?.validation} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}

// Itinerary Section
function ItinerarySection({ data }: { data: any }) {
  console.log("Itinerary data:", data);
  
  if (!data) {
    return <EmptyState message="No itinerary data available" />;
  }

  let itineraryData = data;
  
  // Check if we need to parse raw_response
  const needsParsing = data.raw_response && (!data.days || data.days.length === 0);
  
  if (needsParsing) {
    try {
      let cleanData = data.raw_response.trim();
      
      // Remove markdown code blocks
      const tick = String.fromCharCode(96);
      const mdStart = tick + tick + tick;
      cleanData = cleanData.split(mdStart + 'json').join('');
      cleanData = cleanData.split(mdStart).join('');
      
      // Remove JavaScript comments (single and multi-line)
      cleanData = cleanData.replace(/\/\/.*$/gm, ''); // Remove single-line comments
      cleanData = cleanData.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments
      
      // Remove trailing commas before closing braces/brackets
      cleanData = cleanData.replace(/,(\s*[}\]])/g, '$1');
      
      cleanData = cleanData.trim();
      
      const parsed = JSON.parse(cleanData);
      
      itineraryData = {
        ...data,
        days: parsed.days || data.days || [],
        summary: parsed.summary || data.summary
      };
      
      console.log("✅ Successfully parsed itinerary");
      console.log("Days:", itineraryData.days.length);
    } catch (e: any) {
      console.error("❌ Failed to parse itinerary:", e.message);
      
      // Try to extract partial data if possible
      if (data.parse_error) {
        return (
          <Card className="p-8 md:p-10 shadow-xl border-2 bg-red-50">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <h3 className="text-2xl font-bold text-red-700">Parsing Error</h3>
            </div>
            <p className="text-gray-700 mb-4">
              Unable to parse itinerary data due to formatting issues.
            </p>
            <details className="bg-white p-4 rounded-lg border">
              <summary className="font-semibold cursor-pointer">Error Details</summary>
              <pre className="text-sm mt-2 overflow-x-auto">{data.parse_error}</pre>
            </details>
          </Card>
        );
      }
    }
  }

  const days = itineraryData?.days || itineraryData?.daily_itinerary || [];

  if (!Array.isArray(days) || days.length === 0) {
    return <EmptyState message="No itinerary data available" />;
  }

  return (
    <Card className="p-8 md:p-10 shadow-xl border-2 bg-white/80 backdrop-blur-sm">
      <h3 className="text-3xl md:text-4xl font-extrabold mb-8 flex items-center gap-3">
        <span className="text-4xl">📅</span>
        Day-by-Day Itinerary
      </h3>
      {days.map((day: any, index: number) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="mb-8 last:mb-0"
        >
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center text-white font-extrabold text-2xl shadow-lg">
              {day.day || index + 1}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h4 className="text-2xl font-bold">{day.theme || `Day ${index + 1}`}</h4>
                {day.date && (
                  <Badge variant="outline" className="text-sm font-semibold border-2 px-3 py-1">
                    {day.date}
                  </Badge>
                )}
              </div>
              <div className="space-y-4">
                {day.morning && (
                  <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-5 rounded-2xl border-l-4 border-orange-500">
                    <p className="font-bold text-orange-700 mb-2 flex items-center gap-2">
                      <span>🌅</span> Morning
                      {typeof day.morning === 'object' && day.morning.time && (
                        <span className="text-sm font-normal">({day.morning.time})</span>
                      )}
                    </p>
                    <p className="text-gray-700">
                      {typeof day.morning === 'object' ? day.morning.activity : day.morning}
                    </p>
                    {typeof day.morning === 'object' && day.morning.location && (
                      <p className="text-sm text-gray-600 mt-2">📍 {day.morning.location}</p>
                    )}
                    {typeof day.morning === 'object' && day.morning.cost_estimate !== undefined && (
                      <p className="text-sm font-semibold text-green-700 mt-2">
                        💰 ${day.morning.cost_estimate}
                      </p>
                    )}
                  </div>
                )}
                {day.afternoon && (
                  <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-5 rounded-2xl border-l-4 border-blue-500">
                    <p className="font-bold text-blue-700 mb-2 flex items-center gap-2">
                      <span>☀️</span> Afternoon
                      {typeof day.afternoon === 'object' && day.afternoon.time && (
                        <span className="text-sm font-normal">({day.afternoon.time})</span>
                      )}
                    </p>
                    <p className="text-gray-700">
                      {typeof day.afternoon === 'object' ? day.afternoon.activity : day.afternoon}
                    </p>
                    {typeof day.afternoon === 'object' && day.afternoon.location && (
                      <p className="text-sm text-gray-600 mt-2">📍 {day.afternoon.location}</p>
                    )}
                    {typeof day.afternoon === 'object' && day.afternoon.cost_estimate !== undefined && (
                      <p className="text-sm font-semibold text-green-700 mt-2">
                        💰 ${day.afternoon.cost_estimate}
                      </p>
                    )}
                  </div>
                )}
                {day.evening && (
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-5 rounded-2xl border-l-4 border-purple-500">
                    <p className="font-bold text-purple-700 mb-2 flex items-center gap-2">
                      <span>🌙</span> Evening
                      {typeof day.evening === 'object' && day.evening.time && (
                        <span className="text-sm font-normal">({day.evening.time})</span>
                      )}
                    </p>
                    <p className="text-gray-700">
                      {typeof day.evening === 'object' ? day.evening.activity : day.evening}
                    </p>
                    {typeof day.evening === 'object' && day.evening.location && (
                      <p className="text-sm text-gray-600 mt-2">📍 {day.evening.location}</p>
                    )}
                    {typeof day.evening === 'object' && day.evening.cost_estimate !== undefined && (
                      <p className="text-sm font-semibold text-green-700 mt-2">
                        💰 ${day.evening.cost_estimate}
                      </p>
                    )}
                  </div>
                )}
              </div>
              
              {/* Meals Section */}
              {day.meals && Array.isArray(day.meals) && day.meals.length > 0 && (
                <div className="mt-4 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border-2 border-yellow-200">
                  <p className="font-bold text-yellow-800 mb-2">🍽️ Meals</p>
                  <div className="space-y-2">
                    {day.meals.map((meal: any, mealIdx: number) => (
                      <div key={mealIdx} className="text-sm">
                        <span className="font-semibold capitalize">{meal.type}:</span> {meal.restaurant}
                        {meal.cuisine && ` (${meal.cuisine})`}
                        {meal.cost_estimate !== undefined && ` - $${meal.cost_estimate}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Backup Options */}
              {day.backup_options && Array.isArray(day.backup_options) && day.backup_options.length > 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-xl border-2 border-gray-200">
                  <p className="font-bold text-gray-700 mb-2">🔄 Backup Options</p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                    {day.backup_options.map((option: string, optIdx: number) => (
                      <li key={optIdx}>{option}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {day.total_cost !== undefined && (
                <div className="mt-4">
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100 font-bold px-4 py-2">
                    💰 Daily Cost: ${day.total_cost}
                  </Badge>
                </div>
              )}
            </div>
          </div>
          {index < days.length - 1 && <div className="my-6 border-b border-gray-200" />}
        </motion.div>
      ))}
      
      {/* Summary Section */}
      {itineraryData.summary && (
        <div className="mt-8 p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border-2 border-indigo-200">
          <h4 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <span>📋</span> Trip Summary
          </h4>
          
          {itineraryData.summary.total_budget_used !== undefined && (
            <div className="mb-4">
              <p className="text-lg">
                <span className="font-semibold">Total Budget Used:</span> 
                <span className="text-2xl font-bold text-green-600 ml-2">
                  ${itineraryData.summary.total_budget_used}
                </span>
              </p>
            </div>
          )}
          
          {itineraryData.summary.highlights && Array.isArray(itineraryData.summary.highlights) && (
            <div className="mb-4">
              <p className="font-semibold mb-2">✨ Highlights:</p>
              <ul className="list-disc list-inside space-y-1">
                {itineraryData.summary.highlights.map((highlight: string, idx: number) => (
                  <li key={idx} className="text-gray-700">{highlight}</li>
                ))}
              </ul>
            </div>
          )}
          
          {itineraryData.summary.tips && Array.isArray(itineraryData.summary.tips) && (
            <div>
              <p className="font-semibold mb-2">💡 Travel Tips:</p>
              <ul className="list-disc list-inside space-y-1">
                {itineraryData.summary.tips.map((tip: string, idx: number) => (
                  <li key={idx} className="text-gray-700">{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}


// Bookings Section
function BookingsSection({ data }: { data: any }) {
  console.log("Bookings data:", data);
  
  if (!data) {
    return <EmptyState message="No booking data available" />;
  }

  let bookingsData = data;
  
  const needsParsing = data.raw_response && (
    (!data.flights || data.flights.length === 0) || 
    (!data.accommodations || data.accommodations.length === 0)
  );
  
  if (needsParsing) {
    try {
      let cleanData = data.raw_response.trim();
      
      // Use character codes to avoid backtick syntax issues
      const tick = String.fromCharCode(96);
      const mdStart = tick + tick + tick;
      
      cleanData = cleanData.split(mdStart + 'json').join('');
      cleanData = cleanData.split(mdStart).join('');
      cleanData = cleanData.trim();
      
      const parsed = JSON.parse(cleanData);
      
      bookingsData = {
        ...data,
        flights: parsed.flights || data.flights || [],
        accommodations: parsed.accommodations || data.accommodations || [],
      };
      
      console.log("✅ Successfully parsed bookings");
      console.log("Flights:", bookingsData.flights.length);
      console.log("Accommodations:", bookingsData.accommodations.length);
    } catch (e: any) {
      console.error("❌ Failed to parse bookings:", e.message);
    }
  }

  const flights = bookingsData?.flights || [];
  const accommodations = bookingsData?.accommodations || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Card className="p-8 shadow-xl border-2 bg-white/80 backdrop-blur-sm">
        <h3 className="text-3xl font-extrabold mb-6 flex items-center gap-3">
          <span className="text-3xl">✈️</span> Flight Options
        </h3>
        {flights.length > 0 ? (
          <div className="space-y-4">
            {flights.slice(0, 3).map((flight: any, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="border-2 rounded-2xl p-6 hover:border-purple-300 hover:shadow-lg transition-all bg-gradient-to-br from-blue-50/50 to-cyan-50/50"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <p className="font-bold text-lg">{flight.airline || flight.title || "Flight Option"}</p>
                    {flight.duration && (
                      <p className="text-sm text-gray-600 mt-1">⏱️ {flight.duration}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-green-600">
                      {flight.currency === "INR" ? "₹" : "$"}
                      {flight.price || flight.estimated_price || "N/A"}
                    </p>
                    {flight.currency && (
                      <p className="text-xs text-gray-500">{flight.currency}</p>
                    )}
                  </div>
                </div>
                
                <div className="text-sm text-gray-700 space-y-1 mb-3">
                  {flight.stops !== undefined && (
                    <p>🛬 {flight.stops === 0 ? "Non-stop" : `${flight.stops} stop(s)`}</p>
                  )}
                </div>

                {(flight.booking_link || flight.link) && (
                  <a
                    href={flight.booking_link || flight.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Book Now <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState message="No flight options available" />
        )}
      </Card>

      <Card className="p-8 shadow-xl border-2 bg-white/80 backdrop-blur-sm">
        <h3 className="text-3xl font-extrabold mb-6 flex items-center gap-3">
          <span className="text-3xl">🏨</span> Accommodation
        </h3>
        {accommodations.length > 0 ? (
          <div className="space-y-4">
            {accommodations.slice(0, 3).map((hotel: any, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="border-2 rounded-2xl p-6 hover:border-purple-300 hover:shadow-lg transition-all bg-gradient-to-br from-purple-50/50 to-pink-50/50"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <p className="font-bold text-lg">{hotel.name || hotel.title || "Hotel"}</p>
                    {hotel.location && (
                      <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                        📍 {hotel.location}
                      </p>
                    )}
                    {hotel.type && (
                      <Badge className="mt-2 bg-purple-100 text-purple-800 hover:bg-purple-100">
                        {hotel.type}
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-green-600">
                      ${hotel.total_price || hotel.price_per_night || hotel.estimated_price || "N/A"}
                    </p>
                    {hotel.price_per_night && hotel.total_price && (
                      <p className="text-xs text-gray-500">
                        ${hotel.price_per_night}/night
                      </p>
                    )}
                  </div>
                </div>

                {hotel.rating && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold">⭐ {hotel.rating}</span>
                    {hotel.reviews_count && (
                      <span className="text-xs text-gray-500">
                        ({hotel.reviews_count} reviews)
                      </span>
                    )}
                  </div>
                )}

                {hotel.amenities && hotel.amenities.length > 0 && (
                  <div className="mb-3">
                    <div className="flex flex-wrap gap-1 mt-1">
                      {hotel.amenities.slice(0, 3).map((amenity: string, j: number) => (
                        <Badge key={j} variant="outline" className="text-xs">
                          {amenity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(hotel.booking_link || hotel.link) && (
                  <a
                    href={hotel.booking_link || hotel.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 text-sm font-medium"
                  >
                    Book Now <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState message="No accommodation options available" />
        )}
      </Card>
    </div>
  );
}

// Weather Section
function WeatherSection({ data }: { data: any }) {
  console.log("Weather data received:", data);
  
  if (!data || typeof data !== 'object') {
    return <EmptyState message="Weather data not available" />;
  }

  const current = data?.current_conditions || data?.current_weather;
  const forecastData = data?.forecast_data || data?.forecast || {};
  const forecast = forecastData?.daily || data?.daily || [];

  return (
    <Card className="p-8 md:p-10 shadow-xl border-2 bg-white/80 backdrop-blur-sm">
      <h3 className="text-3xl md:text-4xl font-extrabold mb-8 flex items-center gap-3">
        <Cloud className="w-9 h-9 text-blue-500" /> Weather Forecast
      </h3>

      {current && (
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-8 rounded-3xl border-2 border-blue-200 mb-8">
          <h4 className="text-2xl font-bold mb-4">Current in {current.location}</h4>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-5xl font-bold">{current.temperature?.current}°C</p>
              <p className="text-lg capitalize mt-2">{current.conditions?.description}</p>
            </div>
            <div className="text-right">
              <p className="text-sm">💨 {current.details?.wind_speed} km/h</p>
              <p className="text-sm">💧 {current.details?.humidity}%</p>
            </div>
          </div>
        </div>
      )}

      {Array.isArray(forecast) && forecast.length > 0 && (
        <div>
          <h4 className="text-2xl font-bold mb-4">Forecast</h4>
          <div className="grid gap-4">
            {forecast.map((day: any, i: number) => (
              <div key={i} className="bg-white p-6 rounded-2xl border-2">
                <div className="flex justify-between items-center">
                  <div>
                    <h5 className="font-bold text-lg">{day.day_name}</h5>
                    <p className="text-sm text-gray-600">{day.date}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold">{day.temperature?.max}°C</p>
                    <p className="text-sm">Low: {day.temperature?.min}°C</p>
                  </div>
                  <Badge>{day.travel_suitability?.rating || 'N/A'}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!current && (!forecast || forecast.length === 0) && (
        <EmptyState message="No weather data available" />
      )}
    </Card>
  );
}

// Activities Section  
function ActivitiesSection({ data, research }: { data: any; research: any }) {
  console.log("Activities data:", data);
  
  let activities = data || research;
  
  if (!activities) {
    return <EmptyState message="No activities data available" />;
  }

  if (activities.raw_response && !activities.must_do_unique_experiences) {
    try {
      let cleanData = activities.raw_response.trim();
      
      const tick = String.fromCharCode(96);
      const mdStart = tick + tick + tick;
      
      cleanData = cleanData.split(mdStart + 'json').join('');
      cleanData = cleanData.split(mdStart).join('');
      cleanData = cleanData.trim();
      
      const parsed = JSON.parse(cleanData);
      activities = parsed;
      
      console.log("✅ Successfully parsed activities raw_response");
    } catch (e) {
      console.error("❌ Failed to parse activities:", e);
      return <EmptyState message="Error parsing activities data" />;
    }
  }

  const normalizeKey = (obj: any, possibleKeys: string[]) => {
    for (const key of possibleKeys) {
      if (obj[key]) return obj[key];
      const foundKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
      if (foundKey) return obj[foundKey];
    }
    return null;
  };

  const categories = [
    { 
      key: 'must_do_unique_experiences', 
      possibleKeys: ['must_do_unique_experiences', 'MustDoUniqueExperiences', 'Must-do Unique Experiences'],
      title: 'Must-Do Experiences', 
      icon: '🌟' 
    },
    { 
      key: 'food_experiences_and_culinary_tours', 
      possibleKeys: ['food_experiences_and_culinary_tours', 'FoodExperiencesAndCulinaryTours', 'Food Experiences and Culinary Tours'],
      title: 'Food & Dining', 
      icon: '🍽️' 
    },
    { 
      key: 'hidden_gems_and_local_favorites', 
      possibleKeys: ['hidden_gems_and_local_favorites', 'HiddenGemsAndLocalFavorites', 'Hidden Gems and Local Favorites'],
      title: 'Hidden Gems', 
      icon: '💎' 
    },
    { 
      key: 'evening_entertainment_options', 
      possibleKeys: ['evening_entertainment_options', 'EveningEntertainmentOptions', 'Evening Entertainment Options'],
      title: 'Evening Entertainment', 
      icon: '🎭' 
    },
    { 
      key: 'day_trip_opportunities', 
      possibleKeys: ['day_trip_opportunities', 'DayTripOpportunities', 'Day Trip Opportunities'],
      title: 'Day Trips', 
      icon: '🚗' 
    },
    { 
      key: 'cultural_immersion_activities', 
      possibleKeys: ['cultural_immersion_activities', 'CulturalImmersionActivities', 'Cultural Immersion Activities'],
      title: 'Cultural Activities', 
      icon: '🎎' 
    },
    { 
      key: 'photography_spots', 
      possibleKeys: ['photography_spots', 'PhotographySpots', 'Photography Spots'],
      title: 'Photo Spots', 
      icon: '📸' 
    },
    { 
      key: 'relaxation_and_wellness_options', 
      possibleKeys: ['relaxation_and_wellness_options', 'RelaxationAndWellnessOptions', 'Relaxation and Wellness Options'],
      title: 'Wellness & Relaxation', 
      icon: '🧘' 
    }
  ];

  const hasAnyActivities = categories.some(cat => {
    const items = normalizeKey(activities, cat.possibleKeys);
    return Array.isArray(items) && items.length > 0;
  });

  if (!hasAnyActivities) {
    return <EmptyState message="No activities data available" />;
  }

  return (
    <Card className="p-8 md:p-10 shadow-xl border-2 bg-white/80 backdrop-blur-sm">
      <h3 className="text-3xl md:text-4xl font-extrabold mb-8 flex items-center gap-3">
        <Sparkles className="w-9 h-9 text-purple-500" /> Recommended Activities
      </h3>

      <div className="space-y-8">
        {categories.map((category) => {
          const items = normalizeKey(activities, category.possibleKeys);
          if (!Array.isArray(items) || items.length === 0) return null;

          return (
            <div key={category.key}>
              <h4 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <span>{category.icon}</span>
                {category.title}
              </h4>
              <div className="grid gap-4">
                {items.map((activity: any, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white p-6 rounded-2xl border-2 hover:border-purple-300 transition-all hover:shadow-lg"
                  >
                    <h5 className="text-xl font-bold mb-2">
                      {activity.title || activity.name || 'Activity'}
                    </h5>
                    <p className="text-gray-700 mb-3">{activity.description}</p>
                    {activity.link && (
                      <a 
                        href={activity.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 text-sm font-medium"
                      >
                        Learn More <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Validation Section - FIXED BUDGET STATUS
function ValidationSection({ data }: { data: any }) {
  console.log("Validation data:", data);

  if (!data) {
    return <EmptyState message="No validation data available" />;
  }

  // Parse raw_response if needed
  let validationData = data;

  if (data.raw_response && !data.overall_score) {
    try {
      let cleanData = data.raw_response.trim();
      const tick = String.fromCharCode(96);
      const mdStart = tick + tick + tick;
      cleanData = cleanData.split(mdStart + 'json').join('');
      cleanData = cleanData.split(mdStart).join('');
      cleanData = cleanData.trim();

      const parsed = JSON.parse(cleanData);
      validationData = { ...data, ...parsed };
      console.log("✅ Successfully parsed validation data");
    } catch (e: any) {
      console.error("❌ Failed to parse validation:", e.message);
    }
  }

  // ============================================================================
  // FIXED: Get budget status from backend validation results
  // ============================================================================
  const getBudgetStatusFromBackend = () => {
    // Try multiple possible locations where budget_status might be
    const budgetStatus = validationData.budget_status ||           // Direct field
                         validationData.budget_details?.status ||   // Nested in budget_details
                         null;

    console.log("Budget status found:", budgetStatus);
    console.log("Budget details:", validationData.budget_details);

    if (budgetStatus) {
      // Use backend-provided status
      const statusMap: Record<string, { status: string; color: string }> = {
        'Within Budget': { status: 'Within Budget', color: 'green' },
        'Slightly Over': { status: 'Slightly Over', color: 'yellow' },
        'Over Budget': { status: 'Over Budget', color: 'red' },
        'Unknown': { status: 'Unknown', color: 'gray' }
      };

      return statusMap[budgetStatus] || { status: budgetStatus, color: 'gray' };
    }

    // Fallback: Calculate from budget_details if status not provided
    const budgetDetails = validationData.budget_details;
    if (budgetDetails) {
      const userBudget = budgetDetails.user_budget || 0;
      const estimatedCost = budgetDetails.estimated_cost || 0;

      if (estimatedCost === 0) {
        return { status: 'Unknown', color: 'gray' };
      }

      const variance = budgetDetails.variance || 0;

      if (estimatedCost <= userBudget) {
        return { status: 'Within Budget', color: 'green', percentage: ((estimatedCost / userBudget) * 100).toFixed(1) };
      } else if (variance <= 0.15) { // 15% tolerance
        return { status: 'Slightly Over', color: 'yellow', percentage: ((estimatedCost / userBudget) * 100).toFixed(1) };
      } else {
        return { status: 'Over Budget', color: 'red', percentage: ((estimatedCost / userBudget) * 100).toFixed(1) };
      }
    }

    // Final fallback: Unknown
    return { status: 'Unknown', color: 'gray' };
  };

  // ============================================================================
  // Get approval status from backend
  // ============================================================================
  const getApprovalStatus = () => {
    const backendStatus = validationData.status;
    const isApproved = validationData.is_approved;
    const score = validationData.overall_score || 0;

    // Use backend status if available
    if (backendStatus === 'Approved' || isApproved === true) {
      return { 
        approved: true, 
        label: 'Approved', 
        color: 'green',
        message: 'This plan meets all quality standards and is ready for booking.'
      };
    } else if (backendStatus === 'Needs Review') {
      return { 
        approved: false, 
        label: 'Needs Review', 
        color: 'yellow',
        message: 'This plan has some concerns that should be addressed before proceeding.'
      };
    } else if (backendStatus === 'Rejected') {
      return { 
        approved: false, 
        label: 'Not Recommended', 
        color: 'red',
        message: 'This plan has significant issues and needs major revisions.'
      };
    }

    // Fallback to score-based logic
    if (score >= 75) {
      return { 
        approved: true, 
        label: 'Approved', 
        color: 'green',
        message: 'This plan meets all quality standards and is ready for booking.'
      };
    } else if (score >= 60) {
      return { 
        approved: false, 
        label: 'Needs Review', 
        color: 'yellow',
        message: 'This plan has some concerns that should be addressed before proceeding.'
      };
    } else {
      return { 
        approved: false, 
        label: 'Not Recommended', 
        color: 'red',
        message: 'This plan has significant issues and needs major revisions.'
      };
    }
  };

  const budgetInfo = getBudgetStatusFromBackend();
  const approvalInfo = getApprovalStatus();

  return (
    <Card className="p-8 md:p-10 shadow-xl border-2 bg-white/80 backdrop-blur-sm">
      <h3 className="text-3xl md:text-4xl font-extrabold mb-8 flex items-center gap-3">
        <CheckCircle2 className="w-9 h-9 text-green-500" />
        Plan Validation
      </h3>

      <div className="space-y-6">
        {/* Overall Score */}
        <div className={`flex items-center justify-between p-8 bg-gradient-to-r rounded-3xl border-2 ${
          validationData.overall_score >= 80 
            ? 'from-green-50 to-emerald-50 border-green-300' 
            : validationData.overall_score >= 60 
            ? 'from-yellow-50 to-amber-50 border-yellow-300'
            : 'from-red-50 to-pink-50 border-red-300'
        }`}>
          <span className="text-xl font-bold text-gray-800">Overall Score</span>
          <span className={`text-5xl font-extrabold ${
            validationData.overall_score >= 80 
              ? 'text-green-600' 
              : validationData.overall_score >= 60 
              ? 'text-yellow-600'
              : 'text-red-600'
          }`}>
            {validationData.overall_score || 0}/100
          </span>
        </div>

        {/* Approval Status Message */}
        <div className={`p-6 rounded-2xl border-2 ${
          approvalInfo.color === 'green' 
            ? 'bg-green-50 border-green-300' 
            : approvalInfo.color === 'yellow'
            ? 'bg-yellow-50 border-yellow-300'
            : 'bg-red-50 border-red-300'
        }`}>
          <p className={`text-sm font-semibold ${
            approvalInfo.color === 'green' 
              ? 'text-green-800' 
              : approvalInfo.color === 'yellow'
              ? 'text-yellow-800'
              : 'text-red-800'
          }`}>
            {approvalInfo.message}
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Budget Status - FIXED */}
          <div className="p-6 border-2 rounded-2xl hover:shadow-lg transition-all">
            <p className="text-lg font-bold mb-3 flex items-center gap-2">
              <span>💰</span> Budget Status
            </p>
            <Badge className={`px-4 py-2 text-base ${
              budgetInfo.color === 'green' 
                ? 'bg-green-500 hover:bg-green-500' 
                : budgetInfo.color === 'yellow'
                ? 'bg-yellow-500 hover:bg-yellow-500'
                : budgetInfo.color === 'red'
                ? 'bg-red-500 hover:bg-red-500'
                : 'bg-gray-500 hover:bg-gray-500'
            }`}>
              {budgetInfo.status}
            </Badge>
            {validationData.budget_details && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Budget:</span>
                  <span className="font-semibold">
                    ${validationData.budget_details.user_budget || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Estimated Cost:</span>
                  <span className="font-semibold">
                    ${validationData.budget_details.estimated_cost || 0}
                  </span>
                </div>
                {validationData.budget_details.variance_percentage !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Variance:</span>
                    <span className={`font-semibold ${
                      validationData.budget_details.variance_percentage > 0 
                        ? 'text-red-600' 
                        : 'text-green-600'
                    }`}>
                      {validationData.budget_details.variance_percentage > 0 ? '+' : ''}
                      {validationData.budget_details.variance_percentage}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Approval Status */}
          <div className="p-6 border-2 rounded-2xl hover:shadow-lg transition-all">
            <p className="text-lg font-bold mb-3 flex items-center gap-2">
              <span>✅</span> Approval
            </p>
            <Badge className={`px-4 py-2 text-base ${
              approvalInfo.color === 'green' 
                ? 'bg-green-500 hover:bg-green-500' 
                : approvalInfo.color === 'yellow'
                ? 'bg-yellow-500 hover:bg-yellow-500'
                : 'bg-red-500 hover:bg-red-500'
            }`}>
              {approvalInfo.label}
            </Badge>
          </div>
        </div>

        {/* Detailed Validation Criteria */}
        {(validationData.itinerary_quality || 
          validationData.budget_feasibility || 
          validationData.logistics_practicality) && (
          <div className="p-6 bg-gray-50 rounded-2xl border-2">
            <h4 className="text-xl font-bold mb-4">Validation Criteria</h4>
            <div className="space-y-3">
              {validationData.itinerary_quality && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Itinerary Quality:</span>
                  <Badge variant="outline" className="font-semibold">
                    {validationData.itinerary_quality}/10
                  </Badge>
                </div>
              )}
              {validationData.budget_feasibility && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Budget Feasibility:</span>
                  <Badge variant="outline" className="font-semibold">
                    {validationData.budget_feasibility}/10
                  </Badge>
                </div>
              )}
              {validationData.logistics_practicality && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Logistics Practicality:</span>
                  <Badge variant="outline" className="font-semibold">
                    {validationData.logistics_practicality}/10
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Issues and Recommendations */}
        {validationData.issues && validationData.issues.length > 0 && (
          <div className="p-6 bg-red-50 rounded-2xl border-2 border-red-200">
            <h4 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-800">
              <AlertCircle className="w-6 h-6" />
              Issues Found
            </h4>
            <ul className="space-y-2">
              {validationData.issues.map((issue: string, idx: number) => (
                <li key={idx} className="text-sm text-red-700 flex items-start gap-2">
                  <span className="mt-1">•</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {validationData.recommendations && validationData.recommendations.length > 0 && (
          <div className="p-6 bg-blue-50 rounded-2xl border-2 border-blue-200">
            <h4 className="text-xl font-bold mb-4 flex items-center gap-2 text-blue-800">
              <Sparkles className="w-6 h-6" />
              Recommendations
            </h4>
            <ul className="space-y-2">
              {validationData.recommendations.map((rec: string, idx: number) => (
                <li key={idx} className="text-sm text-blue-700 flex items-start gap-2">
                  <span className="mt-1">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Alternative Plans Section */}
        {validationData.alternative_plans && validationData.alternative_plans.length > 0 && (
          <div className="p-6 bg-purple-50 rounded-2xl border-2 border-purple-200">
            <h4 className="text-xl font-bold mb-4 flex items-center gap-2 text-purple-800">
              <Compass className="w-6 h-6" />
              Alternative Plan Options
            </h4>
            <div className="space-y-4">
              {validationData.alternative_plans.map((plan: any, idx: number) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="p-4 bg-white rounded-xl border-2 hover:border-purple-400 transition-all"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h5 className="font-bold text-lg">{plan.title || `Option ${idx + 1}`}</h5>
                    {plan.score && (
                      <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                        Score: {plan.score}/100
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mb-3">{plan.description}</p>
                  {plan.estimated_cost && (
                    <p className="text-sm font-semibold text-green-600">
                      Estimated Cost: ${plan.estimated_cost}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Validator Comments */}
        {validationData.validator_comments && (
          <div className="p-6 bg-gray-50 rounded-2xl border-2">
            <h4 className="text-lg font-bold mb-3">Additional Comments</h4>
            <p className="text-sm text-gray-700 leading-relaxed">
              {validationData.validator_comments}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}


// Empty State Component
function EmptyState({ message }: { message: string }) {
  return (
    <Card className="p-12 text-center border-2 border-dashed border-gray-300 bg-gray-50/50">
      <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <p className="text-gray-600 text-lg">{message}</p>
    </Card>
  );
}
