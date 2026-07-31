import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { queryClient } from "@/lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/error-boundary";
import { router } from "@/routes";

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* reducedMotion="user" makes every Framer Motion animation in the
            tree respect prefers-reduced-motion (WCAG 2.3.3). CSS animations
            are handled by design-system/motion.css; this covers the JS half —
            transform/layout animations that CSS cannot reach. */}
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster />
          </TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
