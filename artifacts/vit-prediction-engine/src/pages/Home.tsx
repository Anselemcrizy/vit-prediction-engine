import { Sidebar } from "@/components/layout/Sidebar";
import { AnalysisForm } from "@/components/predictions/AnalysisForm";
import { PredictionDetails } from "@/components/predictions/PredictionDetails";
import { TicketEditor } from "@/components/predictions/TicketEditor";
import { usePredictionUI } from "@/hooks/use-prediction-ui";
import { AnimatePresence, motion } from "framer-motion";

export default function Home() {
  const { activePredictionId, isFormOpen } = usePredictionUI();

  return (
    <div className="flex h-screen overflow-hidden tech-grid">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto relative">
        {/* Glow effects behind content */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="min-h-full p-6 md:p-10 flex flex-col relative z-10 space-y-6">
          <TicketEditor />

          <AnimatePresence mode="wait">
            {isFormOpen ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20, filter: "blur(10px)" }}
                transition={{ duration: 0.3 }}
                className="flex-1 flex items-center justify-center"
              >
                <AnalysisForm />
              </motion.div>
            ) : activePredictionId ? (
              <motion.div
                key="details"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <PredictionDetails id={activePredictionId} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
